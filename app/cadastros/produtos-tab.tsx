"use client";

import { useEffect, useState } from "react";
import {
  Product,
  SimpleEntity,
  formatBRL,
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_NAMES,
  JEWELRY_TYPES,
} from "@/lib/format";
import Combobox, { ComboboxOption } from "@/app/combobox";

type ProductForm = {
  category: string;
  subtype: string;
  jewelry_type: string;
  name: string;
  manufacturer_id: number | null;
  supplier_id: number | null;
  cost: string;
  price: string;
  stock_qty: string;
  warranty: string;
  photo_url: string;
};

const EMPTY: ProductForm = {
  category: PRODUCT_CATEGORY_NAMES[0],
  subtype: PRODUCT_CATEGORIES[PRODUCT_CATEGORY_NAMES[0]][0],
  jewelry_type: JEWELRY_TYPES[0],
  name: "",
  manufacturer_id: null,
  supplier_id: null,
  cost: "",
  price: "",
  stock_qty: "0",
  warranty: "",
  photo_url: "",
};

function productToForm(p: Product): ProductForm {
  return {
    category: p.category,
    subtype: p.subtype,
    jewelry_type: p.jewelry_type,
    name: p.name,
    manufacturer_id: p.manufacturer_id ?? null,
    supplier_id: p.supplier_id ?? null,
    cost: String(p.cost ?? ""),
    price: String(p.price ?? ""),
    stock_qty: String(p.stock_qty ?? 0),
    warranty: p.warranty || "",
    photo_url: p.photo_url || "",
  };
}

function stockClass(qty: number): string {
  if (qty <= 0) return "out";
  if (qty <= 2) return "low";
  return "ok";
}

export default function ProdutosTab() {
  const [items, setItems] = useState<Product[]>([]);
  const [manufacturers, setManufacturers] = useState<SimpleEntity[]>([]);
  const [suppliers, setSuppliers] = useState<SimpleEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  function load() {
    Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/manufacturers").then((r) => r.json()),
      fetch("/api/suppliers").then((r) => r.json()),
    ])
      .then(([p, m, s]) => {
        setItems(p.items || []);
        setManufacturers(m.items || []);
        setSuppliers(s.items || []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm(EMPTY);
    setEditing("new");
  }

  function openEdit(p: Product) {
    setForm(productToForm(p));
    setEditing(p);
  }

  function set<K extends keyof ProductForm>(key: K, value: ProductForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setCategory(category: string) {
    setForm((f) => ({ ...f, category, subtype: PRODUCT_CATEGORIES[category][0] }));
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (res.ok) {
        const data = await res.json();
        set("photo_url", data.url);
      } else {
        window.alert("Não foi possível enviar a foto. Verifique se o armazenamento (Vercel Blob) está configurado.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function createManufacturer(name: string): Promise<ComboboxOption> {
    const res = await fetch("/api/manufacturers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setManufacturers((prev) => [...prev, data.item].sort((a, b) => a.name.localeCompare(b.name)));
    return { id: data.item.id, label: data.item.name };
  }

  async function createSupplier(name: string): Promise<ComboboxOption> {
    const res = await fetch("/api/suppliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setSuppliers((prev) => [...prev, data.item].sort((a, b) => a.name.localeCompare(b.name)));
    return { id: data.item.id, label: data.item.name };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      const isNew = editing === "new";
      const url = isNew ? "/api/products" : `/api/products/${(editing as Product).id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setEditing(null);
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: Product) {
    const ok = window.confirm(`Excluir o produto "${p.name}"?`);
    if (!ok) return;
    const res = await fetch(`/api/products/${p.id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== p.id));
  }

  const manufacturerOptions: ComboboxOption[] = manufacturers.map((m) => ({ id: m.id, label: m.name }));
  const supplierOptions: ComboboxOption[] = suppliers.map((s) => ({ id: s.id, label: s.name }));

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 18 }}>
        <div />
        <button className="btn btn-primary" onClick={openNew}>
          + Novo produto
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum produto cadastrado ainda.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Foto</th>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Fabricante</th>
                <th>Fornecedor</th>
                <th>Custo</th>
                <th>Preço</th>
                <th>Estoque</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name} className="thumb" />
                    ) : (
                      <span className="thumb-placeholder">💎</span>
                    )}
                  </td>
                  <td>
                    {p.name}
                    <div className="hint">{p.jewelry_type}</div>
                  </td>
                  <td>
                    {p.category}
                    <div className="hint">{p.subtype}</div>
                  </td>
                  <td>{p.manufacturer_name || "-"}</td>
                  <td>{p.supplier_name || "-"}</td>
                  <td className="num">{formatBRL(p.cost)}</td>
                  <td className="num">{formatBRL(p.price)}</td>
                  <td>
                    <span className={`stock-pill ${stockClass(p.stock_qty)}`}>{p.stock_qty}</span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => openEdit(p)}>
                        Editar
                      </button>
                      <button className="icon-btn danger" onClick={() => handleDelete(p)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>
                {editing === "new" ? "Novo produto" : "Editar produto"}
              </h2>
              <button className="modal-close" onClick={() => setEditing(null)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="field field--full" style={{ marginBottom: 18 }}>
                <label>Foto do produto</label>
                <div className="photo-upload">
                  {form.photo_url ? (
                    <img src={form.photo_url} alt="" className="photo-preview" />
                  ) : (
                    <div className="photo-preview-empty">💎</div>
                  )}
                  <div>
                    <input type="file" accept="image/*" onChange={handlePhotoChange} disabled={uploading} />
                    {uploading && <div className="hint">Enviando...</div>}
                  </div>
                </div>
              </div>

              <div className="form-grid">
                <div className="field field--full">
                  <label>Nome do produto</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Anel Solitário Moissanite 6mm"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Categoria</label>
                  <select value={form.category} onChange={(e) => setCategory(e.target.value)}>
                    {PRODUCT_CATEGORY_NAMES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Subtipo</label>
                  <select value={form.subtype} onChange={(e) => set("subtype", e.target.value)}>
                    {PRODUCT_CATEGORIES[form.category].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field field--full">
                  <label>Tipo</label>
                  <div className="radio-row">
                    {JEWELRY_TYPES.map((t) => (
                      <button
                        type="button"
                        key={t}
                        className={"radio-chip" + (form.jewelry_type === t ? " selected" : "")}
                        onClick={() => set("jewelry_type", t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="field">
                  <label>Fabricante</label>
                  <Combobox
                    options={manufacturerOptions}
                    value={form.manufacturer_id}
                    onChange={(id) => set("manufacturer_id", id)}
                    placeholder="Buscar fabricante..."
                    onCreate={createManufacturer}
                    createLabel="+ Cadastrar"
                  />
                </div>
                <div className="field">
                  <label>Fornecedor</label>
                  <Combobox
                    options={supplierOptions}
                    value={form.supplier_id}
                    onChange={(id) => set("supplier_id", id)}
                    placeholder="Buscar fornecedor..."
                    onCreate={createSupplier}
                    createLabel="+ Cadastrar"
                  />
                </div>

                <div className="field">
                  <label>Custo</label>
                  <div className="money-input">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={form.cost}
                      onChange={(e) => set("cost", e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Preço de venda</label>
                  <div className="money-input">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={form.price}
                      onChange={(e) => set("price", e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Estoque (unidades)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.stock_qty}
                    onChange={(e) => set("stock_qty", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Garantia</label>
                  <input
                    type="text"
                    placeholder="Ex: vitalícia"
                    value={form.warranty}
                    onChange={(e) => set("warranty", e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar produto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
