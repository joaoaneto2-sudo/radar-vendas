"use client";

// Subir peças das pastas: lê o lote publicado em /estoque/lote-oito-pastas.json (peças das pastas de
// fornecedor, com foto close e foto da modelo), mostra um ensaio do que seria criado ou atualizado
// e só grava depois de você confirmar. Valor da pasta = custo; preço de varejo = custo x 2,5.

import { useEffect, useMemo, useState } from "react";
import { formatBRL } from "@/lib/format";
import type { ResultadoDoLote } from "@/lib/importar-lote";

type ItemDoJson = { fabricante: string; nome: string; custo: number };
type Lote = { itens: ItemDoJson[] };

export default function ImportarLotePage() {
  const [lote, setLote] = useState<Lote | null>(null);
  const [erroDeCarga, setErroDeCarga] = useState("");
  const [ensaio, setEnsaio] = useState<ResultadoDoLote | null>(null);
  const [feito, setFeito] = useState<ResultadoDoLote | null>(null);
  const [trabalhando, setTrabalhando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    fetch("/estoque/lote-oito-pastas.json")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setLote)
      .catch(() => setErroDeCarga("Não encontrei o lote de peças. Tente atualizar a página."));
  }, []);

  const porFabricante = useMemo(() => {
    const mapa = new Map<string, { pecas: number; custo: number }>();
    for (const it of lote?.itens ?? []) {
      const atual = mapa.get(it.fabricante) ?? { pecas: 0, custo: 0 };
      atual.pecas++;
      atual.custo += it.custo;
      mapa.set(it.fabricante, atual);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));
  }, [lote]);

  async function enviar(confirmar: boolean) {
    if (!lote || trabalhando) return;
    setTrabalhando(true);
    setErro("");
    try {
      const res = await fetch("/api/importar-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...lote, confirmar }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(d.message || "Não foi possível importar. Nada foi gravado.");
        return;
      }
      if (confirmar) {
        setFeito(d as ResultadoDoLote);
        setEnsaio(null);
      } else {
        setEnsaio(d as ResultadoDoLote);
      }
    } finally {
      setTrabalhando(false);
    }
  }

  function gravar() {
    if (!ensaio) return;
    const ok = window.confirm(
      `Gravar agora?\n\n${ensaio.criadas} peça(s) nova(s) e ${ensaio.atualizadas} atualizada(s).\n` +
        `Peça nova entra com 1 unidade e preço de varejo = custo x 2,5. Peça que já existe só ganha as fotos e o catálogo; o estoque não muda.`
    );
    if (ok) enviar(true);
  }

  const resultado = feito ?? ensaio;
  const avisos = (resultado?.itens ?? []).filter((i) => i.aviso);

  if (!lote) {
    return (
      <main className="shell shell--wide">
        <div className="loading-state">{erroDeCarga || "Carregando..."}</div>
      </main>
    );
  }

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Cadastros</p>
        <h1>Subir peças das pastas</h1>
        <p>
          As {lote.itens.length} peças das pastas de fornecedor, com a foto de close e a foto da modelo. O valor que está na pasta é o custo e o preço de
          varejo é o custo vezes 2,5. Primeiro você confere, depois grava.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginBottom: 8 }}>O que vai neste lote</h2>
        <div className="table-wrap tabela-cabe">
          <table>
            <thead>
              <tr>
                <th>Fabricante (pasta)</th>
                <th>Peças</th>
                <th>Custo total</th>
              </tr>
            </thead>
            <tbody>
              {porFabricante.map(([nome, v]) => (
                <tr key={nome}>
                  <td>{nome}</td>
                  <td className="num">{v.pecas}</td>
                  <td className="num">{formatBRL(v.custo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!feito && (
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={() => enviar(false)} disabled={trabalhando}>
              {trabalhando && !ensaio ? "Conferindo..." : ensaio ? "Conferir de novo" : "1. Conferir antes de gravar"}
            </button>
          </div>
        )}
      </div>

      {erro && (
        <div className="banner banner-warning" role="alert" style={{ marginBottom: 16 }}>
          <span>⚠️</span>
          <span>{erro}</span>
        </div>
      )}

      {resultado && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginBottom: 8 }}>
            {feito ? "Pronto, foi gravado" : "Conferência (nada foi gravado ainda)"}
          </h2>
          <div className="stat-grid auto" style={{ marginBottom: 10 }}>
            <div className="stat-tile">
              <div className="label">{feito ? "Peças novas criadas" : "Peças novas que seriam criadas"}</div>
              <div className="value">{resultado.criadas}</div>
            </div>
            <div className="stat-tile">
              <div className="label">{feito ? "Peças atualizadas" : "Peças que seriam atualizadas"}</div>
              <div className="value">{resultado.atualizadas}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Fabricantes novos</div>
              <div className="value">{resultado.fabricantesCriados.length}</div>
              <div className="stat-note">{resultado.fabricantesCriados.join(", ") || "nenhum"}</div>
            </div>
          </div>

          {resultado.fabricantesParecidos.length > 0 && (
            <div className="banner banner-info" role="status" style={{ marginBottom: 10 }}>
              <span>ℹ️</span>
              <span>
                Usei o fabricante que já existia, com grafia quase igual:{" "}
                {resultado.fabricantesParecidos.map((f) => `"${f.pasta}" na pasta e "${f.existente}" no Radar`).join("; ")}.
              </span>
            </div>
          )}

          {avisos.length > 0 && (
            <>
              <h3 style={{ margin: "10px 0 6px" }}>Avisos para você olhar ({avisos.length})</h3>
              <div className="table-wrap tabela-cabe">
                <table>
                  <thead>
                    <tr>
                      <th>Fabricante</th>
                      <th>Peça</th>
                      <th>Aviso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {avisos.map((i) => (
                      <tr key={i.id}>
                        <td>{i.fabricante}</td>
                        <td>{i.nome}</td>
                        <td>{i.aviso}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {resultado.criadas > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer" }}>Ver as {resultado.criadas} peças novas</summary>
              <ul style={{ margin: "8px 0 0 18px" }}>
                {resultado.itens
                  .filter((i) => i.acao === "criada")
                  .map((i) => (
                    <li key={i.id}>
                      {i.fabricante}: {i.nome}
                    </li>
                  ))}
              </ul>
            </details>
          )}

          {!feito && (
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={gravar} disabled={trabalhando}>
                {trabalhando ? "Gravando..." : `2. Gravar (${resultado.criadas} novas e ${resultado.atualizadas} atualizadas)`}
              </button>
            </div>
          )}
          {feito && (
            <div className="modal-actions">
              <a className="btn btn-primary" href="/cadastros/catalogo">
                Ir para Criar catálogo
              </a>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
