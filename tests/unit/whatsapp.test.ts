import { describe, expect, it } from "vitest";
import { buildWhatsAppMessage, type Sale } from "../../lib/format";

const BASE: Sale = {
  sale_date: "2026-09-19",
  sale_type: "Física",
  seller: "Fernanda",
  product_type: "Anel Solitário",
  manufacturer: "Bia Belutti",
  supplier: "Fornecedor X",
  warranty: "Vitalícia",
  cost: 60,
  sale_value: 200,
  payment_method: "Pix à vista",
  client_name: "Maria da Silva",
  client_nickname: "Mari",
  client_city: "Centro",
  client_phone: "11999990000",
};

describe("texto para colar no WhatsApp", () => {
  it("venda comum mantém o modelo de sempre, sem linhas de desconto ou cashback", () => {
    const texto = buildWhatsAppMessage(BASE);
    expect(texto).toContain("🚀 VENDA REALIZADA");
    expect(texto).toContain("📆 Data da venda: 19/09/2026");
    expect(texto).toContain("💲 Valor da venda: ");
    expect(texto).toContain("Nome completo: Maria da Silva");
    expect(texto).not.toContain("Desconto");
    expect(texto).not.toContain("Cashback");
  });

  it("desconto: mostra o valor pago, a porcentagem e o valor de tabela", () => {
    const texto = buildWhatsAppMessage({ ...BASE, sale_value: 180, gross_value: 200, discount_pct: "10.00" });
    const linhas = texto.split("\n");
    const i = linhas.findIndex((l) => l.startsWith("💲 Valor da venda"));
    expect(linhas[i]).toContain("180,00");
    expect(linhas[i + 1]).toMatch(/^🏷️ Desconto: 10% \(valor de tabela .*200,00\)$/);
  });

  it("cashback: mostra a porcentagem e o crédito que o cliente ganhou", () => {
    const texto = buildWhatsAppMessage({ ...BASE, cashback_pct: "5.00", cashback_earned: "10.00", gross_value: 200 });
    expect(texto).toMatch(/🎁 Cashback: 5% = .*10,00 para as próximas compras/);
    expect(texto).not.toContain("Desconto");
  });

  it("cashback usado aparece; porcentagem com casas usa vírgula", () => {
    const texto = buildWhatsAppMessage({
      ...BASE,
      sale_value: 170,
      gross_value: 200,
      discount_pct: "12.5",
      cashback_used: "5.00",
    });
    expect(texto).toMatch(/🏷️ Desconto: 12,5%/);
    expect(texto).toMatch(/🎁 Cashback usado: .*5,00/);
  });

  it("não usa travessão", () => {
    const texto = buildWhatsAppMessage({
      ...BASE,
      payment_method: "Pix a prazo",
      installments_count: 2,
      installments_dates: "19/10, 19/11",
      discount_pct: 10,
      gross_value: 200,
    });
    expect(texto).not.toContain("—");
    expect(texto).toContain("(2x, datas: 19/10, 19/11)");
  });
});
