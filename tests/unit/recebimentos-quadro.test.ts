import { describe, expect, it } from "vitest";
import { colunaDe, diasAte, montarQuadro, previsoesDeAtacado, textoDoPrazo, type LinhaDoQuadro } from "../../lib/recebimentos-quadro";
import { computeWholesale } from "../../lib/finance/wholesale";
import type { ReceiptInput, SaleInput } from "../../lib/finance/cascade";

const HOJE = "2026-09-20"; // domingo

const prevista = (expected: string | null, amount: string, kind = "parcela_venda"): LinhaDoQuadro => ({
  kind,
  status: "prevista",
  received_date: null,
  expected_date: expected,
  amount,
});

const recebida = (data: string, amount: string, kind = "parcela_venda"): LinhaDoQuadro => ({
  kind,
  status: "recebida",
  received_date: data,
  expected_date: null,
  amount,
});

describe("em qual coluna cai cada recebimento", () => {
  it("previsto antes de hoje é atrasado", () => {
    expect(colunaDe(prevista("2026-09-19", "10"), HOJE)).toBe("atrasadas");
    expect(colunaDe(prevista("2026-01-01", "10"), HOJE)).toBe("atrasadas");
  });

  it("de hoje até daqui a 6 dias é esta semana", () => {
    expect(colunaDe(prevista("2026-09-20", "10"), HOJE)).toBe("semana");
    expect(colunaDe(prevista("2026-09-26", "10"), HOJE)).toBe("semana");
  });

  it("de 7 dias em diante e sem data são próximas", () => {
    expect(colunaDe(prevista("2026-09-27", "10"), HOJE)).toBe("proximas");
    expect(colunaDe(prevista("2027-01-01", "10"), HOJE)).toBe("proximas");
    expect(colunaDe(prevista(null, "10"), HOJE)).toBe("proximas");
  });

  it("recebido nos últimos 30 dias entra em recebidas; mais antigo fica fora", () => {
    expect(colunaDe(recebida("2026-09-20", "10"), HOJE)).toBe("recebidas");
    expect(colunaDe(recebida("2026-08-21", "10"), HOJE)).toBe("recebidas"); // exatamente 30 dias
    expect(colunaDe(recebida("2026-08-20", "10"), HOJE)).toBeNull(); // 31 dias
  });

  it("aporte de sócio nunca entra no quadro", () => {
    expect(colunaDe(recebida("2026-09-20", "500", "aporte_socio"), HOJE)).toBeNull();
    expect(colunaDe(prevista("2026-09-21", "500", "aporte_socio"), HOJE)).toBeNull();
  });
});

describe("montar o quadro", () => {
  const linhas = [
    prevista("2026-09-25", "100.00"),
    prevista("2026-09-10", "50.50"),
    prevista("2026-09-05", "20.00", "comissao_fabricante"),
    prevista(null, "30.00", "outra_receita"),
    prevista("2026-10-15", "70.00"),
    prevista("2026-09-21", "40.00"),
    recebida("2026-09-18", "200.00"),
    recebida("2026-09-19", "80.00"),
    recebida("2026-06-01", "999.00"), // antigo demais
    recebida("2026-09-20", "1000.00", "aporte_socio"), // aporte fica de fora
  ];
  const q = montarQuadro(linhas, HOJE);

  it("soma o total de cada coluna em centavos", () => {
    expect(q.atrasadas.totalCents).toBe(5050 + 2000);
    expect(q.semana.totalCents).toBe(10000 + 4000);
    expect(q.proximas.totalCents).toBe(3000 + 7000);
    expect(q.recebidas.totalCents).toBe(20000 + 8000);
  });

  it("ordena: quem vence primeiro vem primeiro, sem data vai para o fim, recebidas mais novas primeiro", () => {
    expect(q.atrasadas.cartoes.map((c) => c.expected_date)).toEqual(["2026-09-05", "2026-09-10"]);
    expect(q.semana.cartoes.map((c) => c.expected_date)).toEqual(["2026-09-21", "2026-09-25"]);
    expect(q.proximas.cartoes.map((c) => c.expected_date)).toEqual(["2026-10-15", null]);
    expect(q.recebidas.cartoes.map((c) => c.received_date)).toEqual(["2026-09-19", "2026-09-18"]);
  });

  it("sem nada, as quatro colunas ficam vazias e com total zero", () => {
    const vazio = montarQuadro([], HOJE);
    for (const c of [vazio.atrasadas, vazio.semana, vazio.proximas, vazio.recebidas]) {
      expect(c).toEqual({ cartoes: [], totalCents: 0 });
    }
  });
});

