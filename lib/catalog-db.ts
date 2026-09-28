import type { Pool, PoolClient } from "pg";

// Catálogo online (migração 017): as consultas ao banco para marcar/desmarcar uma peça no
// catálogo, mudar a disponibilidade, gravar o código do fabricante e o tipo de cada foto.
// Sem rotas de API ainda (fase seguinte); aqui só o acesso ao banco.

type Consulta = Pick<Pool | PoolClient, "query">;

export type Disponibilidade = "pronta_entrega" | "encomenda";
export type TipoDaFoto = "limpa" | "modelo";

/**
 * Marca ou desmarca a peça no catálogo e/ou muda a posição dela na categoria. Só muda o que veio
 * (campos ausentes ficam como estavam). Peça de atacado nunca pode ir para o catálogo: o banco
 * recusa (products_catalog_not_wholesale). false = a peça não existe.
 */
export async function mudarNoCatalogo(
  db: Consulta,
  productId: number,
  campos: { showCatalog?: boolean; catalogPosition?: number | null }
): Promise<boolean> {
  const sets: string[] = [];
  const valores: unknown[] = [];
  if (campos.showCatalog !== undefined) {
    valores.push(campos.showCatalog);
    sets.push(`show_catalog = $${valores.length}`);
  }
  if (campos.catalogPosition !== undefined) {
    valores.push(campos.catalogPosition);
    sets.push(`catalog_position = $${valores.length}`);
  }
  if (sets.length === 0) return pecaExiste(db, productId);
  valores.push(productId);
  const { rowCount } = await db.query(`UPDATE products SET ${sets.join(", ")} WHERE id = $${valores.length}`, valores);
  return (rowCount ?? 0) > 0;
}

/** Muda se a peça é pronta entrega ou só existe sob encomenda. false = a peça não existe. */
export async function mudarDisponibilidade(db: Consulta, productId: number, availability: Disponibilidade): Promise<boolean> {
  const { rowCount } = await db.query(`UPDATE products SET availability = $1 WHERE id = $2`, [availability, productId]);
  return (rowCount ?? 0) > 0;
}

/**
 * Grava o código do fabricante da peça (ou apaga, com null). Código repetido no mesmo fabricante
 * dá erro do Postgres com code 23505 (índice único composto por manufacturer_id + manufacturer_code).
 * false = a peça não existe.
 */
export async function gravarCodigoFabricante(db: Consulta, productId: number, manufacturerCode: string | null): Promise<boolean> {
  const { rowCount } = await db.query(`UPDATE products SET manufacturer_code = $1 WHERE id = $2`, [manufacturerCode, productId]);
  return (rowCount ?? 0) > 0;
}

/** Grava qual foto é (limpa ou modelo), ou tira o tipo com null. false = a foto não existe. */
export async function gravarTipoDaFoto(db: Consulta, photoId: number, kind: TipoDaFoto | null): Promise<boolean> {
  const { rowCount } = await db.query(`UPDATE product_photos SET kind = $1 WHERE id = $2`, [kind, photoId]);
  return (rowCount ?? 0) > 0;
}

async function pecaExiste(db: Consulta, productId: number): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM products WHERE id = $1`, [productId]);
  return rows.length > 0;
}
