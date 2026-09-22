"use client";

import { useEffect, useState } from "react";
import { CAIXA_MINIMO_CM } from "@/lib/store-rules";

type Form = {
  delivery_salvador: string;
  shipping_correios: string;
  installment_fee: string;
  max_installments: string;
  origem_atual: "salvador" | "recife";
  cep_origem_salvador: string;
  cep_origem_recife: string;
  entrega_recife: string;
  caixa_comprimento_cm: string;
  caixa_largura_cm: string;
  caixa_altura_cm: string;
  caixa_peso_g: string;
};

const VAZIO: Form = {
  delivery_salvador: "",
  shipping_correios: "",
  installment_fee: "",
  max_installments: "",
  origem_atual: "salvador",
  cep_origem_salvador: "",
  cep_origem_recife: "",
  entrega_recife: "",
  caixa_comprimento_cm: "",
  caixa_largura_cm: "",
  caixa_altura_cm: "",
  caixa_peso_g: "",
};

const texto = (v: unknown) => (v === null || v === undefined ? "" : String(Number(v)));
// CEP mostrado na tela como 00000-000, mas o que vale para salvar é só os dígitos.
const cepParaTela = (v: unknown) => {
  const digitos = typeof v === "string" ? v.replace(/\D/g, "") : "";
  return digitos.length === 8 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
};

export default function LojaOnlinePage() {
  const [form, setForm] = useState<Form>(VAZIO);
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
            origem_atual: i.origem_atual === "recife" ? "recife" : "salvador",
            cep_origem_salvador: cepParaTela(i.cep_origem_salvador),
            cep_origem_recife: cepParaTela(i.cep_origem_recife),
            entrega_recife: texto(i.entrega_recife),
            caixa_comprimento_cm: texto(i.caixa_comprimento_cm),
            caixa_largura_cm: texto(i.caixa_largura_cm),
            caixa_altura_cm: texto(i.caixa_altura_cm),
            caixa_peso_g: texto(i.caixa_peso_g),
          });
        }
      })
      .finally(() => setCarregando(false));
  }, []);

  function set<K extends keyof Form>(chave: K, valor: Form[K]) {
    setOk(false);
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  // Formata como 00000-000 enquanto digita; só os números contam para salvar.
  function setCep(chave: "cep_origem_salvador" | "cep_origem_recife", digitado: string) {
    const digitos = digitado.replace(/\D/g, "").slice(0, 8);
    const formatado = digitos.length > 5 ? `${digitos.slice(0, 5)}-${digitos.slice(5)}` : digitos;
    set(chave, formatado);
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
        <h1>Loja online</h1>
        <p>Estes valores são lidos pela loja online sozinha. Mudou aqui, muda lá.</p>
      </div>

      {carregando ? (
        <div className="loading-state">Carregando...</div>
      ) : (
        <form className="card" onSubmit={salvar}>
          <div className="section">
            <h2 className="section-title">
              <span className="dot" />
              Origem das peças
            </h2>
            <div className="field field--full">
              <label>As peças estão saindo de</label>
              <div className="radio-row">
                <button
                  type="button"
                  className={"radio-chip" + (form.origem_atual === "salvador" ? " selected" : "")}
                  onClick={() => set("origem_atual", "salvador")}
                >
                  Salvador
                </button>
                <button
                  type="button"
                  className={"radio-chip" + (form.origem_atual === "recife" ? " selected" : "")}
                  onClick={() => set("origem_atual", "recife")}
                >
                  Recife
                </button>
              </div>
              <span className="hint">A loja usa esta origem para calcular o PAC e o SEDEX pelo Melhor Envio.</span>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="cep_origem_salvador">CEP de origem em Salvador</label>
                <input
                  id="cep_origem_salvador"
                  type="text"
                  inputMode="numeric"
                  placeholder="00000-000"
                  maxLength={9}
                  value={form.cep_origem_salvador}
                  onChange={(e) => setCep("cep_origem_salvador", e.target.value)}
                />
                <span className="hint">Os 8 números do CEP de onde as peças saem quando estão em Salvador.</span>
              </div>
              <div className="field">
                <label htmlFor="cep_origem_recife">CEP de origem em Recife</label>
                <input
                  id="cep_origem_recife"
                  type="text"
                  inputMode="numeric"
                  placeholder="00000-000"
                  maxLength={9}
                  value={form.cep_origem_recife}
                  onChange={(e) => setCep("cep_origem_recife", e.target.value)}
                />
                <span className="hint">Os 8 números do CEP de onde as peças saem quando estão no Recife.</span>
              </div>
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">
              <span className="dot" />
              Entrega
            </h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="delivery_salvador">Entrega local em Salvador</label>
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
                <label htmlFor="entrega_recife">Entrega local em Recife</label>
                <div className="money-input">
                  <span className="prefix">R$</span>
                  <input
                    id="entrega_recife"
                    type="text"
                    inputMode="decimal"
                    placeholder="Ainda não definido"
                    value={form.entrega_recife}
                    onChange={(e) => set("entrega_recife", e.target.value)}
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
                <span className="hint">Valor fixo de referência. O PAC e o SEDEX de verdade são calculados pelo Melhor Envio.</span>
              </div>
            </div>
          </div>

          <div className="section">
            <h2 className="section-title">
              <span className="dot" style={{ background: "var(--gold)" }} />
              Caixa padrão de envio
            </h2>
            <p className="hint" style={{ marginBottom: 10 }}>
              Medidas da caixinha usada para enviar uma peça, para o Melhor Envio calcular o frete. Mínimo aceito pelos Correios:{" "}
              {CAIXA_MINIMO_CM.comprimento} x {CAIXA_MINIMO_CM.largura} x {CAIXA_MINIMO_CM.altura} cm.
            </p>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="caixa_comprimento_cm">Comprimento (cm)</label>
                <input
                  id="caixa_comprimento_cm"
                  type="number"
                  min={CAIXA_MINIMO_CM.comprimento}
                  inputMode="numeric"
                  placeholder={`Mínimo: ${CAIXA_MINIMO_CM.comprimento}`}
                  value={form.caixa_comprimento_cm}
                  onChange={(e) => set("caixa_comprimento_cm", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="caixa_largura_cm">Largura (cm)</label>
                <input
                  id="caixa_largura_cm"
                  type="number"
                  min={CAIXA_MINIMO_CM.largura}
                  inputMode="numeric"
                  placeholder={`Mínimo: ${CAIXA_MINIMO_CM.largura}`}
                  value={form.caixa_largura_cm}
                  onChange={(e) => set("caixa_largura_cm", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="caixa_altura_cm">Altura (cm)</label>
                <input
                  id="caixa_altura_cm"
                  type="number"
                  min={CAIXA_MINIMO_CM.altura}
                  inputMode="numeric"
                  placeholder={`Mínimo: ${CAIXA_MINIMO_CM.altura}`}
                  value={form.caixa_altura_cm}
                  onChange={(e) => set("caixa_altura_cm", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="caixa_peso_g">Peso (g)</label>
                <input
                  id="caixa_peso_g"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  placeholder="Ex: 100"
                  value={form.caixa_peso_g}
                  onChange={(e) => set("caixa_peso_g", e.target.value)}
                />
              </div>
            </div>
            <span className="hint">Cada medida é opcional; pode preencher aos poucos. Em branco = a loja usa o padrão dela.</span>
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
