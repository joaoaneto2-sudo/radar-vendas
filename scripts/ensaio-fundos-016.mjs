// ENSAIO DA MIGRACAO 016 (fundos do negocio) NUMA COPIA DO NEON
//
// Aplica a migracao 016 (tabelas funds e fund_rules, coluna expenses.fund_id) e confere
// se ficou certo: os 7 fundos foram criados, em ordem, todos ativos; rodar de novo nao
// duplica nada; as travas do banco (% de 0 a 100, mes sempre dia 1, fim nao antes do
// inicio) estao no lugar.
//
// So use numa BRANCH DE TESTE do Neon, nunca na producao (main). Como usar:
//   1. No painel do Neon, crie uma branch nova a partir da main (Neon > Branches > Create branch).
//   2. Copie a string de conexao DESSA BRANCH (Connect > Branch = a nova, Role = neondb_owner).
//   3. No PowerShell, dentro da pasta do projeto:
//      $env:NEON_TESTE_DATABASE_URL = "cole aqui a conexao da BRANCH DE TESTE (nunca a da main)"
//      node scripts/ensaio-fundos-016.mjs
//
// O endereco e a senha ficam so na sua janela do terminal: este script nunca os imprime.
// A branch deve ja estar na migracao 015 (copia recente da main). Este script aplica so
// a 016 (as instrucoes usam IF NOT EXISTS, entao rodar duas vezes nao duplica nada).

import pg from "pg";

const url = process.env.NEON_TESTE_DATABASE_URL;
if (!url) {
  console.error("Falta a variavel NEON_TESTE_DATABASE_URL. Veja as instrucoes no alto deste arquivo.");
  process.exit(2);
}

// Copia exata das instrucoes da migracao 016 em lib/migrations.ts.
const STATEMENTS_016 = [
  `CREATE TABLE IF NOT EXISTS funds (
     id SERIAL PRIMARY KEY,
     name TEXT NOT NULL CHECK (btrim(name) <> ''),
     description TEXT,
     position INT NOT NULL DEFAULT 0,
     active BOOLEAN NOT NULL DEFAULT true,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS funds_nome_idx ON funds (lower(btrim(name)))`,
  `INSERT INTO funds (name, description, position) VALUES
     ('Prospecção', 'Conquistar clientes novos', 1),
     ('Transporte', 'Deslocamento: viagens, motoboy, transporte por aplicativo', 2),
     ('Custos fixos', 'Aplicativos, MEI e contador', 3),
     ('Digital', 'Custos digitais. Os aplicativos ficam em Custos fixos', 4),
     ('Tráfego pago', 'Anúncios pagos', 5),
     ('Embalagens', 'Caixas, sacolas e materiais de embalagem', 6),
     ('Frete', 'Envio para o cliente (Correios, Melhor Envio). Diferente de Transporte', 7)
     ON CONFLICT ((lower(btrim(name)))) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS fund_rules (
     id SERIAL PRIMARY KEY,
     fund_id INT NOT NULL REFERENCES funds(id),
     pct NUMERIC(5,2) NOT NULL CHECK (pct BETWEEN 0 AND 100),
     from_month DATE NOT NULL CHECK (EXTRACT(DAY FROM from_month) = 1),
     to_month DATE CHECK (to_month IS NULL OR (EXTRACT(DAY FROM to_month) = 1 AND to_month >= from_month)),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     created_by_id INT,
     created_by_name TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS fund_rules_fund_idx ON fund_rules (fund_id, from_month)`,
  `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS fund_id INT REFERENCES funds(id)`,
  `DROP TRIGGER IF EXISTS funds_log ON funds`,
  `CREATE TRIGGER funds_log AFTER UPDATE OR DELETE ON funds FOR EACH ROW EXECUTE FUNCTION log_change()`,
  `DROP TRIGGER IF EXISTS fund_rules_log ON fund_rules`,
  `CREATE TRIGGER fund_rules_log AFTER UPDATE OR DELETE ON fund_rules FOR EACH ROW EXECUTE FUNCTION log_change()`,
];

const client = new pg.Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false } });

let falhas = 0;
const ok = (texto) => console.log(`  [ok]     ${texto}`);
const falhou = (texto) => {
  falhas += 1;
  console.log(`  [FALHOU] ${texto}`);
};

