// Importa um lote de peças vindas das pastas de fornecedor (foto close + foto com a modelo).
// Para cada peça: acha o fabricante (cria se não existir), acha a peça pelo nome (cria se não existir),
// grava a foto principal, a foto da modelo e o enquadramento do catálogo, e deixa a peça no catálogo.
// O valor da pasta é o CUSTO; o preço de varejo é custo x 2,5. Peça que já existe ganha as fotos e o catálogo; se o
// custo da pasta for outro, o custo é atualizado e o preço refeito (só quando o preço atual seguia a regra do 2,5;
// senão o preço fica como está e vem um aviso). O estoque nunca é mexido.
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
  fabricantesParecidos: { pasta: string; existente: string }[]; // nome da pasta e o fabricante que já existia com grafia quase igual
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

// Quantas letras precisam mudar para um texto virar o outro (1 = erro de digitação).
function distancia(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(linha[j] + 1, linha[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
      anterior = guardado;
    }
  }
  return linha[b.length];
}

/** Fabricante já cadastrado com grafia quase igual (1 letra de diferença, nomes com 8 letras ou mais). Só se for um só. */
export function fabricanteParecido<T extends { name: string }>(fabricantes: T[], chave: string): T | undefined {
  if (chave.length < 8) return undefined;
  const candidatos = fabricantes.filter((f) => {
    const outra = semAcento(f.name);
    return outra.length >= 8 && distancia(outra, chave) === 1;
  });
  return candidatos.length === 1 ? candidatos[0] : undefined;
}

export async function importarLote(db: Pick<Pool, "connect">, itens: ItemDoLote[], gravar: boolean, markup = MARKUP_PADRAO): Promise<ResultadoDoLote> {
  const client = await db.connect();
  const resultado: ResultadoDoLote = { gravou: gravar, fabricantesCriados: [], fabricantesParecidos: [], criadas: 0, atualizadas: 0, itens: [] };
  try {
    await client.query("BEGIN");
    const fabricantes = new Map<string, number>();
    for (const it of itens) {
      const chaveFab = semAcento(it.fabricante);
      let fabId: number | undefined = fabricantes.get(chaveFab);
      if (fabId === undefined) {
        const { rows } = await client.query(`SELECT id, name FROM manufacturers`);
        const exato = rows.find((r) => semAcento(r.name) === chaveFab);
        const parecido = exato ? undefined : fabricanteParecido(rows, chaveFab);
        const achado = exato ?? parecido;
        if (achado) {
          fabId = achado.id as number;
          if (parecido) resultado.fabricantesParecidos.push({ pasta: it.fabricante, existente: parecido.name });
        } else {
          const novo = await client.query(`INSERT INTO manufacturers (name) VALUES ($1) RETURNING id`, [it.fabricante]);
          fabId = novo.rows[0].id as number;
          resultado.fabricantesCriados.push(it.fabricante);
        }
        fabricantes.set(chaveFab, fabId);
      }
      const fabricanteId: number = fabId;

      const { rows: pecas } = await client.query(`SELECT id, name, cost, price FROM products WHERE manufacturer_id = $1`, [fabricanteId]);
      const existente = pecas.find((p) => semAcento(p.name ?? "") === semAcento(it.nome));
      const foto = JSON.stringify(it.catalogo);
      let id: number;
      let aviso: string | undefined;

      if (existente) {
        id = existente.id;
        await client.query(`UPDATE products SET photo_url = $1, catalog_photo = $2::jsonb, show_catalog = true WHERE id = $3`, [it.fotoPrincipal, foto, id]);
        const custoAntigo = existente.cost === null ? null : Number(existente.cost);
        if (custoAntigo === null || Math.abs(custoAntigo - it.custo) > 0.001) {
          const precoNovo = Math.round(it.custo * markup * 100) / 100;
          const precoAntigo = existente.price === null ? null : Number(existente.price);
          const seguiaARegra =
            precoAntigo === null || (custoAntigo !== null && Math.abs(precoAntigo - Math.round(custoAntigo * markup * 100) / 100) < 0.01);
          const doCusto = custoAntigo === null ? "vazio" : custoAntigo.toFixed(2);
          if (seguiaARegra) {
            await client.query(`UPDATE products SET cost = $1, price = $2 WHERE id = $3`, [it.custo, precoNovo, id]);
            aviso = `custo atualizado de ${doCusto} para ${it.custo.toFixed(2)} e preço de ${precoAntigo === null ? "vazio" : precoAntigo.toFixed(2)} para ${precoNovo.toFixed(2)}`;
          } else {
            await client.query(`UPDATE products SET cost = $1 WHERE id = $2`, [it.custo, id]);
            aviso = `custo atualizado de ${doCusto} para ${it.custo.toFixed(2)}; o preço ${precoAntigo!.toFixed(2)} não seguia o 2,5 e ficou como estava (pela regra seria ${precoNovo.toFixed(2)})`;
          }
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
