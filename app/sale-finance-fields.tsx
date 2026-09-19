"use client";

import { useEffect } from "react";
import { formatBRL, formatDateBR, Manufacturer, Sale } from "@/lib/format";
import { formatCentsBRL } from "@/lib/finance/money";
import {
  PIX_A_PRAZO,
  PRICE_TIERS,
  centsOrZero,
  commissionCents,
  expectedCommissionDate,
  paymentsDifference,
  suggestPayments,
  type PaymentRow,
  type PriceTier,
} from "@/lib/sale-finance";

// Campos do financeiro da venda, usados na tela "Nova venda" e na edição do Relatório:
// modalidade (varejo, atacado ou consignado), custos, taxa, parcelas do Pix a prazo e
// dados do atacado. Nada aqui é obrigatório: salvar nunca é bloqueado.

export type FinanceForm = {
  price_tier: PriceTier;
  sale_costs: string;
  payment_fee: string;
  manufacturer_id: number | null;
  stock_received_date: string;
  payments: PaymentRow[];
  paymentsManual: boolean; // true: o valor das parcelas foi digitado à mão, não refazer sozinho
};

export const EMPTY_FINANCE: FinanceForm = {
  price_tier: "varejo",
  sale_costs: "",
  payment_fee: "",
  manufacturer_id: null,
  stock_received_date: "",
  payments: [],
  paymentsManual: false,
};

function numeroOuVazio(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isNaN(n) || n === 0 ? "" : String(n);
}

export function financeFromSale(s: Sale): FinanceForm {
  return {
    price_tier: s.price_tier ?? "varejo",
    sale_costs: numeroOuVazio(s.sale_costs),
    payment_fee: numeroOuVazio(s.payment_fee),
    manufacturer_id: s.manufacturer_id ?? null,
    stock_received_date: s.stock_received_date ? s.stock_received_date.slice(0, 10) : "",
    payments: (s.payments ?? []).map((p) => ({
      due_date: p.due_date ?? "",
      amount: String(Number(p.amount)),
      received: p.status === "recebida",
      received_date: p.received_date ?? "",
    })),
    paymentsManual: true, // vendas já salvas: não mexer nos valores das parcelas sem o João pedir
  };
}

/** Campos financeiros que vão junto com a venda para a API. */
export function financePayload(f: FinanceForm, paymentMethod: string): Record<string, unknown> {
  const atacado = f.price_tier === "atacado";
  return {
    price_tier: f.price_tier,
    sale_costs: atacado ? "0" : f.sale_costs,
    payment_fee: atacado ? "0" : f.payment_fee,
    manufacturer_id: atacado ? f.manufacturer_id : null,
    stock_received_date: atacado ? f.stock_received_date : "",
    payments: !atacado && paymentMethod === PIX_A_PRAZO ? f.payments : [],
  };
}

type Mudar = (patch: Partial<FinanceForm>) => void;

export function TierPicker({ form, onChange }: { form: FinanceForm; onChange: Mudar }) {
  const atual = PRICE_TIERS.find((t) => t.value === form.price_tier);
  return (
    <div className="field field--full">
      <label>Tipo de saída</label>
      <div className="radio-row">
        {PRICE_TIERS.map((t) => (
          <button
            type="button"
            key={t.value}
            className={"radio-chip" + (form.price_tier === t.value ? " selected" : "")}
            onClick={() => onChange({ price_tier: t.value })}
          >
            {t.label}
          </button>
        ))}
      </div>
      {atual && <span className="hint">{atual.hint}</span>}
    </div>
  );
}