async function aplicar016() {
  await client.query("BEGIN");
  for (const s of STATEMENTS_016) await client.query(s);
  await client.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`
  );
  await client.query(
    `INSERT INTO schema_migrations (id, name) VALUES ('016', 'fundos do negocio') ON CONFLICT (id) DO NOTHING`
  );
  await client.query("COMMIT");
}

async function main() {
  await client.connect();

  console.log("1) Conferindo se a branch já está na migração 015 (deveria estar, por vir da main)...");
  const { rows: existentes } = await client.query(
    `SELECT id FROM schema_migrations WHERE id IN ('014','015') ORDER BY id`
  );
  if (existentes.length === 2) ok("as migrações 014 e 015 já existem nesta branch");
  else falhou(`faltam migrações anteriores (encontradas: ${existentes.map((r) => r.id).join(", ") || "nenhuma"}). Confira se a branch foi criada a partir da main.`);

  console.log("\n2) Aplicando a migração 016...");
  await aplicar016();
  ok("instruções da migração 016 executadas (sem erro)");

  const { rows: schema } = await client.query(`SELECT id FROM schema_migrations WHERE id = '016'`);
  if (schema.length === 1) ok("a migração 016 está registrada em schema_migrations");
  else falhou("a migração 016 NÃO está em schema_migrations");

  console.log("\n3) Conferindo os 7 fundos...");
  const { rows: fundos } = await client.query(`SELECT name, description, active FROM funds ORDER BY position, id`);
  const nomesEsperados = ["Prospecção", "Transporte", "Custos fixos", "Digital", "Tráfego pago", "Embalagens", "Frete"];
  const nomesReais = fundos.map((f) => f.name);
  if (JSON.stringify(nomesReais) === JSON.stringify(nomesEsperados)) ok("os 7 fundos existem, na ordem certa");
  else falhou(`os fundos vieram diferentes do esperado: ${JSON.stringify(nomesReais)}`);
  if (fundos.every((f) => f.active)) ok("todos os fundos estão ativos");
  else falhou("algum fundo não está ativo");
  const custosFixos = fundos.find((f) => f.name === "Custos fixos");
  if (custosFixos?.description?.includes("MEI")) ok('a descrição de "Custos fixos" cita o MEI');
  else falhou('a descrição de "Custos fixos" não cita o MEI (' + JSON.stringify(custosFixos?.description) + ")");

  console.log("\n4) Rodando a migração de novo, para provar que não duplica...");
  await aplicar016();
  const { rows: contagem } = await client.query(`SELECT count(*)::int AS n FROM funds`);
  if (contagem[0].n === 7) ok("continuam exatamente 7 fundos no banco (não duplicou)");
  else falhou(`tem ${contagem[0].n} fundos no banco, esperava 7`);

  console.log("\n5) Conferindo as travas de fund_rules (% de 0 a 100, mês dia 1, fim não antes do início)...");
  const { rows: umFundo } = await client.query(`SELECT id FROM funds ORDER BY position LIMIT 1`);
  const fundoId = umFundo[0].id;
  const tentativasQueDevemFalhar = [
    ["% negativa", `INSERT INTO fund_rules (fund_id, pct, from_month) VALUES ($1, -1, '2026-09-01')`],
    ["% acima de 100", `INSERT INTO fund_rules (fund_id, pct, from_month) VALUES ($1, 101, '2026-09-01')`],
    ["mês que não é dia 1", `INSERT INTO fund_rules (fund_id, pct, from_month) VALUES ($1, 5, '2026-09-15')`],
    ["fim antes do início", `INSERT INTO fund_rules (fund_id, pct, from_month, to_month) VALUES ($1, 5, '2026-09-01', '2026-08-01')`],
  ];
  for (const [nome, sql] of tentativasQueDevemFalhar) {
    try {
      await client.query(sql, [fundoId]);
      falhou(`"${nome}" deveria ter sido recusado pelo banco, e foi aceito`);
    } catch {
      ok(`"${nome}" foi recusado pelo banco, como esperado`);
    }
  }
  await client.query(`DELETE FROM fund_rules WHERE fund_id = $1`, [fundoId]); // limpa o que porventura tenha entrado

  console.log("\n6) Conferindo a coluna expenses.fund_id...");
  const { rows: coluna } = await client.query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'fund_id'`
  );
  if (coluna.length === 1) ok("a coluna expenses.fund_id existe");
  else falhou("a coluna expenses.fund_id NÃO existe");

  console.log(`\n${falhas === 0 ? "TUDO CERTO" : `${falhas} PROBLEMA(S) ENCONTRADO(S)`}`);
  await client.end();
  process.exit(falhas === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error("Erro ao rodar o ensaio:", e.message);
  try {
    await client.query("ROLLBACK");
  } catch {}
  await client.end();
  process.exit(1);
});
