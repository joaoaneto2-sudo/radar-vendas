"use client";

import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();
  return (
    <div className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="brand-name">Radar de Vendas</span>
      </div>
      <nav className="nav">
        <a href="/" className={pathname === "/" ? "active" : ""}>
          Nova venda
        </a>
        <a
          href="/cadastros"
          className={pathname === "/cadastros" ? "active" : ""}
        >
          Cadastros
        </a>
        <a
          href="/relatorio"
          className={pathname === "/relatorio" ? "active" : ""}
        >
          Relatório
        </a>
      </nav>
    </div>
  );
}
