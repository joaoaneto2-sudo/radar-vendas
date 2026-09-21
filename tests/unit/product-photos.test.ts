import { describe, expect, it } from "vitest";
import { MAX_FOTOS_EXTRAS, lerFotosDoCorpo } from "../../lib/product-photos";

const a = "https://x.blob/a.jpg";
const b = "https://x.blob/b.jpg";
const c = "https://x.blob/c.jpg";

describe("fotos que vêm da tela do produto", () => {
  it("sem as chaves, nada muda nas fotos extras", () => {
    expect(lerFotosDoCorpo({ photo_url: a })).toEqual({ ok: true, value: { extras: null, trocas: [] } });
  });

  it("guarda as extras na ordem, sem repetir e sem a foto de destaque", () => {
    const r = lerFotosDoCorpo({ photo_url: a, extra_photos: [b, a, c, b, "  " + c + " "] });
    expect(r).toEqual({ ok: true, value: { extras: [b, c], trocas: [] } });
  });

  it("lista vazia limpa as extras", () => {
    expect(lerFotosDoCorpo({ photo_url: a, extra_photos: [] })).toEqual({ ok: true, value: { extras: [], trocas: [] } });
  });

  it("recusa endereço que não é http ou https, e lista que não é lista", () => {
    expect(lerFotosDoCorpo({ extra_photos: ["javascript:alert(1)"] })).toMatchObject({ ok: false, error: "invalid_url" });
    expect(lerFotosDoCorpo({ extra_photos: ["/foto.jpg"] })).toMatchObject({ ok: false, error: "invalid_url" });
    expect(lerFotosDoCorpo({ extra_photos: [42] })).toMatchObject({ ok: false, error: "invalid_url" });
    expect(lerFotosDoCorpo({ extra_photos: "x" })).toMatchObject({ ok: false, error: "invalid_photos" });
  });

  it("recusa mais de 12 extras", () => {
    const muitas = Array.from({ length: MAX_FOTOS_EXTRAS + 1 }, (_, i) => `https://x.blob/${i}.jpg`);
    expect(lerFotosDoCorpo({ extra_photos: muitas })).toMatchObject({ ok: false, error: "too_many" });
    expect(lerFotosDoCorpo({ extra_photos: muitas.slice(0, MAX_FOTOS_EXTRAS) }).ok).toBe(true);
  });

  it("trocas: só as que têm os dois endereços e mudam de fato", () => {
    const r = lerFotosDoCorpo({ photo_swaps: [{ de: a, para: b }, { de: a, para: a }, { de: "x", para: b }, null, { de: b }] });
    expect(r).toEqual({ ok: true, value: { extras: null, trocas: [{ de: a, para: b }] } });
  });
});
