import { describe, expect, it } from "vitest";
import { dataDaVenda, ehTextoDeVenda, lerVendaDoWhatsapp } from "../../lib/venda-whatsapp";
import { buildWhatsAppMessage } from "../../lib/format";

// Textos no formato que a Fernanda posta no grupo (dados fictícios).
function venda(campos: Record<string, string>): string {
  const c = {
    data: "24/09",
    tipo: "Física",
    peca: "7 peças",
    fornecedor: "Bia Belluti",
    custo: "73,00",
    valor: "144,00",
    forma: "Pix",
    nome: "Maria Teste",
    praca: "-",
    telefone: "-",
    ...campos,
  };
  return [
    "🚀 VENDA REALIZADA",
    "",
    `📆 Data da venda: ${c.data}`,
    `🛍️ Tipo de venda: ${c.tipo}`,
    "⚜️ Vendedora: Fernanda",
    "",
    "💎 Descrição do produto",
    `Tipo da peça: ${c.peca}  `,
    `Fornecedor: ${c.fornecedor} `,
    "Garantia: 1 ano ",
    "",
    `💰 Custo da peça: ${c.custo} `,
    `💲 Valor da venda: ${c.valor}`,
    `💳 Forma de pagamento: ${c.forma} `,
    "",
    "📓 Dados do cliente",
    `Nome completo: ${c.nome} `,
    "Apelido: -",
    `Praça (cidade/bairro): ${c.praca}`,
    `Telefone/WhatsApp: ${c.telefone}`,
    "Aniversário: -",
  ].join("\n");
}

const HOJE = "2026-11-07";

function ler(campos: Record<string, string>) {
  const r = lerVendaDoWhatsapp(venda(campos), HOJE);
  if (!r.ok) throw new Error(r.motivo);
  return r.venda;
}

describe("ler a venda postada no WhatsApp", () => {
  it("reconhece só mensagens de venda", () => {
    expect(ehTextoDeVenda(venda({}))).toBe(true);
    expect(ehTextoDeVenda("Bom dia, tudo bem?")).toBe(false);
    expect(lerVendaDoWhatsapp("Bom dia", HOJE)).toEqual({ ok: false, motivo: "Não é uma mensagem de VENDA REALIZADA." });
  });

  it("venda física simples no Pix: tudo preenchido e já recebida no dia", () => {
    const v = ler({});
    expect(v).toMatchObject({
      data: "2026-09-24",
      canal: "Física",
      modalidade: "varejo",
      vendedora: "Fernanda",
      peca: "7 peças",
      fornecedor: "Bia Belluti",
      garantia: "1 ano",
      custo: 73,
      valor: 144,
      forma: "Pix à vista",
      cliente: { nome: "Maria Teste", apelido: null, cidade: null, telefone: null },
    });
    expect(v.pagamentos).toEqual([{ due_date: "2026-09-24", amount: 144, status: "recebida", received_date: "2026-09-24" }]);
    expect(v.avisos).toEqual([]);
  });

  it("data sem ano no futuro é do ano passado; com ano, respeita", () => {
    expect(dataDaVenda("24/09", "2026-11-07")).toBe("2026-09-24");
    expect(dataDaVenda("20/12", "2026-01-05")).toBe("2025-12-20");
    expect(dataDaVenda("19/09/2026", "2026-11-07")).toBe("2026-09-19");
  });

  it("valor com milhar e custo escrito 'ATACADO' vira custo em branco com aviso", () => {
    const v = ler({ valor: "2.000,00", custo: "ATACADO" });
    expect(v.valor).toBe(2000);
    expect(v.custo).toBeNull();
    expect(v.avisos.join(" ")).toContain("Custo");
  });

  it("cartão em 2 X vira crédito parcelado com 2 parcelas mensais a receber", () => {
    const v = ler({ forma: "cartão em 2 X", valor: "513,00" });
    expect(v.forma).toBe("Crédito parcelado");
    expect(v.parcelas).toBe(2);
    expect(v.pagamentos.map((p) => [p.due_date, p.amount, p.status])).toEqual([
      ["2026-10-24", 256.5, "prevista"],
      ["2026-11-24", 256.5, "prevista"],
    ]);
  });

  it("'vai pagar dia 30/11' vira Pix a prazo com uma parcela prevista", () => {
    const v = ler({ data: "06/11", forma: "vai pagar dia 30/11", valor: "70,00" });
    expect(v.forma).toBe("Pix a prazo");
    expect(v.pagamentos).toEqual([{ due_date: "2026-11-30", amount: 70, status: "prevista", received_date: null }]);
  });

  it("'pagou no pix dia 04/11' fica recebido na data em que pagou", () => {
    const v = ler({ data: "29/10", forma: "pagou no pix dia 04/11", valor: "600,00", custo: "623,00" });
    expect(v.pagamentos).toEqual([{ due_date: "2026-11-04", amount: 600, status: "recebida", received_date: "2026-11-04" }]);
    expect(v.avisos).toContain("Custo maior que o valor da venda (prejuízo).");
  });

  it("atacado: modalidade atacado e sem parcelas (vem como comissão)", () => {
    const v = ler({ tipo: "Atacado   ", forma: "cartão 4X da fábrica", valor: "640,00" });
    expect(v.modalidade).toBe("atacado");
    expect(v.canal).toBe("Física");
    expect(v.pagamentos).toEqual([]);
  });

  it("canal novo (salão) é gravado com o nome e gera aviso", () => {
    const v = ler({ tipo: "salão Lá Maison ", forma: "cartão de crédito à vista", telefone: "7199341-3538" });
    expect(v.canal).toBe("Salão Lá Maison");
    expect(v.modalidade).toBe("varejo");
    expect(v.forma).toBe("Crédito");
    expect(v.cliente.telefone).toBe("71993413538");
    expect(v.avisos.join(" ")).toContain("Canal");
  });

  it("telefone incompleto fica em branco; parênteses do nome são arrumados", () => {
    const v = ler({ telefone: "719", nome: "Cris ( Kika)  " });
    expect(v.cliente.telefone).toBeNull();
    expect(v.cliente.nome).toBe("Cris (Kika)");
  });

  it("sem valor ou sem data, recusa com o motivo", () => {
    expect(lerVendaDoWhatsapp(venda({ valor: "" }), HOJE)).toMatchObject({ ok: false });
    expect(lerVendaDoWhatsapp(venda({ data: "ontem" }), HOJE)).toMatchObject({ ok: false });
  });

  it("lê de volta o próprio texto que o radar gera para o grupo", () => {
    const texto = buildWhatsAppMessage({
      sale_date: "2026-09-19",
      sale_type: "Física",
      seller: "Fernanda",
      product_type: "Anel Solitário",
      manufacturer: "Bia Belutti",
      supplier: "Fornecedor X",
      warranty: "Vitalícia",
      cost: 60,
      sale_value: 200,
      payment_method: "Pix à vista",
      client_name: "Maria da Silva",
      client_nickname: "Mari",
      client_city: "Centro",
      client_phone: "11999990000",
    });
    const r = lerVendaDoWhatsapp(texto, HOJE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.venda).toMatchObject({
      data: "2026-09-19",
      valor: 200,
      custo: 60,
      forma: "Pix à vista",
      peca: "Anel Solitário",
      cliente: { nome: "Maria da Silva", apelido: "Mari", cidade: "Centro", telefone: "11999990000" },
    });
  });
});
