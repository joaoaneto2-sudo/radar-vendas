import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comQuem } from "../../lib/audit";
import { agruparEventos } from "../../lib/change-log";
import { listarRegistro } from "../../lib/change-log-db";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const JOAO = { id: 1, name: "João" };
const FERNANDA = { id: 2, name: "Fernanda" };

describe.skipIf(!disponivel)("histórico de alterações: registro automático no banco", () => {
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
    await pool.query(`DELETE FROM sales`);
    await pool.query(`DELETE FROM expenses`);
    await pool.query(`DELETE FROM receipts`);
    await pool.query(`DELETE FROM change_log`);
  });

  async function novaDespesa(descricao = "Frete", valor = 30): Promise<number> {
    const { rows } = await pool.query(`INSERT INTO expenses (expense_date, description, amount) VALUES ('2026-09-01', $1, $2) RETURNING id`, [descricao, valor]);
    return rows[0].id;
  }

  async function novaVenda(cliente = "Kika", valor = 200): Promise<number> {
    const { rows } = await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-09-11', $1, $2) RETURNING id`, [cliente, valor]);
    const id = rows[0].id;
    await pool.query(`INSERT INTO sale_payments (sale_id, due_date, amount, status) VALUES ($1, '2026-10-01', $2, 'prevista'), ($1, '2026-11-01', $2, 'prevista')`, [id, valor / 2]);
    return id;
  }

  it("a migração 014 cria o registro, vazio", async () => {
    expect((await pool.query(`SELECT count(*)::int AS n FROM change_log`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT id FROM schema_migrations WHERE id = '014'`)).rowCount).toBe(1);
  });

  it("criar não registra nada (só edição e exclusão)", async () => {
    await novaDespesa();
    await novaVenda();
    expect((await pool.query(`SELECT count(*)::int AS n FROM change_log`)).rows[0].n).toBe(0);
  });

  it("editar uma despesa guarda o antes, o depois e quem fez", async () => {
    const id = await novaDespesa("Frete", 30);
    await comQuem(pool, JOAO, (c) => c.query(`UPDATE expenses SET amount = 35 WHERE id = $1`, [id]));
    const linhas = await listarRegistro(pool);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({ table: "expenses", op: "UPDATE", rowId: id, userName: "João" });
    expect(Number(linhas[0].before.amount)).toBe(30);
    expect(Number(linhas[0].after?.amount)).toBe(35);
    expect(linhas[0].before.description).toBe("Frete");
  });

  it("apagar guarda a linha inteira que existia", async () => {
    const id = await novaDespesa("Embalagem", 12.5);
    await comQuem(pool, FERNANDA, (c) => c.query(`DELETE FROM expenses WHERE id = $1`, [id]));
    const [linha] = await listarRegistro(pool);
    expect(linha).toMatchObject({ op: "DELETE", userName: "Fernanda", after: null });
    expect(linha.before).toMatchObject({ description: "Embalagem", expense_date: "2026-09-01" });
    expect(Number(linha.before.amount)).toBe(12.5);
  });

  it("edição que não muda nada não é registrada", async () => {
    const id = await novaDespesa("Frete", 30);
    await pool.query(`UPDATE expenses SET amount = 30, description = 'Frete' WHERE id = $1`, [id]);
    expect(await listarRegistro(pool)).toHaveLength(0);
  });

  it("sem avisar quem fez (uma importação, por exemplo), registra sem nome", async () => {
    const id = await novaDespesa();
    await pool.query(`DELETE FROM expenses WHERE id = $1`, [id]);
    const [linha] = await listarRegistro(pool);
    expect(linha.userName).toBeNull();
  });

  it("o nome de quem fez não vaza para a operação seguinte", async () => {
    const a = await novaDespesa("A");
    const b = await novaDespesa("B");
    await comQuem(pool, JOAO, (c) => c.query(`DELETE FROM expenses WHERE id = $1`, [a]));
    await pool.query(`DELETE FROM expenses WHERE id = $1`, [b]);
    const linhas = await listarRegistro(pool);
    expect(linhas.map((l) => l.userName)).toEqual([null, "João"]); // do mais novo para o mais antigo
  });

  it("operação que falha e volta atrás não deixa registro", async () => {
    const id = await novaDespesa();
    await expect(
      comQuem(pool, JOAO, async (c) => {
        await c.query(`DELETE FROM expenses WHERE id = $1`, [id]);
        throw new Error("deu ruim");
      })
    ).rejects.toThrow("deu ruim");
    expect(await listarRegistro(pool)).toHaveLength(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM expenses`)).rows[0].n).toBe(1);
  });

  it("apagar uma venda registra a venda e as parcelas juntas, e vira um evento só", async () => {
    const id = await novaVenda("Kika", 200);
    await comQuem(pool, JOAO, (c) => c.query(`DELETE FROM sales WHERE id = $1`, [id]));
    const linhas = await listarRegistro(pool);
    expect(linhas.map((l) => l.table).sort()).toEqual(["sale_payments", "sale_payments", "sales"]);
    expect(new Set(linhas.map((l) => l.txId)).size).toBe(1);

    const eventos = agruparEventos(linhas);
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({ tipo: "venda", acao: "apagada", userName: "João" });
    expect(eventos[0].titulo).toContain("Venda de Kika");
    expect(eventos[0].relacionados).toHaveLength(2);
  });

  it("cancelar uma venda aparece como cancelada", async () => {
    const id = await novaVenda();
    await comQuem(pool, JOAO, (c) => c.query(`UPDATE sales SET status = 'cancelada', cancelled_at = now() WHERE id = $1`, [id]));
    const [evento] = agruparEventos(await listarRegistro(pool));
    expect(evento.acao).toBe("cancelada");
    expect(evento.alteracoes.map((a) => a.rotulo)).toContain("Situação");
  });

  it("operações separadas geram eventos separados, as do mesmo pedido ficam juntas", async () => {
    const a = await novaDespesa("A");
    const b = await novaDespesa("B");
    await comQuem(pool, JOAO, async (c) => {
      await c.query(`UPDATE expenses SET amount = 1 WHERE id = $1`, [a]);
      await c.query(`UPDATE expenses SET amount = 2 WHERE id = $1`, [b]);
    });
    await comQuem(pool, JOAO, (c) => c.query(`DELETE FROM expenses WHERE id = $1`, [a]));
    const eventos = agruparEventos(await listarRegistro(pool));
    expect(eventos).toHaveLength(2);
  });
});
