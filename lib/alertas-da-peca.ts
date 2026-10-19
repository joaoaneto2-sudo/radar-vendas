// Alertas de dado que falta na peça, mostrados em Produtos e cadastros. Cada alerta tem uma chave e um texto.
// Peça de atacado é do fabricante (a loja só ganha comissão): para ela só valem foto e preço de venda.

import { faltaCusto } from "./custo";
import { temPreco } from "./catalogo-filtro";

export type ChaveAlerta = "custo" | "custoPasta" | "preco" | "foto" | "modelo" | "codigo";

export const TEXTO_DO_ALERTA: Record<ChaveAlerta, string> = {
  custo: "Falta preço de custo",
  custoPasta: "Custo diverge da pasta",
  preco: "Falta preço de venda",
  foto: "Falta foto",
  modelo: "Falta foto da modelo",
  codigo: "Falta código",
};

export const ORDEM_DOS_ALERTAS: ChaveAlerta[] = ["custo", "custoPasta", "preco", "foto", "modelo", "codigo"];

/** Para cada alerta: qual é o problema e como resolver (mostrado ao passar o mouse e na janelinha do alerta). */
export const AJUDA_DO_ALERTA: Record<ChaveAlerta, { problema: string; comoResolver: string }> = {
  custo: {
    problema: "A peça não tem o preço de custo. Sem ele o Radar não calcula lucro, nem o valor do estoque, nem o preço de venda (custo × 2,5).",
    comoResolver: "Digite o custo e salve. Deixe marcada a opção de refazer o preço de venda para ele sair custo × 2,5.",
  },
  custoPasta: {
    problema: "O custo do cadastro é diferente do custo que está no nome do arquivo da foto, na pasta do fabricante. Um dos dois está errado.",
    comoResolver: 'Escolha: "Ficar com o do Radar" (o nome do arquivo é acertado na próxima varredura) ou "Usar o da pasta" (o Radar passa a ter o custo do arquivo).',
  },
  preco: {
    problema: "A peça não tem preço de venda. Peça sem preço não aparece no Criar catálogo.",
    comoResolver: 'Digite o preço, ou use o botão "custo × 2,5" quando a peça já tem custo.',
  },
  foto: {
    problema: "A peça não tem foto. No catálogo e no site ela sairia sem imagem.",
    comoResolver: "Abra a peça e adicione a foto. Se a foto está no computador, salve na pasta do fabricante com o nome padrão e peça a varredura das pastas.",
  },
  modelo: {
    problema: "A peça só tem a foto do produto, sem a foto com a modelo. No catálogo a página sai com um lado em branco.",
    comoResolver: "Salve a foto da modelo na pasta do fabricante com o nome padrão (CÓDIGO - Nome - modelo) e peça a varredura das pastas. Também dá para abrir a peça e adicionar a foto lá.",
  },
  codigo: {
    problema: "A peça não tem código, ou tem um código provisório (NOVO- ou SEMFORN-). O código identifica a peça nas pastas, nas fotos e na planilha.",
    comoResolver: "O Radar sugere o próximo código livre do fabricante. Confira e salve.",
  },
};

export interface PecaParaAlerta {
  cost?: number | string | null;
  price?: number | string | null;
  sale_channel?: string | null;
  photo_url?: string | null;
  modelo_photo_url?: string | null;
  catalog_photo?: { kind: "limpa" | "modelo" } | null;
  manufacturer_code?: string | null;
  custo_da_pasta?: number | string | null;
}

const vazio = (v: string | null | undefined) => v === null || v === undefined || v.trim() === "";

/** O custo que está no nome do arquivo da pasta é diferente do custo do cadastro. */
export function custoEmDuvida(p: Pick<PecaParaAlerta, "cost" | "custo_da_pasta">): boolean {
  if (p.custo_da_pasta === null || p.custo_da_pasta === undefined || p.custo_da_pasta === "" || p.cost === null || p.cost === undefined || p.cost === "") return false;
  return Math.abs(Number(p.custo_da_pasta) - Number(p.cost)) > 0.001;
}

export function alertasDaPeca(p: PecaParaAlerta): ChaveAlerta[] {
  const nossa = p.sale_channel !== "atacado";
  const alertas: ChaveAlerta[] = [];
  if (faltaCusto(p)) alertas.push("custo");
  else if (custoEmDuvida(p)) alertas.push("custoPasta");
  if (!temPreco(p)) alertas.push("preco");
  if (vazio(p.photo_url)) alertas.push("foto");
  // Sem foto da modelo a página do catálogo sai com um lado em branco. Peça cuja foto única é da modelo (kind modelo) está ok.
  else if (nossa && vazio(p.modelo_photo_url) && p.catalog_photo?.kind !== "modelo") alertas.push("modelo");
  // Código provisório (NOVO-, SEMFORN-) ainda precisa virar o definitivo.
  if (nossa && (vazio(p.manufacturer_code) || /^(NOVO|SEMFORN)-/.test(p.manufacturer_code!))) alertas.push("codigo");
  return alertas;
}

/** Quantas peças têm cada alerta. */
export function contarAlertas(pecas: PecaParaAlerta[]): Record<ChaveAlerta, number> {
  const total: Record<ChaveAlerta, number> = { custo: 0, custoPasta: 0, preco: 0, foto: 0, modelo: 0, codigo: 0 };
  for (const p of pecas) for (const a of alertasDaPeca(p)) total[a]++;
  return total;
}