describe("texto do prazo", () => {
  it("diz o prazo em palavras", () => {
    expect(diasAte("2026-09-25", HOJE)).toBe(5);
    expect(textoDoPrazo(prevista("2026-09-20", "1"), HOJE)).toBe("Vence hoje");
    expect(textoDoPrazo(prevista("2026-09-21", "1"), HOJE)).toBe("Vence amanhã");
    expect(textoDoPrazo(prevista("2026-09-25", "1"), HOJE)).toBe("Vence em 5 dias");
    expect(textoDoPrazo(prevista("2026-09-19", "1"), HOJE)).toBe("Atrasada há 1 dia");
    expect(textoDoPrazo(prevista("2026-09-10", "1"), HOJE)).toBe("Atrasada há 10 dias");
    expect(textoDoPrazo(prevista(null, "1"), HOJE)).toBe("Sem data");
    expect(textoDoPrazo(recebida("2026-09-20", "1"), HOJE)).toBe("Recebida hoje");
    expect(textoDoPrazo(recebida("2026-09-19", "1"), HOJE)).toBe("Recebida ontem");
    expect(textoDoPrazo(recebida("2026-09-15", "1"), HOJE)).toBe("Recebida há 5 dias");
  });

  it("funciona na virada de mês e de ano", () => {
    expect(diasAte("2027-01-02", "2026-12-30")).toBe(3);
    expect(diasAte("2026-03-01", "2026-02-27")).toBe(2);
  });
});

describe("comissão de atacado prevista pelas vendas", () => {
  const atacado = (id: number, valor: number, estoque: string | null): SaleInput =>
    ({
      id,
      date: "2026-09-12",
      amountCents: valor,
      costsCents: 0,
      tier: "atacado",
      status: "ativa",
      paymentMethod: null,
      label: "Revendedora " + id,
      payments: [],
      manufacturerId: 7,
      manufacturerName: "Bia Belutti",
      commissionPct: 20,
      commissionDays: 15,
      stockReceivedDate: estoque,
    }) as SaleInput;

  it("uma previsão por venda, com a comissão em reais e a data de 15 dias depois do estoque", () => {
    const previsoes = previsoesDeAtacado(computeWholesale([atacado(1, 100000, "2026-09-10"), atacado(2, 50000, null)], HOJE));
    expect(previsoes).toHaveLength(2);
    expect(previsoes[0]).toMatchObject({ source: "atacado", id: 1, amount: "200.00", expected_date: "2026-09-25", manufacturer_id: 7, manufacturer_name: "Bia Belutti", reason: "Comissão prevista da venda de 12/09" });
    expect(previsoes[1]).toMatchObject({ id: 2, amount: "100.00", expected_date: null, reason: "Comissão prevista: aguardando o estoque chegar" });
  });

  it("o que já foi recebido abate as vendas mais antigas e some da previsão", () => {
    const recebido: ReceiptInput = { id: 1, kind: "comissao_fabricante", status: "recebida", receivedDate: "2026-09-18", expectedDate: null, amountCents: 20000, partner: null, manufacturerId: 7, manufacturerName: "Bia Belutti", fromName: null, reason: null };
    const previsoes = previsoesDeAtacado(computeWholesale([atacado(1, 100000, "2026-09-10"), atacado(2, 50000, null)], HOJE, [recebido]));
    expect(previsoes.map((p) => p.id)).toEqual([2]);
  });

  it("fabricante que já tem lembrete lançado à mão não repete a previsão", () => {
    const lembrete: ReceiptInput = { id: 2, kind: "comissao_fabricante", status: "prevista", receivedDate: null, expectedDate: "2026-09-30", amountCents: 30000, partner: null, manufacturerId: 7, manufacturerName: "Bia Belutti", fromName: null, reason: null };
    expect(previsoesDeAtacado(computeWholesale([atacado(1, 100000, "2026-09-10")], HOJE, [lembrete]))).toEqual([]);
  });

  it("sem vendas de atacado, nada a prever", () => {
    expect(previsoesDeAtacado(computeWholesale([], HOJE))).toEqual([]);
  });

  it("as previsões caem nas colunas certas do quadro", () => {
    const previsoes = previsoesDeAtacado(computeWholesale([atacado(1, 100000, "2026-09-10"), atacado(2, 50000, null)], HOJE));
    const q = montarQuadro(previsoes, HOJE);
    expect(q.semana.cartoes.map((p) => p.id)).toEqual([1]);
    expect(q.proximas.cartoes.map((p) => p.id)).toEqual([2]);
    expect(q.semana.totalCents).toBe(20000);
  });
});
