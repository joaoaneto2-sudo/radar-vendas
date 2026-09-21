import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../lib/migrations";
import { importarItens, preverImportacao } from "../../lib/import-vendas-db";
import { lerPlanilha } from "../../lib/import-vendas";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();

// A tabela do João, do jeito que o Excel copia.
const TABELA = [
  "DATA\tRECEITAS\tTIPO\tVALOR\tFORMA DE PAG",
  "ter 01/09\tVENDAS DE JOIAS E SEMI-JOIAS\tVARELO\t R$ 870,00 \t PIX Á VISTA ",
  "ter 01/09\tAPORTE JOÃO AMORIM\tAPORTE\t R$ 1.000,00 \t PIX Á VISTA ",
  "qua 02/09\tGIOVANA\tVARELO\t R$ 82,50 \t PIX Á VISTA ",
  "qui 03/09\tANDREIA PSICOLOGA\tVARELO\t R$ 374,00 \t PIX Á VISTA ",
  "sex 04/09\tRAQUEL\tVARELO\t R$ 500,00 \t PIX Á VISTA ",
  "sex 04/09\tPATRICIA ADV\tVARELO\t R$ 398,46 \t PIX Á VISTA ",
  "dom 06/09\tELIZABETE\tVARELO\t R$ 280,00 \t PIX Á VISTA ",
  "sex 11/09\tVENDA KIKA\tVARELO\t R$ 1.276,00 \t PIX Á VISTA ",
  "sex 11/09\tVENDA MICHELE\tVARELO\t R$ 2.507,00 \t PIX Á VISTA ",
].join("\n");

