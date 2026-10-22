// Capa do catálogo: usada na página de impressão e na pré-visualização da tela "Criar catálogo".
// A marca e o nome do catálogo ficam na área escurecida (no alto, ou na metade esquerda nas capas com texto à esquerda);
// a mensagem opcional fica fora dessa área.

import type { CSSProperties } from "react";
import { CAPAS, CAPAS_COM_TEXTO_A_ESQUERDA } from "@/lib/catalogo-layout";
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

const LOGO_CAPA = "/marca/logo-clara.png";
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

function MensagemNaCapa({ mensagem, lateral }: { mensagem: MensagemDaCapa; lateral: boolean }) {
  const regiao = {
    justifyContent: JUSTIFICAR[mensagem.linha],
    alignItems: ALINHAR[mensagem.coluna],
    textAlign: TEXTO[mensagem.coluna],
  } as CSSProperties;
  return (
    <div className={`${s.capaMensagem} ${lateral ? s.mensagemLateral : s.mensagemAbaixoDaMarca}`} style={regiao}>
      <div className={`${s.mensagemCaixa} ${mensagem.fundo ? s.mensagemComFundo : ""}`} style={{ alignItems: ALINHAR[mensagem.coluna] }}>
        {mensagem.blocos.map((b, i) => (
          <BlocoNaCapa key={i} bloco={b} />
        ))}
      </div>
    </div>
  );
}

export function CapaDoCatalogo({
  capa,
  nomeCatalogo,
  mensagem,
}: {
  capa: string;
  nomeCatalogo: string;
  mensagem?: MensagemDaCapa | null;
}) {
  const imagem = capa || CAPAS[0];
  const lateral = CAPAS_COM_TEXTO_A_ESQUERDA.includes(imagem);
  return (
    // Se a imagem da capa não existir, o degradê rosa por baixo aparece sozinho.
    <section
      className={`${s.pagina} ${s.capa} ${lateral ? s.capaEsquerda : ""}`}
      style={{ backgroundImage: `url("${imagem}"), linear-gradient(135deg, #f2d6cd, #deb2a6)` }}
    >
      <h1 className={s.capaMarca}>
        <img className={s.capaLogo} src={LOGO_CAPA} alt={LOJA} />
      </h1>
      <p className={s.capaCatalogo}>{nomeCatalogo}</p>
      {mensagem && <MensagemNaCapa mensagem={mensagem} lateral={lateral} />}
    </section>
  );
}
