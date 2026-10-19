// Grava no banco de TESTE local a classificacao visual das fotos (limpa/modelo + ponto de foco do
// recorte) feita pelos ajudantes. Precisa da coluna products.catalog_photo (migracao 018).
// Uso: node --env-file=.env.local scripts/aplicar-classificacao-fotos.mjs <pasta-com-classif-N.json>

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";
const dbHost = (() => { try { return new URL(DATABASE_URL).hostname; } catch { return ""; } })();
if (dbHost !== "localhost" && dbHost !== "127.0.0.1") {
  console.error(`RECUSADO: DATABASE_URL nao e local ("${dbHost}").`);
  process.exit(1);
}

const pasta = process.argv[2];
if (!pasta) {
  console.error("Informe a pasta com os classif-N.json");
  process.exit(1);
}

const clamp = (n, min, max) => Math.min(max, Math.max(min, Number(n)));
const pool = new pg.Pool({ connectionString: DATABASE_URL });

let gravadas = 0;
let ignoradas = 0;
const porTipo = { limpa: 0, modelo: 0 };

for (const arquivo of fs.readdirSync(pasta).filter((f) => /^classif-\d+\.json$/.test(f)).sort()) {
  const itens = JSON.parse(fs.readFileSync(path.join(pasta, arquivo), "utf8"));
  for (const it of itens) {
    if (!["limpa", "modelo"].includes(it.kind)) { ignoradas++; continue; }
    const valor = {
      kind: it.kind,
      fx: clamp(it.fx ?? 50, 0, 100),
      fy: clamp(it.fy ?? 50, 0, 100),
      zoom: clamp(it.zoom ?? 1, 1, 3),
    };
    const { rowCount } = await pool.query(`UPDATE products SET catalog_photo = $1::jsonb WHERE id = $2`, [JSON.stringify(valor), it.id]);
    if (rowCount) { gravadas++; porTipo[it.kind]++; } else ignoradas++;
  }
}

console.log(`Gravadas: ${gravadas} (limpa ${porTipo.limpa}, modelo ${porTipo.modelo}). Ignoradas: ${ignoradas}.`);
await pool.end();
