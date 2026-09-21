"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const PAGINAS_DE_ENTRADA = ["/login", "/primeiro-acesso"];

type Icone = "inicio" | "venda" | "relatorio" | "cadastros" | "financeiro" | "receber" | "despesas" | "loja" | "mais";

// Menu lateral (computador): páginas agrupadas por assunto.
const GRUPOS: { titulo: string; itens: { href: string; rotulo: string; icone: Icone }[] }[] = [
  {
    titulo: "Início",
    itens: [{ href: "/", rotulo: "Visão geral", icone: "inicio" }],
  },
  {
    titulo: "Vendas",
    itens: [
      { href: "/nova-venda", rotulo: "Nova venda", icone: "venda" },
      { href: "/relatorio", rotulo: "Relatório", icone: "relatorio" },
      { href: "/importar-vendas", rotulo: "Importar vendas", icone: "relatorio" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [{ href: "/cadastros", rotulo: "Produtos e cadastros", icone: "cadastros" }],
  },
  {
    titulo: "Financeiro",
    itens: [
      { href: "/financeiro", rotulo: "Painel", icone: "financeiro" },
      { href: "/financeiro/recebimentos", rotulo: "Recebimentos", icone: "receber" },
      { href: "/financeiro/fundo", rotulo: "Fundo de reposição", icone: "financeiro" },
      { href: "/financeiro/despesas", rotulo: "Despesas e faturas", icone: "despesas" },
    ],
  },
  {
    titulo: "Loja",
    itens: [
      { href: "/loja-online", rotulo: "Loja online", icone: "loja" },
      { href: "/loja-online/vitrine", rotulo: "Vitrine do site", icone: "loja" },
    ],
  },
];

// Caminho mostrado no alto da página: grupo e página.
const CAMINHOS: Record<string, [string, string]> = {
  "/": ["Início", "Visão geral"],
  "/nova-venda": ["Vendas", "Nova venda"],
  "/relatorio": ["Vendas", "Relatório"],
  "/importar-vendas": ["Vendas", "Importar vendas"],
  "/cadastros": ["Cadastros", "Produtos e cadastros"],
  "/importar-catalogo": ["Cadastros", "Importar catálogo"],
  "/financeiro": ["Financeiro", "Painel"],
  "/financeiro/recebimentos": ["Financeiro", "Recebimentos"],
  "/financeiro/fundo": ["Financeiro", "Fundo de reposição"],
  "/financeiro/despesas": ["Financeiro", "Despesas e faturas"],
  "/loja-online": ["Loja", "Loja online"],
  "/loja-online/vitrine": ["Loja", "Vitrine do site"],
};

// Barra de baixo do celular: as principais e o menu "Mais".
const BARRA_DE_BAIXO: { href: string; rotulo: string; icone: Icone }[] = [
  { href: "/", rotulo: "Início", icone: "inicio" },
  { href: "/nova-venda", rotulo: "Venda", icone: "venda" },
  { href: "/relatorio", rotulo: "Relatório", icone: "relatorio" },
  { href: "/cadastros", rotulo: "Cadastros", icone: "cadastros" },
];

const MAIS = [
  { href: "/importar-vendas", rotulo: "Importar vendas" },
  { href: "/financeiro", rotulo: "Painel financeiro" },
  { href: "/financeiro/recebimentos", rotulo: "Recebimentos" },
  { href: "/financeiro/fundo", rotulo: "Fundo de reposição" },
  { href: "/financeiro/despesas", rotulo: "Despesas e faturas" },
  { href: "/loja-online", rotulo: "Loja online" },
  { href: "/loja-online/vitrine", rotulo: "Vitrine do site" },
];

function Desenho({ nome }: { nome: Icone }) {
  switch (nome) {
    case "inicio":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="3" width="7.5" height="9" rx="2" />
          <rect x="13.5" y="3" width="7.5" height="5" rx="2" />
          <rect x="13.5" y="11" width="7.5" height="10" rx="2" />
          <rect x="3" y="15" width="7.5" height="6" rx="2" />
        </svg>
      );
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
    case "receber":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="6" width="18" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M6 9v.01M18 15v.01" />
        </svg>
      );
    case "despesas":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
          <path d="M9 8h6M9 12h6" />
        </svg>
      );
    case "loja":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9l1.5-5h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3" />
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

function iniciais(nome: string | null): string {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?";
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
      <div className="topbar topbar--entrada">
        <div className="brand">
          <img className="brand-logo" src="/marca/logo-banner.jpg" alt="Fernanda Brilhante" />
          <span className="brand-name">Radar de Vendas</span>
        </div>
      </div>
    );
  }

  const maisAtivo = MAIS.some((m) => ativa(m.href));
  const caminho = CAMINHOS[pathname];

  return (
    <>
      {/* Computador: menu lateral */}
      <aside className="sidebar" aria-label="Menu principal">
        <a className="sidebar-brand" href="/" aria-label="Radar de Vendas, página inicial">
          <img src="/marca/logo-banner.jpg" alt="Fernanda Brilhante" />
          <span>Radar de Vendas</span>
        </a>

        <nav className="sidebar-nav">
          {GRUPOS.map((grupo) => (
            <div className="sidebar-group" key={grupo.titulo}>
              <div className="sidebar-title">{grupo.titulo}</div>
              {grupo.itens.map((item) => (
                <a key={item.href} href={item.href} className={ativa(item.href) ? "active" : ""}>
                  <Desenho nome={item.icone} />
                  <span>{item.rotulo}</span>
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="avatar" aria-hidden="true">
            {iniciais(nome)}
          </div>
          <div className="sidebar-user-text">
            <strong>{nome ?? "Entrando..."}</strong>
            <button type="button" onClick={sair}>
              Sair
            </button>
          </div>
        </div>
      </aside>

      {/* Computador: barra no alto do conteúdo, com o caminho da página */}
      <div className="contentbar">
        <div className="breadcrumb">
          {caminho ? (
            <>
              <span>{caminho[0]}</span>
              <span aria-hidden="true">/</span>
              <strong>{caminho[1]}</strong>
            </>
          ) : (
            <strong>Radar de Vendas</strong>
          )}
        </div>
        {pathname !== "/nova-venda" && (
          <a className="btn btn-primary btn-small" href="/nova-venda">
            + Nova venda
          </a>
        )}
      </div>

      {/* Celular: barra do alto (só a marca) */}
      <div className="topbar topbar--mobile">
        <div className="brand">
          <img className="brand-logo" src="/marca/logo-banner.jpg" alt="Fernanda Brilhante" />
          <span className="brand-name">Radar de Vendas</span>
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
