import { describe, expect, it } from "vitest";
import { CATALOGO_BIA_BELUTTI, chaveDoArquivo } from "../../lib/catalogo-bia-belutti";

describe("catálogo da Bia Belutti", () => {
  it("tem as 29 peças, sem arquivo nem nome repetido", () => {
    expect(CATALOGO_BIA_BELUTTI).toHaveLength(29);
    expect(new Set(CATALOGO_BIA_BELUTTI.map((i) => i.arquivo)).size).toBe(29);
    expect(new Set(CATALOGO_BIA_BELUTTI.map((i) => i.nome)).size).toBe(29);
  });

  it("o preço de varejo é o preço de atacado (número do arquivo) vezes 2,5", () => {
    for (const item of CATALOGO_BIA_BELUTTI) {
      const atacado = Number(item.arquivo.match(/(\d+)\.jpe?g$/i)?.[1]);
      expect(item.preco, item.nome).toBe(atacado * 2.5);
    }
  });

  it("o nome da peça não leva o número, nem travessão", () => {
    for (const item of CATALOGO_BIA_BELUTTI) {
      expect(item.nome, item.arquivo).not.toMatch(/\d{2,3}$/);
      expect(item.nome).not.toContain("—");
      expect(item.nome).not.toMatch(/\s,/);
    }
  });

  it("cada peça tem uma categoria do sistema", () => {
    const validas = ["Anéis", "Brincos", "Pulseiras", "Colares e Correntes", "Pingentes"];
    for (const item of CATALOGO_BIA_BELUTTI) expect(validas, item.nome).toContain(item.categoria);
    expect(CATALOGO_BIA_BELUTTI.find((i) => i.nome === "Anel Flores")).toMatchObject({ categoria: "Anéis", preco: 272.5 });
    expect(CATALOGO_BIA_BELUTTI.find((i) => i.nome === "Cruz em cristal")).toMatchObject({ categoria: "Pingentes" });
  });

  it("casa o arquivo escolhido sem diferença de maiúscula ou de acento composto", () => {
    expect(chaveDoArquivo("Colar Espírito Santo com zircônia 89.jpeg")).toBe(chaveDoArquivo("colar espírito santo com zircônia 89.JPEG"));
    const composto = "Espírito";
    expect(chaveDoArquivo(`Colar ${composto}`)).toBe(chaveDoArquivo("Colar Espírito"));
  });
});
