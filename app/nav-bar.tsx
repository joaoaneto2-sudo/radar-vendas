"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const PAGINAS_DE_ENTRADA = ["/login", "/primeiro-acesso"];

// Menu do computador (todas as páginas) e barra de baixo do celular (as principais + "Mais").
const MENU_DO_COMPUTADOR = [
  { href: "/", rotulo: "Nova venda" },
  { href: "/cadastros", rotulo: "Cadastros" },
  { href: "/relatorio", rotulo: "Relatório" },
  { href: "/financeiro", rotulo: "Financeiro" },
  { href: "/financeiro/despesas", rotulo: "Despesas" },
  { href: "/financeiro/recebimentos", rotulo: "Recebimentos" },
  { href: "/loja-online", rotulo: "Loja online" },
];

type Icone = "venda" | "relatorio" | "cadastros" | "financeiro" | "mais";

const BARRA_DE_BAIXO: { href: string; rotulo: string; icone: Icone }[] = [
  { href: "/", rotulo: "Venda", icone: "venda" },
  { href: "/relatorio", rotulo: "Relatório", icone: "relatorio" },
  { href: "/cadastros", rotulo: "Cadastros", icone: "cadastros" },
  { href: "/financeiro", rotulo: "Financeiro", icone: "financeiro" },
];

const MAIS = [
  { href: "/financeiro/despesas", rotulo: "Despesas e faturas" },
  { href: "/financeiro/recebimentos", rotulo: "Recebimentos" },
  { href: "/loja-online", rotulo: "Loja online" },
];

function Desenho({ nome }: { nome: Icone }) {
  switch (nome) {
    case "venda":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
    case "relatorio":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      );
    case "cadastros":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3h12l3 5-9 13L3 8z" />
          <path d="M3 8h18M9 3l3 5 3-5M12 8v13" />
        </svg>
      );
    case "financeiro":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="5" cy="12" r="1.4" />
          <circle cx="12" cy="12" r="1.4" />
          <circle cx="19" cy="12" r="1.4" />
        </svg>
      );
  }
}

export default function NavBar() {
  const pathname = usePathname();
  const [nome, setNome] = useState<string | null>(null);
  const [maisAberto, setMaisAberto] = useState(false);
  const naEntrada = PAGINAS_DE_ENTRADA.includes(pathname);

  useEffect(() => {
    if (naEntrada) return;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((dados) => setNome(dados?.user?.name ?? null))
      .catch(() => setNome(null));
  }, [naEntrada]);

  // Ao trocar de página, o menu "Mais" fecha.
  useEffect(() => {
    setMaisAberto(false);
  }, [pathname]);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  const ativa = (href: string) =>
    href === "/cadastros" ? pathname === "/cadastros" || pathname === "/importar-catalogo" : pathname === href;

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

  const maisAtivo = MAIS.some((m) => ativa(m.href));

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <img className="brand-logo" src="/marca/logo-banner.jpg" alt="Fernanda Brilhante" />
          <span className="brand-name">Radar de Vendas</span>
        </div>
        <div className="topbar-right">
          <nav className="nav" aria-label="Páginas">
            {MENU_DO_COMPUTADOR.map((item) => (
              <a key={item.href} href={item.href} className={ativa(item.href) ? "active" : ""}>
                {item.rotulo}
              </a>
            ))}
          </nav>
          <div className="nav-user">
            {nome && <span>{nome}</span>}
            <button type="button" className="icon-btn" onClick={sair}>
              Sair
            </button>
          </div>
        </div>
      </div>

      {maisAberto && <div className="more-backdrop" onClick={() => setMaisAberto(false)} />}
      {maisAberto && (
        <div className="more-sheet" role="menu">
          {nome && <div className="sheet-user">{`Entrou como ${nome}`}</div>}
          {MAIS.map((item) => (
            <a key={item.href} href={item.href} className={ativa(item.href) ? "active" : ""} role="menuitem">
              {item.rotulo}
            </a>
          ))}
          <button type="button" onClick={sair} role="menuitem">
            Sair
          </button>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Páginas principais">
        {BARRA_DE_BAIXO.map((item) => (
          <a key={item.href} href={item.href} className={ativa(item.href) ? "active" : ""}>
            <Desenho nome={item.icone} />
            <span>{item.rotulo}</span>
          </a>
        ))}
        <button
          type="button"
          className={maisAberto || maisAtivo ? "active" : ""}
          onClick={() => setMaisAberto((v) => !v)}
          aria-expanded={maisAberto}
        >
          <Desenho nome="mais" />
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
}
