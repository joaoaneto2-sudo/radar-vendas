"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateBR, Manufacturer } from "@/lib/format";
import { formatCentsBRL, toCents } from "@/lib/finance/money";
import { RECEIPT_KIND_LABELS, RECEIPT_PAYMENT_METHODS, type ReceiptFormKind } from "@/lib/receipts";

type Linha = {
  source: "livro" | "parcela";
  id: number;
  kind: ReceiptFormKind;
  status: "prevista" | "recebida";
  received_date: string | null;
  expected_date: string | null;
  amount: string;
  partner: "joao" | "fernanda" | null;
  manufacturer_id: number | null;
  manufacturer_name: string | null;
  sale_id: number | null;
  from_name: string | null;
  from_nickname: string | null;
  reason: string | null;
  payment_method: string | null;
};

type Form = {
  kind: ReceiptFormKind;
  status: "prevista" | "recebida";
  received_date: string;
  expected_date: string;
  amount: string;
  partner: "joao" | "fernanda" | "";
  manufacturer_id: string;
  payment_id: string;
  from_name: string;
  from_nickname: string;
  reason: string;
  payment_method: string;
};

const KINDS: ReceiptFormKind[] = ["aporte_socio", "comissao_fabricante", "outra_receita", "parcela_venda"];

function hojeISO(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function formVazio(): Form {
  return {
    kind: "comissao_fabricante",
    status: "recebida",
    received_date: hojeISO(),
    expected_date: "",
    amount: "",
    partner: "",
    manufacturer_id: "",
    payment_id: "",
    from_name: "",
    from_nickname: "",
    reason: "",
    payment_method: "",
  };
}

function linhaParaForm(l: Linha): Form {
  return {
    kind: l.kind,
    status: l.status,
    received_date: l.received_date ?? hojeISO(),
    expected_date: l.expected_date ?? "",
    amount: l.amount ? String(Number(l.amount)) : "",
    partner: l.partner ?? "",
    manufacturer_id: l.manufacturer_id ? String(l.manufacturer_id) : "",
    payment_id: "",
    from_name: l.from_name ?? "",
    from_nickname: l.from_nickname ?? "",
    reason: l.reason ?? "",
    payment_method: l.payment_method ?? "",
  };
}

export default function RecebimentosPage() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [fabricantes, setFabricantes] = useState<Manufacturer[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState<"recebidos" | "a_receber">("recebidos");
  const [editando, setEditando] = useState<Linha | "novo" | null>(null);
  const [form, setForm] = useState<Form>(formVazio());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  function carregar() {
    Promise.all([fetch("/api/receipts").then((r) => r.json()), fetch("/api/manufacturers").then((r) => r.json())])
      .then(([r, m]) => {
        setLinhas(r.items || []);
        setFabricantes(m.items || []);
      })
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  const hoje = hojeISO();
  const recebidos = linhas.filter((l) => l.status === "recebida");
  const aReceber = linhas.filter((l) => l.status === "prevista");
  const parcelasPendentes = aReceber.filter((l) => l.source === "parcela");
  const representados = fabricantes.filter((f) => f.represented);

  const resumo = useMemo(() => {
    const soma = (lista: Linha[]) => lista.reduce((total, l) => total + toCents(l.amount), 0);
    return {
      recebido: soma(recebidos.filter((l) => l.kind !== "aporte_socio")),
      aReceber: soma(aReceber),
      aporteJoao: soma(recebidos.filter((l) => l.kind === "aporte_socio" && l.partner === "joao")),
      aporteFernanda: soma(recebidos.filter((l) => l.kind === "aporte_socio" && l.partner === "fernanda")),
    };
  }, [recebidos, aReceber]);

  function set<K extends keyof Form>(chave: K, valor: Form[K]) {
    setForm((f) => ({ ...f, [chave]: valor }));
  }

  function abrirNovo(aoAbrir?: Partial<Form>) {
    setForm({ ...formVazio(), ...aoAbrir });
    setErro("");
    setEditando("novo");
  }

  function abrirEdicao(l: Linha, comoRecebido = false) {
    const f = linhaParaForm(l);
    if (comoRecebido) {
      f.status = "recebida";
      f.received_date = hojeISO();
    }
    setForm(f);
    setErro("");
    setEditando(l);
  }

  // Parcela pendente: abre o formulário já no tipo "parcela de venda", com a parcela escolhida.
  function receberParcela(l: Linha) {
    abrirNovo({ kind: "parcela_venda", payment_id: String(l.id) });
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (salvando) return;
    setSalvando(true);
    setErro("");
    try {
      const novo = editando === "novo";
      const res = await fetch(novo ? "/api/receipts" : `/api/receipts/${(editando as Linha).id}`, {
        method: novo ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setEditando(null);
        carregar();
      } else {
        const dados = await res.json().catch(() => ({}));
        setErro(dados.message || "Não foi possível salvar. Tente novamente.");
      }
    } finally {
      setSalvando(false);
    }
  }

  async function apagar(l: Linha) {
    const parcela = l.source === "parcela";
    const ok = window.confirm(
      parcela
        ? "Desfazer este recebimento? A parcela volta para \"a receber\"."
        : "Apagar este lançamento? Isso muda as contas do painel financeiro."
    );
    if (!ok) return;
    const res = await fetch(`/api/receipts/${l.id}${parcela ? "?fonte=parcela" : ""}`, { method: "DELETE" });
    if (res.ok) carregar();
  }

  const lista = aba === "recebidos" ? recebidos : aReceber;
  const emEdicaoDeLivro = editando !== null && editando !== "novo";
  const ehParcela = form.kind === "parcela_venda";
  const semValor = ehParcela;
  const comLembrete = form.kind !== "aporte_socio" && !ehParcela;
  const recebida = form.status === "recebida" || !comLembrete;

  function situacao(l: Linha) {
    if (l.status === "recebida") return <span className="stock-pill ok">Recebido</span>;
    if (l.expected_date && l.expected_date < hoje) return <span className="stock-pill out">Atrasado</span>;
    return <span className="stock-pill low">A receber</span>;
  }

  function dono(l: Linha) {
    if (l.kind === "aporte_socio") return l.partner === "joao" ? "João" : "Fernanda";
    const partes = [l.from_name, l.manufacturer_name && l.kind === "comissao_fabricante" ? `via ${l.manufacturer_name}` : null];
    return partes.filter(Boolean).join(" ") || "-";
  }

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Financeiro</p>
        <h1>Recebimentos</h1>
        <p>
          Todo dinheiro que entra fora do registro de venda: aportes dos sócios, comissões dos fabricantes, receitas de
          outros ramos e parcelas de vendas a prazo. Comissões e outras receitas entram na divisão do lucro na data em
          que são recebidas. Aportes não entram no lucro; o do João abate a dívida do estoque inicial.
        </p>
      </div>

      {!carregando && (
        <div className="stat-grid auto" style={{ marginBottom: 18 }}>
          <div className="stat-tile accent">
            <div className="label">Recebido (sem aportes)</div>
            <div className="value">{formatCentsBRL(resumo.recebido)}</div>
          </div>
          <div className="stat-tile gold">
            <div className="label">A receber (previsto)</div>
            <div className="value">{formatCentsBRL(resumo.aReceber)}</div>
            <div className="stat-note">Lembretes e parcelas ainda não recebidas</div>
          </div>
          <div className="stat-tile">
            <div className="label">Aportes do João</div>
            <div className="value">{formatCentsBRL(resumo.aporteJoao)}</div>
          </div>
          <div className="stat-tile">
            <div className="label">Aportes da Fernanda</div>
            <div className="value">{formatCentsBRL(resumo.aporteFernanda)}</div>
          </div>
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={"tab-btn" + (aba === "recebidos" ? " active" : "")} onClick={() => setAba("recebidos")}>
            Recebidos ({recebidos.length})
          </button>
          <button className={"tab-btn" + (aba === "a_receber" ? " active" : "")} onClick={() => setAba("a_receber")}>
            A receber ({aReceber.length})
          </button>
        </div>
        <button className="btn btn-primary" onClick={() => abrirNovo()}>
          + Lançar recebimento
        </button>
      </div>

      {carregando ? (
        <div className="loading-state">Carregando...</div>
      ) : lista.length === 0 ? (
        <div className="empty-state">
          {aba === "recebidos" ? "Nenhum recebimento lançado ainda." : "Nada a receber lançado."}
        </div>
      ) : (
        <div className="table-wrap">
          <table style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>{aba === "recebidos" ? "Data" : "Data prevista"}</th>
                <th>Tipo</th>
                <th>De quem</th>
                <th>Motivo</th>
                <th>Valor</th>
                <th>Forma</th>
                <th>Situação</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => (
                <tr key={`${l.source}-${l.id}`}>
                  <td>
                    {l.status === "recebida"
                      ? formatDateBR(l.received_date)
                      : l.expected_date
                        ? formatDateBR(l.expected_date)
                        : "sem data"}
                  </td>
                  <td>{RECEIPT_KIND_LABELS[l.kind]}</td>
                  <td>
                    {dono(l)}
                    {l.from_nickname && <div className="hint">{l.from_nickname}</div>}
                  </td>
                  <td>{l.reason || "-"}</td>
                  <td className="num">{formatCentsBRL(toCents(l.amount))}</td>
                  <td>{l.payment_method || "-"}</td>
                  <td>{situacao(l)}</td>
                  <td>
                    <div className="row-actions">
                      {l.source === "parcela" ? (
                        l.status === "prevista" ? (
                          <button className="icon-btn" onClick={() => receberParcela(l)}>
                            Marcar como recebida
                          </button>
                        ) : (
                          <button className="icon-btn danger" onClick={() => apagar(l)}>
                            Desfazer
                          </button>
                        )
                      ) : (
                        <>
                          {l.status === "prevista" && (
                            <button className="icon-btn" onClick={() => abrirEdicao(l, true)}>
                              Recebi
                            </button>
                          )}
                          <button className="icon-btn" onClick={() => abrirEdicao(l)}>
                            Editar
                          </button>
                          <button className="icon-btn danger" onClick={() => apagar(l)}>
                            Apagar
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>
                {editando === "novo" ? "Lançar recebimento" : "Editar recebimento"}
              </h2>
              <button className="modal-close" onClick={() => setEditando(null)} aria-label="Fechar">
                ✕
              </button>
            </div>

            <form onSubmit={salvar}>
              <div className="form-grid">
                <div className="field field--full">
                  <label>Tipo</label>
                  <div className="radio-row">
                    {KINDS.filter((k) => !(emEdicaoDeLivro && k === "parcela_venda")).map((k) => (
                      <button
                        type="button"
                        key={k}
                        className={"radio-chip" + (form.kind === k ? " selected" : "")}
                        onClick={() => set("kind", k)}
                      >
                        {RECEIPT_KIND_LABELS[k]}
                      </button>
                    ))}
                  </div>
                  <span className="hint">
                    {form.kind === "aporte_socio" &&
                      "Dinheiro que um sócio coloca na empresa. Não entra no lucro. O do João abate a dívida do estoque inicial."}
                    {form.kind === "comissao_fabricante" &&
                      "Comissão paga por um fabricante representado. Vale para o fabricante todo, não para uma venda só. Entra na divisão do lucro na data em que foi recebida."}
                    {form.kind === "outra_receita" &&
                      "Receita de outros ramos da empresa, que não é venda. Entra na divisão do lucro na data em que foi recebida."}
                    {form.kind === "parcela_venda" &&
                      "Marca como recebida uma parcela de uma venda a prazo (varejo ou consignado) já registrada."}
                  </span>
                </div>

                {comLembrete && (
                  <div className="field field--full">
                    <label>Situação</label>
                    <div className="radio-row">
                      <button
                        type="button"
                        className={"radio-chip" + (form.status === "recebida" ? " selected" : "")}
                        onClick={() => set("status", "recebida")}
                      >
                        Já recebi
                      </button>
                      <button
                        type="button"
                        className={"radio-chip" + (form.status === "prevista" ? " selected" : "")}
                        onClick={() => set("status", "prevista")}
                      >
                        Ainda vou receber (lembrete)
                      </button>
                    </div>
                  </div>
                )}

                {ehParcela && (
                  <div className="field field--full">
                    <label>Parcela recebida</label>
                    <select value={form.payment_id} onChange={(e) => set("payment_id", e.target.value)}>
                      <option value="">Escolha a parcela...</option>
                      {parcelasPendentes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {`${p.from_name || `Venda ${p.sale_id}`} · ${formatCentsBRL(toCents(p.amount))} · prevista ${
                            p.expected_date ? formatDateBR(p.expected_date) : "sem data"
                          }`}
                        </option>
                      ))}
                    </select>
                    {parcelasPendentes.length === 0 && (
                      <span className="hint">Não há parcelas a receber cadastradas nas vendas.</span>
                    )}
                  </div>
                )}

                <div className="field">
                  <label>{recebida ? "Data em que o dinheiro entrou" : "Data prevista (opcional)"}</label>
                  {recebida ? (
                    <input type="date" value={form.received_date} onChange={(e) => set("received_date", e.target.value)} />
                  ) : (
                    <input type="date" value={form.expected_date} onChange={(e) => set("expected_date", e.target.value)} />
                  )}
                  {!recebida && (
                    <span className="hint">Serve só de lembrete. Pode deixar em branco se ainda não sabe.</span>
                  )}
                </div>

                {!semValor && (
                  <div className="field">
                    <label>Valor</label>
                    <div className="money-input">
                      <span className="prefix">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={form.amount}
                        onChange={(e) => set("amount", e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {form.kind === "aporte_socio" && (
                  <div className="field field--full">
                    <label>Quem fez o aporte</label>
                    <div className="radio-row">
                      {(["joao", "fernanda"] as const).map((p) => (
                        <button
                          type="button"
                          key={p}
                          className={"radio-chip" + (form.partner === p ? " selected" : "")}
                          onClick={() => set("partner", p)}
                        >
                          {p === "joao" ? "João" : "Fernanda"}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {form.kind === "comissao_fabricante" && (
                  <div className="field field--full">
                    <label>Fabricante que pagou</label>
                    <select value={form.manufacturer_id} onChange={(e) => set("manufacturer_id", e.target.value)}>
                      <option value="">Escolha o fabricante...</option>
                      {representados.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    {representados.length === 0 && (
                      <span className="hint">
                        Nenhum fabricante representado. Em Cadastros, aba Fabricantes, marque "Representamos".
                      </span>
                    )}
                  </div>
                )}

                {(form.kind === "comissao_fabricante" || form.kind === "outra_receita") && (
                  <>
                    <div className="field">
                      <label>De quem (revendedora, cliente ou empresa)</label>
                      <input
                        type="text"
                        placeholder="Ex: Revendedora Ana"
                        value={form.from_name}
                        onChange={(e) => set("from_name", e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Como chamamos essa pessoa (apelido)</label>
                      <input
                        type="text"
                        placeholder="Ex: Aninha"
                        value={form.from_nickname}
                        onChange={(e) => set("from_nickname", e.target.value)}
                      />
                    </div>
                  </>
                )}

                {!ehParcela && (
                  <div className="field field--full">
                    <label>Forma de recebimento</label>
                    <div className="radio-row">
                      {RECEIPT_PAYMENT_METHODS.map((m) => (
                        <button
                          type="button"
                          key={m}
                          className={"radio-chip" + (form.payment_method === m ? " selected" : "")}
                          onClick={() => set("payment_method", form.payment_method === m ? "" : m)}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {!ehParcela && (
                  <div className="field field--full">
                    <label>Motivo</label>
                    <input
                      type="text"
                      placeholder="Ex: comissão das vendas de setembro"
                      value={form.reason}
                      onChange={(e) => set("reason", e.target.value)}
                    />
                  </div>
                )}
              </div>

              {erro && (
                <div className="banner banner-error" style={{ marginTop: 14 }}>
                  <span>⚠️</span>
                  <span>{erro}</span>
                </div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
