"use client";

import { useEffect, useMemo, useState } from "react";
import {
  SALE_TYPES,
  PAYMENT_METHODS,
  INSTALLMENT_COUNT_METHODS,
  INSTALLMENT_DATES_METHODS,
  buildWhatsAppMessage,
  formatBRL,
  Sale,
  Product,
  Client,
  SimpleEntity,
} from "@/lib/format";
import Combobox, { ComboboxOption } from "@/app/combobox";

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  sale_date: todayISO(),
  sale_type: SALE_TYPES[0],
  seller_id: null as number | null,
  product_id: null as number | null,
  cost: "",
  sale_value: "",
  payment_method: PAYMENT_METHODS[0],
  installments_count: "",
  installments_dates: "",
  client_id: null as number | null,
};

type FormState = typeof EMPTY_FORM;

export default function NovaVendaPage() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dbMissing, setDbMissing] = useState(false);
  const [confirmedSale, setConfirmedSale] = useState<Sale | null>(null);
  const [copied, setCopied] = useState(false);

  const [sellers, setSellers] = useState<SimpleEntity[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  function loadCatalog() {
    Promise.all([
      fetch("/api/sellers").then((r) => r.json()),
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ])
      .then(([se, pr, cl]) => {
        setSellers(se.items || []);
        setProducts(pr.items || []);
        setClients(cl.items || []);
      })
      .finally(() => setCatalogLoading(false));
  }

  useEffect(() => {
    loadCatalog();
  }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const selectedProduct = products.find((p) => p.id === form.product_id) || null;
  const selectedClient = clients.find((c) => c.id === form.client_id) || null;

  function handleSelectProduct(id: number | null) {
    set("product_id", id);
    const p = products.find((x) => x.id === id);
    if (p) {
      set("cost", String(p.cost ?? ""));
      set("sale_value", String(p.price ?? ""));
    }
  }

  async function createSeller(name: string): Promise<ComboboxOption> {
    const res = await fetch("/api/sellers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setSellers((prev) => [...prev, data.item]);
    return { id: data.item.id, label: data.item.name };
  }

  async function createClient(name: string): Promise<ComboboxOption> {
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: name }),
    });
    const data = await res.json();
    setClients((prev) => [...prev, data.item]);
    return { id: data.item.id, label: data.item.full_name };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDbMissing(false);

    if (!form.seller_id) {
      setError("Selecione a vendedora.");
      return;
    }
    if (!form.product_id) {
      setError("Selecione o produto vendido.");
      return;
    }
    if (!form.client_id) {
      setError("Selecione o cliente.");
      return;
    }

    const seller = sellers.find((s) => s.id === form.seller_id);
    const product = products.find((p) => p.id === form.product_id);
    const client = clients.find((c) => c.id === form.client_id);
    if (!seller || !product || !client) return;

    const payload = {
      sale_date: form.sale_date,
      sale_type: form.sale_type,
      seller: seller.name,
      seller_id: seller.id,
      product_type: product.name,
      manufacturer: product.manufacturer_name || null,
      supplier: product.supplier_name || null,
      warranty: product.warranty || null,
      product_id: product.id,
      cost: form.cost,
      sale_value: form.sale_value,
      payment_method: form.payment_method,
      installments_count: form.installments_count,
      installments_dates: form.installments_dates,
      client_name: client.full_name,
      client_nickname: client.nickname || null,
      client_city: client.city || null,
      client_phone: client.phone || null,
      client_birthday: client.birthday || null,
      client_id: client.id,
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      loadCatalog();
    } catch {
      setError("Falha de conexão. Verifique a internet e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleNewSale() {
    setConfirmedSale(null);
    setCopied(false);
    setForm({ ...EMPTY_FORM, sale_date: todayISO(), seller_id: form.seller_id });
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

  const sellerOptions: ComboboxOption[] = sellers.map((s) => ({ id: s.id, label: s.name }));
  const productOptions: ComboboxOption[] = products.map((p) => ({
    id: p.id,
    label: p.name,
    meta: `${p.category} · ${p.subtype} · ${formatBRL(p.price)} · estoque ${p.stock_qty}`,
  }));
  const clientOptions: ComboboxOption[] = clients.map((c) => ({
    id: c.id,
    label: c.full_name,
    meta: [c.nickname, c.city].filter(Boolean).join(" · "),
  }));

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
          Selecione o produto e o cliente já cadastrados. Ao salvar, o texto pronto
          pra colar no grupo é gerado automaticamente.
        </p>
      </div>

      {dbMissing && (
        <div className="banner banner-warning" role="status">
          <span>⚠️</span>
          <span>
            O banco de dados ainda não foi conectado a este projeto. Peça pro João
            concluir a configuração no painel do Vercel.
          </span>
        </div>
      )}

      {error && (
        <div className="banner banner-error" role="alert">
          <span>✕</span>
          <span>{error}</span>
        </div>
      )}

      {!catalogLoading && products.length === 0 && (
        <div className="banner banner-warning" role="status">
          <span>💎</span>
          <span>
            Nenhum produto cadastrado ainda. Vá em{" "}
            <a href="/cadastros" style={{ textDecoration: "underline" }}>
              Cadastros
            </a>{" "}
            e cadastre os produtos antes de registrar uma venda.
          </span>
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
              <label>Vendedora</label>
              <Combobox
                options={sellerOptions}
                value={form.seller_id}
                onChange={(id) => set("seller_id", id)}
                placeholder="Buscar vendedora..."
                onCreate={createSeller}
                createLabel="+ Cadastrar"
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
            Produto
          </h2>
          <div className="form-grid">
            <div className="field field--full">
              <label>Produto</label>
              <Combobox
                options={productOptions}
                value={form.product_id}
                onChange={handleSelectProduct}
                placeholder="Buscar produto..."
                emptyText="Nenhum produto encontrado — cadastre em Cadastros"
              />
            </div>
            {selectedProduct && (
              <div className="field field--full">
                <div className="banner banner-info" style={{ margin: 0 }}>
                  <span>💎</span>
                  <span>
                    {selectedProduct.category} · {selectedProduct.subtype} ·{" "}
                    {selectedProduct.jewelry_type}
                    {selectedProduct.manufacturer_name
                      ? ` · Fabricante: ${selectedProduct.manufacturer_name}`
                      : ""}
                    {selectedProduct.supplier_name
                      ? ` · Fornecedor: ${selectedProduct.supplier_name}`
                      : ""}
                    {selectedProduct.warranty ? ` · Garantia: ${selectedProduct.warranty}` : ""}
                  </span>
                </div>
              </div>
            )}
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
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">
            <span className="dot" style={{ background: "var(--accent)" }} />
            Cliente
          </h2>
          <div className="form-grid">
            <div className="field field--full">
              <label>Cliente</label>
              <Combobox
                options={clientOptions}
                value={form.client_id}
                onChange={(id) => set("client_id", id)}
                placeholder="Buscar cliente..."
                onCreate={createClient}
                createLabel="+ Cadastrar"
              />
              <span className="hint">
                Cliente novo? Digite o nome e clique em "+ Cadastrar". Depois complete os
                outros dados em Cadastros → Clientes.
              </span>
            </div>
            {selectedClient && (selectedClient.phone || selectedClient.city) && (
              <div className="field field--full">
                <div className="banner banner-info" style={{ margin: 0 }}>
                  <span>📓</span>
                  <span>
                    {[selectedClient.nickname, selectedClient.city, selectedClient.phone]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </div>
            )}
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
