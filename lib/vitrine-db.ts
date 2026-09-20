import type { Pool, PoolClient } from "pg";
import { MAX_CARROSSEL, fotosDaPeca, type PecaDaVitrine, type VagaCarrossel, type VagaCategoria } from "./vitrine";

// Vitrine do site: as consultas ao banco. As regras (o que vale) ficam em lib/vitrine.ts.

export type Consulta = Pick<Pool | PoolClient, "query">;

export const MENSAGEM_CARROSSEL_CHEIO = `O carrossel já tem ${MAX_CARROSSEL} destaques. Tire um deles na Vitrine do site antes de colocar outro.`;

const PUBLICADA = `(p.show_online AND p.active AND p.sale_channel = 'varejo')`;

/** Todas as peças com as fotos (principal primeiro) e se estão publicadas. */
export async function carregarPecas(db: Consulta): Promise<PecaDaVitrine[]> {
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.category, p.photo_url, ${PUBLICADA} AS publicada,
            COALESCE((SELECT json_agg(f.url ORDER BY f.position, f.id) FROM product_photos f WHERE f.product_id = p.id), '[]'::json) AS extras
       FROM products p
      ORDER BY p.name NULLS LAST, p.id`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    publicada: r.publicada === true,
    fotos: fotosDaPeca(r.photo_url, Array.isArray(r.extras) ? r.extras : []),
  }));
}

export interface VagaSalva {
  id: number;
  area: string;
  category: string | null;
  position: number;
  product_id: number;
  photo_url: string;
  peca_nome: string | null;
  publicada: boolean;
}

export async function carregarVagas(db: Consulta): Promise<VagaSalva[]> {
  const { rows } = await db.query(
    `SELECT s.id, s.area, s.category, s.position, s.product_id, s.photo_url, p.name AS peca_nome, ${PUBLICADA} AS publicada
       FROM site_slots s JOIN products p ON p.id = s.product_id
      ORDER BY s.area, s.position, s.id`
  );
  return rows.map((r) => ({ ...r, publicada: r.publicada === true }));
}

/** Troca a lista inteira do carrossel (na ordem) e deixa `featured` igual a "está no carrossel". */
export async function salvarCarrossel(pool: Pool, vagas: VagaCarrossel[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM site_slots WHERE area = 'carrossel'`);
    for (let i = 0; i < vagas.length; i++) {
      await client.query(
        `INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', $1, $2, $3)`,
        [i, vagas[i].product_id, vagas[i].photo_url]
      );
    }
    const ids = vagas.map((v) => v.product_id);
    await client.query(
      `UPDATE products SET featured = (id = ANY($1::int[])) WHERE featured IS DISTINCT FROM (id = ANY($1::int[]))`,
      [ids]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function salvarCategoria(db: Consulta, v: VagaCategoria): Promise<void> {
  await db.query(
    `INSERT INTO site_slots (area, category, position, product_id, photo_url) VALUES ('categoria', $1, 0, $2, $3)
     ON CONFLICT (category) WHERE area = 'categoria' DO UPDATE SET product_id = EXCLUDED.product_id, photo_url = EXCLUDED.photo_url`,
    [v.category, v.product_id, v.photo_url]
  );
}

export async function removerCategoria(db: Consulta, category: string): Promise<void> {
  await db.query(`DELETE FROM site_slots WHERE area = 'categoria' AND category = $1`, [category]);
}

/** true = a peça ainda não está no carrossel e já há 8 outras. Use 0 como id para peça que ainda vai ser criada. */
export async function carrosselCheio(db: Consulta, productId: number): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE product_id <> $1)::int AS outros, COALESCE(bool_or(product_id = $1), false) AS ja
       FROM site_slots WHERE area = 'carrossel'`,
    [productId]
  );
  return !rows[0].ja && rows[0].outros >= MAX_CARROSSEL;
}

/**
 * Deixa as vagas de uma peça coerentes com o que ela é agora:
 * 1. apaga vagas cuja foto não é mais foto da peça (foto apagada ou trocada);
 * 2. peça fora do site ou sem "Carrossel": sem vaga de carrossel;
 * 3. peça com "Carrossel" e sem vaga: ganha uma, no fim, com a foto principal.
 * A foto escolhida para uma categoria continua guardada quando a peça sai do site (a loja a ignora até voltar).
 */
export async function reconciliarPeca(
  db: Consulta,
  productId: number
): Promise<{ removidas: { area: string; category: string | null }[] }> {
  const { rows: removidas } = await db.query(
    `DELETE FROM site_slots
      WHERE product_id = $1
        AND photo_url NOT IN (
          SELECT photo_url FROM products WHERE id = $1 AND photo_url IS NOT NULL
          UNION
          SELECT url FROM product_photos WHERE product_id = $1
        )
      RETURNING area, category`,
    [productId]
  );

  const { rows } = await db.query(`SELECT featured, show_online, photo_url FROM products WHERE id = $1`, [productId]);
  const p = rows[0];
  if (p) {
    if (!p.show_online || !p.featured) {
      await db.query(`DELETE FROM site_slots WHERE product_id = $1 AND area = 'carrossel'`, [productId]);
    } else if (p.photo_url) {
      const { rows: tem } = await db.query(`SELECT 1 FROM site_slots WHERE product_id = $1 AND area = 'carrossel'`, [productId]);
      if (tem.length === 0) {
        await db.query(
          `INSERT INTO site_slots (area, position, product_id, photo_url)
           VALUES ('carrossel', (SELECT COALESCE(max(position), -1) + 1 FROM site_slots WHERE area = 'carrossel'), $1, $2)`,
          [productId, p.photo_url]
        );
      }
    }
  }
  return { removidas: removidas.map((r) => ({ area: r.area, category: r.category })) };
}
