"use client";

import { useEffect, useState } from "react";
import { SimpleEntity } from "@/lib/format";

export default function SimpleListTab({
  title,
  endpoint,
  placeholder,
}: {
  title: string;
  endpoint: string;
  placeholder: string;
}) {
  const [items, setItems] = useState<SimpleEntity[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  function load() {
    fetch(`/api/${endpoint}`)
      .then((r) => r.json())
      .then((data) => setItems(data.items || []))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, [endpoint]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (res.ok) {
        setName("");
        load();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    const ok = window.confirm("Remover este item? Produtos que já usam ele não são afetados.");
    if (!ok) return;
    const res = await fetch(`/api/${endpoint}/${id}`, { method: "DELETE" });
    if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <div>
      <form className="add-inline" onSubmit={handleAdd}>
        <input
          type="text"
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={saving}>
          Adicionar
        </button>
      </form>

      {loading ? (
        <div className="loading-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Nenhum(a) {title.toLowerCase()} cadastrado ainda.</div>
      ) : (
        <div className="simple-list">
          {items.map((item) => (
            <div className="simple-list-row" key={item.id}>
              <span>{item.name}</span>
              <button className="icon-btn danger" onClick={() => handleDelete(item.id)}>
                Remover
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
