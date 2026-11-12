import { describe, expect, it } from "vitest";
import { montarRelatorioDoDia, type DadosDoRelatorio } from "../../lib/relatorio-do-dia";

const DIA = "2026-11-07";

function dados(parcial: Partial<DadosDoRelatorio> = {}): DadosDoRelatorio {
  const vendas = parcial.vendas ?? [
    { sale_date: DIA, sale_value: "330.00", price_tier: "varejo", status: "ativa", payment_method: "Pix à vista", client_name: "Amanda", cost: null },
    { sale_date: DIA, sale_value: "100.00", price_tier: "varejo", status: "cancelada", payment_method: "Pix à vista", client_name: "Cancelada", cost: "10" },
    { sale_date: DIA, sale_value: "640.00", price_tier: "atacado", status: "ativa", payment_method: "Crédito", client_name: "Jacqueline", cost: null },
    { sale_date: "2026-11-05", sale_value: "300.00", price_tier: "varejo", status: "ativa", payment_method: "Crédito parcelado", client_name: "Vilma", cost: "120" },
    { sale_date: "2026-10-29", sale_value: "2000.00", price_tier: "varejo", status: "ativa", payment_method: "Crédito parcelado", client_name: "Kika", cost: null },
  ];
  return {
    dia: DIA,
    vendas,
    aReceber: parcial.aReceber ?? [
      { due_date: "2026-10-30", amount: "479.00", client_name: "Michele" },
      { due_date: "2026-11-08", amount: "100.00", client_name: "Vilma" },
      { due_date: "2026-11-30", amount: "70.00", client_name: "Jassy" },
    ],
    meta: parcial.meta ?? {
      hoje: DIA,
      partes: [{ due_date: "2026-11-10", nature: "reposicao", amount: "1000.00", status: "aberta" }],
      despesas: [],
      vendas,
      entradas: [{ date: "2026-11-04", amount: "600.00" }],
    },
  };
}

describe("relatório do dia para o grupo", () => {
  const texto = montarRelatorioDoDia(dados());

  it("cabeçalho com dia da semana e data", () => {
    expect(texto.split("\n")[0]).toBe("📊 *RELATÓRIO DO DIA* · sábado, 07/11");
  });

  it("vendas de hoje: só ativas, varejo listado e atacado à parte", () => {
    expect(texto).toContain("🛍️ *Hoje:* 1 venda · *R$ 330,00*");
    expect(texto).toContain("• Amanda: R$ 330,00 (Pix à vista)");
    expect(texto).not.toContain("Cancelada");
    expect(texto).toContain("• Atacado: 1 pedido · R$ 640,00 (pago ao fabricante)");
  });

  it("mês até hoje não mistura outubro", () => {
    expect(texto).toContain("📅 *Novembro até hoje:* R$ 630,00 em 2 vendas");
  });

  it("a meta antiga (contas do mês) saiu: agora é a meta dos cartões", () => {
    expect(texto).not.toContain("🎯 *Meta do mês:*");
    expect(texto).toContain("💳 *Meta dos cartões*");
  });

  it("a receber: atrasadas e próximos 7 dias, sem o que vence depois", () => {
    expect(texto).toContain("🔴 Atrasado: R$ 479,00 (1 parcela)");
    expect(texto).toContain("• Michele: R$ 479,00 (venceu 30/10)");
    expect(texto).toContain("• Vilma: R$ 100,00 (amanhã)");
    expect(texto).not.toContain("Jassy");
  });

  it("avisa das vendas do mês sem custo", () => {
    expect(texto).toContain("⚠️ 1 venda do mês sem custo no Radar");
  });

  it("dia sem vendas e sem contas", () => {
    const vazio = montarRelatorioDoDia(dados({ vendas: [], aReceber: [], meta: { hoje: DIA, partes: [], despesas: [], vendas: [], entradas: [] } }));
    expect(vazio).toContain("🛍️ *Hoje:* nenhuma venda lançada.");
    expect(vazio).toContain("Nada vencido nem vencendo nos próximos 7 dias.");
    expect(vazio).not.toContain("Meta do mês");
  });
});

