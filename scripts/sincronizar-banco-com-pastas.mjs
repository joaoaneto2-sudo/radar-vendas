// Direção contrária do "ligar-fotos-locais": a Fernanda exclui a FOTO direto na pasta (Explorer).
// Esse script olha o que sobrou nas pastas e apaga do banco de teste local a peça cuja foto não
// existe mais. Usa o DELETE normal do Postgres (fica registrado no change_log, igual excluir pela
// tela). Script de uso único (descartável); recusa se DATABASE_URL não for localhost/127.0.0.1.
//
// Uso: node --env-file=.env.local scripts/sincronizar-banco-com-pastas.mjs

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

const built = await esbuild.build({ entryPoints: [path.resolve("lib/importar-pecas.ts")], bundle: true, platform: "node", format: "esm", write: false });
const tmpFile = path.join(os.tmpdir(), `importar-pecas-${Date.now()}.mjs`);
fs.writeFileSync(tmpFile, built.outputFiles[0].text);
const { lerNomeDoArquivo } = await import(`file://${tmpFile.replace(/\\/g, "/")}`);
fs.unlinkSync(tmpFile);

const FOLDERS = [
  { dir: "Zarpellon - para nomear", fabricante: "Zarpellon" },
  { dir: "NOVO - fabricante a confirmar", fabricante: null },
  { dir: "(a confirmar)", fabricante: null },
  { dir: "Nino", fabricante: "Nino" },
  { dir: "Zarpellon", fabricante: "Zarpellon" },
  { dir: "Simon", fabricante: "Simon" },
  { dir: "Cinthia Souza", fabricante: "Cinthia Souza" },
  { dir: "Luciana Rangel", fabricante: "Luciana Rangel" },
  { dir: "Piu Bela", fabricante: "Piu Bela" },
  { dir: "Glamour", fabricante: "Glamour" },
  { dir: "Max", fabricante: "Max" },
  { dir: "Renata", fabricante: "Renata" },
  { dir: "Milano", fabricante: "Milano" },
  { dir: "Brilhare", fabricante: "Brilhare" },
  { dir: "Privilegi", fabricante: "Privilegi" },
  { dir: "Adriana Joias", fabricante: "Adriana Joias" },
  { dir: "Simone Jóias", fabricante: "Simone Jóias" },
  { dir: "Multi marcas", fabricante: "Multi marcas" },
  { dir: "Jaque", fabricante: "Jaque" },
  { dir: "Catharina Degam", fabricante: "Catharina Degam" },
  { dir: "Blue Diamond", fabricante: "Blue Diamond" },
  { dir: "Juliana Rocha", fabricante: "Juliana Rocha" },
];
const EXT_IMAGEM = /\.(jpe?g|png|webp)$/i;
function primeiraParte(a) { const s = a.replace(/\.[a-zA-Z0-9]+$/, ""); return (s.split(" - ").map((p) => p.trim()).filter(Boolean)[0]) || ""; }
function codigoBase(t) { return t.replace(/_\d+$/, ""); }
const semAcento = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const { rows: fabricantes } = await pool.query("SELECT id, name FROM manufacturers");
const mapaFabricantes = new Map(fabricantes.map((f) => [semAcento(f.name), f.id]));

// Monta o conjunto do que AINDA existe nas pastas (chave nome+fabricante).
const aindaExistem = new Set();
for (const pasta of FOLDERS) {
  const full = path.join(ESTOQUE_ROOT, pasta.dir);
  let entradas = [];
  try { entradas = fs.readdirSync(full, { withFileTypes: true }); } catch { continue; }
  const arquivos = entradas.filter((e) => e.isFile() && EXT_IMAGEM.test(e.name)).map((e) => e.name);
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
    const manufacturerId = pasta.fabricante ? mapaFabricantes.get(semAcento(pasta.fabricante)) ?? null : null;
    aindaExistem.add(`${semAcento(lido.nome)}::${manufacturerId ?? "null"}`);
  }
}

// Só mexe em peças que foram ligadas às pastas locais (photo_url do servidor local), nunca nas
// peças DEMO nem em nada que já esteja em produção.
const { rows: candidatos } = await pool.query(
  `SELECT id, name, manufacturer_id, cost FROM products WHERE photo_url LIKE 'http://localhost:4550%'`
);

const apagadas = [];
for (const p of candidatos) {
  const chave = `${semAcento(p.name)}::${p.manufacturer_id ?? "null"}`;
  if (aindaExistem.has(chave)) continue;
  await pool.query(`DELETE FROM products WHERE id = $1`, [p.id]);
  apagadas.push(p);
}

console.log(`Peças ainda nas pastas: ${aindaExistem.size}`);
console.log(`Peças no banco vinculadas às pastas: ${candidatos.length}`);
console.log(`Apagadas do Radar agora (foto sumiu da pasta): ${apagadas.length}`);
if (apagadas.length) {
  apagadas.forEach((p) => console.log(`  - "${p.name}" (custo R$ ${Number(p.cost).toFixed(2)})`));
}
await pool.end();
