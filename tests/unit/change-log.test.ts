import { describe, expect, it } from "vitest";
import { agruparEventos, alteracoesEntre, camposDaLinha, tituloDaLinha, valorLegivel, type LinhaDoLog } from "../../lib/change-log";

const normal = (t: string) => t.replace(/ /g, " ");

let seq = 0;
function linha(p: Partial<LinhaDoLog> & Pick<LinhaDoLog, "table" | "op" | "before">): LinhaDoLog {
  seq += 1;
  return { id: seq, at: "2026-09-21T12:00:00.000Z", txId: "100", rowId: 1, after: null, userName: "João", ...p };
}

describe("valores legíveis", () => {
  it("dinheiro em reais, data em dia/mês/ano, porcentagem com vírgula, vazio quando não há nada", () => {
    expect(normal(valorLegivel("amount", 1234.5))).toBe("R$ 1.234,50");
    expect(normal(valorLegivel("sale_value", "870.00"))).toBe("R$ 870,00");
    expect(valorLegivel("sale_date", "2026-09-04")).toBe("04/09/2026");
    expect(valorLegivel("cancelled_at", "2026-09-21T10:00:00.000Z")).toBe("21/09/2026");
    expect(valorLegivel("discount_pct", 7.5)).toBe("7,5%");
    expect(valorLegivel("client_name", null)).toBe("vazio");
    expect(valorLegivel("client_name", "")).toBe("vazio");
    expect(valorLegivel("status", "cancelada")).toBe("Cancelada");
    expect(valorLegivel("kind", "outra_receita")).toBe("Outra receita");
    expect(valorLegivel("nature", "estoque_inicial")).toBe("Estoque inicial");
    expect(valorLegivel("category", "Frete")).toBe("Frete");
  });
});

describe("o que mudou numa edição", () => {
  it("lista só os campos que mudaram, com o nome em português", () => {
    const antes = { id: 1, expense_date: "2026-09-01", description: "Frete", amount: 30, category: null, created_at: "2026-09-01T00:00:00Z" };
    const depois = { ...antes, amount: 35, category: "Envio" };
    expect(alteracoesEntre(antes, depois).map((a) => [a.rotulo, normal(a.antes), normal(a.depois)])).toEqual([
      ["Valor", "R$ 30,00", "R$ 35,00"],
      ["Categoria", "vazio", "Envio"],
    ]);
  });

  it("não lista o que não mudou nem id e datas de criação", () => {
    const l = { id: 1, amount: 10, created_at: "2026-01-01T00:00:00Z" };
    expect(alteracoesEntre(l, { ...l, created_at: "2026-02-02T00:00:00Z" })).toEqual([]);
  });

  it("o que existia numa linha apagada: sem ligações (_id) e sem campos vazios", () => {
    const campos = camposDaLinha({ id: 3, description: "Frete", amount: 30, notes: null, client_id: 9, expense_date: "2026-09-01" });
    expect(campos.map((c) => [c.rotulo, normal(c.valor)])).toEqual([
      ["Descrição", "Frete"],
      ["Valor", "R$ 30,00"],
      ["Data", "01/09/2026"],
    ]);
  });
});

describe("títulos", () => {
  it("cada tipo de registro tem uma frase que o identifica", () => {
    expect(normal(tituloDaLinha("sales", { client_name: "Giovana", sale_value: 82.5, sale_date: "2026-09-02" }))).toBe("Venda de Giovana, R$ 82,50, em 02/09/2026");
    expect(normal(tituloDaLinha("expenses", { description: "Frete", amount: 30 }))).toBe('Despesa "Frete", R$ 30,00');
    expect(normal(tituloDaLinha("card_invoices", { description: "Nubank", total_amount: 1000 }))).toBe('Fatura do cartão "Nubank", R$ 1.000,00');
    expect(normal(tituloDaLinha("fund_payments", { amount: 200, paid_date: "2026-09-10" }))).toBe("Pagamento do fundo, R$ 200,00, em 10/09/2026");
    expect(normal(tituloDaLinha("receipts", { from_name: "Bia Belutti", amount: 500 }))).toBe("Recebimento de Bia Belutti, R$ 500,00");
    expect(normal(tituloDaLinha("sale_payments", { amount: 100, due_date: "2026-10-01" }))).toBe("Parcela de R$ 100,00, vence em 01/10/2026");
  });
});

