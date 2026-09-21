"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CAMPOS_DO_ACORDO,
  CHAVES_DO_PEDIDO,
  ROTULOS,
  dividaDoJoao,
  textoDaMudanca,
  validarAcordo,
  type AcordoValores,
  type CampoDoAcordo,
  type Mudanca,
} from "@/lib/agreement";
import type { LinhaDoHistorico } from "@/lib/agreement-db";
import { formatDateBR } from "@/lib/format";
import { formatCentsBRL } from "@/lib/finance/money";
import FaixaDoAcordo from "../../faixa-do-acordo";
import type { EntradaDoResumo } from "@/lib/acordo-resumo";

type Apurado = { cents: number; pieces: number; products: number; semData: number; semQuantidade: number; semCusto: number };
type Dados = {
  valores: AcordoValores;
  cascadeMode: "recebimento" | "venda";
  dividaCents: number;
  divida: EntradaDoResumo["debt"];
  apurado: Apurado;
  historico: LinhaDoHistorico[];
};

const reais = formatCentsBRL;

// O que aparece nos campos de texto (com vírgula, do jeito brasileiro).
function paraCampo(campo: CampoDoAcordo, v: AcordoValores): string {
  if (campo === "partnershipStart") return v.partnershipStart;
  if (campo === "initialStockCents") return (v.initialStockCents / 100).toFixed(2).replace(".", ",");
  return String(v[campo]).replace(".", ",");
}

function formularioDe(v: AcordoValores): Record<CampoDoAcordo, string> {
  return Object.fromEntries(CAMPOS_DO_ACORDO.map((c) => [c, paraCampo(c, v)])) as Record<CampoDoAcordo, string>;
}

