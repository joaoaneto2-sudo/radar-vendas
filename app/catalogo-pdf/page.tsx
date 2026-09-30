"use client";

// Página de impressão do catálogo (varejo ou consignado): o "gerar PDF" é o próprio Ctrl+P do
// navegador, ou o botão "Baixar PDF" que só chama window.print(). Sem biblioteca de PDF no servidor.
// Lê a seleção feita em /cadastros/catalogo, guardada no sessionStorage (não precisa de banco aqui).
// Estilo: 2 peças por página, foto e preço, no modelo GAB (ver docs/superpowers/specs/2026-09-28-catalogo-online-design.md).

import { useEffect, useState } from "react";
import type { CatalogoPdfDados, PecaCatalogo } from "@/app/cadastros/catalogo/page";
import { formatBRL } from "@/lib/format";

function chunkPairs<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) out.push(arr.slice(i, i + 2));
  return out;
}

export default function CatalogoPdfPage() {
  const [dados, setDados] = useState<CatalogoPdfDados | null | "vazio">(null);

  useEffect(() => {
    try {
      const bruto = sessionStorage.getItem("radar-catalogo-pdf");
      if (!bruto) {
        setDados("vazio");
        return;
      }
      setDados(JSON.parse(bruto) as CatalogoPdfDados);
    } catch {
      setDados("vazio");
    }
  }, []);

  if (dados === null) return null;
  if (dados === "vazio") {
    return (
      <main className="shell no-print">
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

  const destaques: PecaCatalogo[] = dados.pecas.filter((p) => dados.destaqueIds.includes(p.id));
  const normais: PecaCatalogo[] = dados.pecas.filter((p) => !dados.destaqueIds.includes(p.id));
  const paginasNormais = chunkPairs(normais);

  return (
    <div className="catalogo-pdf">
      <style>{`
        .catalogo-pdf { background: #fff; color: #2a1810; font-family: "Manrope", "Segoe UI", system-ui, sans-serif; }
        .catalogo-pdf .cp-toolbar { padding: 16px; display: flex; gap: 12px; align-items: center; background: #f8efe3; }
        .cp-page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 16mm 14mm; box-sizing: border-box; page-break-after: always; }
        .cp-cover { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 265mm; text-align: center; }
        .cp-cover img.cp-logo { max-width: 260px; margin-bottom: 32px; }
        .cp-cover h1 { font-family: "Sora", sans-serif; font-size: 2.2rem; color: #5a2f17; margin: 0 0 12px; }
        .cp-cover .cp-cliente { font-size: 1.1rem; color: #715a48; }
        .cp-destaque { display: flex; flex-direction: column; align-items: center; text-align: center; margin-bottom: 28mm; }
        .cp-destaque img { width: 120mm; height: 120mm; object-fit: cover; border-radius: 12px; margin-bottom: 10px; }
        .cp-destaque .cp-nome { font-size: 1.3rem; font-weight: 600; color: #5a2f17; }
        .cp-destaque .cp-preco { font-size: 1.1rem; color: #a9772a; }
        .cp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14mm; height: 100%; align-content: start; }
        .cp-card { display: flex; flex-direction: column; align-items: center; text-align: center; }
        .cp-card img { width: 78mm; height: 78mm; object-fit: cover; border-radius: 10px; margin-bottom: 8px; background: #f8efe3; }
        .cp-card .cp-nome { font-size: 1rem; font-weight: 600; color: #33190d; }
        .cp-card .cp-preco { font-size: 0.95rem; color: #a9772a; }
        .cp-section-title { font-family: "Sora", sans-serif; font-size: 1.1rem; color: #5a2f17; margin: 0 0 12mm; text-align: center; }
        @media print {
          .no-print, .cp-toolbar { display: none !important; }
          .sidebar, .contentbar, .topbar, .bottom-nav, .more-sheet, .more-backdrop { display: none !important; }
          .cp-page { page-break-after: always; margin: 0; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <div className="cp-toolbar no-print">
        <a className="btn btn-ghost" href="/cadastros/catalogo">
          ← Voltar para a seleção
        </a>
        <button className="btn btn-primary" onClick={() => window.print()}>
          Baixar PDF (imprimir)
        </button>
        <span className="hint">{dados.pecas.length} peça(s) · {dados.tipo === "varejo" ? "Varejo" : `Consignado — ${dados.clienteNome}`}</span>
      </div>

      {/* Capa */}
      <div className="cp-page cp-cover">
        {dados.logo && <img className="cp-logo" src="/marca/logo-banner.jpg" alt="Fernanda Brilhante" />}
        <h1>{dados.nomeCatalogo}</h1>
        {dados.clienteNome && <div className="cp-cliente">Catálogo consignado para {dados.clienteNome}</div>}
      </div>

      {/* Peças em destaque: uma por página, em posição especial */}
      {destaques.map((p) => (
        <div className="cp-page" key={`destaque-${p.id}`}>
          <div className="cp-section-title">Destaque</div>
          <div className="cp-destaque">
            {p.photo_url ? <img src={p.photo_url} alt={p.name} /> : null}
            <div className="cp-nome">{p.name}</div>
            <div className="cp-preco">{formatBRL(p.price)}</div>
          </div>
        </div>
      ))}

      {/* Peças normais: 2 por página */}
      {paginasNormais.map((par, i) => (
        <div className="cp-page" key={`pagina-${i}`}>
          <div className="cp-grid">
            {par.map((p) => (
              <div className="cp-card" key={p.id}>
                {p.photo_url ? <img src={p.photo_url} alt={p.name} /> : null}
                <div className="cp-nome">{p.name}</div>
                <div className="cp-preco">{formatBRL(p.price)}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