describe("agrupar em eventos", () => {
  it("uma edição vira um evento com o antes e o depois", () => {
    const eventos = agruparEventos([
      linha({
        table: "expenses",
        op: "UPDATE",
        before: { id: 1, description: "Frete", amount: 30 },
        after: { id: 1, description: "Frete", amount: 35 },
      }),
    ]);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: "despesa", acao: "editada", userName: "João" });
    expect(eventos[0].alteracoes).toHaveLength(1);
    expect(eventos[0].apagado).toEqual([]);
  });

  it("apagar uma venda leva as parcelas junto: um evento, parcelas como relacionados", () => {
    const eventos = agruparEventos([
      linha({ table: "sale_payments", op: "DELETE", before: { id: 5, amount: 100, due_date: "2026-10-01" } }),
      linha({ table: "sales", op: "DELETE", before: { id: 2, client_name: "Kika", sale_value: 200, sale_date: "2026-09-11" } }),
      linha({ table: "sale_payments", op: "DELETE", before: { id: 6, amount: 100, due_date: "2026-11-01" } }),
    ]);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: "venda", acao: "apagada" });
    expect(normal(eventos[0].titulo)).toContain("Venda de Kika");
    expect(eventos[0].relacionados).toHaveLength(2);
    expect(eventos[0].apagado.length).toBeGreaterThan(0);
  });

  it("editar uma venda: parcelas antigas aparecem como substituídas, não como apagadas", () => {
    const [e] = agruparEventos([
      linha({ table: "sales", op: "UPDATE", before: { id: 2, client_name: "Kika", sale_value: 200 }, after: { id: 2, client_name: "Kika", sale_value: 250 } }),
      linha({ table: "sale_payments", op: "DELETE", before: { id: 6, amount: 200 } }),
    ]);
    expect(e.acao).toBe("editada");
    expect(e.relacionados[0].acao).toBe("substituída");
  });

  it("cancelar e reativar uma venda têm ação própria", () => {
    const antes = { id: 2, client_name: "Kika", sale_value: 200, status: "ativa" };
    const [c] = agruparEventos([linha({ txId: "1", table: "sales", op: "UPDATE", before: antes, after: { ...antes, status: "cancelada" } })]);
    const [r] = agruparEventos([linha({ txId: "2", table: "sales", op: "UPDATE", before: { ...antes, status: "cancelada" }, after: antes })]);
    expect(c.acao).toBe("cancelada");
    expect(r.acao).toBe("reativada");
  });

  it("operações diferentes viram eventos diferentes, do mais novo para o mais antigo", () => {
    const eventos = agruparEventos([
      linha({ txId: "1", at: "2026-09-20T10:00:00.000Z", table: "expenses", op: "DELETE", before: { id: 1, description: "A", amount: 1 } }),
      linha({ txId: "2", at: "2026-09-21T10:00:00.000Z", table: "receipts", op: "DELETE", before: { id: 2, from_name: "B", amount: 2 } }),
    ]);
    expect(eventos.map((e) => e.tipo)).toEqual(["recebimento", "despesa"]);
  });

  it("tabela desconhecida é ignorada em vez de quebrar a tela", () => {
    expect(agruparEventos([linha({ table: "outra_coisa", op: "DELETE", before: { id: 1 } })])).toEqual([]);
  });
});

describe("títulos com campos vazios", () => {
  it("não escreve R$ vazio nem data vazia", () => {
    expect(tituloDaLinha("sales", { client_name: "Kika", sale_value: null, sale_date: "2026-09-06" })).toBe("Venda de Kika, em 06/09/2026");
    expect(tituloDaLinha("sales", { sale_value: null })).toBe("Venda");
    expect(tituloDaLinha("fund_payments", { amount: null, paid_date: null })).toBe("Pagamento do fundo");
    expect(normal(tituloDaLinha("sale_payments", { amount: 100 }))).toBe("Parcela de R$ 100,00");
  });
});

describe("fatura do cartão e ruído interno", () => {
  it("editar uma fatura: o título é da fatura, e a despesa e a parte aparecem como relacionados com o que mudou", () => {
    const [e] = agruparEventos([
      linha({ txId: "9", table: "card_invoice_parts", op: "UPDATE", before: { id: 1, description: "parte", amount: 100 }, after: { id: 1, description: "parte", amount: 120 } }),
      linha({ txId: "9", table: "expenses", op: "UPDATE", before: { id: 2, description: "parte", amount: 100 }, after: { id: 2, description: "parte", amount: 120 } }),
      linha({ txId: "9", table: "card_invoices", op: "UPDATE", before: { id: 3, description: "Setembro", total_amount: 100 }, after: { id: 3, description: "Setembro", total_amount: 120 } }),
    ]);
    expect(e.tipo).toBe("fatura");
    expect(normal(e.titulo)).toBe('Fatura do cartão "Setembro", R$ 120,00');
    expect(e.alteracoes.map((a) => a.rotulo)).toEqual(["Total"]);
    expect(e.relacionados).toHaveLength(2);
    expect(e.relacionados.every((r) => r.alteracoes.length === 1)).toBe(true);
  });

  it("quando só mudou uma ligação interna (a fatura ligou a despesa à parte), não aparece", () => {
    expect(
      agruparEventos([linha({ table: "card_invoice_parts", op: "UPDATE", before: { id: 1, description: "p", amount: 5, expense_id: null }, after: { id: 1, description: "p", amount: 5, expense_id: 6 } })])
    ).toEqual([]);
  });

  it("o nome de quem fez vem de qualquer linha da operação que o tenha", () => {
    const [e] = agruparEventos([
      linha({ txId: "5", table: "sales", op: "DELETE", before: { id: 1, client_name: "A", sale_value: 1 }, userName: null }),
      linha({ txId: "5", table: "sale_payments", op: "DELETE", before: { id: 2, amount: 1 }, userName: "João" }),
    ]);
    expect(e.userName).toBe("João");
  });
});