describe("relatório do dia: clientes", () => {
  const vendas = [
    { sale_date: "2026-11-07", sale_value: "100", price_tier: "varejo", status: "ativa", client_id: 1, client_name: "Ana" },
    { sale_date: "2026-11-02", sale_value: "100", price_tier: "varejo", status: "ativa", client_id: 1, client_name: "Ana" },
    { sale_date: "2026-11-03", sale_value: "100", price_tier: "atacado", status: "ativa", client_id: 2, client_name: "Bia" },
    { sale_date: "2026-11-04", sale_value: "100", price_tier: "varejo", status: "cancelada", client_id: 3, client_name: "Carla" },
    { sale_date: "2026-10-10", sale_value: "100", price_tier: "varejo", status: "ativa", client_id: null, client_name: "Sem Cadastro" },
    { sale_date: "2026-09-10", sale_value: "100", price_tier: "varejo", status: "ativa", client_id: 3, client_name: "Carla" },
  ];
  const clientes = [
    { id: 1, full_name: "Ana", phone: "81999990000", birthday: "1990-11-07" },
    { id: 2, full_name: "Bia", phone: null, birthday: "1985-11-10" },
    { id: 3, full_name: "Carla", phone: "81988887777", birthday: null },
    { id: 4, full_name: "Dora", phone: "719", birthday: null },
    { id: 5, full_name: "Eva", phone: "81977776666", birthday: "2000-11-25" },
    { id: 6, full_name: "Fê", phone: "81977776666", birthday: "2000-12-01" },
  ];
  const texto = montarRelatorioDoDia({
    dia: DIA,
    vendas,
    aReceber: [],
    meta: { hoje: DIA, partes: [], despesas: [], vendas, entradas: [] },
    clientes,
  });

  it("total cadastrado e quem comprou em cada um dos três meses (sem canceladas)", () => {
    expect(texto).toContain("👥 *Clientes:* 6 cadastrados");
    expect(texto).toContain("🛒 Compraram: novembro 2 · outubro 1 · setembro 1");
  });

  it("lista quem falta completar e o que falta", () => {
    expect(texto).toContain("📝 Cadastro a completar: 3");
    expect(texto).toContain("• Sem telefone e aniversário: Dora");
    expect(texto).toContain("• Sem telefone: Bia");
    expect(texto).toContain("• Sem aniversário: Carla");
  });

  it("aniversariantes de hoje, dos próximos 7 dias e do mês", () => {
    expect(texto).toContain("• Hoje: Ana");
    expect(texto).toContain("• Próximos 7 dias: Bia (10/11)");
    expect(texto).toContain("• No mês: Ana (07), Bia (10), Eva (25)");
    expect(texto).not.toContain("Fê (");
  });

  it("aniversário na virada do mês entra nos próximos 7 dias", () => {
    const fimDoMes = montarRelatorioDoDia({
      dia: "2026-11-28",
      vendas: [],
      aReceber: [],
      meta: { hoje: "2026-11-28", partes: [], despesas: [], vendas: [], entradas: [] },
      clientes,
    });
    expect(fimDoMes).toContain("• Próximos 7 dias: Fê (01/12)");
  });

  it("sem a lista de clientes, a seção não aparece", () => {
    expect(montarRelatorioDoDia(dados())).not.toContain("Clientes:");
  });
});

describe("relatório do dia: TOP FIVE", () => {
  const v = (sale_date: string, sale_value: string, product_type: string, supplier: string, extra = {}) => ({
    sale_date, sale_value, product_type, supplier, price_tier: "varejo", status: "ativa", ...extra,
  });
  const vendas = [
    v("2026-11-02", "300", "1 brinco pizza dourado", "MILLANO"),
    v("2026-11-03", "200", "Brinco pizza dourado", "Milano"),
    v("2026-11-04", "916", "7 peças", "vários"),
    v("2026-11-05", "478", "choker", "Zarpelon"),
    v("2026-11-05", "100", "anel", "Bia Belluti"),
    v("2026-11-06", "90", "anel", "Bia Belutti"),
    v("2026-11-06", "50", "pulseira", "Glamour"),
    v("2026-11-06", "40", "colar", "Max"),
    v("2026-11-06", "30", "tornozeleira", "Outro"),
    v("2026-11-06", "999", "cancelada", "Cancelada", { status: "cancelada" }),
    v("2026-11-20", "5000", "depois de hoje", "Futuro"),
    v("2026-10-16", "740", "13 peças", "MILLANO", { price_tier: "atacado" }),
    v("2026-09-24", "513", "conjunto", "Bia Belluti"),
  ];

  it("junta grafias, tira quantidade e genéricos, ordena por valor e corta em 5", async () => {
    const { topDoMes } = await import("../../lib/relatorio-do-dia");
    const pecas = topDoMes(vendas, "2026-11", "2026-11-07", (x) => String(x.product_type).replace(/^\d+\s*/, ""));
    expect(pecas.map((p) => [p.nome, p.vendas, p.cents])).toEqual([
      ["Brinco pizza dourado", 2, 50000],
      ["Choker", 1, 47800],
      ["Anel", 2, 19000],
      ["Pulseira", 1, 5000],
      ["Colar", 1, 4000],
    ]);
    const forn = topDoMes(vendas, "2026-11", "2026-11-07", (x) => String(x.supplier));
    expect(forn.map((f) => f.nome)).toEqual(["Milano", "Zarpelon", "Bia Belluti", "Glamour", "Max"]);
  });

  it("texto com os três meses, peças e fornecedores", () => {
    const texto = montarRelatorioDoDia({
      dia: DIA,
      vendas,
      aReceber: [],
      meta: { hoje: DIA, partes: [], despesas: [], vendas, entradas: [] },
    });
    expect(texto).toContain("🏆 *TOP FIVE · Peças*");
    expect(texto).toContain("🏆 *TOP FIVE · Fornecedores*");
    expect(texto).toContain("🥇 Brinco pizza dourado · 2 vendas · R$ 500,00");
    expect(texto).toContain("🥇 Milano · 2 vendas · R$ 500,00");
    expect(texto).toContain("*Outubro*");
    expect(texto).toContain("🥇 Millano · 1 venda · R$ 740,00");
    expect(texto).toContain("🥇 Conjunto · 1 venda · R$ 513,00");
    expect(texto).not.toContain("Cancelada");
    expect(texto).not.toContain("Futuro");
  });
});

