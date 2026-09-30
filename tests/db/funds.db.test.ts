import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comQuem } from "../../lib/audit";
import {
  apagarRegraDeFundo,
  criarFundo,
  criarRegraDeFundo,
  fundoDisponivel,
  fundoExiste,
  listarFundos,
  listarRegras,
  mudarFundo,
} from "../../lib/funds-db";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const JOAO = { id: 1, name: "João" };

describe.skipIf(!disponivel)("fundos no banco (migração 016)", () => {
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
    await pool.query(`DELETE FROM fund_rules`);
    await pool.query(`DELETE FROM expenses`);
    await pool.query(`DELETE FROM funds WHERE position > 7`); // fundos criados pelos testes
    await pool.query(`DELETE FROM change_log`); // por último: as exclusões acima também entram no histórico
  });

  const idDe = async (nome: string) => (await pool.query(`SELECT id FROM funds WHERE name = $1`, [nome])).rows[0].id as number;

  it("a migração 016 cria os 7 fundos, em ordem, todos ativos", async () => {
    const fundos = await listarFundos(pool);
    expect(fundos.map((f) => f.name)).toEqual(["Prospecção", "Transporte", "Custos fixos", "Digital", "Tráfego pago", "Embalagens", "Frete"]);
    expect(fundos.every((f) => f.active)).toBe(true);
    expect((await pool.query(`SELECT id FROM schema_migrations WHERE id = '016'`)).rowCount).toBe(1);
    expect(fundos.find((f) => f.name === "Custos fixos")?.description).toContain("MEI");
  });

  it("rodar a migração de novo não duplica os fundos", async () => {
    expect(await runMigrations(pool)).toEqual([]);
    expect((await listarFundos(pool)).length).toBe(7);
  });

  it("regras: mês sempre no dia 1, % de 0 a 100, fim não antes do começo", async () => {
    const f = await idDe("Frete");
    const inserir = (pct: number, de: string, ate: string | null) =>
      pool.query(`INSERT INTO fund_rules (fund_id, pct, from_month, to_month) VALUES ($1, $2, $3, $4)`, [f, pct, de, ate]);
    await expect(inserir(5, "2026-09-01", null)).resolves.toBeDefined();
    await expect(inserir(5, "2026-09-15", null)).rejects.toThrow();
    await expect(inserir(101, "2026-09-01", null)).rejects.toThrow();
    await expect(inserir(-1, "2026-09-01", null)).rejects.toThrow();
    await expect(inserir(5, "2026-09-01", "2026-08-01")).rejects.toThrow();
    await expect(inserir(5, "2026-09-01", "2026-10-15")).rejects.toThrow();
    await expect(inserir(5, "2026-09-01", "2026-09-01")).resolves.toBeDefined();
  });

  it("o nome do fundo não repete, nem com maiúscula diferente", async () => {
    await criarFundo(pool, "Feiras", null);
    await expect(criarFundo(pool, "  FEIRAS ", null)).rejects.toMatchObject({ code: "23505" });
  });

  it("criar fundo vai para o fim da lista; renomear e arquivar", async () => {
    const id = await criarFundo(pool, "Feiras", "Barracas e eventos");
    const criado = (await listarFundos(pool)).find((f) => f.id === id)!;
    expect(criado).toMatchObject({ name: "Feiras", description: "Barracas e eventos", active: true, position: 8 });

    expect(await mudarFundo(pool, id, { name: "Feiras e eventos", description: null })).toBe(true);
    expect(await mudarFundo(pool, id, { active: false })).toBe(true);
    const depois = (await listarFundos(pool)).find((f) => f.id === id)!;
    expect(depois).toMatchObject({ name: "Feiras e eventos", description: null, active: false });
    expect(await mudarFundo(pool, 999999, { name: "x" })).toBe(false);
  });

  it("fundoDisponivel: existe e está ativo; fundoExiste: só existir", async () => {
    const id = await criarFundo(pool, "Feiras", null);
    expect(await fundoDisponivel(pool, id)).toBe(true);
    await mudarFundo(pool, id, { active: false });
    expect(await fundoDisponivel(pool, id)).toBe(false);
    expect(await fundoExiste(pool, id)).toBe(true);
    expect(await fundoExiste(pool, 999999)).toBe(false);
  });

  it("criar e listar regras (a mais nova primeiro), com quem criou", async () => {
    const f = await idDe("Prospecção");
    const a = await criarRegraDeFundo(pool, { fundId: f, pct: 5, fromMonth: "2026-09-01", toMonth: null }, JOAO);
    const b = await criarRegraDeFundo(pool, { fundId: f, pct: 8, fromMonth: "2026-10-01", toMonth: "2026-10-01" }, { id: 2, name: "Fernanda" });
    const regras = await listarRegras(pool);
    expect(regras.map((r) => r.id)).toEqual([b, a]);
    expect(regras[1]).toMatchObject({ fundId: f, pct: 5, fromMonth: "2026-09-01", toMonth: null, createdByName: "João" });
    expect(regras[0]).toMatchObject({ pct: 8, toMonth: "2026-10-01", createdByName: "Fernanda" });
    expect(typeof regras[0].createdAt).toBe("string");
    expect(new Date(regras[0].createdAt).toString()).not.toBe("Invalid Date");
  });

  it("despesa pode apontar para um fundo (e continua sem, como antes)", async () => {
    const f = await idDe("Custos fixos");
    await pool.query(`INSERT INTO expenses (expense_date, description, amount, fund_id) VALUES ('2026-09-05', 'Contador', 150, $1)`, [f]);
    await pool.query(`INSERT INTO expenses (expense_date, description, amount) VALUES ('2026-09-06', 'Frete', 30)`);
    const { rows } = await pool.query(`SELECT description, fund_id FROM expenses ORDER BY id`);
    expect(rows).toEqual([
      { description: "Contador", fund_id: f },
      { description: "Frete", fund_id: null },
    ]);
    await expect(pool.query(`INSERT INTO expenses (expense_date, description, amount, fund_id) VALUES ('2026-09-05', 'x', 1, 999999)`)).rejects.toThrow();
  });

  it("apagar uma regra registra no histórico com o nome de quem apagou", async () => {
    const f = await idDe("Digital");
    const id = await criarRegraDeFundo(pool, { fundId: f, pct: 3, fromMonth: "2026-09-01", toMonth: null }, JOAO);
    expect(await comQuem(pool, JOAO, (c) => apagarRegraDeFundo(c, id))).toBe(true);
    expect(await apagarRegraDeFundo(pool, id)).toBe(false); // já não existe
    const { rows } = await pool.query(`SELECT table_name, op, user_name FROM change_log WHERE table_name = 'fund_rules'`);
    expect(rows).toEqual([{ table_name: "fund_rules", op: "DELETE", user_name: "João" }]);
  });

  it("renomear um fundo fica no histórico", async () => {
    const id = await criarFundo(pool, "Feiras", null);
    await comQuem(pool, JOAO, (c) => mudarFundo(c, id, { name: "Feiras e eventos" }));
    const { rows } = await pool.query(`SELECT table_name, op FROM change_log WHERE table_name = 'funds'`);
    expect(rows).toEqual([{ table_name: "funds", op: "UPDATE" }]);
  });
});
