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

  it("meta do mês: entrou x meta e quanto falta", () => {
    expect(texto).toContain("🎯 *Meta do mês:* R$ 1.000,00 · entrou R$ 600,00 (60%)");
    expect(texto).toContain("⏳ Faltam R$ 400,00 até dia 30");
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
