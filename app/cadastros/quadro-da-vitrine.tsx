"use client";

import { useMemo } from "react";
import { formatBRL, type Product } from "@/lib/format";
import { montarQuadroDaVitrine } from "@/lib/vitrine-quadro";

// Atalhos da loja, no alto de Produtos e cadastros: o que está no carrossel, o que está no site,
// o que já pode entrar e, embaixo, o que precisa de atenção (esgotada ou faltando dado).
// Os botões usam as mesmas regras da lista: o Radar continua recusando peça incompleta.

type Campo = "show_online" | "featured";

function Miniatura({ p }: { p: Product }) {
  return p.photo_url ? <img src={p.photo_url} alt="" className="qv-thumb" /> : <div className="qv-thumb qv-thumb--vazia">💎</div>;
}

function Cartao({
  p,
  dica,
  children,
}: {
  p: Product;
  dica?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="qv-card">
      <Miniatura p={p} />
      <div className="qv-info">
        <strong title={p.name ?? undefined}>{p.name?.trim() || "(sem nome)"}</strong>
        <span className="qv-sub">
          {p.price !== null && p.price !== undefined && p.price !== "" ? formatBRL(p.price) : "sem preço"} · estoque {p.stock_qty}
        </span>
        {dica && <span className="qv-dica">{dica}</span>}
      </div>
      <div className="qv-acoes">{children}</div>
    </li>
  );
}

function Coluna({ titulo, nota, vazio, total, children }: { titulo: string; nota: string; vazio: string; total: number; children: React.ReactNode }) {
  return (
    <section className="qv-col">
      <header className="qv-head">
        <div className="qv-title">
          <h3>{titulo}</h3>
          <span className="qv-count">{total}</span>
        </div>
        <span className="qv-nota">{nota}</span>
      </header>
      {total === 0 ? <div className="qv-vazio">{vazio}</div> : <ul className="qv-lista">{children}</ul>}
    </section>
  );
}

export default function QuadroDaVitrine({
  items,
  aoAlternar,
  aoEditar,
}: {
  items: Product[];
  aoAlternar: (p: Product, campo: Campo) => void;
  aoEditar: (p: Product) => void;
}) {
  const q = useMemo(() => montarQuadroDaVitrine(items), [items]);
  const nada = q.carrossel.length + q.noSite.length + q.podemEntrar.length + q.atencao.length === 0;
  if (nada) return null;

  return (
    <section className="qv" aria-label="Atalhos da loja online">
      <header className="qv-topo">
        <div>
          <h2>Atalhos da loja online</h2>
          <p className="hint">Atalhos para o que aparece no site. Peça de atacado (do fabricante) não entra aqui.</p>
        </div>
        <a className="btn btn-ghost btn-small" href="/loja-online/vitrine">
          Abrir a Vitrine do site
        </a>
      </header>

      <div className="qv-grade">
        <Coluna titulo="No carrossel" nota="aparecem no topo do site" vazio="Nenhuma peça no carrossel." total={q.carrossel.length}>
          {q.carrossel.map((p) => (
            <Cartao key={p.id} p={p}>
              <button type="button" className="icon-btn" onClick={() => aoAlternar(p, "featured")}>
                Tirar do carrossel
              </button>
              <button type="button" className="icon-btn danger" onClick={() => aoAlternar(p, "show_online")}>
                Tirar do site
              </button>
            </Cartao>
          ))}
        </Coluna>

        <Coluna titulo="No site" nota="publicadas, fora do carrossel" vazio="Nenhuma peça só no site." total={q.noSite.length}>
          {q.noSite.map((p) => (
            <Cartao key={p.id} p={p}>
              <button type="button" className="icon-btn" onClick={() => aoAlternar(p, "featured")}>
                Colocar no carrossel
              </button>
              <button type="button" className="icon-btn danger" onClick={() => aoAlternar(p, "show_online")}>
                Tirar do site
              </button>
            </Cartao>
          ))}
        </Coluna>

        <Coluna titulo="Podem entrar" nota="completas e com estoque" vazio="Nenhuma peça pronta esperando." total={q.podemEntrar.length}>
          {q.podemEntrar.map((p) => (
            <Cartao key={p.id} p={p}>
              <button type="button" className="btn btn-primary btn-small" onClick={() => aoAlternar(p, "show_online")}>
                Colocar no site
              </button>
            </Cartao>
          ))}
        </Coluna>
      </div>

      <div className="qv-atencao">
        <header className="qv-head">
          <div className="qv-title">
            <h3>Precisam de atenção</h3>
            <span className="qv-count qv-count--alerta">{q.atencao.length}</span>
          </div>
          <span className="qv-nota">esgotadas ou faltando dado para subir no site</span>
        </header>
        {q.atencao.length === 0 ? (
          <div className="qv-vazio">Nenhuma peça esgotada ou incompleta.</div>
        ) : (
          <ul className="qv-lista qv-lista--larga">
            {q.atencao.map(({ peca: p, motivos, noSite }) => (
              <Cartao key={p.id} p={p} dica={(noSite ? "No site. " : "") + motivos.join(". ")}>
                <button type="button" className="btn btn-primary btn-small" onClick={() => aoEditar(p)}>
                  Editar
                </button>
                {noSite && (
                  <button type="button" className="icon-btn danger" onClick={() => aoAlternar(p, "show_online")}>
                    Tirar do site
                  </button>
                )}
              </Cartao>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
