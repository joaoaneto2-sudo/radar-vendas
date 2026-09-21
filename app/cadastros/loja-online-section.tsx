"use client";

import { WHOLESALE_BLOCK_MESSAGE, readMoneyOrNull } from "@/lib/store-rules";

// Seção "Loja online" do cadastro da peça: No site, Carrossel, preço promocional,
// e descrição para o cliente. As fotos ficam em "Fotos da peça", no alto do cadastro.

export type StoreFormPart = {
  show_online: boolean;
  featured: boolean;
  sale_price: string;
  public_description: string;
};

export default function LojaOnlineSection({
  form,
  onChange,
  channel,
  price,
}: {
  form: StoreFormPart;
  onChange: (patch: Partial<StoreFormPart>) => void;
  channel: string;
  price: string;
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

    </div>
  );
}
