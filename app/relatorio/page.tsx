"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatBRL,
  formatDateBR,
  Sale,
  SALE_TYPES,
  PAYMENT_METHODS,
  Manufacturer,
} from "@/lib/format";
import {
  AtacadoFields,
  CostFields,
  PixPlan,
  TierPicker,
  financeFromSale,
  financePayload,
  type FinanceForm,
} from "@/app/sale-finance-fields";
import { NAO_INFORMADA, PIX_A_PRAZO, PIX_DIRETO_AO_FABRICANTE, PRICE_TIERS, commissionCents } from "@/lib/sale-finance";
import { formatCentsBRL } from "@/lib/finance/money";

type LoadState = "loading" | "ready" | "db_missing" | "error";

type EditForm = {
  sale_date: string;
  sale_type: string;
  seller: string;
  product_type: string;
  manufacturer: string;
  supplier: string;
  warranty: string;
  cost: string;
  sale_value: string;
  payment_method: string;
  installments_count: string;
  installments_dates: string;
  client_name: string;
  client_nickname: string;
  client_city: string;
  client_phone: string;
  client_birthday: string;
};

function saleToForm(s: Sale): EditForm {
  return {
    sale_date: s.sale_date.slice(0, 10),
    sale_type: s.sale_type || "",
    seller: s.seller || "",
    product_type: s.product_type || "",
    manufacturer: s.manufacturer || "",
    supplier: s.supplier || "",
    warranty: s.warranty || "",
    cost: String(s.cost ?? ""),
    sale_value: String(s.sale_value ?? ""),
    payment_method: s.payment_method || "",
    installments_count: s.installments_count ? String(s.installments_count) : "",
    installments_dates: s.installments_dates || "",
    client_name: s.client_name || "",
    client_nickname: s.client_nickname || "",
    client_city: s.client_city || "",
    client_phone: s.client_phone || "",
    client_birthday: s.client_birthday ? s.client_birthday.slice(0, 10) : "",
  };
}

