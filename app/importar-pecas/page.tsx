"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatBRL, Manufacturer, Product, PRODUCT_CATEGORIES, PRODUCT_CATEGORY_NAMES } from "@/lib/format";
import { lerNomeDoArquivo } from "@/lib/importar-pecas";
import { centsToReais } from "@/lib/finance/money";

// Importação genérica de peças para o catálogo online (Fase 3). Parecida com a tela de importação
// da Bia Belutti, mas não usa uma lista fixa: lê nome e custo do NOME DO ARQUIVO da foto (veja
// lib/importar-pecas.ts). Quando o arquivo não segue o padrão, a peça entra "não reconhecida" e a
// pessoa preenche nome e custo à mão, sem travar a importação das outras.
//
// Cada peça importada entra com uma foto só, tratada como a "limpa" do catálogo (products.photo_url).
// Não grava product_photos.kind: essa coluna é só para fotos extras, que esta tela não usa.

type Situacao = "pendente" | "enviando" | "criada" | "ja_existe" | "erro";
type Disponibilidade = "pronta_entrega" | "encomenda";

const SEM_FABRICANTE = "";
const MARKUP = 2.5;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

interface ItemImportacao {
  chave: string;
  arquivo: File;
  preview: string;
  reconhecido: boolean;
  nome: string;
  custo: string; // reais, texto editável (vírgula ou ponto)
  categoria: string;
  subtipo: string;
  manufacturerId: string; // "" = sem fabricante
  manufacturerCode: string;
  disponibilidade: Disponibilidade;
}