describe("relatório do dia: até quando", () => {
  it("mostra a hora do relatório e a última venda lida, no horário de Recife", () => {
    const texto = montarRelatorioDoDia({
      ...dados(),
      geradoEm: "2026-11-07T23:00:00Z",
      ultimaVendaLida: { postadaEm: "2026-11-07T19:53:16Z", cliente: "Nelia" },
    });
    const linhas = texto.split("\n");
    expect(linhas[1]).toBe("🕒 Dados até 07/11 às 20:00");
    expect(linhas[2]).toBe("✅ Última venda do grupo lida: 07/11 às 16:53 (Nelia)");
  });

  it("sem essas informações, não mostra as linhas", () => {
    expect(montarRelatorioDoDia(dados())).not.toContain("Dados até");
  });
});

describe("relatório do dia: ritmo do mês (meta R$ 1.000 por dia)", () => {
  const venda = (sale_date: string, sale_value: string, extra = {}) => ({
    sale_date, sale_value, price_tier: "varejo", status: "ativa", ...extra,
  });
  // Novembro/2026: dia 1 é domingo. Até sáb 07: dias de trabalho ter 03 a sáb 07 = 5.
  const vendas = [
    venda("2026-11-02", "500"), // segunda com venda: conta +1 dia
    venda("2026-11-04", "1000"),
    venda("2026-11-07", "1200"),
    venda("2026-11-07", "300"),
    venda("2026-11-06", "999", { status: "cancelada" }),
    venda("2026-11-05", "5000", { price_tier: "atacado" }),
    venda("2026-10-31", "800"),
  ];

  it("dia trabalhado = dia com venda lançada", async () => {
    const { ritmoDoMesDiario } = await import("../../lib/relatorio-do-dia");
    const r = ritmoDoMesDiario(vendas, "2026-11-07");
    expect(r.diasTrabalhados).toBe(3); // 02, 04 e 07/11 tiveram venda
    // depois de 07/11: ter 10 a sáb 14, 17-21, 24-28 = 15 dias
    expect(r.diasRestantes).toBe(15);
    expect(r.vendidoCents).toBe(300000);
    expect(r.hojeCents).toBe(150000);
    expect(r.mediaPorDiaCents).toBe(100000);
    expect(r.ticketMedioCents).toBe(75000);
  });

  it("texto da seção", () => {
    const texto = montarRelatorioDoDia({
      dia: "2026-11-07",
      vendas,
      aReceber: [],
      meta: { hoje: "2026-11-07", partes: [], despesas: [], vendas, entradas: [] },
    });
    expect(texto).toContain("📈 *Ritmo do mês*");
    expect(texto).not.toContain("meta R$ 1.000,00 por dia");
    expect(texto).toContain("• Hoje: R$ 1.500,00");
    expect(texto).toContain("• Média por dia: R$ 1.000,00 (3 dias de trabalho)");
    expect(texto).toContain("• Ticket médio: R$ 750,00 (4 vendas)");
    expect(texto).not.toContain("Para bater a meta");
  });

  it("segunda sem venda é folga", () => {
    const texto = montarRelatorioDoDia({
      dia: "2026-11-09",
      vendas,
      aReceber: [],
      meta: { hoje: "2026-11-09", partes: [], despesas: [], vendas, entradas: [] },
    });
    expect(texto).toContain("• Hoje: dia de folga, sem vendas");
  });
});
