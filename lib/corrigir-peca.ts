// Correção rápida de um dado que falta na peça (custo, preço de venda, código) ou resolução de uma dúvida de custo,
// feita ao clicar no alerta. Muda só esses campos; o resto da peça fica como está. O histórico de alterações
// registra quem mudou.

import type { PoolClient } from "pg";
import { lerValor } from "./catalogo-filtro";
import { FORMATO_DO_CODIGO } from "./codigo-da-peca";
import { MARKUP_PADRAO } from "./importar-lote";

export interface Correcao {
  cost?: number;
  price?: number;
  manufacturer_code?: string;
  // Dúvida de custo (custo do cadastro x custo do nome do arquivo): "radar" fica com o cadastro, "pasta" usa o do arquivo.
  resolverCusto?: "radar" | "pasta";
  calcularPrecoDaPasta?: boolean;
}

const num = (v: unknown): number | null => (typeof v === "number" ? (Number.isFinite(v) ? v : null) : typeof v === "string" ? lerValor(v) : null);

/** Confere o que chegou. Com `calcularPreco`, o preço de venda vira custo x 2,5. */
export function validarCorrecao(corpo: unknown): { ok: true; correcao: Correcao } | { ok: false; message: string } {
  const b = (corpo ?? {}) as Record<string, unknown>;
  const correcao: Correcao = {};
  if (b.custo !== undefined) {
    const c = num(b.custo);
    if (c === null || c <= 0) return { ok: false, message: "Informe um custo maior que zero." };
    correcao.cost = c;
    if (b.calcularPreco === true) correcao.price = Math.round(c * MARKUP_PADRAO * 100) / 100;
  }
  if (b.preco !== undefined) {
    const p = num(b.preco);
    if (p === null || p <= 0) return { ok: false, message: "Informe um preço de venda maior que zero." };
    correcao.price = p;
  }
  if (b.codigo !== undefined) {
    const c = typeof b.codigo === "string" ? b.codigo.trim() : "";
    if (!FORMATO_DO_CODIGO.test(c)) return { ok: false, message: "O código deve ser no formato SIGLA-TIPO-NNN, por exemplo BRILHARE-BR-005." };
    correcao.manufacturer_code = c;
  }
  if (b.resolverCusto !== undefined) {
    if (b.resolverCusto !== "radar" && b.resolverCusto !== "pasta") return { ok: false, message: "Escolha ficar com o custo do Radar ou usar o da pasta." };
    correcao.resolverCusto = b.resolverCusto;
    correcao.calcularPrecoDaPasta = b.calcularPreco === true;
  }
  if (Object.keys(correcao).length === 0) return { ok: false, message: "Nada para corrigir." };
  return { ok: true, correcao };
}

export type ResultadoDaCorrecao =
  | { ok: true; item: { id: number; cost: string | null; price: string | null; manufacturer_code: string | null; custo_da_pasta: string | null } }
  | { ok: false; error: "not_found" | "code_taken" | "no_doubt"; message: string };

/** Grava a correção (dentro da transação já aberta por quem chama). */
export async function aplicarCorrecao(client: Pick<PoolClient, "query">, id: number, c: Correcao): Promise<ResultadoDaCorrecao> {
  const { rows } = await client.query(`SELECT id, manufacturer_id, custo_da_pasta FROM products WHERE id = $1`, [id]);
  if (rows.length === 0) return { ok: false, error: "not_found", message: "Peça não encontrada." };
  if (c.manufacturer_code && rows[0].manufacturer_id !== null) {
    const ocupado = await client.query(`SELECT name FROM products WHERE manufacturer_id = $1 AND manufacturer_code = $2 AND id <> $3`, [rows[0].manufacturer_id, c.manufacturer_code, id]);
    if (ocupado.rows.length > 0) return { ok: false, error: "code_taken", message: `O código ${c.manufacturer_code} já é da peça "${ocupado.rows[0].name}".` };
  }

  let custo = c.cost ?? null;
  let preco = c.price ?? null;
  let limparDuvida = false;
  if (c.resolverCusto) {
    limparDuvida = true;
    if (c.resolverCusto === "pasta") {
      if (rows[0].custo_da_pasta === null) return { ok: false, error: "no_doubt", message: "Esta peça não tem custo em dúvida." };
      custo = Number(rows[0].custo_da_pasta);
      if (c.calcularPrecoDaPasta) preco = Math.round(custo * MARKUP_PADRAO * 100) / 100;
    }
  }

  const { rows: atualizada } = await client.query(
    `UPDATE products SET cost = COALESCE($1, cost), price = COALESCE($2, price), manufacturer_code = COALESCE($3, manufacturer_code),
            custo_da_pasta = CASE WHEN $4::boolean THEN NULL ELSE custo_da_pasta END
      WHERE id = $5 RETURNING id, cost, price, manufacturer_code, custo_da_pasta`,
    [custo, preco, c.manufacturer_code ?? null, limparDuvida, id]
  );
  return { ok: true, item: atualizada[0] };
}
