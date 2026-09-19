import { afterEach, describe, expect, it } from "vitest";
import { LEGACY_BASELINE_STATEMENTS, MIGRATIONS, runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const TODOS_OS_IDS = MIGRATIONS.map((m) => m.id);

type Descartavel = Awaited<ReturnType<typeof criarBancoDescartavel>>;
const abertos: Descartavel[] = [];

async function novoBanco() {
  const banco = await criarBancoDescartavel();
  abertos.push(banco);
  return banco;
}

afterEach(async () => {
  while (abertos.length) await abertos.pop()!.apagar();
});

describe.skipIf(!disponivel)("migrações do banco", () => {
  it("num banco vazio, aplica todas as versões, uma vez só", async () => {
    const { pool } = await novoBanco();

    expect(await runMigrations(pool)).toEqual(TODOS_OS_IDS);
    expect(await runMigrations(pool)).toEqual([]); // rodar de novo não faz nada

    const { rows } = await pool.query("SELECT id FROM schema_migrations ORDER BY id");
    expect(rows.map((r) => r.id)).toEqual(TODOS_OS_IDS);
  });

  it("cria as tabelas novas do financeiro", async () => {
    const { pool } = await novoBanco();
    await runMigrations(pool);

    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const tabelas = rows.map((r) => r.table_name);
    for (const esperada of [
      "sales", "clients", "products", "manufacturers", "suppliers", "sellers",
      "agreement_settings", "sale_payments", "consignments", "consignment_items",
      "stock_purchases", "fund_payments", "liabilities", "liability_payments",
      "receipts", "users", "login_attempts", "expenses", "card_invoices",
      "card_invoice_parts", "schema_migrations",
    ]) {
      expect(tabelas).toContain(esperada);
    }
  });

  it("os parâmetros do acordo já nascem com as regras combinadas", async () => {
    const { pool } = await novoBanco();
    await runMigrations(pool);

    const { rows } = await pool.query("SELECT * FROM agreement_settings");
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].retail_replenish_pct)).toBe(30);
    expect(Number(rows[0].wholesale_replenish_pct)).toBe(0);
    expect(Number(rows[0].joao_share_pct)).toBe(50);
    expect(Number(rows[0].initial_stock_value)).toBe(15000);
    expect(Number(rows[0].consignment_replenish_pct)).toBe(30);
    expect(rows[0].cascade_mode).toBe("recebimento");
  });

  it("banco que já era o do radar antigo (sem histórico) recebe as novidades sem perder dados", async () => {
    const { pool } = await novoBanco();

    // Reproduz o banco real de hoje: tabelas criadas pelo método antigo, sem schema_migrations.
    for (const comando of LEGACY_BASELINE_STATEMENTS) await pool.query(comando);
    await pool.query(
      `INSERT INTO sales (sale_date, client_name, sale_value, payment_method)
       VALUES ('2026-09-01', 'DANIEL ESPOSO DE MICHELE', 590.00, 'Pix à vista')`
    );

    expect(await runMigrations(pool)).toEqual(TODOS_OS_IDS);

    const { rows } = await pool.query(
      `SELECT client_name, sale_value, payment_method, price_tier, status, sale_costs, payment_fee
         FROM sales`
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].client_name).toBe("DANIEL ESPOSO DE MICHELE");
    expect(rows[0].sale_value).toBe("590.00");
    expect(rows[0].payment_method).toBe("Pix à vista");
    // Campos novos ganham valores padrão:
    expect(rows[0].price_tier).toBe("varejo");
    expect(rows[0].status).toBe("ativa");
    expect(rows[0].sale_costs).toBe("0.00");
    expect(rows[0].payment_fee).toBe("0.00");

    // A regra antiga de tipos (só varejo e atacado) foi trocada pela nova, com consignado.
    await expect(
      pool.query(`INSERT INTO sales (sale_date, price_tier) VALUES ('2026-09-02', 'consignado')`)
    ).resolves.toBeDefined();
    await expect(
      pool.query(`INSERT INTO sales (sale_date, price_tier) VALUES ('2026-09-02', 'outro')`)
    ).rejects.toThrow();
  });

  it("duas cópias do site ligando ao mesmo tempo não brigam", async () => {
    const { pool } = await novoBanco();

    const [a, b] = await Promise.all([runMigrations(pool), runMigrations(pool)]);

    expect(a.length + b.length).toBe(TODOS_OS_IDS.length); // cada versão foi aplicada uma única vez
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM schema_migrations");
    expect(rows[0].n).toBe(TODOS_OS_IDS.length);
  });
});

