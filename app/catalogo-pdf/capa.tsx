"use client";

// Capa do catálogo: usada na página de impressão e na pré-visualização da tela "Criar catálogo".
// Marca, nome do catálogo e mensagem são camadas soltas sobre a imagem: sem posição escolhida ficam onde sempre ficaram
// (marca e nome no alto ou na metade esquerda; mensagem numa das 9 posições, fora da área da marca). Na pré-visualização
// (editavel) o João arrasta cada um para onde quiser.

import { useRef, type CSSProperties, type PointerEvent } from "react";
import { CAPAS, CAPAS_COM_TEXTO_A_ESQUERDA } from "@/lib/catalogo-layout";
import { larguraDaImagem, urlDaImagem, type QualidadeDoPdf } from "@/lib/catalogo-imagem";
import { NOME_TAMANHO, limitarPonto, marcaTamanhoPadrao, posicaoPadrao, type CapaLayout, type ElementoDaCapa, type Ponto } from "@/lib/catalogo-capa";
import {
  AUMENTO_DO_TRECHO_GRANDE,
  COR_DO_BLOCO,
  TAMANHO_EM_CQW,
  fonteDaMensagem,
  partirBloco,
  type BlocoDaMensagem,
  type MensagemDaCapa,
} from "@/lib/catalogo-mensagem";
import s from "./catalogo-pdf.module.css";

const LOGO_CAPA = "/marca/logo-capa.png"; // branco, já com a sombra suave (sem filtro de CSS, que pesa no PDF)
const LOJA = "Fernanda Brilhante";

const JUSTIFICAR = { topo: "flex-start", meio: "center", base: "flex-end" } as const;
const ALINHAR = { esq: "flex-start", centro: "center", dir: "flex-end" } as const;
const TEXTO = { esq: "left", centro: "center", dir: "right" } as const;

function BlocoNaCapa({ bloco }: { bloco: BlocoDaMensagem }) {
  const fonte = fonteDaMensagem(bloco.fonte);
  const partes = partirBloco(bloco.texto);
  if (partes.length === 0) return null;
  const dourado = bloco.cor === "dourado" && bloco.estilo === "texto";
  const estilo = {
    fontFamily: fonte.css,
    fontWeight: fonte.pesoNormal,
    fontSize: `${TAMANHO_EM_CQW[bloco.tamanho]}cqw`,
    ...(dourado ? {} : { color: COR_DO_BLOCO[bloco.cor] }),
  } as CSSProperties;
  const classe = [s.mensagemTexto, bloco.estilo === "faixa" ? s.mensagemFaixa : "", dourado ? s.mensagemDourada : ""].join(" ");
  return (
    <div className={s.mensagemBloco}>
      <span className={classe} style={estilo}>
        {partes.map((p, i) =>
          p.grande ? (
            <span key={i} className={s.mensagemGrande} style={{ fontSize: `${AUMENTO_DO_TRECHO_GRANDE}em`, fontWeight: fonte.pesoGrande }}>
              {p.texto}
            </span>
          ) : (
            <span key={i}>{p.texto}</span>
          )
        )}
      </span>
      {bloco.sublinhado && <i className={s.mensagemTraco} aria-hidden="true" />}
    </div>
  );
}

type Arraste = (chave: ElementoDaCapa) => {
  className: string;
  onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
  onPointerMove?: (e: PointerEvent<HTMLElement>) => void;
  onPointerUp?: (e: PointerEvent<HTMLElement>) => void;
  onPointerCancel?: (e: PointerEvent<HTMLElement>) => void;
  title?: string;
};

function CaixaDaMensagem({ mensagem, arraste }: { mensagem: MensagemDaCapa; arraste: ReturnType<Arraste> }) {
  const { className, ...eventos } = arraste;
  return (
    <div
      {...eventos}
      className={`${s.mensagemCaixa} ${mensagem.fundo ? s.mensagemComFundo : ""} ${className}`}
      style={{ alignItems: ALINHAR[mensagem.coluna], textAlign: TEXTO[mensagem.coluna] }}
    >
      {mensagem.blocos.map((b, i) => (
        <BlocoNaCapa key={i} bloco={b} />
      ))}
    </div>
  );
}

