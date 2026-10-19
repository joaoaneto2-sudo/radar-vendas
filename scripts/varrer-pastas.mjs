// Varredura das pastas de fornecedor (Estoque\1 - Estoque Principal). Roda no computador do João.
//
// Modo plano (padrão): só LÊ. Junta close + modelo de cada peça, acha os códigos provisórios (NOVO-, SEMFORN-
// ou sem código) e propõe o código definitivo (SIGLA-TIPO-NNN) e o novo nome de cada arquivo. Grava o plano em
// um JSON e imprime um resumo. Nada é renomeado.
// Modo aplicar: renomeia de verdade, só com --aplicar <plano.json> --confirmar (grava um registro .renomeados.json).
// Modo desfazer: --desfazer <registro.renomeados.json> --confirmar volta os nomes antigos.
//
// Padrão de nome:  close  -> CODIGO - Nome - custo 77,00.ext
//                  modelo -> CODIGO - Nome - modelo.ext
//
// Uso:  node --env-file=.env.local scripts/varrer-pastas.mjs [--saida plano.json] [--pasta "Glamour"]
//       node scripts/varrer-pastas.mjs --aplicar plano.json --confirmar

import fs from "node:fs";
import path from "node:path";

const RAIZ = process.env.ESTOQUE_RAIZ || "C:/Users/João/Claude/Projetos/Fernanda Brilhante/Estoque/1 - Estoque Principal";
const args = process.argv.slice(2);
const pega = (nome) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};

const IMG = /\.(png|jpe?g|webp)$/i;
const TIPOS = ["BR", "CO", "PU", "AN", "OU", "PI", "CJ"];
const norm = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const semExt = (f) => f.replace(IMG, "");
const custoNum = (t) => Number(t.replace(/\./g, "").replace(",", "."));
const custoBR = (n) => n.toFixed(2).replace(".", ",");

// CODIGO - Nome - custo 77,00   |   CODIGO - Nome - modelo   |   NN - Nome - custo 59,50   |   Nome simples
const RE_CODIGO = /^(\p{Lu}+)-(BR|CO|PU|AN|OU|PI|CJ)-(\d{3})(_\d)? - (.+?) - (custo ([\d.,]+)|modelo)$/u;
const RE_NUMERADA = /^(\d{1,3}) - (.+?) - custo ([\d.,_]+)$/;

export function ler(arquivo) {
  const base = semExt(arquivo.normalize("NFC"));
  let m = base.match(RE_CODIGO);
  if (m) {
    return {
      forma: "codigo",
      sigla: m[1], tipo: m[2], numero: m[3], extra: m[4] || "",
      nome: m[5],
      papel: m[6] === "modelo" ? "modelo" : "close",
      custo: m[7] ? custoNum(m[7]) : null,
    };
  }
  m = base.match(RE_NUMERADA);
  if (m) return { forma: "numerada", nome: m[2], papel: "close", custo: /^[\d.,]+$/.test(m[3]) ? custoNum(m[3]) : null };
  return { forma: "simples", nome: base, papel: null, custo: null };
}

export function tipoPeloNome(nome) {
  const n = norm(nome);
  if (/\b(brinco|brincos|argola|argolas|ear)\b/.test(n)) return "BR";
  if (/\b(colar|choker|chocker|gargantilha|corrente|cordao)\b/.test(n)) return "CO";
  if (/\b(pulseira|bracelete|braceletes|relogio)\b/.test(n)) return "PU";
  if (/\b(anel|alianca|meia alianca)\b/.test(n)) return "AN";
  if (/\b(pingente|escapulario|medalha|medalhao)\b/.test(n)) return "PI";
  if (/\b(conjunto|kit)\b/.test(n)) return "CJ";
  return "OU";
}

export function siglaDoFabricante(pasta) {
  return pasta.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
}

const PROVISORIOS = new Set(["NOVO", "SEMFORN"]);
// Peças em que o arquivo com código no nome é a foto da MODELO e o arquivo de nome simples é o close
// (conferido olhando as imagens). Daqui para frente o padrão de nome evita essa confusão.
const CODIGO_E_MODELO = new Set(["Catharina Degam|CATHARIN-CO-001", "Catharina Degam|NOVO-CO-005", "Cinthia Souza|CINTHIAS-CO-001"]);

async function codigosDoBanco() {
  // Códigos que o Radar já guarda, para não repetir número. Sem banco, segue só com o que está nas pastas.
  if (!process.env.DATABASE_URL) return [];
  const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return ""; } })();
  if (host !== "localhost" && host !== "127.0.0.1") return [];
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query(`SELECT m.name AS fabricante, p.name, p.manufacturer_code AS codigo FROM products p JOIN manufacturers m ON m.id = p.manufacturer_id WHERE p.manufacturer_code IS NOT NULL`);
    return rows;
  } finally {
    await pool.end();
  }
}

