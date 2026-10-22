// Só no servidor (usa sharp). Monta, numa imagem JPEG só, a moldura da foto de close do catálogo: a foto inteira com as bordas
// suaves, por cima de uma cópia ampliada e borrada dela mesma que preenche o que sobrar. No PDF isso vira UMA imagem comum
// (antes eram duas fotos, um filtro de borrão e uma máscara, que o PDF guardava como imagens enormes com transparência).

import sharp from "sharp";

export const PROPORCAO_MINIMA = 0.3;
export const PROPORCAO_MAXIMA = 3.5;

const BORDA_SUAVE = 0.05; // 5% de cada lado da foto
const AMPLIACAO_DO_FUNDO = 1.5;
const BORRAO_DO_FUNDO = 0.077; // desvio do borrão, em fração da largura da moldura (o que o CSS fazia: 3,4 de 44)
const LADO_MAXIMO_DA_FOTO = 2000;

/** Rampa de 0 a 1 nas pontas (largura da rampa = `borda` do tamanho) e 1 no meio. */
function rampa(tamanho: number, borda: number): Float32Array {
  const faixa = Math.max(1, tamanho * borda);
  const r = new Float32Array(tamanho);
  for (let i = 0; i < tamanho; i++) r[i] = Math.min(1, i / faixa, (tamanho - 1 - i) / faixa);
  return r;
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

  // Fundo: a foto cobrindo a moldura, ampliada em 1,5 (só o miolo), borrada, um pouco mais clara e menos saturada.
  const bw = 300;
  const bh = Math.max(1, Math.round(bw / (W / H)));
  const cobrindo = await sharp(foto.data).resize({ width: Math.round(bw * AMPLIACAO_DO_FUNDO), height: Math.round(bh * AMPLIACAO_DO_FUNDO), fit: "cover" }).toBuffer();
  const fundo = await sharp(cobrindo)
    .extract({ left: Math.floor((Math.round(bw * AMPLIACAO_DO_FUNDO) - bw) / 2), top: Math.floor((Math.round(bh * AMPLIACAO_DO_FUNDO) - bh) / 2), width: bw, height: bh })
    .blur(Math.max(0.3, BORRAO_DO_FUNDO * bw))
    .modulate({ saturation: 0.9, brightness: 1.08 })
    .resize({ width: W, height: H, fit: "fill" })
    .toBuffer();

  // Frente: a foto inteira dentro da moldura, com as bordas ficando transparentes aos poucos.
  const escala = Math.min(W / foto.info.width, H / foto.info.height);
  const fw = Math.max(1, Math.round(foto.info.width * escala));
  const fh = Math.max(1, Math.round(foto.info.height * escala));
  const frenteRgb = await sharp(foto.data).resize({ width: fw, height: fh, fit: "fill" }).removeAlpha().raw().toBuffer();
  const rx = rampa(fw, BORDA_SUAVE);
  const ry = rampa(fh, BORDA_SUAVE);
  const mascara = Buffer.alloc(fw * fh);
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) mascara[y * fw + x] = Math.round(255 * rx[x] * ry[y]);
  const frente = await sharp(frenteRgb, { raw: { width: fw, height: fh, channels: 3 } })
    .joinChannel(mascara, { raw: { width: fw, height: fh, channels: 1 } })
    .png()
    .toBuffer();

  return sharp(fundo)
    .composite([{ input: frente, left: Math.round((W - fw) / 2), top: Math.round((H - fh) / 2) }])
    .jpeg({ quality: opcoes.qualidade, mozjpeg: true, chromaSubsampling: "4:2:0" })
    .toBuffer();
}
