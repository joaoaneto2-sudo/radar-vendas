import { describe, expect, it } from "vitest";
import { fotosDaPagina, fotosDisponiveis, fotosEscolhidas } from "../../lib/catalogo-fotos";
import { aplicarEscolhaDeFotos, decidirPagina } from "../../lib/catalogo-layout";

const peca = {
  photo_url: "/a/close.jpg",
  modelo_photo_url: "/a/modelo.jpg",
  catalog_photo: { kind: "limpa" as const },
  galeria: [
    { url: "/a/modelo.jpg", kind: "modelo" as const },
    { url: "/a/detalhe1.jpg", kind: null },
    { url: "/a/detalhe2.jpg", kind: null },
  ],
};

describe("fotosDisponiveis", () => {
  it("principal, modelo e as outras, sem repetir, com rótulo", () => {
    expect(fotosDisponiveis(peca)).toEqual([
      { url: "/a/close.jpg", rotulo: "Principal" },
      { url: "/a/modelo.jpg", rotulo: "Modelo" },
      { url: "/a/detalhe1.jpg", rotulo: "Foto 3" },
      { url: "/a/detalhe2.jpg", rotulo: "Foto 4" },
    ]);
  });

  it("peça só com foto de modelo chama a principal de Modelo; peça sem foto não tem nada", () => {
    expect(fotosDisponiveis({ photo_url: "/a/m.jpg", catalog_photo: { kind: "modelo" } })).toEqual([{ url: "/a/m.jpg", rotulo: "Modelo" }]);
    expect(fotosDisponiveis({})).toEqual([]);
    expect(fotosDisponiveis({ photo_url: "  " })).toEqual([]);
  });
});

describe("fotosEscolhidas", () => {
  it("padrão sem escolha própria: nada muda (undefined)", () => {
    expect(fotosEscolhidas(peca, "padrao")).toBeUndefined();
  });

  it("número: as primeiras fotos da peça (limitado ao que ela tem)", () => {
    expect(fotosEscolhidas(peca, 1)).toEqual(["/a/close.jpg"]);
    expect(fotosEscolhidas(peca, 3)).toEqual(["/a/close.jpg", "/a/modelo.jpg", "/a/detalhe1.jpg"]);
    expect(fotosEscolhidas(peca, 4)?.length).toBe(4);
    expect(fotosEscolhidas({ photo_url: "/a/so.jpg" }, 4)).toEqual(["/a/so.jpg"]);
  });

  it("escolha própria manda: ordem escolhida, só fotos da peça, sem repetir, até 4", () => {
    expect(fotosEscolhidas(peca, "padrao", ["/a/detalhe2.jpg", "/a/close.jpg", "/x/de-outra-peca.jpg", "/a/close.jpg"])).toEqual(["/a/detalhe2.jpg", "/a/close.jpg"]);
    expect(fotosEscolhidas(peca, 1, ["/a/modelo.jpg"])).toEqual(["/a/modelo.jpg"]);
    expect(fotosEscolhidas(peca, "padrao", ["/x/nenhuma.jpg"])).toBeUndefined();
  });
});

describe("fotosDaPagina", () => {
  it("sem escolha: principal e modelo; com escolha: as escolhidas", () => {
    expect(fotosDaPagina(peca, undefined)).toEqual(["/a/close.jpg", "/a/modelo.jpg"]);
    expect(fotosDaPagina(peca, ["/a/detalhe1.jpg"])).toEqual(["/a/detalhe1.jpg"]);
  });
});

describe("página com fotos escolhidas", () => {
  it("3 ou 4 fotos é mosaico; 1 ou 2 usam o desenho de sempre", () => {
    expect(decidirPagina({ fotos: ["a", "b", "c"] })).toBe("mosaico");
    expect(decidirPagina({ fotos: ["a", "b", "c", "d"] })).toBe("mosaico");
    expect(decidirPagina({ fotos: ["a", "b"], photo_modelo_url: "b" })).toBe("duplo-limpa");
    expect(decidirPagina({ photo_modelo_url: "b" })).toBe("duplo-limpa");
    expect(decidirPagina({})).toBe("limpa-unica");
  });

  it("aplicarEscolhaDeFotos: 1 foto vira página de foto única; 2 fotos viram principal + segunda", () => {
    const base = { photo_url: "/a/close.jpg", photo_modelo_url: "/a/modelo.jpg", catalog_photo: { kind: "limpa" as const, fx: 50, fy: 50, zoom: 1 } };
    const uma = aplicarEscolhaDeFotos({ ...base, fotos: ["/a/close.jpg"] });
    expect(decidirPagina(uma)).toBe("limpa-unica");
    const outra = aplicarEscolhaDeFotos({ ...base, fotos: ["/a/detalhe1.jpg"] });
    expect(outra.photo_url).toBe("/a/detalhe1.jpg");
    expect(decidirPagina(outra)).toBe("limpa-unica");
    const duas = aplicarEscolhaDeFotos({ ...base, fotos: ["/a/modelo.jpg", "/a/close.jpg"] });
    expect([duas.photo_url, duas.photo_modelo_url]).toEqual(["/a/modelo.jpg", "/a/close.jpg"]);
    expect(decidirPagina(duas)).toBe("duplo-limpa");
  });

  it("peça só com foto de modelo (kind modelo) escolhendo essa única foto continua no desenho de recorte", () => {
    const p = { photo_url: "/a/m.jpg", photo_modelo_url: null, catalog_photo: { kind: "modelo" as const, fx: 50, fy: 50, zoom: 1.4 } };
    expect(decidirPagina(aplicarEscolhaDeFotos({ ...p, fotos: ["/a/m.jpg"] }))).toBe("duplo-modelo");
  });

  it("sem escolha nada muda", () => {
    const p = { photo_url: "/a/close.jpg", photo_modelo_url: "/a/modelo.jpg" };
    expect(aplicarEscolhaDeFotos(p)).toBe(p);
  });
});