export function CapaDoCatalogo({
  capa,
  nomeCatalogo,
  mensagem,
  layout,
  editavel = false,
  onMover,
  qualidade,
}: {
  capa: string;
  nomeCatalogo: string;
  mensagem?: MensagemDaCapa | null;
  layout?: CapaLayout | null;
  editavel?: boolean;
  onMover?: (elemento: ElementoDaCapa, ponto: Ponto) => void;
  qualidade?: QualidadeDoPdf; // na página de impressão a imagem da capa vem redimensionada; na pré-visualização, a original
}) {
  const imagem = capa || CAPAS[0];
  const lateral = CAPAS_COM_TEXTO_A_ESQUERDA.includes(imagem);
  const fundoDaCapa = qualidade ? urlDaImagem(imagem, { largura: larguraDaImagem(qualidade, "capa", false), qualidade }) : imagem;
  const secao = useRef<HTMLElement>(null);
  const pegada = useRef<{ chave: ElementoDaCapa; dx: number; dy: number } | null>(null);

  const posMarca = layout?.marca ?? posicaoPadrao("marca", lateral);
  const posNome = layout?.nome ?? posicaoPadrao("nome", lateral);
  const larguraMarca = layout?.marcaTamanho ?? marcaTamanhoPadrao(lateral);
  const tamanhoNome = layout?.nomeTamanho ?? NOME_TAMANHO.padrao;

  // Arrastar: guarda a distância entre o dedo/mouse e o centro do elemento, para ele não "pular" para o cursor.
  const arraste: Arraste = (chave) => {
    if (!editavel || !onMover) return { className: "" };
    return {
      className: s.arrastavel,
      title: "Arraste para mudar de lugar",
      onPointerDown: (e) => {
        const caixa = secao.current?.getBoundingClientRect();
        if (!caixa) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        const el = e.currentTarget.getBoundingClientRect();
        const cx = ((el.left + el.right) / 2 - caixa.left) / caixa.width;
        const cy = ((el.top + el.bottom) / 2 - caixa.top) / caixa.height;
        pegada.current = { chave, dx: (e.clientX - caixa.left) / caixa.width - cx, dy: (e.clientY - caixa.top) / caixa.height - cy };
      },
      onPointerMove: (e) => {
        const p = pegada.current;
        const caixa = secao.current?.getBoundingClientRect();
        if (!p || p.chave !== chave || !caixa) return;
        onMover(chave, limitarPonto({ x: ((e.clientX - caixa.left) / caixa.width - p.dx) * 100, y: ((e.clientY - caixa.top) / caixa.height - p.dy) * 100 }));
      },
      onPointerUp: () => {
        pegada.current = null;
      },
      onPointerCancel: () => {
        pegada.current = null;
      },
    };
  };

  const ponto = (p: Ponto): CSSProperties => ({ left: `${p.x}%`, top: `${p.y}%` });
  const aMarca = arraste("marca");
  const oNome = arraste("nome");
  const aMensagem = arraste("mensagem");
  const { className: classeMarca, ...eventosMarca } = aMarca;
  const { className: classeNome, ...eventosNome } = oNome;

  return (
    // Se a imagem da capa não existir, o degradê rosa por baixo aparece sozinho.
    <section
      ref={secao}
      className={`${s.pagina} ${s.capa} ${lateral ? s.capaEsquerda : ""}`}
      style={{ backgroundImage: `url("${fundoDaCapa}"), linear-gradient(135deg, #f2d6cd, #deb2a6)` }}
    >
      <div className={s.capaLivre}>
        <h1 className={`${s.livreMarca} ${classeMarca}`} style={{ ...ponto(posMarca), width: `${larguraMarca}%` }} {...eventosMarca}>
          <img className={s.livreLogo} src={LOGO_CAPA} alt={LOJA} draggable={false} />
        </h1>
        <p className={`${s.livreNome} ${classeNome}`} style={{ ...ponto(posNome), fontSize: `${tamanhoNome}cqw` }} {...eventosNome}>
          {nomeCatalogo}
        </p>
        {mensagem && (
          // Um só elemento nos dois casos, para o arraste não se perder quando a mensagem sai da posição de sempre.
          <div
            className={layout?.mensagem ? s.mensagemLivre : `${s.capaMensagem} ${lateral ? s.mensagemLateral : s.mensagemAbaixoDaMarca}`}
            style={layout?.mensagem ? ponto(layout.mensagem) : { justifyContent: JUSTIFICAR[mensagem.linha], alignItems: ALINHAR[mensagem.coluna] }}
          >
            <CaixaDaMensagem mensagem={mensagem} arraste={aMensagem} />
          </div>
        )}
      </div>
    </section>
  );
}
