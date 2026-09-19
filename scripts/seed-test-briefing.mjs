// Carrega no banco de TESTE os dados do briefing (seção 5), para conferir o painel.
// Trava de segurança: só roda se o banco for local (localhost). Nunca toca o banco real.
// Uso: npm run seed:teste

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não encontrada. Use: npm run seed:teste");
  process.exit(1);
}

const host = new URL(url).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  console.error(`RECUSADO: este script só roda em banco local. Endereço encontrado: ${host}`);
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const client = await pool.connect();

try {
  const { rows: migracoes } = await client.query("SELECT count(*)::int AS n FROM schema_migrations").catch(() => ({ rows: [{ n: 0 }] }));
  if (migracoes[0].n < 6) {
    console.error("O banco de teste ainda não está na versão mais nova. Abra o radar uma vez (npm run dev), entre em qualquer página que use o banco e tente de novo.");
    process.exit(1);
  }

  await client.query("BEGIN");
  // Limpa só os dados de negócio do banco de teste. Os usuários de login ficam.
  await client.query(
    "TRUNCATE sales, receipts, stock_purchases, liabilities, expenses, card_invoices RESTART IDENTITY CASCADE"
  );

  const vendas = [
    ["2026-09-01", "Vendas do dia (lote 1)", "590.00"],
    ["2026-09-01", "Vendas do dia (lote 2)", "280.00"],
    ["2026-09-02", "Giovana", "82.50"],
    ["2026-09-03", "Andreia Psicóloga", "374.00"],
    ["2026-09-04", "Raquel", "500.00"],
    ["2026-09-04", "Patrícia ADV", "398.46"],
    ["2026-09-06", "Elizabete", "280.00"],
    ["2026-09-11", "Kika", "1276.00"],
    ["2026-09-11", "Michele", "2507.00"],
  ];
  for (const [data, cliente, valor] of vendas) {
    await client.query(
      `INSERT INTO sales (sale_date, client_name, sale_value, payment_method, price_tier)
       VALUES ($1, $2, $3, 'Não informada', 'varejo')`,
      [data, cliente, valor]
    );
  }

  await client.query(
    `INSERT INTO receipts (kind, status, received_date, amount, partner, from_name, from_nickname, reason, payment_method)
     VALUES ('aporte_socio', 'recebida', '2026-09-01', 1000.00, 'joao', 'João', 'João',
             'Pagamento inicial da compra do estoque (briefing)', 'Pix')`
  );

  await client.query(
    `INSERT INTO stock_purchases (description, kind, amount, purchase_date, payment_method, notes) VALUES
       ('Estoque inicial', 'inicial', 15000.00, NULL, 'Cartão da empresa', 'Metade é da Fernanda, metade o João compra dela'),
       ('Reposição CD', 'reposicao', 2302.00, '2026-09-01', 'Cartão da empresa', NULL),
       ('Reposição SM', 'reposicao', 3018.00, '2026-09-03', 'Cartão da empresa', NULL)`
  );

  await client.query(
    `INSERT INTO liabilities (description, responsible, total_amount, notes)
     VALUES ('Passivo da empresa (planilha antiga)', 'Fernanda', 30000.00,
             'CONFIRMAR composição e faturas do cartão (existe também R$ 9.785,50 rotulado Cartão empresa)')`
  );

  await client.query("COMMIT");
  console.log("Banco de TESTE carregado com os dados do briefing: 9 vendas, 1 pagamento do João, 3 compras de estoque, 1 passivo.");
} catch (erro) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Falhou e nada foi alterado:", erro.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
