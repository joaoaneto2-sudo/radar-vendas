import type { Pool, PoolClient } from "pg";
import type { FotosDoCorpo } from "./product-photos";

type Consulta = Pick<Pool | PoolClient, "query">;

/**
 * Grava as fotos que acompanham o destaque, na ordem da tela, e passa as vagas da vitrine (carrossel e categoria)
 * para o novo endereço das fotos que foram giradas ou trocadas. Rode antes de reconciliarPeca, que apaga vagas
 * de fotos que já não são da peça.
 */
export async function gravarFotos(db: Consulta, productId: number, f: FotosDoCorpo): Promise<void> {
  for (const t of f.trocas) {
    await db.query(`UPDATE site_slots SET photo_url = $3 WHERE product_id = $1 AND photo_url = $2`, [productId, t.de, t.para]);
  }
  if (f.extras === null) return;
  await db.query(`DELETE FROM product_photos WHERE product_id = $1`, [productId]);
  for (let i = 0; i < f.extras.length; i++) {
    await db.query(`INSERT INTO product_photos (product_id, url, position) VALUES ($1, $2, $3)`, [productId, f.extras[i], i]);
  }
}
