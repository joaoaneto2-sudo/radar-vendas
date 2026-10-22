import { describe, expect, it } from "vitest";
import {
  BLOCO_NOVO,
  FONTES_DA_MENSAGEM,
  MAXIMO_DE_BLOCOS,
  MENSAGEM_PADRAO,
  MODELOS_DE_MENSAGEM,
  URL_DAS_FONTES,
  fonteDaMensagem,
  mensagemValida,
  partirBloco,
} from "../../lib/catalogo-mensagem";

const bloco = (texto: string, extra = {}) => ({ ...BLOCO_NOVO, texto, ...extra });

describe("partirBloco", () => {
  it("o que está entre asteriscos sai grande e o resto normal", () => {
    expect(partirBloco("Até *25% OFF*")).toEqual([
      { texto: "Até ", grande: false },
      { texto: "25% OFF", grande: true },
    ]);
  });
  it("sem asteriscos é um pedaço só", () => {
    expect(partirBloco("só pra você!")).toEqual([{ texto: "só pra você!", grande: false }]);
  });
  it("vários trechos grandes e asterisco sozinho some", () => {
    expect(partirBloco("*Hoje* e *amanhã* só 10* pontos")).toEqual([
      { texto: "Hoje", grande: true },
      { texto: " e ", grande: false },
      { texto: "amanhã", grande: true },
      { texto: " só 10 pontos", grande: false },
    ]);
  });
  it("texto vazio não tem pedaços", () => {
    expect(partirBloco("")).toEqual([]);
    expect(partirBloco("**")).toEqual([]);
  });
});

describe("mensagemValida", () => {
  it("sem nenhuma linha com texto vira nada", () => {
    expect(mensagemValida(null)).toBeNull();
    expect(mensagemValida({ ...MENSAGEM_PADRAO })).toBeNull();
    expect(mensagemValida({ ...MENSAGEM_PADRAO, blocos: [bloco("   "), bloco("**")] })).toBeNull();
    expect(mensagemValida({ blocos: "texto" as never })).toBeNull();
  });
  it("mantém o que é válido e tira as linhas vazias", () => {
    const m = mensagemValida({
      linha: "topo",
      coluna: "dir",
      fundo: false,
      blocos: [bloco(" Psiu... ", { fonte: "kaushan", tamanho: "xg", cor: "dourado", sublinhado: true }), bloco(""), bloco("Até *25% OFF*", { estilo: "faixa", cor: "preto" })],
    });
    expect(m).toMatchObject({ linha: "topo", coluna: "dir", fundo: false });
    expect(m?.blocos).toHaveLength(2);
    expect(m?.blocos[0]).toEqual({ texto: "Psiu...", fonte: "kaushan", tamanho: "xg", cor: "dourado", estilo: "texto", sublinhado: true });
    expect(m?.blocos[1]).toMatchObject({ texto: "Até *25% OFF*", estilo: "faixa", cor: "preto" });
  });
  it("valor que não existe volta ao padrão, o texto é cortado e só entram 4 linhas", () => {
    const m = mensagemValida({
      linha: "fora" as never,
      blocos: [bloco("x".repeat(500), { fonte: "inventada", cor: "vermelho" as never, estilo: "neon" as never, tamanho: "enorme" as never }), ...Array.from({ length: 6 }, (_, i) => bloco(`linha ${i}`))],
    });
    expect(m?.blocos).toHaveLength(MAXIMO_DE_BLOCOS);
    expect(m?.blocos[0].texto).toHaveLength(60);
    expect(m?.blocos[0]).toMatchObject({ fonte: BLOCO_NOVO.fonte, cor: BLOCO_NOVO.cor, estilo: "texto", tamanho: BLOCO_NOVO.tamanho, sublinhado: false });
    expect(m).toMatchObject({ linha: MENSAGEM_PADRAO.linha, coluna: MENSAGEM_PADRAO.coluna, fundo: true });
  });
});

describe("modelos e fontes", () => {
  it("todo modelo pronto é uma mensagem válida e sai igual depois de validada", () => {
    for (const modelo of MODELOS_DE_MENSAGEM) expect(mensagemValida(modelo.mensagem)).toEqual(modelo.mensagem);
  });
  it("o modelo de oferta tem a linha em faixa com o número grande", () => {
    const oferta = MODELOS_DE_MENSAGEM.find((m) => m.id === "oferta")!;
    expect(oferta.mensagem.blocos.map((b) => b.estilo)).toEqual(["texto", "faixa", "texto"]);
    expect(partirBloco(oferta.mensagem.blocos[1].texto).some((p) => p.grande && p.texto === "25% OFF")).toBe(true);
  });
  it("fonte desconhecida cai na primeira da lista e a URL pede todas as fontes", () => {
    expect(fonteDaMensagem("nao-existe").id).toBe(FONTES_DA_MENSAGEM[0].id);
    for (const f of FONTES_DA_MENSAGEM) expect(URL_DAS_FONTES).toContain(`family=${f.google}`);
  });
  it("as fontes usadas nos modelos existem na lista", () => {
    const ids = new Set(FONTES_DA_MENSAGEM.map((f) => f.id));
    for (const modelo of MODELOS_DE_MENSAGEM) for (const b of modelo.mensagem.blocos) expect(ids.has(b.fonte)).toBe(true);
  });
});
