// Faz a pasta "bater" com o Radar: para cada foto reconhecida que NÃO tem mais peça
// correspondente no banco de teste local (porque foi excluída em /cadastros), MOVE o
// arquivo (não apaga) para "Estoque Principal\_Excluídas\<fornecedor>\...". Reversível:
// é só mover de volta se precisar. Script de uso único (descartável), mesma trava de
// segurança dos outros: recusa se DATABASE_URL não for localhost/127.0.0.1.
//
// Uso: node --env-file=.env.local scripts/sincronizar-pastas-excluidas.mjs

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
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

const ESTOQUE_ROOT = "C:\\Users\\João\\Claude\\Projetos\\Fernanda Brilhante\\Estoque\\1 - Estoque Principal";
const PASTA_EXCLUIDAS = path.join(ESTOQUE_ROOT, "_Excluídas");

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

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const { rows: fabricantes } = await pool.query("SELECT id, name FROM manufacturers");
const mapaFabricantes = new Map(fabricantes.map((f) => [semAcento(f.name), f.id]));

let movidas = 0;
let mantidas = 0;
const movidasLista = [];

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
    const principal = [...lista].sort((a, b) => a.localeCompare(b))[0];
    const lido = lerNomeDoArquivo(principal);
    if (!lido) continue;
    const manufacturerId = pasta.fabricante ? mapaFabricantes.get(semAcento(pasta.fabricante)) ?? null : null;

    const { rowCount } = manufacturerId
      ? await pool.query(`SELECT 1 FROM products WHERE lower(name) = lower($1) AND manufacturer_id = $2`, [lido.nome, manufacturerId])
      : await pool.query(`SELECT 1 FROM products WHERE lower(name) = lower($1) AND manufacturer_id IS NULL`, [lido.nome]);

    if (rowCount > 0) {
      mantidas++;
      continue;
    }

    // Não existe mais no banco: foi excluída no Radar. Move TODAS as fotos do grupo (principal + extras).
    const destDir = path.join(PASTA_EXCLUIDAS, pasta.dir);
    fs.mkdirSync(destDir, { recursive: true });
    for (const arq of lista) {
      const origem = path.join(full, arq);
      const destino = path.join(destDir, arq);
      try {
        fs.renameSync(origem, destino);
        movidas++;
        movidasLista.push({ pasta: pasta.dir, arquivo: arq, nome: lido.nome });
      } catch (e) {
        console.error(`Falha ao mover ${origem}: ${e.message}`);
      }
    }
  }
}

console.log(`Peças que continuam no Radar (foto mantida na pasta original): ${mantidas}`);
console.log(`Fotos movidas para "_Excluídas" (peça já excluída do Radar): ${movidas}`);
if (movidasLista.length) {
  console.log("Movidas:");
  movidasLista.forEach((m) => console.log(`  - [${m.pasta}] ${m.arquivo} (peça: "${m.nome}")`));
}
await pool.end();
