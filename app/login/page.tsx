"use client";

import { useState } from "react";
import { safeNextPath } from "@/lib/auth/redirect";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Não foi possível entrar.");
        setLoading(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = safeNextPath(next);
    } catch {
      setError("Falha de conexão. Verifique a internet e tente de novo.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <img className="auth-logo" src="/marca/logo-banner.jpg" alt="Fernanda Brilhante" />
      <div className="page-head">
        <p className="eyebrow">Acesso restrito</p>
        <h1>Entrar</h1>
        <p>O Radar de Vendas guarda os dados financeiros da loja. Entre com o seu e-mail e a sua senha.</p>
      </div>

      {error && (
        <div className="banner banner-error" role="alert">
          <span>✕</span>
          <span>{error}</span>
        </div>
      )}

      <form className="card" onSubmit={handleSubmit}>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 20 }}>
          {loading ? "Entrando..." : "Entrar"}
        </button>
      </form>

      <p className="auth-links">
        Primeiro acesso? <a href="/primeiro-acesso">Criar a minha senha</a>
      </p>
    </main>
  );
}
