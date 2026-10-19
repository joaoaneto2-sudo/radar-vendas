// Peça nossa (varejo) sem preço de custo: o Radar mostra o alerta "Falta preço de custo" no lugar do valor.
// Peça de atacado é do fabricante (a loja só ganha comissão), então o custo dela não conta.

export const ALERTA_FALTA_CUSTO = "Falta preço de custo";

export function faltaCusto(p: { cost?: number | string | null; sale_channel?: string | null }): boolean {
  if (p.sale_channel === "atacado") return false;
  if (p.cost === null || p.cost === undefined || p.cost === "") return true;
  const n = Number(p.cost);
  return !Number.isFinite(n) || n <= 0;
}
