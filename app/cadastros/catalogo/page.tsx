"use client";

// Criar catálogo (PDF): uma tela só, em 3 blocos. 1) escolher as peças (filtros por tipo, fabricante,
// faixa de preço, busca, estoque e foto, ou peça a peça, ou sorteio); 2) ajustar nome, peças por
// página e capa; 3) ir para a página de impressão (/catalogo-pdf), onde sai o PDF.
// O catálogo é só um PDF: não mexe em estoque nem em financeiro. (O catálogo consignado, que criava
// vendas de verdade, saiu desta tela por decisão do João em 08/10/2026.)

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Product, formatBRL } from "@/lib/format";
import { CAPAS, CatalogoFoto, POR_PAGINA_MAX, POR_PAGINA_PADRAO } from "@/lib/catalogo-layout";
import {
  contarMarcacao,
  filtrarPecas,
  FiltroCatalogo,
  SEM_FILTRO,
  SituacaoMarcacao,
  sortearPecas,
  temFiltro,
} from "@/lib/catalogo-filtro";

const CHAVE_RASCUNHO = "radar-catalogo-rascunho";
const NOME_PADRAO = "Catálogo Varejo Fernanda";

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
  tipo: "varejo";
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

type Rascunho = {
  ids: number[];
  nomeCatalogo: string;
  logo: boolean;
  capa: string;
  porPagina: number;
  variar: boolean;
};

