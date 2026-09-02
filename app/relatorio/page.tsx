"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBRL, formatDateBR, Sale } from "@/lib/format";

type LoadState = "loading" | "ready" | "db_missing" | "error";

export default function RelatorioPage() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [seller, setSeller] = useState("");

  useEffect(() => {
    fetch("/api/sales")
      .then(async (res) => {
        if (res.status === 503) {
          setState("db_missing");
          return;
        }
        if (!res.ok) {
          setState("error");
          return;
        }
        const data = await res.json();
        setSales(data.sales as Sale[]);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  const sellers = useMemo(() => {
    const set = new Set(sales.map((s) => s.seller).filter(Boolean));
    return Array.from(set).sort();
  }, [sales]);

  const filtered = useMemo(() => {
    return sales.filter((s) => {
      if (from && s.sale_date.slice(0, 10) < from) return false;
      if (to && s.sale_date.slice(0, 10) > to) return false;
      if (seller && s.seller !== seller) return false;
      return true;
    });
  }, [sales, from, to, seller]);

  const totals = useMemo(() => {
    let value = 0;
    let cost = 0;
    for (const s of filtered) {
      value += Number(s.sale_value) || 0;
      cost += Number(s.cost) || 0;
    }
    return { value, cost, profit: value - cost, count: filtered.length };
  }, [filtered]);

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Relatório</p>
        <h1>Vendas registradas</h1>
        <p>Acompanhe o que a equipe vendeu, filtrando por período ou vendedora.</p>
      </div>

      {state === "db_missing" && (
        <div className="banner banner-warning" role="status">
          <span>⚠️</span>
          <span>
            O banco de dados ainda não foi conectado a este projeto no Vercel.
            Conclua o passo de Storage → Connect Store para começar a ver os
            registros aqui.
          </span>
        </div>
      )}

      {state === "error" && (
        <div className="banner banner-error" role="alert">
          <span>✕</span>
          <span>Não foi possível carregar as vendas. Recarregue a página.</span>
        </div>
      )}

      {state === "loading" && <div className="loading-state">Carregando vendas...</div>}

      {(state === "ready" || (state !== "loading" && sales.length > 0)) && (
        <>
          <div className="stat-grid">
            <div className="stat-tile">
              <div className="label">Vendas</div>
              <div className="value">{totals.count}</div>
            </div>
            <div className="stat-tile accent">
              <div className="label">Faturamento</div>
              <div className="value">{formatBRL(totals.value)}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Custo</div>
              <div className="value">{formatBRL(totals.cost)}</div>
            </div>
            <div className="stat-tile gold">
              <div className="label">Lucro</div>
              <div className="value">{formatBRL(totals.profit)}</div>
            </div>
          </div>

          <div className="toolbar">
            <div className="filters">
              <div className="field">
                <label htmlFor="from">De</label>
                <input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="to">Até</label>
                <input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="seller">Vendedora</label>
                <select id="seller" value={seller} onChange={(e) => setSeller(e.target.value)}>
                  <option value="">Todas</option>
                  {sellers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <a className="btn btn-ghost" href="/api/sales/export">
              Exportar CSV
            </a>
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">Nenhuma venda encontrada para esse filtro.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Vendedora</th>
                    <th>Cliente</th>
                    <th>Peça</th>
                    <th>Pagamento</th>
                    <th>Custo</th>
                    <th>Valor</th>
                    <th>Lucro</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const profit = (Number(s.sale_value) || 0) - (Number(s.cost) || 0);
                    return (
                      <tr key={s.id}>
                        <td>{formatDateBR(s.sale_date)}</td>
                        <td>{s.seller}</td>
                        <td>{s.client_name}</td>
                        <td>{s.product_type}</td>
                        <td>{s.payment_method}</td>
                        <td className="num">{formatBRL(s.cost)}</td>
                        <td className="num">{formatBRL(s.sale_value)}</td>
                        <td className={"num " + (profit >= 0 ? "profit-pos" : "profit-neg")}>
                          {formatBRL(profit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
