"use client";

// Janelinha de correção rápida: aberta ao clicar num alerta de custo, preço de venda ou código.
// Grava na hora (POST /api/products/[id]/corrigir) e o histórico de alterações registra quem mudou.

import { useState } from "react";
import { formatBRL, type Product } from "@/lib/format";
import { lerValor } from "@/lib/catalogo-filtro";
import { proximoCodigo } from "@/lib/codigo-da-peca";
import { MARKUP_PADRAO } from "@/lib/importar-lote";

export type AlertaCorrigivel = "custo" | "preco" | "codigo";

const TITULO: Record<AlertaCorrigivel, string> = {
  custo: "Falta preço de custo",
  preco: "Falta preço de venda",
  codigo: "Falta código",
};

const reais2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");

export default function CorrigirAlerta({
  peca,
  alerta,
  doFabricante,
  aoFechar,
  aoSalvar,
}: {
  peca: Product;
  alerta: AlertaCorrigivel;
  doFabricante: Product[];
  aoFechar: () => void;
  aoSalvar: (item: Partial<Product>) => void;
}) {
  const custoAtual = peca.cost === null || peca.cost === undefined || peca.cost === "" ? null : Number(peca.cost);
  const precoAtual = peca.price === null || peca.price === undefined || peca.price === "" ? null : Number(peca.price);
  const sugestaoDeCodigo = proximoCodigo(doFabricante, peca.manufacturer_name ?? "", peca.category);

  const [valor, setValor] = useState(alerta === "codigo" ? sugestaoDeCodigo : "");
  const [calcularPreco, setCalcularPreco] = useState(precoAtual === null || precoAtual <= 0);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const numero = lerValor(valor);
  const precoPelaRegra = alerta === "custo" && numero ? numero * MARKUP_PADRAO : alerta === "preco" && custoAtual ? custoAtual * MARKUP_PADRAO : null;

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro("");
    const corpo =
      alerta === "custo" ? { custo: valor, calcularPreco } : alerta === "preco" ? { preco: valor } : { codigo: valor };
    try {
      const res = await fetch(`/api/products/${peca.id}/corrigir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(d.message || "Não foi possível salvar. Tente novamente.");
        return;
      }
      aoSalvar(d.item);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={aoFechar}>
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={salvar} style={{ maxWidth: 480 }}>
        <div className="modal-head">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>{TITULO[alerta]}</h2>
          <button type="button" className="icon-btn" onClick={aoFechar}>
            Fechar
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 12 }}>
          {peca.name || "(sem nome)"}
          {peca.manufacturer_name ? ` · ${peca.manufacturer_name}` : ""}
        </p>

        <div className="field field--full">
          <label>{alerta === "custo" ? "Preço de custo (R$)" : alerta === "preco" ? "Preço de venda (R$)" : "Código da peça"}</label>
          <input
            type="text"
            inputMode={alerta === "codigo" ? "text" : "decimal"}
            value={valor}
            autoFocus
            placeholder={alerta === "codigo" ? "BRILHARE-BR-005" : "0,00"}
            onChange={(e) => setValor(alerta === "codigo" ? e.target.value.toUpperCase() : e.target.value)}
          />
          {alerta === "codigo" && <span className="hint">Sugestão: o próximo número livre deste fabricante. Pode mudar.</span>}
        </div>

        {alerta === "custo" && (
          <label style={{ display: "block", marginTop: 10 }}>
            <input type="checkbox" checked={calcularPreco} onChange={(e) => setCalcularPreco(e.target.checked)} style={{ marginRight: 8 }} />
            Refazer o preço de venda: custo × 2,5{precoPelaRegra ? ` = ${formatBRL(precoPelaRegra)}` : ""}
            {precoAtual !== null && precoAtual > 0 ? ` (hoje ${formatBRL(precoAtual)})` : ""}
          </label>
        )}
        {alerta === "preco" && precoPelaRegra && (
          <button type="button" className="btn btn-ghost btn-small" style={{ marginTop: 10 }} onClick={() => setValor(reais2(precoPelaRegra))}>
            Usar custo × 2,5 = {formatBRL(precoPelaRegra)}
          </button>
        )}

        {erro && (
          <div className="banner banner-warning" role="alert" style={{ marginTop: 12 }}>
            <span>⚠️</span>
            <span>{erro}</span>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={salvando || valor.trim() === ""}>
            {salvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </div>
  );
}
