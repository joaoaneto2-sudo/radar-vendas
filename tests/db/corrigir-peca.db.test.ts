import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comQuem } from "../../lib/audit";
import { aplicarCorrecao } from "../../lib/corrigir-peca";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("correção rápida pelo alerta", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;
  let fab: number;
  let semCusto: number;

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
    await pool.query(`DELETE FROM products WHERE name LIKE 'CR %'`);
    await pool.query(`DELETE FROM manufacturers WHERE name = 'Fab CR'`);
    fab = (await pool.query(`INSERT INTO manufacturers (name) VALUES ('Fab CR') RETURNING id`)).rows[0].id;
    semCusto = (
      await pool.query(
        `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active) VALUES ('Brincos', 'CR Sem custo', $1, NULL, NULL, 1, 'varejo', true) RETURNING id`,
        [fab]
      )
    ).rows[0].id;
  });

  const aplicar = (id: number, c: Parameters<typeof aplicarCorrecao>[2]) =>
    comQuem(pool, { id: 7, name: "João" }, (client) => aplicarCorrecao(client, id, c));

  it("grava custo e preço e deixa o resto da peça como estava", async () => {
    const r = await aplicar(semCusto, { cost: 77, price: 192.5 });
    expect(r.ok).toBe(true);
    const { rows } = await pool.query(`SELECT cost, price, stock_qty, category FROM products WHERE id = $1`, [semCusto]);
    expect([Number(rows[0].cost), Number(rows[0].price), rows[0].stock_qty, rows[0].category]).toEqual([77, 192.5, 1, "Brincos"]);
  });

  it("só o custo: o preço que já existia não muda", async () => {
    await pool.query(`UPDATE products SET price = 300 WHERE id = $1`, [semCusto]);
    await aplicar(semCusto, { cost: 80 });
    const { rows } = await pool.query(`SELECT cost, price FROM products WHERE id = $1`, [semCusto]);
    expect([Number(rows[0].cost), Number(rows[0].price)]).toEqual([80, 300]);
  });

  it("registra quem mudou no histórico de alterações", async () => {
    await aplicar(semCusto, { cost: 55 });
    const { rows } = await pool.query(`SELECT user_name, table_name, op FROM change_log WHERE table_name = 'products' AND row_id = $1 ORDER BY id DESC LIMIT 1`, [semCusto]);
    expect(rows[0]).toMatchObject({ user_name: "João", op: "UPDATE" });
  });

  it("código livre grava; código de outra peça do mesmo fabricante é recusado", async () => {
    const outra = (
      await pool.query(
        `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active, manufacturer_code) VALUES ('Brincos', 'CR Outra', $1, 10, 25, 1, 'varejo', true, 'FABCR-BR-001') RETURNING id`,
        [fab]
      )
    ).rows[0].id;
    expect(outra).toBeGreaterThan(0);
    const ocupado = await aplicar(semCusto, { manufacturer_code: "FABCR-BR-001" });
    expect(ocupado).toMatchObject({ ok: false, error: "code_taken" });
    const livre = await aplicar(semCusto, { manufacturer_code: "FABCR-BR-002" });
    expect(livre.ok).toBe(true);
    expect((await pool.query(`SELECT manufacturer_code FROM products WHERE id = $1`, [semCusto])).rows[0].manufacturer_code).toBe("FABCR-BR-002");
  });

  it("peça que não existe devolve not_found", async () => {
    expect(await aplicar(99999999, { cost: 10 })).toMatchObject({ ok: false, error: "not_found" });
  });
});
