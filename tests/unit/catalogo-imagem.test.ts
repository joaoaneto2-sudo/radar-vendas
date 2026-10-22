import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { jpegValido, larguraDaImagem, larguraValida, origemDaImagem, qualidadeValida, urlDaImagem, urlDaMoldura } from "../../lib/catalogo-imagem";
import { comporMoldura, limitarProporcao } from "../../lib/moldura-sharp";

describe("urlDaImagem e urlDaMoldura", () => {
  it("sem foto não pede nada", () => {
    expect(urlDaImagem(null, { largura: 800, qualidade: "leve" })).toBe("");
    expect(urlDaMoldura("", { largura: 800, proporcao: 1.1, qualidade: "leve" })).toBe("");
  });
  it("monta o pedido com o endereço da foto protegido, a largura e a qualidade do JPEG", () => {
    const u = urlDaImagem("https://abc.public.blob.vercel-storage.com/produtos/a b.png", { largura: 1100.4, qualidade: "leve" });
    const p = new URL(u, "http://x").searchParams;
    expect(u.startsWith("/api/catalogo-imagem?")).toBe(true);
    expect(p.get("u")).toBe("https://abc.public.blob.vercel-storage.com/produtos/a b.png");
    expect(p.get("w")).toBe("1100");
    expect(p.get("q")).toBe("74");
    expect(p.get("modo")).toBeNull();
  });
  it("moldura leva a proporção da caixa; fundo leva o modo", () => {
    const m = new URL(urlDaMoldura("/estoque/a.jpg", { largura: 900, proporcao: 1.10473, qualidade: "alta" }), "http://x").searchParams;
    expect([m.get("modo"), m.get("p"), m.get("q")]).toEqual(["moldura", "1.1", "88"]);
    expect(new URL(urlDaImagem("/estoque/a.jpg", { largura: 240, qualidade: "leve", modo: "fundo" }), "http://x").searchParams.get("modo")).toBe("fundo");
  });
  it("alta pede fotos maiores que leve, e grade menores que página inteira", () => {
    expect(larguraDaImagem("alta", "modelo", false)).toBeGreaterThan(larguraDaImagem("leve", "modelo", false));
    expect(larguraDaImagem("leve", "modelo", true)).toBeLessThan(larguraDaImagem("leve", "modelo", false));
    expect(qualidadeValida("alta")).toBe("alta");
    expect(qualidadeValida("qualquer")).toBe("leve");
    expect(qualidadeValida(undefined)).toBe("leve");
  });
});

describe("origemDaImagem: só o que é do Radar", () => {
  const site = "radar.exemplo.com.br";
  it("aceita arquivos das pastas conhecidas do site", () => {
    expect(origemDaImagem("/catalogo/capas/capa-1.jpg", site)).toEqual({ tipo: "site", caminho: "/catalogo/capas/capa-1.jpg" });
    expect(origemDaImagem("/estoque/Zarpellon/a.jpg", site)).toEqual({ tipo: "site", caminho: "/estoque/Zarpellon/a.jpg" });
    expect(origemDaImagem("https://radar.exemplo.com.br/uploads-dev/x.png", site)).toEqual({ tipo: "site", caminho: "/uploads-dev/x.png" });
  });
  it("aceita o armazenamento de fotos do Radar", () => {
    expect(origemDaImagem("https://abc123.public.blob.vercel-storage.com/produtos/1.jpg", site)).toEqual({
      tipo: "armazenamento",
      url: "https://abc123.public.blob.vercel-storage.com/produtos/1.jpg",
    });
  });
  it("recusa qualquer outro lugar", () => {
    for (const u of [
      "https://exemplo.com/foto.jpg",
      "http://abc.public.blob.vercel-storage.com/a.jpg",
      "https://public.blob.vercel-storage.com/a.jpg",
      "https://evil.com/public.blob.vercel-storage.com/a.jpg",
      "https://x.public.blob.vercel-storage.com.evil.com/a.jpg",
      "//evil.com/a.jpg",
      "/api/products",
      "/estoque/../api/products",
      "/catalogo\\..\\x",
      "file:///c:/windows/win.ini",
      "ftp://x/a.jpg",
      "javascript:alert(1)",
      "",
      null,
      undefined,
      "/estoque/" + "a".repeat(2100),
    ]) {
      expect(origemDaImagem(u as string, site), String(u).slice(0, 40)).toBeNull();
    }
  });
  it("endereço do próprio site em pasta que não é de fotos também é recusado", () => {
    expect(origemDaImagem("https://radar.exemplo.com.br/api/products", site)).toBeNull();
  });
});

describe("larguraValida e jpegValido", () => {
  it("corrige valores fora do limite ou sem sentido", () => {
    expect(larguraValida("1100")).toBe(1100);
    expect(larguraValida("10")).toBe(160);
    expect(larguraValida("99999")).toBe(3000);
    expect(larguraValida("abc")).toBe(1100);
    expect(larguraValida(null)).toBe(1100);
    expect(jpegValido("74")).toBe(74);
    expect(jpegValido("5")).toBe(50);
    expect(jpegValido("100")).toBe(92);
    expect(jpegValido("x")).toBe(74);
  });
});

describe("comporMoldura", () => {
  const fotoDeTeste = (largura: number, altura: number, formato: "png" | "jpeg" = "png") =>
    sharp({ create: { width: largura, height: altura, channels: 4, background: { r: 200, g: 120, b: 90, alpha: 0.5 } } })
      [formato]()
      .toBuffer();

  it("devolve um JPEG do tamanho da moldura, mesmo com foto PNG transparente e de proporção diferente", async () => {
    const saida = await comporMoldura(await fotoDeTeste(600, 1200), { largura: 440, proporcao: 1.1, qualidade: 74 });
    const m = await sharp(saida).metadata();
    expect(m.format).toBe("jpeg");
    expect(m.width).toBe(440);
    expect(m.height).toBe(400);
    expect(m.hasAlpha).toBe(false);
  });
  it("foto larga também cabe, e o miolo mantém a cor da foto enquanto a borda se mistura ao fundo", async () => {
    const saida = await comporMoldura(await fotoDeTeste(1600, 400, "png"), { largura: 600, proporcao: 1.5, qualidade: 80 });
    const m = await sharp(saida).metadata();
    expect([m.width, m.height]).toEqual([600, 400]);
    const { data } = await sharp(saida).raw().toBuffer({ resolveWithObject: true });
    const canais = 3;
    const px = (x: number, y: number) => [data[(y * 600 + x) * canais], data[(y * 600 + x) * canais + 1], data[(y * 600 + x) * canais + 2]];
    const centro = px(300, 200);
    expect(centro[0]).toBeGreaterThan(centro[2]); // foto laranja-avermelhada no meio
  });
  it("limitarProporcao segura valores absurdos", () => {
    expect(limitarProporcao(0)).toBe(1.1);
    expect(limitarProporcao(NaN)).toBe(1.1);
    expect(limitarProporcao(100)).toBe(3.5);
    expect(limitarProporcao(0.01)).toBe(0.3);
    expect(limitarProporcao(1.25)).toBe(1.25);
  });
});
