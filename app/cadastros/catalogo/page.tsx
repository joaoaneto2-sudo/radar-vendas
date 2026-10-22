"use client";

// Criar catálogo (PDF): uma tela só, em 3 blocos. 1) escolher as peças (filtros por tipo, fabricantes, fornecedores,
// faixa de preço, busca, estoque e foto, ou peça a peça, ou sorteio); 2) ajustar nome, peças por
// página e capa; 3) ir para a página de impressão (/catalogo-pdf), onde sai o PDF.
// O catálogo é só um PDF: não mexe em estoque nem em financeiro. (O catálogo consignado, que criava
// vendas de verdade, saiu desta tela por decisão do João em 08/10/2026.)

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Product, formatBRL } from "@/lib/format";
import { CAPAS, CatalogoFoto, POR_PAGINA_MAX, POR_PAGINA_PADRAO } from "@/lib/catalogo-layout";
import { FOTOS_POR_PECA_MAX, fotosDaPagina, fotosDisponiveis, fotosEscolhidas, type PadraoDeFotos } from "@/lib/catalogo-fotos";
import {
  contarMarcacao,
  filtrarPecas,
  FiltroCatalogo,
  SEM_FILTRO,
  SituacaoMarcacao,
  sortearPecas,
  temFiltro,
  temPreco,
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
  fotos?: string[]; // fotos escolhidas para o catálogo, em ordem (a primeira é a principal); ausente = close + modelo
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
  fotosPorPeca?: PadraoDeFotos;
  escolhaDeFotos?: Record<number, string[]>;
};

