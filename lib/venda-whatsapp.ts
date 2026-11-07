import { suggestPayments, type PriceTier } from "./sale-finance";
import { lerValor } from "./receipts";
import { lerData, semAcento } from "./import-vendas";

// Lê o texto "🚀 VENDA REALIZADA" que a Fernanda posta no WhatsApp e transforma numa venda do radar.
// Quem manda o texto é o Roberto (o robô do WhatsApp). Aqui só a leitura, sem banco.
// Regra: o que não der para entender não trava a venda; vira um aviso para o João conferir.

export interface ParcelaLida {
  due_date: string | null;
  amount: number;
  status: "prevista" | "recebida";
  received_date: string | null;
}

export interface VendaLida {
  data: string; // AAAA-MM-DD
  tipoOriginal: string;
  canal: string; // vai para sale_type
  modalidade: PriceTier; // vai para price_tier
  vendedora: string;
  peca: string | null;
  fabricante: string | null;
  fornecedor: string | null;
  garantia: string | null;
  custo: number | null; // null = não informado
  valor: number;
  formaOriginal: string;
  forma: string; // uma das formas de pagamento do radar
  parcelas: number | null;
  pagamentos: ParcelaLida[];
  cliente: { nome: string; apelido: string | null; cidade: string | null; telefone: string | null };
  avisos: string[];
}

export type Leitura = { ok: true; venda: VendaLida } | { ok: false; motivo: string };

export function ehTextoDeVenda(texto: string): boolean {
  return semAcento(texto).includes("venda realizada");
}

/** Pega o valor da linha "Rótulo: valor". "-" e vazio viram null. */
function campo(linhas: string[], ...rotulos: string[]): string | null {
  for (const linha of linhas) {
    const i = linha.indexOf(":");
    if (i < 0) continue;
    const rotulo = semAcento(linha.slice(0, i)).replace(/[^a-z() /]/g, "").trim();
    if (!rotulos.some((r) => rotulo === r || rotulo.startsWith(r + " "))) continue;
    const valor = linha.slice(i + 1).replace(/\s+/g, " ").trim();
    if (!valor || /^-+$/.test(valor)) return null;
    return valor;
  }
  return null;
}

/** "24/09" sem ano: usa o ano da mensagem; se a data cair no futuro, é do ano anterior. */
export function dataDaVenda(texto: string, dataDaMensagem: string): string | null {
  const ano = Number(dataDaMensagem.slice(0, 4));
  const temAno = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(texto);
  const d = lerData(texto, ano);
  if (!d || temAno) return d;
  return d > dataDaMensagem ? lerData(texto, ano - 1) : d;
}

const CANAIS: [string, string][] = [
  ["online", "Online"],
  ["feira", "Feira"],
  ["catalogo", "Catálogo"],
  ["pagina", "Página de vendas"],
  ["fisica", "Física"],
  ["varejo", "Física"],
  ["atacado", "Física"],
];