function quando(iso: string): string {
  const d = new Date(iso);
  const dia = formatDateBR(new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bahia" });
  return `${dia} às ${hora}`;
}

const CAMPOS_DE_PORCENTAGEM: CampoDoAcordo[] = ["retailPct", "consignmentPct", "wholesalePct", "joaoSharePct"];

export default function AcordoPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroDeCarga, setErroDeCarga] = useState("");
  const [form, setForm] = useState<Record<CampoDoAcordo, string> | null>(null);
  const [confirmando, setConfirmando] = useState<Mudanca[] | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/agreement");
    if (!res.ok) {
      setErroDeCarga("Não foi possível carregar os parâmetros.");
      return;
    }
    const d: Dados = await res.json();
    setDados(d);
    setForm(formularioDe(d.valores));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!dados || !form) {
    return (
      <main className="shell shell--wide">
        <div className="loading-state">{erroDeCarga || "Carregando..."}</div>
      </main>
    );
  }

  const { valores, apurado, historico } = dados;
  const entrada = Object.fromEntries(CAMPOS_DO_ACORDO.map((c) => [CHAVES_DO_PEDIDO[c], form[c]]));
  const conferido = validarAcordo(entrada, valores);
  const mudou = conferido.ok;
  const ultimaAtiva = historico.find((h) => !h.revertedAt);
  const faltaNoApurado = apurado.semData + apurado.semQuantidade + apurado.semCusto;

  function mexer(campo: CampoDoAcordo, texto: string) {
    setForm((f) => (f ? { ...f, [campo]: texto } : f));
    setErro("");
    setAviso("");
  }

  function pedirConfirmacao(e: React.FormEvent) {
    e.preventDefault();
    setAviso("");
    if (!conferido.ok) {
      setErro(conferido.error === "no_changes" ? "Você ainda não mudou nada." : conferido.message);
      return;
    }
    setErro("");
    setConfirmando(conferido.mudancas);
  }

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    try {
      const res = await fetch("/api/agreement", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...entrada, confirmar: true }),
      });
      const d = await res.json().catch(() => ({}));
      setConfirmando(null);
      if (!res.ok) {
        setErro(d.message || "Não foi possível salvar. Tente novamente.");
        return;
      }
      setAviso("Parâmetros salvos. Todas as contas já usam os valores novos.");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function desfazer() {
    if (!ultimaAtiva) return;
    const resumo = ultimaAtiva.changes.map(textoDaMudanca).join("; ");
    if (!window.confirm(`Desfazer a última mudança?\n\n${resumo}\n\nOs valores voltam para o que eram antes.`)) return;
    const res = await fetch("/api/agreement/desfazer", { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(d.message || "Não foi possível desfazer.");
      return;
    }
    setErro("");
    setAviso("Mudança desfeita. Os valores voltaram ao que eram.");
    await carregar();
  }

  function usarApurado() {
    mexer("initialStockCents", (apurado.cents / 100).toFixed(2).replace(".", ","));
  }

  const dividaNova = conferido.ok ? dividaDoJoao(conferido.valores.initialStockCents, conferido.valores.joaoSharePct) : dados.dividaCents;

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Financeiro</p>
        <h1>Parâmetros do acordo</h1>
        <p>
          Os números combinados entre João e Fernanda. Eles mandam em todas as contas do sistema (lucro, dívida e divisão), inclusive nas vendas
          antigas. Toda mudança fica registrada no histórico e pode ser desfeita.
        </p>
      </div>

      <FaixaDoAcordo
        semLink
        dados={{ joaoSharePct: valores.joaoSharePct, initialStockCents: valores.initialStockCents, partnershipStart: valores.partnershipStart, debt: dados.divida }}
      />

      {aviso && (
        <div className="banner banner-info" role="status">
          <span>✅</span>
          <span>{aviso}</span>
        </div>
      )}

      <div className="stat-grid auto" style={{ marginBottom: 18 }}>
        <div className="stat-tile">
          <div className="label">{ROTULOS.partnershipStart}</div>
          <div className="value">{formatDateBR(valores.partnershipStart)}</div>
        </div>
        <div className="stat-tile accent">
          <div className="label">Reposição do varejo</div>
          <div className="value">{valores.retailPct}%</div>
          <div className="stat-note">
            Consignado {valores.consignmentPct}% · Atacado {valores.wholesalePct}%
          </div>
        </div>
        <div className="stat-tile">
          <div className="label">{ROTULOS.joaoSharePct}</div>
          <div className="value">{valores.joaoSharePct}%</div>
        </div>
        <div className="stat-tile">
          <div className="label">{ROTULOS.initialStockCents}</div>
          <div className="value">{reais(valores.initialStockCents)}</div>
        </div>
        <div className="stat-tile gold">
          <div className="label">Dívida do João com a Fernanda</div>
          <div className="value">{reais(dados.dividaCents)}</div>
          <div className="stat-note">
            {valores.joaoSharePct}% de {reais(valores.initialStockCents)}
          </div>
        </div>
      </div>

      <form onSubmit={pedirConfirmacao} className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", marginBottom: 10 }}>Mudar os valores</h2>
        <div className="form-grid">
          <div className="field">
            <label>{ROTULOS.partnershipStart}</label>
            <input type="date" value={form.partnershipStart} onChange={(e) => mexer("partnershipStart", e.target.value)} required />
          </div>
          {CAMPOS_DE_PORCENTAGEM.map((campo) => (
            <div className="field" key={campo}>
              <label>{ROTULOS[campo]} (%)</label>
              <input type="text" inputMode="decimal" value={form[campo]} onChange={(e) => mexer(campo, e.target.value)} required />
            </div>
          ))}
          <div className="field">
            <label>{ROTULOS.initialStockCents} (R$)</label>
            <input type="text" inputMode="decimal" value={form.initialStockCents} onChange={(e) => mexer("initialStockCents", e.target.value)} required />
          </div>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          Como a reposição é calculada (na venda ou no recebimento):{" "}
          <strong>{dados.cascadeMode === "venda" ? "na venda" : "no recebimento"}</strong>. Isso só se muda por dentro do sistema.
        </p>

        {mudou && (
          <div className="banner banner-info" role="status" style={{ marginTop: 12 }}>
            <span>ℹ️</span>
            <span>
              A dívida do João ficaria em <strong>{reais(dividaNova)}</strong> (hoje {reais(dados.dividaCents)}).
            </span>
          </div>
        )}
        {erro && (
          <div className="banner banner-warning" role="alert" style={{ marginTop: 12 }}>
            <span>⚠️</span>
            <span>{erro}</span>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={!mudou} onClick={() => setForm(formularioDe(valores))}>
            Descartar
          </button>
          <button type="submit" className="btn btn-primary" disabled={!mudou}>
            Revisar e salvar
          </button>
        </div>
      </form>

      <div className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", marginBottom: 6 }}>Estoque inicial apurado pelo cadastro</h2>
        <p className="hint" style={{ marginBottom: 10 }}>
          Soma de custo × quantidade das peças compradas antes de {formatDateBR(valores.partnershipStart)} ({apurado.products}{" "}
          {apurado.products === 1 ? "cadastro" : "cadastros"}, {apurado.pieces} {apurado.pieces === 1 ? "peça" : "peças"}). Peças de atacado
          ficam de fora, porque são do fabricante.
        </p>
        <div className="stat-grid auto" style={{ marginBottom: 10 }}>
          <div className="stat-tile">
            <div className="label">Valor apurado</div>
            <div className="value">{reais(apurado.cents)}</div>
            <div className="stat-note">{apurado.cents === valores.initialStockCents ? "Igual ao valor em uso" : `Em uso: ${reais(valores.initialStockCents)}`}</div>
          </div>
        </div>
        {faltaNoApurado > 0 && (
          <div className="banner banner-warning" role="status">
            <span>⚠️</span>
            <span>
              O valor ainda está incompleto:{" "}
              {[
                apurado.semData > 0 && `${apurado.semData} ${apurado.semData === 1 ? "peça sem data" : "peças sem data"} de compra (ficam de fora)`,
                apurado.semQuantidade > 0 && `${apurado.semQuantidade} sem quantidade comprada`,
                apurado.semCusto > 0 && `${apurado.semCusto} sem custo`,
              ]
                .filter(Boolean)
                .join("; ")}
              . Complete o cadastro dos produtos antes de usar este valor.
            </span>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={apurado.cents === valores.initialStockCents} onClick={usarApurado}>
            Usar o valor apurado ({reais(apurado.cents)})
          </button>
        </div>
        <p className="hint">O botão só coloca o valor no campo acima. Nada muda até você revisar e salvar.</p>
      </div>

      <div className="card">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem", marginBottom: 10 }}>Histórico de mudanças</h2>
        {historico.length === 0 ? (
          <div className="empty-state">Nenhuma mudança feita por aqui ainda.</div>
        ) : (
          <div className="table-wrap tabela-cabe">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Quem</th>
                  <th>O que mudou</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td>{quando(h.changedAt)}</td>
                    <td>{h.changedByName ?? "-"}</td>
                    <td>
                      {h.changes.map((m) => (
                        <div key={m.campo}>{textoDaMudanca(m)}</div>
                      ))}
                    </td>
                    <td>
                      {h.revertedAt ? (
                        <span className="hint">
                          Desfeita por {h.revertedByName ?? "-"} em {quando(h.revertedAt)}
                        </span>
                      ) : h.id === ultimaAtiva?.id ? (
                        <button type="button" className="icon-btn danger" onClick={desfazer}>
                          Desfazer
                        </button>
                      ) : (
                        <span className="hint">Em uso</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {confirmando && (
        <div className="modal-overlay" onClick={() => setConfirmando(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>Confirmar mudança</h2>
              <button type="button" className="icon-btn" onClick={() => setConfirmando(null)}>
                Fechar
              </button>
            </div>
            <ul style={{ margin: "0 0 12px 18px" }}>
              {confirmando.map((m) => (
                <li key={m.campo}>{textoDaMudanca(m)}</li>
              ))}
            </ul>
            <div className="banner banner-warning" role="alert">
              <span>⚠️</span>
              <span>
                Isso muda o lucro, a dívida e a divisão de tudo, das vendas antigas também. Dá para desfazer depois pelo histórico.
              </span>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmando(null)}>
                Voltar
              </button>
              <button type="button" className="btn btn-primary" disabled={salvando} onClick={salvar}>
                {salvando ? "Salvando..." : "Confirmar e salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
