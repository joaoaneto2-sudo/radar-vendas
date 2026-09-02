"use client";

import { useState } from "react";
import {
  SALE_TYPES,
  PAYMENT_METHODS,
  INSTALLMENT_COUNT_METHODS,
  INSTALLMENT_DATES_METHODS,
  buildWhatsAppMessage,
  Sale,
} from "@/lib/format";

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  sale_date: todayISO(),
  sale_type: SALE_TYPES[0],
  seller: "",
  product_type: "",
  manufacturer: "",
  supplier: "",
  warranty: "",
  cost: "",
  sale_value: "",
  payment_method: PAYMENT_METHODS[0],
  installments_count: "",
  installments_dates: "",
  client_name: "",
  client_nickname: "",
  client_city: "",
  client_phone: "",
  client_birthday: "",
};

type FormState = typeof EMPTY_FORM;

export default function NovaVendaPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbMissing, setDbMissing] = useState(false);
  const [confirmedSale, setConfirmedSale] = useState<Sale | null>(null);
  const [copied, setCopied] = useState(false);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDbMissing(false);
    setSubmitting(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.status === 503) {
        setDbMissing(true);
        setSubmitting(false);
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          data.error === "missing_fields"
            ? "Preencha todos os campos obrigatórios antes de enviar."
            : "Não foi possível registrar a venda. Tente novamente."
        );
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      setConfirmedSale(data.sale as Sale);
    } catch {
      setError("Falha de conexão. Verifique a internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewSale() {
    setConfirmedSale(null);
    setCopied(false);
    setForm({ ...EMPTY_FORM, sale_date: todayISO(), seller: form.seller });
  }

  async function handleCopy() {
    if (!confirmedSale) return;
    const text = buildWhatsAppMessage(confirmedSale);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione o texto manualmente.");
    }
  }

  if (confirmedSale) {
    const message = buildWhatsAppMessage(confirmedSale);
    return (
      <main className="shell">
        <div className="card">
          <div className="confirm">
            <div className="confirm-badge" aria-hidden="true">
              ✓
            </div>
            <h1 style={{ fontSize: "1.4rem" }}>Venda registrada</h1>
            <p style={{ color: "var(--ink-soft)", marginTop: 8 }}>
              Já está no relatório. Copie o texto abaixo e cole no grupo do WhatsApp.
            </p>
            <div className="whatsapp-preview">{message}</div>
            <div className="action-row">
              <button className="btn btn-primary" onClick={handleCopy}>
                {copied ? "Copiado ✓" : "Copiar texto"}
              </button>
              <button className="btn btn-ghost" onClick={handleNewSale}>
                Registrar nova venda
              </button>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Nova venda</p>
        <h1>Registrar uma venda</h1>
        <p>
          Preencha os campos abaixo. Ao salvar, o texto pronto pra colar no grupo
          é gerado automaticamente.
        </p>
      </div>

      {dbMissing && (
        <div className="banner banner-warning" role="status">
          <span>⚠️</span>
          <span>
            O banco de dados ainda não foi conectado a este projeto. Peça pro João
            concluir a configuração no painel do Vercel — assim que ele conectar,
            os envios passam a ser salvos normalmente.
          </span>
        </div>
      )}

      {error && (
        <div className="banner banner-error" role="alert">
          <span>✕</span>
          <span>{error}</span>
        </div>
      )}

      <form className="card" onSubmit={handleSubmit}>
        <div className="section">
          <h2 className="section-title">
            <span className="dot" style={{ background: "var(--accent)" }} />
            Venda
          </h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="sale_date">Data da venda</label>
              <input
                id="sale_date"
                type="date"
                required
                value={form.sale_date}
                onChange={(e) => set("sale_date", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="seller">Vendedora</label>
              <input
                id="seller"
                type="text"
                required
                placeholder="Fernanda"
                value={form.seller}
                onChange={(e) => set("seller", e.target.value)}
              />
            </div>
            <div className="field field--full">
              <label>Tipo de venda</label>
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
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">
            <span className="dot" />
            Descrição do produto
          </h2>
          <div className="form-grid">
            <div className="field field--full">
              <label htmlFor="product_type">Tipo da peça</label>
              <input
                id="product_type"
                type="text"
                required
                placeholder="Anel, colar, brinco..."
                value={form.product_type}
                onChange={(e) => set("product_type", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="manufacturer">Fabricante</label>
              <input
                id="manufacturer"
                type="text"
                value={form.manufacturer}
                onChange={(e) => set("manufacturer", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="supplier">Fornecedor</label>
              <input
                id="supplier"
                type="text"
                value={form.supplier}
                onChange={(e) => set("supplier", e.target.value)}
              />
            </div>
            <div className="field field--full">
              <label htmlFor="warranty">Garantia</label>
              <input
                id="warranty"
                type="text"
                placeholder="Ex: 90 dias"
                value={form.warranty}
                onChange={(e) => set("warranty", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">
            <span className="dot" style={{ background: "var(--gold)" }} />
            Valores e pagamento
          </h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="cost">Custo da peça</label>
              <div className="money-input">
                <span className="prefix">R$</span>
                <input
                  id="cost"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  inputMode="decimal"
                  value={form.cost}
                  onChange={(e) => set("cost", e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="sale_value">Valor da venda</label>
              <div className="money-input">
                <span className="prefix">R$</span>
                <input
                  id="sale_value"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  inputMode="decimal"
                  value={form.sale_value}
                  onChange={(e) => set("sale_value", e.target.value)}
                />
              </div>
            </div>
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
            {INSTALLMENT_COUNT_METHODS.includes(form.payment_method) && (
              <div className="installments-box">
                <div className="field">
                  <label htmlFor="installments_count">Nº de parcelas</label>
                  <input
                    id="installments_count"
                    type="number"
                    min="1"
                    inputMode="numeric"
                    value={form.installments_count}
                    onChange={(e) => set("installments_count", e.target.value)}
                  />
                </div>
                {INSTALLMENT_DATES_METHODS.includes(form.payment_method) && (
                  <div className="field">
                    <label htmlFor="installments_dates">Datas das parcelas</label>
                    <input
                      id="installments_dates"
                      type="text"
                      placeholder="Ex: entrada à vista + 3x nos meses seguintes"
                      value={form.installments_dates}
                      onChange={(e) => set("installments_dates", e.target.value)}
                    />
                    <span className="hint">Pode descrever livremente, ex: entrada + parcelas em datas diferentes</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">
            <span className="dot" style={{ background: "var(--accent)" }} />
            Dados do cliente
          </h2>
          <div className="form-grid">
            <div className="field field--full">
              <label htmlFor="client_name">Nome completo</label>
              <input
                id="client_name"
                type="text"
                required
                value={form.client_name}
                onChange={(e) => set("client_name", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="client_nickname">Apelido</label>
              <input
                id="client_nickname"
                type="text"
                value={form.client_nickname}
                onChange={(e) => set("client_nickname", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="client_city">Praça (cidade/bairro)</label>
              <input
                id="client_city"
                type="text"
                value={form.client_city}
                onChange={(e) => set("client_city", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="client_phone">Telefone/WhatsApp</label>
              <input
                id="client_phone"
                type="tel"
                placeholder="(00) 00000-0000"
                value={form.client_phone}
                onChange={(e) => set("client_phone", e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="client_birthday">Aniversário</label>
              <input
                id="client_birthday"
                type="date"
                value={form.client_birthday}
                onChange={(e) => set("client_birthday", e.target.value)}
              />
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={submitting}
          style={{ marginTop: 6 }}
        >
          {submitting ? "Salvando..." : "Salvar venda"}
        </button>
      </form>
    </main>
  );
}