export default function CriarCatalogoPage() {
  const router = useRouter();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [filtro, setFiltro] = useState<FiltroCatalogo>(SEM_FILTRO);
  const [quantidadeSorteio, setQuantidadeSorteio] = useState("6");

  const [nomeCatalogo, setNomeCatalogo] = useState(NOME_PADRAO);
  const [logo, setLogo] = useState(true);
  const [capa, setCapa] = useState(CAPAS[0]);
  const [porPagina, setPorPagina] = useState(POR_PAGINA_PADRAO);
  const [variar, setVariar] = useState(true);
  const [destaqueIds, setDestaqueIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((p) => {
        const ativas: Product[] = (p.items || []).filter((it: Product) => it.active !== false);
        setItems(ativas);
        // Volta de "Voltar para a seleção": recupera o que estava escolhido.
        try {
          const bruto = sessionStorage.getItem(CHAVE_RASCUNHO);
          if (bruto) {
            const r = JSON.parse(bruto) as Rascunho;
            const existentes = new Set(ativas.map((it) => it.id));
            setSelecionados(new Set(r.ids.filter((id) => existentes.has(id))));
            setNomeCatalogo(r.nomeCatalogo || NOME_PADRAO);
            setLogo(r.logo);
            if (CAPAS.includes(r.capa)) setCapa(r.capa);
            setPorPagina(r.porPagina);
            setVariar(r.variar);
          }
        } catch {
          // sem rascunho ou sessionStorage indisponível: começa vazio
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const exibidas = useMemo(() => filtrarPecas(items, filtro, selecionados), [items, filtro, selecionados]);
  // Cada tipo mostra "marcadas/total" dentro dos outros filtros.
  const categoriasDisponiveis = useMemo(
    () => contarMarcacao(filtrarPecas(items, filtro, selecionados, "categorias"), (p) => p.category, selecionados),
    [items, filtro, selecionados]
  );
  const fabricantesDisponiveis = useMemo(
    () => contarMarcacao(items, (p) => p.manufacturer_name, selecionados),
    [items, selecionados]
  );
  const filtroAtivo = temFiltro(filtro);
  const exibidasMarcadas = exibidas.filter((p) => selecionados.has(p.id)).length;
  const pecasSelecionadas = items.filter((p) => selecionados.has(p.id));

  function mudarFiltro(parte: Partial<FiltroCatalogo>) {
    setFiltro((f) => ({ ...f, ...parte }));
  }

  function alternarCategoria(nome: string) {
    setFiltro((f) => ({
      ...f,
      categorias: f.categorias.includes(nome) ? f.categorias.filter((c) => c !== nome) : [...f.categorias, nome],
    }));
  }

  function toggleSelecionado(id: number) {
    setSelecionados((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function marcarExibidas() {
    setSelecionados((prev) => new Set([...prev, ...exibidas.map((p) => p.id)]));
  }

  function desmarcarExibidas() {
    const ids = new Set(exibidas.map((p) => p.id));
    setSelecionados((prev) => new Set([...prev].filter((id) => !ids.has(id))));
  }

  function limparTudo() {
    setSelecionados(new Set());
    setDestaqueIds(new Set());
  }

  // Sorteio: escolhe N peças ao acaso entre as que estão à mostra e deixa só elas marcadas.
  const quantidadeValida = Math.floor(Number(quantidadeSorteio));
  function sortear() {
    if (!(quantidadeValida > 0) || exibidas.length === 0) return;
    setSelecionados(new Set(sortearPecas(exibidas, quantidadeValida).map((p) => p.id)));
    setDestaqueIds(new Set());
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
    if (pecasSelecionadas.length === 0) return;
    const nome = nomeCatalogo.trim() || "Catálogo";
    const dados: CatalogoPdfDados = {
      tipo: "varejo",
      titulo: `${nome} - ${new Date().toLocaleDateString("pt-BR")}`,
      nomeCatalogo: nome,
      logo,
      capa,
      porPagina,
      variar,
      clienteNome: null,
      destaqueIds: Array.from(destaqueIds).filter((id) => selecionados.has(id)),
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
      const rascunho: Rascunho = { ids: Array.from(selecionados), nomeCatalogo: nome, logo, capa, porPagina, variar };
      sessionStorage.setItem(CHAVE_RASCUNHO, JSON.stringify(rascunho));
    } catch {
      // sessionStorage indisponível: segue mesmo assim, a página de impressão avisa se não achar nada.
    }
    router.push("/catalogo-pdf");
  }

  const totalSelecionadas = selecionados.size;

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Catálogo</p>
        <h1>Criar catálogo</h1>
        <p>Escolha as peças, ajuste o catálogo e baixe o PDF. Nada aqui muda estoque nem financeiro.</p>
      </div>

      {loading ? (
        <div className="loading-state">Carregando...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">Ainda não há peças cadastradas. Cadastre em Produtos e cadastros.</div>
      ) : (
        <>
          {/* BLOCO 1: escolher as peças */}
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginBottom: 4 }}>
              1. Escolha as peças
            </h2>
            <p className="hint" style={{ marginBottom: 12 }}>
              Use os filtros para achar um grupo (por exemplo, brincos da Zarpellon até R$ 200) e clique em "Marcar as
              mostradas". Também dá para marcar peça por peça na lista, ou sortear.
            </p>

            <div className="hint" style={{ marginBottom: 6 }}>
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
                <select value={filtro.fabricante} onChange={(e) => mudarFiltro({ fabricante: e.target.value })}>
                  <option value="">Todos</option>
                  {fabricantesDisponiveis.map((f) => (
                    <option key={f.nome} value={f.nome}>
                      {f.nome} ({f.marcadas}/{f.total})
                    </option>
                  ))}
                </select>
              </label>
              <label className="field" style={{ width: 130 }}>
                <span className="hint">Preço de (R$)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={filtro.precoMin}
                  placeholder="0"
                  onChange={(e) => mudarFiltro({ precoMin: e.target.value })}
                />
              </label>
              <label className="field" style={{ width: 130 }}>
                <span className="hint">até (R$)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={filtro.precoMax}
                  placeholder="sem limite"
                  onChange={(e) => mudarFiltro({ precoMax: e.target.value })}
                />
              </label>
              <label className="field" style={{ minWidth: 240, flex: 1 }}>
                <span className="hint">Buscar no nome (ex.: zircônia, pérola, ródio)</span>
                <input
                  type="text"
                  value={filtro.busca}
                  placeholder="Digite parte do nome"
                  onChange={(e) => mudarFiltro({ busca: e.target.value })}
                />
              </label>
              <label className="field" style={{ minWidth: 180 }}>
                <span className="hint">Mostrar</span>
                <select value={filtro.situacao} onChange={(e) => mudarFiltro({ situacao: e.target.value as SituacaoMarcacao })}>
                  <option value="todas">Todas</option>
                  <option value="marcadas">Só as marcadas</option>
                  <option value="desmarcadas">Só as desmarcadas</option>
                </select>
              </label>
            </div>

            <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
              <label>
                <input type="checkbox" checked={filtro.soComEstoque} onChange={(e) => mudarFiltro({ soComEstoque: e.target.checked })} style={{ marginRight: 6 }} />
                Só peças com estoque
              </label>
              <label>
                <input type="checkbox" checked={filtro.soComFoto} onChange={(e) => mudarFiltro({ soComFoto: e.target.checked })} style={{ marginRight: 6 }} />
                Só peças com foto
              </label>
              <label>
                <input type="checkbox" checked={filtro.soDoCatalogo} onChange={(e) => mudarFiltro({ soDoCatalogo: e.target.checked })} style={{ marginRight: 6 }} />
                Só as marcadas "Catálogo" no cadastro
              </label>
              {filtroAtivo && (
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setFiltro(SEM_FILTRO)}>
                  Limpar filtros
                </button>
              )}
            </div>

            <div className="toolbar" style={{ marginBottom: 8 }}>
              <strong>
                {totalSelecionadas} {totalSelecionadas === 1 ? "peça escolhida" : "peças escolhidas"}
              </strong>
              <span className="hint">
                · mostrando {exibidas.length} de {items.length}
              </span>
              <button className="btn btn-ghost" onClick={marcarExibidas} disabled={exibidas.length === 0 || exibidasMarcadas === exibidas.length}>
                Marcar as {exibidas.length - exibidasMarcadas} mostradas
              </button>
              <button className="btn btn-ghost" onClick={desmarcarExibidas} disabled={exibidasMarcadas === 0}>
                Desmarcar as {exibidasMarcadas} mostradas
              </button>
              <button className="btn btn-ghost" onClick={limparTudo} disabled={totalSelecionadas === 0}>
                Limpar tudo
              </button>
            </div>

            <div className="toolbar" style={{ marginBottom: 12 }}>
              <span className="hint">Sortear</span>
              <input
                type="number"
                min={1}
                value={quantidadeSorteio}
                onChange={(e) => setQuantidadeSorteio(e.target.value)}
                style={{ width: 70 }}
                aria-label="Quantidade de peças para sortear"
              />
              <span className="hint">peças ao acaso entre as {exibidas.length} mostradas</span>
              <button className="btn btn-ghost" onClick={sortear} disabled={!(quantidadeValida > 0) || exibidas.length === 0}>
                Sortear
              </button>
            </div>

            <div className="table-wrap tabela-cabe">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Foto</th>
                    <th>Peça</th>
                    <th>Categoria</th>
                    <th>Fabricante</th>
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
                          aria-label={`Escolher ${p.name || "peça"}`}
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
                      <td>{p.manufacturer_name || "-"}</td>
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
          </section>

          {/* BLOCO 2: ajustar o catálogo */}
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginBottom: 12 }}>
              2. Ajuste o catálogo
            </h2>
            <div className="form-grid">
              <div className="field field--full">
                <label>Nome do catálogo (aparece na capa)</label>
                <input type="text" value={nomeCatalogo} onChange={(e) => setNomeCatalogo(e.target.value)} />
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
                    Variar o desenho da moldura a cada página (quadrada, arco, espelhada e outras)
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
                <label>
                  <input type="checkbox" checked={logo} onChange={(e) => setLogo(e.target.checked)} style={{ marginRight: 8 }} />
                  Mostrar o logo da Fernanda Brilhante na capa
                </label>
              </div>
              {pecasSelecionadas.length > 0 && (
                <details className="field field--full">
                  <summary style={{ cursor: "pointer" }}>
                    Peças em destaque (opcional){destaqueIds.size > 0 ? `: ${destaqueIds.size} escolhida(s)` : ""}
                  </summary>
                  <div className="radio-row" style={{ marginTop: 8 }}>
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
                  <span className="hint">Aparecem em posição especial no PDF. A marcação vale só para este PDF.</span>
                </details>
              )}
            </div>
          </section>

          {/* BLOCO 3: baixar */}
          <section className="card">
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginBottom: 8 }}>3. Baixe o PDF</h2>
            <p className="hint" style={{ marginBottom: 12 }}>
              {totalSelecionadas === 0
                ? "Escolha pelo menos uma peça no bloco 1."
                : `O catálogo "${nomeCatalogo.trim() || "Catálogo"}" terá ${totalSelecionadas} ${totalSelecionadas === 1 ? "peça" : "peças"}, ${porPagina} por página. Na próxima tela, o botão "Baixar PDF" salva o arquivo.`}
            </p>
            <button className="btn btn-primary" onClick={gerarPdf} disabled={totalSelecionadas === 0}>
              Ver e baixar o PDF ({totalSelecionadas} {totalSelecionadas === 1 ? "peça" : "peças"})
            </button>
          </section>
        </>
      )}
    </main>
  );
}
