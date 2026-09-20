import { describe, expect, it } from "vitest";
import {
  acumuladoDoMes,
  comparativoAteHoje,
  diaDaMeta,
  diasNoMes,
  entrouNoMes,
  mesesDaTabela,
  metaDoMes,
  resumoMensal,
  ritmoDoMes,
  situacaoDoMes,
  somarMeses,
  tendenciaDasVendas,
  variacao,
  vendidoNoMes,
  type DadosDaMeta,
} from "../../lib/meta-mensal";

const HOJE = "2026-09-19";

const DADOS: DadosDaMeta = {
  hoje: HOJE,
  partes: [
    // fatura de setembro: só reposição e despesa da empresa entram na meta
    { due_date: "2026-09-30", nature: "reposicao", amount: "1000.00", status: "fechada" },
    { due_date: "2026-09-30", nature: "despesa_empresa", amount: "300.00", status: "fechada" },
    { due_date: "2026-09-30", nature: "pessoal_fernanda", amount: "800.00", status: "fechada" },
    { due_date: "2026-09-30", nature: "estoque_inicial", amount: "5000.00", status: "fechada" },
    // fatura de outubro
    { due_date: "2026-10-30", nature: "reposicao", amount: "700.00", status: "aguardando_fechamento" },
    // fatura de agosto, já paga
    { due_date: "2026-08-30", nature: "reposicao", amount: "400.00", status: "paga" },
  ],
  despesas: [
    { expense_date: "2026-09-05", amount: "200.00", avulsa: true },
    { expense_date: "2026-09-30", amount: "300.00", avulsa: false }, // a mesma despesa da fatura: não conta de novo
    { expense_date: "2026-08-10", amount: "100.00", avulsa: true },
  ],
  vendas: [
    { sale_date: "2026-08-03", sale_value: "500.00", price_tier: "varejo" },
    { sale_date: "2026-08-25", sale_value: "300.00", price_tier: "varejo" },
    { sale_date: "2026-09-02", sale_value: "600.00", price_tier: "varejo" },
    { sale_date: "2026-09-10", sale_value: "400.00", price_tier: "consignado" },
    { sale_date: "2026-09-12", sale_value: "9999.00", price_tier: "atacado", commission_pct: 20 }, // atacado não é vendido
    { sale_date: "2026-09-15", sale_value: "777.00", price_tier: "varejo", status: "cancelada" },
  ],
  entradas: [
    { date: "2026-08-05", amount: "450.00" },
    { date: "2026-08-28", amount: "250.00" },
    { date: "2026-09-02", amount: "200.00" },
    { date: "2026-09-10", amount: "300.00" },
    { date: "2026-09-18", amount: "400.00" },
  ],
};

describe("calendário", () => {
  it("dias do mês e soma de meses", () => {
    expect(diasNoMes("2026-02")).toBe(28);
    expect(diasNoMes("2028-02")).toBe(29);
    expect(diasNoMes("2026-09")).toBe(30);
    expect(somarMeses("2026-11", 3)).toBe("2027-02");
    expect(somarMeses("2026-01", -1)).toBe("2025-12");
  });

  it("o dia da meta é 30, ou o último dia em fevereiro", () => {
    expect(diaDaMeta("2026-09")).toBe("2026-09-30");
    expect(diaDaMeta("2026-10")).toBe("2026-10-30");
    expect(diaDaMeta("2026-02")).toBe("2026-02-28");
  });
});

describe("meta do mês", () => {
  it("soma fatura (reposição + despesa da empresa) e despesas avulsas", () => {
    const m = metaDoMes("2026-09", DADOS.partes, DADOS.despesas);
    expect(m.faturaCents).toBe(130000); // 1000 + 300, sem pessoal e sem estoque inicial
    expect(m.avulsasCents).toBe(20000); // a despesa de 300 já está na fatura
    expect(m.totalCents).toBe(150000);
    expect(m.faturaPagaCents).toBe(0);
  });

  it("fatura paga continua na meta do mês, marcada como paga", () => {
    const m = metaDoMes("2026-08", DADOS.partes, DADOS.despesas);
    expect(m.totalCents).toBe(40000 + 10000);
    expect(m.faturaPagaCents).toBe(40000);
  });

  it("mês sem nada não tem meta", () => {
    expect(metaDoMes("2026-11", DADOS.partes, DADOS.despesas).totalCents).toBe(0);
  });
});

