"use client";

// Montar Catálogo: tela da Fernanda, sem menu, feita para o celular. Em passos: capa, tipos de peça, fornecedores,
// as peças uma a uma (V entra, X fica de fora, voltar desfaz) e a ordem. No fim ela manda o catálogo, que aparece
// pronto para o João no Criar catálogo. O passo a passo fica guardado no aparelho até ela mandar.

import { useEffect, useMemo, useState } from "react";
import type { Product } from "@/lib/format";
import { CAPAS } from "@/lib/catalogo-layout";
import { temPreco } from "@/lib/catalogo-filtro";
import { moverPara, moverUmaCasa } from "@/lib/catalogo-ordem";
import { urlDaImagem } from "@/lib/catalogo-imagem";

type Passo = "capa" | "tipos" | "fornecedores" | "pecas" | "ordem" | "enviar" | "pronto";
type Estado = { passo: Passo; capa: string; tipos: string[]; fornecedores: string[]; vistas: number[]; escolhidas: number[]; nome: string };

const CHAVE = "radar-montar-catalogo";
const INICIAL: Estado = { passo: "capa", capa: CAPAS[0], tipos: [], fornecedores: [], vistas: [], escolhidas: [], nome: "" };
const SEM_FORNECEDOR = "Sem fornecedor";
const ORDEM_DOS_TIPOS = ["Brincos", "Colares e Correntes", "Pulseiras", "Anéis", "Pingentes", "Conjuntos", "Outros"];

const mini = (url: string | null | undefined, largura = 700) => (url ? urlDaImagem(url, { largura, qualidade: "leve" }) : "");
const fornecedorDe = (p: Product) => p.manufacturer_name || SEM_FORNECEDOR;

function contar(lista: Product[], chave: (p: Product) => string): { nome: string; total: number }[] {
  const mapa = new Map<string, number>();
  for (const p of lista) mapa.set(chave(p), (mapa.get(chave(p)) ?? 0) + 1);
  return [...mapa.entries()].map(([nome, total]) => ({ nome, total }));
}

