// Só no servidor (usa sharp). Monta, numa imagem JPEG só, a moldura da foto de close do catálogo: a foto inteira no meio e
// o resto da moldura numa cor só, a do fundo da foto (branco nas fotos de estúdio). No PDF isso vira UMA imagem comum.

import sharp from "sharp";

export const PROPORCAO_MINIMA = 0.3;
export const PROPORCAO_MAXIMA = 3.5;

const LADO_MAXIMO_DA_FOTO = 2000;

/**
 * Cor do fundo quando a borda da foto é praticamente de uma cor só (foto de estúdio, fundo branco ou liso); null quando
 * a borda varia (foto com modelo ou com cenário). Olha uma faixa de 3% em volta da foto, numa cópia pequena.
 */
export async function corDoFundoLiso(imagem: Buffer): Promise<{ r: number; g: number; b: number } | null> {
  const L = 120;
  const { data, info } = await sharp(imagem).resize({ width: L, height: L, fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const faixa = Math.max(1, Math.round(L * 0.03));
  const soma = [0, 0, 0];
  const pixels: number[][] = [];
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (x >= faixa && x < info.width - faixa && y >= faixa && y < info.height - faixa) continue;
      const i = (y * info.width + x) * 3;
      const p = [data[i], data[i + 1], data[i + 2]];
      pixels.push(p);
      for (let c = 0; c < 3; c++) soma[c] += p[c];
    }
  const media = soma.map((s) => s / pixels.length);
  // Quase todos os pontos da borda perto da média: fundo liso.
  const perto = pixels.filter((p) => Math.max(...p.map((v, c) => Math.abs(v - media[c]))) <= 18).length;
  if (perto / pixels.length < 0.97) return null;
  return { r: Math.round(media[0]), g: Math.round(media[1]), b: Math.round(media[2]) };
}

/** Cor média da faixa em volta da foto (para fotos com cenário, em que a borda não é de uma cor só). */
export async function corMediaDaBorda(imagem: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(imagem).resize({ width: 60, height: 60, fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const soma = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (x > 1 && x < info.width - 2 && y > 1 && y < info.height - 2) continue;
      const i = (y * info.width + x) * 3;
      for (let c = 0; c < 3; c++) soma[c] += data[i + c];
      n++;
    }
  return { r: Math.round(soma[0] / n), g: Math.round(soma[1] / n), b: Math.round(soma[2] / n) };
}

export function limitarProporcao(p: number): number {
  return Number.isFinite(p) && p > 0 ? Math.min(PROPORCAO_MAXIMA, Math.max(PROPORCAO_MINIMA, p)) : 1.1;
}

export async function comporMoldura(original: Buffer, opcoes: { largura: number; proporcao: number; qualidade: number }): Promise<Buffer> {
  const W = Math.round(opcoes.largura);
  const H = Math.max(1, Math.round(W / limitarProporcao(opcoes.proporcao)));

  const foto = await sharp(original, { failOn: "none" })
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({ width: LADO_MAXIMO_DA_FOTO, height: LADO_MAXIMO_DA_FOTO, fit: "inside", withoutEnlargement: true })
    .toBuffer({ resolveWithObject: true });

  // A foto inteira no meio; o que sobra da moldura é de uma cor só: a do fundo da foto (branco nas fotos de estúdio).
  // Nada de cópia ampliada e borrada atrás (aparecia como uma segunda peça cortada).
  const cor = (await corDoFundoLiso(foto.data)) ?? (await corMediaDaBorda(foto.data));
  const escala = Math.min(W / foto.info.width, H / foto.info.height);
  const frente = await sharp(foto.data)
    .resize({ width: Math.max(1, Math.round(foto.info.width * escala)), height: Math.max(1, Math.round(foto.info.height * escala)), fit: "fill" })
    .toBuffer({ resolveWithObject: true });
  return sharp({ create: { width: W, height: H, channels: 3, background: cor } })
    .composite([{ input: frente.data, left: Math.round((W - frente.info.width) / 2), top: Math.round((H - frente.info.height) / 2) }])
    .jpeg({ quality: opcoes.qualidade, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toBuffer();
}
