"use client";

// Página de impressão do catálogo (varejo ou consignado): o "gerar PDF" é o próprio Ctrl+P do
// navegador, ou o botão "Baixar PDF" que só chama window.print(). Sem biblioteca de PDF no servidor.
// Lê a seleção feita em /cadastros/catalogo, guardada no sessionStorage (não precisa de banco aqui).
// Layout: A4 paisagem, capa e uma peça por página (inspirado em lookbook de joias).
// Nunca mostrar custo, fabricante, fornecedor ou código aqui (sigilo da loja): PecaCatalogo nem traz esses campos.

import { useEffect, useState } from "react";
import type { CatalogoPdfDados, PecaCatalogo } from "@/app/cadastros/catalogo/page";
import { CAPAS, decidirPagina, enquadramento, precoDaLegenda } from "@/lib/catalogo-layout";
import s from "./catalogo-pdf.module.css";

const LOJA = "Fernanda Brilhante";

const ESTILO_IMPRESSAO = `
  @page { size: A4 landscape; margin: 0; }
  @media print {
    html, body { background: #fff !important; }
    body:has(.sidebar) { padding-left: 0 !important; }
    .sidebar, .contentbar, .topbar, .bottom-nav, .more-sheet, .more-backdrop { display: none !important; }
  }
`;

function PaginaDaPeca({ peca, numero, destaque, colecao }: { peca: PecaCatalogo; numero: number; destaque: boolean; colecao: string }) {
  const tipo = decidirPagina(peca);
  const { fx, fy, zoom } = enquadramento(peca.catalog_photo);
  const fotoModelo = tipo === "duplo-modelo" ? peca.photo_url : peca.photo_modelo_url;
  const preco = precoDaLegenda(peca.price);

  return (
    <section className={s.pagina}>
      <div className={s.painel}>
        <div className={s.topo}>
          <span>{LOJA}</span>
          <span>{String(numero).padStart(2, "0")}</span>
        </div>

        {tipo === "duplo-modelo" && peca.photo_url && (
          <div className={s.recorte}>
            <img src={peca.photo_url} alt="" style={{ width: `${zoom * 100}%`, transform: `translate(-${fx}%, -${fy}%)` }} />
          </div>
        )}
        {tipo !== "duplo-modelo" && peca.photo_url && (
          <div className={s.peca}>
            <img src={peca.photo_url} alt={peca.name} />
          </div>
        )}

        <div className={s.legenda}>
          {destaque && <p className={s.destaque}>Destaque</p>}
          <p className={s.nome}>{peca.name}</p>
          {peca.category && <p className={s.categoria}>{peca.category}</p>}
          {preco && <p className={s.preco}>{preco}</p>}
        </div>
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
          {dados.logo && <img className={s.capaLogo} src="/marca/logo-banner.jpg" alt={LOJA} />}
          <h1 className={s.capaMarca}>{LOJA}</h1>
          <p className={s.capaCatalogo}>{dados.nomeCatalogo}</p>
        </section>

        {[...destaques, ...normais].map((p, i) => (
          <PaginaDaPeca
            key={p.id}
            peca={p}
            numero={i + 2}
            destaque={i < destaques.length}
            colecao={dados.nomeCatalogo}
          />
        ))}
      </div>
    </div>
  );
}
