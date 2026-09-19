import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseInvoiceBody } from "../../lib/expenses";
import { getFinanceSummary } from "../../lib/finance/load";
import { InvoiceConflict, deleteInvoice, listInvoices, saveInvoice } from "../../lib/invoices-db";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("fatura do cartão e despesas no banco", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;

  beforeAll(async () => {
    const banco = await criarBancoDescartavel();
    pool = banco.pool;
    apagar = banco.apagar;
    await runMigrations(pool);
  });

  afterAll(async () => {
    await apagar?.();
  });

  async function salvar(id: number | null, corpo: Record<string, unknown>) {
    const dados = parseInvoiceBody(corpo);
    if (!dados.ok) throw new Error(dados.message);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const novo = await saveInvoice(client, id, dados);
      await client.query("COMMIT");
      return novo;
    } catch (erro) {
      await client.query("ROLLBACK");
      throw erro;
    } finally {
      client.release();
    }
  }

  const FATURA = {
    description: "Fatura de setembro",
    due_date: "2026-09-30",
    closing_date: "2026-09-22",
    total_amount: "12000",
    status: "fechada",
    parts: [
      { nature: "pessoal_fernanda", amount: "1500", description: "Compras pessoais" },
      { nature: "estoque_inicial", amount: "6000", description: "Joias de agosto" },
      { nature: "reposicao", amount: "4000", description: "Reposição CD" },
      { nature: "despesa_empresa", amount: "500", description: "Anúncios" },
    ],
  };

  it("cada parte se liga ao resto: despesa vira despesa, reposição e estoque inicial viram compras", async () => {
    const id = await salvar(null, FATURA);
    const [fatura] = await listInvoices(pool, id);
    expect(fatura).toMatchObject({ description: "Fatura de setembro", due_date: "2026-09-30", closing_date: "2026-09-22", status: "fechada" });
    expect(fatura.parts).toHaveLength(4);

    const porNatureza = Object.fromEntries(fatura.parts.map((p: any) => [p.nature, p]));
    expect(porNatureza.pessoal_fernanda).toMatchObject({ expense_id: null, stock_purchase_id: null });
    expect(porNatureza.despesa_empresa.expense_id).not.toBeNull();
    expect(porNatureza.reposicao.stock_purchase_id).not.toBeNull();
    expect(porNatureza.estoque_inicial.stock_purchase_id).not.toBeNull();

    const { rows: despesas } = await pool.query(
      `SELECT to_char(expense_date, 'YYYY-MM-DD') AS d, description, category, amount FROM expenses`
    );
    expect(despesas).toEqual([{ d: "2026-09-30", description: "Anúncios", category: "Cartão de crédito", amount: "500.00" }]);

    const { rows: compras } = await pool.query(`SELECT kind, amount, payment_method FROM stock_purchases ORDER BY kind`);
    expect(compras).toEqual([
      { kind: "inicial", amount: "6000.00", payment_method: "Cartão da empresa" },
      { kind: "reposicao", amount: "4000.00", payment_method: "Cartão da empresa" },
    ]);
  });

  it("no painel: a fatura fecha, a despesa sai do lucro e a reposição aparece a pagar pelo fundo", async () => {
    await pool.query(`INSERT INTO sales (sale_date, sale_value, payment_method) VALUES ('2026-09-10', 3000, 'Pix à vista')`);
    const r = await getFinanceSummary(pool, { today: "2026-09-19" });
    expect(r.invoices).toHaveLength(1);
    expect(r.invoices[0]).toMatchObject({ closes: true, fernandaPaysCents: 750000, fundPaysCents: 400000, companyExpenseCents: 50000 });
    expect(r.cascade.totals.expensesCents).toBe(50000); // entrou uma vez só
    expect(r.fund.payableCents).toBe(400000);
    expect(r.warnings.some((w) => w.code === "fatura_nao_fecha")).toBe(false);
    expect(r.cascade.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
    await pool.query(`DELETE FROM sales`);
  });

  it("editar atualiza no lugar: mesmos lançamentos, novos valores e nova data", async () => {
    const [antes] = await listInvoices(pool);
    const idsAntes = antes.parts.map((p: any) => [p.id, p.expense_id, p.stock_purchase_id]);

    await salvar(antes.id, {
      ...FATURA,
      due_date: "2026-10-05",
      total_amount: "12100",
      parts: antes.parts.map((p: any) => ({
        id: p.id,
        nature: p.nature,
        description: p.description,
        amount: p.nature === "despesa_empresa" ? "600" : String(Number(p.amount)),
      })),
    });

    const [depois] = await listInvoices(pool, antes.id);
    expect(depois.parts.map((p: any) => [p.id, p.expense_id, p.stock_purchase_id])).toEqual(idsAntes);
    const { rows } = await pool.query(`SELECT to_char(expense_date, 'YYYY-MM-DD') AS d, amount FROM expenses`);
    expect(rows).toEqual([{ d: "2026-10-05", amount: "600.00" }]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM expenses`)).rows[0].n).toBe(1);
    expect((await pool.query(`SELECT count(*)::int AS n FROM stock_purchases`)).rows[0].n).toBe(2);
  });

  it("mudar o tipo de uma parte troca a ligação: despesa vira compra", async () => {
    const [fatura] = await listInvoices(pool);
    const despesa = fatura.parts.find((p: any) => p.nature === "despesa_empresa");
    await salvar(fatura.id, {
      ...FATURA,
      due_date: "2026-10-05",
      parts: fatura.parts.map((p: any) => ({
        id: p.id,
        nature: p.id === despesa.id ? "reposicao" : p.nature,
        description: p.description,
        amount: String(Number(p.amount)),
      })),
    });
    expect((await pool.query(`SELECT count(*)::int AS n FROM expenses`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM stock_purchases WHERE kind = 'reposicao'`)).rows[0].n).toBe(2);
  });

  it("apagar uma parte tira também o que ela criou; recusa se o fundo já pagou aquela compra", async () => {
    const [fatura] = await listInvoices(pool);
    const reposicoes = fatura.parts.filter((p: any) => p.nature === "reposicao");
    const [primeira, segunda] = reposicoes;

    // O fundo já pagou parte da primeira reposição.
    await pool.query(`INSERT INTO fund_payments (purchase_id, paid_date, amount) VALUES ($1, '2026-10-01', 100)`, [primeira.stock_purchase_id]);

    const semAsDuas = fatura.parts.filter((p: any) => p.id !== primeira.id && p.id !== segunda.id);
    const corpo = (partes: any[]) => ({
      ...FATURA,
      due_date: "2026-10-05",
      parts: partes.map((p: any) => ({ id: p.id, nature: p.nature, description: p.description, amount: String(Number(p.amount)) })),
    });

    // Tirar a parte que já teve pagamento do fundo: recusado, e nada muda (transação desfeita).
    await expect(salvar(fatura.id, corpo(fatura.parts.filter((p: any) => p.id !== primeira.id)))).rejects.toBeInstanceOf(InvoiceConflict);
    expect((await pool.query(`SELECT count(*)::int AS n FROM card_invoice_parts`)).rows[0].n).toBe(4);
    expect((await pool.query(`SELECT count(*)::int AS n FROM stock_purchases`)).rows[0].n).toBe(3);

    // Tirar só a que nunca foi paga: passa, e a compra dela some junto.
    await salvar(fatura.id, corpo(fatura.parts.filter((p: any) => p.id !== segunda.id)));
    expect((await pool.query(`SELECT count(*)::int AS n FROM card_invoice_parts`)).rows[0].n).toBe(3);
    expect((await pool.query(`SELECT count(*)::int AS n FROM stock_purchases`)).rows[0].n).toBe(2);
    expect(semAsDuas.length).toBe(2);
  });

  it("apagar a fatura leva as despesas e as compras dela, mas recusa se houver pagamento do fundo", async () => {
    const [fatura] = await listInvoices(pool);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await expect(deleteInvoice(client, fatura.id)).rejects.toBeInstanceOf(InvoiceConflict);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect((await listInvoices(pool))).toHaveLength(1);

    await pool.query(`DELETE FROM fund_payments`);
    const c2 = await pool.connect();
    try {
      await c2.query("BEGIN");
      expect(await deleteInvoice(c2, fatura.id)).toBe(true);
      await c2.query("COMMIT");
    } finally {
      c2.release();
    }
    expect(await listInvoices(pool)).toHaveLength(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM stock_purchases`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM expenses`)).rows[0].n).toBe(0);
  });

  it("fatura ainda sem total: aceita e o painel avisa que não fechou", async () => {
    const id = await salvar(null, { description: "Fatura aberta", due_date: "2026-10-30", total_amount: "", parts: [{ nature: "despesa_empresa", amount: "80" }] });
    const [f] = await listInvoices(pool, id);
    expect(f).toMatchObject({ total_amount: null, status: "aguardando_fechamento" });
    const r = await getFinanceSummary(pool, { today: "2026-09-19" });
    expect(r.warnings.some((w) => w.code === "fatura_sem_total")).toBe(true);
  });

  it("fatura em que as partes não somam o total: salva e o painel avisa", async () => {
    await salvar(null, { ...FATURA, description: "Fatura torta", total_amount: "13000" });
    const r = await getFinanceSummary(pool, { today: "2026-09-19" });
    const torta = r.invoices.find((i) => i.description === "Fatura torta");
    expect(torta).toMatchObject({ closes: false, differenceCents: 100000 });
    expect(r.warnings.some((w) => w.code === "fatura_nao_fecha")).toBe(true);
  });
});
