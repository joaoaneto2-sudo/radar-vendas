"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ROTULO_DO_TIPO, quandoBR, type Evento, type TipoDeRegistro } from "@/lib/change-log";

const TIPOS = Object.keys(ROTULO_DO_TIPO) as TipoDeRegistro[];

const COR_DA_ACAO: Record<Evento["acao"], string> = {
  editada: "low",
  apagada: "out",
  cancelada: "out",
  reativada: "ok",
};

export default function HistoricoPage() {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [erro, setErro] = useState("");
  const [tipo, setTipo] = useState<"todos" | TipoDeRegistro>("todos");
  const [pessoa, setPessoa] = useState("todas");

  const [aviso, setAviso] = useState("");
  const [problema, setProblema] = useState("");
  const [desfazendo, setDesfazendo] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/changes");
      if (!res.ok) throw new Error();
      setEventos((await res.json()).eventos);
    } catch {
      setErro("Não foi possível carregar o histórico.");
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function desfazer(e: Evento) {
    if (desfazendo !== null) return;
    const o = e.acao === "apagada" ? "O registro volta para o sistema." : "Os valores voltam ao que eram antes.";
    if (!window.confirm(`Desfazer esta mudança?

${e.titulo}

${o}`)) return;
    setDesfazendo(e.logId);
    setAviso("");
    setProblema("");
    try {
      const res = await fetch(`/api/changes/${e.logId}/desfazer`, { method: "POST" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setProblema(d.message || "Não foi possível desfazer. Tente novamente.");
      else setAviso("Mudança desfeita.");
      await carregar();
    } finally {
      setDesfazendo(null);
    }
  }

  const pessoas = useMemo(() => Array.from(new Set((eventos ?? []).map((e) => e.userName ?? "Sem identificação"))).sort(), [eventos]);
  const visiveis = useMemo(
    () =>
      (eventos ?? []).filter(
        (e) => (tipo === "todos" || e.tipo === tipo) && (pessoa === "todas" || (e.userName ?? "Sem identificação") === pessoa)
      ),
    [eventos, tipo, pessoa]
  );

  if (!eventos) {
    return (
      <main className="shell shell--wide">
        <div className="loading-state">{erro || "Carregando..."}</div>
      </main>
    );
  }

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Financeiro</p>
        <h1>Histórico de alterações</h1>
        <p>
          Tudo o que foi editado ou apagado em vendas, parcelas, recebimentos, despesas, faturas do cartão e pagamentos do fundo: quem fez,
          quando, e o que era antes. Mostra as 200 mudanças mais recentes. Criar um lançamento novo não entra aqui. O botão Desfazer aparece nas mudanças simples (despesas, recebimentos, pagamentos do fundo e parcelas marcadas como recebidas). Vendas e faturas ainda não.
        </p>
      </div>

      {aviso && (
        <div className="banner banner-info" role="status">
          <span>✅</span>
          <span>{aviso}</span>
        </div>
      )}
      {problema && (
        <div className="banner banner-warning" role="alert">
          <span>⚠️</span>
          <span>{problema}</span>
        </div>
      )}

      <div className="form-grid" style={{ marginBottom: 14 }}>
        <div className="field">
          <label>Tipo de registro</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as "todos" | TipoDeRegistro)}>
            <option value="todos">Todos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {ROTULO_DO_TIPO[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Quem fez</label>
          <select value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
            <option value="todas">Todos</option>
            {pessoas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visiveis.length === 0 ? (
        <div className="empty-state">
          {eventos.length === 0 ? "Nenhuma alteração registrada ainda. As próximas edições e exclusões aparecem aqui." : "Nenhuma alteração com esses filtros."}
        </div>
      ) : (
        <div className="hist-lista">
          {visiveis.map((e) => (
            <article className="hist-item" key={e.logId}>
              <header>
                <span className={`stock-pill ${COR_DA_ACAO[e.acao]}`}>{e.acao.charAt(0).toUpperCase() + e.acao.slice(1)}</span>
                <span className="hint">
                  {quandoBR(e.at)} · {e.userName ?? "Sem identificação"}
                </span>
              </header>
              <h3>{e.titulo}</h3>
              {e.desfeita && (
                <p className="hint">
                  Desfeita por {e.desfeita.por ?? "sem identificação"} em {quandoBR(e.desfeita.em)}.
                </p>
              )}

              {e.alteracoes.length > 0 && (
                <ul className="hist-mudancas">
                  {e.alteracoes.map((a) => (
                    <li key={a.rotulo}>
                      <strong>{a.rotulo}:</strong> {a.antes} <span aria-hidden="true">→</span> {a.depois}
                    </li>
                  ))}
                </ul>
              )}

              {e.apagado.length > 0 && (
                <details>
                  <summary>O que existia</summary>
                  <ul className="hist-mudancas">
                    {e.apagado.map((c) => (
                      <li key={c.rotulo}>
                        <strong>{c.rotulo}:</strong> {c.valor}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {e.relacionados.length > 0 && (
                <details>
                  <summary>{`Junto com isso (${e.relacionados.length})`}</summary>
                  <ul className="hist-mudancas">
                    {e.relacionados.map((r, i) => (
                      <li key={i}>
                        {r.titulo} <span className="hint">({r.acao})</span>
                        {r.alteracoes.map((a) => (
                          <div key={a.rotulo}>
                            <strong>{a.rotulo}:</strong> {a.antes} <span aria-hidden="true">→</span> {a.depois}
                          </div>
                        ))}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {e.desfazivel && (
                <div className="row-actions" style={{ marginTop: 10 }}>
                  <button type="button" className="icon-btn danger" disabled={desfazendo !== null} onClick={() => desfazer(e)}>
                    {desfazendo === e.logId ? "Desfazendo..." : "Desfazer"}
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
