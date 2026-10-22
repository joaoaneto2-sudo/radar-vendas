"use client";

// Criar catálogo (PDF): uma tela só, em 3 blocos. 1) escolher as peças (filtros por tipo, fabricantes, fornecedores,
// faixa de preço, busca, estoque e foto, ou peça a peça, ou sorteio); 2) ajustar nome, peças por
// página e capa; 3) ir para a página de impressão (/catalogo-pdf), onde sai o PDF.
// O catálogo é só um PDF: não mexe em estoque nem em financeiro. (O catálogo consignado, que criava
// vendas de verdade, saiu desta tela por decisão do João em 08/10/2026.)

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Product, formatBRL } from "@/lib/format";
import { CAPAS, CAPAS_COM_TEXTO_A_ESQUERDA, CatalogoFoto, POR_PAGINA_MAX, POR_PAGINA_PADRAO } from "@/lib/catalogo-layout";
import { MARCA_TAMANHO, NOME_TAMANHO, capaLayoutValido, limitarPonto, marcaTamanhoPadrao, posicaoPadrao, semPosicao, type CapaLayout, type ElementoDaCapa, type Ponto } from "@/lib/catalogo-capa";
import { CRITERIOS_DE_ORDEM, moverPara, moverUmaCasa, ordenarPor, pecasNaOrdem, type CriterioDeOrdem } from "@/lib/catalogo-ordem";
import {
  BLOCO_NOVO,
  FONTES_DA_MENSAGEM,
  MAXIMO_DE_BLOCOS,
  MENSAGEM_PADRAO,
  MODELOS_DE_MENSAGEM,
  TEXTO_MAXIMO_DO_BLOCO,
  URL_DAS_FONTES,
  mensagemValida,
  type BlocoDaMensagem,
  type ColunaDaMensagem,
  type LinhaDaMensagem,
  type MensagemDaCapa,
} from "@/lib/catalogo-mensagem";
import { CapaDoCatalogo } from "@/app/catalogo-pdf/capa";
import { QUALIDADES_DO_PDF, qualidadeValida, type QualidadeDoPdf } from "@/lib/catalogo-imagem";
import estiloDoCatalogo from "@/app/catalogo-pdf/catalogo-pdf.module.css";
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
const CHAVE_FOCO = "radar-catalogo-foco"; // onde está a joia na foto da modelo de cada peça; fica guardado neste navegador para os próximos catálogos
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
  mensagemCapa?: MensagemDaCapa | null; // mensagem sobre a capa (slogan, pergunta, oferta); ausente = sem mensagem
  capaLayout?: CapaLayout; // onde o João pôs a marca, o nome e a mensagem na capa; ausente = no lugar de sempre
  qualidadePdf?: QualidadeDoPdf; // leve (padrão) ou alta: tamanho das fotos dentro do PDF
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
  ordem?: number[];
  mensagem?: MensagemDaCapa;
  capaLayout?: CapaLayout;
  qualidadePdf?: QualidadeDoPdf;
};

