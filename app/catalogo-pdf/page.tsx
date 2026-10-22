"use client";

// Página de impressão do catálogo (varejo ou consignado): o "gerar PDF" é o próprio Ctrl+P do
// navegador, ou o botão "Baixar PDF" que só chama window.print(). Sem biblioteca de PDF no servidor.
// Lê a seleção feita em /cadastros/catalogo, guardada no sessionStorage (não precisa de banco aqui).
// Layout: A4 paisagem, capa e de 1 a 10 peças por página. Cada peça é um "spread" como na referência
// (peça isolada no rosa + foto da modelo com o nome na vertical); com 2 a 10 por página os spreads
// ficam menores, lado a lado. A capa leva a logo completa; as páginas, a logo como marca d'água discreta no rodapé.
// Nunca mostrar custo, fabricante, fornecedor ou código aqui (sigilo da loja): PecaCatalogo nem traz esses campos.

import { useEffect, useRef, useState } from "react";
import { larguraDaImagem, qualidadeValida, urlDaImagem, urlDaMoldura, type QualidadeDoPdf } from "@/lib/catalogo-imagem";
import type { CatalogoPdfDados, PecaCatalogo } from "@/app/cadastros/catalogo/page";
import {
  agruparPorPagina,
  aplicarEscolhaDeFotos,
  decidirPagina,
  desenhoDaPagina,
  enquadramento,
  gradeDaPagina,
  porPaginaValido,
  precoDaLegenda,
  type GradeDaPagina,
} from "@/lib/catalogo-layout";
import { URL_DAS_FONTES, mensagemValida } from "@/lib/catalogo-mensagem";
import { capaLayoutValido } from "@/lib/catalogo-capa";
import { CapaDoCatalogo } from "./capa";
import s from "./catalogo-pdf.module.css";

const LOJA = "Fernanda Brilhante";
const LOGO_MARCA_DAGUA = "/marca/logo-marca-dagua.png"; // já com a transparência certa: nada de filtro nem mistura de cores no PDF

const ESTILO_IMPRESSAO = `
  @page { size: A4 landscape; margin: 0; }
  @media print {
    html, body { background: #fff !important; }
    body:has(.sidebar) { padding-left: 0 !important; }
    .sidebar, .contentbar, .topbar, .bottom-nav, .more-sheet, .more-backdrop { display: none !important; }
  }
`;

type Spread = { peca: PecaCatalogo; numero: number; destaque: boolean; colecao: string; logo: boolean; mini: boolean; qualidade: QualidadeDoPdf };

// Caixa de tamanho fixo igual para todas as peças. A foto aparece inteira, com as bordas suaves, sobre uma cópia ampliada e
// desfocada dela mesma que preenche o que sobrar. Quem monta isso é o servidor (uma imagem JPEG só, do tamanho da caixa):
// filtro de borrão e máscara do CSS viram imagens enormes no PDF e deixam páginas em branco em vários leitores.
function FotoClose({ url, nome, caixaClasse, qualidade, largura }: { url: string; nome: string; caixaClasse?: string; qualidade: QualidadeDoPdf; largura: number }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [proporcao, setProporcao] = useState<number | null>(null);
  useEffect(() => {
    const c = caixa.current?.getBoundingClientRect();
    setProporcao(c && c.height > 0 ? c.width / c.height : 1.1);
  }, []);
  return (
    <div className={caixaClasse ?? s.fotoClose} ref={caixa}>
      {proporcao !== null && <img className={s.fotoComposta} src={urlDaMoldura(url, { largura, proporcao, qualidade })} alt={nome} />}
    </div>
  );
}

function MarcaDagua() {
  return <img className={s.marcaDagua} src={LOGO_MARCA_DAGUA} alt="" />;
}

