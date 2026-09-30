// Importação genérica de peças (catálogo online, Fase 3): lê nome e custo do NOME DO ARQUIVO da foto.
//
// Padrão combinado com o João: "<qualquer coisa> - <nome da peça> - custo <valor com vírgula>.jpeg"
// Exemplos reais:
//   "01 - Anel Cristal Transparente - custo 173,75.jpeg"
//   "NOVO-AN-001 - Aliança 15 inteira em pedra de moissanite 4mm - custo 489,00.jpeg"

import { toCents, type Cents } from "./finance/money";

export interface PecaDoArquivo {
  nome: string;
  custoCentavos: Cents;
}

const PARTE_CUSTO = /custo\s+([\d.,]+)/i;

/**
 * Lê nome e custo do nome do arquivo da foto. Devolve null se o arquivo não seguir o padrão
 * (sem a palavra "custo" no fim, ou menos de 2 traços " - " separando as partes): a peça entra
 * na tela como "não reconhecida" e a pessoa preenche nome e custo à mão.
 */
export function lerNomeDoArquivo(nomeDoArquivo: string): PecaDoArquivo | null {
  const semExtensao = nomeDoArquivo.replace(/\.[a-zA-Z0-9]+$/, "");
  const partes = semExtensao
    .split(" - ")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (partes.length < 3) return null; // precisa de pelo menos 2 traços " - "

  const parteCusto = partes[partes.length - 1];
  const achou = PARTE_CUSTO.exec(parteCusto);
  if (!achou) return null; // sem a palavra "custo"

  const nome = partes.slice(1, -1).join(" - ").trim();
  if (!nome) return null;

  // O valor vem no padrão brasileiro (ponto de milhar, vírgula decimal). Tira os pontos de milhar
  // antes de reaproveitar toCents, que já sabe trocar a vírgula decimal por ponto.
  const valorSemMilhar = achou[1].replace(/\./g, "");
  let custoCentavos: Cents;
  try {
    custoCentavos = toCents(valorSemMilhar);
  } catch {
    return null;
  }
  if (custoCentavos <= 0) return null;

  return { nome, custoCentavos };
}
