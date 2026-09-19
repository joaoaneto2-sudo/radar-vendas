"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatBRL, Manufacturer, Product } from "@/lib/format";
import { CATALOGO_BIA_BELUTTI, FABRICANTE_DO_CATALOGO, chaveDoArquivo } from "@/lib/catalogo-bia-belutti";

// Importação única do catálogo da Bia Belutti: escolha as fotos da pasta, confira a lista e importe.
// Pode rodar de novo sem duplicar: peças que já existem são puladas (e ganham a foto, se estiverem sem).

type Situacao = "pendente" | "enviando" | "criada" | "foto_adicionada" | "ja_existe" | "erro";

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export default function ImportarCatalogoPage() {
  const [arquivos, setArquivos] = useState<Map<string, File>>(new Map());
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

  const fabricante = fabricantes.find((f) => semAcento(f.name) === semAcento(FABRICANTE_DO_CATALOGO)) ?? null;

  // Peça já cadastrada: mesmo nome, do mesmo fabricante (ou ainda sem fabricante).
  const jaExiste = (nome: string): Product | undefined =>
    produtos.find(
      (p) =>
        semAcento(p.name ?? "") === semAcento(nome) && (!fabricante || p.manufacturer_id === fabricante.id || !p.manufacturer_id)
    );

  const previews = useMemo(() => {
    const mapa = new Map<string, string>();
    arquivos.forEach((f, chave) => mapa.set(chave, URL.createObjectURL(f)));
    return mapa;
  }, [arquivos]);

  function escolher(e: React.ChangeEvent<HTMLInputElement>) {
    const novo = new Map<string, File>();
    Array.from(e.target.files ?? []).forEach((f) => novo.set(chaveDoArquivo(f.name), f));
    setArquivos(novo);
    setSituacao({});
    setAviso("");
  }

  const itens = CATALOGO_BIA_BELUTTI.map((item) => {
    const foto = arquivos.get(chaveDoArquivo(item.arquivo)) ?? null;
    return { item, foto, existente: jaExiste(item.nome) };
  });
  const comFoto = itens.filter((i) => i.foto).length;
  const jaCadastradas = itens.filter((i) => i.existente).length;

  function marcar(arquivo: string, estado: Situacao, nota?: string) {
    setSituacao((atual) => ({ ...atual, [arquivo]: { estado, nota } }));
  }

  async function importar() {
    if (importando) return;
    setImportando(true);
    setAviso("");
    try {
      // 1) Fabricante: usa o que já existe; se não existir, cria como representado (20% e 15 dias).
      let fabricanteId = fabricante?.id ?? null;
      if (!fabricanteId) {
        const res = await fetch("/api/manufacturers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: FABRICANTE_DO_CATALOGO,
            represented: true,
            commission_pct: 20,
            commission_days: 15,
            wholesale_mode: "pronta_entrega",
          }),
        });
        const dados = await res.json().catch(() => ({}));
        if (!res.ok) {
          setAviso(dados.message || "Não foi possível cadastrar o fabricante.");
          return;
        }
        fabricanteId = dados.item.id;
      }

      // 2) Uma peça por vez: foto, depois cadastro.
      for (const { item, foto, existente } of itens) {
        marcar(item.arquivo, "enviando");
        try {
          if (existente && (existente.photo_url || !foto)) {
            marcar(item.arquivo, "ja_existe", existente.photo_url ? undefined : "sem foto na pasta");
            continue;
          }

          let url: string | null = null;
          let notaFoto: string | undefined;
          if (foto) {
            const fd = new FormData();
            fd.append("file", foto);
            const up = await fetch("/api/upload", { method: "POST", body: fd });
            if (up.ok) url = (await up.json()).url;
            else notaFoto = "a foto não subiu (armazenamento das fotos indisponível)";
          } else {
            notaFoto = "foto não encontrada na pasta escolhida";
          }

          if (existente) {
            // Já existe sem foto: acrescenta a foto, mantendo o resto do cadastro como está.
            if (!url) {
              marcar(item.arquivo, "erro", notaFoto);
              continue;
            }
            const res = await fetch(`/api/products/${existente.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...existente, sale_price: existente.sale_price ?? "", photo_url: url }),
            });
            marcar(item.arquivo, res.ok ? "foto_adicionada" : "erro", res.ok ? undefined : "não foi possível guardar a foto");
            continue;
          }

          const res = await fetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.nome,
              category: item.categoria,
              subtype: item.subtipo,
              manufacturer_id: fabricanteId,
              price: String(item.preco),
              stock_qty: 0,
              sale_channel: "varejo",
              photo_url: url,
            }),
          });
          const dados = await res.json().catch(() => ({}));
          if (res.ok) marcar(item.arquivo, "criada", notaFoto);
          else marcar(item.arquivo, "erro", dados.message || "não foi possível cadastrar");
        } catch {
          marcar(item.arquivo, "erro", "falha de conexão");
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
    foto_adicionada: "Foto acrescentada",
    ja_existe: "Já existia",
    erro: "Com problema",
  };

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Cadastros</p>
        <h1>Importar catálogo: Bia Belutti</h1>
        <p>
          {`${CATALOGO_BIA_BELUTTI.length} peças de varejo, com descrição e preço de varejo do catálogo. O número no fim do nome das fotos (preço de atacado) é ignorado. Todas entram com estoque 0 e sem custo: complete depois em Cadastros, Produtos.`}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <ol style={{ paddingLeft: 18, lineHeight: 1.7 }}>
          <li>
            Clique em <strong>Escolher as fotos</strong> e abra a pasta <code>Catálogos / Fabricantes / Bia Belutti</code>.
          </li>
          <li>
            Aperte <strong>Ctrl + A</strong> para marcar todas as 29 fotos e confirme.
          </li>
          <li>Confira a lista abaixo e clique em <strong>Importar</strong>.</li>
        </ol>
        <input ref={inputRef} type="file" accept="image/*" multiple onChange={escolher} disabled={importando} />
        <div className="hint" style={{ marginTop: 8 }}>
          {carregando
            ? "Carregando..."
            : `${comFoto} de ${CATALOGO_BIA_BELUTTI.length} fotos encontradas. ${jaCadastradas} peça(s) já cadastrada(s). Fabricante: ${
                fabricante ? fabricante.name : "será cadastrado como representado (20%, 15 dias)"
              }.`}
        </div>
        {aviso && (
          <div className="banner banner-error" style={{ marginTop: 12 }}>
            <span>⚠️</span>
            <span>{aviso}</span>
          </div>
        )}
        <button
          className="btn btn-primary"
          style={{ marginTop: 14 }}
          disabled={importando || carregando || arquivos.size === 0}
          onClick={importar}
        >
          {importando ? "Importando..." : `Importar ${CATALOGO_BIA_BELUTTI.length - jaCadastradas} peça(s)`}
        </button>
        {Object.keys(situacao).length > 0 && !importando && (
          <div className="banner banner-info" style={{ marginTop: 12, marginBottom: 0 }}>
            <span>✓</span>
            <span>
              {`Cadastradas: ${resumo.criada ?? 0}. Fotos acrescentadas: ${resumo.foto_adicionada ?? 0}. Já existiam: ${resumo.ja_existe ?? 0}. Com problema: ${resumo.erro ?? 0}.`}
            </span>
          </div>
        )}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Foto</th>
              <th>Peça</th>
              <th>Categoria</th>
              <th>Preço de varejo</th>
              <th>Situação</th>
            </tr>
          </thead>
          <tbody>
            {itens.map(({ item, foto, existente }) => {
              const s = situacao[item.arquivo];
              const url = previews.get(chaveDoArquivo(item.arquivo));
              return (
                <tr key={item.arquivo}>
                  <td>
                    {url ? (
                      <img src={url} alt="" className="thumb" />
                    ) : (
                      <span className="thumb-placeholder" title="Foto não escolhida">
                        ?
                      </span>
                    )}
                  </td>
                  <td>{item.nome}</td>
                  <td>{item.categoria}</td>
                  <td className="num">{formatBRL(item.preco)}</td>
                  <td>
                    {s ? (
                      <span className={`stock-pill ${s.estado === "erro" ? "out" : s.estado === "enviando" ? "low" : "ok"}`}>
                        {rotulo[s.estado]}
                      </span>
                    ) : existente ? (
                      <span className="stock-pill low">Já cadastrada</span>
                    ) : foto ? (
                      <span className="stock-pill ok">Pronta</span>
                    ) : (
                      <span className="stock-pill out">Sem foto</span>
                    )}
                    {s?.nota && <div className="hint">{s.nota}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
