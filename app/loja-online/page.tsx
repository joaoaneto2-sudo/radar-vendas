"use client";

import { useEffect, useState } from "react";

type Form = { delivery_salvador: string; shipping_correios: string; installment_fee: string; max_installments: string };

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));

export default function LojaOnlinePage() {
  const [form, setForm] = useState<Form>({ delivery_salvador: "", shipping_correios: "", installment_fee: "", max_installments: "" });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState(false);

  useEffect(() => {
    fetch("/api/store-settings")
      .then((r) => r.json())
      .then((d) => {
        const i = d.item;
        if (i) {
          setForm({
            delivery_salvador: texto(i.delivery_salvador),
            shipping_correios: texto(i.shipping_correios),
            installment_fee: texto(i.installment_fee),
            max_installments: texto(i.max_installments),
          });
        }
      })
      .finally(() => setCarregando(false));
  }, []);

  function set<K extends keyof Form>(chave: K, valor: string) {
    setOk(false);
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro("");
    setOk(false);
    try {
      const res = await fetch("/api/store-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const dados = await res.json().catch(() => ({}));
      if (res.ok) setOk(true);
      else setErro(dados.message || "Não foi possível salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="shell">
      <div className="page-head">
        <p className="eyebrow">Loja online</p>
        <h1>Entrega e parcelamento</h1>
        <p>Estes valores são lidos pela loja online sozinha. Mudou aqui, muda lá.</p>
      </div>

      {carregando ? (
        <div className="loading-state">Carregando...</div>
      ) : (
        <form className="card" onSubmit={salvar}>
          <div className="section">
            <h2 className="section-title">
              <span className="dot" />
              Entrega
            </h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="delivery_salvador">Entrega em Salvador</label>
                <div className="money-input">
                  <span className="prefix">R$</span>
                  <input
                    id="delivery_salvador"
                    type="text"
                    inputMode="decimal"
                    placeholder="Ainda não definido"
                    value={form.delivery_salvador}
                    onChange={(e) => set("delivery_salvador", e.target.value)}
                  />
                </div>
                <span className="hint">Feita pela Fernanda ou por motoboy. Em branco = a loja mostra "a combinar". 0 = entrega grátis.</span>
              </div>
              <div className="field">
                <label htmlFor="shipping_correios">Envio pelos Correios (resto do Brasil)</label>
                <div className="money-input">
                  <span className="prefix">R$</span>
                  <input
                    id="shipping_correios"
                    type="text"
                    inputMode="decimal"
                    placeholder="Ainda não definido"
                    value={form.shipping_correios}
                    onChange={(e) => set("shipping_correios", e.target.value)}
                  />
                </div>
                <span className="hint">Em branco = a loja mostra "a combinar".</span>
              </div>
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">
              <span className="dot" style={{ background: "var(--gold)" }} />
              Parcelamento
            </h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="installment_fee">Acréscimo por parcela</label>
                <div className="money-input">
                  <span className="prefix">R$</span>
                  <input
                    id="installment_fee"
                    type="text"
                    inputMode="decimal"
                    placeholder="Padrão: 10,00"
                    value={form.installment_fee}
                    onChange={(e) => set("installment_fee", e.target.value)}
                  />
                </div>
                <span className="hint">Pode ser 0. Em branco = a loja usa R$ 10,00 por parcela.</span>
              </div>
              <div className="field">
                <label htmlFor="max_installments">Máximo de parcelas</label>
                <input
                  id="max_installments"
                  type="number"
                  min="1"
                  max="24"
                  inputMode="numeric"
                  placeholder="Padrão: 12"
                  value={form.max_installments}
                  onChange={(e) => set("max_installments", e.target.value)}
                />
                <span className="hint">De 1 a 24. Em branco = a loja usa 12x.</span>
              </div>
            </div>
          </div>

          {erro && (
            <div className="banner banner-error" role="alert">
              <span>✕</span>
              <span>{erro}</span>
            </div>
          )}
          {ok && (
            <div className="banner banner-info" role="status">
              <span>✓</span>
              <span>Salvo. A loja já lê os novos valores.</span>
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={salvando}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </form>
      )}
    </main>
  );
}
