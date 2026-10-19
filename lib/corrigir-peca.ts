// Correção rápida de um dado que falta na peça (custo, preço de venda ou código), feita ao clicar no alerta.
// Muda só esses campos; o resto da peça fica como está. O histórico de alterações registra quem mudou.

import type { PoolClient } from "pg";
import { lerValor } from "./catalogo-filtro";
import { FORMATO_DO_CODIGO } from "./codigo-da-peca";
import { MARKUP_PADRAO } from "./importar-lote";

export interface Correcao {
  cost?: number;
  price?: number;
  manufacturer_code?: string;
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
  if (Object.keys(correcao).length === 0) return { ok: false, message: "Nada para corrigir." };
  return { ok: true, correcao };
}

export type ResultadoDaCorrecao =
  | { ok: true; item: { id: number; cost: string | null; price: string | null; manufacturer_code: string | null } }
  | { ok: false; error: "not_found" | "code_taken"; message: string };

/** Grava a correção (dentro da transação já aberta por quem chama). */
export async function aplicarCorrecao(client: Pick<PoolClient, "query">, id: number, c: Correcao): Promise<ResultadoDaCorrecao> {
  const { rows } = await client.query(`SELECT id, manufacturer_id FROM products WHERE id = $1`, [id]);
  if (rows.length === 0) return { ok: false, error: "not_found", message: "Peça não encontrada." };
  if (c.manufacturer_code && rows[0].manufacturer_id !== null) {
    const ocupado = await client.query(`SELECT name FROM products WHERE manufacturer_id = $1 AND manufacturer_code = $2 AND id <> $3`, [rows[0].manufacturer_id, c.manufacturer_code, id]);
    if (ocupado.rows.length > 0) return { ok: false, error: "code_taken", message: `O código ${c.manufacturer_code} já é da peça "${ocupado.rows[0].name}".` };
  }
  const { rows: atualizada } = await client.query(
    `UPDATE products SET cost = COALESCE($1, cost), price = COALESCE($2, price), manufacturer_code = COALESCE($3, manufacturer_code)
      WHERE id = $4 RETURNING id, cost, price, manufacturer_code`,
    [c.cost ?? null, c.price ?? null, c.manufacturer_code ?? null, id]
  );
  return { ok: true, item: atualizada[0] };
}