function titulo(t: string): string {
  return t
    .split(" ")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function lerCanal(tipo: string, avisos: string[]): { canal: string; modalidade: PriceTier } {
  const t = semAcento(tipo);
  const modalidade: PriceTier = t.includes("atacado") ? "atacado" : t.includes("consign") ? "consignado" : "varejo";
  for (const [chave, canal] of CANAIS) if (t.includes(chave)) return { canal, modalidade };
  // Canal novo (ex.: "salão Lá Maison"): guarda o nome como veio, com inicial maiúscula.
  avisos.push(`Canal "${tipo}" não existe no radar; gravado com esse nome.`);
  return { canal: titulo(tipo), modalidade };
}

/** Uma data "dia 30/10" dentro da forma de pagamento. */
function dataNoTexto(t: string, dataDaVenda: string): string | null {
  const m = t.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
  if (!m) return null;
  const ano = Number(dataDaVenda.slice(0, 4));
  const d = lerData(m[1], ano);
  if (!d) return null;
  // Pagamento combinado para "30/01" numa venda de dezembro é do ano seguinte.
  return d < dataDaVenda && !/\/\d{2,4}$/.test(m[1]) ? lerData(m[1], ano + 1) : d;
}

function lerPagamento(
  formaOriginal: string | null,
  valor: number,
  data: string,
  avisos: string[]
): { forma: string; parcelas: number | null; pagamentos: ParcelaLida[] } {
  const recebidaHoje = (forma: string) => ({
    forma,
    parcelas: null,
    pagamentos: [{ due_date: data, amount: valor, status: "recebida" as const, received_date: data }],
  });
  if (!formaOriginal) {
    avisos.push("Forma de pagamento não informada.");
    return { forma: "Não informada", parcelas: null, pagamentos: [] };
  }
  const t = semAcento(formaOriginal);
  const cartao = /cartao|credito/.test(t);
  const dia = /\bdia\b/.test(t) ? dataNoTexto(t, data) : null;

  // "pagou no pix dia 04/11": já recebido, na data informada.
  if (dia && /\bpagou\b|\brecebid/.test(t)) {
    return {
      forma: cartao ? "Crédito" : "Pix a prazo",
      parcelas: cartao ? null : 1,
      pagamentos: [{ due_date: dia, amount: valor, status: "recebida", received_date: dia }],
    };
  }
  // "vai pagar dia 30/11", "vai passar o cartão dia 30/10": a receber nessa data.
  if (dia) {
    if (cartao) avisos.push(`Cartão combinado para ${dia.split("-").reverse().join("/")}; lançado como a receber nessa data.`);
    return {
      forma: cartao ? "Crédito" : "Pix a prazo",
      parcelas: cartao ? null : 1,
      pagamentos: [{ due_date: dia, amount: valor, status: "prevista", received_date: null }],
    };
  }

  const vezes = t.match(/(\d{1,2})\s*x\b/);
  const n = vezes ? Number(vezes[1]) : null;
  if (n && n > 1) {
    const pagamentos = suggestPayments(valor.toFixed(2), n, data).map((p) => ({
      due_date: p.due_date || null,
      amount: Number(p.amount),
      status: "prevista" as const,
      received_date: null,
    }));
    if (!cartao) avisos.push(`"${formaOriginal}": entendido como cartão parcelado em ${n}x; confira.`);
    return { forma: "Crédito parcelado", parcelas: n, pagamentos };
  }
  if (cartao) return recebidaHoje("Crédito");
  if (/debito/.test(t)) return recebidaHoje("Débito");
  if (/dinheiro|especie/.test(t)) return recebidaHoje("Dinheiro à vista");
  if (/link/.test(t)) return recebidaHoje("Link de pagamento");
  if (/pix/.test(t)) return recebidaHoje("Pix à vista");

  avisos.push(`Forma de pagamento "${formaOriginal}" não reconhecida.`);
  return { forma: "Não informada", parcelas: null, pagamentos: [] };
}

function lerTelefone(t: string | null): string | null {
  if (!t) return null;
  const digitos = t.replace(/\D/g, "");
  return digitos.length >= 10 ? digitos : null;
}

export function lerVendaDoWhatsapp(texto: string, dataDaMensagem: string): Leitura {
  if (!ehTextoDeVenda(texto)) return { ok: false, motivo: "Não é uma mensagem de VENDA REALIZADA." };
  const linhas = texto.split(/\r?\n/);
  const avisos: string[] = [];

  const dataTexto = campo(linhas, "data da venda", "data");
  const data = dataTexto ? dataDaVenda(dataTexto, dataDaMensagem) : null;
  if (!data) return { ok: false, motivo: "Data da venda ausente ou inválida." };

  const valorTexto = campo(linhas, "valor da venda", "valor");
  const valor = valorTexto ? lerValor(valorTexto.replace(/r\$/i, "")) : null;
  if (valor === null || valor <= 0) return { ok: false, motivo: "Valor da venda ausente ou inválido." };

  const nome = campo(linhas, "nome completo", "nome", "cliente");
  if (!nome) return { ok: false, motivo: "Nome do cliente ausente." };

  const tipoOriginal = campo(linhas, "tipo de venda") ?? "";
  const { canal, modalidade } = tipoOriginal
    ? lerCanal(tipoOriginal, avisos)
    : (avisos.push("Tipo de venda não informado; lançado como Física/varejo."), { canal: "Física", modalidade: "varejo" as PriceTier });

  const custoTexto = campo(linhas, "custo da peca", "custo");
  let custo: number | null = null;
  if (custoTexto) {
    custo = lerValor(custoTexto.replace(/r\$/i, ""));
    if (custo === null) avisos.push(`Custo "${custoTexto}" não é um valor; ficou em branco.`);
  } else {
    avisos.push("Custo não informado.");
  }
  if (custo !== null && custo > valor) avisos.push("Custo maior que o valor da venda (prejuízo).");

  const formaOriginal = campo(linhas, "forma de pagamento", "pagamento");
  const pag = lerPagamento(formaOriginal, valor, data, avisos);

  return {
    ok: true,
    venda: {
      data,
      tipoOriginal,
      canal,
      modalidade,
      vendedora: campo(linhas, "vendedora", "vendedor") ?? "Fernanda",
      peca: campo(linhas, "tipo da peca", "peca", "produto"),
      fabricante: campo(linhas, "fabricante"),
      fornecedor: campo(linhas, "fornecedor"),
      garantia: campo(linhas, "garantia"),
      custo,
      valor,
      formaOriginal: formaOriginal ?? "",
      forma: pag.forma,
      parcelas: pag.parcelas,
      // Atacado não tem parcelas no radar: o dinheiro vem como comissão do fabricante.
      pagamentos: modalidade === "atacado" ? [] : pag.pagamentos,
      cliente: {
        nome: nome.replace(/\s*\(\s*/g, " (").replace(/\s*\)/g, ")").trim(),
        apelido: campo(linhas, "apelido"),
        cidade: campo(linhas, "praca (cidade/bairro)", "praca", "cidade"),
        telefone: lerTelefone(campo(linhas, "telefone/whatsapp", "telefone", "whatsapp")),
      },
      avisos,
    },
  };
}
