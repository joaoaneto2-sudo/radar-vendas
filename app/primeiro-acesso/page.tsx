"use client";

import { useState } from "react";

export default function PrimeiroAcessoPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, passwordRepeat, inviteCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Não foi possível criar o acesso.");
        setLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Falha de conexão. Verifique a internet e tente de novo.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <img className="auth-logo" src="/marca/logo-banner.jpg" alt="Fernanda Brilhante" />
      <div className="page-head">
        <p className="eyebrow">Primeiro acesso</p>
        <h1>Criar a minha senha</h1>
        <p>
          Só duas pessoas podem ter acesso. Você vai precisar do código de convite que o administrador do
          sistema te passou.
        </p>
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
            <label htmlFor="name">Seu nome</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
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
              autoComplete="new-password"
              required
              minLength={10}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="hint">Pelo menos 10 caracteres. Uma frase curta funciona bem e é fácil de lembrar.</span>
          </div>
          <div className="field">
            <label htmlFor="passwordRepeat">Repita a senha</label>
            <input
              id="passwordRepeat"
              type="password"
              autoComplete="new-password"
              required
              value={passwordRepeat}
              onChange={(e) => setPasswordRepeat(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="inviteCode">Código de convite</label>
            <input
              id="inviteCode"
              type="text"
              autoComplete="off"
              required
              value={inviteCode}
              onChange={(e) => setInviteCode(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={loading} style={{ marginTop: 20 }}>
          {loading ? "Criando..." : "Criar acesso"}
        </button>
      </form>

      <p className="auth-links">
        Já tem senha? <a href="/login">Entrar</a>
      </p>
    </main>
  );
}
