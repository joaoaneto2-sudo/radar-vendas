import type { Pool, PoolClient } from "pg";
import type { Quem } from "./audit";
import type { Fundo, FundRule, MesISO } from "./finance/funds";

// Fundos do negócio: as consultas ao banco. As regras (o que vale) ficam em lib/finance/funds.ts.

type Consulta = Pick<Pool | PoolClient, "query">;

export interface FundoSalvo extends Fundo {
  description: string | null;
  position: number;
}

export interface RegraSalva extends FundRule {
  createdByName: string | null;
}

/** Todos os fundos, na ordem da tela, inclusive os arquivados. */
export async function listarFundos(db: Consulta): Promise<FundoSalvo[]> {
  const { rows } = await db.query(`SELECT id, name, description, position, active FROM funds ORDER BY position, id`);
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, position: r.position, active: r.active }));
}

/** Todas as regras, a mais nova primeiro. */
export async function listarRegras(db: Consulta): Promise<RegraSalva[]> {
  const { rows } = await db.query(
    `SELECT id, fund_id, pct, to_char(from_month, 'YYYY-MM-DD') AS from_month, to_char(to_month, 'YYYY-MM-DD') AS to_month,
            created_at, created_by_name
       FROM fund_rules ORDER BY created_at DESC, id DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    fundId: r.fund_id,
    pct: Number(r.pct),
    fromMonth: r.from_month,
    toMonth: r.to_month,
    createdAt: new Date(r.created_at).toISOString(),
    createdByName: r.created_by_name,
  }));
}

/** Cria um fundo no fim da lista. Nome repetido dá erro do Postgres com code 23505. */
export async function criarFundo(db: Consulta, nome: string, descricao: string | null): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO funds (name, description, position)
     VALUES ($1, $2, COALESCE((SELECT max(position) FROM funds), 0) + 1) RETURNING id`,
    [nome, descricao]
  );
  return rows[0].id;
}

/** Renomeia, muda a descrição e/ou arquiva. Só muda o que veio. false = o fundo não existe. */
export async function mudarFundo(
  db: Consulta,
  id: number,
  campos: { name?: string; description?: string | null; active?: boolean }
): Promise<boolean> {
  const sets: string[] = [];
  const valores: unknown[] = [];
  if (campos.name !== undefined) {
    valores.push(campos.name);
    sets.push(`name = $${valores.length}`);
  }
  if (campos.description !== undefined) {
    valores.push(campos.description);
    sets.push(`description = $${valores.length}`);
  }
  if (campos.active !== undefined) {
    valores.push(campos.active);
    sets.push(`active = $${valores.length}`);
  }
  if (sets.length === 0) return fundoExiste(db, id);
  valores.push(id);
  const { rowCount } = await db.query(`UPDATE funds SET ${sets.join(", ")} WHERE id = $${valores.length}`, valores);
  return (rowCount ?? 0) > 0;
}

export async function criarRegraDeFundo(
  db: Consulta,
  r: { fundId: number; pct: number; fromMonth: MesISO; toMonth: MesISO | null },
  quem: Quem
): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO fund_rules (fund_id, pct, from_month, to_month, created_by_id, created_by_name)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [r.fundId, r.pct, r.fromMonth, r.toMonth, quem.id, quem.name]
  );
  return rows[0].id;
}

/** Apaga uma regra (a anterior volta a valer nos meses em comum). false = não existia. */
export async function apagarRegraDeFundo(db: Consulta, id: number): Promise<boolean> {
  const { rowCount } = await db.query(`DELETE FROM fund_rules WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

/** O fundo existe e está ativo (só esses aparecem para escolher numa despesa ou numa regra nova). */
export async function fundoDisponivel(db: Consulta, id: number): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM funds WHERE id = $1 AND active`, [id]);
  return rows.length > 0;
}

export async function fundoExiste(db: Consulta, id: number): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM funds WHERE id = $1`, [id]);
  return rows.length > 0;
}