/** Enquadramento da peça no catálogo: o foco escolhido (onde está a joia na foto da modelo) vale só para peça com close + modelo. */
function focoDaModelo(p: Product, ponto: { x: number; y: number } | undefined): CatalogoFoto | null {
  const atual = p.catalog_photo ?? null;
  if (!ponto || !p.modelo_photo_url || atual?.kind === "modelo") return atual;
  return { kind: "limpa", zoom: 1, ...atual, fx: ponto.x, fy: ponto.y };
}

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
  const [foco, setFoco] = useState<Record<number, { x: number; y: number }>>({});
  const [ordem, setOrdem] = useState<number[]>([]); // ids na ordem das páginas; quem não está aqui segue a ordem da lista
  const [mensagem, setMensagem] = useState<MensagemDaCapa>(MENSAGEM_PADRAO);
  const [capaLayout, setCapaLayout] = useState<CapaLayout>({});
  const [qualidadePdf, setQualidadePdf] = useState<QualidadeDoPdf>("leve");
  const [arrastando, setArrastando] = useState<number | null>(null);
  const [soltarSobre, setSoltarSobre] = useState<number | null>(null);

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CHAVE_FOCO);
      if (guardado) setFoco(JSON.parse(guardado));
    } catch {
      // sem armazenamento local: o foco vale só nesta tela
    }
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
            if (Array.isArray(r.ordem)) setOrdem(r.ordem.filter((id) => existentes.has(id)));
            if (r.capaLayout) setCapaLayout(capaLayoutValido(r.capaLayout));
            if (r.qualidadePdf) setQualidadePdf(qualidadeValida(r.qualidadePdf));
            if (r.mensagem && Array.isArray(r.mensagem.blocos) && r.mensagem.blocos.length > 0) setMensagem({ ...MENSAGEM_PADRAO, ...r.mensagem });
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
  const pecasSelecionadas = useMemo(() => pecasNaOrdem(items.filter((p) => selecionados.has(p.id)), ordem), [items, selecionados, ordem]);

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
    const sorteadas = sortearPecas(exibidas, quantidadeValida);
    setSelecionados(new Set(sorteadas.map((p) => p.id)));
    setOrdem(sorteadas.map((p) => p.id));
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

  // Clique na foto da modelo = onde está a joia. O catálogo passa a mostrar essa parte da foto, sem cortar a joia.
  function definirFoco(id: number, ponto: { x: number; y: number } | null) {
    setFoco((prev) => {
      const novo = { ...prev };
      if (ponto) novo[id] = { x: Math.round(Math.min(100, Math.max(0, ponto.x))), y: Math.round(Math.min(100, Math.max(0, ponto.y))) };
      else delete novo[id];
      try {
        localStorage.setItem(CHAVE_FOCO, JSON.stringify(novo));
      } catch {
        // sem armazenamento local: o foco vale só nesta tela
      }
      return novo;
    });
  }

  function toggleDestaque(id: number) {
    const ficaEmDestaque = !destaqueIds.has(id);
    setDestaqueIds((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
    // Peça em destaque abre o catálogo (depois das outras em destaque); a ordem pode ser mudada em seguida.
    if (ficaEmDestaque) {
      const ids = pecasSelecionadas.map((p) => p.id);
      const ultimoDestaque = ids.reduce((fim, x, i) => (destaqueIds.has(x) ? i : fim), -1);
      setOrdem(moverPara(ids, id, ultimoDestaque + 1));
    }
  }

  // Ordem das páginas: botões, arrastar ou um critério pronto.
  const idsNaOrdem = pecasSelecionadas.map((p) => p.id);
  function ordenarAutomatico(criterio: CriterioDeOrdem) {
    setOrdem(ordenarPor(pecasSelecionadas, criterio));
  }
  function soltarPeca(idAlvo: number) {
    if (arrastando !== null && arrastando !== idAlvo) setOrdem(moverPara(idsNaOrdem, arrastando, idsNaOrdem.indexOf(idAlvo)));
    setArrastando(null);
    setSoltarSobre(null);
  }

  function mudarMensagem(parte: Partial<MensagemDaCapa>) {
    setMensagem((prev) => ({ ...prev, ...parte }));
  }
  function mudarBloco(indice: number, parte: Partial<BlocoDaMensagem>) {
    setMensagem((prev) => ({ ...prev, blocos: prev.blocos.map((b, i) => (i === indice ? { ...b, ...parte } : b)) }));
  }
  function adicionarBloco() {
    setMensagem((prev) => (prev.blocos.length >= MAXIMO_DE_BLOCOS ? prev : { ...prev, blocos: [...prev.blocos, { ...BLOCO_NOVO }] }));
  }
  function tirarBloco(indice: number) {
    setMensagem((prev) => (prev.blocos.length <= 1 ? prev : { ...prev, blocos: prev.blocos.filter((_, i) => i !== indice) }));
  }
  const temMensagem = mensagemValida(mensagem) !== null;
  const capaLateral = CAPAS_COM_TEXTO_A_ESQUERDA.includes(capa);
  function moverNaCapa(elemento: ElementoDaCapa, ponto: Ponto) {
    setCapaLayout((prev) => ({ ...prev, [elemento]: limitarPonto(ponto) }));
  }
  function centralizarNaCapa(elemento: "marca" | "nome") {
    setCapaLayout((prev) => ({ ...prev, [elemento]: { x: 50, y: (prev[elemento] ?? posicaoPadrao(elemento, capaLateral)).y } }));
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
      mensagemCapa: mensagemValida(mensagem),
      capaLayout: capaLayoutValido(capaLayout),
      qualidadePdf,
      pecas: pecasSelecionadas.map((p) => ({
        id: p.id,
        name: p.name || "",
        category: p.category || null,
        photo_url: p.photo_url || null,
        price: p.price === null || p.price === undefined ? null : Number(p.price),
        catalog_photo: focoDaModelo(p, foco[p.id]),
        photo_modelo_url: p.modelo_photo_url ?? null,
        ...(fotosEscolhidas(p, fotosPorPeca, escolhaDeFotos[p.id]) ? { fotos: fotosEscolhidas(p, fotosPorPeca, escolhaDeFotos[p.id]) } : {}),
      })),
    };
    try {
      sessionStorage.setItem("radar-catalogo-pdf", JSON.stringify(dados));
      const rascunho: Rascunho = { ids: Array.from(selecionados), nomeCatalogo: nome, logo, capa, porPagina, variar, fotosPorPeca, escolhaDeFotos, ordem: idsNaOrdem, mensagem, capaLayout, qualidadePdf };
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
              {pecasSelecionadas.length > 1 && (
                <details className="field field--full" open>
                  <summary style={{ cursor: "pointer" }}>Ordem das peças no catálogo ({pecasSelecionadas.length})</summary>
                  <p className="hint" style={{ margin: "8px 0" }}>
                    A lista abaixo é a ordem das páginas. Arraste uma peça para outro lugar, ou use as setas. Peça marcada como destaque vai para o começo.
                  </p>
                  <div className="toolbar" style={{ marginBottom: 8 }}>
                    <select
                      value=""
                      aria-label="Ordenar automaticamente"
                      onChange={(e) => {
                        if (e.target.value) ordenarAutomatico(e.target.value as CriterioDeOrdem);
                      }}
                    >
                      <option value="">Ordenar automaticamente...</option>
                      {CRITERIOS_DE_ORDEM.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nome}
                        </option>
                      ))}
                    </select>
                    {ordem.length > 0 && (
                      <button type="button" className="btn btn-ghost btn-small" onClick={() => setOrdem([])}>
                        Voltar à ordem da lista
                      </button>
                    )}
                  </div>
                  <ol style={{ maxHeight: 420, overflowY: "auto", margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 6 }}>
                    {pecasSelecionadas.map((p, i) => (
                      <li
                        key={p.id}
                        draggable
                        onDragStart={() => setArrastando(p.id)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (soltarSobre !== p.id) setSoltarSobre(p.id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          soltarPeca(p.id);
                        }}
                        onDragEnd={() => {
                          setArrastando(null);
                          setSoltarSobre(null);
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "4px 8px",
                          border: "1px solid var(--border)",
                          borderTop: soltarSobre === p.id && arrastando !== p.id ? "3px solid var(--accent)" : "1px solid var(--border)",
                          borderRadius: 10,
                          background: arrastando === p.id ? "var(--surface-soft)" : "transparent",
                          opacity: arrastando === p.id ? 0.55 : 1,
                          cursor: "grab",
                        }}
                      >
                        <span className="hint" style={{ width: 26, textAlign: "right" }}>
                          {i + 1}
                        </span>
                        {p.photo_url ? <img src={p.photo_url} alt="" className="thumb" draggable={false} /> : <span className="thumb-placeholder">💎</span>}
                        <span style={{ flex: 1, minWidth: 0 }}>
                          {p.name || `#${p.id}`}
                          {destaqueIds.has(p.id) && <span className="hint"> · destaque</span>}
                        </span>
                        <span className="hint">{formatBRL(p.price)}</span>
                        <span style={{ display: "flex", gap: 2 }}>
                          <button type="button" className="btn btn-ghost btn-small" title="Para o começo" aria-label={`Colocar ${p.name} no começo`} disabled={i === 0} onClick={() => setOrdem(moverPara(idsNaOrdem, p.id, 0))}>
                            ⤒
                          </button>
                          <button type="button" className="btn btn-ghost btn-small" title="Subir uma" aria-label={`Subir ${p.name}`} disabled={i === 0} onClick={() => setOrdem(moverUmaCasa(idsNaOrdem, p.id, -1))}>
                            ↑
                          </button>
                          <button type="button" className="btn btn-ghost btn-small" title="Descer uma" aria-label={`Descer ${p.name}`} disabled={i === pecasSelecionadas.length - 1} onClick={() => setOrdem(moverUmaCasa(idsNaOrdem, p.id, 1))}>
                            ↓
                          </button>
                          <button type="button" className="btn btn-ghost btn-small" title="Para o fim" aria-label={`Colocar ${p.name} no fim`} disabled={i === pecasSelecionadas.length - 1} onClick={() => setOrdem(moverPara(idsNaOrdem, p.id, idsNaOrdem.length))}>
                            ⤓
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
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
                {pecasSelecionadas.some((p) => p.modelo_photo_url && p.catalog_photo?.kind !== "modelo") && (
                  <details style={{ marginTop: 8 }}>
                    <summary style={{ cursor: "pointer" }}>
                      Enquadrar a foto da modelo{Object.keys(foco).length > 0 ? ` (${pecasSelecionadas.filter((p) => foco[p.id]).length} com a joia marcada)` : ""}
                    </summary>
                    <p className="hint" style={{ margin: "8px 0" }}>
                      Se a joia ficou cortada ou na beirada da página, clique em cima da joia na foto da modelo. O catálogo passa a mostrar essa parte da
                      foto. Fica guardado para os próximos catálogos.
                    </p>
                    <div style={{ maxHeight: 460, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
                      {pecasSelecionadas
                        .filter((p) => p.modelo_photo_url && p.catalog_photo?.kind !== "modelo")
                        .map((p) => (
                          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", gap: 6, marginBottom: 6, fontSize: 13 }}>
                              <strong>{p.name || `#${p.id}`}</strong>
                              {foco[p.id] && (
                                <button type="button" className="btn btn-ghost btn-small" onClick={() => definirFoco(p.id, null)}>
                                  Centralizar
                                </button>
                              )}
                            </div>
                            <div
                              role="button"
                              tabIndex={0}
                              aria-label={`Clique na joia da peça ${p.name}`}
                              style={{ position: "relative", cursor: "crosshair", lineHeight: 0 }}
                              onClick={(e) => {
                                const r = e.currentTarget.getBoundingClientRect();
                                definirFoco(p.id, { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
                              }}
                            >
                              <img src={p.modelo_photo_url as string} alt="" style={{ width: "100%", borderRadius: 8, display: "block" }} />
                              {foco[p.id] && (
                                <span
                                  style={{
                                    position: "absolute",
                                    left: `${foco[p.id].x}%`,
                                    top: `${foco[p.id].y}%`,
                                    width: 22,
                                    height: 22,
                                    marginLeft: -11,
                                    marginTop: -11,
                                    borderRadius: 999,
                                    border: "3px solid var(--accent)",
                                    boxShadow: "0 0 0 2px #fff",
                                    pointerEvents: "none",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        ))}
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
              <div className="field field--full capa-editor">
                <style>{`
                  .capa-editor { display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr) minmax(320px, 44%); align-items: start; }
                  .capa-previa { position: sticky; top: 12px; }
                  @media (max-width: 960px) {
                    .capa-editor { grid-template-columns: minmax(0, 1fr); }
                    .capa-previa { order: -1; z-index: 5; background: var(--surface); padding: 8px 0; }
                  }
                `}</style>
                <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
              <div>
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
              <div>
                <label>
                  <input type="checkbox" checked={logo} onChange={(e) => setLogo(e.target.checked)} style={{ marginRight: 8 }} />
                  Mostrar o logo da Fernanda Brilhante na capa
                </label>
              </div>
              <div>
                <link rel="stylesheet" href={URL_DAS_FONTES} />
                <label>Mensagem sobre a capa (opcional)</label>
                <div className="hint" style={{ marginBottom: 8 }}>
                  Um slogan, uma pergunta ou uma oferta, de 1 a {MAXIMO_DE_BLOCOS} linhas, cada uma com a sua fonte, tamanho e cor. Fica fora da área da marca e do
                  nome do catálogo. Dica: o que você escrever entre *asteriscos* sai maior (ex.: Até *25% OFF*).
                </div>
                <div className="hint" style={{ marginBottom: 6 }}>
                  Comece por um modelo e troque os textos (isso troca as linhas que estão aí):
                </div>
                <div className="radio-row" style={{ marginBottom: 10 }}>
                  {MODELOS_DE_MENSAGEM.map((m) => (
                    <button type="button" key={m.id} className="radio-chip" onClick={() => setMensagem(structuredClone(m.mensagem))}>
                      {m.nome}
                    </button>
                  ))}
                  {temMensagem && (
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setMensagem(MENSAGEM_PADRAO)}>
                      Sem mensagem
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  {mensagem.blocos.map((b, i) => (
                    <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 10, display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text"
                          style={{ flex: 1 }}
                          maxLength={TEXTO_MAXIMO_DO_BLOCO}
                          value={b.texto}
                          aria-label={`Texto da linha ${i + 1}`}
                          placeholder={i === 0 ? "Ex.: Psiu..." : "Ex.: Até *25% OFF*"}
                          onChange={(e) => mudarBloco(i, { texto: e.target.value })}
                        />
                        {mensagem.blocos.length > 1 && (
                          <button type="button" className="btn btn-ghost btn-small" onClick={() => tirarBloco(i)}>
                            Tirar linha
                          </button>
                        )}
                      </div>
                      <div className="radio-row">
                        {FONTES_DA_MENSAGEM.map((fonte) => (
                          <button
                            type="button"
                            key={fonte.id}
                            className={"radio-chip" + (b.fonte === fonte.id ? " selected" : "")}
                            aria-pressed={b.fonte === fonte.id}
                            style={{ fontFamily: fonte.css, fontWeight: fonte.pesoNormal, fontSize: 16 }}
                            onClick={() => mudarBloco(i, { fonte: fonte.id })}
                          >
                            {fonte.nome}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
                        <div className="radio-row" aria-label="Tamanho">
                          {([["p", "Pequeno"], ["m", "Médio"], ["g", "Grande"], ["gg", "Enorme"], ["xg", "Gigante"]] as const).map(([v, nome]) => (
                            <button type="button" key={v} className={"radio-chip" + (b.tamanho === v ? " selected" : "")} aria-pressed={b.tamanho === v} onClick={() => mudarBloco(i, { tamanho: v })}>
                              {nome}
                            </button>
                          ))}
                        </div>
                        <div className="radio-row" aria-label="Cor">
                          {([["branco", "Branca"], ["dourado", "Dourada"], ["escuro", "Marrom"], ["preto", "Preta"]] as const).map(([v, nome]) => (
                            <button type="button" key={v} className={"radio-chip" + (b.cor === v ? " selected" : "")} aria-pressed={b.cor === v} onClick={() => mudarBloco(i, { cor: v })}>
                              {nome}
                            </button>
                          ))}
                        </div>
                        <div className="radio-row" aria-label="Estilo">
                          {([["texto", "Texto solto"], ["faixa", "Faixa dourada"]] as const).map(([v, nome]) => (
                            <button type="button" key={v} className={"radio-chip" + (b.estilo === v ? " selected" : "")} aria-pressed={b.estilo === v} onClick={() => mudarBloco(i, { estilo: v })}>
                              {nome}
                            </button>
                          ))}
                        </div>
                        <label>
                          <input type="checkbox" checked={b.sublinhado} onChange={(e) => mudarBloco(i, { sublinhado: e.target.checked })} style={{ marginRight: 6 }} />
                          Traço dourado embaixo
                        </label>
                      </div>
                    </div>
                  ))}
                  {mensagem.blocos.length < MAXIMO_DE_BLOCOS && (
                    <div>
                      <button type="button" className="btn btn-ghost btn-small" onClick={adicionarBloco}>
                        + Adicionar outra linha
                      </button>
                    </div>
                  )}
                </div>
                {temMensagem && (
                  <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
                    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
                      <div>
                        <div className="hint" style={{ marginBottom: 6 }}>
                          Posição na capa
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 30px)", gap: 4 }}>
                          {(["topo", "meio", "base"] as LinhaDaMensagem[]).flatMap((linha) =>
                            (["esq", "centro", "dir"] as ColunaDaMensagem[]).map((coluna) => {
                              const ativa = mensagem.linha === linha && mensagem.coluna === coluna;
                              return (
                                <button
                                  type="button"
                                  key={linha + coluna}
                                  aria-label={`Mensagem ${linha === "topo" ? "em cima" : linha === "meio" ? "no meio" : "embaixo"}, ${coluna === "esq" ? "à esquerda" : coluna === "dir" ? "à direita" : "no centro"}`}
                                  aria-pressed={ativa}
                                  onClick={() => {
                                    mudarMensagem({ linha, coluna });
                                    setCapaLayout((prev) => semPosicao(prev, ["mensagem"]));
                                  }}
                                  style={{
                                    height: 30,
                                    borderRadius: 6,
                                    cursor: "pointer",
                                    border: "1px solid var(--border-strong)",
                                    background: ativa ? "var(--accent)" : "transparent",
                                  }}
                                />
                              );
                            })
                          )}
                        </div>
                      </div>
                      <label style={{ maxWidth: 360 }}>
                        <input type="checkbox" checked={mensagem.fundo} onChange={(e) => mudarMensagem({ fundo: e.target.checked })} style={{ marginRight: 8 }} />
                        Fundo escuro suave atrás da mensagem (ajuda a ler sobre qualquer foto)
                      </label>
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label>Posição e tamanho na capa</label>
                <div className="hint" style={{ marginBottom: 8 }}>
                  Arraste na pré-visualização. Dá para pôr a marca no alto e a mensagem embaixo, do mesmo lado, ou onde preferir.
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <strong style={{ width: 150 }}>Marca Fernanda Brilhante</strong>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="hint">Tamanho</span>
                      <input
                        type="range"
                        min={MARCA_TAMANHO.min}
                        max={MARCA_TAMANHO.max}
                        value={capaLayout.marcaTamanho ?? marcaTamanhoPadrao(capaLateral)}
                        onChange={(e) => setCapaLayout((prev) => ({ ...prev, marcaTamanho: Number(e.target.value) }))}
                      />
                    </label>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => centralizarNaCapa("marca")}>
                      Centralizar
                    </button>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setCapaLayout((prev) => semPosicao({ ...prev, marcaTamanho: undefined }, ["marca"]))}>
                      Voltar ao lugar
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <strong style={{ width: 150 }}>Nome do catálogo</strong>
                    <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="hint">Tamanho</span>
                      <input
                        type="range"
                        min={NOME_TAMANHO.min}
                        max={NOME_TAMANHO.max}
                        step={0.05}
                        value={capaLayout.nomeTamanho ?? NOME_TAMANHO.padrao}
                        onChange={(e) => setCapaLayout((prev) => ({ ...prev, nomeTamanho: Number(e.target.value) }))}
                      />
                    </label>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => centralizarNaCapa("nome")}>
                      Centralizar
                    </button>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setCapaLayout((prev) => semPosicao({ ...prev, nomeTamanho: undefined }, ["nome"]))}>
                      Voltar ao lugar
                    </button>
                  </div>
                  {temMensagem && (
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <strong style={{ width: 150 }}>Mensagem</strong>
                      <span className="hint">Arraste, ou use as 9 posições acima.</span>
                      <button type="button" className="btn btn-ghost btn-small" disabled={!capaLayout.mensagem} onClick={() => setCapaLayout((prev) => semPosicao(prev, ["mensagem"]))}>
                        Voltar ao lugar
                      </button>
                    </div>
                  )}
                  <div>
                    <button type="button" className="btn btn-ghost btn-small" onClick={() => setCapaLayout({})}>
                      Voltar tudo ao lugar de sempre
                    </button>
                  </div>
                </div>
              </div>
                </div>
                <div className="capa-previa">
                  <div className="hint" style={{ marginBottom: 6 }}>
                    <strong>Pré-visualização da capa</strong>: muda na hora. <strong>Arraste</strong> a marca, o nome do catálogo ou a mensagem para
                    onde quiser.
                  </div>
                  <div className={estiloDoCatalogo.catalogo}>
                    <CapaDoCatalogo
                      capa={capa}
                      nomeCatalogo={nomeCatalogo.trim() || "Catálogo"}
                      mensagem={mensagemValida(mensagem)}
                      layout={capaLayout}
                      editavel
                      onMover={moverNaCapa}
                    />
                  </div>
                </div>
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
            <div style={{ marginBottom: 14 }}>
              <label>Tamanho do arquivo</label>
              <div className="radio-row" style={{ marginTop: 6 }}>
                {(Object.keys(QUALIDADES_DO_PDF) as QualidadeDoPdf[]).map((q) => (
                  <button
                    type="button"
                    key={q}
                    className={"radio-chip" + (qualidadePdf === q ? " selected" : "")}
                    aria-pressed={qualidadePdf === q}
                    onClick={() => setQualidadePdf(q)}
                  >
                    {QUALIDADES_DO_PDF[q].nome}
                  </button>
                ))}
              </div>
              <div className="hint" style={{ marginTop: 6 }}>
                {QUALIDADES_DO_PDF[qualidadePdf].descricao}
              </div>
            </div>
            <button className="btn btn-primary" onClick={gerarPdf} disabled={totalSelecionadas === 0}>
              Ver e baixar o PDF ({totalSelecionadas} {totalSelecionadas === 1 ? "peça" : "peças"})
            </button>
          </section>
        </>
      )}
    </main>
  );
}
