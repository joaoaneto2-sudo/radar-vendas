// Mensagem sobre a capa do catálogo (slogan, pergunta, oferta...): de 1 a 4 linhas, cada uma com a sua fonte, tamanho,
// cor e estilo (texto solto ou dentro de uma faixa dourada, com ou sem traço embaixo). Dentro de uma linha, o que
// estiver entre *asteriscos* sai maior (ex.: "Até *25% OFF*"). Fica fora da área da marca e do nome do catálogo.

export type FonteDaMensagem = {
  id: string;
  nome: string;
  css: string; // font-family
  google: string; // trecho da URL do Google Fonts
  pesoNormal: number;
  pesoGrande: number;
};

export const FONTES_DA_MENSAGEM: FonteDaMensagem[] = [
  { id: "cormorant", nome: "Clássica elegante", css: '"Cormorant Garamond", Georgia, serif', google: "Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600", pesoNormal: 500, pesoGrande: 600 },
  { id: "playfair", nome: "Clássica de revista", css: '"Playfair Display", Georgia, serif', google: "Playfair+Display:ital,wght@0,400;0,700;1,400", pesoNormal: 400, pesoGrande: 700 },
  { id: "bodoni", nome: "Moda", css: '"Bodoni Moda", Georgia, serif', google: "Bodoni+Moda:ital,wght@0,400;0,700;1,400", pesoNormal: 400, pesoGrande: 700 },
  { id: "montserrat", nome: "Moderna", css: '"Montserrat", "Segoe UI", sans-serif', google: "Montserrat:wght@300;400;600;800", pesoNormal: 600, pesoGrande: 800 },
  { id: "josefin", nome: "Moderna fina", css: '"Josefin Sans", "Segoe UI", sans-serif', google: "Josefin+Sans:wght@300;400;600", pesoNormal: 400, pesoGrande: 600 },
  { id: "anton", nome: "Condensada forte", css: '"Anton", Impact, sans-serif', google: "Anton", pesoNormal: 400, pesoGrande: 400 },
  { id: "abril", nome: "Forte", css: '"Abril Fatface", Georgia, serif', google: "Abril+Fatface", pesoNormal: 400, pesoGrande: 400 },
  { id: "kaushan", nome: "Pincelada", css: '"Kaushan Script", cursive', google: "Kaushan+Script", pesoNormal: 400, pesoGrande: 400 },
  { id: "yellowtail", nome: "Cursiva marcada", css: '"Yellowtail", cursive', google: "Yellowtail", pesoNormal: 400, pesoGrande: 400 },
  { id: "great-vibes", nome: "Cursiva elegante", css: '"Great Vibes", cursive', google: "Great+Vibes", pesoNormal: 400, pesoGrande: 400 },
  { id: "dancing", nome: "Cursiva leve", css: '"Dancing Script", cursive', google: "Dancing+Script:wght@400;700", pesoNormal: 400, pesoGrande: 700 },
];

export const URL_DAS_FONTES = `https://fonts.googleapis.com/css2?${FONTES_DA_MENSAGEM.map((f) => `family=${f.google}`).join("&")}&display=swap`;

export type TamanhoDaMensagem = "p" | "m" | "g" | "gg" | "xg";
export type CorDoBloco = "branco" | "dourado" | "escuro" | "preto";
export type EstiloDoBloco = "texto" | "faixa";
export type LinhaDaMensagem = "topo" | "meio" | "base";
export type ColunaDaMensagem = "esq" | "centro" | "dir";

export type BlocoDaMensagem = {
  texto: string; // o que estiver entre *asteriscos* sai maior
  fonte: string;
  tamanho: TamanhoDaMensagem;
  cor: CorDoBloco;
  estilo: EstiloDoBloco; // "faixa" = dentro de uma faixa dourada
  sublinhado: boolean; // traço dourado embaixo
};

export type MensagemDaCapa = {
  blocos: BlocoDaMensagem[];
  linha: LinhaDaMensagem;
  coluna: ColunaDaMensagem;
  fundo: boolean; // fundo escuro suave atrás de tudo, para ler sobre qualquer foto
};

export const MAXIMO_DE_BLOCOS = 4;
export const TEXTO_MAXIMO_DO_BLOCO = 60;

/** Tamanho do texto de cada linha (em % da largura da página); o trecho entre asteriscos é 1,9 vez maior. */
export const TAMANHO_EM_CQW: Record<TamanhoDaMensagem, number> = { p: 1.9, m: 2.6, g: 3.8, gg: 6.4, xg: 9.5 };
export const AUMENTO_DO_TRECHO_GRANDE = 1.9;

export const COR_DO_BLOCO: Record<CorDoBloco, string> = { branco: "#ffffff", dourado: "#e9c46a", escuro: "#3a2722", preto: "#150d0b" };

export const fonteDaMensagem = (id: string): FonteDaMensagem => FONTES_DA_MENSAGEM.find((f) => f.id === id) ?? FONTES_DA_MENSAGEM[0];

