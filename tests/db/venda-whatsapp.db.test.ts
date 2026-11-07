import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../lib/migrations";
import { gravarVendaDoWhatsapp } from "../../lib/venda-whatsapp-db";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();

function texto(valor: string, forma: string, nome = "Maria Teste", tipo = "Física") {
  return [
    "🚀 VENDA REALIZADA",
    "📆 Data da venda: 24/09",
    `🛍️ Tipo de venda: ${tipo}`,
    "⚜️ Vendedora: Fernanda",
    "Tipo da peça: 2 brincos",
    "Fornecedor: Fornecedor X",
    "💰 Custo da peça: 50,00",
    `💲 Valor da venda: ${valor}`,
    `💳 Forma de pagamento: ${forma}`,
    `Nome completo: ${nome}`,
    "Telefone/WhatsApp: 81 99999-0000",
  ].join("\n");
}
const QUANDO = "2026-11-07T17:00:00Z";

describe.skipIf(!disponivel)("vendas que chegam pelo WhatsApp", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;
  beforeAll(async () => {
    const banco = await criarBancoDescartavel();
    pool = banco.pool;
    apagar = banco.apagar;
    await runMigrations(pool);
  });
  afterAll(async () => {
    await apagar?.();
  });
  beforeEach(async () => {
    await pool.query(`DELETE FROM vendas_whatsapp`);
    await pool.query(`DELETE FROM sales`);
    await pool.query(`DELETE FROM clients`);
  });

  it("grava a venda, cria o cliente e as parcelas", async () => {
    const r = await gravarVendaDoWhatsapp(pool, { messageId: "m1", texto: texto("300,00", "cartão em 3X"), enviadaEm: QUANDO });
    expect(r.situacao).toBe("gravada");
    const venda = (await pool.query(`SELECT * FROM sales`)).rows[0];
    expect(venda).toMatchObject({ sale_value: "300.00", cost: "50.00", payment_method: "Crédito parcelado", price_tier: "varejo", client_name: "Maria Teste" });
    expect(venda.sale_date.toISOString().slice(0, 10)).toBe("2026-09-24");
    const parcelas = (await pool.query(`SELECT amount, status FROM sale_payments WHERE sale_id = $1 ORDER BY due_date`, [venda.id])).rows;
    expect(parcelas).toEqual([
      { amount: "100.00", status: "prevista" },
      { amount: "100.00", status: "prevista" },
      { amount: "100.00", status: "prevista" },
    ]);
    const cliente = (await pool.query(`SELECT full_name, phone FROM clients`)).rows;
    expect(cliente).toEqual([{ full_name: "Maria Teste", phone: "81999990000" }]);
  });

  it("a mesma mensagem duas vezes não duplica; a mesma venda vinda de outra mensagem também não", async () => {
    await gravarVendaDoWhatsapp(pool, { messageId: "m1", texto: texto("209,00", "Pix"), enviadaEm: QUANDO });
    const outraVez = await gravarVendaDoWhatsapp(pool, { messageId: "m1", texto: texto("209,00", "Pix"), enviadaEm: QUANDO });
    expect(outraVez).toMatchObject({ situacao: "ja_existe", repetida: true });
    const encaminhada = await gravarVendaDoWhatsapp(pool, { messageId: "m2", texto: texto("209,00", "Pix"), enviadaEm: QUANDO });
    expect(encaminhada).toMatchObject({ situacao: "ja_existe", repetida: false });
    expect((await pool.query(`SELECT count(*)::int AS n FROM sales`)).rows[0].n).toBe(1);
  });

  it("usa o cliente já cadastrado com o mesmo nome", async () => {
    await pool.query(`INSERT INTO clients (full_name) VALUES ('Maria Teste')`);
    await gravarVendaDoWhatsapp(pool, { messageId: "m1", texto: texto("100,00", "Pix", "MARIA TESTE"), enviadaEm: QUANDO });
    expect((await pool.query(`SELECT count(*)::int AS n FROM clients`)).rows[0].n).toBe(1);
  });

  it("atacado entra sem parcelas; mensagem que não é venda fica registrada como recusada", async () => {
    await gravarVendaDoWhatsapp(pool, { messageId: "m1", texto: texto("640,00", "cartão 4X da fábrica", "Ana", "Atacado"), enviadaEm: QUANDO });
    const v = (await pool.query(`SELECT id, price_tier FROM sales`)).rows[0];
    expect(v.price_tier).toBe("atacado");
    expect((await pool.query(`SELECT count(*)::int AS n FROM sale_payments WHERE sale_id = $1`, [v.id])).rows[0].n).toBe(0);
    const r = await gravarVendaDoWhatsapp(pool, { messageId: "m9", texto: "🚀 VENDA REALIZADA\nsem dados", enviadaEm: QUANDO });
    expect(r.situacao).toBe("recusada");
  });
});
