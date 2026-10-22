import { describe, expect, it } from "vitest";
import { assinatura, ehPastaDeColecao, planejarColecao, resolverFabricante, type ArquivoDaPasta, type FabricanteNoRadar } from "../../lib/varredura";
import nomesReais from "../fixtures/escolhas-de-fernanda.json";

const arq = (nome: string, tamanho = 1000, modificadoEm = 1): ArquivoDaPasta => ({ nome, tamanho, modificadoEm });
const fabricantes = (extra: Partial<Record<string, FabricanteNoRadar["pecas"]>> = {}): FabricanteNoRadar[] =>
  ["Zarpellon", "Milano", "Nino", "Brilhare", "Bia Belutti"].map((nome) => ({ nome, pecas: extra[nome] ?? [] }));

describe("ehPastaDeColecao", () => {
  it("reconhece pastas de coleção especial e não confunde com fabricante", () => {
    expect(ehPastaDeColecao("Escolhas de Fernanda")).toBe(true);
    expect(ehPastaDeColecao("escolhas de fernanda")).toBe(true);
    expect(ehPastaDeColecao("Coleção Verão")).toBe(true);
    expect(ehPastaDeColecao("Colecao Recife")).toBe(true);
    expect(ehPastaDeColecao("Zarpellon")).toBe(false);
    expect(ehPastaDeColecao("Cinthia Souza")).toBe(false);
  });
});

describe("resolverFabricante", () => {
  const nomes = ["Zarpellon", "Milano", "Nino", "Brilhare", "Bia Belutti", "Catharina Degam"];
  it("acerta as grafias dos arquivos para o nome do Radar", () => {
    expect(resolverFabricante("Zarpelon", nomes)).toBe("Zarpellon");
    expect(resolverFabricante("MILLANO", nomes)).toBe("Milano");
    expect(resolverFabricante("Nino Bran", nomes)).toBe("Nino");
    expect(resolverFabricante("Brilhare", nomes)).toBe("Brilhare");
    expect(resolverFabricante("catharina degan", nomes)).toBe("Catharina Degam");
  });
  it("fabricante desconhecido devolve nulo", () => {
    expect(resolverFabricante("Marca Qualquer", nomes)).toBeNull();
  });
});

describe("planejarColecao com os 75 arquivos reais de Escolhas de Fernanda", () => {
  const plano = planejarColecao("Escolhas de Fernanda", nomesReais.map((n) => arq(n)), fabricantes());

  it("acha as 41 peças, 25 com foto da modelo e 16 só com o close", () => {
    expect(plano.colecao).toBe(true);
    expect(plano.pecas).toHaveLength(41);
    expect(plano.pecas.filter((p) => p.modelo).length).toBe(25);
    expect(plano.pecas.filter((p) => !p.modelo).length).toBe(16);
    expect(plano.pecas.every((p) => p.situacao === "nova")).toBe(true);
  });

  it("arruma os fabricantes (Zarpelon, MILLANO, Nino Bran) e não renomeia nenhum arquivo", () => {
    const porFab = new Map<string, number>();
    for (const p of plano.pecas) porFab.set(p.fabricante!, (porFab.get(p.fabricante!) ?? 0) + 1);
    expect([...porFab.keys()].sort()).toEqual(["Bia Belutti", "Brilhare", "Milano", "Nino", "Zarpellon"]);
    expect(porFab.get("Milano")).toBe(5);
    expect(porFab.get("Nino")).toBe(6);
    expect(plano.pecas.every((p) => p.renomear.length === 0)).toBe(true);
  });

  it("o valor do nome vira custo, o nome da peça começa com maiúscula e cada peça tem código único do fabricante", () => {
    const anel = plano.pecas.find((p) => p.nome === "Anel em pedra legítima")!;
    expect(anel).toMatchObject({ fabricante: "Zarpellon", custo: 69, categoria: "Anéis" });
    expect(plano.pecas.find((p) => p.nome.startsWith("Colar dourado orgânico fosco"))?.custo).toBe(159);
    expect(plano.pecas.find((p) => p.nome.startsWith("Colar longo com gota"))?.custo).toBe(99.5);
    const codigos = plano.pecas.map((p) => p.codigo);
    expect(new Set(codigos).size).toBe(codigos.length);
    expect(plano.pecas.filter((p) => p.fabricante === "Zarpellon").every((p) => p.codigo.startsWith("ZARPELLO-"))).toBe(true);
    expect(plano.pecas.every((p) => p.nome === p.nome.charAt(0).toUpperCase() + p.nome.slice(1))).toBe(true);
  });

  it("as fotos soltas (sem fabricante e valor, sem par) ficam de fora e aparecem nos alertas", () => {
    expect(plano.avulsas).toContain("Anel branco figuras geométricas.jpeg");
    expect(plano.avulsas).toContain("WhatsApp Image 2026-10-20 at 20.37.24.jpeg");
    expect(plano.alertas.some((a) => a.includes("Anel branco figuras geométricas.jpeg"))).toBe(true);
  });

  it("escolhe a categoria certa: pulseira com a palavra corrente é pulseira; colar com pingente é colar", () => {
    expect(plano.pecas.find((p) => p.nome.startsWith("Pulseira corrente"))?.categoria).toBe("Pulseiras");
    expect(plano.pecas.find((p) => p.nome.startsWith("Colar com pingente em estrela"))?.categoria).toBe("Colares e Correntes");
    expect(plano.pecas.find((p) => p.nome.startsWith("Pingente quadrado"))?.categoria).toBe("Pingentes");
  });

  it("peça sem modelo ainda sobe o close", () => {
    const so = plano.pecas.find((p) => p.nome === "Colar duplo de canutilhos")!;
    expect(so).toMatchObject({ fabricante: "Bia Belutti", custo: 153, modelo: null });
    expect(so.subir).toEqual({ close: true, modelo: false });
  });
});

