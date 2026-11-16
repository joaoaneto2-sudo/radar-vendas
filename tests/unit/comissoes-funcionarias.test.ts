import { describe, expect, it } from "vitest";
import { lerComissao, pareceComissao } from "../../lib/comissao-whatsapp";
import { comissoesDasDespesas, metaDosCartoes, CARTOES, INICIO_META_CARTOES } from "../../lib/meta-cartoes";
import { montarRelatorioDoDia } from "../../lib/relatorio-do-dia";

describe("lê a comissão postada no grupo", () => {
  it("usa o total depois do =", () => {
    const r = lerComissao("Comissão de hoje 40 + 15 + 7=62");
    expect(r).toMatchObject({ ok: true, totalCents: 6200, conferiu: true });
  });
  it("entende 'Paguei até hoje'", () => {
    expect(lerComissao("Paguei até hoje : 200+78+80=358")).toMatchObject({ ok: true, totalCents: 35800 });
  });
  it("sem =, soma as parcelas", () => {
    expect(lerComissao("comissão 40 + 15,50")).toMatchObject({ ok: true, totalCents: 5550 });
  });
  it("total que não bate com a soma: vale o total e avisa", () => {
    expect(lerComissao("Comissão de hoje 40 + 15 = 60")).toMatchObject({ ok: true, totalCents: 6000, conferiu: false });
  });
  it("ignora mensagens que não são de comissão", () => {
    expect(pareceComissao("Falta colocar as comissões")).toBe(false);
    expect(pareceComissao("Já vou ajustar o app com as comissões e descontos das taxas do cartão")).toBe(false);
    expect(pareceComissao("🚀 VENDA REALIZADA comissão 10")).toBe(false);
    expect(lerComissao("Paguei até hoje de comissão para os funcionários.").ok).toBe(false);
  });
});

const venda = (sale_date: string, sale_value: string) => ({ sale_date, sale_value, price_tier: "varejo", status: "ativa" });
const vendas = [venda("2026-11-03", "1000"), venda("2026-11-14", "1129")];
const despesas = [
  { expense_date: "2026-11-12", amount: "358.00", category: "comissao_funcionarias", avulsa: true },
  { expense_date: "2026-11-14", amount: "62.00", category: "comissao_funcionarias", avulsa: true },
  { expense_date: "2026-11-14", amount: "100.00", category: "embalagem", avulsa: true },
];

describe("meta dos cartões desconta as comissões", () => {
  const comissoes = comissoesDasDespesas(despesas);
  const m = metaDosCartoes(vendas, "2026-11-14", CARTOES, INICIO_META_CARTOES, comissoes);

  it("só despesas da categoria comissão entram", () => {
    expect(comissoes).toEqual([
      { date: "2026-11-12", cents: 35800 },
      { date: "2026-11-14", cents: 6200 },
    ]);
  });
  it("caixa = vendido menos comissões", () => {
    expect(m.vendidoCents).toBe(212900);
    expect(m.comissoesCents).toBe(42000);
    expect(m.acumuladoCents).toBe(170900);
    expect(m.mediaPorDiaCents).toBe(85450);
  });
  it("cada fatura desconta só as comissões do período dela", () => {
    const dez = m.cartoes.find((c) => c.nome === "Riachuelo (dez)")!;
    // desde 14/11: 1.129 vendidos − 62 de comissão = 1.067; 10% = 106,70
    expect(dez.guardadoCents).toBe(10670);
  });
  it("sem comissões, nada muda", () => {
    const sem = metaDosCartoes(vendas, "2026-11-14");
    expect(sem.acumuladoCents).toBe(212900);
    expect(sem.comissoesCents).toBe(0);
  });
});

describe("relatório do dia mostra a comissão", () => {
  const texto = montarRelatorioDoDia({ pagamentos: [],
    dia: "2026-11-14",
    vendas,
    aReceber: [],
    meta: { hoje: "2026-11-14", partes: [], despesas, vendas, entradas: [] },
  });
  it("linha de hoje e linha da meta", () => {
    expect(texto).toContain("Comissão paga às funcionárias hoje: −R$");
    expect(texto).toMatch(/Vendido menos comissão: \*R\$\s1\.067,00\*/);
    expect(texto).toMatch(/Comissões pagas às funcionárias desde 01\/11: −R\$\s420,00/);
    expect(texto).toMatch(/Caixa para os cartões \(vendas menos comissões e pagamentos já feitos\): R\$\s1\.709,00/);
  });
});

describe("pagamentos já feitos saem do caixa", () => {
  const pagamentos = [
    { date: "2026-11-02", cartao: "Santander (02/11)", descricao: "Resto da fatura Santander de 02/11", cents: 50000 },
    { date: "2026-11-13", cartao: "Riachuelo", descricao: "Fatura Riachuelo de 13/11", cents: 129000 },
  ];
  const vendas2 = [venda("2026-11-03", "4000"), venda("2026-11-14", "1000")];
  const m = metaDosCartoes(vendas2, "2026-11-14", CARTOES, INICIO_META_CARTOES, [{ date: "2026-11-14", cents: 6200 }], pagamentos);
  const [riachuelo, santander, dez] = m.cartoes;

  it("caixa = vendido − comissões − pagamentos", () => {
    expect(m.vendidoCents).toBe(500000);
    expect(m.pagamentosCents).toBe(179000);
    expect(m.acumuladoCents).toBe(500000 - 6200 - 179000);
  });
  it("Riachuelo de novembro aparece como paga", () => {
    expect(riachuelo.vencido).toBe(true);
    expect(riachuelo.pagoCents).toBe(129000);
    expect(riachuelo.pagoEm).toBe("2026-11-13");
  });
  it("Santander fica com o caixa que sobra depois da Riachuelo de dezembro", () => {
    expect(dez.guardadoCents).toBe(Math.round((100000 - 6200) * 0.1));
    expect(santander.guardadoCents).toBe(m.acumuladoCents - dez.guardadoCents);
  });
  it("projeção não desconta de novo a fatura já paga", () => {
    const p0 = m.projecaoDoCaixa[0];
    expect(p0.noVencimentoCents - p0.entraCents).toBe(m.acumuladoCents);
  });
});
