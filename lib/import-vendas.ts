import { toCents, type Cents } from "./finance/money";
import { readMoneyOrNull } from "./store-rules";

// Importar vendas e aportes colados da planilha (do Excel). Aqui só a leitura do texto, sem banco.
// Colunas esperadas, separadas por tabulação (é assim que o Excel copia): DATA, RECEITAS, TIPO, VALOR, FORMA DE PAG.
// Cada linha vira uma venda (varejo, Pix à vista, sem peça e sem custo, para completar depois), um aporte de sócio,
// ou é ignorada com o motivo escrito.

export const FORMA_PIX_A_VISTA = "Pix à vista";

export type Socio = "joao" | "fernanda";

export interface ItemVenda {
  tipo: "venda";
  linha: number;
  data: string; // AAAA-MM-DD
  cliente: string; // nome já limpo
  criarCliente: boolean; // false para linhas gerais, como "Vendas de joias e semi-joias"
  valorCents: Cents;
  formaDePagamento: string;
}

export interface ItemAporte {
  tipo: "aporte";
  linha: number;
  data: string;
  socio: Socio;
  valorCents: Cents;
  descricao: string;
}

export interface ItemIgnorado {
  tipo: "ignorada";
  linha: number;
  texto: string;
  motivo: string;
}

export type ItemDaPlanilha = ItemVenda | ItemAporte | ItemIgnorado;

export const semAcento = (t: string): string =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** "ter 01/09" ou "01/09/2026" vira AAAA-MM-DD (sem ano na data, usa o ano informado). null se não for data. */
export function lerData(texto: string, ano: number): string | null {
  const m = texto.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let a = ano;
  if (m[3]) a = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  const d = new Date(Date.UTC(a, mes - 1, dia));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${a}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** "R$ 1.276,00" vira 127600 (centavos). null se não for um valor. */
export function lerValor(texto: string): Cents | null {
  const limpo = texto.replace(/R\$/gi, "").trim();
  const v = readMoneyOrNull(limpo);
  if (v === null || v === "invalido") return null;
  return toCents(v);
}

const PALAVRAS_PEQUENAS = new Set(["de", "da", "do", "das", "dos", "e"]);
const SIGLAS = new Set(["adv"]);

function titulo(texto: string): string {
  return texto
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p, i) => {
      if (SIGLAS.has(p)) return p.toUpperCase();
      if (i > 0 && PALAVRAS_PEQUENAS.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

/**
 * "VENDA KIKA" vira "Kika" e ganha cadastro de cliente. Linhas gerais como "VENDAS DE JOIAS E SEMI-JOIAS"
 * (várias vendas juntas) ficam com esse texto e NÃO criam cliente.
 */
export function limparNomeDoCliente(bruto: string): { nome: string; criarCliente: boolean } {
  const texto = bruto.trim().replace(/\s+/g, " ");
  if (/^vendas?\s+de\s+/i.test(texto)) return { nome: titulo(texto), criarCliente: false };
  return { nome: titulo(texto.replace(/^venda\s+/i, "")), criarCliente: true };
}

function ignorada(linha: number, texto: string, motivo: string): ItemIgnorado {
  return { tipo: "ignorada", linha, texto, motivo };
}

/** Lê o texto colado. `ano` vale para datas sem ano (por exemplo "ter 01/09"). */
export function lerPlanilha(texto: string, ano: number): ItemDaPlanilha[] {
  const itens: ItemDaPlanilha[] = [];
  const linhas = texto.split(/\r?\n/);

  linhas.forEach((bruta, i) => {
    if (bruta.trim() === "") return;
    const numero = i + 1;
    const colunas = (bruta.includes("\t") ? bruta.split("\t") : bruta.split(";")).map((c) => c.trim());

    // Cabeçalho da planilha.
    if (semAcento(colunas[0] ?? "") === "data" && colunas.length >= 4) return;
    if (colunas.length < 4) {
      itens.push(ignorada(numero, bruta.trim(), "Linha incompleta: faltam colunas (data, descrição, tipo, valor e forma de pagamento)."));
      return;
    }

    const [dataTxt, descricao, tipoTxt, valorTxt, formaTxt = ""] = colunas;
    const data = lerData(dataTxt, ano);
    if (!data) return void itens.push(ignorada(numero, bruta.trim(), `Data não reconhecida: "${dataTxt}".`));
    const valorCents = lerValor(valorTxt);
    if (valorCents === null || valorCents <= 0) return void itens.push(ignorada(numero, bruta.trim(), `Valor não reconhecido: "${valorTxt}".`));
    if (descricao === "") return void itens.push(ignorada(numero, bruta.trim(), "Falta o nome (coluna RECEITAS)."));

    const tipo = semAcento(tipoTxt);
    if (tipo.startsWith("aporte")) {
      const d = semAcento(descricao);
      const socio: Socio | null = d.includes("joao") ? "joao" : d.includes("fernanda") ? "fernanda" : null;
      if (!socio) return void itens.push(ignorada(numero, bruta.trim(), "Aporte sem o nome do sócio (João ou Fernanda) na descrição."));
      return void itens.push({ tipo: "aporte", linha: numero, data, socio, valorCents, descricao });
    }

    // "VARELO" é erro de digitação comum de "VAREJO": aceita tudo que começa com "var".
    if (!tipo.startsWith("var")) {
      return void itens.push(ignorada(numero, bruta.trim(), `Tipo "${tipoTxt}" ainda não é importado por aqui. Lance essa venda na tela Nova venda.`));
    }

    const forma = semAcento(formaTxt).replace(/[^a-z ]/g, " ");
    if (!(forma.includes("pix") && forma.includes("vista"))) {
      return void itens.push(ignorada(numero, bruta.trim(), `Forma de pagamento "${formaTxt}" ainda não é importada por aqui (só Pix à vista). Lance na tela Nova venda.`));
    }

    const { nome, criarCliente } = limparNomeDoCliente(descricao);
    itens.push({ tipo: "venda", linha: numero, data, cliente: nome, criarCliente, valorCents, formaDePagamento: FORMA_PIX_A_VISTA });
  });

  return itens;
}
