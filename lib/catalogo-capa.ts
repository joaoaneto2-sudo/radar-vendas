// Posição e tamanho dos elementos da capa (marca, nome do catálogo e mensagem). O João arrasta cada um na pré-visualização.
// As posições são o CENTRO do elemento, em % da capa (0 a 100). Sem posição escolhida, vale a de sempre.

export type Ponto = { x: number; y: number };
export type ElementoDaCapa = "marca" | "nome" | "mensagem";

export type CapaLayout = {
  marca?: Ponto;
  nome?: Ponto;
  mensagem?: Ponto;
  marcaTamanho?: number; // largura da marca, em % da largura da capa
  nomeTamanho?: number; // tamanho das letras do nome, em % da largura da capa
};

export const MARCA_TAMANHO = { min: 15, max: 70, padrao: 34 };
export const NOME_TAMANHO = { min: 0.7, max: 3, padrao: 1.05 };

/** Onde a marca e o nome ficam sem ninguém mexer: no alto, centralizados, ou na metade esquerda nas capas com as pessoas à direita. */
export function posicaoPadrao(elemento: "marca" | "nome", textoAEsquerda: boolean): Ponto {
  if (textoAEsquerda) return elemento === "marca" ? { x: 24.6, y: 47.9 } : { x: 24.6, y: 57.4 };
  return elemento === "marca" ? { x: 50, y: 19.8 } : { x: 50, y: 29.8 };
}

export const marcaTamanhoPadrao = (textoAEsquerda: boolean): number => (textoAEsquerda ? 33 : MARCA_TAMANHO.padrao);

const limitar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const arredondar = (n: number) => Math.round(n * 10) / 10;

export function limitarPonto(p: Ponto): Ponto {
  return { x: arredondar(limitar(p.x, 0, 100)), y: arredondar(limitar(p.y, 0, 100)) };
}

const pontoValido = (p: unknown): Ponto | undefined => {
  if (!p || typeof p !== "object") return undefined;
  const { x, y } = p as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return limitarPonto({ x, y });
};

const numeroValido = (n: unknown, min: number, max: number): number | undefined =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(limitar(n, min, max) * 100) / 100 : undefined;

/** Layout corrigido: só o que existe e está dentro dos limites (dado vindo do navegador não é confiável). */
export function capaLayoutValido(bruto: unknown): CapaLayout {
  if (!bruto || typeof bruto !== "object") return {};
  const b = bruto as Record<string, unknown>;
  const layout: CapaLayout = {};
  const marca = pontoValido(b.marca);
  const nome = pontoValido(b.nome);
  const mensagem = pontoValido(b.mensagem);
  const marcaTamanho = numeroValido(b.marcaTamanho, MARCA_TAMANHO.min, MARCA_TAMANHO.max);
  const nomeTamanho = numeroValido(b.nomeTamanho, NOME_TAMANHO.min, NOME_TAMANHO.max);
  if (marca) layout.marca = marca;
  if (nome) layout.nome = nome;
  if (mensagem) layout.mensagem = mensagem;
  if (marcaTamanho !== undefined) layout.marcaTamanho = marcaTamanho;
  if (nomeTamanho !== undefined) layout.nomeTamanho = nomeTamanho;
  return layout;
}

/** Layout sem o que foi desfeito. `elementos` vazio = volta tudo ao lugar de sempre. */
export function semPosicao(layout: CapaLayout, elementos?: ElementoDaCapa[]): CapaLayout {
  const novo = { ...layout };
  const alvo = elementos ?? (["marca", "nome", "mensagem"] as ElementoDaCapa[]);
  for (const e of alvo) delete novo[e];
  if (!elementos) {
    delete novo.marcaTamanho;
    delete novo.nomeTamanho;
  }
  return novo;
}
