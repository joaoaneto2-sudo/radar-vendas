"use client";

import { useCallback, useEffect, useState } from "react";
import { formatDateBR } from "@/lib/format";
import { formatCentsBRL, toCents } from "@/lib/finance/money";
import type { CompraComPagamentos } from "@/lib/fund-db";

type Resumo = { enteredCents: number; paidCents: number; balanceCents: number; payableCents: number; balanceMinusPayableCents: number };
type Dados = { fund: Resumo; compras: CompraComPagamentos[] };

const reais = formatCentsBRL;

// Data de hoje no horário de Brasília (UTC-3), como AAAA-MM-DD.
function hojeISO(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function tomDoSaldo(centavos: number): "danger" | "accent" | undefined {
  return centavos < 0 ? "danger" : centavos > 0 ? "accent" : undefined;
}

export default function FundoPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroDeCarga, setErroDeCarga] = useState("");
  const [pagando, setPagando] = useState<CompraComPagamentos | null>(null);
  const [valor, setValor] = useState("");
  const [data, setData] = useState(hojeISO());
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    const res = await fetch("/api/fund");
    if (!res.ok) {
      setErroDeCarga("Não foi possível carregar o fundo.");
      return;
    }
    setDados(await res.json());
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirPagamento(c: CompraComPagamentos) {
    const falta = Math.max(c.amountCents - c.paidCents, 0);
    setPagando(c);
    setValor((falta / 100).toFixed(2).replace(".", ","));
    setData(hojeISO());
    setNota("");
    setErro("");
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (!pagando || salvando) return;
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/fund-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purchase_id: pagando.id, amount: valor, paid_date: data, notes: nota }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(d.message || "Não foi possível registrar. Tente novamente.");
        return;
      }
      setPagando(null);
      setAviso(Array.isArray(d.avisos) && d.avisos.length > 0 ? `Pagamento registrado. Atenção: ${d.avisos.join(" ")}` : "Pagamento registrado.");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function desfazer(pagamentoId: number) {
    if (!window.confirm("Desfazer este pagamento do fundo? O valor volta para \"falta pagar\".")) return;
    const res = await fetch(`/api/fund-payments/${pagamentoId}`, { method: "DELETE" });
    if (res.ok) {
      setAviso("Pagamento desfeito.");
      await carregar();
    } else {
      window.alert("Não foi possível desfazer. Tente novamente.");
    }
  }

  if (!dados) {
    return (
      <main className="shell shell--wide">
        <div className="loading-state">{erroDeCarga || "Carregando..."}</div>
      </main>
    );
  }

  const { fund, compras } = dados;

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Financeiro</p>
        <h1>Fundo de reposição</h1>
        <p>
          A cada venda de varejo e consignado, 30% vai para o fundo. É esse dinheiro que paga as compras novas de estoque. Aqui você
          lança quanto do fundo pagou de cada compra de reposição. As compras de reposição vêm das faturas do cartão (parte
          "reposição").
        </p>
      </div>

      {aviso && (
        <div className="banner banner-info" role="status">
          <span>✅</span>
          <span>{aviso}</span>
        </div>
      )}

      <div className="stat-grid auto" style={{ marginBottom: 18 }}>
        <div className="stat-tile accent">
          <div className="label">Entrou no fundo</div>
          <div className="value">{reais(fund.enteredCents)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Já usado para pagar reposições</div>
          <div className="value">{reais(fund.paidCents)}</div>
        </div>
        <div className={"stat-tile" + (tomDoSaldo(fund.balanceCents) ? ` ${tomDoSaldo(fund.balanceCents)}` : "")}>
          <div className="label">Saldo do fundo</div>
          <div className="value">{reais(fund.balanceCents)}</div>
        </div>
        <div className="stat-tile gold">
          <div className="label">Reposições ainda a pagar</div>
          <div className="value">{reais(fund.payableCents)}</div>
        </div>
        <div className={"stat-tile" + (tomDoSaldo(fund.balanceMinusPayableCents) ? ` ${tomDoSaldo(fund.balanceMinusPayableCents)}` : "")}>
          <div className="label">Fundo menos reposições a pagar</div>
          <div className="value">{reais(fund.balanceMinusPayableCents)}</div>
          <div className="stat-note">{fund.balanceMinusPayableCents < 0 ? "O fundo ainda não cobre as compras" : "O fundo cobre as compras"}</div>
        </div>
      </div>

      {compras.length === 0 ? (
        <div className="empty-state">
          Nenhuma compra de reposição ainda. Elas aparecem aqui quando você lança uma fatura do cartão com a parte "reposição".
        </div>
      ) : (
        <div className="table-wrap tabela-cabe">
          <table>
            <thead>
              <tr>
                <th>Compra</th>
                <th>Valor</th>
                <th>Pago pelo fundo</th>
                <th>Falta pagar</th>
                <th>Situação</th>
                <th>Pagamentos</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {compras.map((c) => {
                const falta = c.amountCents - c.paidCents;
                const situacao = falta <= 0 ? { texto: "Paga", classe: "ok" } : c.paidCents > 0 ? { texto: "Parcial", classe: "low" } : { texto: "A pagar", classe: "out" };
                return (
                  <tr key={c.id}>
                    <td>
                      {c.description}
                      {c.purchase_date && <div className="hint">{formatDateBR(c.purchase_date)}</div>}
                    </td>
                    <td className="num">{reais(c.amountCents)}</td>
                    <td className="num">{reais(c.paidCents)}</td>
                    <td className="num">{reais(Math.max(falta, 0))}</td>
                    <td>
                      <span className={`stock-pill ${situacao.classe}`}>{situacao.texto}</span>
                    </td>
                    <td>
                      {c.payments.length === 0
                        ? "-"
                        : c.payments.map((p) => (
                            <div key={p.id} className="hint">
                              {formatDateBR(p.paid_date)} · {reais(toCents(p.amount))}
                              {p.notes ? ` · ${p.notes}` : ""}{" "}
                              <button type="button" className="icon-btn danger" onClick={() => desfazer(p.id)}>
                                Desfazer
                              </button>
                            </div>
                          ))}
                    </td>
                    <td>
                      {falta > 0 ? (
                        <button type="button" className="btn btn-primary btn-small" onClick={() => abrirPagamento(c)}>
                          Pagar com o fundo
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pagando && (
        <div className="modal-overlay" onClick={() => setPagando(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>Pagar com o fundo</h2>
              <button type="button" className="icon-btn" onClick={() => setPagando(null)}>
                Fechar
              </button>
            </div>
            <p className="hint" style={{ marginBottom: 12 }}>
              {pagando.description}. Falta pagar {reais(Math.max(pagando.amountCents - pagando.paidCents, 0))}.
            </p>
            <form onSubmit={registrar}>
              <div className="form-grid">
                <div className="field">
                  <label>Valor pago pelo fundo (R$)</label>
                  <input type="text" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Data do pagamento</label>
                  <input type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} required />
                </div>
                <div className="field field--full">
                  <label>Observação (opcional)</label>
                  <input type="text" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Ex: pago por Pix ao fornecedor" />
                </div>
              </div>
              {erro && (
                <div className="banner banner-warning" role="alert">
                  <span>⚠️</span>
                  <span>{erro}</span>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setPagando(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? "Salvando..." : "Registrar pagamento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