export default function CriarCatalogoPage() {
  const router = useRouter();
  const [items, setItems] = useState<Product[]>([]);
  const [semPreco, setSemPreco] = useState(0); // peças ativas que ficam de fora por não terem preço
  const [loading, setLoading] = useState(true);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [filtro, setFiltro] = useState<FiltroCatalogo>(SEM_FILTRO);
  const [quantidadeSorteio, setQuantidadeSorteio] = useState("6");

  const [nomeCatalogo, setNomeCatalogo] = useState(NOME_PADRAO);
  const [logo, setLogo] = useState(true);
  const [capa, setCapa] = useState(CAPAS[0]);
  const [porPagina, setPorPagina] = useState(POR_PAGINA_PADRAO);
  const [variar, setVariar] = useState(true);
  const [fotosPorPeca, setFotosPorPeca] = useState<PadraoDeFotos>("padrao");
  const [escolhaDeFotos, setEscolhaDeFotos] = useState<Record<number, string[]>>({});
  const [destaqueIds, setDestaqueIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetch("/api/products")
      .then((r) => r.json())
      .then((p) => {
        const todasAtivas: Product[] = (p.items || []).filter((it: Product) => it.active !== false);
        const ativas = todasAtivas.filter(temPreco);
        setSemPreco(todasAtivas.length - ativas.length);
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
            if (r.fotosPorPeca) setFotosPorPeca(r.fotosPorPeca);
            if (r.escolhaDeFotos) setEscolhaDeFotos(r.escolhaDeFotos);
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
  const colecoesDisponiveis = useMemo(() => {
    const mapa = new Map<string, { nome: string; total: number; marcadas: number }>();
    for (const p of items) {
      for (const c of p.colecoes ?? []) {
        const atual = mapa.get(c) ?? { nome: c, total: 0, marcadas: 0 };
        atual.total++;
        if (selecionados.has(p.id)) atual.marcadas++;
        mapa.set(c, atual);
      }
    }
    return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [items, selecionados]);
  const fabricantesDisponiveis = useMemo(
    () => contarMarcacao(items, (p) => p.manufacturer_name, selecionados),
    [items, selecionados]
  );
  const fornecedoresDisponiveis = useMemo(
    () => contarMarcacao(items, (p) => p.supplier_name, selecionados),
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

  function alternarLista(campo: "fabricantes" | "fornecedores" | "colecoes", nome: string) {
    setFiltro((f) => ({
      ...f,
      [campo]: f[campo].includes(nome) ? f[campo].filter((x) => x !== nome) : [...f[campo], nome],
    }));
    if (campo === "colecoes") {
      // Com uma coleção só, o catálogo ganha o nome dela (a menos que o nome já tenha sido mudado à mão).
      const novas = filtro.colecoes.includes(nome) ? filtro.colecoes.filter((x) => x !== nome) : [...filtro.colecoes, nome];
      const nomeAindaAutomatico = nomeCatalogo === NOME_PADRAO || colecoesDisponiveis.some((c) => c.nome === nomeCatalogo);
      if (nomeAindaAutomatico) setNomeCatalogo(novas.length === 1 ? novas[0] : NOME_PADRAO);
    }
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

  // Fotos de cada peça no catálogo: o que vale hoje para a peça (escolha própria, número de fotos ou o padrão) e o clique numa foto.
  function fotosDaPeca(p: Product): string[] {
    return fotosDaPagina(p, fotosEscolhidas(p, fotosPorPeca, escolhaDeFotos[p.id]));
  }

  function alternarFoto(p: Product, url: string) {
    const atual = fotosDaPeca(p);
    let nova: string[];
    if (atual.includes(url)) {
      if (atual.length === 1) return; // pelo menos uma foto
      nova = atual.filter((u) => u !== url);
    } else {
      if (atual.length >= FOTOS_POR_PECA_MAX) return;
      nova = [...atual, url];
    }
    setEscolhaDeFotos((prev) => ({ ...prev, [p.id]: nova }));
  }

  function voltarAoPadraoDeFotos(id: number) {
    setEscolhaDeFotos((prev) => {
      const novo = { ...prev };
      delete novo[id];
      return novo;
    });
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
        ...(fotosEscolhidas(p, fotosPorPeca, escolhaDeFotos[p.id]) ? { fotos: fotosEscolhidas(p, fotosPorPeca, escolhaDeFotos[p.id]) } : {}),
      })),
    };
    try {
      sessionStorage.setItem("radar-catalogo-pdf", JSON.stringify(dados));
      const rascunho: Rascunho = { ids: Array.from(selecionados), nomeCatalogo: nome, logo, capa, porPagina, variar, fotosPorPeca, escolhaDeFotos };
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
        <p>
          Escolha as peças, ajuste o catálogo e baixe o PDF. Nada aqui muda estoque nem financeiro. Peça sem preço não aparece aqui.
          {semPreco > 0 && ` Hoje ${semPreco} ${semPreco === 1 ? "peça está fora" : "peças estão fora"} por falta de preço.`}
        </p>
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

            {colecoesDisponiveis.length > 0 && (
              <>
                <div className="hint" style={{ marginBottom: 6 }}>
                  Coleção especial: pastas escolhidas para uma ação (por exemplo, a Escolhas de Fernanda). Marque uma para ver só as peças dela.
                </div>
                <div className="store-toggles" style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    className={"toggle-chip" + (filtro.colecoes.length === 0 ? " on" : "")}
                    title="Sem escolher nenhuma, entram todas as peças"
                    onClick={() => mudarFiltro({ colecoes: [] })}
                  >
                    Todas as peças
                  </button>
                  {colecoesDisponiveis.map((c) => (
                    <button
                      key={c.nome}
                      type="button"
                      className={"toggle-chip" + (filtro.colecoes.includes(c.nome) ? " on" : "")}
                      onClick={() => alternarLista("colecoes", c.nome)}
                    >
                      ⭐ {c.nome} ({c.marcadas}/{c.total})
                    </button>
                  ))}
                </div>
              </>
            )}
            <div className="hint" style={{ marginBottom: 6 }}>
              Tipo de peça. "Todos" ou só os que você marcar. O número mostra quantas estão marcadas do total.
            </div>
            <div className="store-toggles" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={"toggle-chip" + (filtro.categorias.length === 0 ? " on" : "")}
                title="Sem escolher nenhum, entram todos"
                onClick={() => mudarFiltro({ categorias: [] })}
              >
                Todos os tipos
              </button>
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

            <div className="hint" style={{ marginBottom: 6 }}>
              Fabricante (a mesma divisão das pastas do estoque). "Todos" ou só os que você marcar.
            </div>
            <div className="store-toggles" style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={"toggle-chip" + (filtro.fabricantes.length === 0 ? " on" : "")}
                title="Sem escolher nenhum, entram todos"
                onClick={() => mudarFiltro({ fabricantes: [] })}
              >
                Todos os fabricantes
              </button>
              {fabricantesDisponiveis.map((f) => (
                <button
                  key={f.nome}
                  type="button"
                  className={"toggle-chip" + (filtro.fabricantes.includes(f.nome) ? " on" : "")}
                  onClick={() => alternarLista("fabricantes", f.nome)}
                >
                  {f.nome} ({f.marcadas}/{f.total})
                </button>
              ))}
            </div>

            {fornecedoresDisponiveis.length > 0 && (
              <>
                <div className="hint" style={{ marginBottom: 6 }}>
                  Fornecedor (de quem a peça foi comprada; pode escolher mais de um).
                </div>
                <div className="store-toggles" style={{ marginBottom: 12 }}>
                  <button
                    type="button"
                    className={"toggle-chip" + (filtro.fornecedores.length === 0 ? " on" : "")}
                    title="Sem escolher nenhum, entram todos"
                    onClick={() => mudarFiltro({ fornecedores: [] })}
                  >
                    Todos os fornecedores
                  </button>
                  {fornecedoresDisponiveis.map((f) => (
                    <button
                      key={f.nome}
                      type="button"
                      className={"toggle-chip" + (filtro.fornecedores.includes(f.nome) ? " on" : "")}
                      onClick={() => alternarLista("fornecedores", f.nome)}
                    >
                      {f.nome} ({f.marcadas}/{f.total})
                    </button>
                  ))}
                </div>
              </>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
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
              <div className="field field--full">
                <label>Fotos de cada peça</label>
                <div className="radio-row">
                  <button
                    type="button"
                    className={"radio-chip" + (fotosPorPeca === "padrao" ? " selected" : "")}
                    aria-pressed={fotosPorPeca === "padrao"}
                    onClick={() => setFotosPorPeca("padrao")}
                  >
                    Padrão (close + modelo)
                  </button>
                  {Array.from({ length: FOTOS_POR_PECA_MAX }, (_, i) => i + 1).map((n) => (
                    <button
                      type="button"
                      key={n}
                      className={"radio-chip" + (fotosPorPeca === n ? " selected" : "")}
                      aria-pressed={fotosPorPeca === n}
                      onClick={() => setFotosPorPeca(n as PadraoDeFotos)}
                    >
                      {n} {n === 1 ? "foto" : "fotos"}
                    </button>
                  ))}
                </div>
                <div className="hint">
                  {fotosPorPeca === "padrao"
                    ? "Cada peça usa a foto principal e, se tiver, a foto da modelo. Peça com uma foto só sai com a foto grande."
                    : `As ${fotosPorPeca} primeiras fotos de cada peça (peça com menos fotos usa as que tem). Para escolher quais, uma peça por vez, abra a lista abaixo.`}
                  {porPagina > 2 && (fotosPorPeca === 3 || fotosPorPeca === 4 || Object.values(escolhaDeFotos).some((l) => l.length > 2))
                    ? " Atenção: com mais de 2 peças por página só cabem 2 fotos de cada. Para 3 ou 4 fotos, use 1 ou 2 peças por página."
                    : ""}
                </div>
                {pecasSelecionadas.length > 0 && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer" }}>
                      Escolher as fotos peça por peça{Object.keys(escolhaDeFotos).length > 0 ? ` (${Object.keys(escolhaDeFotos).length} com escolha própria)` : ""}
                    </summary>
                    <p className="hint" style={{ margin: "8px 0" }}>
                      Clique nas fotos para ligar e desligar. O número mostra a posição: a 1 é a foto de destaque (emoldurada, ao lado do nome) e as outras
                      ficam no painel das fotos. Até {FOTOS_POR_PECA_MAX} por peça.
                    </p>
                    <div style={{ maxHeight: 420, overflowY: "auto", display: "grid", gap: 10 }}>
                      {pecasSelecionadas.map((p) => {
                        const todas = fotosDisponiveis(p);
                        const usadas = fotosDaPeca(p);
                        return (
                          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                              <strong>{p.name || `#${p.id}`}</strong>
                              <span className="hint">
                                {usadas.length} de {todas.length} {todas.length === 1 ? "foto" : "fotos"}
                                {escolhaDeFotos[p.id] && (
                                  <button type="button" className="btn btn-ghost btn-small" style={{ marginLeft: 8 }} onClick={() => voltarAoPadraoDeFotos(p.id)}>
                                    Voltar ao padrão
                                  </button>
                                )}
                              </span>
                            </div>
                            {todas.length === 0 ? (
                              <span className="hint">Esta peça não tem foto.</span>
                            ) : (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {todas.map((foto) => {
                                  const posicao = usadas.indexOf(foto.url) + 1;
                                  return (
                                    <button
                                      type="button"
                                      key={foto.url}
                                      onClick={() => alternarFoto(p, foto.url)}
                                      aria-pressed={posicao > 0}
                                      title={`${foto.rotulo}: clique para ${posicao > 0 ? "tirar do" : "pôr no"} catálogo`}
                                      style={{
                                        position: "relative",
                                        width: 84,
                                        padding: 0,
                                        borderRadius: 8,
                                        overflow: "hidden",
                                        cursor: "pointer",
                                        background: "#eee",
                                        border: posicao > 0 ? "3px solid var(--accent)" : "3px solid transparent",
                                        opacity: posicao > 0 ? 1 : 0.45,
                                      }}
                                    >
                                      <img src={foto.url} alt={foto.rotulo} style={{ width: "100%", height: 84, objectFit: "cover", display: "block" }} />
                                      <span style={{ position: "absolute", left: 3, bottom: 3, fontSize: 10, background: "rgba(0,0,0,.55)", color: "#fff", borderRadius: 4, padding: "0 4px" }}>
                                        {foto.rotulo}
                                      </span>
                                      {posicao > 0 && (
                                        <span style={{ position: "absolute", right: 3, top: 3, fontSize: 12, fontWeight: 700, background: "var(--accent)", color: "#fff", borderRadius: 999, minWidth: 20, textAlign: "center" }}>
                                          {posicao}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
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
