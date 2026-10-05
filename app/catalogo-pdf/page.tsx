"use client";

// Página de impressão do catálogo (varejo ou consignado): o "gerar PDF" é o próprio Ctrl+P do
// navegador, ou o botão "Baixar PDF" que só chama window.print(). Sem biblioteca de PDF no servidor.
// Lê a seleção feita em /cadastros/catalogo, guardada no sessionStorage (não precisa de banco aqui).
// Layout: A4 paisagem, capa e de 1 a 10 peças por página. Cada peça é um "spread" como na referência
// (peça isolada no rosa + foto da modelo com o nome na vertical); com 2 a 10 por página os spreads
// ficam menores, lado a lado. A capa leva a logo completa; as páginas, a logo como marca d'água discreta no rodapé.
// Nunca mostrar custo, fabricante, fornecedor ou código aqui (sigilo da loja): PecaCatalogo nem traz esses campos.

import { useEffect, useState } from "react";
import type { CatalogoPdfDados, PecaCatalogo } from "@/app/cadastros/catalogo/page";
import {
  agruparPorPagina,
  CAPAS,
  decidirPagina,
  enquadramento,
  gradeDaPagina,
  porPaginaValido,
  precoDaLegenda,
  type GradeDaPagina,
} from "@/lib/catalogo-layout";
import s from "./catalogo-pdf.module.css";

const LOJA = "Fernanda Brilhante";
const LOGO_MARCA_DAGUA = "/marca/logo-escura.png";
const LOGO_CAPA = "/marca/logo-clara.png";

const ESTILO_IMPRESSAO = `
  @page { size: A4 landscape; margin: 0; }
  @media print {
    html, body { background: #fff !important; }
    body:has(.sidebar) { padding-left: 0 !important; }
    .sidebar, .contentbar, .topbar, .bottom-nav, .more-sheet, .more-backdrop { display: none !important; }
  }
`;

type Spread = { peca: PecaCatalogo; numero: number; destaque: boolean; colecao: string; logo: boolean; mini: boolean };

function MarcaDagua() {
  return <img className={s.marcaDagua} src={LOGO_MARCA_DAGUA} alt="" />;
}

// Os dois painéis da peça. Na página de 1 peça ocupam a folha toda; na grade, cada peça ganha um
// spread pequeno com o mesmo desenho.
function SpreadDaPeca({ peca, numero, destaque, colecao, logo, mini }: Spread) {
  const tipo = decidirPagina(peca);
  const { fx, fy, zoom } = enquadramento(peca.catalog_photo);
  const fotoModelo = tipo === "duplo-modelo" ? peca.photo_url : peca.photo_modelo_url;
  const preco = precoDaLegenda(peca.price);

  return (
    <>
      <div className={s.painel}>
        {!mini && (
          <div className={s.topo}>
            <span>{LOJA}</span>
            <span>{String(numero).padStart(2, "0")}</span>
          </div>
        )}

        {tipo === "duplo-modelo" && peca.photo_url && (
          <div className={s.recorte}>
            <img src={peca.photo_url} alt="" style={{ width: `${zoom * 100}%`, transform: `translate(-${fx}%, -${fy}%)` }} />
          </div>
        )}
        {tipo === "limpa-unica" && peca.photo_url && (
          <div className={s.peca}>
            <img src={peca.photo_url} alt={peca.name} />
          </div>
        )}
        {tipo === "duplo-limpa" && peca.photo_url && (
          <div className={s.fotoClose}>
            <img src={peca.photo_url} alt={peca.name} />
          </div>
        )}

        <div className={s.legenda}>
          {destaque && <p className={s.destaque}>Destaque</p>}
          <p className={s.nome}>{peca.name}</p>
          {peca.category && <p className={s.categoria}>{peca.category}</p>}
          {preco && <p className={s.preco}>{preco}</p>}
        </div>

        {logo && !mini && <MarcaDagua />}
      </div>

      <div className={s.lado}>
        {tipo === "limpa-unica" ? (
          <span className={s.vertical}>{colecao}</span>
        ) : (
          <>
            {fotoModelo && <img src={fotoModelo} alt="" style={{ objectPosition: `${fx}% ${fy}%` }} />}
            <span className={`${s.vertical} ${s.sobreFoto}`}>{colecao}</span>
          </>
        )}
      </div>
    </>
  );
}

function PaginaDaPeca(props: Omit<Spread, "mini">) {
  return (
    <section className={s.pagina}>
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
}: {
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
          Não encontrei uma seleção de catálogo. Volte em Produtos → "Gerar catálogo (PDF)" e escolha as peças de
          novo.
        </div>
        <a className="btn btn-primary" href="/cadastros/catalogo">
          Voltar para a seleção
        </a>
      </main>
    );
  }

  const destaques = dados.pecas.filter((p) => dados.destaqueIds.includes(p.id));
  const normais = dados.pecas.filter((p) => !dados.destaqueIds.includes(p.id));
  const capa = dados.capa || CAPAS[0];
  const porPagina = porPaginaValido(dados.porPagina);
  const grade = gradeDaPagina(porPagina);

  return (
    <div className={s.catalogo}>
      <style>{ESTILO_IMPRESSAO}</style>
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&display=swap"
      />

      <div className={s.barra}>
        <a className="btn btn-ghost" href="/cadastros/catalogo">
          ← Voltar para a seleção
        </a>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Baixar PDF (imprimir)
        </button>
        <span className="hint">
          {dados.pecas.length} peça(s) · {dados.tipo === "varejo" ? "Varejo" : `Consignado: ${dados.clienteNome}`}
        </span>
      </div>

      <div className={s.folhas}>
        {/* Se a imagem da capa não existir, o degradê rosa por baixo aparece sozinho. */}
        <section
          className={`${s.pagina} ${s.capa}`}
          style={{ backgroundImage: `url("${capa}"), linear-gradient(135deg, #f2d6cd, #deb2a6)` }}
        >
          <h1 className={s.capaMarca}>
            <img className={s.capaLogo} src={LOGO_CAPA} alt={LOJA} />
          </h1>
          <p className={s.capaCatalogo}>{dados.nomeCatalogo}</p>
        </section>

        {porPagina === 1
          ? [...destaques, ...normais].map((p, i) => (
              <PaginaDaPeca
                key={p.id}
                peca={p}
                numero={i + 2}
                destaque={i < destaques.length}
                colecao={dados.nomeCatalogo}
                logo={dados.logo}
              />
            ))
          : agruparPorPagina([...destaques, ...normais], porPagina).map((grupo, i) => (
              <PaginaEmGrade
                key={grupo[0].id}
                pecas={grupo}
                numero={i + 2}
                destaqueIds={dados.destaqueIds}
                colecao={dados.nomeCatalogo}
                logo={dados.logo}
                grade={grade}
              />
            ))}
      </div>
    </div>
  );
}
