"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PRODUCT_CATEGORY_NAMES } from "@/lib/format";
import type { PecaDaVitrine, VagaCarrossel } from "@/lib/vitrine";
import type { VagaSalva } from "@/lib/vitrine-db";

type Dados = { max: number; pecas: PecaDaVitrine[]; vagas: VagaSalva[] };

// Escolha de foto: para o carrossel (uma peça) ou para uma categoria (várias peças).
type Escolha = { tipo: "carrossel"; indice: number } | { tipo: "categoria"; categoria: string } | null;

const nomeDe = (p: { name: string | null; id: number }) => p.name?.trim() || `Peça ${p.id}`;

export default function VitrinePage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [lista, setLista] = useState<VagaCarrossel[]>([]);
  const [sujo, setSujo] = useState(false);
  const [escolha, setEscolha] = useState<Escolha>(null);
  const [adicionando, setAdicionando] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/vitrine");
    if (!res.ok) {
      setErro("Não foi possível carregar a vitrine.");
      return;
    }
    const d: Dados = await res.json();
    setDados(d);
    setLista(d.vagas.filter((v) => v.area === "carrossel").map((v) => ({ product_id: v.product_id, photo_url: v.photo_url })));
    setSujo(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const pecaPorId = useMemo(() => new Map((dados?.pecas ?? []).map((p) => [p.id, p])), [dados]);
  const vagasDoCarrossel = dados?.vagas.filter((v) => v.area === "carrossel") ?? [];
  const foraDoSite = (id: number) => !pecaPorId.has(id);

  function mudar(nova: VagaCarrossel[]) {
    setLista(nova);
    setSujo(true);
    setMsg("");
  }

  function mover(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    mudar(nova);
  }

  function adicionar() {
    const peca = pecaPorId.get(Number(adicionando));
    if (!peca || peca.fotos.length === 0) return;
    mudar([...lista, { product_id: peca.id, photo_url: peca.fotos[0] }]);
    setAdicionando("");
  }

  async function salvarCarrossel() {
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/vitrine/carrossel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lista }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(d.message || "Não foi possível salvar o carrossel.");
        return;
      }
      await carregar();
      setMsg("Carrossel salvo.");
    } finally {
      setSalvando(false);
    }
  }

  async function escolherFoto(url: string, productId: number) {
    if (!escolha) return;
    if (escolha.tipo === "carrossel") {
      mudar(lista.map((v, i) => (i === escolha.indice ? { product_id: v.product_id, photo_url: url } : v)));
      setEscolha(null);
      return;
    }
    setErro("");
    const res = await fetch("/api/vitrine/categoria", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: escolha.categoria, product_id: productId, photo_url: url }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(d.message || "Não foi possível salvar a foto da categoria.");
      return;
    }
    setEscolha(null);
    await carregar();
    setMsg(`Foto de ${escolha.categoria} salva.`);
  }

  async function voltarAoAutomatico(categoria: string) {
    const res = await fetch(`/api/vitrine/categoria?category=${encodeURIComponent(categoria)}`, { method: "DELETE" });
    if (res.ok) {
      await carregar();
      setMsg(`${categoria} voltou ao automático.`);
    }
  }

  if (!dados) {
    return (
      <main className="shell shell--wide">
        <div className="loading-state">{erro || "Carregando..."}</div>
      </main>
    );
  }

  const categorias = PRODUCT_CATEGORY_NAMES.filter((c) => dados.pecas.some((p) => p.category === c));
  const escolhaCategoria = (c: string) => dados.vagas.find((v) => v.area === "categoria" && v.category === c);
  const disponiveis = dados.pecas.filter((p) => !lista.some((v) => v.product_id === p.id) && p.fotos.length > 0);

  // Fotos oferecidas na janela de escolha.
  const pecaDoDestaque = escolha?.tipo === "carrossel" ? pecaPorId.get(lista[escolha.indice]?.product_id) : undefined;
  const opcoes: { peca: PecaDaVitrine; url: string }[] =
    escolha?.tipo === "carrossel"
      ? (pecaDoDestaque?.fotos ?? []).map((url) => ({ peca: pecaDoDestaque as PecaDaVitrine, url }))
      : escolha?.tipo === "categoria"
        ? dados.pecas.filter((p) => p.category === escolha.categoria).flatMap((peca) => peca.fotos.map((url) => ({ peca, url })))
        : [];

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Loja</p>
        <h1>Vitrine do site</h1>
        <p>Escolha as fotos que aparecem na página inicial da loja. Só entram peças que estão "No site".</p>
      </div>

      {erro && (
        <div className="banner banner-warning">
          <span>⚠️</span>
          <span>{erro}</span>
        </div>
      )}
      {msg && (
        <div className="banner banner-info">
          <span>✅</span>
          <span>{msg}</span>
        </div>
      )}

      <section className="vt-bloco">
        <header className="vt-head">
          <h2>Carrossel do topo</h2>
          <span className="vt-contador">
            {lista.length} de {dados.max}
          </span>
        </header>
        <p className="hint">Só o que estiver aqui aparece no carrossel, na ordem da lista. Sem nenhum destaque, o carrossel some do site.</p>

        {lista.length === 0 ? (
          <div className="empty-state">Nenhum destaque escolhido.</div>
        ) : (
          <ol className="vt-lista">
            {lista.map((v, i) => {
              const peca = pecaPorId.get(v.product_id);
              const salva = vagasDoCarrossel.find((s) => s.product_id === v.product_id);
              const nome = peca ? nomeDe(peca) : salva?.peca_nome || `Peça ${v.product_id}`;
              return (
                <li key={v.product_id} className={"vt-item" + (foraDoSite(v.product_id) ? " vt-item--fora" : "")}>
                  <span className="vt-pos">{i + 1}</span>
                  <img src={v.photo_url} alt="" className="vt-thumb" />
                  <div className="vt-info">
                    <strong>{nome}</strong>
                    {foraDoSite(v.product_id) && <span className="vt-aviso">Fora do site: não aparece na loja</span>}
                  </div>
                  <div className="vt-acoes">
                    <button type="button" className="icon-btn" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">
                      ↑
                    </button>
                    <button type="button" className="icon-btn" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Descer">
                      ↓
                    </button>
                    <button type="button" className="icon-btn" disabled={!peca} onClick={() => setEscolha({ tipo: "carrossel", indice: i })}>
                      Trocar foto
                    </button>
                    <button type="button" className="icon-btn danger" onClick={() => mudar(lista.filter((_, k) => k !== i))}>
                      Remover
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="vt-adicionar">
          <select value={adicionando} onChange={(e) => setAdicionando(e.target.value)} disabled={lista.length >= dados.max}>
            <option value="">{lista.length >= dados.max ? "O carrossel está cheio" : "Adicionar uma peça..."}</option>
            {disponiveis.map((p) => (
              <option key={p.id} value={p.id}>
                {nomeDe(p)}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-small" onClick={adicionar} disabled={!adicionando}>
            Adicionar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvarCarrossel} disabled={!sujo || salvando}>
            {salvando ? "Salvando..." : "Salvar carrossel"}
          </button>
        </div>
      </section>

      <section className="vt-bloco">
        <header className="vt-head">
          <h2>Foto de cada categoria</h2>
        </header>
        <p className="hint">É o quadrado de cada categoria na página inicial. Sem escolha, a loja usa a foto da peça mais nova.</p>
        {categorias.length === 0 ? (
          <div className="empty-state">Ainda não há peças no site.</div>
        ) : (
          <ul className="vt-lista">
            {categorias.map((c) => {
              const vaga = escolhaCategoria(c);
              return (
                <li key={c} className="vt-item">
                  {vaga ? <img src={vaga.photo_url} alt="" className="vt-thumb" /> : <div className="vt-thumb vt-thumb--vazia">Auto</div>}
                  <div className="vt-info">
                    <strong>{c}</strong>
                    <span className="hint">
                      {vaga ? `Foto escolhida${vaga.peca_nome ? `, de ${vaga.peca_nome}` : ""}` : "Automática: foto da peça mais nova"}
                      {vaga && !vaga.publicada ? " (a peça saiu do site, então a loja ignora até ela voltar)" : ""}
                    </span>
                  </div>
                  <div className="vt-acoes">
                    <button type="button" className="icon-btn" onClick={() => setEscolha({ tipo: "categoria", categoria: c })}>
                      Escolher foto
                    </button>
                    {vaga && (
                      <button type="button" className="icon-btn" onClick={() => voltarAoAutomatico(c)}>
                        Voltar ao automático
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {escolha && (
        <div className="modal-overlay" onClick={() => setEscolha(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>
                {escolha.tipo === "categoria" ? `Foto de ${escolha.categoria}` : "Escolher a foto do destaque"}
              </h2>
              <button type="button" className="icon-btn" onClick={() => setEscolha(null)}>
                Fechar
              </button>
            </div>
            {opcoes.length === 0 ? (
              <div className="empty-state">Nenhuma foto disponível.</div>
            ) : (
              <div className="vt-grade">
                {opcoes.map(({ peca, url }) => (
                  <button type="button" key={`${peca.id}-${url}`} className="vt-opcao" onClick={() => escolherFoto(url, peca.id)}>
                    <img src={url} alt="" />
                    <span>{nomeDe(peca)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
