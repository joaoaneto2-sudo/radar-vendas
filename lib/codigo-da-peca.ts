// Código da peça: SIGLA-TIPO-NNN (ex.: BRILHARE-BR-005). A sigla vem do fabricante e o tipo da categoria.
// Sugere o próximo número livre do fabricante para o tipo.

export const FORMATO_DO_CODIGO = /^\p{Lu}+-(BR|CO|PU|AN|OU|PI|CJ)-\d{3}$/u;

const TIPO_DA_CATEGORIA: Record<string, string> = {
  Brincos: "BR",
  "Colares e Correntes": "CO",
  Pulseiras: "PU",
  Anéis: "AN",
  Pingentes: "PI",
  Conjuntos: "CJ",
  Outros: "OU",
};

export const tipoDaCategoria = (categoria: string | null | undefined): string => TIPO_DA_CATEGORIA[categoria ?? ""] ?? "OU";

export function siglaDoNome(nome: string): string {
  return nome.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
}

export function ehProvisorio(codigo: string | null | undefined): boolean {
  return !!codigo && /^(NOVO|SEMFORN)-/.test(codigo);
}

/**
 * Próximo código livre. `doFabricante` são as peças que já existem desse fabricante (com ou sem código).
 * A sigla é a mais usada entre os códigos definitivos dele; sem nenhum, vem do nome do fabricante.
 */
export function proximoCodigo(
  doFabricante: { manufacturer_code?: string | null }[],
  nomeDoFabricante: string,
  categoria: string | null | undefined
): string {
  const tipo = tipoDaCategoria(categoria);
  const siglas = new Map<string, number>();
  const usados = new Set<string>();
  for (const p of doFabricante) {
    const m = (p.manufacturer_code ?? "").match(/^(\p{Lu}+)-(BR|CO|PU|AN|OU|PI|CJ)-(\d{3})$/u);
    if (!m || ehProvisorio(p.manufacturer_code)) continue;
    siglas.set(m[1], (siglas.get(m[1]) ?? 0) + 1);
    usados.add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  const sigla = [...siglas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? siglaDoNome(nomeDoFabricante);
  let n = 1;
  while (usados.has(`${sigla}-${tipo}-${String(n).padStart(3, "0")}`)) n++;
  return `${sigla}-${tipo}-${String(n).padStart(3, "0")}`;
}