function EditModal({
  sale,
  manufacturers,
  onClose,
  onSaved,
}: {
  sale: Sale;
  manufacturers: Manufacturer[];
  onClose: () => void;
  onSaved: (updated: Sale) => void;
}) {
  const [form, setForm] = useState<EditForm>(saleToForm(sale));
  const [finance, setFinance] = useState<FinanceForm>(financeFromSale(sale));

  function changeFinance(patch: Partial<FinanceForm>) {
    setFinance((f) => ({ ...f, ...patch }));
  }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const atacado = finance.price_tier === "atacado";
      const pixAPrazo = !atacado && form.payment_method === PIX_A_PRAZO;
      const parcelasComValor = finance.payments.filter((p) => Number(p.amount) > 0);
      const fabricante = manufacturers.find((m) => m.id === finance.manufacturer_id);
      const corpo = {
        ...form,
        ...financePayload(finance, form.payment_method),
        payment_method: atacado ? PIX_DIRETO_AO_FABRICANTE : form.payment_method,
        manufacturer: atacado && fabricante ? fabricante.name : form.manufacturer,
        // No Pix a prazo, o número e as datas para o texto do WhatsApp saem das parcelas.
        ...(pixAPrazo
          ? {
              installments_count: parcelasComValor.length ? String(parcelasComValor.length) : "",
              installments_dates: parcelasComValor
                .filter((p) => p.due_date)
                .map((p) => formatDateBR(p.due_date).slice(0, 5))
                .join(", "),
            }
          : {}),
      };
      const res = await fetch(`/api/sales/${sale.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      if (!res.ok) {
        setError("Não foi possível salvar as alterações. Tente novamente.");
        setSaving(false);
        return;
      }
      const data = await res.json();
      onSaved(data.sale as Sale);
    } catch {
      setError("Falha de conexão. Verifique a internet e tente novamente.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>
            Editar venda
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        {error && (
          <div className="banner banner-error" role="alert">
            <span>✕</span>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field">
              <label>Data da venda</label>
              <input
                type="date"
                value={form.sale_date}
                onChange={(e) => set("sale_date", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Vendedora</label>
              <input
                type="text"
                value={form.seller}
                onChange={(e) => set("seller", e.target.value)}
              />
            </div>
            <div className="field field--full">
              <label>Onde vendeu (tipo de venda)</label>
              <div className="radio-row">
                {SALE_TYPES.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={"radio-chip" + (form.sale_type === t ? " selected" : "")}
                    onClick={() => set("sale_type", t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <TierPicker form={finance} onChange={changeFinance} />

            <div className="field field--full">
              <label>Tipo da peça</label>
              <input
                type="text"
                value={form.product_type}
                onChange={(e) => set("product_type", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Fabricante</label>
              <input
                type="text"
                value={form.manufacturer}
                onChange={(e) => set("manufacturer", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Fornecedor</label>
              <input
                type="text"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
              />
            </div>
            <div className="field field--full">
              <label>Garantia</label>
              <input
                type="text"
                value={form.warranty}
                onChange={(e) => set("warranty", e.target.value)}
              />
            </div>

            <div className="field">
              <label>Custo da peça</label>
              <div className="money-input">
                <span className="prefix">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.cost}
                  onChange={(e) => set("cost", e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label>Valor da venda</label>
              <div className="money-input">
                <span className="prefix">R$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.sale_value}
                  onChange={(e) => set("sale_value", e.target.value)}
                />
              </div>
            </div>
            {finance.price_tier === "atacado" ? (
              <AtacadoFields
                form={finance}
                onChange={changeFinance}
                saleValue={form.sale_value}
                manufacturers={manufacturers}
              />
            ) : (
              <>
                <CostFields form={finance} onChange={changeFinance} />
                <div className="field field--full">
                  <label>Forma de pagamento</label>
                  <div className="radio-row">
                    {PAYMENT_METHODS.map((m) => (
                      <button
                        type="button"
                        key={m}
                        className={"radio-chip" + (form.payment_method === m ? " selected" : "")}
                        onClick={() => set("payment_method", m)}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
                {form.payment_method === PIX_A_PRAZO && (
                  <PixPlan
                    form={finance}
                    onChange={changeFinance}
                    saleValue={form.sale_value}
                    saleDate={form.sale_date}
                  />
                )}
              </>
            )}
            {finance.price_tier !== "atacado" && form.payment_method === "Crédito parcelado" && (
              <div className="installments-box">
                <div className="field">
                  <label>Nº de parcelas</label>
                  <input
                    type="number"
                    min="1"
                    value={form.installments_count}
                    onChange={(e) => set("installments_count", e.target.value)}
                  />
                </div>

              </div>
            )}

            <div className="field field--full">
              <label>Nome completo</label>
              <input
                type="text"
                value={form.client_name}
                onChange={(e) => set("client_name", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Apelido</label>
              <input
                type="text"
                value={form.client_nickname}
                onChange={(e) => set("client_nickname", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Praça (cidade/bairro)</label>
              <input
                type="text"
                value={form.client_city}
                onChange={(e) => set("client_city", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Telefone/WhatsApp</label>
              <input
                type="tel"
                value={form.client_phone}
                onChange={(e) => set("client_phone", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Aniversário</label>
              <input
                type="date"
                value={form.client_birthday}
                onChange={(e) => set("client_birthday", e.target.value)}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function RelatorioPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [seller, setSeller] = useState("");
  const [editing, setEditing] = useState<Sale | null>(null);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);

  useEffect(() => {
    fetch("/api/manufacturers")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setManufacturers(d.items || []))
      .catch(() => setManufacturers([]));
  }, []);

  useEffect(() => {
    fetch("/api/sales")
      .then(async (res) => {
        if (res.status === 503) {
          setState("db_missing");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        const data = await res.json();
        setSales(data.sales as Sale[]);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  const sellers = useMemo(() => {
    const set = new Set(sales.map((s) => s.seller).filter((s): s is string => !!s));
    return Array.from(set).sort();
  }, [sales]);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (from && s.sale_date.slice(0, 10) < from) return false;
      if (to && s.sale_date.slice(0, 10) > to) return false;
      if (seller && s.seller !== seller) return false;
      return true;
    });
  }, [sales, from, to, seller]);

  // Faturamento, custo e lucro contam só varejo e consignado. No atacado o cliente paga ao
  // fabricante: o que é nosso é a comissão, mostrada à parte.
  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    let commission = 0;
    let wholesaleCount = 0;
    for (const s of filtered) {
      if (s.status === "cancelada") continue;
      if (s.price_tier === "atacado") {
        wholesaleCount += 1;
        commission += commissionCents(s.sale_value ?? 0, s.commission_pct === null || s.commission_pct === undefined ? null : Number(s.commission_pct));
        continue;
      }
      value += Number(s.sale_value) || 0;
      cost += Number(s.cost) || 0;
    }
    return { value, cost, profit: value - cost, count: filtered.length, commission, wholesaleCount };
  }, [filtered]);

  function handleSaved(updated: Sale) {
    setSales((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditing(null);
  }

  async function handleDelete(s: Sale) {
    const ok = window.confirm(
      `Excluir a venda de "${s.client_name}" (${formatDateBR(s.sale_date)})? Essa ação não pode ser desfeita.`
    );
    if (!ok) return;
    const res = await fetch(`/api/sales/${s.id}`, { method: "DELETE" });
    if (res.ok) {
      setSales((prev) => prev.filter((x) => x.id !== s.id));
    } else {
      window.alert("Não foi possível excluir. Tente novamente.");
    }
  }

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Relatório</p>
        <h1>Vendas registradas</h1>
        <p>Acompanhe o que a equipe vendeu, filtrando por período ou vendedora.</p>
      </div>

      {state === "db_missing" && (
        <div className="banner banner-warning" role="status">
          <span>⚠️</span>
          <span>
            O banco de dados ainda não foi conectado a este projeto no Vercel.
            Conclua o passo de Storage → Connect Store para começar a ver os
            registros aqui.
          </span>
        </div>
      )}

      {state === "error" && (
        <div className="banner banner-error" role="alert">
          <span>✕</span>
          <span>Não foi possível carregar as vendas. Recarregue a página.</span>
        </div>
      )}

      {state === "loading" && <div className="loading-state">Carregando vendas...</div>}

      {(state === "ready" || (state !== "loading" && sales.length > 0)) && (
        <>
          <div className="stat-grid">
            <div className="stat-tile">
              <div className="label">Vendas</div>
              <div className="value">{totals.count}</div>
            </div>
            <div className="stat-tile accent">
              <div className="label">Faturamento</div>
              <div className="value">{formatBRL(totals.value)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Custo</div>
              <div className="value">{formatBRL(totals.cost)}</div>
            </div>
            <div className="stat-tile gold">
              <div className="label">Lucro (valor menos custo da peça)</div>
              <div className="value">{formatBRL(totals.profit)}</div>
            </div>
            {totals.wholesaleCount > 0 && (
              <div className="stat-tile">
                <div className="label">Atacado: comissão prevista</div>
                <div className="value">{formatCentsBRL(totals.commission)}</div>
                <div className="stat-note">{`${totals.wholesaleCount} venda(s), fora do faturamento`}</div>
              </div>
            )}
          </div>

          <div className="toolbar">
            <div className="filters">
              <div className="field">
                <label htmlFor="from">De</label>
                <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="to">Até</label>
                <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="seller">Vendedora</label>
                <select id="seller" value={seller} onChange={(e) => setSeller(e.target.value)}>
                  <option value="">Todas</option>
                  {sellers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <a className="btn btn-ghost" href="/api/sales/export">
              Exportar Excel
            </a>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">Nenhuma venda encontrada para esse filtro.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Vendedora</th>
                    <th>Tipo</th>
                    <th>Cliente</th>
                    <th>Peça</th>
                    <th>Pagamento</th>
                    <th>Custo</th>
                    <th>Valor</th>
                    <th>Lucro</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const atacado = s.price_tier === "atacado";
                    const profit = atacado
                      ? commissionCents(s.sale_value ?? 0, s.commission_pct === null || s.commission_pct === undefined ? null : Number(s.commission_pct)) / 100
                      : (Number(s.sale_value) || 0) - (Number(s.cost) || 0);
                    return (
                      <tr key={s.id}>
                        <td>{formatDateBR(s.sale_date)}</td>
                        <td>{s.seller || "-"}</td>
                        <td>
                          <span className={`stock-pill ${s.price_tier === "atacado" ? "low" : s.price_tier === "consignado" ? "out" : "ok"}`}>
                            {PRICE_TIERS.find((t) => t.value === (s.price_tier ?? "varejo"))?.label}
                          </span>
                          {s.status === "cancelada" && <div className="hint">cancelada</div>}
                        </td>
                        <td>{s.client_name || "-"}</td>
                        <td>{s.product_type || "-"}</td>
                        <td>
                          {s.payment_method || NAO_INFORMADA}
                          {s.payments && s.payments.length > 0 && (
                            <div className="hint">
                              {`${s.payments.filter((p) => p.status === "recebida").length} de ${s.payments.length} parcelas recebidas`}
                            </div>
                          )}
                        </td>
                        <td className="num">{formatBRL(s.cost)}</td>
                        <td className="num">{formatBRL(s.sale_value)}</td>
                        <td className={"num " + (profit >= 0 ? "profit-pos" : "profit-neg")}>
                          {formatBRL(profit)}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button className="icon-btn" onClick={() => setEditing(s)}>
                              Editar
                            </button>
                            <button
                              className="icon-btn danger"
                              onClick={() => handleDelete(s)}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {editing && (
        <EditModal
          sale={editing}
          manufacturers={manufacturers}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </main>
  );
}
