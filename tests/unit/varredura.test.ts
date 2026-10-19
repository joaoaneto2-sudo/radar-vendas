import { describe, expect, it } from "vitest";
import { assinatura, lerArquivo, planejarPasta, resumoDoPlano, type ArquivoDaPasta, type PecaDoRadar } from "../../lib/varredura";

const arq = (nome: string, tamanho = 1000, modificadoEm = 1): ArquivoDaPasta => ({ nome, tamanho, modificadoEm });
const radar = (parte: Partial<PecaDoRadar> & { id: number; nome: string }): PecaDoRadar => ({
  codigo: null, custo: null, temFoto: false, temModelo: false, fotoOrigem: null, modeloOrigem: null, ...parte,
});

describe("lerArquivo", () => {
  it("entende o padrão com código, sem código, modelo, numerada e nome simples", () => {
    expect(lerArquivo(arq("BRILHARE-BR-005 - Brinco flor - custo 77,00.png"))).toMatchObject({ forma: "codigo", codigo: "BRILHARE-BR-005", nome: "Brinco flor", papel: "close", custo: 77 });
    expect(lerArquivo(arq("BRILHARE-BR-005 - Brinco flor - modelo.jpg"))).toMatchObject({ forma: "codigo", papel: "modelo", custo: null });
    expect(lerArquivo(arq("Brinco gota - custo 49.png"))).toMatchObject({ forma: "sem-codigo", codigo: null, nome: "Brinco gota", papel: "close", custo: 49 });
    expect(lerArquivo(arq("Brinco gota - modelo.png"))).toMatchObject({ forma: "sem-codigo", papel: "modelo" });
    expect(lerArquivo(arq("01 - Anel Cristal - custo 59,50.jpeg"))).toMatchObject({ forma: "numerada", nome: "Anel Cristal", custo: 59.5 });
    expect(lerArquivo(arq("Colar bonito.png"))).toMatchObject({ forma: "simples", papel: null, nome: "Colar bonito" });
    expect(lerArquivo(arq("SIMONEJÓ-BR-001 - Brinco Vivara - custo 37,00.jpg"))).toMatchObject({ codigo: "SIMONEJÓ-BR-001" });
  });

  it("custo '_' ou vazio vira nulo, e _2 é foto extra", () => {
    expect(lerArquivo(arq("20 - Brinco Verde - custo _.jpeg")).custo).toBeNull();
    expect(lerArquivo(arq("MILANO-BR-001_2 - Brinco - custo 92,50.jpg"))).toMatchObject({ extra: true, codigo: "MILANO-BR-001" });
  });
});

describe("planejarPasta: peça nova com nomes sem código", () => {
  const plano = planejarPasta("Glamour", [arq("Brinco gota - custo 49,00.png"), arq("Brinco gota - modelo.png"), arq("Colar azul - custo 120.png"), arq("Colar azul - modelo.png")], [
    radar({ id: 1, nome: "Brinco antigo", codigo: "GLAMOUR-BR-001" }),
    radar({ id: 2, nome: "Brinco antigo 2", codigo: "GLAMOUR-BR-002" }),
  ]);

  it("junta close + modelo, dá o próximo código do tipo e escolhe a categoria", () => {
    expect(plano.pecas).toHaveLength(2);
    const brinco = plano.pecas.find((p) => p.nome === "Brinco gota")!;
    expect(brinco).toMatchObject({ codigo: "GLAMOUR-BR-003", codigoNovo: true, categoria: "Brincos", custo: 49, situacao: "nova" });
    expect(brinco.subir).toEqual({ close: true, modelo: true });
    const colar = plano.pecas.find((p) => p.nome === "Colar azul")!;
    expect(colar).toMatchObject({ codigo: "GLAMOUR-CO-001", categoria: "Colares e Correntes", custo: 120 });
  });

  it("propõe renomear os dois arquivos para o padrão com o código", () => {
    const brinco = plano.pecas.find((p) => p.nome === "Brinco gota")!;
    expect(brinco.renomear).toEqual([
      { de: "Brinco gota - custo 49,00.png", para: "GLAMOUR-BR-003 - Brinco gota - custo 49,00.png", motivo: "código definitivo" },
      { de: "Brinco gota - modelo.png", para: "GLAMOUR-BR-003 - Brinco gota - modelo.png", motivo: "foto da modelo no padrão" },
    ]);
  });
});

