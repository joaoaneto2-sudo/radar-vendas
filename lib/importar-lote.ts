// Importa um lote de peças vindas das pastas de fornecedor (foto close + foto com a modelo).
// Para cada peça: acha o fabricante (cria se não existir), acha a peça pelo nome (cria se não existir),
// grava a foto principal, a foto da modelo e o enquadramento do catálogo, e deixa a peça no catálogo.
// Peça que já existe NÃO tem custo, preço nem estoque mexidos: só as fotos e o catálogo.
// Roda dentro de uma transação; com gravar = false ela é desfeita no fim (ensaio, mostra o que faria).

import type { Pool } from "pg";
import { semAcento } from "./catalogo-filtro";

export const MARKUP_PADRAO = 2.5;

export interface ItemDoLote {
  fabricante: string;
  nome: string;
  custo: number;
  categoria: string;
  fotoPrincipal: string; // endereço da foto principal (o close, ou a foto da modelo quando só existe ela)
  fotoModelo: string | null; // foto com a modelo (vai para product_photos, tipo modelo)
  catalogo: { kind: "limpa" | "modelo"; fx: number; fy: number; zoom: number };
}

export type ResultadoDoItem = {
  fabricante: string;
  nome: string;
  acao: "criada" | "atualizada";
  id: number;
  aviso?: string;
};

export interface ResultadoDoLote {
  gravou: boolean;
  fabricantesCriados: string[];
  criadas: number;
  atualizadas: number;
  itens: ResultadoDoItem[];
}

const CATEGORIAS = ["Brincos", "Colares e Correntes", "Pulseiras", "Anéis", "Pingentes", "Conjuntos", "Outros"];

const numero = (v: unknown) => (typeof v === "number" ? v : Number(v));

/** Confere o que chegou na API. Devolve a lista limpa ou a mensagem do primeiro problema. */
export function validarLote(corpo: unknown): { ok: true; itens: ItemDoLote[] } | { ok: false; message: string } {
  const bruto = (corpo as { itens?: unknown })?.itens;
  if (!Array.isArray(bruto) || bruto.length === 0) return { ok: false, message: "Mande a lista de peças." };
  if (bruto.length > 200) return { ok: false, message: "No máximo 200 peças por vez." };
  const itens: ItemDoLote[] = [];
  const vistos = new Set<string>();
  for (let i = 0; i < bruto.length; i++) {
    const it = bruto[i] as Record<string, unknown>;
    const n = i + 1;
    const fabricante = typeof it.fabricante === "string" ? it.fabricante.trim() : "";
    const nome = typeof it.nome === "string" ? it.nome.trim() : "";
    if (!fabricante) return { ok: false, message: `Peça ${n}: falta o fabricante.` };
    if (!nome) return { ok: false, message: `Peça ${n}: falta o nome.` };
    const custo = numero(it.custo);
    if (!Number.isFinite(custo) || custo <= 0) return { ok: false, message: `Peça ${n} (${nome}): custo inválido.` };
    const categoria = typeof it.categoria === "string" ? it.categoria : "";
    if (!CATEGORIAS.includes(categoria)) return { ok: false, message: `Peça ${n} (${nome}): categoria inválida.` };
    const principal = typeof it.fotoPrincipal === "string" ? it.fotoPrincipal.trim() : "";
    if (!/^(\/estoque\/|https?:\/\/)/i.test(principal)) return { ok: false, message: `Peça ${n} (${nome}): foto principal inválida.` };
    const modelo = typeof it.fotoModelo === "string" && it.fotoModelo.trim() !== "" ? it.fotoModelo.trim() : null;
    if (modelo !== null && !/^(\/estoque\/|https?:\/\/)/i.test(modelo)) return { ok: false, message: `Peça ${n} (${nome}): foto da modelo inválida.` };
    const cat = (it.catalogo ?? {}) as Record<string, unknown>;
    if (cat.kind !== "limpa" && cat.kind !== "modelo") return { ok: false, message: `Peça ${n} (${nome}): tipo de foto do catálogo inválido.` };
    const [fx, fy, zoom] = [numero(cat.fx), numero(cat.fy), numero(cat.zoom)];
    if (![fx, fy, zoom].every(Number.isFinite) || fx < 0 || fx > 100 || fy < 0 || fy > 100 || zoom < 1 || zoom > 3) {
      return { ok: false, message: `Peça ${n} (${nome}): enquadramento inválido.` };
    }
    const chave = `${semAcento(fabricante)}|${semAcento(nome)}`;
    if (vistos.has(chave)) return { ok: false, message: `Peça repetida na lista: ${nome} (${fabricante}).` };
    vistos.add(chave);
    itens.push({ fabricante, nome, custo, categoria, fotoPrincipal: principal, fotoModelo: modelo, catalogo: { kind: cat.kind, fx, fy, zoom } });
  }
  return { ok: true, itens };
}

