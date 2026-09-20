"use client";

import { formatDateBR } from "@/lib/format";
import { formatCentsBRL, toCents } from "@/lib/finance/money";
import { RECEIPT_KIND_LABELS, type ReceiptFormKind } from "@/lib/receipts";
import { COLUNAS, montarQuadro, textoDoPrazo, type ColunaDoQuadro, type LinhaDoQuadro } from "@/lib/recebimentos-quadro";

// Quadro "A receber": um cartão por recebimento, em colunas por situação.
// As ações são as mesmas da lista (Recebi, Editar, Desfazer): quem abre as janelas é a página.

export type CartaoDeRecebimento = LinhaDoQuadro & {
  source: "livro" | "parcela" | "atacado"; // atacado = comissão prevista pelas vendas (não é lançamento)
  id: number;
  kind: ReceiptFormKind;
  manufacturer_id: number | null;
  manufacturer_name: string | null;
  from_name: string | null;
  from_nickname: string | null;
  reason: string | null;
  payment_method: string | null;
};

function quem(c: CartaoDeRecebimento): string {
  const partes = [c.from_name, c.manufacturer_name && c.kind === "comissao_fabricante" ? `via ${c.manufacturer_name}` : null];
  return partes.filter(Boolean).join(" ") || RECEIPT_KIND_LABELS[c.kind];
}

export default function QuadroDeRecebimentos({
  linhas,
  hoje,
  aoReceber,
  aoEditar,
  aoDesfazer,
}: {
  linhas: CartaoDeRecebimento[];
  hoje: string;
  aoReceber: (c: CartaoDeRecebimento) => void;
  aoEditar: (c: CartaoDeRecebimento) => void;
  aoDesfazer: (c: CartaoDeRecebimento) => void;
}) {
  const quadro = montarQuadro(linhas, hoje);

  return (
    <div className="rq" role="list" aria-label="Recebimentos por situação">
      {COLUNAS.map((coluna) => {
        const { cartoes, totalCents } = quadro[coluna.chave];
        return (
          <section key={coluna.chave} className={`rq-col rq-col--${coluna.chave}`} role="listitem" aria-label={coluna.titulo}>
            <header className="rq-head">
              <div className="rq-title">
                <h3>{coluna.titulo}</h3>
                <span className="rq-count">{cartoes.length}</span>
              </div>
              <strong className="rq-total">{formatCentsBRL(totalCents)}</strong>
            </header>

            <div className="rq-cards">
              {cartoes.length === 0 ? (
                <div className="rq-empty">{coluna.vazio}</div>
              ) : (
                cartoes.map((c) => <Cartao key={`${c.source}-${c.id}`} c={c} coluna={coluna.chave} hoje={hoje} aoReceber={aoReceber} aoEditar={aoEditar} aoDesfazer={aoDesfazer} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Cartao({
  c,
  coluna,
  hoje,
  aoReceber,
  aoEditar,
  aoDesfazer,
}: {
  c: CartaoDeRecebimento;
  coluna: ColunaDoQuadro;
  hoje: string;
  aoReceber: (c: CartaoDeRecebimento) => void;
  aoEditar: (c: CartaoDeRecebimento) => void;
  aoDesfazer: (c: CartaoDeRecebimento) => void;
}) {
  const recebida = c.status === "recebida";
  const data = recebida ? c.received_date : c.expected_date;
  return (
    <article className={`rq-card rq-card--${coluna}`}>
      <div className="rq-top">
        <strong className="rq-quem" title={quem(c)}>
          {quem(c)}
        </strong>
        <span className="rq-valor">{formatCentsBRL(toCents(c.amount))}</span>
      </div>

      <div className="rq-meta">
        <span className="rq-chip">{c.source === "atacado" ? "Comissão prevista" : RECEIPT_KIND_LABELS[c.kind]}</span>
        <span className={"rq-prazo" + (coluna === "atrasadas" ? " rq-prazo--late" : "")}>{textoDoPrazo(c, hoje)}</span>
      </div>

      <div className="rq-info">
        {data && <span>{formatDateBR(data)}</span>}
        {c.payment_method && <span>{c.payment_method}</span>}
        {c.reason && c.kind !== "parcela_venda" && <span>{c.reason}</span>}
      </div>

      <div className="rq-actions">
        {!recebida && (
          <button type="button" className="btn btn-primary btn-small" onClick={() => aoReceber(c)}>
            Recebi
          </button>
        )}
        {c.source === "livro" && (
          <button type="button" className="icon-btn" onClick={() => aoEditar(c)}>
            Editar
          </button>
        )}
        {(c.source === "livro" || recebida) && (
          <button type="button" className="icon-btn danger" onClick={() => aoDesfazer(c)}>
            {c.source === "parcela" ? "Desfazer" : "Apagar"}
          </button>
        )}
      </div>
    </article>
  );
}
