"use client";

// Gerar catálogo (PDF): escolhe peças marcadas com "Catálogo" no cadastro de produtos, decide entre
// "Varejo Fernanda" (só muda onde aparece) ou "Consignado de um cliente" (cria venda consignada de
// verdade: desconta estoque e entra na cascata financeira, reaproveitando POST /api/sales tal como a
// tela "Nova venda" já faz — nenhuma regra financeira nova aqui). Depois leva para a página de
// impressão (/catalogo-pdf), onde Ctrl+P vira o PDF.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Combobox, { ComboboxOption } from "@/app/combobox";
import { Product, Client, formatBRL } from "@/lib/format";
import { NAO_INFORMADA } from "@/lib/sale-finance";
import { CAPAS, CatalogoFoto, POR_PAGINA_MAX, POR_PAGINA_PADRAO } from "@/lib/catalogo-layout";
import { contarMarcacao, filtrarPecas, FiltroCatalogo, SEM_FILTRO, SituacaoMarcacao } from "@/lib/catalogo-filtro";

function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

type Passo = "selecionar" | "tipo" | "cliente" | "opcoes";

export type PecaCatalogo = {
  id: number;
  name: string;
  category: string | null;
  photo_url: string | null;
  price: number | null;
  catalog_photo: CatalogoFoto | null;
  photo_modelo_url?: string | null; // foto da modelo; quando existe, a foto principal vira o "close" à esquerda
};

export type CatalogoPdfDados = {
  tipo: "varejo" | "consignado";
  titulo: string;
  nomeCatalogo: string;
  logo: boolean;
  capa: string;
  porPagina: number;
  variar: boolean;
  clienteNome: string | null;
  destaqueIds: number[];
  pecas: PecaCatalogo[];
};

