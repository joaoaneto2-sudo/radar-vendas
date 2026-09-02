"use client";

import { useState } from "react";
import ProdutosTab from "./produtos-tab";
import ClientesTab from "./clientes-tab";
import SimpleListTab from "./simple-list-tab";

const TABS = ["Produtos", "Clientes", "Fabricantes", "Fornecedores", "Vendedoras"] as const;
type Tab = (typeof TABS)[number];

export default function CadastrosPage() {
  const [tab, setTab] = useState<Tab>("Produtos");

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Cadastros</p>
        <h1>Produtos, clientes e parceiros</h1>
        <p>Cadastre aqui o que aparece pra seleção na hora de registrar uma venda.</p>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t}
            className={"tab-btn" + (tab === t ? " active" : "")}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Produtos" && <ProdutosTab />}
      {tab === "Clientes" && <ClientesTab />}
      {tab === "Fabricantes" && (
        <SimpleListTab title="Fabricantes" endpoint="manufacturers" placeholder="Nome do fabricante" />
      )}
      {tab === "Fornecedores" && (
        <SimpleListTab title="Fornecedores" endpoint="suppliers" placeholder="Nome do fornecedor" />
      )}
      {tab === "Vendedoras" && (
        <SimpleListTab title="Vendedoras" endpoint="sellers" placeholder="Nome da vendedora" />
      )}
    </main>
  );
}
