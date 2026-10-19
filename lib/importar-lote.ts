// Importa um lote de peças vindas das pastas de fornecedor (foto close + foto com a modelo).
// Para cada peça: acha o fabricante (cria se não existir), acha a peça pelo nome (cria se não existir),
// grava a foto principal, a foto da modelo e o enquadramento do catálogo, e deixa a peça no catálogo.
// O valor da pasta é o CUSTO; o preço de varejo é custo x 2,5. Peça que já existe ganha as fotos e o catálogo; o
// estoque nunca é mexido. Se o custo do cadastro e o da pasta forem diferentes, NADA é sobrescrito: o custo da pasta
// fica guardado em custo_da_pasta e a peça mostra o alerta "Custo diverge da pasta" para o João decidir. Cadastro
// sem custo é preenchido com o da pasta.
// Roda dentro de uma transação; com gravar = false ela é desfeita no fim (ensaio, mostra o que faria).

import type { Pool } from "pg";
import { semAcento } from "./catalogo-filtro";

export const MARKUP_PADRAO = 2.5;

export interface ItemDoLote {
  fabricante: string;
  nome: string;
  custo: number | null; // nulo = a peça ainda não tem custo (fica com o alerta "Falta preço de custo")
  categoria: string;
  fotoPrincipal?: string | null; // foto principal (o close, ou a foto da modelo quando só existe ela); ausente = não mexe
  fotoModelo?: string | null; // foto com a modelo: texto = troca, nulo = remove, ausente = não mexe
  codigo?: string | null; // código da peça (SIGLA-TIPO-NNN), gravado em manufacturer_code quando está livre
  catalogo?: { kind: "limpa" | "modelo"; fx: number; fy: number; zoom: number }; // ausente: peça nova = foto limpa, existente = não mexe
  fotoOrigem?: string | null; // assinatura do arquivo da pasta de onde veio a foto principal (nome|tamanho|data)
  modeloOrigem?: string | null; // idem, da foto da modelo
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
    const custo = it.custo === null || it.custo === undefined ? null : numero(it.custo);
    if (custo !== null && (!Number.isFinite(custo) || custo <= 0)) return { ok: false, message: `Peça ${n} (${nome}): custo inválido.` };
    const categoria = typeof it.categoria === "string" ? it.categoria : "";
    if (!CATEGORIAS.includes(categoria)) return { ok: false, message: `Peça ${n} (${nome}): categoria inválida.` };
    const urlOk = (v: string) => /^(\/estoque\/|https?:\/\/)/i.test(v);
    let principal: string | undefined;
    if (it.fotoPrincipal !== undefined && it.fotoPrincipal !== null && it.fotoPrincipal !== "") {
      principal = typeof it.fotoPrincipal === "string" ? it.fotoPrincipal.trim() : "";
      if (!urlOk(principal)) return { ok: false, message: `Peça ${n} (${nome}): foto principal inválida.` };
    }
    let modelo: string | null | undefined;
    if (it.fotoModelo === null) modelo = null;
    else if (typeof it.fotoModelo === "string" && it.fotoModelo.trim() !== "") {
      modelo = it.fotoModelo.trim();
      if (!urlOk(modelo)) return { ok: false, message: `Peça ${n} (${nome}): foto da modelo inválida.` };
    }
    let catalogo: ItemDoLote["catalogo"];
    if (it.catalogo !== undefined && it.catalogo !== null) {
      const cat = it.catalogo as Record<string, unknown>;
      if (cat.kind !== "limpa" && cat.kind !== "modelo") return { ok: false, message: `Peça ${n} (${nome}): tipo de foto do catálogo inválido.` };
      const [fx, fy, zoom] = [numero(cat.fx), numero(cat.fy), numero(cat.zoom)];
      if (![fx, fy, zoom].every(Number.isFinite) || fx < 0 || fx > 100 || fy < 0 || fy > 100 || zoom < 1 || zoom > 3) {
        return { ok: false, message: `Peça ${n} (${nome}): enquadramento inválido.` };
      }
      catalogo = { kind: cat.kind, fx, fy, zoom };
    }
    const origem = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, 300) : undefined);
    const chave = `${semAcento(fabricante)}|${semAcento(nome)}`;
    if (vistos.has(chave)) return { ok: false, message: `Peça repetida na lista: ${nome} (${fabricante}).` };
    vistos.add(chave);
    const codigo = typeof it.codigo === "string" ? it.codigo.trim() : "";
    if (codigo && !/^\p{Lu}+-(BR|CO|PU|AN|OU|PI|CJ)-\d{3}$/u.test(codigo)) return { ok: false, message: `Peça ${n} (${nome}): código inválido.` };
    itens.push({ fabricante, nome, custo, categoria, fotoPrincipal: principal, fotoModelo: modelo, codigo: codigo || null, catalogo, fotoOrigem: origem(it.fotoOrigem), modeloOrigem: origem(it.modeloOrigem) });
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