describe("vendido e entrou", () => {
  it("vendido ignora atacado e cancelada; dá para cortar em um dia", () => {
    expect(vendidoNoMes(DADOS.vendas, "2026-09")).toBe(100000);
    expect(vendidoNoMes(DADOS.vendas, "2026-09", 5)).toBe(60000);
    expect(vendidoNoMes(DADOS.vendas, "2026-08")).toBe(80000);
  });

  it("entrou soma as entradas do mês", () => {
    expect(entrouNoMes(DADOS.entradas, "2026-09")).toBe(90000);
    expect(entrouNoMes(DADOS.entradas, "2026-09", 10)).toBe(50000);
  });

  it("variação usa porcentagem inteira e não divide por zero", () => {
    expect(variacao(125, 100)).toBe(25);
    expect(variacao(50, 100)).toBe(-50);
    expect(variacao(10, 0)).toBeNull();
  });
});

describe("situação do mês", () => {
  it("passado, atual e futuro", () => {
    expect(situacaoDoMes("2026-08", HOJE, 50000, 70000)).toBe("batida");
    expect(situacaoDoMes("2026-08", HOJE, 50000, 10000)).toBe("nao_batida");
    expect(situacaoDoMes("2026-09", HOJE, 150000, 90000)).toBe("em_andamento");
    expect(situacaoDoMes("2026-09", HOJE, 150000, 150000)).toBe("batida");
    expect(situacaoDoMes("2026-10", HOJE, 70000, 0)).toBe("futuro");
    expect(situacaoDoMes("2026-07", HOJE, 0, 0)).toBe("sem_meta");
  });
});

