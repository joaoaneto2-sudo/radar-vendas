// Alertas de dado que falta na peça, mostrados em Produtos e cadastros. Cada alerta tem uma chave e um texto.
// Peça de atacado é do fabricante (a loja só ganha comissão): para ela só valem foto e preço de venda.

import { faltaCusto } from "./custo";
import { temPreco } from "./catalogo-filtro";

export type ChaveAlerta = "custo" | "preco" | "foto" | "modelo" | "codigo";

export const TEXTO_DO_ALERTA: Record<ChaveAlerta, string> = {
  custo: "Falta preço de custo",
  preco: "Falta preço de venda",
  foto: "Falta foto",
  modelo: "Falta foto da modelo",
  codigo: "Falta código",
};

export const ORDEM_DOS_ALERTAS: ChaveAlerta[] = ["custo", "preco", "foto", "modelo", "codigo"];

export interface PecaParaAlerta {
  cost?: number | string | null;
  price?: number | string | null;
  sale_channel?: string | null;
  photo_url?: string | null;
  modelo_photo_url?: string | null;
  catalog_photo?: { kind: "limpa" | "modelo" } | null;
  manufacturer_code?: string | null;
}

const vazio = (v: string | null | undefined) => v === null || v === undefined || v.trim() === "";

export function alertasDaPeca(p: PecaParaAlerta): ChaveAlerta[] {
  const nossa = p.sale_channel !== "atacado";
  const alertas: ChaveAlerta[] = [];
  if (faltaCusto(p)) alertas.push("custo");
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
  const total: Record<ChaveAlerta, number> = { custo: 0, preco: 0, foto: 0, modelo: 0, codigo: 0 };
  for (const p of pecas) for (const a of alertasDaPeca(p)) total[a]++;
  return total;
}