/** Grava o código da peça quando ela não tem código (ou tem um provisório, NOVO- ou SEMFORN-) e o código está livre. */
async function cuidarDoCodigo(
  client: { query: (sql: string, valores?: unknown[]) => Promise<{ rowCount: number | null }> },
  id: number,
  fabricanteId: number,
  codigo: string | null,
  atual: string | null
): Promise<string | undefined> {
  if (!codigo || atual === codigo) return undefined;
  if (atual && !/^(NOVO|SEMFORN)-/.test(atual)) return `código no Radar é ${atual} e na pasta é ${codigo} (não mexi)`;
  const ocupado = await client.query(`SELECT 1 FROM products WHERE manufacturer_id = $1 AND manufacturer_code = $2 AND id <> $3`, [fabricanteId, codigo, id]);
  if (ocupado.rowCount) return `o código ${codigo} já é de outra peça deste fabricante (não gravei)`;
  await client.query(`UPDATE products SET manufacturer_code = $1 WHERE id = $2`, [codigo, id]);
  return undefined;
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

      const { rows: pecas } = await client.query(`SELECT id, name, cost, price, manufacturer_code FROM products WHERE manufacturer_id = $1`, [fabricanteId]);
      const existente = pecas.find((p) => semAcento(p.name ?? "") === semAcento(it.nome));
      const foto = it.catalogo ? JSON.stringify(it.catalogo) : null;
      let id: number;
      let aviso: string | undefined;

      if (existente) {
        id = existente.id;
        await client.query(
          `UPDATE products SET photo_url = COALESCE($1, photo_url), catalog_photo = COALESCE($2::jsonb, catalog_photo), show_catalog = true,
                 foto_origem = COALESCE($3, foto_origem) WHERE id = $4`,
          [it.fotoPrincipal ?? null, foto, it.fotoOrigem ?? null, id]
        );
        const custoAntigo = existente.cost === null ? null : Number(existente.cost);
        if (it.custo === null) {
          // Sem custo no arquivo: não mexe no custo do cadastro.
        } else if (custoAntigo === null) {
          // Cadastro sem custo: preenche com o da pasta (e o preço de venda, se também faltava).
          const precoNovo = Math.round(it.custo * markup * 100) / 100;
          await client.query(`UPDATE products SET cost = $1, price = COALESCE(price, $2), custo_da_pasta = NULL WHERE id = $3`, [it.custo, precoNovo, id]);
          aviso = `o custo estava vazio e foi preenchido com ${it.custo.toFixed(2)} (o da pasta)`;
        } else if (Math.abs(custoAntigo - it.custo) > 0.001) {
          // Os dois custos existem e são diferentes: não escolho por você. Fica o alerta "Custo diverge da pasta" na peça.
          await client.query(`UPDATE products SET custo_da_pasta = $1 WHERE id = $2`, [it.custo, id]);
          aviso = `custo diverge: cadastro ${custoAntigo.toFixed(2)} e pasta ${it.custo.toFixed(2)}. Não mudei; a peça ficou com o alerta "Custo diverge da pasta" para você decidir`;
        } else {
          await client.query(`UPDATE products SET custo_da_pasta = NULL WHERE id = $1 AND custo_da_pasta IS NOT NULL`, [id]);
        }
        resultado.atualizadas++;
      } else {
        const custoNovo = it.custo;
        const parecida = custoNovo === null ? undefined : pecas.find((p) => p.cost !== null && Math.abs(Number(p.cost) - custoNovo) < 0.001);
        if (parecida) aviso = `já existe "${parecida.name}" deste fabricante com o mesmo custo (${custoNovo!.toFixed(2)}): pode ser a mesma peça com outro nome`;
        const preco = custoNovo === null ? null : Math.round(custoNovo * markup * 100) / 100;
        const novo = await client.query(
          `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active,
             photo_url, show_online, availability, show_catalog, catalog_photo, foto_origem)
           VALUES ($1,$2,$3,$4,$5,1,'varejo',true,$6,false,'pronta_entrega',true,$7::jsonb,$8) RETURNING id`,
          [it.categoria, it.nome, fabricanteId, it.custo, preco, it.fotoPrincipal ?? null, foto ?? JSON.stringify({ kind: "limpa", fx: 50, fy: 50, zoom: 1 }), it.fotoOrigem ?? null]
        );
        id = novo.rows[0].id as number;
        resultado.criadas++;
      }

      const avisoCodigo = await cuidarDoCodigo(client, id, fabricanteId, it.codigo ?? null, existente?.manufacturer_code ?? null);
      if (avisoCodigo) aviso = aviso ? `${aviso}; ${avisoCodigo}` : avisoCodigo;

      if (it.fotoModelo !== undefined) {
        await client.query(`DELETE FROM product_photos WHERE product_id = $1 AND kind = 'modelo'`, [id]);
        if (it.fotoModelo) {
          await client.query(`INSERT INTO product_photos (product_id, url, position, kind) VALUES ($1, $2, 0, 'modelo')`, [id, it.fotoModelo]);
        }
        await client.query(`UPDATE products SET modelo_origem = $1 WHERE id = $2`, [it.fotoModelo ? it.modeloOrigem ?? null : null, id]);
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
