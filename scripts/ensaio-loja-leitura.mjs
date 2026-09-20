// ENSAIO DO USUARIO DE LEITURA DA LOJA
//
// Conecta como "loja_leitura" e confere duas coisas:
//   1. as consultas da loja funcionam (pecas, uma peca, configuracoes);
//   2. o que e proibido continua proibido (custo, vendas, clientes, escrever).
//
// Como usar (no PowerShell, dentro da pasta do projeto):
//   $env:LOJA_DATABASE_URL = "cole aqui a conexao do usuario loja_leitura (a da copia de teste)"
//   node scripts/ensaio-loja-leitura.mjs
//
// O endereco e a senha ficam so na sua janela do terminal: este script nao imprime nenhum dos dois.
// Ele so LE. As tentativas de escrever sao feitas justamente para ver o banco recusando.

import pg from "pg";

const url = process.env.LOJA_DATABASE_URL;
if (!url) {
  console.error("Falta a variavel LOJA_DATABASE_URL. Veja as instrucoes no alto deste arquivo.");
  process.exit(2);
}

// Consultas da loja (as mesmas de tests/db/store.db.test.ts e do projeto da loja).
const COLUNAS_DA_LOJA = `
  p.id, p.name, p.category, p.subtype, p.jewelry_type, p.material, p.karat, p.gemstone,
  p.warranty, p.public_description, p.price::text AS price, p.sale_price::text AS sale_price,
  p.stock_qty, p.featured, p.photo_url, p.created_at,
  COALESCE(
    (SELECT json_agg(f.url ORDER BY f.position, f.id) FROM product_photos f WHERE f.product_id = p.id),
    '[]'::json
  ) AS extras`;
const VISIVEL_NA_LOJA = `p.sale_channel = 'varejo' AND p.active = true AND p.show_online = true AND p.price > 0`;
const SQL_PECAS = `SELECT ${COLUNAS_DA_LOJA} FROM products p WHERE ${VISIVEL_NA_LOJA} ORDER BY p.created_at DESC, p.id DESC`;
const SQL_PECA = `SELECT ${COLUNAS_DA_LOJA} FROM products p WHERE ${VISIVEL_NA_LOJA} AND p.id = $1`;
const SQL_CONFIG = `SELECT key, value::text AS value FROM store_settings`;

const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });

let falhas = 0;
const ok = (texto) => console.log(`  [ok]     ${texto}`);
const falhou = (texto) => {
  falhas += 1;
  console.log(`  [FALHOU] ${texto}`);
};

async function deveLer(nome, sql, params = []) {
  try {
    const r = await client.query(sql, params);
    ok(`${nome} (${r.rows.length} linha${r.rows.length === 1 ? "" : "s"})`);
    return r.rows;
  } catch (e) {
    falhou(`${nome}: ${e.message}`);
    return [];
  }
}

async function deveSerNegado(nome, sql) {
  try {
    await client.query(sql);
    falhou(`${nome}: CONSEGUIU, e nao devia`);
  } catch (e) {
    if (/permission denied|read-only|must be owner/i.test(e.message)) ok(`${nome}: negado, como esperado`);
    else falhou(`${nome}: deu erro, mas nao foi de permissao (${e.message})`);
  }
}

try {
  await client.connect();
} catch (e) {
  console.error(`Nao consegui conectar: ${e.message}`);
  process.exit(2);
}

try {
  console.log("\n1) Quem sou eu");
  const { rows } = await client.query("SELECT current_user AS usuario, current_setting('default_transaction_read_only') AS somente_leitura");
  if (rows[0].usuario === "loja_leitura") ok("conectado como loja_leitura");
  else {
    // Trava: com outro usuario (por exemplo o dono do banco) as tentativas de escrever FUNCIONARIAM. Para aqui.
    console.log(`  [FALHOU] conectado como "${rows[0].usuario}", e devia ser loja_leitura. Voce colou a conexao errada.`);
    console.log("\nPAREI antes de fazer qualquer teste, para nao mexer no banco. Nada foi lido nem gravado.");
    await client.end();
    process.exit(1);
  }
  if (rows[0].somente_leitura === "on") ok("sessao somente leitura");
  else falhou("sessao NAO esta em somente leitura");

  console.log("\n2) O que a loja precisa ler");
  const pecas = await deveLer("lista de pecas da loja", SQL_PECAS);
  if (pecas.length > 0) {
    await deveLer("uma peca pelo numero", SQL_PECA, [pecas[0].id]);
    console.log(`           exemplo: "${pecas[0].name}", preco ${pecas[0].price}, ${pecas[0].extras.length} foto(s) extra`);
    const semFoto = pecas.filter((p) => !p.photo_url).length;
    console.log(`           ${pecas.length} peca(s) visiveis na loja, ${semFoto} sem foto principal`);
  } else {
    console.log("           (nenhuma peca esta marcada para aparecer na loja neste banco: normal se ainda nao marcou)");
  }
  const config = await deveLer("configuracoes da loja", SQL_CONFIG);
  console.log(`           chaves lidas: ${config.map((c) => c.key).join(", ") || "(nenhuma: a loja usa os valores padrao)"}`);

  console.log("\n3) O que NAO pode ler");
  for (const coluna of ["cost", "purchase_date", "purchase_qty", "purchase_payment_method", "supplier_id", "manufacturer_id"]) {
    await deveSerNegado(`products.${coluna}`, `SELECT ${coluna} FROM products LIMIT 1`);
  }
  await deveSerNegado("products (todas as colunas)", "SELECT * FROM products LIMIT 1");
  for (const tabela of ["sales", "clients", "receipts", "expenses", "card_invoices", "stock_purchases", "users", "agreement_settings", "manufacturers", "sale_payments"]) {
    await deveSerNegado(tabela, `SELECT * FROM ${tabela} LIMIT 1`);
  }

  console.log("\n4) O que NAO pode escrever (o banco deve recusar todas)");
  await deveSerNegado("gravar em store_settings", "INSERT INTO store_settings (key, value) VALUES ('ensaio', 'x')");
  await deveSerNegado("mudar preco de peca", "UPDATE products SET price = price WHERE false");
  await deveSerNegado("apagar fotos", "DELETE FROM product_photos WHERE false");
  await deveSerNegado("criar tabela", "CREATE TABLE ensaio_lixo (id int)");
} finally {
  await client.end();
}

console.log(falhas === 0 ? "\nRESULTADO: TUDO CERTO. O usuario le so o que deve e nao escreve nada." : `\nRESULTADO: ${falhas} PROBLEMA(S). Copie as linhas [FALHOU] e me mostre (elas nao trazem senha).`);
process.exit(falhas === 0 ? 0 : 1);