// Os dois painéis da peça. Na página de 1 peça ocupam a folha toda; na grade, cada peça ganha um
// spread pequeno com o mesmo desenho.
function SpreadDaPeca({ peca: pecaOriginal, numero, destaque, colecao, logo, mini, qualidade }: Spread) {
  const foto = (url: string | null | undefined, uso: "modelo" | "mosaico") => urlDaImagem(url, { largura: larguraDaImagem(qualidade, uso, mini), qualidade });
  // Fotos escolhidas na tela de gerar: 1 ou 2 usam o desenho de sempre; 3 ou 4 viram mosaico (nas grades pequenas, só 2).
  const pecaBase = mini && (pecaOriginal.fotos?.length ?? 0) >= 3 ? { ...pecaOriginal, fotos: pecaOriginal.fotos!.slice(0, 2) } : pecaOriginal;
  const peca = aplicarEscolhaDeFotos(pecaBase);
  const tipo = decidirPagina(peca);
  const { fx, fy, zoom } = enquadramento(peca.catalog_photo);
  const fotoModelo = tipo === "duplo-modelo" ? peca.photo_url : peca.photo_modelo_url;
  const preco = precoDaLegenda(peca.price);
  const mosaico = tipo === "mosaico" ? peca.fotos ?? [] : [];
  const unica = tipo === "limpa-unica";

  return (
    <>
      <div className={`${s.painel} ${unica ? s.painelUnico : ""}`}>
        {!mini && (
          <div className={s.topo}>
            <span>{LOJA}</span>
            <span>{String(numero).padStart(2, "0")}</span>
          </div>
        )}

        {tipo === "duplo-modelo" && peca.photo_url && (
          <div className={s.recorte}>
            <img src={foto(peca.photo_url, "modelo")} alt="" style={{ width: `${zoom * 100}%`, transform: `translate(-${fx}%, -${fy}%)` }} />
          </div>
        )}
        {(tipo === "duplo-limpa" || tipo === "mosaico") && (mosaico[0] ?? peca.photo_url) && (
          <FotoClose url={(mosaico[0] ?? peca.photo_url) as string} nome={peca.name} qualidade={qualidade} largura={larguraDaImagem(qualidade, "close", mini)} />
        )}

        <div className={s.legenda}>
          {destaque && <p className={s.destaque}>Destaque</p>}
          <p className={s.nome}>{peca.name}</p>
          {peca.category && <p className={s.categoria}>{peca.category}</p>}
          {preco && <p className={s.preco}>{preco}</p>}
        </div>

        {logo && !mini && <MarcaDagua />}
      </div>

      <div className={`${s.lado} ${tipo === "mosaico" ? `${s.mosaico} ${mosaico.length === 3 ? s.mosaico2 : s.mosaico3}` : ""}`}>
        {tipo === "mosaico" ? (
          <>
            {mosaico.slice(1).map((url, i) => (
              <img key={url + i} src={foto(url, "mosaico")} alt="" />
            ))}
            <span className={`${s.vertical} ${s.sobreFoto}`}>{colecao}</span>
          </>
        ) : unica ? (
          // Peça com uma foto só: a foto grande no lado direito (inteira, sem cortar) e o nome e o preço no centro do esquerdo.
          peca.photo_url ? (
            <>
              <FotoClose url={peca.photo_url} nome={peca.name} caixaClasse={s.fotoLado} qualidade={qualidade} largura={larguraDaImagem(qualidade, "modelo", mini)} />
              <span className={`${s.vertical} ${s.sobreFoto}`}>{colecao}</span>
            </>
          ) : (
            <span className={s.vertical}>{colecao}</span>
          )
        ) : (
          <>
            {fotoModelo && <img src={foto(fotoModelo, "modelo")} alt="" style={{ objectPosition: `${fx}% ${fy}%` }} />}
            <span className={`${s.vertical} ${s.sobreFoto}`}>{colecao}</span>
          </>
        )}
      </div>
    </>
  );
}

function PaginaDaPeca({ desenho, ...props }: Omit<Spread, "mini"> & { desenho: number }) {
  // Os desenhos que se revezam foram feitos para close + modelo: peça de uma foto só e mosaico usam sempre o desenho padrão.
  const tipoDaPagina = decidirPagina(aplicarEscolhaDeFotos(props.peca));
  const desenhoFinal = tipoDaPagina === "limpa-unica" || tipoDaPagina === "mosaico" ? 0 : desenho;
  const classeDoDesenho = desenhoFinal > 0 ? s[`v${desenhoFinal}`] : "";
  return (
    <section className={`${s.pagina} ${classeDoDesenho}`}>
      <SpreadDaPeca {...props} mini={false} />
    </section>
  );
}

