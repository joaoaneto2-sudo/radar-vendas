import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comQuem } from "../../lib/audit";
import { agruparEventos } from "../../lib/change-log";
import { listarRegistro } from "../../lib/change-log-db";
import { desfazerAlteracao } from "../../lib/change-undo-db";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const JOAO = { id: 1, name: "João" };
const FERNANDA = { id: 2, name: "Fernanda" };

describe.skipIf(!disponivel)("desfazer mudanças do histórico", () => {
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
  beforeEach(async () => {
    await pool.query(`DELETE FROM fund_payments`);
    await pool.query(`DELETE FROM stock_purchases`);
    await pool.query(`DELETE FROM sales`);
    await pool.query(`DELETE FROM expenses`);
    await pool.query(`DELETE FROM receipts`);
    await pool.query(`DELETE FROM change_log`);
  });

  const ultima = async () => (await listarRegistro(pool))[0];

  async function novaDespesa(descricao = "Frete", valor = 30): Promise<number> {
    const { rows } = await pool.query(`INSERT INTO expenses (expense_date, description, amount, category) VALUES ('2026-09-01', $1, $2, 'Envio') RETURNING id`, [descricao, valor]);
    return rows[0].id;
  }

  it("a migração 015 cria a tabela dos desfeitos", async () => {
    expect((await pool.query(`SELECT id FROM schema_migrations WHERE id = '015'`)).rowCount).toBe(1);
  });

  it("desfaz a edição de uma despesa: os campos voltam, e a mudança fica marcada como desfeita", async () => {
    const id = await novaDespesa("Frete", 30);
    await comQuem(pool, JOAO, (c) => c.query(`UPDATE expenses SET amount = 35, category = 'Outros' WHERE id = $1`, [id]));
    const edicao = await ultima();

    const r = await desfazerAlteracao(pool, edicao.id, FERNANDA);
    expect(r.ok).toBe(true);
    const { rows } = await pool.query(`SELECT amount, category FROM expenses WHERE id = $1`, [id]);
    expect(rows[0]).toEqual({ amount: "30.00", category: "Envio" });

    const linhas = await listarRegistro(pool);
    const original = linhas.find((l) => l.id === edicao.id)!;
    expect(original).toMatchObject({ desfeitaPor: "Fernanda" });
    expect(original.desfeitaEm).not.toBeNull();
    // o desfazer em si também fica registrado (é uma edição feita por quem desfez)
    expect(linhas.filter((l) => l.op === "UPDATE")).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ userName: "Fernanda" });
  });

  it("desfaz a exclusão de uma despesa: volta com o mesmo número e a mesma data de criação", async () => {
    const id = await novaDespesa("Embalagem", 12.5);
    const antes = (await pool.query(`SELECT to_jsonb(e) AS j FROM expenses e WHERE id = $1`, [id])).rows[0].j;
    await comQuem(pool, JOAO, (c) => c.query(`DELETE FROM expenses WHERE id = $1`, [id]));

    const r = await desfazerAlteracao(pool, (await ultima()).id, JOAO);
    expect(r).toMatchObject({ ok: true });
    const depois = (await pool.query(`SELECT to_jsonb(e) AS j FROM expenses e WHERE id = $1`, [id])).rows[0].j;
    expect(depois).toEqual(antes);
  });

  it("não desfaz duas vezes", async () => {
    const id = await novaDespesa();
    await comQuem(pool, JOAO, (c) => c.query(`DELETE FROM expenses WHERE id = $1`, [id]));
    const apagada = await ultima();
    expect((await desfazerAlteracao(pool, apagada.id, JOAO)).ok).toBe(true);
    expect(await desfazerAlteracao(pool, apagada.id, JOAO)).toMatchObject({ ok: false, error: "already_undone" });
    expect((await pool.query(`SELECT count(*)::int AS n FROM expenses`)).rows[0].n).toBe(1);
  });

  it("não desfaz uma edição se a linha já foi mudada depois", async () => {
    const id = await novaDespesa("Frete", 30);
    await comQuem(pool, JOAO, (c) => c.query(`UPDATE expenses SET amount = 35 WHERE id = $1`, [id]));
    const primeira = await ultima();
    await comQuem(pool, JOAO, (c) => c.query(`UPDATE expenses SET amount = 40 WHERE id = $1`, [id]));

    expect(await desfazerAlteracao(pool, primeira.id, JOAO)).toMatchObject({ ok: false, error: "changed_since" });
    expect((await pool.query(`SELECT amount FROM expenses WHERE id = $1`, [id])).rows[0].amount).toBe("40.00");
    expect((await listarRegistro(pool)).every((l) => l.desfeitaEm === null)).toBe(true);
  });

  it("não desfaz uma edição de uma linha que foi apagada depois", async () => {
    const id = await novaDespesa();
    await comQuem(pool, JOAO, (c) => c.query(`UPDATE expenses SET amount = 35 WHERE id = $1`, [id]));
    const edicao = await ultima();
    await pool.query(`DELETE FROM expenses WHERE id = $1`, [id]);
    expect(await desfazerAlteracao(pool, edicao.id, JOAO)).toMatchObject({ ok: false, error: "changed_since" });
  });

  it("desfaz na ordem: editar e apagar; primeiro volta a linha, depois volta a edição", async () => {
    const id = await novaDespesa("Frete", 30);
    await comQuem(pool, JOAO, (c) => c.query(`UPDATE expenses SET amount = 35 WHERE id = $1`, [id]));
    const edicao = await ultima();
    await comQuem(pool, JOAO, (c) => c.query(`DELETE FROM expenses WHERE id = $1`, [id]));
    const exclusao = await ultima();

    expect((await desfazerAlteracao(pool, exclusao.id, JOAO)).ok).toBe(true);
    expect((await desfazerAlteracao(pool, edicao.id, JOAO)).ok).toBe(true);
    expect((await pool.query(`SELECT amount FROM expenses WHERE id = $1`, [id])).rows[0].amount).toBe("30.00");
  });

  it("desfaz a exclusão de um pagamento do fundo, mas não se a compra já não existe", async () => {
    const { rows: c } = await pool.query(`INSERT INTO stock_purchases (description, kind, amount) VALUES ('Reposição', 'reposicao', 500) RETURNING id`);
    const compra = c[0].id;
    const { rows: p } = await pool.query(`INSERT INTO fund_payments (purchase_id, paid_date, amount) VALUES ($1, '2026-09-10', 200) RETURNING id`, [compra]);
    await comQuem(pool, JOAO, (cl) => cl.query(`DELETE FROM fund_payments WHERE id = $1`, [p[0].id]));
    const primeira = await ultima();
    expect((await desfazerAlteracao(pool, primeira.id, JOAO)).ok).toBe(true);
    expect((await pool.query(`SELECT amount FROM fund_payments WHERE id = $1`, [p[0].id])).rows[0].amount).toBe("200.00");

    // apaga o pagamento de novo e depois a compra: agora não há para onde voltar
    await comQuem(pool, JOAO, (cl) => cl.query(`DELETE FROM fund_payments WHERE id = $1`, [p[0].id]));
    const segunda = (await listarRegistro(pool)).find((l) => l.table === "fund_payments" && l.desfeitaEm === null)!;
    await pool.query(`DELETE FROM stock_purchases WHERE id = $1`, [compra]);
    expect(await desfazerAlteracao(pool, segunda.id, JOAO)).toMatchObject({ ok: false, error: "missing_reference" });
    expect((await pool.query(`SELECT count(*)::int AS n FROM fund_payments`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM change_undo WHERE change_id = $1`, [segunda.id])).rows[0].n).toBe(0);
  });

  it("desfaz o 'recebida' de uma parcela: ela volta para a receber", async () => {
    const { rows: v } = await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-09-11', 'Kika', 100) RETURNING id`);
    const { rows: pa } = await pool.query(`INSERT INTO sale_payments (sale_id, due_date, amount, status) VALUES ($1, '2026-10-01', 100, 'prevista') RETURNING id`, [v[0].id]);
    await comQuem(pool, JOAO, (c) => c.query(`UPDATE sale_payments SET status = 'recebida', received_date = '2026-10-02' WHERE id = $1`, [pa[0].id]));
    expect((await desfazerAlteracao(pool, (await ultima()).id, JOAO)).ok).toBe(true);
    expect((await pool.query(`SELECT status, received_date FROM sale_payments WHERE id = $1`, [pa[0].id])).rows[0]).toEqual({ status: "prevista", received_date: null });
  });

  it("não desfaz o que mexeu em várias coisas (apagar uma venda leva as parcelas)", async () => {
    const { rows: v } = await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-09-11', 'Kika', 100) RETURNING id`);
    await pool.query(`INSERT INTO sale_payments (sale_id, due_date, amount, status) VALUES ($1, '2026-10-01', 100, 'prevista')`, [v[0].id]);
    await comQuem(pool, JOAO, (c) => c.query(`DELETE FROM sales WHERE id = $1`, [v[0].id]));
    for (const linha of await listarRegistro(pool)) {
      expect(await desfazerAlteracao(pool, linha.id, JOAO)).toMatchObject({ ok: false, error: "not_undoable" });
    }
    expect((await pool.query(`SELECT count(*)::int AS n FROM sales`)).rows[0].n).toBe(0);
  });

  it("mudança que não existe", async () => {
    expect(await desfazerAlteracao(pool, 999999, JOAO)).toMatchObject({ ok: false, error: "not_found" });
  });

  it("o histórico marca o que dá para desfazer e o que já foi desfeito", async () => {
    const id = await novaDespesa();
    await comQuem(pool, JOAO, (c) => c.query(`DELETE FROM expenses WHERE id = $1`, [id]));
    let [evento] = agruparEventos(await listarRegistro(pool));
    expect(evento).toMatchObject({ desfazivel: true, desfeita: null });
    await desfazerAlteracao(pool, evento.logId, FERNANDA);
    [evento] = agruparEventos(await listarRegistro(pool)).filter((e) => e.acao === "apagada");
    expect(evento.desfazivel).toBe(false);
    expect(evento.desfeita).toMatchObject({ por: "Fernanda" });
  });
});
