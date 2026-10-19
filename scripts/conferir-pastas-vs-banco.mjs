// Confere: quantas pecas as pastas (Estoque Principal) tem vs quantas estao hoje no banco de
// teste local. So leitura, nao muda nada. Uso: node --env-file=.env.local scripts/conferir-pastas-vs-banco.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import * as esbuild from "esbuild";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";
const dbHost = (() => { try { return new URL(DATABASE_URL).hostname; } catch { return ""; } })();
if (dbHost !== "localhost" && dbHost !== "127.0.0.1") {
  console.error(`RECUSADO: DATABASE_URL nao e local ("${dbHost}").`);
  process.exit(1);
}

const ESTOQUE_ROOT = "C:\\Users\\João\\Claude\\Projetos\\Fernanda Brilhante\\Estoque\\1 - Estoque Principal";

const built = await esbuild.build({
  entryPoints: [path.resolve("lib/importar-pecas.ts")],
  bundle: true, platform: "node", format: "esm", write: false,
});
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

let totalArquivos = 0;
let pecasReconhecidas = 0;
let pecasNaoReconhecidas = 0;
const naoReconhecidasLista = [];
const porPasta = [];

for (const pasta of FOLDERS) {
  const full = path.join(ESTOQUE_ROOT, pasta.dir);
  let entradas = [];
  try { entradas = fs.readdirSync(full, { withFileTypes: true }); } catch { porPasta.push({ pasta: pasta.dir, existe: false }); continue; }
  const arquivos = entradas.filter((e) => e.isFile() && EXT_IMAGEM.test(e.name)).map((e) => e.name);
  totalArquivos += arquivos.length;
  const grupos = new Map();
  for (const arq of arquivos) {
    const chave = codigoBase(primeiraParte(arq)) || arq;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(arq);
  }
  let reconhecidasPasta = 0, naoReconhecidasPasta = 0;
  for (const [, lista] of grupos) {
    const principal = [...lista].sort((a, b) => a.localeCompare(b))[0];
    if (lerNomeDoArquivo(principal)) { reconhecidasPasta++; pecasReconhecidas++; }
    else { naoReconhecidasPasta++; pecasNaoReconhecidas++; naoReconhecidasLista.push({ pasta: pasta.dir, arquivo: principal }); }
  }
  porPasta.push({ pasta: pasta.dir, existe: true, arquivos: arquivos.length, grupos: grupos.size, reconhecidas: reconhecidasPasta, naoReconhecidas: naoReconhecidasPasta });
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const { rows } = await pool.query(`SELECT count(*)::int AS n FROM products`);
const totalBanco = rows[0].n;
await pool.end();

console.log("============ POR PASTA ============");
for (const p of porPasta) {
  if (!p.existe) { console.log(`- ${p.pasta}: pasta nao encontrada`); continue; }
  console.log(`- ${p.pasta}: ${p.arquivos} arquivo(s) de foto, ${p.grupos} peca(s) (grupos), ${p.reconhecidas} reconhecida(s), ${p.naoReconhecidas} fora do padrao`);
}
console.log("\n============ TOTAIS ============");
console.log(`Arquivos de foto nas pastas: ${totalArquivos}`);
console.log(`Pecas reconhecidas nas pastas (nome+custo no arquivo): ${pecasReconhecidas}`);
console.log(`Pecas NAO reconhecidas (fora do padrao, nao contam): ${pecasNaoReconhecidas}`);
console.log(`Produtos hoje no banco (Radar local, todos, inclui 5 DEMO de teste): ${totalBanco}`);
console.log(`Produtos hoje no banco, tirando os 5 DEMO: ${totalBanco - 5}`);
if (naoReconhecidasLista.length) {
  console.log("\nFora do padrao (nao importadas ainda):");
  naoReconhecidasLista.forEach((n) => console.log(`  - [${n.pasta}] ${n.arquivo}`));
}
