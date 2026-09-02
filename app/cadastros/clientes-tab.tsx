"use client";

import { useEffect, useState } from "react";
import { Client, formatDateBR } from "@/lib/format";

type ClientForm = {
  full_name: string;
  nickname: string;
  city: string;
  phone: string;
  birthday: string;
};

const EMPTY: ClientForm = { full_name: "", nickname: "", city: "", phone: "", birthday: "" };

function clientToForm(c: Client): ClientForm {
  return {
    full_name: c.full_name,
    nickname: c.nickname || "",
    city: c.city || "",
    phone: c.phone || "",
    birthday: c.birthday ? c.birthday.slice(0, 10) : "",
  };
}

export default function ClientesTab() {
  const [items, setItems] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Client | "new" | null>(null);
  const [form, setForm] = useState<ClientForm>(EMPTY);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => setItems(data.items || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setForm(EMPTY);
    setEditing("new");
  }

  function openEdit(c: Client) {
    setForm(clientToForm(c));
    setEditing(c);
  }

  function set<K extends keyof ClientForm>(key: K, value: ClientForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim() || saving) return;
    setSaving(true);
    try {
      const isNew = editing === "new";
      const url = isNew ? "/api/clients" : `/api/clients/${(editing as Client).id}`;
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

  async function handleDelete(c: Client) {
    const ok = window.confirm(`Excluir o cliente "${c.full_name}"?`);
    if (!ok) return;
    const res = await fetch(`/api/clients/${c.id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== c.id));
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 18 }}>
        <div />
        <button className="btn btn-primary" onClick={openNew}>
          + Novo cliente
        </button>
      </div>

      {loading ? (
        <div className="loading-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum cliente cadastrado ainda.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Apelido</th>
                <th>Praça</th>
                <th>Telefone</th>
                <th>Aniversário</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.full_name}</td>
                  <td>{c.nickname || "-"}</td>
                  <td>{c.city || "-"}</td>
                  <td>{c.phone || "-"}</td>
                  <td>{c.birthday ? formatDateBR(c.birthday) : "-"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="icon-btn" onClick={() => openEdit(c)}>
                        Editar
                      </button>
                      <button className="icon-btn danger" onClick={() => handleDelete(c)}>
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
                {editing === "new" ? "Novo cliente" : "Editar cliente"}
              </h2>
              <button className="modal-close" onClick={() => setEditing(null)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="field field--full">
                  <label>Nome completo</label>
                  <input
                    type="text"
                    required
                    value={form.full_name}
                    onChange={(e) => set("full_name", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Apelido</label>
                  <input
                    type="text"
                    value={form.nickname}
                    onChange={(e) => set("nickname", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Praça (cidade/bairro)</label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Telefone/WhatsApp</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Aniversário</label>
                  <input
                    type="date"
                    value={form.birthday}
                    onChange={(e) => set("birthday", e.target.value)}
                  />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