export function AtacadoFields({
  form,
  onChange,
  saleValue,
  manufacturers,
}: {
  form: FinanceForm;
  onChange: Mudar;
  saleValue: string;
  manufacturers: Manufacturer[];
}) {
  const escolhido = manufacturers.find((m) => m.id === form.manufacturer_id) ?? null;
  const representados = manufacturers.filter((m) => m.represented || m.id === form.manufacturer_id);
  const pct = escolhido?.represented && escolhido.commission_pct !== null ? Number(escolhido.commission_pct) : null;
  const comissao = commissionCents(saleValue, pct);

  return (
    <>
      <div className="field field--full">
        <label>Fabricante</label>
        <select
          value={form.manufacturer_id ?? ""}
          onChange={(e) => onChange({ manufacturer_id: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Escolha o fabricante...</option>
          {representados.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {representados.length === 0 && (
          <span className="hint">
            Nenhum fabricante representado. Em Cadastros, aba Fabricantes, marque "Representamos" e informe a comissão.
          </span>
        )}
      </div>

      {(!escolhido || !escolhido.represented) && (
        <div className="field field--full">
          <div className="banner banner-warning" style={{ margin: 0 }}>
            <span>⚠️</span>
            <span>
              {escolhido
                ? "Este fabricante não está marcado como representado. Sem isso, a venda de atacado fica fora das contas."
                : "Sem o fabricante, a venda de atacado fica fora das contas. Dá para escolher depois."}
            </span>
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="stock_received_date">Dia em que a empresa recebeu o estoque do fabricante</label>
        <input
          id="stock_received_date"
          type="date"
          value={form.stock_received_date}
          onChange={(e) => onChange({ stock_received_date: e.target.value })}
        />
        <span className="hint">Deixe em branco se ainda não chegou.</span>
      </div>

      {escolhido?.represented && pct !== null && (
        <div className="field">
          <label>Comissão da empresa</label>
          <div className="banner banner-info" style={{ margin: 0 }}>
            <span>💰</span>
            <span>
              {`${String(pct).replace(".", ",")}% de ${formatBRL(centsOrZero(saleValue) / 100)} = `}
              <strong>{formatCentsBRL(comissao)}</strong>
              {form.stock_received_date
                ? `. Lembrete: ${formatDateBR(expectedCommissionDate(form.stock_received_date, escolhido.commission_days))}.`
                : "."}
            </span>
          </div>
        </div>
      )}

      <div className="field field--full">
        <span className="hint">
          O cliente paga direto ao fabricante. A comissão entra quando o fabricante pagar: lance em Financeiro,
          Recebimentos.
        </span>
      </div>
    </>
  );
}

export function CostFields({ form, onChange }: { form: FinanceForm; onChange: Mudar }) {
  return (
    <>
      <div className="field">
        <label htmlFor="sale_costs">Custos da venda</label>
        <div className="money-input">
          <span className="prefix">R$</span>
          <input
            id="sale_costs"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="Frete, embalagem, brinde..."
            value={form.sale_costs}
            onChange={(e) => onChange({ sale_costs: e.target.value })}
          />
        </div>
      </div>
      <div className="field">
        <label htmlFor="payment_fee">Taxa da maquininha ou do link</label>
        <div className="money-input">
          <span className="prefix">R$</span>
          <input
            id="payment_fee"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            value={form.payment_fee}
            onChange={(e) => onChange({ payment_fee: e.target.value })}
          />
        </div>
      </div>
      <div className="field field--full">
        <span className="hint">
          Custos e taxa saem do lucro antes da divisão. O custo da peça não entra aqui: a reposição de 30% já cobre.
        </span>
      </div>
    </>
  );
}

export function PixPlan({
  form,
  onChange,
  saleValue,
  saleDate,
}: {
  form: FinanceForm;
  onChange: Mudar;
  saleValue: string;
  saleDate: string;
}) {
  const linhas = form.payments;

  // Primeira vez em "Pix a prazo": já sugere 2 parcelas.
  useEffect(() => {
    if (linhas.length === 0) onChange({ payments: suggestPayments(saleValue, 2, saleDate), paymentsManual: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enquanto os valores não foram digitados à mão, acompanham o valor da venda.
  useEffect(() => {
    if (form.paymentsManual || linhas.length === 0) return;
    const novas = suggestPayments(saleValue, linhas.length, saleDate);
    const mudou = novas.some((n, i) => n.amount !== linhas[i].amount);
    if (mudou) onChange({ payments: linhas.map((l, i) => ({ ...l, amount: novas[i].amount })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saleValue]);

  function refazer(n: number) {
    const total = Math.min(Math.max(n || 1, 1), 24);
    onChange({ payments: suggestPayments(saleValue, total, saleDate), paymentsManual: false });
  }

  function editar(i: number, patch: Partial<PaymentRow>, manual = false) {
    onChange({
      payments: linhas.map((l, j) => (j === i ? { ...l, ...patch } : l)),
      ...(manual ? { paymentsManual: true } : {}),
    });
  }

  const diferenca = paymentsDifference(saleValue, linhas);

  return (
    <div className="installments-box pix-plan">
      <div className="field">
        <label htmlFor="pix_parcelas">Nº de parcelas</label>
        <input
          id="pix_parcelas"
          type="number"
          min="1"
          max="24"
          inputMode="numeric"
          value={linhas.length || ""}
          onChange={(e) => refazer(Number(e.target.value))}
        />
        <span className="hint">Mudar o número refaz a divisão igual, uma parcela por mês.</span>
      </div>

      {linhas.map((l, i) => (
        <div className="pay-row" key={i}>
          <div className="field">
            <label>{`Parcela ${i + 1}: vence em`}</label>
            <input type="date" value={l.due_date} onChange={(e) => editar(i, { due_date: e.target.value })} />
          </div>
          <div className="field">
            <label>Valor</label>
            <div className="money-input">
              <span className="prefix">R$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={l.amount}
                onChange={(e) => editar(i, { amount: e.target.value }, true)}
              />
            </div>
          </div>
          <label className="check-inline">
            <input
              type="checkbox"
              checked={l.received}
              onChange={(e) =>
                editar(i, { received: e.target.checked, received_date: e.target.checked ? l.received_date || saleDate : "" })
              }
            />
            Já recebida
          </label>
          {l.received && (
            <div className="field">
              <label>Recebida em</label>
              <input type="date" value={l.received_date} onChange={(e) => editar(i, { received_date: e.target.value })} />
            </div>
          )}
        </div>
      ))}

      {linhas.length > 0 && (
        <div className="field field--full">
          {diferenca === 0 ? (
            <span className="hint">As parcelas somam o valor da venda.</span>
          ) : (
            <div className="banner banner-warning" style={{ margin: 0 }}>
              <span>⚠️</span>
              <span>
                {`As parcelas somam ${formatCentsBRL(centsOrZero(saleValue) + diferenca)} e a venda tem ${formatCentsBRL(centsOrZero(saleValue))}. Dá para salvar assim e acertar depois.`}
              </span>
            </div>
          )}
          <button type="button" className="icon-btn" style={{ marginTop: 8 }} onClick={() => refazer(linhas.length)}>
            Dividir igualmente de novo
          </button>
        </div>
      )}
    </div>
  );
}
