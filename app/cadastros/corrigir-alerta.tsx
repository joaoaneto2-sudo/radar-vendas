"use client";

// Janelinha do alerta: aberta ao clicar num alerta. Diz qual é o problema e como resolver, e já resolve:
// custo, preço de venda, código, dúvida de custo (Radar x pasta). Para foto e foto da modelo, explica o passo a passo
// e leva para a edição da peça. Grava na hora (POST /api/products/[id]/corrigir) e o histórico registra quem mudou.

import { useState } from "react";
import { formatBRL, type Product } from "@/lib/format";
import { lerValor } from "@/lib/catalogo-filtro";
import { proximoCodigo } from "@/lib/codigo-da-peca";
import { MARKUP_PADRAO } from "@/lib/importar-lote";
import { AJUDA_DO_ALERTA, TEXTO_DO_ALERTA, type ChaveAlerta } from "@/lib/alertas-da-peca";

export type AlertaCorrigivel = ChaveAlerta;

const reais2 = (n: number) => (Math.round(n * 100) / 100).toFixed(2).replace(".", ",");

export default function CorrigirAlerta({
  peca,
  alerta,
  doFabricante,
  aoFechar,
  aoSalvar,
  aoAbrirPeca,
}: {
  peca: Product;
  alerta: AlertaCorrigivel;
  doFabricante: Product[];
  aoFechar: () => void;
  aoSalvar: (item: Partial<Product>) => void;
  aoAbrirPeca: (p: Product) => void;
}) {
  const custoAtual = peca.cost === null || peca.cost === undefined || peca.cost === "" ? null : Number(peca.cost);
  const precoAtual = peca.price === null || peca.price === undefined || peca.price === "" ? null : Number(peca.price);
  const custoDaPasta = peca.custo_da_pasta === null || peca.custo_da_pasta === undefined || peca.custo_da_pasta === "" ? null : Number(peca.custo_da_pasta);
  const sugestaoDeCodigo = proximoCodigo(doFabricante, peca.manufacturer_name ?? "", peca.category);
  const ajuda = AJUDA_DO_ALERTA[alerta];
  const comCampo = alerta === "custo" || alerta === "preco" || alerta === "codigo";

  const [valor, setValor] = useState(alerta === "codigo" ? sugestaoDeCodigo : "");
  const [calcularPreco, setCalcularPreco] = useState(alerta === "custoPasta" ? true : precoAtual === null || precoAtual <= 0);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const numero = lerValor(valor);
  const precoPelaRegra =
    alerta === "custo" && numero ? numero * MARKUP_PADRAO : alerta === "preco" && custoAtual ? custoAtual * MARKUP_PADRAO : alerta === "custoPasta" && custoDaPasta ? custoDaPasta * MARKUP_PADRAO : null;

  async function enviar(corpo: Record<string, unknown>) {
    if (salvando) return;
    setSalvando(true);
    setErro("");
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

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    enviar(alerta === "custo" ? { custo: valor, calcularPreco } : alerta === "preco" ? { preco: valor } : { codigo: valor });
  }

  return (
    <div className="modal-overlay" onClick={aoFechar}>
      <form className="modal-panel" onClick={(e) => e.stopPropagation()} onSubmit={salvar} style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>{TEXTO_DO_ALERTA[alerta]}</h2>
          <button type="button" className="icon-btn" onClick={aoFechar}>
            Fechar
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 10 }}>
          {peca.name || "(sem nome)"}
          {peca.manufacturer_name ? ` · ${peca.manufacturer_name}` : ""}
          {peca.manufacturer_code ? ` · ${peca.manufacturer_code}` : ""}
        </p>

        <div className="banner banner-info" style={{ marginBottom: 12, alignItems: "flex-start" }}>
          <span>💡</span>
          <span>
            <strong>O problema:</strong> {ajuda.problema}
            <br />
            <strong>Como resolver:</strong> {ajuda.comoResolver}
          </span>
        </div>

        {comCampo && (
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
        )}

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

        {alerta === "custoPasta" && (
          <>
            <div className="stat-grid auto" style={{ marginBottom: 10 }}>
              <div className="stat-tile">
                <div className="label">No Radar</div>
                <div className="value">{formatBRL(custoAtual)}</div>
              </div>
              <div className="stat-tile">
                <div className="label">No nome do arquivo (pasta)</div>
                <div className="value">{formatBRL(custoDaPasta)}</div>
              </div>
            </div>
            <label style={{ display: "block", marginBottom: 6 }}>
              <input type="checkbox" checked={calcularPreco} onChange={(e) => setCalcularPreco(e.target.checked)} style={{ marginRight: 8 }} />
              Se usar o da pasta, refazer o preço de venda: custo × 2,5{precoPelaRegra ? ` = ${formatBRL(precoPelaRegra)}` : ""}
              {precoAtual !== null && precoAtual > 0 ? ` (hoje ${formatBRL(precoAtual)})` : ""}
            </label>
          </>
        )}

        {(alerta === "foto" || alerta === "modelo") && (
          <ol className="hint" style={{ margin: "0 0 8px 18px" }}>
            <li>Salve a foto na pasta do fabricante{peca.manufacturer_name ? ` (${peca.manufacturer_name})` : ""}.</li>
            <li>
              Nome padrão: <strong>{peca.manufacturer_code || "CÓDIGO"} - {peca.name || "Nome da peça"} - {alerta === "modelo" ? "modelo" : "custo 00,00"}</strong>
            </li>
            <li>Avise para eu varrer as pastas e subir a foto. Ou, se preferir, abra a peça agora e adicione a foto lá.</li>
          </ol>
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
          {comCampo && (
            <button type="submit" className="btn btn-primary" disabled={salvando || valor.trim() === ""}>
              {salvando ? "Salvando..." : "Salvar"}
            </button>
          )}
          {alerta === "custoPasta" && (
            <>
              <button type="button" className="btn btn-ghost" disabled={salvando} onClick={() => enviar({ resolverCusto: "radar" })}>
                Ficar com o do Radar ({formatBRL(custoAtual)})
              </button>
              <button type="button" className="btn btn-primary" disabled={salvando} onClick={() => enviar({ resolverCusto: "pasta", calcularPreco })}>
                Usar o da pasta ({formatBRL(custoDaPasta)})
              </button>
            </>
          )}
          {(alerta === "foto" || alerta === "modelo") && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                aoFechar();
                aoAbrirPeca(peca);
              }}
            >
              Abrir a peça
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
