// Liga as fotos REAIS (do computador do João) às peças já importadas no banco de TESTE local,
// servindo os arquivos por um servidor HTTP local simples. Não sobe nada para a internet, não
// mexe em produção. Script de uso único (descartável), mesma trava de segurança do script de
// importação: recusa se DATABASE_URL não for localhost/127.0.0.1.
//
// Uso: node --env-file=.env.local scripts/ligar-fotos-locais.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import * as esbuild from "esbuild";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";
const dbHost = (() => {
  try {
    return new URL(DATABASE_URL).hostname;
  } catch {
    return "";
  }
})();
if (dbHost !== "localhost" && dbHost !== "127.0.0.1") {
  console.error(`RECUSADO: DATABASE_URL não é local (host encontrado: "${dbHost}").`);
  process.exit(1);
}

const PORT = Number(process.env.FOTOS_PORT || 4550);
const ESTOQUE_ROOT = "C:\\Users\\João\\Claude\\Projetos\\Fernanda Brilhante\\Estoque\\1 - Estoque Principal";
const MARKUP = 2.5;

// Reaproveita lib/importar-pecas.ts (lerNomeDoArquivo), igual ao script de importação.
const built = await esbuild.build({
  entryPoints: [path.resolve("lib/importar-pecas.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
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

function primeiraParte(nomeArquivo) {
  const semExt = nomeArquivo.replace(/\.[a-zA-Z0-9]+$/, "");
  const partes = semExt.split(" - ").map((p) => p.trim()).filter(Boolean);
  return partes[0] || "";
}
function codigoBase(token) {
  return token.replace(/_\d+$/, "");
}
const semAcento = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

// Lista os arquivos de cada pasta (só a raiz) e agrupa por código-base (mesma peça, várias fotos).
const filas = [];
for (const pasta of FOLDERS) {
  const full = path.join(ESTOQUE_ROOT, pasta.dir);
  let entradas = [];
  try {
    entradas = fs.readdirSync(full, { withFileTypes: true });
  } catch {
    continue;
  }
  const arquivos = entradas.filter((e) => e.isFile() && EXT_IMAGEM.test(e.name)).map((e) => e.name);
  const grupos = new Map();
  for (const arq of arquivos) {
    const chave = codigoBase(primeiraParte(arq)) || arq;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(arq);
  }
  for (const [, lista] of grupos) {
    const [principal] = lista.sort((a, b) => a.localeCompare(b));
    filas.push({ pastaDir: pasta.dir, fabricante: pasta.fabricante, principal });
  }
}

// Servidor HTTP local simples, só serve arquivos de dentro de ESTOQUE_ROOT.
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const alvo = path.join(ESTOQUE_ROOT, urlPath);
  if (!alvo.startsWith(ESTOQUE_ROOT)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(alvo, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("não encontrado");
      return;
    }
    const ext = path.extname(alvo).toLowerCase();
    const tipo = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    res.writeHead(200, { "Content-Type": tipo, "Cache-Control": "public, max-age=31536000" });
    res.end(data);
  });
});
await new Promise((resolve) => server.listen(PORT, resolve));
console.log(`Servidor de fotos local rodando em http://localhost:${PORT}`);

// Liga cada arquivo ao produto correspondente no banco (mesma regra de nome+fabricante do import).
const pool = new pg.Pool({ connectionString: DATABASE_URL });
const { rows: fabricantes } = await pool.query("SELECT id, name FROM manufacturers");
const mapaFabricantes = new Map(fabricantes.map((f) => [semAcento(f.name), f.id]));

let ligadas = 0;
let semCorrespondencia = 0;
const semCorrespondenciaLista = [];

for (const { pastaDir, fabricante, principal } of filas) {
  const lido = lerNomeDoArquivo(principal);
  if (!lido) continue; // sem nome/custo reconhecido, o import também pulou essa
  const manufacturerId = fabricante ? mapaFabricantes.get(semAcento(fabricante)) ?? null : null;
  const url = `http://localhost:${PORT}/${encodeURIComponent(pastaDir)}/${encodeURIComponent(principal)}`;

  const { rowCount } = manufacturerId
    ? await pool.query(
        `UPDATE products SET photo_url = $1 WHERE lower(name) = lower($2) AND manufacturer_id = $3`,
        [url, lido.nome, manufacturerId]
      )
    : await pool.query(
        `UPDATE products SET photo_url = $1 WHERE lower(name) = lower($2) AND manufacturer_id IS NULL`,
        [url, lido.nome]
      );

  if (rowCount > 0) {
    ligadas += rowCount;
  } else {
    semCorrespondencia++;
    semCorrespondenciaLista.push({ pastaDir, principal, nome: lido.nome });
  }
}

console.log(`Fotos ligadas a peças já cadastradas: ${ligadas}`);
console.log(`Sem peça correspondente no banco: ${semCorrespondencia}`);
if (semCorrespondenciaLista.length) {
  console.log("Exemplos sem correspondência:");
  semCorrespondenciaLista.slice(0, 10).forEach((s) => console.log(`  - [${s.pastaDir}] ${s.principal} (nome lido: "${s.nome}")`));
}

console.log("\nServidor continua rodando (Ctrl+C para parar). Mantenha esta janela aberta enquanto conferem as fotos.");
