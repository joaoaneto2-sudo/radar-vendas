// Catálogos montados pela Fernanda na tela Montar Catálogo (migração 026): a capa e as peças já na ordem das páginas.
// O João abre o modelo no Criar catálogo e gera o PDF de lá.

import type { Pool } from "pg";
import { CAPAS } from "./catalogo-layout";

export type ModeloDeCatalogo = {
  id: number;
  nome: string;
  capa: string;
  pecas: number[]; // ids na ordem das páginas
  tipos: string[];
  fabricantes: string[];
  criadoPor: string | null;
  criadoEm: string;
};

export type NovoModelo = { nome: string; capa: string; pecas: number[]; tipos?: string[]; fabricantes?: string[] };

/** Confere o que veio da tela; devolve a mensagem do problema ou null. */
export function problemaDoModelo(m: unknown): string | null {
  const x = m as Partial<NovoModelo> | null;
  if (!x || typeof x.nome !== "string" || !x.nome.trim() || x.nome.length > 120) return "Dê um nome ao catálogo.";
  if (typeof x.capa !== "string" || !CAPAS.includes(x.capa)) return "Escolha uma capa.";
  if (!Array.isArray(x.pecas) || x.pecas.length === 0) return "Escolha pelo menos uma peça.";
  if (x.pecas.length > 500 || !x.pecas.every((id) => Number.isInteger(id) && id > 0)) return "Lista de peças inválida.";
  if (new Set(x.pecas).size !== x.pecas.length) return "Há peça repetida na lista.";
  return null;
}

const textos = (v: unknown) => (Array.isArray(v) ? v.filter((t): t is string => typeof t === "string").slice(0, 50) : []);

export async function salvarModelo(db: Pool, m: NovoModelo, criadoPor: string | null): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO modelos_catalogo (nome, capa, pecas, tipos, fabricantes, criado_por) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6) RETURNING id`,
    [m.nome.trim(), m.capa, JSON.stringify(m.pecas), JSON.stringify(textos(m.tipos)), JSON.stringify(textos(m.fabricantes)), criadoPor]
  );
  return rows[0].id as number;
}

export async function listarModelos(db: Pool, limite = 20): Promise<ModeloDeCatalogo[]> {
  const { rows } = await db.query(
    `SELECT id, nome, capa, pecas, tipos, fabricantes, criado_por, created_at FROM modelos_catalogo ORDER BY created_at DESC, id DESC LIMIT $1`,
    [limite]
  );
  return rows.map((r) => ({
    id: r.id,
    nome: r.nome,
    capa: r.capa,
    pecas: r.pecas,
    tipos: r.tipos,
    fabricantes: r.fabricantes,
    criadoPor: r.criado_por,
    criadoEm: new Date(r.created_at).toISOString(),
  }));
}

export async function apagarModelo(db: Pool, id: number): Promise<boolean> {
  const r = await db.query(`DELETE FROM modelos_catalogo WHERE id = $1`, [id]);
  return (r.rowCount ?? 0) > 0;
}