describe.skipIf(!disponivel)("regras de proteção do banco", () => {
  async function bancoPronto() {
    const { pool } = await novoBanco();
    await runMigrations(pool);
    await pool.query(`INSERT INTO sales (sale_date, sale_value) VALUES ('2026-09-01', 100.00)`);
    return pool;
  }

  it("parcela recebida precisa ter a data do recebimento", async () => {
    const pool = await bancoPronto();
    await expect(
      pool.query(
        `INSERT INTO sale_payments (sale_id, due_date, amount, status) VALUES (1, '2026-09-10', 50, 'recebida')`
      )
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO sale_payments (sale_id, due_date, amount, status, received_date)
         VALUES (1, '2026-09-10', 50, 'recebida', '2026-09-11')`
      )
    ).resolves.toBeDefined();
  });

  it("recusa situação, tipo de preço e valores inválidos", async () => {
    const pool = await bancoPronto();
    await expect(pool.query(`UPDATE sales SET price_tier = 'outro' WHERE id = 1`)).rejects.toThrow();
    await expect(pool.query(`UPDATE sales SET status = 'apagada' WHERE id = 1`)).rejects.toThrow();
    await expect(pool.query(`UPDATE sales SET sale_costs = -1 WHERE id = 1`)).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO receipts (kind, status, received_date, amount, partner)
         VALUES ('aporte_socio', 'recebida', '2026-09-01', 0, 'joao')`
      )
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO stock_purchases (description, kind, amount) VALUES ('x', 'outra', 10)`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO consignments (out_date) VALUES ('2026-09-01')`)
    ).resolves.toBeDefined();
    await expect(
      pool.query(`INSERT INTO consignment_items (consignment_id, quantity) VALUES (1, 0)`)
    ).rejects.toThrow();
  });

  it("fabricante representado precisa ter a comissão; percentual entre 0 e 100", async () => {
    const pool = await bancoPronto();
    await expect(
      pool.query(`INSERT INTO manufacturers (name, represented) VALUES ('Sem comissao', true)`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO manufacturers (name, represented, commission_pct) VALUES ('Muito', true, 101)`)
    ).rejects.toThrow();
    await expect(
      pool.query(
        `INSERT INTO manufacturers (name, represented, commission_pct, commission_days)
         VALUES ('Bia Belutti', true, 20, 15)`
      )
    ).resolves.toBeDefined();
    // Fabricante que não é representado não precisa de comissão.
    await expect(pool.query(`INSERT INTO manufacturers (name) VALUES ('Outro fabricante')`)).resolves.toBeDefined();
    const { rows } = await pool.query(`SELECT commission_days FROM manufacturers WHERE name = 'Outro fabricante'`);
    expect(rows[0].commission_days).toBe(15); // prazo padrão
  });

  it("dados da compra da peça: tudo opcional; canal só varejo/atacado; quantidade não negativa", async () => {
    const pool = await bancoPronto();

    // Peça já existente (sem dados da compra) continua valendo, como varejo.
    await pool.query(`INSERT INTO products (name) VALUES ('Peça antiga')`);
    const antiga = await pool.query(
      `SELECT purchase_date, purchase_payment_method, purchase_qty, sale_channel FROM products WHERE name = 'Peça antiga'`
    );
    expect(antiga.rows[0]).toEqual({
      purchase_date: null,
      purchase_payment_method: null,
      purchase_qty: null,
      sale_channel: "varejo",
    });

    // A data volta como texto AAAA-MM-DD (sem fuso).
    await pool.query(
      `INSERT INTO products (name, purchase_date, purchase_payment_method, purchase_qty)
       VALUES ('Peça de agosto', '2026-08-31', 'Cartão pessoal da Fernanda', 12)`
    );
    const { rows } = await pool.query(
      `SELECT to_char(purchase_date, 'YYYY-MM-DD') AS d, purchase_qty FROM products WHERE name = 'Peça de agosto'`
    );
    expect(rows[0]).toEqual({ d: "2026-08-31", purchase_qty: 12 });

    await expect(pool.query(`INSERT INTO products (name, purchase_qty) VALUES ('Negativa', -1)`)).rejects.toThrow();
    await expect(pool.query(`INSERT INTO products (name, sale_channel) VALUES ('Canal ruim', 'outro')`)).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO products (name, sale_channel) VALUES ('Da Bia', 'atacado')`)
    ).resolves.toBeDefined();
  });

  it("fabricante: modalidade do atacado é pronta entrega (padrão) ou encomenda", async () => {
    const pool = await bancoPronto();
    await pool.query(`INSERT INTO manufacturers (name) VALUES ('Padrão')`);
    const { rows } = await pool.query(`SELECT wholesale_mode FROM manufacturers WHERE name = 'Padrão'`);
    expect(rows[0].wholesale_mode).toBe("pronta_entrega");
    await expect(
      pool.query(`INSERT INTO manufacturers (name, wholesale_mode) VALUES ('Errada', 'consignado')`)
    ).rejects.toThrow();
  });

  it("recebimentos: regras de proteção (data, sócio, fabricante e valor)", async () => {
    const pool = await bancoPronto();
    await pool.query(`INSERT INTO manufacturers (name, represented, commission_pct) VALUES ('Bia', true, 20)`);

    // Recebida precisa da data do recebimento; prevista pode ficar sem data.
    await expect(
      pool.query(`INSERT INTO receipts (kind, status, amount) VALUES ('outra_receita', 'recebida', 10)`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO receipts (kind, status, amount) VALUES ('outra_receita', 'prevista', 10)`)
    ).resolves.toBeDefined();

    // Aporte precisa de sócio e não pode ser só previsto; sócio só João ou Fernanda.
    await expect(
      pool.query(`INSERT INTO receipts (kind, status, received_date, amount) VALUES ('aporte_socio', 'recebida', '2026-09-01', 10)`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO receipts (kind, status, amount, partner) VALUES ('aporte_socio', 'prevista', 10, 'joao')`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO receipts (kind, status, received_date, amount, partner) VALUES ('aporte_socio', 'recebida', '2026-09-01', 10, 'outro')`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO receipts (kind, status, received_date, amount, partner) VALUES ('aporte_socio', 'recebida', '2026-09-01', 1000, 'fernanda')`)
    ).resolves.toBeDefined();

    // Comissão precisa do fabricante; tipo e valor inválidos são recusados.
    await expect(
      pool.query(`INSERT INTO receipts (kind, status, received_date, amount) VALUES ('comissao_fabricante', 'recebida', '2026-09-01', 10)`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO receipts (kind, status, received_date, amount, manufacturer_id) VALUES ('comissao_fabricante', 'recebida', '2026-09-01', 10, 1)`)
    ).resolves.toBeDefined();
    await expect(
      pool.query(`INSERT INTO receipts (kind, status, received_date, amount) VALUES ('venda', 'recebida', '2026-09-01', 10)`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO receipts (kind, status, received_date, amount) VALUES ('outra_receita', 'recebida', '2026-09-01', 0)`)
    ).rejects.toThrow();

    // Não dá para apagar um fabricante que já pagou comissão (o histórico não some).
    await expect(pool.query(`DELETE FROM manufacturers WHERE name = 'Bia'`)).rejects.toThrow();
  });

  it("os pagamentos do João que já existiam viram aportes dele, sem perder nada", async () => {
    const { pool } = await novoBanco();
    await runMigrations(pool, { ate: "007" });
    await pool.query(
      `INSERT INTO joao_payments (paid_date, amount, notes) VALUES ('2026-09-01', 1000, 'Pagamento inicial'), ('2026-09-15', 250.50, NULL)`
    );

    expect(await runMigrations(pool)).toEqual(TODOS_OS_IDS.filter((id) => id > "007")); // 008 em diante

    const { rows } = await pool.query(
      `SELECT kind, status, to_char(received_date, 'YYYY-MM-DD') AS d, amount, partner, reason FROM receipts ORDER BY received_date`
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "aporte_socio", status: "recebida", d: "2026-09-01", amount: "1000.00", partner: "joao", reason: "Pagamento inicial" });
    expect(rows[1]).toMatchObject({ d: "2026-09-15", amount: "250.50", partner: "joao" });
    const antiga = await pool.query(`SELECT to_regclass('public.joao_payments') AS t`);
    expect(antiga.rows[0].t).toBeNull();
  });

  it("parcela pode ficar sem data enquanto o estoque do fabricante não chega", async () => {
    const pool = await bancoPronto();
    await expect(
      pool.query(`INSERT INTO sale_payments (sale_id, due_date, amount) VALUES (1, NULL, 20)`)
    ).resolves.toBeDefined();
  });

  it("despesa precisa de valor maior que zero", async () => {
    const pool = await bancoPronto();
    await expect(
      pool.query(`INSERT INTO expenses (expense_date, description, amount) VALUES ('2026-09-05', 'Anúncios', 0)`)
    ).rejects.toThrow();
    await expect(
      pool.query(`INSERT INTO expenses (expense_date, description, amount) VALUES ('2026-09-05', 'Anúncios', 100)`)
    ).resolves.toBeDefined();
  });

  it("fatura do cartão: só as 4 naturezas valem, e apagar a fatura leva as partes", async () => {
    const pool = await bancoPronto();
    await pool.query(`INSERT INTO card_invoices (description, due_date) VALUES ('Fatura 30/09', '2026-09-30')`);
    await expect(
      pool.query(`INSERT INTO card_invoice_parts (invoice_id, nature, amount) VALUES (1, 'outra', 10)`)
    ).rejects.toThrow();
    for (const natureza of ["pessoal_fernanda", "estoque_inicial", "reposicao", "despesa_empresa"]) {
      await pool.query(`INSERT INTO card_invoice_parts (invoice_id, nature, amount) VALUES (1, $1, 10)`, [natureza]);
    }
    await pool.query(`DELETE FROM card_invoices WHERE id = 1`);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM card_invoice_parts");
    expect(rows[0].n).toBe(0);
  });

  it("só pode existir uma linha de parâmetros do acordo", async () => {
    const pool = await bancoPronto();
    await expect(pool.query(`INSERT INTO agreement_settings (id) VALUES (2)`)).rejects.toThrow();
  });

  it("apagar uma venda leva junto as parcelas dela", async () => {
    const pool = await bancoPronto();
    await pool.query(`INSERT INTO sale_payments (sale_id, due_date, amount) VALUES (1, '2026-09-10', 100)`);
    await pool.query(`DELETE FROM sales WHERE id = 1`);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM sale_payments");
    expect(rows[0].n).toBe(0);
  });
});
