// Acrescenta EXEMPLOS DE DEMONSTRAÇÃO ao banco de TESTE (atacado, consignado, despesa e fatura),
// para você ver como o painel mostra cada regra. Todos os nomes começam com "DEMO" e os
// valores são inventados. Não são dados reais.
// Trava de segurança: só roda em banco local (localhost). Nunca toca o banco real.
// Uso: npm run seed:demo   (já carrega o briefing antes)

import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não encontrada. Use: npm run seed:demo");
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
  await client.query("BEGIN");

  // Fabricante representado: 20% de comissão, paga 15 dias depois de receber o estoque.
  const { rows: fab } = await client.query(
    `INSERT INTO manufacturers (name, represented, commission_pct, commission_days, wholesale_mode)
     VALUES ('Bia Belutti (DEMO)', true, 20, 15, 'pronta_entrega')
     ON CONFLICT (name) DO UPDATE SET represented = true, commission_pct = 20, commission_days = 15
     RETURNING id`
  );
  const fabId = fab[0].id;

  // Produtos de exemplo: estoque inicial (antes de 01/09), compra depois de 01/09,
  // uma peça sem data da compra e uma peça de atacado (do fabricante, fora do estoque comprado).
  await client.query(`DELETE FROM products WHERE name LIKE 'DEMO %'`);
  await client.query(
    `INSERT INTO products (name, category, subtype, jewelry_type, cost, price, stock_qty, purchase_date, purchase_payment_method, purchase_qty, sale_channel, manufacturer_id) VALUES
       ('DEMO Anel Solitário Zircônia', 'Anéis', 'Solitário', 'Semijoia', 60.00, 180.00, 8, '2026-08-12', 'Cartão pessoal da Fernanda', 10, 'varejo', NULL),
       ('DEMO Brinco Argola Folheado', 'Brincos', 'Argola', 'Semijoia', 35.00, 110.00, 15, '2026-08-25', 'Cartão pessoal da Fernanda', 20, 'varejo', NULL),
       ('DEMO Pulseira Riviera', 'Pulseiras', 'Riviera', 'Semijoia', 90.00, 260.00, 6, '2026-09-05', 'Cartão da empresa', 8, 'varejo', NULL),
       ('DEMO Colar Ponto de Luz (sem data da compra)', 'Colares e Correntes', 'Ponto de Luz', 'Semijoia', 45.00, 150.00, 5, NULL, NULL, NULL, 'varejo', NULL),
       ('DEMO Anel Bia Belutti (atacado, pronta entrega)', 'Anéis', 'Outro', 'Semijoia', 50.00, 130.00, 30, NULL, NULL, NULL, 'atacado', $1)`,
    [fabId]
  );

  // Atacado: o cliente paga direto ao fabricante; a sociedade recebe a comissão depois.
  await client.query(
    `INSERT INTO sales (sale_date, client_name, sale_value, price_tier, manufacturer_id, stock_received_date, payment_method) VALUES
       ('2026-09-08', 'DEMO Revendedora Ana (estoque chegou 10/09)', 1500.00, 'atacado', $1, '2026-09-10', 'Pix direto ao fabricante'),
       ('2026-09-01', 'DEMO Revendedora Bia (estoque chegou 03/09, atrasada)', 2000.00, 'atacado', $1, '2026-09-03', 'Pix direto ao fabricante'),
       ('2026-09-02', 'DEMO Revendedora Carla (comissão já recebida)', 800.00, 'atacado', $1, '2026-09-04', 'Pix direto ao fabricante'),
       ('2026-09-15', 'DEMO Revendedora Dani (estoque ainda não chegou)', 1200.00, 'atacado', $1, NULL, 'Pix direto ao fabricante')`,
    [fabId]
  );
  // A Bia Belutti (DEMO) já pagou R$ 160,00 de comissão em 19/09. O recebimento é lançado por
  // fabricante (não por venda) e abate as vendas mais antigas primeiro.
  await client.query(
    `INSERT INTO receipts (kind, status, received_date, amount, manufacturer_id, from_name, from_nickname, reason, payment_method)
     VALUES ('comissao_fabricante', 'recebida', '2026-09-19', 160.00, $1, 'DEMO Revendedora Carla', 'Carla',
             'DEMO comissão paga pela Bia Belutti', 'Pix')`,
    [fabId]
  );

  // Outras receitas: uma já recebida (entra na divisão), uma só lembrete (não entra), e um aporte da Fernanda.
  await client.query(
    `INSERT INTO receipts (kind, status, received_date, expected_date, amount, from_name, from_nickname, reason, payment_method) VALUES
       ('outra_receita', 'recebida', '2026-09-16', NULL, 300.00, 'DEMO Revendedora Lu', 'Lu', 'DEMO comissão de outro ramo', 'Pix'),
       ('outra_receita', 'prevista', NULL, NULL, 250.00, 'DEMO Revendedora Lu', 'Lu', 'DEMO ainda vai pagar, sem data', NULL)`
  );
  await client.query(
    `INSERT INTO receipts (kind, status, received_date, amount, partner, from_name, from_nickname, reason, payment_method)
     VALUES ('aporte_socio', 'recebida', '2026-09-10', 2000.00, 'fernanda', 'Fernanda', 'Fernanda', 'DEMO aporte para um ativo novo', 'Pix')`
  );

  // Consignado: peça que saiu com uma revendedora e foi acertada como venda.
  await client.query(
    `INSERT INTO sales (sale_date, client_name, sale_value, price_tier, payment_method)
     VALUES ('2026-09-14', 'DEMO Revendedora Lu (consignado)', 600.00, 'consignado', 'Não informada')`
  );

  // Despesa da empresa: sai do lucro antes da divisão.
  await client.query(
    `INSERT INTO expenses (expense_date, description, category, amount)
     VALUES ('2026-09-12', 'DEMO Anúncios', 'Marketing', 150.00)`
  );

  // Fatura do cartão que vence em 30/09, dividida nas 4 partes (valores inventados).
  const { rows: fat } = await client.query(
    `INSERT INTO card_invoices (description, due_date, closing_date, total_amount, status)
     VALUES ('DEMO Fatura do cartão da empresa (vence 30/09, valores inventados)', '2026-09-30', '2026-09-22', 12000.00, 'fechada')
     RETURNING id`
  );
  await client.query(
    `INSERT INTO card_invoice_parts (invoice_id, nature, amount, description) VALUES
       ($1, 'pessoal_fernanda', 1500.00, 'DEMO compras pessoais'),
       ($1, 'estoque_inicial', 6000.00, 'DEMO joias compradas antes de 01/09'),
       ($1, 'reposicao', 4000.00, 'DEMO reposição depois de 01/09'),
       ($1, 'despesa_empresa', 500.00, 'DEMO despesas da empresa')`,
    [fat[0].id]
  );

  await client.query("COMMIT");
  console.log("Exemplos de DEMONSTRAÇÃO carregados no banco de TESTE: atacado (4 vendas), recebimentos, consignado, despesa e fatura do cartão.");
} catch (erro) {
  await client.query("ROLLBACK").catch(() => undefined);
  console.error("Falhou e nada foi alterado:", erro.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