export async function importarLote(db: Pick<Pool, "connect">, itens: ItemDoLote[], gravar: boolean, markup = MARKUP_PADRAO): Promise<ResultadoDoLote> {
  const client = await db.connect();
  const resultado: ResultadoDoLote = { gravou: gravar, fabricantesCriados: [], criadas: 0, atualizadas: 0, itens: [] };
  try {
    await client.query("BEGIN");
    const fabricantes = new Map<string, number>();
    for (const it of itens) {
      const chaveFab = semAcento(it.fabricante);
      let fabId: number | undefined = fabricantes.get(chaveFab);
      if (fabId === undefined) {
        const { rows } = await client.query(`SELECT id, name FROM manufacturers`);
        const achado = rows.find((r) => semAcento(r.name) === chaveFab);
        if (achado) fabId = achado.id as number;
        else {
          const novo = await client.query(`INSERT INTO manufacturers (name) VALUES ($1) RETURNING id`, [it.fabricante]);
          fabId = novo.rows[0].id as number;
          resultado.fabricantesCriados.push(it.fabricante);
        }
        fabricantes.set(chaveFab, fabId);
      }
      const fabricanteId: number = fabId;

      const { rows: pecas } = await client.query(`SELECT id, name, cost FROM products WHERE manufacturer_id = $1`, [fabricanteId]);
      const existente = pecas.find((p) => semAcento(p.name ?? "") === semAcento(it.nome));
      const foto = JSON.stringify(it.catalogo);
      let id: number;
      let aviso: string | undefined;

      if (existente) {
        id = existente.id;
        await client.query(`UPDATE products SET photo_url = $1, catalog_photo = $2::jsonb, show_catalog = true WHERE id = $3`, [it.fotoPrincipal, foto, id]);
        if (existente.cost !== null && Math.abs(Number(existente.cost) - it.custo) > 0.001) {
          aviso = `custo no cadastro é ${Number(existente.cost).toFixed(2)} e na pasta é ${it.custo.toFixed(2)} (não mexi no custo)`;
        }
        resultado.atualizadas++;
      } else {
        const parecida = pecas.find((p) => p.cost !== null && Math.abs(Number(p.cost) - it.custo) < 0.001);
        if (parecida) aviso = `já existe "${parecida.name}" deste fabricante com o mesmo custo (${it.custo.toFixed(2)}): pode ser a mesma peça com outro nome`;
        const preco = Math.round(it.custo * markup * 100) / 100;
        const novo = await client.query(
          `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active,
             photo_url, show_online, availability, show_catalog, catalog_photo)
           VALUES ($1,$2,$3,$4,$5,1,'varejo',true,$6,false,'pronta_entrega',true,$7::jsonb) RETURNING id`,
          [it.categoria, it.nome, fabricanteId, it.custo, preco, it.fotoPrincipal, foto]
        );
        id = novo.rows[0].id as number;
        resultado.criadas++;
      }

      await client.query(`DELETE FROM product_photos WHERE product_id = $1 AND kind = 'modelo'`, [id]);
      if (it.fotoModelo) {
        await client.query(`INSERT INTO product_photos (product_id, url, position, kind) VALUES ($1, $2, 0, 'modelo')`, [id, it.fotoModelo]);
      }
      resultado.itens.push({ fabricante: it.fabricante, nome: it.nome, acao: existente ? "atualizada" : "criada", id, aviso });
    }
    await client.query(gravar ? "COMMIT" : "ROLLBACK");
    return resultado;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