describe("tabela mês a mês", () => {
  it("vai do primeiro mês com movimento até 2 meses à frente", () => {
    expect(mesesDaTabela(DADOS)).toEqual(["2026-08", "2026-09", "2026-10", "2026-11"]);
  });

  it("no máximo 5 meses para trás", () => {
    const antigos: DadosDaMeta = { ...DADOS, vendas: [{ sale_date: "2025-01-10", sale_value: "10", price_tier: "varejo" }] };
    expect(mesesDaTabela(antigos)[0]).toBe("2026-04");
  });

  it("sem nenhum dado, mostra o mês atual e os dois seguintes", () => {
    const vazio: DadosDaMeta = { hoje: HOJE, partes: [], despesas: [], vendas: [], entradas: [] };
    expect(mesesDaTabela(vazio)).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("monta cada linha com saldo e variação", () => {
    const linhas = resumoMensal(DADOS);
    const set = linhas.find((l) => l.mes === "2026-09")!;
    expect(set).toMatchObject({
      faturaCents: 130000,
      avulsasCents: 20000,
      metaCents: 150000,
      vendidoCents: 100000,
      entrouCents: 90000,
      saldoCents: 90000 - 150000,
      situacao: "em_andamento",
      variacaoVendido: 25, // 1000 contra 800
    });
    const ago = linhas.find((l) => l.mes === "2026-08")!;
    expect(ago).toMatchObject({ metaCents: 50000, entrouCents: 70000, saldoCents: 20000, situacao: "batida", variacaoVendido: null });
    expect(linhas.find((l) => l.mes === "2026-10")).toMatchObject({ metaCents: 70000, situacao: "futuro" });
  });
});

describe("ritmo do mês", () => {
  it("médias por dia, o que falta e o que precisa entrar por dia", () => {
    const r = ritmoDoMes(DADOS, 50000);
    expect(r.diasPassados).toBe(19);
    expect(r.diasRestantes).toBe(11);
    expect(r.metaCents).toBe(150000);
    expect(r.entrouCents).toBe(90000);
    expect(r.faltaCents).toBe(60000);
    expect(r.mediaVendaPorDia).toBe(Math.round(100000 / 19));
    expect(r.mediaEntradaPorDia).toBe(Math.round(90000 / 19));
    expect(r.necessidadePorDia).toBe(Math.ceil(60000 / 11));
    expect(r.vendasEquivalentes).toBe(2); // 600 de falta, ticket de 500
    expect(r.projecaoEntradaCents).toBe(90000 + Math.round(90000 / 19) * 11);
    expect(r.vaiBater).toBe(r.projecaoEntradaCents >= 150000);
    expect(r.projecaoVendidoCents).toBe(Math.round(100000 / 19) * 30);
  });

  it("meta batida: nada falta e a sobra aparece", () => {
    const r = ritmoDoMes({ ...DADOS, entradas: [{ date: "2026-09-03", amount: "1800.00" }] }, 50000);
    expect(r.faltaCents).toBe(0);
    expect(r.sobraCents).toBe(30000);
    expect(r.necessidadePorDia).toBeNull();
    expect(r.vendasEquivalentes).toBeNull();
    expect(r.vaiBater).toBe(true);
  });

  it("no próprio dia 30, a necessidade é o que falta hoje", () => {
    const r = ritmoDoMes({ ...DADOS, hoje: "2026-09-30" }, 50000);
    expect(r.diasRestantes).toBe(0);
    expect(r.necessidadePorDia).toBe(60000);
  });

  it("sem meta lançada, não há necessidade nem previsão de bater", () => {
    const r = ritmoDoMes({ ...DADOS, partes: [], despesas: [] }, 50000);
    expect(r.metaCents).toBe(0);
    expect(r.necessidadePorDia).toBeNull();
    expect(r.vaiBater).toBe(false);
  });
});

describe("gráfico acumulado do mês", () => {
  it("real até hoje, projeção depois, até o dia 30", () => {
    const r = ritmoDoMes(DADOS, 50000);
    const pontos = acumuladoDoMes(DADOS, r);
    expect(pontos).toHaveLength(30);
    expect(pontos[0]).toEqual({ dia: 1, real: 0, projetado: null });
    expect(pontos[1].real).toBe(20000); // dia 2
    expect(pontos[9].real).toBe(50000); // dia 10
    expect(pontos[18]).toEqual({ dia: 19, real: 90000, projetado: 90000 }); // hoje
    expect(pontos[19].real).toBeNull();
    expect(pontos[19].projetado).toBe(90000 + r.mediaEntradaPorDia);
    expect(pontos[29].projetado).toBe(r.projecaoEntradaCents);
  });
});

describe("comparativo até o mesmo dia", () => {
  it("compara o mês atual até hoje com o mês anterior até o mesmo dia", () => {
    const c = comparativoAteHoje(DADOS);
    expect(c.dia).toBe(19);
    expect(c.vendidoAtual).toBe(100000);
    expect(c.vendidoAnterior).toBe(50000); // só a venda de 03/08; a de 25/08 vem depois do dia 19
    expect(c.variacaoVendido).toBe(100);
    expect(c.entrouAtual).toBe(90000);
    expect(c.entrouAnterior).toBe(45000);
    expect(c.variacaoEntrou).toBe(100);
  });

  it("mês anterior sem dados: variação vazia", () => {
    expect(comparativoAteHoje({ ...DADOS, vendas: [], entradas: [] }).variacaoVendido).toBeNull();
  });
});

describe("tendência", () => {
  const mensal = (valores: number[]) =>
    valores.map((v, i) => ({ sale_date: `2026-0${i + 1}-10`, sale_value: String(v), price_tier: "varejo" }));

  it("com menos de 3 meses fechados, diz que ainda é cedo", () => {
    expect(tendenciaDasVendas(DADOS.vendas, HOJE).estado).toBe("poucos_meses");
    expect(tendenciaDasVendas([], HOJE)).toMatchObject({ estado: "poucos_meses", mesesUsados: 0, previsaoProximoMesCents: null });
  });

  it("vendas subindo mês a mês", () => {
    const t = tendenciaDasVendas(mensal([1000, 1200, 1400, 1600, 1800, 2000, 2200, 2400]), "2026-09-19", 6);
    expect(t.estado).toBe("subindo");
    expect(t.mesesUsados).toBe(6);
    expect(t.inclinacaoCents).toBe(20000);
    expect(t.previsaoProximoMesCents).toBe(260000); // 2600: seguindo a reta de mar a ago
  });

  it("vendas caindo", () => {
    const t = tendenciaDasVendas(mensal([2000, 1800, 1600, 1400]), "2026-05-20");
    expect(t.estado).toBe("caindo");
    expect(t.previsaoProximoMesCents).toBe(120000); // 1200
  });

  it("vendas parecidas: estável", () => {
    const t = tendenciaDasVendas(mensal([1000, 1010, 990, 1005]), "2026-05-20");
    expect(t.estado).toBe("estavel");
  });

  it("a previsão nunca fica negativa", () => {
    const t = tendenciaDasVendas(mensal([300, 200, 100, 10]), "2026-05-20");
    expect(t.previsaoProximoMesCents).toBeGreaterThanOrEqual(0);
  });
});
