"use client";

import { useEffect, useRef, useState } from "react";

export type ComboboxOption = { id: number; label: string; meta?: string };

export default function Combobox({
  options,
  value,
  onChange,
  placeholder,
  emptyText,
  onCreate,
  createLabel,
}: {
  options: ComboboxOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
  emptyText?: string;
  onCreate?: (name: string) => Promise<ComboboxOption>;
  createLabel?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.id === value) || null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  const exactMatch = options.some((o) => o.label.toLowerCase() === query.trim().toLowerCase());

  async function handleCreate() {
    if (!onCreate || !query.trim() || creating) return;
    setCreating(true);
    try {
      const opt = await onCreate(query.trim());
      onChange(opt.id);
      setQuery("");
      setOpen(false);
    } finally {
      setCreating(false);
    }
  }

  if (selected && !open) {
    return (
      <div className="selected-chip">
        <span>{selected.label}</span>
        <button
          type="button"
          onClick={() => {
            onChange(null);
            setQuery("");
            setOpen(true);
          }}
          aria-label="Trocar"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="combobox" ref={containerRef}>
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="combobox-list">
          {filtered.length === 0 && !onCreate && (
            <div className="combobox-empty">{emptyText || "Nada encontrado"}</div>
          )}
          {filtered.map((o) => (
            <div
              key={o.id}
              className="combobox-option"
              onClick={() => {
                onChange(o.id);
                setQuery("");
                setOpen(false);
              }}
            >
              {o.label}
              {o.meta && <div className="meta">{o.meta}</div>}
            </div>
          ))}
          {onCreate && query.trim() && !exactMatch && (
            <div className="combobox-option" onClick={handleCreate}>
              {creating ? "Criando..." : `${createLabel || "+ Criar"} "${query.trim()}"`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