function custoValido(custo: string): number | null {
  const n = Number(custo.replace(",", "."));
  return custo.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

function nomeCombina(nomeA: string | null | undefined, nomeB: string) {
  return semAcento(nomeA ?? "") === semAcento(nomeB);
}

export default function ImportarPecasPage() {
  const [itens, setItens] = useState<ItemImportacao[]>([]);
  const [produtos, setProdutos] = useState<Product[]>([]);
  const [fabricantes, setFabricantes] = useState<Manufacturer[]>([]);
  const [situacao, setSituacao] = useState<Record<string, { estado: Situacao; nota?: string }>>({});
  const [importando, setImportando] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function carregar() {
    return Promise.all([fetch("/api/products").then((r) => r.json()), fetch("/api/manufacturers").then((r) => r.json())])
      .then(([p, m]) => {
        setProdutos(p.items || []);
        setFabricantes(m.items || []);
      })
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  // Some as fotos escolhidas quando a página fecha (evita vazar memória com os object URLs).
  useEffect(() => {
    return () => {
      itens.forEach((it) => URL.revokeObjectURL(it.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    itens.forEach((it) => URL.revokeObjectURL(it.preview));
    const arquivos = Array.from(e.target.files ?? []);
    const novos: ItemImportacao[] = arquivos.map((arquivo, i) => {
      const lido = lerNomeDoArquivo(arquivo.name);
      return {
        chave: `${arquivo.name}-${i}`,
        arquivo,
        preview: URL.createObjectURL(arquivo),
        reconhecido: !!lido,
        nome: lido?.nome ?? "",
        custo: lido ? centsToReais(lido.custoCentavos).toFixed(2) : "",
        categoria: "",
        subtipo: "",
        manufacturerId: SEM_FABRICANTE,
        manufacturerCode: "",
        disponibilidade: "pronta_entrega",
      };
    });
    setItens(novos);
    setSituacao({});
    setAviso("");
  }

  function atualizar<K extends keyof ItemImportacao>(chave: string, campo: K, valor: ItemImportacao[K]) {
    setItens((atual) =>
      atual.map((it) => {
        if (it.chave !== chave) return it;
        const novo = { ...it, [campo]: valor };
        if (campo === "categoria") novo.subtipo = PRODUCT_CATEGORIES[valor as string]?.[0] ?? "";
        if (campo === "manufacturerId" && !valor) novo.manufacturerCode = "";
        return novo;
      })
    );
  }

  // Peça já cadastrada: mesmo nome (sem acento, minúsculo) e mesmo fabricante (ou ambos sem fabricante).
  function encontrarExistente<T extends { name?: string | null; manufacturer_id?: number | null }>(
    lista: T[],
    nome: string,
    manufacturerId: number | null
  ): T | undefined {
    if (!nome.trim()) return undefined;
    return lista.find((p) => nomeCombina(p.name, nome) && (p.manufacturer_id ?? null) === manufacturerId);
  }
  const jaExisteEm = (lista: { name?: string | null; manufacturer_id?: number | null }[], nome: string, manufacturerId: number | null) =>
    !!encontrarExistente(lista, nome, manufacturerId);

  const jaExiste = (item: ItemImportacao) =>
    encontrarExistente(produtos, item.nome, item.manufacturerId ? Number(item.manufacturerId) : null);

  const prontos = itens.filter((it) => !jaExiste(it) && it.nome.trim() && custoValido(it.custo) !== null && it.categoria);
  const jaCadastradas = itens.filter((it) => jaExiste(it)).length;
  const naoReconhecidas = itens.filter((it) => !it.reconhecido).length;

  function marcar(chave: string, estado: Situacao, nota?: string) {
    setSituacao((atual) => ({ ...atual, [chave]: { estado, nota } }));
  }

  async function importar() {
    if (importando) return;
    setImportando(true);
    setAviso("");
    // Além do que já existe no banco, evita duplicar peças repetidas dentro da mesma leva de fotos.
    const criadosNestaRodada: { name: string; manufacturer_id: number | null }[] = [];
    try {
      for (const item of itens) {
        const manufacturerId = item.manufacturerId ? Number(item.manufacturerId) : null;
        if (jaExisteEm(produtos, item.nome, manufacturerId) || jaExisteEm(criadosNestaRodada, item.nome, manufacturerId)) {
          marcar(item.chave, "ja_existe");
          continue;
        }
        const custo = custoValido(item.custo);
        if (!item.nome.trim() || custo === null || !item.categoria) {
          continue; // fica pendente: falta preencher algo, não conta como erro
        }

        marcar(item.chave, "enviando");
        try {
          const fd = new FormData();
          fd.append("file", item.arquivo);
          const up = await fetch("/api/upload", { method: "POST", body: fd });
          if (!up.ok) {
            const dadosUp = await up.json().catch(() => ({}));
            marcar(
              item.chave,
              "erro",
              dadosUp.error === "blob_not_configured" ? "armazenamento de fotos indisponível" : "a foto não subiu"
            );
            continue;
          }
          const { url } = await up.json();

          const preco = Math.round(custo * MARKUP * 100) / 100;
          const res = await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.nome.trim(),
              category: item.categoria,
              subtype: item.subtipo || null,
              manufacturer_id: manufacturerId,
              cost: custo,
              price: preco,
              stock_qty: item.disponibilidade === "pronta_entrega" ? 1 : 0,
              sale_channel: "varejo",
              active: true,
              photo_url: url,
              show_online: false,
              availability: item.disponibilidade,
              manufacturer_code: item.manufacturerCode.trim() || null,
              show_catalog: true,
            }),
          });
          const dados = await res.json().catch(() => ({}));
          if (res.ok) {
            marcar(item.chave, "criada");
            criadosNestaRodada.push({ name: item.nome.trim(), manufacturer_id: manufacturerId });
          } else {
            marcar(item.chave, "erro", dados.message || "não foi possível cadastrar");
          }
        } catch {
          marcar(item.chave, "erro", "falha de conexão");
        }
      }
    } finally {
      await carregar();
      setImportando(false);
    }
  }

  const resumo = Object.values(situacao).reduce(
    (t, s) => ({ ...t, [s.estado]: (t[s.estado] ?? 0) + 1 }),
    {} as Partial<Record<Situacao, number>>
  );
  const rotulo: Record<Situacao, string> = {
    pendente: "",
    enviando: "Enviando...",
    criada: "Cadastrada",
    ja_existe: "Já existe",
    erro: "Com problema",
  };

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Cadastros</p>
        <h1>Importar peças</h1>
        <p>
          Escolha as fotos das peças. O nome de cada peça e o custo são lidos do nome do arquivo (padrão "algo - nome
          da peça - custo 123,45.jpeg"). Preço = custo × 2,5. Cada peça entra marcada no catálogo online.
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input ref={inputRef} type="file" accept="image/*" multiple onChange={escolher} disabled={importando} />
        <div className="hint" style={{ marginTop: 8 }}>
          {carregando
            ? "Carregando..."
            : itens.length === 0
            ? "Nenhuma foto escolhida ainda."
            : `${itens.length} foto(s) escolhida(s). ${naoReconhecidas} não reconhecida(s) (preencha nome e custo à mão). ${jaCadastradas} já cadastrada(s) (serão puladas).`}
        </div>
        {aviso && (
          <div className="banner banner-error" style={{ marginTop: 12 }}>
            <span>⚠️</span>
            <span>{aviso}</span>
          </div>
        )}
        <button className="btn btn-primary" style={{ marginTop: 14 }} disabled={importando || carregando || itens.length === 0} onClick={importar}>
          {importando ? "Importando..." : `Importar ${prontos.length} peça(s)`}
        </button>
        {Object.keys(situacao).length > 0 && !importando && (
          <div className="banner banner-info" style={{ marginTop: 12, marginBottom: 0 }}>
            <span>✓</span>
            <span>
              {`Cadastradas: ${resumo.criada ?? 0}. Já existiam: ${resumo.ja_existe ?? 0}. Com problema: ${resumo.erro ?? 0}.`}
            </span>
          </div>
        )}
      </div>

      {itens.map((item) => {
        const s = situacao[item.chave];
        const existente = jaExiste(item);
        const custo = custoValido(item.custo);
        const preco = custo !== null ? custo * MARKUP : null;
        const faltaAlgo = !item.nome.trim() || custo === null || !item.categoria;
        return (
          <div className="card import-item" key={item.chave}>
            <img src={item.preview} alt="" className="thumb-lg" />
            <div className="import-item-body">
              {!item.reconhecido && (
                <div className="banner banner-warning" style={{ marginBottom: 12 }}>
                  <span>⚠️</span>
                  <span>{`Nome do arquivo fora do padrão ("${item.arquivo.name}"): preencha nome e custo à mão.`}</span>
                </div>
              )}
              <div className="form-grid">
                <div className="field field--full">
                  <label>Nome da peça</label>
                  <input
                    type="text"
                    value={item.nome}
                    disabled={importando}
                    onChange={(e) => atualizar(item.chave, "nome", e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Custo</label>
                  <div className="money-input">
                    <span className="prefix">R$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.custo}
                      disabled={importando}
                      onChange={(e) => atualizar(item.chave, "custo", e.target.value)}
                    />
                  </div>
                </div>
                <div className="field">
                  <label>Preço (custo × 2,5)</label>
                  <input type="text" value={preco !== null ? formatBRL(preco) : "-"} disabled readOnly />
                </div>
                <div className="field">
                  <label>Categoria</label>
                  <select value={item.categoria} disabled={importando} onChange={(e) => atualizar(item.chave, "categoria", e.target.value)}>
                    <option value="">Escolha...</option>
                    {PRODUCT_CATEGORY_NAMES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Subtipo</label>
                  <select
                    value={item.subtipo}
                    disabled={importando || !item.categoria}
                    onChange={(e) => atualizar(item.chave, "subtipo", e.target.value)}
                  >
                    {(PRODUCT_CATEGORIES[item.categoria] ?? []).map((s2) => (
                      <option key={s2} value={s2}>
                        {s2}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Fabricante</label>
                  <select
                    value={item.manufacturerId}
                    disabled={importando}
                    onChange={(e) => atualizar(item.chave, "manufacturerId", e.target.value)}
                  >
                    <option value="">(a confirmar / sem fabricante)</option>
                    {fabricantes.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Código do fabricante</label>
                  <input
                    type="text"
                    value={item.manufacturerCode}
                    disabled={importando || !item.manufacturerId}
                    placeholder={item.manufacturerId ? "Opcional" : "Escolha um fabricante"}
                    onChange={(e) => atualizar(item.chave, "manufacturerCode", e.target.value)}
                  />
                </div>
                <div className="field field--full">
                  <label>Disponibilidade</label>
                  <div className="radio-row">
                    <button
                      type="button"
                      className={"radio-chip" + (item.disponibilidade === "pronta_entrega" ? " selected" : "")}
                      disabled={importando}
                      onClick={() => atualizar(item.chave, "disponibilidade", "pronta_entrega")}
                    >
                      Pronta entrega
                    </button>
                    <button
                      type="button"
                      className={"radio-chip" + (item.disponibilidade === "encomenda" ? " selected" : "")}
                      disabled={importando}
                      onClick={() => atualizar(item.chave, "disponibilidade", "encomenda")}
                    >
                      Sob encomenda
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="import-item-status">
              {s ? (
                <span className={`stock-pill ${s.estado === "erro" ? "out" : s.estado === "enviando" ? "low" : "ok"}`}>
                  {rotulo[s.estado]}
                </span>
              ) : existente ? (
                <span className="stock-pill low">Já existe</span>
              ) : faltaAlgo ? (
                <span className="stock-pill out">Falta preencher</span>
              ) : (
                <span className="stock-pill ok">Pronta</span>
              )}
              {s?.nota && <div className="hint">{s.nota}</div>}
              {existente && !s && <div className="hint">{`Cadastrada como "${existente.name}"`}</div>}
            </div>
          </div>
        );
      })}
    </main>
  );
}
