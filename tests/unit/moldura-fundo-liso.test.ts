import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { comporMoldura, corDoFundoLiso } from "../../lib/moldura-sharp";

// Peça vermelha no meio de um fundo branco (foto de estúdio) e uma foto com cenário (borda que muda de cor).
const estudio = () =>
  sharp({ create: { width: 400, height: 400, channels: 3, background: "#ffffff" } })
    .composite([{ input: { create: { width: 160, height: 160, channels: 3, background: "#b0102a" } }, left: 120, top: 120 }])
    .jpeg()
    .toBuffer();
const cenario = () =>
  sharp({ create: { width: 400, height: 400, channels: 3, background: "#d8b48c" } })
    .composite([{ input: { create: { width: 400, height: 120, channels: 3, background: "#3a2a20" } }, left: 0, top: 280 }])
    .jpeg()
    .toBuffer();

describe("corDoFundoLiso", () => {
  it("reconhece o fundo branco da foto de estúdio", async () => {
    const cor = await corDoFundoLiso(await estudio());
    expect(cor).not.toBeNull();
    expect(Math.min(cor!.r, cor!.g, cor!.b)).toBeGreaterThan(245);
  });
  it("não trata como liso a foto com cenário", async () => {
    expect(await corDoFundoLiso(await cenario())).toBeNull();
  });
});

describe("comporMoldura com fundo liso", () => {
  it("preenche a sobra da moldura com a cor do fundo, sem cópia borrada da peça", async () => {
    const jpg = await comporMoldura(await estudio(), { largura: 200, proporcao: 0.5, qualidade: 90 });
    const { data, info } = await sharp(jpg).raw().toBuffer({ resolveWithObject: true });
    expect(info.height).toBe(400);
    // Faixa de cima e de baixo (fora da foto quadrada): branca, sem vermelho borrado.
    for (const y of [5, 40, 360, 395]) {
      const i = (y * info.width + 100) * info.channels;
      expect(Math.min(data[i], data[i + 1], data[i + 2])).toBeGreaterThan(240);
    }
  });
});