describe("planejarColecao: peça que já existe e peça repetida", () => {
  const close = arq("Zarpelon - Anel em pedra legítima - 69,00.jpeg", 500, 7);
  const modelo = arq("Anel em pedra legítima.jpeg", 800, 8);

  it("peça que já está no Radar e já subiu fica 'igual'; com foto nova, 'atualizar'", () => {
    const existente = { id: 9, nome: "Anel em pedra legítima", codigo: "ZARPELLO-AN-001", custo: 69, temFoto: true, temModelo: true, fotoOrigem: assinatura(close), modeloOrigem: assinatura(modelo) };
    const igual = planejarColecao("Escolhas de Fernanda", [close, modelo], fabricantes({ Zarpellon: [existente] }));
    expect(igual.pecas[0]).toMatchObject({ situacao: "igual", codigo: "ZARPELLO-AN-001", radarId: 9 });
    const nova = planejarColecao("Escolhas de Fernanda", [arq(close.nome, 999, 99), modelo], fabricantes({ Zarpellon: [existente] }));
    expect(nova.pecas[0]).toMatchObject({ situacao: "atualizar", subir: { close: true, modelo: false } });
  });

  it("próximo código continua depois dos que o fabricante já tem", () => {
    const p = planejarColecao("Escolhas de Fernanda", [close], fabricantes({ Zarpellon: [{ id: 1, nome: "X", codigo: "ZARPELLO-AN-001", custo: 1, temFoto: true, temModelo: false, fotoOrigem: null, modeloOrigem: null }] }));
    expect(p.pecas[0].codigo).toBe("ZARPELLO-AN-002");
  });

  it("fabricante que não existe vira alerta e a peça fica de fora; valor sem número vira peça sem custo", () => {
    const p = planejarColecao("Escolhas de Fernanda", [arq("Marca Estranha - Brinco x - 50,00.jpeg"), arq("Milano - Brinco y - _.jpeg")], fabricantes());
    expect(p.pecas.map((x) => x.nome)).toEqual(["Brinco y"]);
    expect(p.pecas[0].custo).toBeNull();
    expect(p.alertas.some((a) => a.includes("Marca Estranha"))).toBe(true);
    expect(p.alertas.some((a) => a.includes("sem valor"))).toBe(true);
  });

  it("mesma peça duas vezes: usa a primeira e avisa", () => {
    const p = planejarColecao("Escolhas de Fernanda", [arq("Milano - Brinco z - 40,00.jpeg"), arq("Milano - Brinco z - 40,00.png", 10, 99)], fabricantes());
    expect(p.pecas).toHaveLength(1);
    expect(p.alertas.length).toBeGreaterThan(0);
  });
});
