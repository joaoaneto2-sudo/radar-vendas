"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateBR } from "@/lib/format";
import { formatCentsBRL, toCents } from "@/lib/finance/money";
import { centsOrZero } from "@/lib/sale-finance";
import {
  EXPENSE_CATEGORIES,
  INVOICE_STATUS_LABELS,
  NATURE_HINTS,
  NATURE_LABELS,
  type InvoiceStatus,
} from "@/lib/expenses";
import type { InvoiceNature } from "@/lib/finance/invoice";

type Despesa = {
  id: number;
  expense_date: string;
  description: string;
  category: string | null;
  amount: string;
  notes: string | null;
  invoice_id: number | null;
  invoice_description: string | null;
};

type Parte = { id: number; nature: InvoiceNature; description: string | null; amount: string };
type Fatura = {
  id: number;
  description: string;
  due_date: string;
  closing_date: string | null;
  total_amount: string | null;
  status: InvoiceStatus;
  paid_date: string | null;
  notes: string | null;
  parts: Parte[];
};

type ParteForm = { id: number | null; nature: InvoiceNature; description: string; amount: string };
type FaturaForm = {
  description: string;
  due_date: string;
  closing_date: string;
  total_amount: string;
  status: InvoiceStatus;
  paid_date: string;
  notes: string;
  parts: ParteForm[];
};

const NATURES: InvoiceNature[] = ["pessoal_fernanda", "estoque_inicial", "reposicao", "despesa_empresa"];

function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const numero = (v: unknown) => (v === null || v === undefined || v === "" ? "" : String(Number(v)));

function faturaVazia(): FaturaForm {
  return {
    description: "",
    due_date: "",
    closing_date: "",
    total_amount: "",
    status: "aguardando_fechamento",
    paid_date: "",
    notes: "",
    parts: NATURES.map((n) => ({ id: null, nature: n, description: "", amount: "" })),
  };
}

function faturaParaForm(f: Fatura): FaturaForm {
  return {
    description: f.description,
    due_date: f.due_date,
    closing_date: f.closing_date ?? "",
    total_amount: numero(f.total_amount),
    status: f.status,
    paid_date: f.paid_date ?? "",
    notes: f.notes ?? "",
    parts: f.parts.map((p) => ({ id: p.id, nature: p.nature, description: p.description ?? "", amount: numero(p.amount) })),
  };
}

