import type { Pool, PoolClient } from "pg";
import { centsToDecimalString } from "./finance/money";
import { semAcento, type ItemAporte, type ItemDaPlanilha, type ItemVenda } from "./import-vendas";

// Importar vendas e aportes da planilha: previsão (sem gravar) e importação (tudo ou nada).
// Colar a mesma tabela duas vezes não duplica: o que já existe é reconhecido e pulado.

export type Consulta = Pick<Pool | PoolClient, "query">;

export type Situacao = "novo" | "ja_existe" | "ignorada";

export interface Previsto {
  item: ItemDaPlanilha;
  situacao: Situacao;
  clienteNovo: boolean; // vai criar cadastro de cliente
}

export interface ResultadoDaImportacao {
  vendas: number;
  aportes: number;
  clientesNovos: number;
  jaExistiam: number;
  ignoradas: number;
}

const VENDEDORA = "Fernanda";
const MOTIVO_DO_APORTE = "Aporte de investimento (importado da planilha)";

async function clientesPorNome(db: Consulta): Promise<Map<string, number>> {
  const { rows } = await db.query(`SELECT id, full_name FROM clients WHERE full_name IS NOT NULL`);
  return new Map(rows.map((r) => [semAcento(String(r.full_name)), r.id as number]));
}

async function contarVendasIguais(db: Consulta, v: ItemVenda): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM sales
      WHERE sale_date = $1 AND sale_value = $2 AND lower(COALESCE(client_name, '')) = lower($3) AND status = 'ativa'`,
    [v.data, centsToDecimalString(v.valorCents), v.cliente]
  );
  return rows[0].n;
}

async function contarAportesIguais(db: Consulta, a: ItemAporte): Promise<number> {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM receipts
      WHERE kind = 'aporte_socio' AND status = 'recebida' AND received_date = $1 AND amount = $2 AND partner = $3`,
    [a.data, centsToDecimalString(a.valorCents), a.socio]
  );
  return rows[0].n;
}

/** Diz o que cada linha vai fazer (nova, já existe, ignorada) sem gravar nada. */
export async function preverImportacao(db: Consulta, itens: ItemDaPlanilha[]): Promise<Previsto[]> {
  const clientes = await clientesPorNome(db);
  const novosNestaColagem = new Set<string>();
  const jaContadas = new Map<string, number>(); // linhas idênticas: cada uma "gasta" uma que já existe
  const previstos: Previsto[] = [];

  for (const item of itens) {
    if (item.tipo === "ignorada") {
      previstos.push({ item, situacao: "ignorada", clienteNovo: false });
      continue;
    }

    const chave =
      item.tipo === "venda"
        ? `v|${item.data}|${item.valorCents}|${item.cliente.toLowerCase()}`
        : `a|${item.data}|${item.valorCents}|${item.socio}`;
    const existentes = item.tipo === "venda" ? await contarVendasIguais(db, item) : await contarAportesIguais(db, item);
    const usadas = jaContadas.get(chave) ?? 0;
    if (usadas < existentes) {
      jaContadas.set(chave, usadas + 1);
      previstos.push({ item, situacao: "ja_existe", clienteNovo: false });
      continue;
    }

    let clienteNovo = false;
    if (item.tipo === "venda" && item.criarCliente) {
      const nome = semAcento(item.cliente);
      if (!clientes.has(nome) && !novosNestaColagem.has(nome)) {
        clienteNovo = true;
        novosNestaColagem.add(nome);
      }
    }
    previstos.push({ item, situacao: "novo", clienteNovo });
  }
  return previstos;
}

async function idDaVendedora(db: Consulta): Promise<number> {
  const { rows } = await db.query(`SELECT id FROM sellers WHERE lower(name) = lower($1) LIMIT 1`, [VENDEDORA]);
  if (rows.length > 0) return rows[0].id;
  const criada = await db.query(`INSERT INTO sellers (name) VALUES ($1) RETURNING id`, [VENDEDORA]);
  return criada.rows[0].id;
}

/**
 * Grava tudo o que a previsão marcou como novo, numa transação só (se algo falhar, nada fica pela metade).
 * Cada venda entra como varejo, Pix à vista, já recebida na data da venda, sem peça e sem custo (o João completa depois).
 */
export async function importarItens(pool: Pool, itens: ItemDaPlanilha[]): Promise<ResultadoDaImportacao> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const previstos = await preverImportacao(client, itens);
    const resultado: ResultadoDaImportacao = { vendas: 0, aportes: 0, clientesNovos: 0, jaExistiam: 0, ignoradas: 0 };

    const clientes = await clientesPorNome(client);
    let vendedoraId: number | null = null;

    for (const p of previstos) {
      if (p.situacao === "ignorada") {
        resultado.ignoradas += 1;
        continue;
      }
      if (p.situacao === "ja_existe") {
        resultado.jaExistiam += 1;
        continue;
      }

      const item = p.item;
      if (item.tipo === "aporte") {
        await client.query(
          `INSERT INTO receipts (kind, status, received_date, amount, partner, reason, payment_method)
           VALUES ('aporte_socio', 'recebida', $1, $2, $3, $4, 'Pix')`,
          [item.data, centsToDecimalString(item.valorCents), item.socio, MOTIVO_DO_APORTE]
        );
        resultado.aportes += 1;
        continue;
      }

      if (item.tipo !== "venda") continue;

      let clienteId: number | null = null;
      if (item.criarCliente) {
        const nome = semAcento(item.cliente);
        clienteId = clientes.get(nome) ?? null;
        if (clienteId === null) {
          const nova = await client.query(`INSERT INTO clients (full_name) VALUES ($1) RETURNING id`, [item.cliente]);
          clienteId = nova.rows[0].id as number;
          clientes.set(nome, clienteId);
          resultado.clientesNovos += 1;
        }
      }
      if (vendedoraId === null) vendedoraId = await idDaVendedora(client);

      const valor = centsToDecimalString(item.valorCents);
      const venda = await client.query(
        `INSERT INTO sales (sale_date, seller, seller_id, client_name, client_id, price_tier, sale_value, cost,
                            payment_method, sale_costs, payment_fee)
         VALUES ($1, $2, $3, $4, $5, 'varejo', $6, NULL, $7, 0, 0) RETURNING id`,
        [item.data, VENDEDORA, vendedoraId, item.cliente, clienteId, valor, item.formaDePagamento]
      );
      await client.query(
        `INSERT INTO sale_payments (sale_id, due_date, amount, status, received_date)
         VALUES ($1, $2, $3, 'recebida', $2)`,
        [venda.rows[0].id, item.data, valor]
      );
      resultado.vendas += 1;
    }

    await client.query("COMMIT");
    return resultado;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