export function montarPlano(pasta, arquivos, codigosBanco) {
  const lidos = arquivos.map((a) => ({ arquivo: a, ...ler(a) }));
  // sigla da pasta: a mais comum entre os códigos definitivos, senão derivada do nome
  const contaSigla = {};
  for (const l of lidos) if (l.forma === "codigo" && !PROVISORIOS.has(l.sigla)) contaSigla[l.sigla] = (contaSigla[l.sigla] || 0) + 1;
  const sigla = Object.entries(contaSigla).sort((a, b) => b[1] - a[1])[0]?.[0] || siglaDoFabricante(pasta);

  const usados = new Set(); // "TIPO-NNN" já em uso nesta sigla
  for (const l of lidos) if (l.forma === "codigo" && l.sigla === sigla) usados.add(`${l.tipo}-${l.numero}`);
  for (const b of codigosBanco) {
    const m = (b.codigo || "").match(/^(\p{Lu}+)-(BR|CO|PU|AN|OU|PI|CJ)-(\d{3})/u);
    if (m && m[1] === sigla && norm(b.fabricante) === norm(pasta)) usados.add(`${m[2]}-${m[3]}`);
  }
  const proximo = (tipo) => {
    let n = 1;
    while (usados.has(`${tipo}-${String(n).padStart(3, "0")}`)) n++;
    const codigo = `${sigla}-${tipo}-${String(n).padStart(3, "0")}`;
    usados.add(`${tipo}-${String(n).padStart(3, "0")}`);
    return codigo;
  };

  // Peças = close com custo (código/numerada). Modelo = "- modelo" ou arquivo simples com o mesmo nome.
  const closes = lidos.filter((l) => l.papel === "close" && !l.extra);
  const extras = lidos.filter((l) => l.extra);
  const porNome = new Map();
  for (const c of closes) {
    const k = norm(c.nome);
    if (!porNome.has(k)) porNome.set(k, []);
    porNome.get(k).push(c);
  }
  const consumidos = new Set();
  const pecas = [];
  const alertas = [];

  for (const c of closes) {
    // se o nome repete em peças diferentes (ex.: duas "Brinco argola com zircônia"), não adivinha o par
    const repetido = porNome.get(norm(c.nome)).length > 1;
    const modelos = lidos.filter((l) => !consumidos.has(l.arquivo) && l !== c && (l.papel === "modelo" || l.forma === "simples") && norm(l.nome) === norm(c.nome) && (l.forma !== "codigo" || !l.extra));
    const outro = repetido ? undefined : modelos[0];
    if (repetido) alertas.push(`${pasta}: o nome "${c.nome}" aparece em mais de uma peça, parear à mão`);
    const antigo = c.forma === "codigo" ? `${c.sigla}-${c.tipo}-${c.numero}` : null;
    const invertido = !!(outro && antigo && CODIGO_E_MODELO.has(`${pasta}|${antigo}`));
    const arquivoModelo = invertido ? c.arquivo : outro?.arquivo ?? null;
    const arquivoClose = invertido ? outro.arquivo : c.arquivo;
    consumidos.add(c.arquivo);
    if (outro) consumidos.add(outro.arquivo);

    const provisorio = c.forma !== "codigo" || PROVISORIOS.has(c.sigla);
    const tipo = c.forma === "codigo" && TIPOS.includes(c.tipo) ? c.tipo : tipoPeloNome(c.nome);
    const doBanco = repetido ? undefined : codigosBanco.find((b) => norm(b.fabricante) === norm(pasta) && norm(b.name) === norm(c.nome) && b.codigo);
    if (!provisorio && doBanco && doBanco.codigo !== antigo) alertas.push(`${pasta}: "${c.nome}" tem ${antigo} no arquivo e ${doBanco.codigo} no Radar, qual vale?`);
    const codigo = !provisorio ? antigo : doBanco ? doBanco.codigo : proximo(tipo);
    pecas.push({ codigo, codigoAntigo: antigo, mudaCodigo: provisorio, nome: c.nome, custo: c.custo, close: arquivoClose, modelo: arquivoModelo, invertido });
  }
  const avulsas = lidos.filter((l) => !consumidos.has(l.arquivo)).map((l) => l.arquivo);

  // Renomeações propostas
  const renomear = [];
  for (const p of pecas) {
    const ext = (f) => path.extname(f);
    const novoClose = p.custo === null ? null : `${p.codigo} - ${p.nome} - custo ${custoBR(p.custo)}${ext(p.close)}`;
    if (novoClose && novoClose !== p.close.normalize("NFC")) renomear.push({ de: p.close, para: novoClose, motivo: p.mudaCodigo ? "código definitivo" : "padrão do nome" });
    if (p.custo === null) alertas.push(`${pasta}: "${p.nome}" sem custo no nome do arquivo (Falta preço de custo)`);
    if (p.modelo) {
      const novoModelo = `${p.codigo} - ${p.nome} - modelo${ext(p.modelo)}`;
      if (novoModelo !== p.modelo.normalize("NFC")) renomear.push({ de: p.modelo, para: novoModelo, motivo: "foto da modelo no padrão" });
    }
  }
  // Fotos extras (_2): acompanham o código da peça
  for (const e of extras) {
    const dono = pecas.find((p) => norm(p.nome) === norm(e.nome));
    if (!dono) { alertas.push(`${pasta}: foto extra sem a peça principal: ${e.arquivo}`); continue; }
    const novo = `${dono.codigo}${e.extra} - ${e.nome} - custo ${custoBR(e.custo ?? dono.custo ?? 0)}${path.extname(e.arquivo)}`;
    if (novo !== e.arquivo.normalize("NFC")) renomear.push({ de: e.arquivo, para: novo, motivo: "foto extra acompanha o código" });
  }
  // Duas versões do mesmo arquivo (mesmo nome, extensões diferentes)
  const vistos = new Map();
  for (const l of lidos) {
    const k = semExt(l.arquivo.normalize("NFC"));
    if (vistos.has(k)) alertas.push(`${pasta}: duas versões do mesmo arquivo: ${vistos.get(k)} e ${l.arquivo}`);
    else vistos.set(k, l.arquivo);
  }
  return { pasta, sigla, pecas, avulsas, renomear, alertas };
}