export default function MontarCatalogo() {
  const [pecas, setPecas] = useState<Product[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [e, setE] = useState<Estado>(INICIAL);
  const [enviando, setEnviando] = useState(false);
  const [movendo, setMovendo] = useState<number | null>(null); // peça tocada na tela da ordem, esperando o lugar novo

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(CHAVE);
      if (salvo) setE({ ...INICIAL, ...JSON.parse(salvo) });
    } catch {
      // sem armazenamento no aparelho: começa do zero
    }
    fetch("/api/products")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        // Peças nossas que existem (não marcadas com X), com preço e com foto.
        const lista = (d.items as (Product & { validacao?: string | null })[]).filter(
          (p) => p.active !== false && p.sale_channel !== "atacado" && p.validacao !== "saiu" && temPreco(p) && !!p.photo_url
        );
        setPecas(lista);
      })
      .catch(() => setErro("As peças não carregaram. Feche e abra de novo."))
      .finally(() => setCarregando(false));
  }, []);

  function mudar(parte: Partial<Estado>) {
    setE((atual) => {
      const novo = { ...atual, ...parte };
      try {
        localStorage.setItem(CHAVE, JSON.stringify(novo));
      } catch {
        // segue sem guardar
      }
      return novo;
    });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  const tipos = useMemo(
    () => contar(pecas, (p) => p.category || "Outros").sort((a, b) => ORDEM_DOS_TIPOS.indexOf(a.nome) - ORDEM_DOS_TIPOS.indexOf(b.nome)),
    [pecas]
  );
  const doTipo = useMemo(() => pecas.filter((p) => e.tipos.length === 0 || e.tipos.includes(p.category || "Outros")), [pecas, e.tipos]);
  const fornecedores = useMemo(() => contar(doTipo, fornecedorDe).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [doTipo]);
  // Peças que ela vai ver uma a uma: do tipo e do fornecedor escolhidos, agrupadas por tipo.
  const candidatas = useMemo(
    () =>
      doTipo
        .filter((p) => e.fornecedores.length === 0 || e.fornecedores.includes(fornecedorDe(p)))
        .sort(
          (a, b) =>
            ORDEM_DOS_TIPOS.indexOf(a.category || "Outros") - ORDEM_DOS_TIPOS.indexOf(b.category || "Outros") ||
            (a.name ?? "").localeCompare(b.name ?? "", "pt-BR")
        ),
    [doTipo, e.fornecedores]
  );
  const porId = useMemo(() => new Map(pecas.map((p) => [p.id, p])), [pecas]);
  const proxima = candidatas.find((p) => !e.vistas.includes(p.id));
  const escolhidas = e.escolhidas.map((id) => porId.get(id)).filter((p): p is Product => !!p);

  function alternar(lista: string[], nome: string) {
    return lista.includes(nome) ? lista.filter((x) => x !== nome) : [...lista, nome];
  }

  function responder(entra: boolean) {
    if (!proxima) return;
    mudar({ vistas: [...e.vistas, proxima.id], escolhidas: entra ? [...e.escolhidas, proxima.id] : e.escolhidas });
  }

  // Ordem: toca numa peça e depois no lugar onde ela deve ficar (tocar de novo na mesma cancela).
  function tocarNaLinha(id: number, indice: number) {
    if (movendo === null) return setMovendo(id);
    if (movendo !== id) mudar({ escolhidas: moverPara(e.escolhidas, movendo, indice) });
    setMovendo(null);
  }

  // Tira a peça do catálogo; ela continua como "vista", para não aparecer de novo na escolha.
  function tirar(id: number) {
    if (movendo === id) setMovendo(null);
    mudar({ escolhidas: e.escolhidas.filter((x) => x !== id) });
  }

  function voltarUma() {
    const ultima = e.vistas[e.vistas.length - 1];
    if (ultima === undefined) return;
    mudar({ vistas: e.vistas.slice(0, -1), escolhidas: e.escolhidas.filter((id) => id !== ultima) });
  }

  async function enviar() {
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/modelos-catalogo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: e.nome, capa: e.capa, pecas: escolhidas.map((p) => p.id), tipos: e.tipos, fabricantes: e.fornecedores }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || "Não foi possível mandar. Confira a internet e tente de novo.");
      try {
        localStorage.removeItem(CHAVE);
      } catch {
        // nada a fazer
      }
      setE({ ...INICIAL, passo: "pronto", nome: e.nome });
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível mandar.");
    } finally {
      setEnviando(false);
    }
  }

  const titulo: Record<Passo, string> = {
    capa: "1. Escolha a capa",
    tipos: "2. Quais tipos de peça?",
    fornecedores: "3. De quais fornecedores?",
    pecas: "4. Escolha as peças",
    ordem: "5. Arrume a ordem",
    enviar: "6. Dê um nome e mande",
    pronto: "Catálogo enviado",
  };

  return (
    <div className="montar">
      <style>{`
        .montar{position:fixed;inset:0;z-index:50;overflow-y:auto;background:#FBF7F3;color:#2B1A12;font-family:system-ui,sans-serif}
        .montar .topo{position:sticky;top:0;z-index:2;background:#FBF7F3;padding:14px max(16px,env(safe-area-inset-left,0px)) 10px;border-bottom:1px solid #EADFD3}
        .montar h1{font-size:1.25rem;margin:0}
        .montar .sub{color:#7A6152;font-size:.9rem;margin-top:4px}
        .montar .corpo{padding:14px max(16px,env(safe-area-inset-left,0px)) 120px max(16px,env(safe-area-inset-right,0px));max-width:640px;margin:0 auto}
        .montar .capas{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .montar .capa{border:3px solid transparent;border-radius:10px;padding:0;overflow:hidden;background:#fff;cursor:pointer;aspect-ratio:297/210}
        .montar .capa img{width:100%;height:100%;object-fit:cover;display:block}
        .montar .capa.on{border-color:#22A33A}
        .montar .chips{display:flex;flex-wrap:wrap;gap:10px}
        .montar .chip{border:2px solid #D9C7B5;background:#fff;border-radius:999px;padding:12px 16px;font-size:1rem;cursor:pointer;color:#2B1A12}
        .montar .chip.on{border-color:#22A33A;background:#E9F7EC}
        .montar .chip small{color:#7A6152;margin-left:6px}
        .montar .rodape{position:fixed;left:0;right:0;bottom:0;z-index:3;background:#FBF7F3;border-top:1px solid #EADFD3;display:flex;gap:10px;
          padding:12px max(16px,env(safe-area-inset-right,0px)) max(12px,env(safe-area-inset-bottom,0px)) max(16px,env(safe-area-inset-left,0px))}
        .montar .bt{flex:1;border:0;border-radius:12px;padding:16px;font-size:1.05rem;font-weight:600;cursor:pointer}
        .montar .bt.ir{background:#2B1A12;color:#fff}
        .montar .bt.leve{background:#fff;color:#2B1A12;border:1px solid #D9C7B5;flex:0 0 auto}
        .montar .bt:disabled{opacity:.4;cursor:default}
        .montar .peca{background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 2px 10px rgba(40,25,15,.08)}
        .montar .peca .fotos{display:flex;gap:2px;height:52vh;background:#F4F0EC}
        .montar .peca .fotos img{flex:1;min-width:0;height:100%;object-fit:contain;background:#fff}
        .montar .peca .info{padding:10px 14px;font-size:.95rem}
        .montar .peca .info b{display:block}
        .montar .xv{display:flex;justify-content:center;align-items:center;gap:clamp(24px,10vw,56px);margin-top:16px}
        .montar .redondo{width:clamp(84px,24vw,104px);aspect-ratio:1;border-radius:50%;border:0;background:#fff;box-shadow:0 6px 20px rgba(40,25,15,.18);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
        .montar .redondo svg{width:50%;height:50%}
        .montar .volta{width:52px;height:52px;border-radius:50%;border:0;background:#fff;box-shadow:0 3px 12px rgba(40,25,15,.16);display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0}
        .montar .volta svg{width:24px;height:24px}
        .montar .volta:disabled{opacity:.3}
        .montar .linha{display:flex;align-items:center;gap:10px;background:#fff;border-radius:10px;padding:8px;margin-bottom:8px}
        .montar .linha .tocar{flex:1;min-width:0;display:flex;align-items:center;gap:10px;background:none;border:0;padding:0;text-align:left;font:inherit;color:inherit;cursor:pointer}
        .montar .linha img{width:64px;height:64px;object-fit:contain;background:#fff;border-radius:6px;flex:none}
        .montar .linha .n{flex:1;min-width:0;font-size:.9rem}
        .montar .linha.movendo{outline:3px solid #22A33A;background:#E9F7EC}
        .montar .linha.alvo{outline:1px dashed #22A33A}
        .montar .seta.tirar{color:#E0261B;border-color:#F0C4C0}
        .montar .linha .n span{color:#7A6152;font-size:.8rem;display:block}
        .montar .seta{width:44px;height:44px;border-radius:10px;border:1px solid #D9C7B5;background:#fff;font-size:1.2rem;cursor:pointer;flex:none}
        .montar .seta:disabled{opacity:.3}
        .montar input[type=text]{width:100%;font-size:1.1rem;padding:14px;border-radius:10px;border:1px solid #D9C7B5;box-sizing:border-box}
        .montar .aviso{color:#C8362E;margin-top:10px}
        .montar .resumo{background:#fff;border-radius:12px;padding:14px;margin-top:14px;line-height:1.6}
      `}</style>

      <div className="topo">
        <h1>{titulo[e.passo]}</h1>
        {e.passo === "pecas" && (
          <div className="sub">
            {e.escolhidas.length} escolhidas · faltam {candidatas.filter((p) => !e.vistas.includes(p.id)).length} para ver
          </div>
        )}
        {e.passo === "tipos" && <div className="sub">Toque para marcar. Sem marcar nenhum, entram todos.</div>}
        {e.passo === "fornecedores" && <div className="sub">Toque para marcar. Sem marcar nenhum, entram todos.</div>}
        {e.passo === "ordem" && <div className="sub">Toque numa peça e depois no lugar onde ela deve ficar. O ✕ tira a peça. A primeira abre o catálogo.</div>}
      </div>

      <div className="corpo">
        {carregando && <p>Carregando as peças…</p>}
        {!carregando && erro && <p className="aviso">{erro}</p>}

        {!carregando && e.passo === "capa" && (
          <div className="capas">
            {CAPAS.map((src, i) => (
              <button key={src} type="button" className={"capa" + (e.capa === src ? " on" : "")} onClick={() => mudar({ capa: src })} aria-label={`Capa ${i + 1}`} aria-pressed={e.capa === src}>
                <img src={src} alt={`Capa ${i + 1}`} />
              </button>
            ))}
          </div>
        )}

        {!carregando && e.passo === "tipos" && (
          <div className="chips">
            {tipos.map((t) => (
              <button key={t.nome} type="button" className={"chip" + (e.tipos.includes(t.nome) ? " on" : "")} onClick={() => mudar({ tipos: alternar(e.tipos, t.nome), fornecedores: [], vistas: [], escolhidas: [] })}>
                {t.nome}
                <small>{t.total}</small>
              </button>
            ))}
          </div>
        )}

        {!carregando && e.passo === "fornecedores" && (
          <div className="chips">
            {fornecedores.map((f) => (
              <button key={f.nome} type="button" className={"chip" + (e.fornecedores.includes(f.nome) ? " on" : "")} onClick={() => mudar({ fornecedores: alternar(e.fornecedores, f.nome), vistas: [], escolhidas: [] })}>
                {f.nome}
                <small>{f.total}</small>
              </button>
            ))}
          </div>
        )}

        {!carregando && e.passo === "pecas" && (
          <>
            {proxima ? (
              <div className="peca">
                <div className="fotos">
                  <img key={proxima.id + "f"} src={mini(proxima.photo_url)} alt={proxima.name ?? "Peça"} />
                  {proxima.modelo_photo_url && <img key={proxima.id + "m"} src={mini(proxima.modelo_photo_url)} alt="Na modelo" />}
                </div>
                <div className="info">
                  <b>{proxima.name}</b>
                  {proxima.category} · {fornecedorDe(proxima)}
                </div>
              </div>
            ) : (
              <div className="resumo">Você já viu todas as peças. Escolheu {e.escolhidas.length}. Toque em Próximo para arrumar a ordem.</div>
            )}
            <div className="xv">
              <button type="button" className="volta" onClick={voltarUma} disabled={e.vistas.length === 0} aria-label="Voltar para a peça anterior">
                <svg viewBox="0 0 24 24" fill="none" stroke="#8A7A70" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 14L4 9l5-5" />
                  <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
                </svg>
              </button>
              <button type="button" className="redondo" onClick={() => responder(false)} disabled={!proxima} aria-label="Não entra no catálogo">
                <svg viewBox="0 0 24 24" fill="none" stroke="#E0261B" strokeWidth="3.2" strokeLinecap="round">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              </button>
              <button type="button" className="redondo" onClick={() => responder(true)} disabled={!proxima} aria-label="Entra no catálogo">
                <svg viewBox="0 0 24 24" fill="none" stroke="#22A33A" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 12.5l5.5 5.5L20.5 6" />
                </svg>
              </button>
            </div>
          </>
        )}

        {!carregando && e.passo === "ordem" && (
          <div>
            {escolhidas.map((p, i) => (
              <div className={"linha" + (movendo === p.id ? " movendo" : "") + (movendo !== null && movendo !== p.id ? " alvo" : "")} key={p.id}>
                <button
                  type="button"
                  className="tocar"
                  onClick={() => tocarNaLinha(p.id, i)}
                  aria-label={movendo === null ? `Mover ${p.name}` : movendo === p.id ? "Cancelar" : `Colocar aqui, na posição ${i + 1}`}
                >
                  <img src={mini(p.photo_url, 200)} alt="" />
                  <span className="n">
                    {i + 1}. {p.name}
                    <span>{movendo === p.id ? "Agora toque no lugar onde ela deve ficar" : p.category}</span>
                  </span>
                </button>
                <button type="button" className="seta" aria-label={`Subir ${p.name}`} disabled={i === 0} onClick={() => mudar({ escolhidas: moverUmaCasa(e.escolhidas, p.id, -1) })}>
                  ▲
                </button>
                <button type="button" className="seta" aria-label={`Descer ${p.name}`} disabled={i === escolhidas.length - 1} onClick={() => mudar({ escolhidas: moverUmaCasa(e.escolhidas, p.id, 1) })}>
                  ▼
                </button>
                <button type="button" className="seta tirar" aria-label={`Tirar ${p.name} do catálogo`} onClick={() => tirar(p.id)}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {!carregando && e.passo === "enviar" && (
          <div>
            <label htmlFor="nome-catalogo" style={{ display: "block", marginBottom: 8 }}>
              Nome do catálogo
            </label>
            <input id="nome-catalogo" type="text" value={e.nome} placeholder="Ex.: Brincos de dezembro" onChange={(ev) => mudar({ nome: ev.target.value })} />
            <div className="resumo">
              Capa {CAPAS.indexOf(e.capa) + 1}
              <br />
              {escolhidas.length} peças, nesta ordem
              <br />
              {e.tipos.length ? e.tipos.join(", ") : "Todos os tipos"}
            </div>
            {erro && <p className="aviso">{erro}</p>}
          </div>
        )}

        {e.passo === "pronto" && (
          <div className="resumo">
            Pronto! O catálogo{e.nome ? ` "${e.nome}"` : ""} foi para o João. Ele abre no Radar e gera o PDF.
          </div>
        )}
      </div>

      {!carregando && (
        <div className="rodape">
          {e.passo === "capa" && (
            <button type="button" className="bt ir" onClick={() => mudar({ passo: "tipos" })}>
              Próximo
            </button>
          )}
          {e.passo === "tipos" && (
            <>
              <button type="button" className="bt leve" onClick={() => mudar({ passo: "capa" })}>Voltar</button>
              <button type="button" className="bt ir" onClick={() => mudar({ passo: "fornecedores" })}>Próximo</button>
            </>
          )}
          {e.passo === "fornecedores" && (
            <>
              <button type="button" className="bt leve" onClick={() => mudar({ passo: "tipos" })}>Voltar</button>
              <button type="button" className="bt ir" onClick={() => mudar({ passo: "pecas" })}>Próximo ({candidatas.length} peças)</button>
            </>
          )}
          {e.passo === "pecas" && (
            <>
              <button type="button" className="bt leve" onClick={() => mudar({ passo: "fornecedores" })}>Voltar</button>
              <button type="button" className="bt ir" disabled={e.escolhidas.length === 0} onClick={() => mudar({ passo: "ordem" })}>
                Terminar a seleção ({e.escolhidas.length})
              </button>
            </>
          )}
          {e.passo === "ordem" && (
            <>
              <button type="button" className="bt leve" onClick={() => mudar({ passo: "pecas" })}>Voltar</button>
              <button type="button" className="bt ir" disabled={e.escolhidas.length === 0} onClick={() => { setMovendo(null); mudar({ passo: "enviar" }); }}>Próximo</button>
            </>
          )}
          {e.passo === "enviar" && (
            <>
              <button type="button" className="bt leve" onClick={() => mudar({ passo: "ordem" })}>Voltar</button>
              <button type="button" className="bt ir" disabled={!e.nome.trim() || enviando || escolhidas.length === 0} onClick={enviar}>
                {enviando ? "Mandando…" : "Mandar para o João"}
              </button>
            </>
          )}
          {e.passo === "pronto" && (
            <button type="button" className="bt ir" onClick={() => mudar({ ...INICIAL })}>
              Montar outro catálogo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
