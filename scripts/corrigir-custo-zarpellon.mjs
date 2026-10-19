// Corrige o nome dos arquivos da Zarpellon que ainda tem "custo _79" (underline não apagado) para
// o padrão "custo 79,00" que o sistema reconhece. Só renomeia (não apaga, não move). Script de uso
// único (descartável).
//
// Uso: node scripts/corrigir-custo-zarpellon.mjs

import fs from "node:fs";
import path from "node:path";

const ESTOQUE_ROOT = "C:\\Users\\João\\Claude\\Projetos\\Fernanda Brilhante\\Estoque\\1 - Estoque Principal";
const PASTAS = ["Zarpellon", "Zarpellon - para nomear"];

const PADRAO_SOLTO = /custo _(\d+)(?:,(\d+))?(?=\.[a-zA-Z0-9]+$)/;
const PADRAO_VAZIO = /custo _(?=\.[a-zA-Z0-9]+$)/;

let corrigidos = 0;
const aindaVazios = [];

for (const pastaDir of PASTAS) {
  const full = path.join(ESTOQUE_ROOT, pastaDir);
  let entradas = [];
  try {
    entradas = fs.readdirSync(full, { withFileTypes: true });
  } catch {
    continue;
  }
  for (const e of entradas) {
    if (!e.isFile()) continue;
    const nome = e.name;
    const m = PADRAO_SOLTO.exec(nome);
    if (m) {
      const inteiro = m[1];
      const decimal = (m[2] ?? "00").padEnd(2, "0").slice(0, 2);
      const novoNome = nome.replace(PADRAO_SOLTO, `custo ${inteiro},${decimal}`);
      fs.renameSync(path.join(full, nome), path.join(full, novoNome));
      console.log(`[${pastaDir}] "${nome}" -> "${novoNome}"`);
      corrigidos++;
      continue;
    }
    if (PADRAO_VAZIO.test(nome)) {
      aindaVazios.push(`[${pastaDir}] ${nome}`);
    }
  }
}

console.log(`\nCorrigidos: ${corrigidos}`);
if (aindaVazios.length) {
  console.log(`Ainda sem valor nenhum (precisam do custo do João):`);
  aindaVazios.forEach((a) => console.log(`  - ${a}`));
}
