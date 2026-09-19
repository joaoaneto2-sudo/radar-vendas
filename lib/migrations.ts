import type { Pool } from "pg";

// Histórico de versões do banco de dados.
// Regra de ouro: NUNCA editar uma migração que já foi aplicada. Para mudar algo,
// crie uma migração nova no fim da lista. O banco guarda, na tabela
// schema_migrations, quais já rodaram, e cada uma roda uma única vez.

export interface Migration {
  id: string;
  name: string;
  statements: string[];
}

// Versão 1: exatamente o que o radar já fazia antes de existir este histórico.
// Foi escrita para poder rodar de novo sem estragar nada (é "idempotente"),
// porque o banco real já tem tudo isso criado.
export const LEGACY_BASELINE_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS sales (
    id SERIAL PRIMARY KEY,
    sale_date DATE NOT NULL,
    sale_type TEXT NOT NULL,
    seller TEXT NOT NULL,
    product_type TEXT NOT NULL,
    manufacturer TEXT,
    supplier TEXT,
    warranty TEXT,
    cost NUMERIC(12,2) NOT NULL,
    sale_value NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL,
    installments_count INT,
    installments_dates TEXT,
    client_name TEXT NOT NULL,
    client_nickname TEXT,
    client_city TEXT,
    client_phone TEXT,
    client_birthday DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS manufacturers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sellers (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS clients (
    id SERIAL PRIMARY KEY,
    full_name TEXT NOT NULL,
    nickname TEXT,
    city TEXT,
    phone TEXT,
    birthday DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    category TEXT NOT NULL,
    subtype TEXT NOT NULL,
    jewelry_type TEXT NOT NULL,
    name TEXT NOT NULL,
    manufacturer_id INT REFERENCES manufacturers(id) ON DELETE SET NULL,
    supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
    cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    price NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock_qty INT NOT NULL DEFAULT 0,
    warranty TEXT,
    photo_url TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE sales ADD COLUMN IF NOT EXISTS product_id INT REFERENCES products(id) ON DELETE SET NULL`,
  `ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_id INT REFERENCES clients(id) ON DELETE SET NULL`,
  `ALTER TABLE sales ADD COLUMN IF NOT EXISTS seller_id INT REFERENCES sellers(id) ON DELETE SET NULL`,
  // Nada pode impedir de salvar uma venda: todo campo pode ser completado depois.
  `ALTER TABLE sales ALTER COLUMN sale_type DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN seller DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN product_type DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN cost DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN sale_value DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN payment_method DROP NOT NULL`,
  `ALTER TABLE sales ALTER COLUMN client_name DROP NOT NULL`,
  // O mesmo vale para produtos: dá para salvar só com a foto e o preço, ou menos.
  `ALTER TABLE products ALTER COLUMN category DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN subtype DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN jewelry_type DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN name DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN cost DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN cost DROP DEFAULT`,
  `ALTER TABLE products ALTER COLUMN price DROP NOT NULL`,
  `ALTER TABLE products ALTER COLUMN price DROP DEFAULT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS material TEXT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS gemstone TEXT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS age_group TEXT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS gender TEXT`,
  `ALTER TABLE products ADD COLUMN IF NOT EXISTS karat TEXT`,
  `ALTER TABLE clients ALTER COLUMN full_name DROP NOT NULL`,
];

export const MIGRATIONS: Migration[] = [
  {
    id: "001",
    name: "base do radar (vendas, cadastros, produtos)",
    statements: LEGACY_BASELINE_STATEMENTS,
  },
  {
    id: "002",
    name: "parametros do acordo e campos financeiros da venda",
    statements: [
      // Uma única linha (id = 1) com as regras do acordo entre João e Fernanda.
      `CREATE TABLE IF NOT EXISTS agreement_settings (
        id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        partnership_start DATE NOT NULL DEFAULT '2026-09-01',
        retail_replenish_pct NUMERIC(5,2) NOT NULL DEFAULT 30
          CHECK (retail_replenish_pct BETWEEN 0 AND 100),
        wholesale_replenish_pct NUMERIC(5,2) NOT NULL DEFAULT 0
          CHECK (wholesale_replenish_pct BETWEEN 0 AND 100),
        joao_share_pct NUMERIC(5,2) NOT NULL DEFAULT 50
          CHECK (joao_share_pct BETWEEN 0 AND 100),
        initial_stock_value NUMERIC(12,2) NOT NULL DEFAULT 15000
          CHECK (initial_stock_value >= 0),
        cascade_mode TEXT NOT NULL DEFAULT 'recebimento'
          CHECK (cascade_mode IN ('recebimento', 'venda')),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `INSERT INTO agreement_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS price_tier TEXT NOT NULL DEFAULT 'varejo'
        CHECK (price_tier IN ('varejo', 'atacado'))`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_costs NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (sale_costs >= 0)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_fee NUMERIC(12,2) NOT NULL DEFAULT 0
        CHECK (payment_fee >= 0)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ativa'
        CHECK (status IN ('ativa', 'cancelada'))`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`,
      `CREATE INDEX IF NOT EXISTS sales_sale_date_idx ON sales (sale_date)`,
    ],
  },
  {
    id: "003",
    name: "parcelas a receber e consignado",
    statements: [
      // "Atrasada" não é guardada: é uma prevista cuja data já passou.
      `CREATE TABLE IF NOT EXISTS sale_payments (
        id SERIAL PRIMARY KEY,
        sale_id INT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        due_date DATE NOT NULL,
        amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
        status TEXT NOT NULL DEFAULT 'prevista' CHECK (status IN ('prevista', 'recebida')),
        received_date DATE,
        note TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (status <> 'recebida' OR received_date IS NOT NULL)
      )`,
      `CREATE INDEX IF NOT EXISTS sale_payments_sale_idx ON sale_payments (sale_id)`,
      `CREATE INDEX IF NOT EXISTS sale_payments_status_due_idx ON sale_payments (status, due_date)`,
      `CREATE TABLE IF NOT EXISTS consignments (
        id SERIAL PRIMARY KEY,
        client_id INT REFERENCES clients(id) ON DELETE SET NULL,
        person_name TEXT,
        out_date DATE NOT NULL,
        expected_settlement_date DATE,
        status TEXT NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'encerrado')),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS consignment_items (
        id SERIAL PRIMARY KEY,
        consignment_id INT NOT NULL REFERENCES consignments(id) ON DELETE CASCADE,
        product_id INT REFERENCES products(id) ON DELETE SET NULL,
        description TEXT,
        quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
        unit_cost NUMERIC(12,2),
        unit_price NUMERIC(12,2),
        status TEXT NOT NULL DEFAULT 'com_cliente'
          CHECK (status IN ('com_cliente', 'vendida', 'devolvida')),
        settled_date DATE,
        sale_id INT REFERENCES sales(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS consignment_items_consignment_idx ON consignment_items (consignment_id)`,
    ],
  },
  {
    id: "004",
    name: "compras de estoque, fundo de reposicao, passivo e pagamentos do Joao",
    statements: [
      `CREATE TABLE IF NOT EXISTS stock_purchases (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('inicial', 'reposicao')),
        amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
        purchase_date DATE,
        payment_method TEXT,
        supplier_id INT REFERENCES suppliers(id) ON DELETE SET NULL,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      // Quanto do fundo de reposicao ja foi usado para pagar cada compra.
      `CREATE TABLE IF NOT EXISTS fund_payments (
        id SERIAL PRIMARY KEY,
        purchase_id INT NOT NULL REFERENCES stock_purchases(id) ON DELETE CASCADE,
        paid_date DATE NOT NULL,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS liabilities (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        responsible TEXT NOT NULL DEFAULT 'Fernanda',
        total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
        due_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS liability_payments (
        id SERIAL PRIMARY KEY,
        liability_id INT NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,
        paid_date DATE NOT NULL,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      // Pagamentos diretos do Joao a Fernanda pelo estoque inicial (fora das vendas).
      `CREATE TABLE IF NOT EXISTS joao_payments (
        id SERIAL PRIMARY KEY,
        paid_date DATE NOT NULL,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    ],
  },
  {
    id: "005",
    name: "usuarios e tentativas de login",
    statements: [
      // A senha nunca é guardada: só o "resumo" criptografado dela (password_hash).
      `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email))`,
      // Registro das tentativas, para bloquear quem fica chutando senha ou código de convite.
      `CREATE TABLE IF NOT EXISTS login_attempts (
        id SERIAL PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('login', 'register')),
        identifier TEXT NOT NULL,
        ip TEXT,
        success BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS login_attempts_lookup_idx ON login_attempts (kind, identifier, created_at)`,
      `CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts (kind, ip, created_at)`,
    ],
  },
  {
    id: "006",
    name: "consignado, atacado com comissao do fabricante, despesas e fatura do cartao",
    statements: [
      // Tipos de venda: varejo, atacado e consignado. Apaga qualquer regra antiga sobre
      // price_tier (sem depender do nome que o banco deu a ela) e cria a nova.
      `DO $$
       DECLARE regra RECORD;
       BEGIN
         FOR regra IN
           SELECT conname FROM pg_constraint
            WHERE conrelid = 'sales'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%price_tier%'
         LOOP
           EXECUTE format('ALTER TABLE sales DROP CONSTRAINT %I', regra.conname);
         END LOOP;
       END $$`,
      `ALTER TABLE sales ADD CONSTRAINT sales_price_tier_check
         CHECK (price_tier IN ('varejo', 'atacado', 'consignado'))`,
      `ALTER TABLE agreement_settings ADD COLUMN IF NOT EXISTS consignment_replenish_pct NUMERIC(5,2)
         NOT NULL DEFAULT 30 CHECK (consignment_replenish_pct BETWEEN 0 AND 100)`,

      // Fabricantes que a sociedade REPRESENTA: quanto fica com a gente (comissao) e em
      // quantos dias depois de receber o estoque o fabricante paga essa comissao.
      `ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS represented BOOLEAN NOT NULL DEFAULT false`,
      `ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2)
         CHECK (commission_pct IS NULL OR commission_pct BETWEEN 0 AND 100)`,
      `ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS commission_days INT NOT NULL DEFAULT 15
         CHECK (commission_days >= 0)`,
      `ALTER TABLE manufacturers ADD CONSTRAINT manufacturers_represented_needs_pct
         CHECK (NOT represented OR commission_pct IS NOT NULL)`,

      // Venda de atacado: de qual fabricante e quando recebemos o estoque dele.
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS manufacturer_id INT REFERENCES manufacturers(id) ON DELETE SET NULL`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS stock_received_date DATE`,
      // A parcela (comissao) pode ficar sem data enquanto o estoque nao chega.
      `ALTER TABLE sale_payments ALTER COLUMN due_date DROP NOT NULL`,

      // Despesas da empresa: saem do lucro antes da divisao.
      `CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        expense_date DATE NOT NULL,
        description TEXT NOT NULL,
        category TEXT,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (expense_date)`,

      // Fatura do cartao: o total e as partes em que ela se divide.
      `CREATE TABLE IF NOT EXISTS card_invoices (
        id SERIAL PRIMARY KEY,
        description TEXT NOT NULL,
        due_date DATE NOT NULL,
        closing_date DATE,
        total_amount NUMERIC(12,2) CHECK (total_amount IS NULL OR total_amount >= 0),
        status TEXT NOT NULL DEFAULT 'aguardando_fechamento'
          CHECK (status IN ('aguardando_fechamento', 'fechada', 'paga')),
        paid_date DATE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS card_invoice_parts (
        id SERIAL PRIMARY KEY,
        invoice_id INT NOT NULL REFERENCES card_invoices(id) ON DELETE CASCADE,
        nature TEXT NOT NULL
          CHECK (nature IN ('pessoal_fernanda', 'estoque_inicial', 'reposicao', 'despesa_empresa')),
        description TEXT,
        amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
        stock_purchase_id INT REFERENCES stock_purchases(id) ON DELETE SET NULL,
        liability_id INT REFERENCES liabilities(id) ON DELETE SET NULL,
        expense_id INT REFERENCES expenses(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX IF NOT EXISTS card_invoice_parts_invoice_idx ON card_invoice_parts (invoice_id)`,
    ],
  },
  {
    id: "007",
    name: "dados da compra no cadastro da peca (data, forma de pagamento, quantidade) e canal varejo/atacado",
    statements: [
      // A data da compra separa as duas fases do negocio: antes de 01/09 (estoque inicial,
      // pago pela Fernanda) e de 01/09 em diante. Tudo opcional: dá para completar depois.
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_date DATE`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_payment_method TEXT`,
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_qty INT
         CHECK (purchase_qty IS NULL OR purchase_qty >= 0)`,
      `CREATE INDEX IF NOT EXISTS products_purchase_date_idx ON products (purchase_date)`,
      // Canal da peça: varejo = estoque nosso (comprado por nós); atacado = peça do fabricante
      // representado, vendida em pronta entrega (não é compra nossa, não entra no estoque comprado).
      `ALTER TABLE products ADD COLUMN IF NOT EXISTS sale_channel TEXT NOT NULL DEFAULT 'varejo'`,
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'products_sale_channel_check') THEN
           ALTER TABLE products ADD CONSTRAINT products_sale_channel_check
             CHECK (sale_channel IN ('varejo', 'atacado'));
         END IF;
       END $$`,
      // Modalidade do atacado do fabricante. Hoje so existe pronta entrega (Bia Belutti).
      `ALTER TABLE manufacturers ADD COLUMN IF NOT EXISTS wholesale_mode TEXT NOT NULL DEFAULT 'pronta_entrega'`,
      `DO $$ BEGIN
         IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'manufacturers_wholesale_mode_check') THEN
           ALTER TABLE manufacturers ADD CONSTRAINT manufacturers_wholesale_mode_check
             CHECK (wholesale_mode IN ('pronta_entrega', 'encomenda'));
         END IF;
       END $$`,
    ],
  },
  {
    id: "008",
    name: "recebimentos (aportes, comissoes de fabricantes e outras receitas) no lugar de joao_payments",
    statements: [
      // Um livro so para o dinheiro que entra fora das vendas. "recebida" tem data do recebimento;
      // "prevista" e um lembrete, com data prevista opcional.
      `CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        kind TEXT NOT NULL CHECK (kind IN ('aporte_socio', 'comissao_fabricante', 'outra_receita')),
        status TEXT NOT NULL DEFAULT 'recebida' CHECK (status IN ('prevista', 'recebida')),
        received_date DATE,
        expected_date DATE,
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        partner TEXT CHECK (partner IS NULL OR partner IN ('joao', 'fernanda')),
        manufacturer_id INT REFERENCES manufacturers(id),
        sale_id INT REFERENCES sales(id) ON DELETE SET NULL,
        from_name TEXT,
        from_nickname TEXT,
        reason TEXT,
        payment_method TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (status <> 'recebida' OR received_date IS NOT NULL),
        CHECK (kind <> 'aporte_socio' OR (partner IS NOT NULL AND status = 'recebida')),
        CHECK (kind <> 'comissao_fabricante' OR manufacturer_id IS NOT NULL)
      )`,
      `CREATE INDEX IF NOT EXISTS receipts_status_date_idx ON receipts (status, received_date)`,
      `CREATE INDEX IF NOT EXISTS receipts_manufacturer_idx ON receipts (manufacturer_id)`,
      // Os pagamentos do Joao viram aportes dele e a tabela antiga sai (dados copiados antes).
      `INSERT INTO receipts (kind, status, received_date, amount, partner, reason)
         SELECT 'aporte_socio', 'recebida', paid_date, amount, 'joao',
                COALESCE(notes, 'Pagamento da divida do estoque inicial')
           FROM joao_payments
          ORDER BY paid_date, id`,
      `DROP TABLE joao_payments`,
    ],
  },
  {
    id: "009",
    name: "desconto e cashback na venda",
    statements: [
      // sale_value continua sendo o que o cliente PAGA. gross_value é o valor de tabela
      // (antes do desconto e do cashback usado); fica vazio quando não houve nenhum dos dois.
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS gross_value NUMERIC(12,2)
         CHECK (gross_value IS NULL OR gross_value >= 0)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5,2)
         CHECK (discount_pct IS NULL OR discount_pct BETWEEN 0 AND 100)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashback_pct NUMERIC(5,2)
         CHECK (cashback_pct IS NULL OR cashback_pct BETWEEN 0 AND 100)`,
      // Crédito que o cliente ganhou nesta venda e saldo que ele usou nela.
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashback_earned NUMERIC(12,2) NOT NULL DEFAULT 0
         CHECK (cashback_earned >= 0)`,
      `ALTER TABLE sales ADD COLUMN IF NOT EXISTS cashback_used NUMERIC(12,2) NOT NULL DEFAULT 0
         CHECK (cashback_used >= 0)`,
      `CREATE INDEX IF NOT EXISTS sales_client_idx ON sales (client_id)`,
    ],
  },
];

// Número qualquer, só para "reservar a vez" quando duas cópias do site ligarem
// ao mesmo tempo e tentarem aplicar migrações juntas.
const LOCK_ID = 727274;

/**
 * Aplica as migrações que ainda não rodaram. Tudo ou nada: se uma falhar,
 * nenhuma fica pela metade. Devolve os ids que foram aplicados agora.
 */
export async function runMigrations(pool: Pool, opcoes: { ate?: string } = {}): Promise<string[]> {
  const aplicadas: string[] = [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [LOCK_ID]);
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`
    );
    const { rows } = await client.query("SELECT id FROM schema_migrations");
    const jaFeitas = new Set<string>(rows.map((r: { id: string }) => r.id));

    for (const migracao of MIGRATIONS) {
      if (jaFeitas.has(migracao.id)) continue;
      if (opcoes.ate && migracao.id > opcoes.ate) break; // só usado nos testes, para simular um banco mais antigo
      for (const comando of migracao.statements) {
        await client.query(comando);
      }
      await client.query("INSERT INTO schema_migrations (id, name) VALUES ($1, $2)", [
        migracao.id,
        migracao.name,
      ]);
      aplicadas.push(migracao.id);
    }
    await client.query("COMMIT");
  } catch (erro) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw erro;
  } finally {
    client.release();
  }
  return aplicadas;
}
