"use client";

import { useState } from "react";
import { formatDateBR } from "@/lib/format";
import { formatCentsBRL } from "@/lib/finance/money";
import type { Previsto } from "@/lib/import-vendas-db";

type Resumo = { novas: number; jaExistem: number; ignoradas: number; clientesNovos: number; aportes: number; totalDeVendasCents: number };
type Resultado = { vendas: number; aportes: number; clientesNovos: number; jaExistiam: number; ignoradas: number };

const EXEMPLO = "ter 01/09\tGIOVANA\tVAREJO\tR$ 82,50\tPIX À VISTA";

function descricaoDe(p: Previsto): { titulo: string; nota: string } {
  const i = p.item;
  if (i.tipo === "venda") {
    return {
      titulo: i.cliente,
      nota: !i.criarCliente ? "Linha geral: sem cadastro de cliente" : p.clienteNovo ? "Vai criar o cliente no cadastro" : "Cliente já cadastrado",
    };
  }
  if (i.tipo === "aporte") return { titulo: `Aporte de ${i.socio === "joao" ? "João" : "Fernanda"}`, nota: "Entra em Recebimentos como aporte de sócio" };
  return { titulo: i.texto, nota: i.motivo };
}

export default function ImportarVendasPage() {
  const [texto, setTexto] = useState("");
  const [previstos, setPrevistos] = useState<Previsto[] | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function enviar(confirmar: boolean) {
    setOcupado(true);
    setErro("");
    try {
      const res = await fetch("/api/importar-vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, confirmar }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(d.message || "Não foi possível continuar. Tente de novo.");
        return;
      }
      if (confirmar) {
        setResultado(d.resultado);
        setPrevistos(null);
        setResumo(null);
        setTexto("");
      } else {
        setResultado(null);
        setPrevistos(d.previstos);
        setResumo(d.resumo);
      }
    } finally {
      setOcupado(false);
    }
  }

  const podeImportar = !!resumo && resumo.novas > 0;

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Vendas</p>
        <h1>Importar vendas da planilha</h1>
        <p>
          Copie as linhas da planilha (com as colunas DATA, RECEITAS, TIPO, VALOR e FORMA DE PAG) e cole aqui. Primeiro você vê uma prévia do que
          vai ser lançado, e só depois confirma. Colar a mesma tabela duas vezes não duplica nada.
        </p>
      </div>

      {resultado && (
        <div className="banner banner-info" role="status">
          <span>✅</span>
          <span>
            Pronto: {resultado.vendas} venda(s), {resultado.clientesNovos} cliente(s) novo(s) e {resultado.aportes} aporte(s) lançados.
            {resultado.jaExistiam > 0 ? ` ${resultado.jaExistiam} já existiam e foram puladas.` : ""}
            {resultado.ignoradas > 0 ? ` ${resultado.ignoradas} linha(s) ignorada(s).` : ""} Veja em{" "}
            <a href="/relatorio">Relatório</a> e em <a href="/cadastros">Cadastros</a>, e complete os dados que faltam.
          </span>
        </div>
      )}

      <div className="field field--full" style={{ marginBottom: 12 }}>
        <label htmlFor="planilha">Linhas da planilha</label>
        <textarea
          id="planilha"
          rows={10}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setPrevistos(null);
            setResumo(null);
          }}
          placeholder={`Cole aqui. Exemplo:\n${EXEMPLO}`}
          style={{ fontFamily: "var(--font-mono)", fontSize: "0.82rem" }}
        />
        <span className="hint">
          Vale para venda de varejo em Pix à vista e para aporte de sócio. Outras formas de pagamento e tipos aparecem como "ignorada", com o motivo:
          essas você lança na tela Nova venda.
        </span>
      </div>

      {erro && (
        <div className="banner banner-warning" role="alert">
          <span>⚠️</span>
          <span>{erro}</span>
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <button type="button" className="btn btn-primary" disabled={ocupado || texto.trim() === ""} onClick={() => enviar(false)}>
          {ocupado && !podeImportar ? "Lendo..." : "Ver prévia"}
        </button>
        {podeImportar && (
          <button type="button" className="btn btn-primary" disabled={ocupado} onClick={() => enviar(true)}>
            {ocupado ? "Importando..." : `Importar ${resumo!.novas} lançamento(s)`}
          </button>
        )}
      </div>

      {resumo && previstos && (
        <>
          <div className="stat-grid auto" style={{ marginBottom: 14 }}>
            <div className="stat-tile accent">
              <div className="label">Vai lançar</div>
              <div className="value">{resumo.novas}</div>
              <div className="stat-note">{`${reaisCurto(resumo.totalDeVendasCents)} em vendas e ${resumo.aportes} aporte(s)`}</div>
            </div>
            <div className="stat-tile gold">
              <div className="label">Clientes novos</div>
              <div className="value">{resumo.clientesNovos}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Já existiam</div>
              <div className="value">{resumo.jaExistem}</div>
            </div>
            <div className={"stat-tile" + (resumo.ignoradas > 0 ? " danger" : "")}>
              <div className="label">Ignoradas</div>
              <div className="value">{resumo.ignoradas}</div>
            </div>
          </div>

          <div className="table-wrap tabela-cabe">
            <table>
              <thead>
                <tr>
                  <th>Linha</th>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {previstos.map((p) => {
                  const d = descricaoDe(p);
                  const i = p.item;
                  return (
                    <tr key={i.linha}>
                      <td>{i.linha}</td>
                      <td>{i.tipo === "ignorada" ? "-" : formatDateBR(i.data)}</td>
                      <td>
                        {d.titulo}
                        <div className="hint">{d.nota}</div>
                      </td>
                      <td>{i.tipo === "venda" ? "Venda de varejo, Pix à vista" : i.tipo === "aporte" ? "Aporte de sócio" : "-"}</td>
                      <td className="num">{i.tipo === "ignorada" ? "-" : formatCentsBRL(i.valorCents)}</td>
                      <td>
                        <span className={`stock-pill ${p.situacao === "novo" ? "ok" : p.situacao === "ja_existe" ? "low" : "out"}`}>
                          {p.situacao === "novo" ? "Vai lançar" : p.situacao === "ja_existe" ? "Já existe" : "Ignorada"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

const reaisCurto = formatCentsBRL;
