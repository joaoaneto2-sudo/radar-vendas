// Importa as pecas da Zarpellon que agora tem custo preenchido certinho (apos corrigir-custo-zarpellon.mjs)
// e ainda nao existem no banco de teste local. Usa o servidor de fotos local (porta 4550) que ja
// esta rodando. So roda contra localhost. Uso: node --env-file=.env.local scripts/importar-novas-zarpellon.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as esbuild from "esbuild";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";
const dbHost = (() => { try { return new URL(DATABASE_URL).hostname; } catch { return ""; } })();
if (dbHost !== "localhost" && dbHost !== "127.0.0.1") {
  console.error(`RECUSADO: DATABASE_URL não é local ("${dbHost}").`);
  process.exit(1);
}

const ESTOQUE_ROOT = "C:\\Users\\João\\Claude\\Projetos\\Fernanda Brilhante\\Estoque\\1 - Estoque Principal";
const PORT = 4550;
const MARKUP = 2.5;

const built = await esbuild.build({ entryPoints: [path.resolve("lib/importar-pecas.ts")], bundle: true, platform: "node", format: "esm", write: false });
const tmpFile = path.join(os.tmpdir(), `importar-pecas-${Date.now()}.mjs`);
fs.writeFileSync(tmpFile, built.outputFiles[0].text);
const { lerNomeDoArquivo } = await import(`file://${tmpFile.replace(/\\/g, "/")}`);
fs.unlinkSync(tmpFile);

const REGRAS_CATEGORIA = [
  { palavras: ["anel", "aliança"], categoria: "Anéis" },
  { palavras: ["brinco", "argola", "ear cuff"], categoria: "Brincos" },
  { palavras: ["colar", "choker", "corrente"], categoria: "Colares e Correntes" },
  { palavras: ["pulseira", "bracelete"], categoria: "Pulseiras" },
  { palavras: ["pingente", "escapulário"], categoria: "Pingentes" },
  { palavras: ["conjunto"], categoria: "Conjuntos" },
  { palavras: ["relógio"], categoria: "Relógios" },
];
function categoriaDoNome(nome) {
  const baixo = nome.toLowerCase();
  for (const r of REGRAS_CATEGORIA) if (r.palavras.some((p) => baixo.includes(p))) return r.categoria;
  return "Outros";
}

function primeiraParte(a) { const s = a.replace(/\.[a-zA-Z0-9]+$/, ""); return (s.split(" - ").map((p) => p.trim()).filter(Boolean)[0]) || ""; }
function codigoBase(t) { return t.replace(/_\d+$/, ""); }
const semAcento = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const { rows: fabRows } = await pool.query("SELECT id FROM manufacturers WHERE lower(name) = lower('Zarpellon')");
const manufacturerId = fabRows[0]?.id ?? null;
if (!manufacturerId) {
  console.error("Fabricante Zarpellon não encontrado no banco.");
  process.exit(1);
}

let criadas = 0;
let jaExistiam = 0;

for (const pastaDir of ["Zarpellon", "Zarpellon - para nomear"]) {
  const full = path.join(ESTOQUE_ROOT, pastaDir);
  let entradas = [];
  try { entradas = fs.readdirSync(full, { withFileTypes: true }); } catch { continue; }
  const arquivos = entradas.filter((e) => e.isFile() && /\.(jpe?g|png|webp)$/i.test(e.name)).map((e) => e.name);
  const grupos = new Map();
  for (const arq of arquivos) {
    const chave = codigoBase(primeiraParte(arq)) || arq;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(arq);
  }
  for (const [, lista] of grupos) {
    const principal = [...lista].sort((a, b) => a.localeCompare(b))[0];
    const lido = lerNomeDoArquivo(principal);
    if (!lido) continue;

    const { rowCount } = await pool.query(
      "SELECT 1 FROM products WHERE lower(name) = lower($1) AND manufacturer_id = $2",
      [lido.nome, manufacturerId]
    );
    if (rowCount > 0) { jaExistiam++; continue; }

    const custoReais = lido.custoCentavos / 100;
    const precoReais = Math.round(custoReais * MARKUP * 100) / 100;
    const categoria = categoriaDoNome(lido.nome);
    const photoUrl = `http://localhost:${PORT}/${encodeURIComponent(pastaDir)}/${encodeURIComponent(principal)}`;

    await pool.query(
      `INSERT INTO products (
        category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active,
        photo_url, show_online, availability, show_catalog
      ) VALUES ($1,$2,$3,$4,$5,1,'varejo',true,$6,false,'pronta_entrega',true)`,
      [categoria, lido.nome, manufacturerId, custoReais, precoReais, photoUrl]
    );
    criadas++;
    console.log(`Criada: "${lido.nome}" (custo R$ ${custoReais.toFixed(2)}, categoria ${categoria})`);
  }
}

console.log(`\nCriadas agora: ${criadas}`);
console.log(`Já existiam: ${jaExistiam}`);
await pool.end();