export default function DespesasPage() {
  const [aba, setAba] = useState<"despesas" | "faturas">("despesas");
  const [despesas, setDespesas] = useState<Despesa[]>([]);
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [carregando, setCarregando] = useState(true);

  function carregar() {
    Promise.all([fetch("/api/expenses").then((r) => r.json()), fetch("/api/card-invoices").then((r) => r.json())])
      .then(([d, f]) => {
        setDespesas(d.items || []);
        setFaturas(f.items || []);
      })
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Financeiro</p>
        <h1>Despesas e faturas do cartão</h1>
        <p>
          Despesas da empresa saem do lucro antes da divisão. Se a empresa não tiver lucro no dia, ficam a compensar nos
          próximos lucros. A fatura do cartão se divide em partes que precisam somar o total.
        </p>
      </div>

      <div className="tabs">
        <button className={"tab-btn" + (aba === "despesas" ? " active" : "")} onClick={() => setAba("despesas")}>
          Despesas ({despesas.length})
        </button>
        <button className={"tab-btn" + (aba === "faturas" ? " active" : "")} onClick={() => setAba("faturas")}>
          Faturas do cartão ({faturas.length})
        </button>
      </div>

      {carregando ? (
        <div className="loading-state">Carregando...</div>
      ) : aba === "despesas" ? (
        <DespesasAba despesas={despesas} recarregar={carregar} verFaturas={() => setAba("faturas")} />
      ) : (
        <FaturasAba faturas={faturas} recarregar={carregar} />
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------

function DespesasAba({ despesas, recarregar, verFaturas }: { despesas: Despesa[]; recarregar: () => void; verFaturas: () => void }) {
  const [editando, setEditando] = useState<Despesa | "nova" | null>(null);
  const [form, setForm] = useState({ expense_date: hojeISO(), description: "", category: "", amount: "", notes: "" });
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const totais = useMemo(() => {
    const soma = (l: Despesa[]) => l.reduce((t, d) => t + toCents(d.amount), 0);
    return { total: soma(despesas), manuais: soma(despesas.filter((d) => !d.invoice_id)), dasFaturas: soma(despesas.filter((d) => d.invoice_id)) };
  }, [despesas]);

  function abrir(d: Despesa | "nova") {
    setErro("");
    setForm(
      d === "nova"
        ? { expense_date: hojeISO(), description: "", category: "", amount: "", notes: "" }
        : { expense_date: d.expense_date, description: d.description, category: d.category ?? "", amount: numero(d.amount), notes: d.notes ?? "" }
    );
    setEditando(d);
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro("");
    try {
      const nova = editando === "nova";
      const res = await fetch(nova ? "/api/expenses" : `/api/expenses/${(editando as Despesa).id}`, {
        method: nova ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const dados = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditando(null);
        recarregar();
      } else setErro(dados.message || "Não foi possível salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(d: Despesa) {
    if (!window.confirm(`Apagar a despesa "${d.description}"? Isso muda as contas do painel financeiro.`)) return;
    const res = await fetch(`/api/expenses/${d.id}`, { method: "DELETE" });
    if (res.ok) recarregar();
    else window.alert((await res.json().catch(() => ({}))).message || "Não foi possível apagar.");
  }

  return (
    <div>
      <div className="stat-grid auto" style={{ marginBottom: 16 }}>
        <div className="stat-tile accent">
          <div className="label">Total de despesas</div>
          <div className="value">{formatCentsBRL(totais.total)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Lançadas aqui</div>
          <div className="value">{formatCentsBRL(totais.manuais)}</div>
        </div>
        <div className="stat-tile">
          <div className="label">Vindas de faturas</div>
          <div className="value">{formatCentsBRL(totais.dasFaturas)}</div>
          <div className="stat-note">Editam-se na fatura</div>
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div />
        <button className="btn btn-primary" onClick={() => abrir("nova")}>
          + Nova despesa
        </button>
      </div>

      {despesas.length === 0 ? (
        <div className="empty-state">Nenhuma despesa lançada ainda.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Categoria</th>
                <th>Origem</th>
                <th>Valor</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {despesas.map((d) => (
                <tr key={d.id}>
                  <td>{formatDateBR(d.expense_date)}</td>
                  <td>
                    {d.description}
                    {d.notes && !d.invoice_id && <div className="hint">{d.notes}</div>}
                  </td>
                  <td>{d.category || "-"}</td>
                  <td>
                    {d.invoice_id ? (
                      <button className="icon-btn" onClick={verFaturas}>{`Fatura: ${d.invoice_description ?? d.invoice_id}`}</button>
                    ) : (
                      "Lançada aqui"
                    )}
                  </td>
                  <td className="num">{formatCentsBRL(toCents(d.amount))}</td>
                  <td>
                    <div className="row-actions">
                      {d.invoice_id ? (
                        <span className="hint">edite na fatura</span>
                      ) : (
                        <>
                          <button className="icon-btn" onClick={() => abrir(d)}>
                            Editar
                          </button>
                          <button className="icon-btn danger" onClick={() => apagar(d)}>
                            Apagar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>
                {editando === "nova" ? "Nova despesa" : "Editar despesa"}
              </h2>
              <button className="modal-close" onClick={() => setEditando(null)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <form onSubmit={salvar}>
              <div className="form-grid">
                <div className="field">
                  <label>Data</label>
                  <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
                </div>
                <div className="field">
                  <label>Valor</label>
                  <div className="money-input">
                    <span className="prefix">R$</span>
                    <input type="text" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                </div>
                <div className="field field--full">
                  <label>O que foi</label>
                  <input type="text" placeholder="Ex: anúncios no Instagram" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="field field--full">
                  <label>Categoria</label>
                  <div className="radio-row">
                    {EXPENSE_CATEGORIES.map((c) => (
                      <button
                        type="button"
                        key={c}
                        className={"radio-chip" + (form.category === c ? " selected" : "")}
                        onClick={() => setForm({ ...form, category: form.category === c ? "" : c })}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="field field--full">
                  <label>Observação (opcional)</label>
                  <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              {erro && (
                <div className="banner banner-error" style={{ marginTop: 14 }}>
                  <span>⚠️</span>
                  <span>{erro}</span>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function FaturasAba({ faturas, recarregar }: { faturas: Fatura[]; recarregar: () => void }) {
  const [editando, setEditando] = useState<Fatura | "nova" | null>(null);
  const [form, setForm] = useState<FaturaForm>(faturaVazia());
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  function abrir(f: Fatura | "nova") {
    setErro("");
    setForm(f === "nova" ? faturaVazia() : faturaParaForm(f));
    setEditando(f);
  }

  function setParte(i: number, patch: Partial<ParteForm>) {
    setForm((atual) => ({ ...atual, parts: atual.parts.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  }

  const somaPartes = form.parts.reduce((t, p) => t + centsOrZero(p.amount), 0);
  const total = form.total_amount.trim() === "" ? null : centsOrZero(form.total_amount);
  const diferenca = total === null ? null : total - somaPartes;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro("");
    try {
      const nova = editando === "nova";
      const res = await fetch(nova ? "/api/card-invoices" : `/api/card-invoices/${(editando as Fatura).id}`, {
        method: nova ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const dados = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditando(null);
        recarregar();
      } else setErro(dados.message || "Não foi possível salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(f: Fatura) {
    if (!window.confirm(`Apagar a fatura "${f.description}"? As despesas e compras de estoque criadas por ela também saem.`)) return;
    const res = await fetch(`/api/card-invoices/${f.id}`, { method: "DELETE" });
    if (res.ok) recarregar();
    else window.alert((await res.json().catch(() => ({}))).message || "Não foi possível apagar.");
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div />
        <button className="btn btn-primary" onClick={() => abrir("nova")}>
          + Nova fatura
        </button>
      </div>

      {faturas.length === 0 ? (
        <div className="empty-state">Nenhuma fatura lançada ainda. A fatura que vence dia 30 pode ser lançada já, mesmo antes de fechar.</div>
      ) : (
        faturas.map((f) => {
          const soma = f.parts.reduce((t, p) => t + toCents(p.amount), 0);
          const totalF = f.total_amount === null ? null : toCents(f.total_amount);
          const dif = totalF === null ? null : totalF - soma;
          const porNatureza = (n: InvoiceNature) => f.parts.filter((p) => p.nature === n).reduce((t, p) => t + toCents(p.amount), 0);
          return (
            <div className="card" key={f.id} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
                <div>
                  <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem" }}>{f.description}</h2>
                  <div className="hint">
                    {`Vence em ${formatDateBR(f.due_date)}`}
                    {f.closing_date ? ` · fecha em ${formatDateBR(f.closing_date)}` : ""}
                    {f.status === "paga" && f.paid_date ? ` · paga em ${formatDateBR(f.paid_date)}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className={`stock-pill ${f.status === "paga" ? "ok" : f.status === "fechada" ? "low" : "out"}`}>
                    {INVOICE_STATUS_LABELS[f.status]}
                  </span>
                  <div className="num" style={{ fontSize: "1.2rem", marginTop: 6 }}>
                    {totalF === null ? "Total ainda não fechou" : formatCentsBRL(totalF)}
                  </div>
                </div>
              </div>

              <div className="stat-grid auto" style={{ marginTop: 12 }}>
                {NATURES.map((n) => (
                  <div className="stat-tile" key={n}>
                    <div className="label">{NATURE_LABELS[n]}</div>
                    <div className="value">{formatCentsBRL(porNatureza(n))}</div>
                  </div>
                ))}
              </div>

              {dif !== null && dif !== 0 && (
                <div className="banner banner-warning" style={{ marginTop: 12, marginBottom: 0 }}>
                  <span>⚠️</span>
                  <span>{`As partes somam ${formatCentsBRL(soma)} e a fatura tem ${formatCentsBRL(totalF ?? 0)}. Faltam ${formatCentsBRL(dif)} para fechar.`}</span>
                </div>
              )}
              {dif === 0 && <div className="hint" style={{ marginTop: 10 }}>As partes somam o total da fatura.</div>}

              <div className="row-actions" style={{ marginTop: 12 }}>
                <button className="icon-btn" onClick={() => abrir(f)}>
                  Editar
                </button>
                <button className="icon-btn danger" onClick={() => apagar(f)}>
                  Apagar
                </button>
              </div>
            </div>
          );
        })
      )}

      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>
                {editando === "nova" ? "Nova fatura do cartão" : "Editar fatura"}
              </h2>
              <button className="modal-close" onClick={() => setEditando(null)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <form onSubmit={salvar}>
              <div className="form-grid">
                <div className="field field--full">
                  <label>Nome da fatura</label>
                  <input type="text" placeholder="Ex: Fatura de setembro" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="field">
                  <label>Vencimento</label>
                  <input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                </div>
                <div className="field">
                  <label>Fecha em (opcional)</label>
                  <input type="date" value={form.closing_date} onChange={(e) => setForm({ ...form, closing_date: e.target.value })} />
                </div>
                <div className="field">
                  <label>Total da fatura</label>
                  <div className="money-input">
                    <span className="prefix">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Deixe em branco até fechar"
                      value={form.total_amount}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm({ ...form, total_amount: v, status: form.status === "aguardando_fechamento" && v.trim() ? "fechada" : form.status });
                      }}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Situação</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as InvoiceStatus, paid_date: e.target.value === "paga" && !form.paid_date ? hojeISO() : form.paid_date })}>
                    {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {INVOICE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                {form.status === "paga" && (
                  <div className="field">
                    <label>Paga em</label>
                    <input type="date" value={form.paid_date} onChange={(e) => setForm({ ...form, paid_date: e.target.value })} />
                  </div>
                )}
              </div>

              <h3 className="fin-sub" style={{ marginTop: 18 }}>
                Partes da fatura
                <span className="fin-sub-note">devem somar o total</span>
              </h3>
              {form.parts.map((p, i) => (
                <div className="pay-row" key={i} style={{ marginTop: 10 }}>
                  <div className="field">
                    <label>Tipo</label>
                    <select value={p.nature} onChange={(e) => setParte(i, { nature: e.target.value as InvoiceNature })}>
                      {NATURES.map((n) => (
                        <option key={n} value={n}>
                          {NATURE_LABELS[n]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Valor</label>
                    <div className="money-input">
                      <span className="prefix">R$</span>
                      <input type="text" inputMode="decimal" value={p.amount} onChange={(e) => setParte(i, { amount: e.target.value })} />
                    </div>
                  </div>
                  <div className="field" style={{ gridColumn: "1 / -1" }}>
                    <input type="text" placeholder="Descrição (opcional)" value={p.description} onChange={(e) => setParte(i, { description: e.target.value })} />
                    <span className="hint">{NATURE_HINTS[p.nature]}</span>
                    <div className="row-actions" style={{ marginTop: 4 }}>
                      {diferenca !== null && diferenca > 0 && (
                        <button type="button" className="icon-btn" onClick={() => setParte(i, { amount: ((centsOrZero(p.amount) + diferenca) / 100).toFixed(2) })}>
                          {`Colocar a diferença aqui (${formatCentsBRL(diferenca)})`}
                        </button>
                      )}
                      <button type="button" className="icon-btn danger" onClick={() => setForm({ ...form, parts: form.parts.filter((_, j) => j !== i) })}>
                        Remover parte
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="icon-btn"
                style={{ marginTop: 10 }}
                onClick={() => setForm({ ...form, parts: [...form.parts, { id: null, nature: "despesa_empresa", description: "", amount: "" }] })}
              >
                + Acrescentar parte
              </button>

              <div className="banner banner-info" style={{ marginTop: 14, marginBottom: 0, flexDirection: "column", gap: 2 }}>
                <span>{`Partes somam: ${formatCentsBRL(somaPartes)}`}</span>
                {total !== null && <span>{`Total da fatura: ${formatCentsBRL(total)}`}</span>}
                {diferenca !== null && (
                  <strong>{diferenca === 0 ? "Fecha certinho." : `Diferença: ${formatCentsBRL(diferenca)}. Dá para salvar assim e acertar depois.`}</strong>
                )}
              </div>
              <span className="hint" style={{ display: "block", marginTop: 8 }}>
                A parte "Despesa da empresa" vira despesa sozinha, na data do vencimento: não lance de novo em Despesas. A
                "Reposição" e o "Estoque inicial" viram compras de estoque.
              </span>

              {erro && (
                <div className="banner banner-error" style={{ marginTop: 14 }}>
                  <span>⚠️</span>
                  <span>{erro}</span>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar fatura"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