export const BLOCO_NOVO: BlocoDaMensagem = { texto: "", fonte: "montserrat", tamanho: "m", cor: "branco", estilo: "texto", sublinhado: false };

/** Modelos prontos: o João escolhe um e troca os textos. */
export const MODELOS_DE_MENSAGEM: { id: string; nome: string; mensagem: MensagemDaCapa }[] = [
  {
    id: "oferta",
    nome: "Oferta (Psiu... até 25% OFF)",
    mensagem: {
      linha: "meio",
      coluna: "esq",
      fundo: false,
      blocos: [
        { texto: "Psiu...", fonte: "kaushan", tamanho: "xg", cor: "dourado", estilo: "texto", sublinhado: true },
        { texto: "Até *25% OFF*", fonte: "montserrat", tamanho: "g", cor: "preto", estilo: "faixa", sublinhado: false },
        { texto: "só pra você!", fonte: "kaushan", tamanho: "gg", cor: "branco", estilo: "texto", sublinhado: true },
      ],
    },
  },
  {
    id: "slogan",
    nome: "Slogan (primeira palavra grande)",
    mensagem: {
      linha: "base",
      coluna: "centro",
      fundo: true,
      blocos: [
        { texto: "Brilhe", fonte: "playfair", tamanho: "gg", cor: "branco", estilo: "texto", sublinhado: false },
        { texto: "com peças escolhidas para você", fonte: "montserrat", tamanho: "p", cor: "branco", estilo: "texto", sublinhado: false },
      ],
    },
  },
  {
    id: "pergunta",
    nome: "Pergunta",
    mensagem: {
      linha: "base",
      coluna: "centro",
      fundo: true,
      blocos: [
        { texto: "Já escolheu o seu presente?", fonte: "great-vibes", tamanho: "gg", cor: "branco", estilo: "texto", sublinhado: false },
        { texto: "Veja as peças deste catálogo", fonte: "josefin", tamanho: "m", cor: "dourado", estilo: "texto", sublinhado: false },
      ],
    },
  },
  {
    id: "frase",
    nome: "Uma frase só",
    mensagem: {
      linha: "base",
      coluna: "centro",
      fundo: true,
      blocos: [{ texto: "Peças escolhidas para o fim de semana", fonte: "cormorant", tamanho: "g", cor: "branco", estilo: "texto", sublinhado: false }],
    },
  },
];

export const MENSAGEM_PADRAO: MensagemDaCapa = { blocos: [{ ...BLOCO_NOVO }], linha: "base", coluna: "centro", fundo: true };

/** Pedaços de uma linha: o que está entre *asteriscos* vem marcado como "grande". Asterisco sozinho some. */
export function partirBloco(texto: string): { texto: string; grande: boolean }[] {
  const partes: { texto: string; grande: boolean }[] = [];
  const re = /\*([^*]+)\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push({ texto: texto.slice(ultimo, m.index), grande: false });
    partes.push({ texto: m[1], grande: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: texto.slice(ultimo), grande: false });
  return partes.map((p) => ({ ...p, texto: p.texto.replace(/\*/g, "") })).filter((p) => p.texto !== "");
}

const escolher = <T extends string>(valor: unknown, validos: readonly T[], padrao: T): T => (validos.includes(valor as T) ? (valor as T) : padrao);

/** Mensagem pronta para a capa: sem nenhuma linha com texto vira nulo; o resto é corrigido para valores que existem (dado vindo do navegador não é confiável). */
export function mensagemValida(bruta: Partial<MensagemDaCapa> | null | undefined): MensagemDaCapa | null {
  if (!bruta || !Array.isArray(bruta.blocos)) return null;
  const fontes = FONTES_DA_MENSAGEM.map((f) => f.id);
  const blocos: BlocoDaMensagem[] = [];
  for (const b of bruta.blocos.slice(0, MAXIMO_DE_BLOCOS)) {
    if (!b || typeof b.texto !== "string") continue;
    const texto = b.texto.replace(/\s+/g, " ").trim().slice(0, TEXTO_MAXIMO_DO_BLOCO);
    if (!texto.replace(/\*/g, "").trim()) continue;
    blocos.push({
      texto,
      fonte: escolher(b.fonte, fontes, BLOCO_NOVO.fonte),
      tamanho: escolher(b.tamanho, ["p", "m", "g", "gg", "xg"] as const, BLOCO_NOVO.tamanho),
      cor: escolher(b.cor, ["branco", "dourado", "escuro", "preto"] as const, BLOCO_NOVO.cor),
      estilo: escolher(b.estilo, ["texto", "faixa"] as const, BLOCO_NOVO.estilo),
      sublinhado: b.sublinhado === true,
    });
  }
  if (blocos.length === 0) return null;
  return {
    blocos,
    linha: escolher(bruta.linha, ["topo", "meio", "base"] as const, MENSAGEM_PADRAO.linha),
    coluna: escolher(bruta.coluna, ["esq", "centro", "dir"] as const, MENSAGEM_PADRAO.coluna),
    fundo: bruta.fundo !== false,
  };
}