function PaginaEmGrade({
  pecas,
  numero,
  destaqueIds,
  colecao,
  logo,
  grade,
  qualidade,
}: {
  qualidade: QualidadeDoPdf;
  pecas: PecaCatalogo[];
  numero: number;
  destaqueIds: number[];
  colecao: string;
  logo: boolean;
  grade: GradeDaPagina;
}) {
  const estiloPagina = { "--colunas": grade.colunas, "--largura": `${grade.largura}cqw` } as React.CSSProperties;
  const estiloCelula = { "--t": grade.texto } as React.CSSProperties;

  return (
    <section className={`${s.pagina} ${s.paginaGrade}`} style={estiloPagina}>
      <div className={`${s.topo} ${s.topoGrade}`}>
        <span>{LOJA}</span>
        <span>{String(numero).padStart(2, "0")}</span>
      </div>
      <div className={s.grade}>
        {pecas.map((p) => (
          <div key={p.id} className={`${s.pagina} ${s.celulaMini}`} style={estiloCelula}>
            <SpreadDaPeca
              peca={p}
              numero={numero}
              destaque={destaqueIds.includes(p.id)}
              colecao={colecao}
              logo={logo}
              mini
              qualidade={qualidade}
            />
          </div>
        ))}
      </div>
      {logo && <MarcaDagua />}
    </section>
  );
}

export default function CatalogoPdfPage() {
  const [dados, setDados] = useState<CatalogoPdfDados | null | "vazio">(null);

  useEffect(() => {
    try {
      const bruto = sessionStorage.getItem("radar-catalogo-pdf");
      setDados(bruto ? (JSON.parse(bruto) as CatalogoPdfDados) : "vazio");
    } catch {
      setDados("vazio");
    }
  }, []);

  if (dados === null) return null;
  if (dados === "vazio") {
    return (
      <main className="shell">
        <div className="empty-state">
          Não encontrei uma seleção de catálogo. Volte em "Criar catálogo" e escolha as peças de novo.
        </div>
        <a className="btn btn-primary" href="/cadastros/catalogo">
          Voltar para a seleção
        </a>
      </main>
    );
  }

  // A ordem das peças é a que o João deixou na tela "Criar catálogo"; destaque só põe o rótulo.
  const pecas = dados.pecas;
  const porPagina = porPaginaValido(dados.porPagina);
  const qualidade = qualidadeValida(dados.qualidadePdf);
  const grade = gradeDaPagina(porPagina);

  return (
    <div className={s.catalogo}>
      <style>{ESTILO_IMPRESSAO}</style>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&display=swap"
      />
      <link rel="stylesheet" href={URL_DAS_FONTES} />

      <div className={s.barra}>
        <a className="btn btn-ghost" href="/cadastros/catalogo">
          ← Voltar para a seleção
        </a>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Baixar PDF (imprimir)
        </button>
        <span className="hint">
          {dados.pecas.length} peça(s)
        </span>
      </div>

      <div className={s.folhas}>
        <CapaDoCatalogo capa={dados.capa} nomeCatalogo={dados.nomeCatalogo} mensagem={mensagemValida(dados.mensagemCapa)} layout={capaLayoutValido(dados.capaLayout)} qualidade={qualidade} />

        {porPagina === 1
          ? pecas.map((p, i) => (
              <PaginaDaPeca
                key={p.id}
                peca={p}
                numero={i + 2}
                destaque={dados.destaqueIds.includes(p.id)}
                colecao={dados.nomeCatalogo}
                logo={dados.logo}
                qualidade={qualidade}
                desenho={desenhoDaPagina(i, dados.variar !== false)}
              />
            ))
          : agruparPorPagina(pecas, porPagina).map((grupo, i) => (
              <PaginaEmGrade
                key={grupo[0].id}
                pecas={grupo}
                numero={i + 2}
                destaqueIds={dados.destaqueIds}
                colecao={dados.nomeCatalogo}
                logo={dados.logo}
                grade={grade}
                qualidade={qualidade}
              />
            ))}
      </div>
    </div>
  );
}
