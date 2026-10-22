import { describe, expect, it } from "vitest";
import { MARCA_TAMANHO, NOME_TAMANHO, capaLayoutValido, limitarPonto, marcaTamanhoPadrao, posicaoPadrao, semPosicao } from "../../lib/catalogo-capa";

describe("limitarPonto", () => {
  it("mantém a posição dentro da capa e arredonda em décimos", () => {
    expect(limitarPonto({ x: 33.349, y: 71.26 })).toEqual({ x: 33.3, y: 71.3 });
    expect(limitarPonto({ x: -20, y: 140 })).toEqual({ x: 0, y: 100 });
  });
});

describe("capaLayoutValido", () => {
  it("lixo ou vazio vira layout vazio", () => {
    expect(capaLayoutValido(null)).toEqual({});
    expect(capaLayoutValido("texto")).toEqual({});
    expect(capaLayoutValido({ marca: { x: "a", y: 3 }, nome: [], mensagem: { x: NaN, y: 1 } })).toEqual({});
  });
  it("mantém posições e tamanhos válidos, corrigindo o que passa do limite", () => {
    const l = capaLayoutValido({ marca: { x: 50, y: 12.34 }, nome: { x: 120, y: -5 }, mensagem: { x: 10, y: 90 }, marcaTamanho: 200, nomeTamanho: 0.1, extra: 1 });
    expect(l).toEqual({
      marca: { x: 50, y: 12.3 },
      nome: { x: 100, y: 0 },
      mensagem: { x: 10, y: 90 },
      marcaTamanho: MARCA_TAMANHO.max,
      nomeTamanho: NOME_TAMANHO.min,
    });
  });
});

describe("posições de sempre e desfazer", () => {
  it("capa com texto à esquerda usa a metade esquerda; as outras o alto, centralizado", () => {
    expect(posicaoPadrao("marca", false).x).toBe(50);
    expect(posicaoPadrao("nome", false).y).toBeGreaterThan(posicaoPadrao("marca", false).y);
    expect(posicaoPadrao("marca", true).x).toBeLessThan(50);
    expect(posicaoPadrao("nome", true).y).toBeGreaterThan(posicaoPadrao("marca", true).y);
    expect(marcaTamanhoPadrao(false)).toBe(34);
    expect(marcaTamanhoPadrao(true)).toBe(33);
  });
  it("semPosicao tira só o que foi pedido, ou tudo", () => {
    const l = { marca: { x: 1, y: 2 }, nome: { x: 3, y: 4 }, mensagem: { x: 5, y: 6 }, marcaTamanho: 40, nomeTamanho: 2 };
    expect(semPosicao(l, ["nome"])).toEqual({ marca: { x: 1, y: 2 }, mensagem: { x: 5, y: 6 }, marcaTamanho: 40, nomeTamanho: 2 });
    expect(semPosicao(l)).toEqual({});
    expect(l.nome).toEqual({ x: 3, y: 4 });
  });
});
