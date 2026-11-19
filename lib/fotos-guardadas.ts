// Fotos guardadas no próprio banco do Radar (migração 025). O depósito de fotos da Vercel (Blob) foi bloqueado em
// 19/11/2026; desde então cada foto enviada vai para a tabela fotos_guardadas e é servida em /api/foto/<id>.
// A foto entra já reduzida (lado maior até 1600 px, JPEG), para o banco não crescer à toa.

import type { Pool } from "pg";
import sharp from "sharp";

const LADO_MAXIMO = 1600;

export const enderecoDaFoto = (id: number | string) => `/api/foto/${id}`;

export async function guardarFoto(db: Pool, original: Buffer): Promise<string> {
  const jpeg = await sharp(original, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: LADO_MAXIMO, height: LADO_MAXIMO, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
  const { rows } = await db.query(
    `INSERT INTO fotos_guardadas (conteudo, tipo, tamanho) VALUES ($1, 'image/jpeg', $2) RETURNING id`,
    [jpeg, jpeg.length]
  );
  return enderecoDaFoto(rows[0].id);
}

export async function lerFoto(db: Pool, id: number): Promise<{ conteudo: Buffer; tipo: string } | null> {
  const { rows } = await db.query(`SELECT conteudo, tipo FROM fotos_guardadas WHERE id = $1`, [id]);
  return rows[0] ? { conteudo: rows[0].conteudo as Buffer, tipo: rows[0].tipo as string } : null;
}

const QUEBRADA = "%.blob.vercel-storage.com/%"; // fotos do depósito da Vercel, bloqueado em 19/11/2026

/**
 * Troca a foto da peça e a foto da modelo SÓ quando a atual é do depósito bloqueado (nunca mexe numa foto que funciona,
 * nem em estoque, preço, catálogo ou outros campos). Devolve quantas fotos foram trocadas.
 */
export async function trocarFotosQuebradas(db: Pool, itens: { id: number; foto?: string | null; modelo?: string | null }[]): Promise<{ fotos: number; modelos: number }> {
  let fotos = 0;
  let modelos = 0;
  for (const it of itens) {
    if (it.foto) {
      const r = await db.query(`UPDATE products SET photo_url = $2 WHERE id = $1 AND photo_url LIKE $3`, [it.id, it.foto, QUEBRADA]);
      fotos += r.rowCount ?? 0;
    }
    if (it.modelo) {
      const r = await db.query(
        `UPDATE product_photos SET url = $2
          WHERE id = (SELECT id FROM product_photos WHERE product_id = $1 AND kind = 'modelo' AND url LIKE $3 ORDER BY position, id LIMIT 1)`,
        [it.id, it.modelo, QUEBRADA]
      );
      modelos += r.rowCount ?? 0;
    }
  }
  return { fotos, modelos };
}
