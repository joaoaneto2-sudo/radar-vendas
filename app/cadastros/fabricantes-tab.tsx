"use client";

import { useEffect, useState } from "react";
import { Manufacturer, WHOLESALE_MODES } from "@/lib/format";

type ManufacturerForm = {
  name: string;
  represented: boolean;
  commission_pct: string;
  commission_days: string;
  wholesale_mode: string;
};

const EMPTY: ManufacturerForm = {
  name: "",
  represented: false,
  commission_pct: "",
  commission_days: "15",
  wholesale_mode: "pronta_entrega",
};

function toForm(m: Manufacturer): ManufacturerForm {
  return {
    name: m.name,
    represented: !!m.represented,
    commission_pct: m.commission_pct === null || m.commission_pct === undefined ? "" : String(Number(m.commission_pct)),
    commission_days: String(m.commission_days ?? 15),
    wholesale_mode: m.wholesale_mode || "pronta_entrega",
  };
}

function modeLabel(value: string): string {
  return WHOLESALE_MODES.find((w) => w.value === value)?.label ?? value;
}

export default function FabricantesTab() {
  const [items, setItems] = useState<Manufacturer[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Manufacturer | "new" | null>(null);
  const [form, setForm] = useState<ManufacturerForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  function load() {
    fetch("/api/manufacturers")
      .then((r) => r.json())
      .then((data) => setItems(data.items || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm(EMPTY);
    setErro("");
    setEditing("new");
  }

  function openEdit(m: Manufacturer) {
    setForm(toForm(m));
    setErro("");
    setEditing(m);
  }

  function set<K extends keyof ManufacturerForm>(key: K, value: ManufacturerForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErro("");
    try {
      const isNew = editing === "new";
      const url = isNew ? "/api/manufacturers" : `/api/manufacturers/${(editing as Manufacturer).id}`;
      const res = await fetch(url, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setEditing(null);
        load();
      } else {
        const data = await res.json().catch(() => ({}));
        setErro(data.message || "Não foi possível salvar. Tente novamente.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(m: Manufacturer) {
    const ok = window.confirm(`Remover o fabricante "${m.name}"? Produtos que já usam ele não são afetados.`);
    if (!ok) return;
    const res = await fetch(`/api/manufacturers/${m.id}`, { method: "DELETE" });
    if (res.ok) {
      setItems((prev) => prev.filter((i) => i.id !== m.id));
    } else {
      const dados = await res.json().catch(() => ({}));
      window.alert(dados.message || "Não foi possível remover.");
    }
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 18 }}>
        <div />
        <button className="btn btn-primary" onClick={openNew}>
          + Novo fabricante
        </button>
      </div>

      <div className="banner banner-info">
        <span>💡</span>
        <span>
          Fabricante <strong>representado</strong> é aquele em que vocês vendem no atacado (pronta entrega): o cliente
          paga direto ao fabricante e a empresa recebe a comissão. Hoje só a Bia Belutti.
        </span>
      </div>

      {loading ? (
        <div className="loading-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum fabricante cadastrado ainda.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fabricante</th>
                <th>Representamos no atacado?</th>
                <th>Comissão</th>
                <th>Recebimento da comissão</th>
                <th>Modalidade</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td>
                    <span className={`stock-pill ${m.represented ? "ok" : "low"}`}>
                      {m.represented ? "Sim" : "Não"}
                    </span>
                  </td>
                  <td className="num">{m.represented ? `${Number(m.commission_pct)}%` : "-"}</td>
                  <td>{m.represented ? `${m.commission_days} dias após receber o estoque` : "-"}</td>
                  <td>{m.represented ? modeLabel(m.wholesale_mode) : "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => openEdit(m)}>
                        Editar
                      </button>
                      <button className="icon-btn danger" onClick={() => handleDelete(m)}>
                        Remover
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
                {editing === "new" ? "Novo fabricante" : "Editar fabricante"}
              </h2>
              <button className="modal-close" onClick={() => setEditing(null)} aria-label="Fechar">
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="field field--full">
                  <label>Nome do fabricante</label>
                  <input
                    type="text"
                    placeholder="Ex: Bia Belutti"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>

                <div className="field field--full">
                  <label>Vocês representam este fabricante no atacado?</label>
                  <div className="radio-row">
                    <button
                      type="button"
                      className={"radio-chip" + (form.represented ? " selected" : "")}
                      onClick={() => set("represented", true)}
                    >
                      Sim
                    </button>
                    <button
                      type="button"
                      className={"radio-chip" + (!form.represented ? " selected" : "")}
                      onClick={() => set("represented", false)}
                    >
                      Não
                    </button>
                  </div>
                </div>

                {form.represented && (
                  <>
                    <div className="field">
                      <label>Comissão da empresa (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        placeholder="Ex: 20"
                        value={form.commission_pct}
                        onChange={(e) => set("commission_pct", e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Dias para receber a comissão</label>
                      <input
                        type="number"
                        min="0"
                        max="365"
                        value={form.commission_days}
                        onChange={(e) => set("commission_days", e.target.value)}
                      />
                      <span className="hint">Contados a partir do dia em que a empresa recebe o estoque do fabricante.</span>
                    </div>
                    <div className="field field--full">
                      <label>Modalidade do atacado</label>
                      <div className="radio-row">
                        {WHOLESALE_MODES.map((w) => (
                          <button
                            type="button"
                            key={w.value}
                            className={"radio-chip" + (form.wholesale_mode === w.value ? " selected" : "")}
                            onClick={() => set("wholesale_mode", w.value)}
                          >
                            {w.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {erro && (
                <div className="banner banner-error" style={{ marginTop: 14 }}>
                  <span>⚠️</span>
                  <span>{erro}</span>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar fabricante"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
