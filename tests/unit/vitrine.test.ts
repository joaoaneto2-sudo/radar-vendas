import { describe, expect, it } from "vitest";
import {
  MAX_CARROSSEL,
  avisoDeVagasRemovidas,
  fotosDaPeca,
  validarCarrossel,
  validarCategoria,
  type PecaDaVitrine,
} from "../../lib/vitrine";

const PECAS: PecaDaVitrine[] = [
  { id: 1, name: "Anel Solitário", category: "Anéis", publicada: true, fotos: ["https://x/1a.jpg", "https://x/1b.jpg"] },
  { id: 2, name: "Brinco Argola", category: "Brincos", publicada: true, fotos: ["https://x/2a.jpg"] },
  { id: 3, name: "Colar escondido", category: "Colares e Correntes", publicada: false, fotos: ["https://x/3a.jpg"] },
];

describe("fotos da peça", () => {
  it("principal primeiro, sem repetir e sem vazias", () => {
    expect(fotosDaPeca("a.jpg", ["b.jpg", "a.jpg", "  ", "c.jpg"])).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(fotosDaPeca(null, ["b.jpg"])).toEqual(["b.jpg"]);
    expect(fotosDaPeca(undefined, [])).toEqual([]);
  });
});

describe("validar o carrossel", () => {
  it("aceita uma lista boa e mantém a ordem", () => {
    const r = validarCarrossel([{ product_id: 2, photo_url: "https://x/2a.jpg" }, { product_id: 1, photo_url: "https://x/1b.jpg" }], PECAS);
    expect(r).toEqual({ ok: true, value: [{ product_id: 2, photo_url: "https://x/2a.jpg" }, { product_id: 1, photo_url: "https://x/1b.jpg" }] });
  });

  it("lista vazia é válida (o carrossel some)", () => {
    expect(validarCarrossel([], PECAS)).toEqual({ ok: true, value: [] });
  });

  it("recusa formato errado", () => {
    expect(validarCarrossel("x", PECAS)).toMatchObject({ ok: false, error: "invalid_list" });
    expect(validarCarrossel([{ product_id: "abc", photo_url: "https://x/1a.jpg" }], PECAS)).toMatchObject({ ok: false, error: "invalid_item" });
    expect(validarCarrossel([{ product_id: 1, photo_url: "" }], PECAS)).toMatchObject({ ok: false, error: "invalid_item" });
  });

  it("recusa mais de 8, peça repetida, peça inexistente e peça fora do site", () => {
    const nove = Array.from({ length: MAX_CARROSSEL + 1 }, (_, i) => ({ product_id: i + 1, photo_url: "https://x/1a.jpg" }));
    expect(validarCarrossel(nove, PECAS)).toMatchObject({ ok: false, error: "too_many" });
    const repetida = [{ product_id: 1, photo_url: "https://x/1a.jpg" }, { product_id: 1, photo_url: "https://x/1b.jpg" }];
    expect(validarCarrossel(repetida, PECAS)).toMatchObject({ ok: false, error: "duplicate_piece" });
    expect(validarCarrossel([{ product_id: 99, photo_url: "https://x/1a.jpg" }], PECAS)).toMatchObject({ ok: false, error: "piece_not_found" });
    const fora = validarCarrossel([{ product_id: 3, photo_url: "https://x/3a.jpg" }], PECAS);
    expect(fora).toMatchObject({ ok: false, error: "piece_not_published" });
    expect(!fora.ok && fora.message).toContain("Colar escondido");
  });

  it("recusa foto que não é da peça", () => {
    const r = validarCarrossel([{ product_id: 1, photo_url: "https://x/2a.jpg" }], PECAS);
    expect(r).toMatchObject({ ok: false, error: "photo_not_from_piece" });
  });
});

describe("validar a foto da categoria", () => {
  it("aceita foto de uma peça publicada daquela categoria", () => {
    const r = validarCategoria({ category: "Anéis", product_id: 1, photo_url: "https://x/1b.jpg" }, PECAS);
    expect(r).toEqual({ ok: true, value: { category: "Anéis", product_id: 1, photo_url: "https://x/1b.jpg" } });
  });

  it("recusa categoria vazia, peça de outra categoria, peça fora do site e foto de outra peça", () => {
    expect(validarCategoria({ category: " ", product_id: 1, photo_url: "https://x/1a.jpg" }, PECAS)).toMatchObject({ ok: false, error: "invalid_item" });
    expect(validarCategoria({ category: "Brincos", product_id: 1, photo_url: "https://x/1a.jpg" }, PECAS)).toMatchObject({ ok: false, error: "wrong_category" });
    expect(validarCategoria({ category: "Colares e Correntes", product_id: 3, photo_url: "https://x/3a.jpg" }, PECAS)).toMatchObject({ ok: false, error: "piece_not_published" });
    expect(validarCategoria({ category: "Anéis", product_id: 1, photo_url: "https://x/2a.jpg" }, PECAS)).toMatchObject({ ok: false, error: "photo_not_from_piece" });
    expect(validarCategoria({ category: "Anéis", product_id: 99, photo_url: "https://x/1a.jpg" }, PECAS)).toMatchObject({ ok: false, error: "piece_not_found" });
  });
});

describe("aviso das vagas removidas", () => {
  it("diz onde a foto saiu", () => {
    expect(avisoDeVagasRemovidas([])).toBeNull();
    expect(avisoDeVagasRemovidas([{ area: "carrossel", category: null }])).toBe("Essa foto também saiu da vitrine do site: carrossel.");
    expect(
      avisoDeVagasRemovidas([{ area: "carrossel", category: null }, { area: "categoria", category: "Anéis" }])
    ).toBe("Essa foto também saiu da vitrine do site: carrossel e categoria Anéis.");
  });
});
