"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCentsBRL } from "@/lib/finance/money";
import { OPCOES_DE_QUANDO, descreverOpcao, descreverPeriodo, formatarPct, type OpcaoDeQuando } from "@/lib/finance/funds";
import { formatDateBR } from "@/lib/format";

type FundoNaTela = {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  pctThisMonth: number;
  enteredCents: number;
  spentCents: number;
  balanceCents: number;
  enteredThisMonthCents: number;
};
type Regra = { id: number; fundId: number; pct: number; fromMonth: string; toMonth: string | null; createdAt: string; createdByName: string | null };
type Dados = { hoje: string; reposicaoMaxima: number; fundos: FundoNaTela[]; regras: Regra[] };

const reais = formatCentsBRL;

export default function FundosPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroDeCarga, setErroDeCarga] = useState("");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  const [mudando, setMudando] = useState<FundoNaTela | null>(null);
  const [pct, setPct] = useState("");
  const [quando, setQuando] = useState<OpcaoDeQuando>("sempre");
  const [editando, setEditando] = useState<FundoNaTela | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroDaJanela, setErroDaJanela] = useState("");

  const carregar = useCallback(async () => {
    const res = await fetch("/api/funds");
    if (!res.ok) {
      setErroDeCarga("Não foi possível carregar os fundos.");
      return;
    }
    setDados(await res.json());
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!dados) {
    return (
      <main className="shell shell--wide">
        <div className="loading-state">{erroDeCarga || "Carregando..."}</div>
      </main>
    );
  }

  const { hoje, fundos, regras } = dados;
  const ativos = fundos.filter((f) => f.active);
  const arquivados = fundos.filter((f) => !f.active);
  const nomeDoFundo = (id: number) => fundos.find((f) => f.id === id)?.name ?? `Fundo nº ${id}`;

  function abrirMudarPct(f: FundoNaTela) {
    setErroDaJanela("");
    setPct(String(f.pctThisMonth).replace(".", ","));
    setQuando("sempre");
    setMudando(f);
  }

  function abrirEditar(f: FundoNaTela | "novo") {
    setErroDaJanela("");
    setNome(f === "novo" ? "" : f.name);
    setDescricao(f === "novo" ? "" : f.description ?? "");
    setEditando(f);
  }

  async function chamar(url: string, metodo: string, corpo?: unknown) {
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok, mensagem: (d.message as string | undefined) ?? "" };
  }

  async function salvarPct(e: React.FormEvent) {
    e.preventDefault();
    if (!mudando || salvando) return;
    setSalvando(true);
    setErroDaJanela("");
    try {
      const r = await chamar("/api/funds/rules", "POST", { fund_id: mudando.id, pct, quando });
      if (!r.ok) return setErroDaJanela(r.mensagem || "Não foi possível salvar. Tente novamente.");
      setMudando(null);
      setAviso(`Porcentagem do fundo ${mudando.name} salva. As contas já usam o valor novo.`);
      setErro("");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function salvarFundo(e: React.FormEvent) {
    e.preventDefault();
    if (!editando || salvando) return;
    setSalvando(true);
    setErroDaJanela("");
    try {
      const novo = editando === "novo";
      const r = novo
        ? await chamar("/api/funds", "POST", { name: nome, description: descricao })
        : await chamar(`/api/funds/${editando.id}`, "PATCH", { name: nome, description: descricao });
      if (!r.ok) return setErroDaJanela(r.mensagem || "Não foi possível salvar. Tente novamente.");
      setEditando(null);
      setAviso(novo ? "Fundo criado, com 0%. Use Mudar % para definir quanto separar." : "Fundo atualizado.");
      setErro("");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function arquivar(f: FundoNaTela, ativo: boolean) {
    if (!ativo && !window.confirm(`Arquivar o fundo "${f.name}"? Ele some das opções, mas o passado continua contando.`)) return;
    const r = await chamar(`/api/funds/${f.id}`, "PATCH", { active: ativo });
    if (!r.ok) {
      setAviso("");
      setErro(r.mensagem || "Não foi possível mudar o fundo.");
      return;
    }
    setErro("");
    setAviso(ativo ? `Fundo ${f.name} reativado.` : `Fundo ${f.name} arquivado.`);
    await carregar();
  }

  async function apagarRegra(r: Regra) {
    const texto = `${nomeDoFundo(r.fundId)}, ${formatarPct(r.pct)}%, ${descreverPeriodo(r.fromMonth, r.toMonth)}`;
    if (!window.confirm(`Apagar esta regra?\n\n${texto}\n\nA regra anterior volta a valer nesses meses.`)) return;
    const res = await chamar(`/api/funds/rules/${r.id}`, "DELETE");
    if (!res.ok) {
      setAviso("");
      setErro(res.mensagem || "Não foi possível apagar a regra.");
      return;
    }
    setErro("");
    setAviso("Regra apagada.");
    await carregar();
  }

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Financeiro</p>
        <h1>Fundos</h1>
        <p>
          Cada venda separa uma parte do valor para estes fundos, junto com os 30% da reposição, antes de dividir o lucro. Aqui você define
          quanto separar em cada um e quando a porcentagem vale. Ao lançar uma despesa, é possível escolher o fundo que paga.
        </p>
      </div>

      {aviso && (
        <div className="banner banner-info" role="status">
          <span>✅</span>
          <span>{aviso}</span>
        </div>
      )}
      {erro && (
        <div className="banner banner-warning" role="alert">
          <span>⚠️</span>
          <span>{erro}</span>
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div />
        <button className="btn btn-primary" onClick={() => abrirEditar("novo")}>
          + Novo fundo
        </button>
      </div>

      <div className="fundos-grade fundos-grade--paginas">
        {ativos.map((f) => (
          <div className="fundo-cartao fundo-cartao--pagina" key={f.id}>
            <span className="fundo-titulo">{f.name}</span>
            {f.description && <span className="fundo-pct">{f.description}</span>}
            <span className="fundo-pct">{`${formatarPct(f.pctThisMonth)}% este mês`}</span>
            <span className="fundo-linha">
              <em>Acumulado</em>
              <strong>{reais(f.enteredCents)}</strong>
            </span>
            <span className="fundo-linha">
              <em>Entrou neste mês</em>
              <strong>{reais(f.enteredThisMonthCents)}</strong>
            </span>
            <span className="fundo-linha">
              <em>Gasto</em>
              <strong>{reais(f.spentCents)}</strong>
            </span>
            <span className={"fundo-linha fundo-saldo" + (f.balanceCents < 0 ? " negativo" : "")}>
              <em>Saldo</em>
              <strong>{reais(f.balanceCents)}</strong>
            </span>
            <div className="row-actions" style={{ marginTop: 8 }}>
              <button className="btn btn-primary btn-small" onClick={() => abrirMudarPct(f)}>
                Mudar %
              </button>
              <button className="icon-btn" onClick={() => abrirEditar(f)}>
                Renomear
              </button>
              <button className="icon-btn danger" onClick={() => arquivar(f, false)}>
                Arquivar
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="section-title" style={{ marginTop: 22 }}>
        <span className="dot" />
        Regras de porcentagem
      </h2>
      <p className="fin-help">
        Em cada mês vale a regra mais recente entre as que cobrem o mês. Apagar uma regra faz a anterior voltar a valer. Meses sem regra separam 0%.
      </p>
      {regras.length === 0 ? (
        <div className="empty-state">Nenhuma regra ainda: todos os fundos estão em 0%.</div>
      ) : (
        <div className="table-wrap tabela-cabe">
          <table>
            <thead>
              <tr>
                <th>Fundo</th>
                <th>Porcentagem</th>
                <th>Quando vale</th>
                <th>Quem mudou</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {regras.map((r) => (
                <tr key={r.id}>
                  <td>{nomeDoFundo(r.fundId)}</td>
                  <td className="num">{`${formatarPct(r.pct)}%`}</td>
                  <td>{descreverPeriodo(r.fromMonth, r.toMonth)}</td>
                  <td>
                    {r.createdByName ?? "Sem identificação"}
                    <div className="hint">{formatDateBR(r.createdAt.slice(0, 10))}</div>
                  </td>
                  <td>
                    <button className="icon-btn danger" onClick={() => apagarRegra(r)}>
                      Apagar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {arquivados.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 22 }}>
            <span className="dot" />
            Arquivados
          </h2>
          <div className="table-wrap tabela-cabe">
            <table>
              <tbody>
                {arquivados.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td className="num">{`Acumulado ${reais(f.enteredCents)}`}</td>
                    <td>
                      <button className="icon-btn" onClick={() => arquivar(f, true)}>
                        Reativar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mudando && (
        <div className="modal-overlay" onClick={() => setMudando(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>{`Mudar % de ${mudando.name}`}</h2>
              <button className="modal-close" onClick={() => setMudando(null)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <form onSubmit={salvarPct}>
              <div className="form-grid">
                <div className="field">
                  <label>Porcentagem do valor da venda</label>
                  <input type="text" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} required />
                  <span className="hint">De 0 a 100. Ela é separada junto com os 30% da reposição.</span>
                </div>
                <div className="field field--full">
                  <label>Quando vale?</label>
                  <div className="radio-row">
                    {OPCOES_DE_QUANDO.map((o) => (
                      <button type="button" key={o} className={"radio-chip" + (quando === o ? " selected" : "")} onClick={() => setQuando(o)}>
                        {descreverOpcao(o, hoje)}
                      </button>
                    ))}
                  </div>
                  <span className="hint">Vale o mês inteiro, inclusive as vendas deste mês que já aconteceram. Meses anteriores não mudam.</span>
                </div>
              </div>
              {erroDaJanela && (
                <div className="banner banner-error" style={{ marginTop: 14 }}>
                  <span>⚠️</span>
                  <span>{erroDaJanela}</span>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setMudando(null)}>
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

      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>{editando === "novo" ? "Novo fundo" : "Renomear fundo"}</h2>
              <button className="modal-close" onClick={() => setEditando(null)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <form onSubmit={salvarFundo}>
              <div className="form-grid">
                <div className="field field--full">
                  <label>Nome</label>
                  <input type="text" maxLength={40} value={nome} onChange={(e) => setNome(e.target.value)} required />
                </div>
                <div className="field field--full">
                  <label>Descrição (opcional)</label>
                  <input type="text" maxLength={200} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que entra neste fundo" />
                </div>
              </div>
              {erroDaJanela && (
                <div className="banner banner-error" style={{ marginTop: 14 }}>
                  <span>⚠️</span>
                  <span>{erroDaJanela}</span>
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
