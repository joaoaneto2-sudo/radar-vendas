import { describe, expect, it } from "vitest";
import { dinheiroNaConta } from "../../lib/dinheiro-na-conta";
import { montarRelatorioDoDia } from "../../lib/relatorio-do-dia";

const venda = (sale_date: string, sale_value: string, payment_method: string) => ({
  sale_date, sale_value, price_tier: "varejo", status: "ativa", payment_method,
});
// R$ 1.000 vendidos: R$ 250 à vista (25%), R$ 750 parcelados.
const vendas = [
  venda("2026-11-04", "250", "Pix à vista"),
  venda("2026-11-05", "750", "Crédito parcelado"),
];
const cartoes = [{ nome: "Santander", totalCents: 1300000, parte: 0.9, vence: "2026-12-02" }];
const saldo = { date: "2026-11-17", cents: -240000, conta: "Santander" };

describe("dinheiro que cai na conta", () => {
  const d = dinheiroNaConta({
    dia: "2026-11-17",
    saldo,
    vendas,
    parcelas: [
      { due_date: "2026-11-10", amount: "250" }, // antes do saldo: já está no banco
      { due_date: "2026-12-05", amount: "250" }, // cai em 05/12, depois da fatura
      { due_date: "2026-11-25", amount: "250" },
    ],
    comissoes: [{ date: "2026-11-14", cents: 5000 }], // 5% do vendido
    cartoes,
    mediaPorDiaCents: 100000, // R$ 1.000 por dia
    inicio: "2026-11-01",
  });
  const [s] = d.passos;

  it("parte à vista e parte de comissão pelo histórico", () => {
    expect(d.parteAVista).toBe(0.25);
    expect(d.parteComissao).toBe(0.05);
  });
  it("só entram as parcelas entre o saldo e o vencimento", () => {
    expect(s.parcelasCents).toBe(25000);
  });
  it("vendas novas: só a parte à vista entra; comissões saem", () => {
    expect(s.diasDeVenda).toBe(11); // 18-21, 24-28/11, 01-02/12
    expect(s.vendasAVistaCents).toBe(275000);
    expect(s.comissoesCents).toBe(55000);
    expect(s.noVencimentoCents).toBe(-240000 + 25000 + 275000 - 55000);
    expect(s.depoisDePagarCents).toBe(5000 - 1300000);
  });
  it("quanto precisa vender à vista por dia", () => {
    // falta = 13.000 − (−2.400 + 250 − 550) = 15.700 → em 11 dias
    expect(s.precisaAVistaPorDiaCents).toBe(Math.ceil(1570000 / 11));
  });
});

describe("relatório mostra o dinheiro na conta", () => {
  it("aparece a partir do dia do saldo", () => {
    const texto = montarRelatorioDoDia({
      pagamentos: [],
      saldo,
      dia: "2026-11-17",
      vendas,
      aReceber: [],
      meta: { hoje: "2026-11-17", partes: [], despesas: [], vendas, entradas: [] },
    });
    expect(texto).toContain("🏦 *Dinheiro na conta Santander*");
    expect(texto).toMatch(/Saldo informado em 17\/11: -R\$\s2\.400,00/);
    expect(texto).toContain("por dia em venda À VISTA");
  });
});