describe.skipIf(!disponivel)("importar vendas da planilha", () => {
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
    await pool.query(`DELETE FROM clients`);
    await pool.query(`DELETE FROM receipts`);
    await pool.query(`DELETE FROM sellers`);
  });

  it("a previsão não grava nada e mostra o que vai acontecer", async () => {
    const previstos = await preverImportacao(pool, lerPlanilha(TABELA, 2026));
    expect(previstos).toHaveLength(9);
    expect(previstos.every((p) => p.situacao === "novo")).toBe(true);
    expect(previstos.filter((p) => p.clienteNovo)).toHaveLength(7); // a linha geral e o aporte não criam cliente
    expect((await pool.query(`SELECT count(*)::int AS n FROM sales`)).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int AS n FROM clients`)).rows[0].n).toBe(0);
  });

  it("importa as 8 vendas, os 7 clientes e o aporte do João", async () => {
    const r = await importarItens(pool, lerPlanilha(TABELA, 2026));
    expect(r).toEqual({ vendas: 8, aportes: 1, clientesNovos: 7, jaExistiam: 0, ignoradas: 0 });

    const { rows: vendas } = await pool.query(
      `SELECT to_char(sale_date, 'YYYY-MM-DD') AS data, client_name, sale_value, payment_method, price_tier, seller, cost, client_id, product_id
         FROM sales ORDER BY sale_date, id`
    );
    expect(vendas).toHaveLength(8);
    expect(vendas[0]).toMatchObject({ data: "2026-09-01", client_name: "Vendas de Joias e Semi-joias", sale_value: "870.00", client_id: null, price_tier: "varejo", seller: "Fernanda", cost: null, product_id: null });
    expect(vendas[7]).toMatchObject({ data: "2026-09-11", client_name: "Michele", sale_value: "2507.00", payment_method: "Pix à vista" });
    expect(vendas.filter((v) => v.client_id !== null)).toHaveLength(7);

    const { rows: clientes } = await pool.query(`SELECT full_name FROM clients ORDER BY full_name`);
    expect(clientes.map((c) => c.full_name)).toEqual(["Andreia Psicologa", "Elizabete", "Giovana", "Kika", "Michele", "Patricia ADV", "Raquel"]);

    const { rows: aportes } = await pool.query(
      `SELECT kind, status, to_char(received_date, 'YYYY-MM-DD') AS data, amount, partner FROM receipts`
    );
    expect(aportes).toEqual([{ kind: "aporte_socio", status: "recebida", data: "2026-09-01", amount: "1000.00", partner: "joao" }]);
  });

  it("cada venda entra como já recebida, na data da venda", async () => {
    await importarItens(pool, lerPlanilha(TABELA, 2026));
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n, sum(p.amount) AS total FROM sale_payments p JOIN sales s ON s.id = p.sale_id
        WHERE p.status = 'recebida' AND p.received_date = s.sale_date`
    );
    expect(rows[0].n).toBe(8);
    expect(Number(rows[0].total)).toBeCloseTo(870 + 82.5 + 374 + 500 + 398.46 + 280 + 1276 + 2507, 2);
  });

  it("colar a mesma tabela de novo não duplica nada", async () => {
    await importarItens(pool, lerPlanilha(TABELA, 2026));
    const previsao = await preverImportacao(pool, lerPlanilha(TABELA, 2026));
    expect(previsao.every((p) => p.situacao === "ja_existe")).toBe(true);
    const r = await importarItens(pool, lerPlanilha(TABELA, 2026));
    expect(r).toEqual({ vendas: 0, aportes: 0, clientesNovos: 0, jaExistiam: 9, ignoradas: 0 });
    expect((await pool.query(`SELECT count(*)::int AS n FROM sales`)).rows[0].n).toBe(8);
    expect((await pool.query(`SELECT count(*)::int AS n FROM receipts`)).rows[0].n).toBe(1);
  });

  it("cliente que já existe (mesmo com acento ou maiúscula diferente) não é duplicado", async () => {
    await pool.query(`INSERT INTO clients (full_name, city) VALUES ('GIOVANA', 'Salvador')`);
    await pool.query(`INSERT INTO clients (full_name) VALUES ('Elizabété')`);
    const r = await importarItens(pool, lerPlanilha(TABELA, 2026));
    expect(r.clientesNovos).toBe(5);
    const { rows } = await pool.query(`SELECT c.full_name, c.city FROM sales s JOIN clients c ON c.id = s.client_id WHERE s.client_name = 'Giovana'`);
    expect(rows).toEqual([{ full_name: "GIOVANA", city: "Salvador" }]); // usou o cadastro que já existia
  });

  it("duas vendas iguais na mesma colagem entram as duas; e se uma já existia, só a outra entra", async () => {
    const texto = "05/09\tLUCIA\tVAREJO\t50,00\tPix à vista\n05/09\tLUCIA\tVAREJO\t50,00\tPix à vista";
    let r = await importarItens(pool, lerPlanilha(texto, 2026));
    expect(r.vendas).toBe(2);
    expect(r.clientesNovos).toBe(1); // um cliente só, mesmo com duas vendas
    r = await importarItens(pool, lerPlanilha(texto + "\n05/09\tLUCIA\tVAREJO\t50,00\tPix à vista", 2026));
    expect(r).toMatchObject({ vendas: 1, jaExistiam: 2 });
  });

  it("a vendedora Fernanda é reaproveitada se já existe, e criada se não existe", async () => {
    await pool.query(`INSERT INTO sellers (name) VALUES ('fernanda')`);
    await importarItens(pool, lerPlanilha("05/09\tLUCIA\tVAREJO\t50,00\tPix à vista", 2026));
    const { rows } = await pool.query(`SELECT s.seller_id, v.name FROM sales s JOIN sellers v ON v.id = s.seller_id`);
    expect(rows).toHaveLength(1);
    expect((await pool.query(`SELECT count(*)::int AS n FROM sellers`)).rows[0].n).toBe(1);
  });

  it("linhas ignoradas não gravam nada, e as boas entram", async () => {
    const texto = "05/09\tLUCIA\tVAREJO\t50,00\tPix à vista\n05/09\tMARIA\tATACADO\t99,00\tPix à vista";
    const r = await importarItens(pool, lerPlanilha(texto, 2026));
    expect(r).toMatchObject({ vendas: 1, ignoradas: 1 });
  });
});
