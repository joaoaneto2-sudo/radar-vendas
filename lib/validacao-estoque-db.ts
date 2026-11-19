// Validação de estoque (migração 024): a Fernanda vê a foto de cada peça nossa e diz se ainda tem (V) ou se saiu (X).
// "Saiu" tira a peça do catálogo e zera o estoque na hora, guardando como estava para o "voltar" desfazer.
// A peça continua ativa no cadastro, para o "Atualizar pelas pastas" não criar de novo a partir das fotos da pasta.

import type { Pool, PoolClient } from "pg";

export type Validacao = "tem" | "saiu";

export type PecaParaValidar = {
  id: number;
  nome: string;
  fabricante: string | null;
  foto: string | null;
  modelo: string | null;
  validacao: Validacao | null;
};

export type PecaQueSaiu = {
  id: number;
  fabricante: string | null;
  nome: string;
  codigo: string | null;
  fotoOrigem: string | null;
  modeloOrigem: string | null;
  validadoEm: string | null;
};

// Nossas peças de varejo com foto (atacado fica de fora: não é estoque nosso).
const PECAS_NOSSAS = `p.active AND p.sale_channel IS DISTINCT FROM 'atacado'`;

export async function listarParaValidar(db: Pool): Promise<PecaParaValidar[]> {
  const { rows } = await db.query(
    `SELECT p.id, p.name, m.name AS fabricante, p.photo_url, p.validacao,
            (SELECT pp.url FROM product_photos pp WHERE pp.product_id = p.id AND pp.kind = 'modelo'
              ORDER BY pp.position, pp.id LIMIT 1) AS modelo
       FROM products p LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
      WHERE ${PECAS_NOSSAS} AND (p.photo_url IS NOT NULL OR EXISTS (SELECT 1 FROM product_photos pp WHERE pp.product_id = p.id))`
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.name ?? "",
    fabricante: r.fabricante ?? null,
    foto: r.photo_url ?? null,
    modelo: r.modelo ?? null,
    validacao: r.validacao ?? null,
  }));
}

/**
 * Grava a resposta da Fernanda. `null` é o "voltar": a peça fica sem resposta e, se tinha saído, volta a ter o
 * estoque e o catálogo de antes. Devolve false quando a peça não existe (ou não é nossa).
 */
export async function marcarValidacao(db: Pool, id: number, status: Validacao | null): Promise<boolean> {
  const client: PoolClient = await db.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT stock_qty, show_catalog, validacao, validacao_antes FROM products p WHERE p.id = $1 AND ${PECAS_NOSSAS} FOR UPDATE`,
      [id]
    );
    if (rows.length === 0) {
      await client.query("ROLLBACK");
      return false;
    }
    const atual = rows[0];
    // Desfaz a saída antes de qualquer outra resposta (voltar, ou trocar X por V).
    if (atual.validacao === "saiu" && status !== "saiu") {
      const antes = atual.validacao_antes ?? {};
      await client.query(
        `UPDATE products SET stock_qty = COALESCE($2, stock_qty), show_catalog = COALESCE($3, show_catalog), validacao_antes = NULL WHERE id = $1`,
        [id, antes.stock_qty ?? null, antes.show_catalog ?? null]
      );
    }
    if (status === "saiu" && atual.validacao !== "saiu") {
      await client.query(
        `UPDATE products SET validacao_antes = $2::jsonb, stock_qty = 0, show_catalog = false WHERE id = $1`,
        [id, JSON.stringify({ stock_qty: atual.stock_qty, show_catalog: atual.show_catalog })]
      );
    }
    await client.query(`UPDATE products SET validacao = $2, validado_em = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END WHERE id = $1`, [id, status]);
    await client.query("COMMIT");
    return true;
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally {
    client.release();
  }
}

/** Peças marcadas com X, com o que identifica as fotos delas na pasta (tamanho|data do arquivo), para tirá-las das pastas. */
export async function listarQueSairam(db: Pool): Promise<PecaQueSaiu[]> {
  const { rows } = await db.query(
    `SELECT p.id, m.name AS fabricante, p.name, p.manufacturer_code, p.foto_origem, p.modelo_origem, p.validado_em
       FROM products p LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
      WHERE ${PECAS_NOSSAS} AND p.validacao = 'saiu'
      ORDER BY p.validado_em`
  );
  return rows.map((r) => ({
    id: r.id,
    fabricante: r.fabricante ?? null,
    nome: r.name ?? "",
    codigo: r.manufacturer_code ?? null,
    fotoOrigem: r.foto_origem ?? null,
    modeloOrigem: r.modelo_origem ?? null,
    validadoEm: r.validado_em ? new Date(r.validado_em).toISOString() : null,
  }));
}
