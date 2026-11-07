import type { Pool } from "pg";
import { semAcento } from "./import-vendas";
import { lerVendaDoWhatsapp, type VendaLida } from "./venda-whatsapp";

// Grava no radar uma venda que chegou pelo WhatsApp (o Roberto manda o texto).
// A mesma mensagem nunca vira duas vendas: cada message_id fica registrado em vendas_whatsapp.
// Se a mesma venda (data, valor, cliente) já existe no radar, não grava de novo.

export interface MensagemDeVenda {
  messageId: string;
  texto: string;
  enviadaEm: string; // ISO da mensagem; a data dela é usada para descobrir o ano da venda
  origem?: string | null; // de onde veio (grupo, número)
}

export type ResultadoDaMensagem =
  | { situacao: "gravada"; saleId: number; venda: VendaLida; repetida: false }
  | { situacao: "ja_existe"; saleId: number | null; venda: VendaLida | null; repetida: boolean }
  | { situacao: "recusada"; motivo: string; repetida: boolean };

function dataLocal(iso: string): string {
  // Dia da mensagem no horário de Recife (UTC-3).
  const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000);
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

export async function gravarVendaDoWhatsapp(pool: Pool, msg: MensagemDeVenda): Promise<ResultadoDaMensagem> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Trava por mensagem: dois envios iguais ao mesmo tempo não gravam duas vezes.
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["venda-whatsapp:" + msg.messageId]);

    const anterior = await client.query(
      `SELECT situacao, sale_id, avisos FROM vendas_whatsapp WHERE message_id = $1`,
      [msg.messageId]
    );
    if (anterior.rows.length > 0) {
      await client.query("COMMIT");
      const a = anterior.rows[0];
      if (a.situacao === "recusada") return { situacao: "recusada", motivo: a.avisos ?? "", repetida: true };
      return { situacao: "ja_existe", saleId: a.sale_id, venda: null, repetida: true };
    }

    const registrar = (situacao: string, saleId: number | null, avisos: string) =>
      client.query(
        `INSERT INTO vendas_whatsapp (message_id, situacao, sale_id, avisos, texto, origem, enviada_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [msg.messageId, situacao, saleId, avisos, msg.texto, msg.origem ?? null, msg.enviadaEm]
      );

    const leitura = lerVendaDoWhatsapp(msg.texto, dataLocal(msg.enviadaEm));
    if (!leitura.ok) {
      await registrar("recusada", null, leitura.motivo);
      await client.query("COMMIT");
      return { situacao: "recusada", motivo: leitura.motivo, repetida: false };
    }
    const v = leitura.venda;

    const igual = await client.query(
      `SELECT id FROM sales
        WHERE sale_date = $1 AND sale_value = $2 AND lower(COALESCE(client_name, '')) = lower($3) AND status = 'ativa'
        ORDER BY id LIMIT 1`,
      [v.data, v.valor.toFixed(2), v.cliente.nome]
    );
    if (igual.rows.length > 0) {
      await registrar("ja_existe", igual.rows[0].id, v.avisos.join(" | "));
      await client.query("COMMIT");
      return { situacao: "ja_existe", saleId: igual.rows[0].id, venda: v, repetida: false };
    }

    // Cliente: usa o cadastro com o mesmo nome; se não houver, cria.
    const nomeLimpo = semAcento(v.cliente.nome);
    const achado = await client.query(`SELECT id, full_name FROM clients`);
    let clienteId: number | null =
      achado.rows.find((r) => semAcento(String(r.full_name)) === nomeLimpo)?.id ?? null;
    if (clienteId === null) {
      const novo = await client.query(
        `INSERT INTO clients (full_name, nickname, city, phone) VALUES ($1, $2, $3, $4) RETURNING id`,
        [v.cliente.nome, v.cliente.apelido, v.cliente.cidade, v.cliente.telefone]
      );
      clienteId = novo.rows[0].id;
    }

    let vendedoraId: number | null = null;
    const vend = await client.query(`SELECT id FROM sellers WHERE lower(name) = lower($1) LIMIT 1`, [v.vendedora]);
    if (vend.rows.length > 0) vendedoraId = vend.rows[0].id;
    else vendedoraId = (await client.query(`INSERT INTO sellers (name) VALUES ($1) RETURNING id`, [v.vendedora])).rows[0].id;

    const { rows } = await client.query(
      `INSERT INTO sales (
         sale_date, sale_type, seller, seller_id, product_type, manufacturer, supplier, warranty,
         cost, sale_value, payment_method, installments_count,
         client_name, client_nickname, client_city, client_phone, client_id,
         price_tier, sale_costs, payment_fee
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,0,0)
       RETURNING id`,
      [
        v.data,
        v.canal,
        v.vendedora,
        vendedoraId,
        v.peca,
        v.fabricante,
        v.fornecedor,
        v.garantia,
        v.custo,
        v.valor.toFixed(2),
        v.forma,
        v.parcelas,
        v.cliente.nome,
        v.cliente.apelido,
        v.cliente.cidade,
        v.cliente.telefone,
        clienteId,
        v.modalidade,
      ]
    );
    const saleId = rows[0].id as number;
    for (const p of v.pagamentos) {
      await client.query(
        `INSERT INTO sale_payments (sale_id, due_date, amount, status, received_date) VALUES ($1, $2, $3, $4, $5)`,
        [saleId, p.due_date ?? v.data, p.amount.toFixed(2), p.status, p.received_date]
      );
    }
    await registrar("gravada", saleId, v.avisos.join(" | "));
    await client.query("COMMIT");
    return { situacao: "gravada", saleId, venda: v, repetida: false };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
