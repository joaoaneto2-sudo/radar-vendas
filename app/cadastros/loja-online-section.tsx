"use client";

import { useEffect, useState } from "react";
import { WHOLESALE_BLOCK_MESSAGE, readMoneyOrNull } from "@/lib/store-rules";

// Seção "Loja online" do cadastro da peça: No site, Carrossel, preço promocional,
// descrição para o cliente e fotos extras. A foto principal continua sendo a do cadastro.

export type StoreFormPart = {
  show_online: boolean;
  featured: boolean;
  sale_price: string;
  public_description: string;
};

type Photo = { id: number; url: string; position: number };

export default function LojaOnlineSection({
  form,
  onChange,
  channel,
  price,
  productId,
}: {
  form: StoreFormPart;
  onChange: (patch: Partial<StoreFormPart>) => void;
  channel: string;
  price: string;
  productId: number | null;
}) {
  const atacado = channel === "atacado";
  const promo = readMoneyOrNull(form.sale_price);
  const normal = readMoneyOrNull(price);
  const promoRuim =
    promo === "invalido" ||
    (typeof promo === "number" && (promo <= 0 || normal === null || normal === "invalido" || promo >= normal));

  return (
    <div className="store-section">
      <h3 className="section-title" style={{ marginBottom: 6 }}>
        <span className="dot" />
        Loja online
      </h3>

      {atacado ? (
        <div className="banner banner-warning" style={{ margin: "0 0 12px" }}>
          <span>⚠️</span>
          <span>{WHOLESALE_BLOCK_MESSAGE}</span>
        </div>
      ) : (
        <span className="hint" style={{ display: "block", marginBottom: 10 }}>
          A loja lê estes dados sozinha. Peça fora do site não aparece para o cliente.
        </span>
      )}

      <div className="field field--full">
        <div className="radio-row">
          <button
            type="button"
            disabled={atacado}
            className={"radio-chip" + (form.show_online ? " selected" : "")}
            onClick={() => onChange({ show_online: !form.show_online, ...(form.show_online ? { featured: false } : {}) })}
          >
            No site
          </button>
          <button
            type="button"
            disabled={atacado || !form.show_online}
            title={!form.show_online ? 'Ligue "No site" primeiro' : undefined}
            className={"radio-chip" + (form.featured ? " selected" : "")}
            onClick={() => onChange({ featured: !form.featured })}
          >
            Carrossel
          </button>
        </div>
        <span className="hint">O carrossel é o destaque no topo da loja e só vale para peças que estão no site.</span>
      </div>

      <div className="form-grid" style={{ marginTop: 12 }}>
        <div className="field">
          <label>Preço promocional (opcional)</label>
          <div className="money-input">
            <span className="prefix">R$</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Vazio = sem promoção"
              value={form.sale_price}
              onChange={(e) => onChange({ sale_price: e.target.value })}
            />
          </div>
          {promoRuim && (
            <span className="hint" style={{ color: "var(--danger)" }}>
              O preço promocional precisa ser menor que o preço normal
              {normal === null ? " (preencha o preço de venda acima)" : ""}.
            </span>
          )}
        </div>
        <div className="field field--full">
          <label>Descrição para o cliente</label>
          <textarea
            rows={3}
            placeholder="Texto que aparece na loja online"
            value={form.public_description}
            onChange={(e) => onChange({ public_description: e.target.value })}
          />
        </div>
      </div>

      <PhotoManager productId={productId} />
    </div>
  );
}

function PhotoManager({ productId }: { productId: number | null }) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!productId) return;
    fetch(`/api/products/${productId}/photos`)
      .then((r) => r.json())
      .then((d) => setPhotos(d.items || []))
      .catch(() => setPhotos([]));
  }, [productId]);

  if (!productId) {
    return (
      <div className="field field--full" style={{ marginTop: 12 }}>
        <label>Fotos extras</label>
        <span className="hint">Salve a peça primeiro. Depois, ao editar, dá para acrescentar as fotos extras.</span>
      </div>
    );
  }

  async function adicionar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (arquivos.length === 0) return;
    setBusy(true);
    setErro("");
    try {
      for (const arquivo of arquivos) {
        const fd = new FormData();
        fd.append("file", arquivo);
        const up = await fetch("/api/upload", { method: "POST", body: fd });
        if (!up.ok) {
          setErro("Não foi possível enviar uma das fotos. Verifique se o armazenamento (Vercel Blob) está configurado.");
          break;
        }
        const { url } = await up.json();
        const res = await fetch(`/api/products/${productId}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const dados = await res.json().catch(() => ({}));
        if (!res.ok) {
          setErro(dados.message || "Não foi possível salvar a foto.");
          break;
        }
        setPhotos((atual) => [...atual, dados.item]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function remover(foto: Photo) {
    if (!window.confirm("Remover esta foto?")) return;
    const res = await fetch(`/api/products/${productId}/photos?photoId=${foto.id}`, { method: "DELETE" });
    if (res.ok) setPhotos((atual) => atual.filter((f) => f.id !== foto.id));
  }

  async function mover(indice: number, delta: -1 | 1) {
    const destino = indice + delta;
    if (destino < 0 || destino >= photos.length) return;
    const nova = [...photos];
    [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
    setPhotos(nova);
    const res = await fetch(`/api/products/${productId}/photos`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: nova.map((f) => f.id) }),
    });
    if (res.ok) {
      const d = await res.json();
      setPhotos(d.items || nova);
    }
  }

  return (
    <div className="field field--full" style={{ marginTop: 12 }}>
      <label>Fotos extras da loja</label>
      <span className="hint">A foto principal é a do cadastro. Estas aparecem depois dela, na ordem abaixo.</span>
      <div className="photo-strip">
        {photos.map((f, i) => (
          <div className="photo-item" key={f.id}>
            <img src={f.url} alt="" />
            <div className="photo-actions">
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Mover para antes">
                ←
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={i === photos.length - 1}
                onClick={() => mover(i, 1)}
                aria-label="Mover para depois"
              >
                →
              </button>
              <button type="button" className="icon-btn danger" onClick={() => remover(f)}>
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>
      <input type="file" accept="image/*" multiple onChange={adicionar} disabled={busy} />
      {busy && <div className="hint">Enviando...</div>}
      {erro && <div className="hint" style={{ color: "var(--danger)" }}>{erro}</div>}
    </div>
  );
}