export default function CatalogoPage() {
  const router = useRouter();
  const [items, setItems] = useState<Product[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [passo, setPasso] = useState<Passo>("selecionar");
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [tipo, setTipo] = useState<"varejo" | "consignado">("varejo");
  const [clientId, setClientId] = useState<number | null>(null);
  const [criandoVendas, setCriandoVendas] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  // Tela de opções do PDF
  const [titulo, setTitulo] = useState("");
  const [nomeCatalogo, setNomeCatalogo] = useState("Catálogo Varejo Fernanda");
  const [logo, setLogo] = useState(true);
  const [capa, setCapa] = useState(CAPAS[0]);
  const [porPagina, setPorPagina] = useState(POR_PAGINA_PADRAO);
  const [variar, setVariar] = useState(true);
  const [destaqueIds, setDestaqueIds] = useState<Set<number>>(new Set());

  function load() {
    Promise.all([
      fetch("/api/products").then((r) => r.json()),
      fetch("/api/clients").then((r) => r.json()),
    ])
      .then(([p, c]) => {
        const doCatalogo: Product[] = (p.items || []).filter((it: Product) => it.show_catalog);
        setItems(doCatalogo);
        setSelecionados(new Set(doCatalogo.map((it) => it.id)));
        setClients(c.items || []);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function createClient(name: string): Promise<ComboboxOption> {
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ full_name: name }),
    });
    const data = await res.json();
    setClients((prev) => [...prev, data.item]);
    return { id: data.item.id, label: data.item.full_name };
  }

  function toggleSelecionado(id: number) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const [filtro, setFiltro] = useState<FiltroCatalogo>(SEM_FILTRO);
  const exibidas = useMemo(() => filtrarPecas(items, filtro, selecionados), [items, filtro, selecionados]);
  // Cada tipo mostra "marcadas/total" dentro dos outros filtros (fabricante, busca, situação).
  const categoriasDisponiveis = useMemo(
    () => contarMarcacao(filtrarPecas(items, filtro, selecionados, "categorias"), (p) => p.category, selecionados),
    [items, filtro, selecionados]
  );
  const fabricantesDisponiveis = useMemo(
    () => contarMarcacao(items, (p) => p.manufacturer_name, selecionados),
    [items, selecionados]
  );
  const filtroAtivo =
    filtro.categorias.length > 0 || filtro.fabricante !== "" || filtro.busca.trim() !== "" || filtro.situacao !== "todas";
  const exibidasMarcadas = exibidas.filter((p) => selecionados.has(p.id)).length;

  function alternarCategoria(nome: string) {
    setFiltro((f) => ({
      ...f,
      categorias: f.categorias.includes(nome) ? f.categorias.filter((c) => c !== nome) : [...f.categorias, nome],
    }));
  }

  function marcarExibidas() {
    setSelecionados((prev) => new Set([...prev, ...exibidas.map((p) => p.id)]));
  }

  function desmarcarExibidas() {
    const ids = new Set(exibidas.map((p) => p.id));
    setSelecionados((prev) => new Set([...prev].filter((id) => !ids.has(id))));
  }

  function ficarSoComExibidas() {
    setSelecionados(new Set(exibidas.map((p) => p.id)));
  }

  const pecasSelecionadas = items.filter((p) => selecionados.has(p.id));
  const clientOptions: ComboboxOption[] = clients.map((c) => ({ id: c.id, label: c.full_name || "(sem nome)" }));
  const clienteEscolhido = clients.find((c) => c.id === clientId) || null;

  function irParaTipo() {
    if (pecasSelecionadas.length === 0) return;
    setPasso("tipo");
  }

  function escolherVarejo() {
    setTipo("varejo");
    setNomeCatalogo("Catálogo Varejo Fernanda");
    setTitulo(`Catálogo Varejo Fernanda - ${new Date().toLocaleDateString("pt-BR")}`);
    setPasso("opcoes");
  }

  function irParaCliente() {
    setTipo("consignado");
    setPasso("cliente");
  }

  // Cria de fato as vendas consignadas: uma por peça, chamando a MESMA rota POST /api/sales que a
  // tela "Nova venda" usa. Preço de consignado = preço de varejo (o projeto não tem preço separado
  // para consignado hoje; decisão documentada aqui, não inventamos cascata nova).
  async function confirmarConsignado() {
    if (!clienteEscolhido) return;
    const ok = window.confirm(
      `Isso vai criar ${pecasSelecionadas.length} venda(s) consignada(s) para ${clienteEscolhido.full_name}, descontando essas peças do estoque. Confirma?`
    );
    if (!ok) return;

    setCriandoVendas(true);
    setErro(null);
    const falhas: string[] = [];
    for (let i = 0; i < pecasSelecionadas.length; i++) {
      const peca = pecasSelecionadas[i];
      setProgresso(`Criando venda ${i + 1} de ${pecasSelecionadas.length}...`);
      const payload = {
        sale_date: todayISO(),
        sale_type: null,
        seller: null,
        seller_id: null,
        product_type: peca.name || null,
        manufacturer: peca.manufacturer_name || null,
        supplier: peca.supplier_name || null,
        warranty: peca.warranty || null,
        product_id: peca.id,
        cost: peca.cost ?? null,
        price_tier: "consignado",
        sale_value: peca.price ?? null,
        sale_costs: "0",
        payment_fee: "0",
        payment_method: NAO_INFORMADA,
        installments_count: null,
        installments_dates: null,
        client_name: clienteEscolhido.full_name || null,
        client_nickname: clienteEscolhido.nickname || null,
        client_city: clienteEscolhido.city || null,
        client_phone: clienteEscolhido.phone || null,
        client_birthday: clienteEscolhido.birthday || null,
        client_id: clienteEscolhido.id,
      };
      try {
        const res = await fetch("/api/sales", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) falhas.push(peca.name || `peça #${peca.id}`);
      } catch {
        falhas.push(peca.name || `peça #${peca.id}`);
      }
    }
    setCriandoVendas(false);
    setProgresso("");
    if (falhas.length > 0) {
      setErro(`Não deu para criar a venda consignada de: ${falhas.join(", ")}. As demais foram criadas. Confira em Relatório.`);
    }
    setNomeCatalogo(`Catálogo consignado - ${clienteEscolhido.full_name}`);
    setTitulo(`Catálogo consignado ${clienteEscolhido.full_name} - ${new Date().toLocaleDateString("pt-BR")}`);
    setPasso("opcoes");
  }

  function toggleDestaque(id: number) {
    setDestaqueIds((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function gerarPdf() {
    const dados: CatalogoPdfDados = {
      tipo,
      titulo: titulo.trim() || nomeCatalogo,
      nomeCatalogo: nomeCatalogo.trim() || "Catálogo",
      logo,
      capa,
      porPagina,
      variar,
      clienteNome: tipo === "consignado" ? clienteEscolhido?.full_name || null : null,
      destaqueIds: Array.from(destaqueIds),
      pecas: pecasSelecionadas.map((p) => ({
        id: p.id,
        name: p.name || "",
        category: p.category || null,
        photo_url: p.photo_url || null,
        price: p.price === null || p.price === undefined ? null : Number(p.price),
        catalog_photo: p.catalog_photo ?? null,
        photo_modelo_url: p.modelo_photo_url ?? null,
      })),
    };
    try {
      sessionStorage.setItem("radar-catalogo-pdf", JSON.stringify(dados));
    } catch {
      // sessionStorage indisponível: segue mesmo assim, a página de impressão avisa se não achar nada.
    }
    router.push("/catalogo-pdf");
  }

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Cadastros</p>
        <h1>Gerar catálogo (PDF)</h1>
        <p>
          Escolha as peças marcadas com "Catálogo" no cadastro de produtos, depois gere o catálogo de varejo ou o
          consignado de um cliente. O PDF sai pela impressão do navegador (Ctrl+P).
        </p>
      </div>

      {passo === "selecionar" && (
        <>
          {loading ? (
            <div className="loading-state">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              Nenhuma peça está marcada para o catálogo ainda. Volte em Produtos e ligue o botão "Catálogo" nas
              peças que você quer incluir.
            </div>
          ) : (
            <>
              <div className="card" style={{ marginBottom: 12 }}>
                <div className="hint" style={{ marginBottom: 8 }}>
                  Tipo de peça (pode escolher mais de um). O número mostra quantas estão marcadas do total.
                </div>
                <div className="store-toggles" style={{ marginBottom: 12 }}>
                  {categoriasDisponiveis.map((c) => {
                    const completo = c.total > 0 && c.marcadas === c.total;
                    const parcial = c.marcadas > 0 && !completo;
                    return (
                      <button
                        key={c.nome}
                        type="button"
                        className={"toggle-chip" + (filtro.categorias.includes(c.nome) ? " on" : "")}
                        style={completo ? { borderColor: "var(--gold, #b8893a)" } : parcial ? { borderStyle: "dashed" } : undefined}
                        title={completo ? "Todas marcadas" : parcial ? "Algumas marcadas" : "Nenhuma marcada"}
                        onClick={() => alternarCategoria(c.nome)}
                      >
                        {completo ? "✓ " : ""}
                        {c.nome} ({c.marcadas}/{c.total})
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                  <label className="field" style={{ minWidth: 200 }}>
                    <span className="hint">Fabricante</span>
                    <select value={filtro.fabricante} onChange={(e) => setFiltro((f) => ({ ...f, fabricante: e.target.value }))}>
                      <option value="">Todos</option>
                      {fabricantesDisponiveis.map((f) => (
                        <option key={f.nome} value={f.nome}>
                          {f.nome} ({f.marcadas}/{f.total})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field" style={{ minWidth: 180 }}>
                    <span className="hint">Mostrar</span>
                    <select
                      value={filtro.situacao}
                      onChange={(e) => setFiltro((f) => ({ ...f, situacao: e.target.value as SituacaoMarcacao }))}
                    >
                      <option value="todas">Todas</option>
                      <option value="marcadas">Só as marcadas</option>
                      <option value="desmarcadas">Só as desmarcadas</option>
                    </select>
                  </label>
                  <label className="field" style={{ minWidth: 240, flex: 1 }}>
                    <span className="hint">Buscar no nome (ex.: zircônia, pérola, ródio)</span>
                    <input
                      type="text"
                      value={filtro.busca}
                      placeholder="Digite parte do nome"
                      onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))}
                    />
                  </label>
                  {filtroAtivo && (
                    <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-end" }} onClick={() => setFiltro(SEM_FILTRO)}>
                      Limpar filtros
                    </button>
                  )}
                </div>
                <div className="toolbar" style={{ marginBottom: 0 }}>
                  <span className="hint">
                    {selecionados.size} de {items.length} peças selecionadas
                    {filtroAtivo ? ` · mostrando ${exibidas.length}` : ""}
                  </span>
                  <button className="btn btn-ghost" onClick={marcarExibidas} disabled={exibidas.length === exibidasMarcadas}>
                    {filtroAtivo ? `Marcar as ${exibidas.length - exibidasMarcadas} que faltam` : "Selecionar todas"}
                  </button>
                  <button className="btn btn-ghost" onClick={desmarcarExibidas} disabled={exibidasMarcadas === 0}>
                    {filtroAtivo ? `Desmarcar as ${exibidasMarcadas} marcadas` : "Limpar seleção"}
                  </button>
                  {filtroAtivo && (
                    <button
                      className="btn btn-ghost"
                      onClick={ficarSoComExibidas}
                      disabled={exibidas.length === 0 || (exibidasMarcadas === exibidas.length && selecionados.size === exibidas.length)}
                    >
                      Ficar só com as {exibidas.length} mostradas
                    </button>
                  )}
                </div>
              </div>
              <div className="table-wrap tabela-cabe">
                <table>
                  <thead>
                    <tr>
                      <th></th>
                      <th>Foto</th>
                      <th>Peça</th>
                      <th>Categoria</th>
                      <th>Preço</th>
                      <th>Estoque</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exibidas.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selecionados.has(p.id)}
                            onChange={() => toggleSelecionado(p.id)}
                          />
                        </td>
                        <td>
                          {p.photo_url ? (
                            <img src={p.photo_url} alt={p.name || ""} className="thumb" />
                          ) : (
                            <span className="thumb-placeholder">💎</span>
                          )}
                        </td>
                        <td>{p.name || "(sem nome)"}</td>
                        <td>{p.category || "-"}</td>
                        <td className="num">{formatBRL(p.price)}</td>
                        <td>
                          <span className={"stock-pill " + (p.stock_qty <= 0 ? "out" : p.stock_qty <= 2 ? "low" : "ok")}>
                            {p.stock_qty}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {exibidas.length === 0 && <div className="empty-state">Nenhuma peça combina com esses filtros.</div>}
              <div className="modal-actions" style={{ marginTop: 18 }}>
                <button className="btn btn-primary" onClick={irParaTipo} disabled={selecionados.size === 0}>
                  Gerar catálogo com {selecionados.size} peça(s)
                </button>
              </div>
            </>
          )}
        </>
      )}

      {passo === "tipo" && (
        <div className="modal-panel" style={{ maxWidth: 560 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>Qual catálogo?</h2>
          <p className="hint" style={{ marginBottom: 16 }}>
            {pecasSelecionadas.length} peça(s) selecionada(s).
          </p>
          <div className="radio-row" style={{ marginBottom: 16 }}>
            <button type="button" className="radio-chip" onClick={escolherVarejo}>
              Catálogo Varejo Fernanda
            </button>
            <button type="button" className="radio-chip" onClick={irParaCliente}>
              Catálogo consignado (cliente)
            </button>
          </div>
          <div className="banner banner-info">
            <span>💡</span>
            <span>
              No varejo, o PDF só mostra as peças; nada muda no estoque. No consignado, cada peça vira uma venda
              consignada de verdade: desconta do estoque e entra no financeiro, do mesmo jeito que consignado
              sempre funcionou.
            </span>
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setPasso("selecionar")}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {passo === "cliente" && (
        <div className="modal-panel" style={{ maxWidth: 560 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>Catálogo consignado: qual cliente?</h2>
          <div className="field field--full" style={{ marginBottom: 16 }}>
            <label>Cliente</label>
            <Combobox
              options={clientOptions}
              value={clientId}
              onChange={setClientId}
              placeholder="Buscar cliente..."
              onCreate={createClient}
              createLabel="+ Cadastrar"
            />
            <span className="hint">Cliente novo? Digite o nome e clique em "+ Cadastrar".</span>
          </div>
          {clienteEscolhido && (
            <div className="banner banner-warning" style={{ marginBottom: 16 }}>
              <span>⚠️</span>
              <span>
                Isso vai criar {pecasSelecionadas.length} venda(s) consignada(s) para {clienteEscolhido.full_name},
                descontando essas peças do estoque. É uma ação financeira de verdade.
              </span>
            </div>
          )}
          {erro && (
            <div className="banner banner-warning" style={{ marginBottom: 16 }}>
              <span>⚠️</span>
              <span>{erro}</span>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setPasso("tipo")} disabled={criandoVendas}>
              Voltar
            </button>
            <button className="btn btn-primary" onClick={confirmarConsignado} disabled={!clienteEscolhido || criandoVendas}>
              {criandoVendas ? progresso || "Criando..." : "Criar vendas consignadas e continuar"}
            </button>
          </div>
        </div>
      )}

      {passo === "opcoes" && (
        <div className="modal-panel" style={{ maxWidth: 640 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>Opções do PDF</h2>
          {erro && (
            <div className="banner banner-warning" style={{ marginBottom: 16 }}>
              <span>⚠️</span>
              <span>{erro}</span>
            </div>
          )}
          <div className="form-grid">
            <div className="field field--full">
              <label>Título interno (só pra você organizar, não aparece igual no PDF)</label>
              <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="field field--full">
              <label>Nome do catálogo (aparece na capa)</label>
              <input type="text" value={nomeCatalogo} onChange={(e) => setNomeCatalogo(e.target.value)} />
            </div>
            <div className="field field--full">
              <label>
                <input type="checkbox" checked={logo} onChange={(e) => setLogo(e.target.checked)} style={{ marginRight: 8 }} />
                Mostrar o logo da Fernanda Brilhante na capa
              </label>
            </div>
            <div className="field field--full">
              <label>Peças por página</label>
              <div className="radio-row">
                {Array.from({ length: POR_PAGINA_MAX }, (_, i) => i + 1).map((n) => (
                  <button
                    type="button"
                    key={n}
                    className={"radio-chip" + (porPagina === n ? " selected" : "")}
                    aria-pressed={porPagina === n}
                    onClick={() => setPorPagina(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="hint">
                {porPagina === 1
                  ? "Uma peça grande por página, no estilo revista."
                  : `${porPagina} peças por página, em grade. Menos peças por página deixa cada foto maior.`}
              </div>
            </div>
            {porPagina === 1 && (
              <div className="field field--full">
                <label>
                  <input type="checkbox" checked={variar} onChange={(e) => setVariar(e.target.checked)} style={{ marginRight: 8 }} />
                  Variar o desenho da moldura a cada página (teste): quadrada, arco, espelhada e outras
                </label>
              </div>
            )}
            <div className="field field--full">
              <label>Capa do catálogo</label>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {CAPAS.map((src, i) => (
                  <button
                    type="button"
                    key={src}
                    onClick={() => setCapa(src)}
                    aria-label={`Capa ${i + 1}`}
                    aria-pressed={capa === src}
                    style={{
                      width: 140,
                      aspectRatio: "297 / 210",
                      padding: 0,
                      overflow: "hidden",
                      cursor: "pointer",
                      borderRadius: 8,
                      background: "linear-gradient(135deg, #f6dcd6, #e9bfb6)",
                      border: capa === src ? "3px solid var(--accent)" : "3px solid transparent",
                      outline: "1px solid var(--border-strong)",
                    }}
                  >
                    <img
                      src={src}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      onError={(e) => (e.currentTarget.style.display = "none")}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div className="field field--full">
              <label>Peças em destaque (aparecem em posição especial no PDF)</label>
              <div className="radio-row">
                {pecasSelecionadas.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={"radio-chip" + (destaqueIds.has(p.id) ? " selected" : "")}
                    onClick={() => toggleDestaque(p.id)}
                  >
                    {p.name || `#${p.id}`}
                  </button>
                ))}
              </div>
              <span className="hint">Opcional. Marcação só vale para este PDF, não fica salva no cadastro.</span>
            </div>
          </div>
          <div className="modal-actions">
            <button
              className="btn btn-ghost"
              onClick={() => setPasso(tipo === "varejo" ? "tipo" : "cliente")}
            >
              Voltar
            </button>
            <button className="btn btn-primary" onClick={gerarPdf}>
              Ver página de impressão
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