async function plano() {
  const so = pega("--pasta");
  const banco = await codigosDoBanco();
  const pastas = fs.readdirSync(RAIZ, { withFileTypes: true }).filter((e) => e.isDirectory() && !/para nomear/i.test(e.name) && (!so || e.name === so)).map((e) => e.name);
  const resultado = [];
  for (const pasta of pastas) {
    const arquivos = fs.readdirSync(path.join(RAIZ, pasta), { withFileTypes: true }).filter((e) => e.isFile() && IMG.test(e.name)).map((e) => e.name);
    resultado.push(montarPlano(pasta, arquivos, banco));
  }
  const saida = pega("--saida");
  if (saida) fs.writeFileSync(saida, JSON.stringify(resultado, null, 1));
  let totalRen = 0, totalPecas = 0;
  console.log("Pasta | peças | sem modelo | renomear | código novo | avulsas | alertas");
  for (const r of resultado) {
    const semModelo = r.pecas.filter((p) => !p.modelo).length;
    const novos = r.pecas.filter((p) => p.mudaCodigo).length;
    totalRen += r.renomear.length; totalPecas += r.pecas.length;
    console.log(`${r.pasta} | ${r.pecas.length} | ${semModelo} | ${r.renomear.length} | ${novos} | ${r.avulsas.length} | ${r.alertas.length}`);
  }
  console.log(`TOTAL: ${totalPecas} peças, ${totalRen} arquivos a renomear. Nada foi alterado.`);
  return resultado;
}

function aplicar() {
  const arq = pega("--aplicar");
  if (!args.includes("--confirmar")) { console.error("Faltou --confirmar. Nada foi alterado."); process.exit(1); }
  const planos = JSON.parse(fs.readFileSync(arq, "utf8"));
  let ok = 0;
  const falhas = [];
  const feitos = []; // registro para poder desfazer
  for (const p of planos) {
    for (const r of p.renomear) {
      const de = path.join(RAIZ, p.pasta, r.de);
      const para = path.join(RAIZ, p.pasta, r.para);
      if (!fs.existsSync(de)) { falhas.push(`não achei: ${p.pasta}/${r.de}`); continue; }
      if (fs.existsSync(para)) { falhas.push(`já existe: ${p.pasta}/${r.para}`); continue; }
      fs.renameSync(de, para);
      feitos.push({ pasta: p.pasta, de: r.de, para: r.para });
      ok++;
    }
  }
  const log = arq.replace(/\.json$/, "") + ".renomeados.json";
  fs.writeFileSync(log, JSON.stringify(feitos, null, 1));
  console.log(`Renomeados: ${ok}. Falhas: ${falhas.length}. Registro para desfazer: ${log}`);
  falhas.forEach((f) => console.log("  ", f));
}

function desfazer() {
  const arq = pega("--desfazer");
  if (!args.includes("--confirmar")) { console.error("Faltou --confirmar. Nada foi alterado."); process.exit(1); }
  const feitos = JSON.parse(fs.readFileSync(arq, "utf8"));
  let ok = 0;
  for (const r of feitos.reverse()) {
    const atual = path.join(RAIZ, r.pasta, r.para);
    const volta = path.join(RAIZ, r.pasta, r.de);
    if (fs.existsSync(atual) && !fs.existsSync(volta)) { fs.renameSync(atual, volta); ok++; }
  }
  console.log(`Voltaram ao nome antigo: ${ok} de ${feitos.length}`);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1].endsWith("varrer-pastas.mjs")) {
  if (pega("--aplicar")) aplicar();
  else if (pega("--desfazer")) desfazer();
  else await plano();
}
