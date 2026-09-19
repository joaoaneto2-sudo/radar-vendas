"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const PAGINAS_DE_ENTRADA = ["/login", "/primeiro-acesso"];

export default function NavBar() {
  const pathname = usePathname();
  const [nome, setNome] = useState<string | null>(null);
  const naEntrada = PAGINAS_DE_ENTRADA.includes(pathname);

  useEffect(() => {
    if (naEntrada) return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => setNome(dados?.user?.name ?? null))
      .catch(() => setNome(null));
  }, [naEntrada]);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  if (naEntrada) {
    return (
      <div className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/marca/logo-banner.jpg" alt="Fernanda Brilhante" />
          <span className="brand-name">Radar de Vendas</span>
        </div>
      </div>
    );
  }

  return (
    <div className="topbar">
      <div className="brand">
        <img className="brand-logo" src="/marca/logo-banner.jpg" alt="Fernanda Brilhante" />
        <span className="brand-name">Radar de Vendas</span>
      </div>
      <div className="topbar-right">
        <nav className="nav">
          <a href="/" className={pathname === "/" ? "active" : ""}>
            Nova venda
          </a>
          <a href="/cadastros" className={pathname === "/cadastros" ? "active" : ""}>
            Cadastros
          </a>
          <a href="/relatorio" className={pathname === "/relatorio" ? "active" : ""}>
            Relatório
          </a>
          <a href="/financeiro" className={pathname === "/financeiro" ? "active" : ""}>
            Financeiro
          </a>
          <a href="/loja-online" className={pathname === "/loja-online" ? "active" : ""}>
            Loja online
          </a>
          <a href="/financeiro/recebimentos" className={pathname === "/financeiro/recebimentos" ? "active" : ""}>
            Recebimentos
          </a>
        </nav>
        <div className="nav-user">
          {nome && <span>{nome}</span>}
          <button type="button" className="icon-btn" onClick={sair}>
            Sair
          </button>
        </div>
      </div>
    </div>
  );
}