describe("planejarPasta: peça que já existe", () => {
  const close = arq("MAX-BR-001 - Brinco azul - custo 30,00.png", 500, 7);
  const modelo = arq("MAX-BR-001 - Brinco azul - modelo.png", 800, 8);

  it("tudo igual ao que já subiu: situação igual, nada para subir nem renomear", () => {
    const p = planejarPasta("Max", [close, modelo], [radar({ id: 9, nome: "Brinco azul", codigo: "MAX-BR-001", custo: 30, temFoto: true, temModelo: true, fotoOrigem: assinatura(close), modeloOrigem: assinatura(modelo) })]);
    expect(p.pecas[0]).toMatchObject({ situacao: "igual", radarId: 9, subir: { close: false, modelo: false }, renomear: [] });
  });

  it("foto nova (outro tamanho/data) sobe de novo só a que mudou", () => {
    const fotoNova = arq("MAX-BR-001 - Brinco azul - modelo.png", 999, 20);
    const p = planejarPasta("Max", [close, fotoNova], [radar({ id: 9, nome: "Brinco azul", codigo: "MAX-BR-001", custo: 30, temFoto: true, temModelo: true, fotoOrigem: assinatura(close), modeloOrigem: assinatura(modelo) })]);
    expect(p.pecas[0]).toMatchObject({ situacao: "atualizar", subir: { close: false, modelo: true } });
  });

  it("peça já publicada sem origem guardada (veio de antes) não é reenviada, mas modelo que ainda não existe sobe", () => {
    const p = planejarPasta("Max", [close, modelo], [radar({ id: 9, nome: "Brinco azul", codigo: "MAX-BR-001", custo: 30, temFoto: true, temModelo: false })]);
    expect(p.pecas[0].subir).toEqual({ close: false, modelo: true });
    expect(p.pecas[0].situacao).toBe("atualizar");
  });

  it("custo diferente ou código diferente também pedem atualização", () => {
    const base = { id: 9, nome: "Brinco azul", temFoto: true, temModelo: true, fotoOrigem: assinatura(close), modeloOrigem: assinatura(modelo) };
    expect(planejarPasta("Max", [close, modelo], [radar({ ...base, codigo: "MAX-BR-001", custo: 35 })]).pecas[0].situacao).toBe("atualizar");
    expect(planejarPasta("Max", [close, modelo], [radar({ ...base, codigo: "MAX-BR-007", custo: 30 })]).pecas[0].situacao).toBe("atualizar");
  });

  it("custo diferente já registrado como dúvida no Radar não conta como novidade", () => {
    const base = { id: 9, nome: "Brinco azul", codigo: "MAX-BR-001", custo: 35, custoDaPasta: 30, temFoto: true, temModelo: true, fotoOrigem: assinatura(close), modeloOrigem: assinatura(modelo) };
    expect(planejarPasta("Max", [close, modelo], [radar(base)]).pecas[0].situacao).toBe("igual");
    expect(planejarPasta("Max", [close, modelo], [radar({ ...base, custoDaPasta: 28 })]).pecas[0].situacao).toBe("atualizar");
  });

  it("arquivo com código provisório usa o código definitivo que o Radar já tem", () => {
    const p = planejarPasta("Max", [arq("NOVO-BR-004 - Brinco azul - custo 30,00.png"), arq("Brinco azul - modelo.png")], [radar({ id: 9, nome: "Brinco azul", codigo: "MAX-BR-001", custo: 30 })]);
    expect(p.pecas[0]).toMatchObject({ codigo: "MAX-BR-001", codigoNovo: true });
    expect(p.pecas[0].renomear[0].para).toBe("MAX-BR-001 - Brinco azul - custo 30,00.png");
  });
});

describe("planejarPasta: casos de atenção", () => {
  it("peça sem custo no nome entra com alerta e o close não é renomeado", () => {
    const p = planejarPasta("Nino", [arq("Colar - custo _.jpeg")], []);
    expect(p.pecas[0]).toMatchObject({ custo: null, situacao: "nova" });
    expect(p.pecas[0].renomear).toEqual([]);
    expect(p.alertas.join(" ")).toContain("sem custo");
  });

  it("modelo sem close vira alerta; foto de nome simples sem par vai para as avulsas", () => {
    const p = planejarPasta("Nino", [arq("Anel bonito - modelo.png"), arq("Foto qualquer.png")], []);
    expect(p.pecas).toHaveLength(0);
    expect(p.avulsas).toContain("Foto qualquer.png");
    expect(p.alertas.some((a) => a.includes("Anel bonito - modelo.png"))).toBe(true);
  });

  it("duas versões do mesmo arquivo (.jpg e .png): vale a mais nova e avisa", () => {
    const p = planejarPasta("Luciana", [arq("L-BR-001 - x.jpg"), arq("LUCIANAR-BR-001 - Argola - custo 105,00.jpg", 10, 1), arq("LUCIANAR-BR-001 - Argola - custo 105,00.png", 20, 5)], []);
    expect(p.pecas).toHaveLength(1);
    expect(p.pecas[0].close?.nome).toBe("LUCIANAR-BR-001 - Argola - custo 105,00.png");
    expect(p.alertas.some((a) => a.includes("duas versões"))).toBe(true);
  });

  it("duas peças com o mesmo nome e códigos diferentes pareiam o modelo pelo código", () => {
    const p = planejarPasta("Luciana", [
      arq("LUCIANAR-BR-002 - Brinco argola - custo 32,00.jpg"), arq("LUCIANAR-BR-002 - Brinco argola - modelo.jpg"),
      arq("LUCIANAR-BR-006 - Brinco argola - custo 26,00.jpg"), arq("LUCIANAR-BR-006 - Brinco argola - modelo.jpg"),
    ], []);
    expect(p.pecas).toHaveLength(2);
    expect(p.pecas.every((x) => x.modelo !== null)).toBe(true);
    expect(p.pecas.find((x) => x.codigo === "LUCIANAR-BR-006")?.modelo?.nome).toBe("LUCIANAR-BR-006 - Brinco argola - modelo.jpg");
  });

  it("formato antigo: foto de nome simples vira o modelo do close de mesmo nome", () => {
    const p = planejarPasta("Brilhare", [arq("BRILHARE-BR-001 - Brinco flor - custo 77,00.png"), arq("Brinco flor.png")], []);
    expect(p.pecas[0].modelo?.nome).toBe("Brinco flor.png");
    expect(p.pecas[0].renomear.map((r) => r.para)).toEqual(["BRILHARE-BR-001 - Brinco flor - modelo.png"]);
  });

  it("resumoDoPlano conta novas, atualizações, fotos e renomeações", () => {
    const p = planejarPasta("Glamour", [arq("Brinco gota - custo 49,00.png"), arq("Brinco gota - modelo.png")], []);
    expect(resumoDoPlano([p])).toEqual({ novas: 1, atualizar: 0, iguais: 0, fotosParaSubir: 2, renomeacoes: 2, alertas: 0 });
  });
});
