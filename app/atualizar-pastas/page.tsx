"use client";

// Atualizar pelas pastas: o João salva as fotos novas na pasta do fabricante (Estoque\1 - Estoque Principal\<Fabricante>)
// e clica aqui. O Radar lê as pastas (com a permissão que o navegador pede uma vez), junta close + modelo de cada
// peça, mostra o que vai fazer e, ao confirmar: renomeia os arquivos com o código, envia as fotos novas e grava as
// peças. O que já subiu e não mudou é pulado.

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatBRL, type Product } from "@/lib/format";
import { fabricanteParecido } from "@/lib/importar-lote";
import { semAcento } from "@/lib/catalogo-filtro";
import {
  assinatura,
  planejarPasta,
  resumoDoPlano,
  type ArquivoDaPasta,
  type PecaDoRadar,
  type PecaPlanejada,
  type PlanoDaPasta,
} from "@/lib/varredura";
import {
  escolherPasta,
  garantirPermissao,
  lembrarPasta,
  pastaLembrada,
  raizDeHandle,
  raizDeMentira,
  temAcessoAPastas,
  type ArquivoDeMentira,
  type ArquivoFonte,
  type RaizFonte,
} from "@/lib/fonte-de-pastas";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface PlanoLido extends PlanoDaPasta {
  arquivos: Map<string, ArquivoFonte>;
}

type Fase = "inicio" | "lendo" | "conferencia" | "executando" | "pronto";

const TEXTO_DA_SITUACAO: Record<PecaPlanejada["situacao"], string> = {
  nova: "Peça nova",
  atualizar: "Atualizar",
  igual: "Já está em dia",
};

// Foto para o catálogo: JPEG com até 1600 pixels no lado maior (leve para enviar e carregar).
async function prepararFoto(arquivo: Blob): Promise<File> {
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1600 / Math.max(imagem.width, imagem.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(imagem.width * escala);
  canvas.height = Math.round(imagem.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Este navegador não conseguiu preparar a foto.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(imagem, 0, 0, canvas.width, canvas.height);
  const jpeg: Blob = await new Promise((ok, erro) => canvas.toBlob((b) => (b ? ok(b) : erro(new Error("Falha ao preparar a foto."))), "image/jpeg", 0.84));
  return new File([jpeg], "foto.jpg", { type: "image/jpeg" });
}

async function enviarFoto(arquivo: ArquivoFonte): Promise<string> {
  const foto = await prepararFoto(await arquivo.ler());
  const fd = new FormData();
  fd.append("file", foto);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d.error === "blob_not_configured" ? "O armazenamento de fotos (Vercel Blob) não está configurado." : `Não foi possível enviar "${arquivo.nome}".`);
  }
  return (await res.json()).url as string;
}

// Baixa um arquivo com os nomes antigos de cada arquivo renomeado (para o João, ou para mim, desfazer se precisar).
function baixarRegistro(registro: { pasta: string; de: string; para: string }[]) {
  const dia = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(registro, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `registro-de-renomeacao-${dia}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default function AtualizarPastasPage() {
  const [fase, setFase] = useState<Fase>("inicio");
  const [raiz, setRaiz] = useState<RaizFonte | null>(null);
  const [lembrada, setLembrada] = useState<any | null>(null);
  const [planos, setPlanos] = useState<PlanoLido[]>([]);
  const [erro, setErro] = useState("");
  const [progresso, setProgresso] = useState("");
  const [relatorio, setRelatorio] = useState<{ criadas: number; atualizadas: number; fotos: number; renomeados: number; avisos: string[]; falhas: string[]; registro: { pasta: string; de: string; para: string }[] } | null>(null);
  const [suporte, setSuporte] = useState(true);

  const ler = useCallback(async (fonte: RaizFonte) => {
    setFase("lendo");
    setErro("");
    try {
      const res = await fetch("/api/products");
      if (!res.ok) throw new Error("Não foi possível carregar as peças do Radar.");
      const produtos: Product[] = ((await res.json()).items || []).filter((p: Product) => p.active !== false && p.sale_channel !== "atacado");
      const nomesDeFabricante = [...new Set(produtos.map((p) => p.manufacturer_name).filter(Boolean) as string[])].map((name) => ({ name }));
      const lidos: PlanoLido[] = [];
      for (const dir of await fonte.diretorios()) {
        const arquivos = await dir.arquivos();
        const chave = semAcento(dir.nome);
        const fab = nomesDeFabricante.find((f) => semAcento(f.name) === chave) ?? fabricanteParecido(nomesDeFabricante, chave);
        const doRadar: PecaDoRadar[] = produtos
          .filter((p) => fab && p.manufacturer_name === fab.name)
          .map((p) => ({
            id: p.id,
            nome: p.name ?? "",
            codigo: p.manufacturer_code ?? null,
            custo: p.cost === null || p.cost === undefined || p.cost === "" ? null : Number(p.cost),
            custoDaPasta: p.custo_da_pasta === null || p.custo_da_pasta === undefined || p.custo_da_pasta === "" ? null : Number(p.custo_da_pasta),
            temFoto: !!p.photo_url,
            temModelo: !!p.modelo_photo_url,
            fotoOrigem: p.foto_origem ?? null,
            modeloOrigem: p.modelo_origem ?? null,
          }));
        const plano = planejarPasta(dir.nome, arquivos as ArquivoDaPasta[], doRadar);
        lidos.push({ ...plano, arquivos: new Map(arquivos.map((a) => [a.nome, a])) });
      }
      setPlanos(lidos);
      setRaiz(fonte);
      setFase("conferencia");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler as pastas.");
      setFase("inicio");
    }
  }, []);

  useEffect(() => {
    setSuporte(temAcessoAPastas());
    pastaLembrada().then(setLembrada);
  }, []);

  // Gancho só para testes no computador de desenvolvimento: usa uma pasta de mentira em vez da pasta de verdade.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as any).__radarVarredura = {
      usarPastaDeMentira: (pastas: Record<string, ArquivoDeMentira[]>) => ler(raizDeMentira("Estoque (teste)", pastas)),
    };
  }, [ler]);

  async function escolher() {
    setErro("");
    try {
      const handle = await escolherPasta();
      await lembrarPasta(handle);
      setLembrada(handle);
      await ler(raizDeHandle(handle));
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // fechou a janela de escolha
      setErro("Não foi possível abrir a pasta. Tente de novo.");
    }
  }

  async function usarLembrada() {
    setErro("");
    try {
      if (!(await garantirPermissao(lembrada))) {
        setErro("Sem a permissão do navegador não dá para ler as pastas. Clique em Permitir quando ele perguntar.");
        return;
      }
      await ler(raizDeHandle(lembrada));
    } catch {
      setErro("Não foi possível abrir a pasta lembrada. Escolha de novo.");
    }
  }

  const todos = useMemo(() => planos.flatMap((p) => p.pecas.map((peca) => ({ pasta: p.fabricante, peca }))), [planos]);
  const resumo = useMemo(() => resumoDoPlano(planos), [planos]);
  const trabalho = todos.filter((x) => x.peca.situacao !== "igual" || x.peca.renomear.length > 0);

  async function atualizar() {
    if (!raiz) return;
    setFase("executando");
    setErro("");
    const falhas: string[] = [];
    const registro: { pasta: string; de: string; para: string }[] = [];
    const avisos: string[] = [];
    let criadas = 0;
    let atualizadas = 0;
    let fotos = 0;
    let renomeados = 0;
    const itens: any[] = [];

    for (const plano of planos) {
      for (const peca of plano.pecas) {
        if (peca.situacao === "igual" && peca.renomear.length === 0) continue;
        setProgresso(`${plano.fabricante}: ${peca.nome}`);
        try {
          // 1) renomear os arquivos para o padrão (com o código)
          for (const r of peca.renomear) {
            const atual = plano.arquivos.get(r.de);
            if (!atual) continue;
            const novo = await atual.renomear(r.para);
            plano.arquivos.delete(r.de);
            plano.arquivos.set(novo.nome, novo);
            renomeados++;
            registro.push({ pasta: plano.fabricante, de: r.de, para: r.para });
            if (peca.close?.nome === r.de) peca.close = { nome: novo.nome, tamanho: novo.tamanho, modificadoEm: novo.modificadoEm };
            if (peca.modelo?.nome === r.de) peca.modelo = { nome: novo.nome, tamanho: novo.tamanho, modificadoEm: novo.modificadoEm };
          }
          // 2) enviar as fotos que mudaram
          const item: any = { fabricante: plano.fabricante, nome: peca.nome, custo: peca.custo, categoria: peca.categoria, codigo: peca.codigo };
          if (peca.subir.close && peca.close) {
            item.fotoPrincipal = await enviarFoto(plano.arquivos.get(peca.close.nome)!);
            item.fotoOrigem = assinatura(peca.close);
            item.catalogo = { kind: peca.catalogoKind, fx: 50, fy: 50, zoom: 1 };
            fotos++;
          }
          if (peca.subir.modelo && peca.modelo) {
            item.fotoModelo = await enviarFoto(plano.arquivos.get(peca.modelo.nome)!);
            item.modeloOrigem = assinatura(peca.modelo);
            fotos++;
          }
          if (peca.situacao !== "igual" || item.fotoPrincipal || item.fotoModelo) itens.push(item);
        } catch (e) {
          falhas.push(`${plano.fabricante}: ${peca.nome}: ${e instanceof Error ? e.message : "erro"}`);
        }
      }
    }

    // 3) gravar no Radar, em pedaços
    for (let i = 0; i < itens.length; i += 20) {
      const pedaco = itens.slice(i, i + 20);
      setProgresso(`Gravando peças ${i + 1} a ${i + pedaco.length} de ${itens.length}`);
      try {
        const res = await fetch("/api/importar-lote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itens: pedaco, confirmar: true }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          falhas.push(d.message || "Não foi possível gravar um pedaço da lista. Nada dele foi gravado.");
          continue;
        }
        criadas += d.criadas;
        atualizadas += d.atualizadas;
        for (const it of d.itens || []) if (it.aviso) avisos.push(`${it.fabricante}: ${it.nome}: ${it.aviso}`);
      } catch {
        falhas.push("A conexão caiu ao gravar. Clique em Atualizar de novo: o que já subiu é pulado.");
      }
    }
    setRelatorio({ criadas, atualizadas, fotos, renomeados, avisos, falhas, registro });
    if (registro.length > 0) baixarRegistro(registro); // cópia dos nomes antigos, para poder desfazer
    setProgresso("");
    setFase("pronto");
  }

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Cadastros</p>
        <h1>Atualizar pelas pastas</h1>
        <p>
          Salve as fotos novas na pasta do fabricante (<strong>Estoque \ 1 - Estoque Principal \ Fabricante</strong>) e clique aqui. O Radar lê as pastas,
          junta a foto de close com a da modelo, dá o código da peça, lê o nome e o custo do nome do arquivo e sobe só o que é novo.
        </p>
      </div>

      {!suporte && (
        <div className="banner banner-warning" role="alert" style={{ marginBottom: 16 }}>
          <span>⚠️</span>
          <span>Este navegador não deixa o Radar ler pastas do computador. Abra o Radar no Chrome ou no Edge, no computador.</span>
        </div>
      )}

      {erro && (
        <div className="banner banner-warning" role="alert" style={{ marginBottom: 16 }}>
          <span>⚠️</span>
          <span>{erro}</span>
        </div>
      )}

      {(fase === "inicio" || fase === "lendo") && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginBottom: 8 }}>1. Escolha a pasta do estoque</h2>
          <p className="hint" style={{ marginBottom: 10 }}>
            Escolha a pasta <strong>1 - Estoque Principal</strong>. O navegador vai pedir duas permissões (ver e editar os arquivos). A de editar serve para
            colocar o código no nome das fotos. Só pergunta na primeira vez.
          </p>
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            {lembrada && (
              <button className="btn btn-primary" onClick={usarLembrada} disabled={!suporte || fase === "lendo"}>
                {fase === "lendo" ? "Lendo as pastas..." : `Atualizar pela pasta "${lembrada.name}"`}
              </button>
            )}
            <button className={lembrada ? "btn btn-ghost" : "btn btn-primary"} onClick={escolher} disabled={!suporte || fase === "lendo"}>
              {lembrada ? "Escolher outra pasta" : "Escolher a pasta"}
            </button>
          </div>
        </section>
      )}

      {fase === "conferencia" && (
        <>
          <section className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginBottom: 8 }}>2. Confira o que vai acontecer</h2>
            <div className="stat-grid auto" style={{ marginBottom: 10 }}>
              <div className="stat-tile">
                <div className="label">Peças novas</div>
                <div className="value">{resumo.novas}</div>
              </div>
              <div className="stat-tile">
                <div className="label">Peças a atualizar</div>
                <div className="value">{resumo.atualizar}</div>
              </div>
              <div className="stat-tile">
                <div className="label">Fotos a subir</div>
                <div className="value">{resumo.fotosParaSubir}</div>
              </div>
              <div className="stat-tile">
                <div className="label">Arquivos a renomear</div>
                <div className="value">{resumo.renomeacoes}</div>
              </div>
              <div className="stat-tile">
                <div className="label">Já em dia (pulo)</div>
                <div className="value">{resumo.iguais}</div>
              </div>
            </div>

            {trabalho.length === 0 ? (
              <div className="empty-state">Tudo em dia: não há foto nova nem nome para acertar nas pastas.</div>
            ) : (
              <div className="table-wrap tabela-cabe">
                <table>
                  <thead>
                    <tr>
                      <th>Fabricante</th>
                      <th>Peça</th>
                      <th>Código</th>
                      <th>Custo</th>
                      <th>Situação</th>
                      <th>Fotos a subir</th>
                      <th>Nomes a acertar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trabalho.map(({ pasta, peca }) => (
                      <tr key={`${pasta}|${peca.codigo}|${peca.nome}`}>
                        <td>{pasta}</td>
                        <td>{peca.nome}</td>
                        <td>
                          {peca.codigo}
                          {peca.codigoNovo && <div className="hint">código novo</div>}
                        </td>
                        <td className="num">{peca.custo === null ? <span className="stock-pill out">Falta preço de custo</span> : formatBRL(peca.custo)}</td>
                        <td>{TEXTO_DA_SITUACAO[peca.situacao]}</td>
                        <td>{[peca.subir.close && "close", peca.subir.modelo && peca.modelo && "modelo"].filter(Boolean).join(" + ") || "-"}</td>
                        <td>
                          {peca.renomear.length === 0 ? "-" : peca.renomear.map((r) => (
                            <div key={r.de} className="hint">
                              {r.de} → {r.para}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {planos.some((p) => p.alertas.length > 0) && (
            <section className="card" style={{ marginBottom: 16 }}>
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginBottom: 8 }}>Atenção ({resumo.alertas})</h2>
              <ul style={{ margin: "0 0 0 18px" }}>
                {planos.flatMap((p) => p.alertas).map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="card">
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginBottom: 8 }}>3. Atualizar</h2>
            <p className="hint" style={{ marginBottom: 10 }}>
              Vai renomear os arquivos listados, enviar as fotos e gravar as peças. Peça que já existe não perde estoque, custo nem preço: se o custo do arquivo
              for diferente do cadastro, a peça fica com o alerta "Custo diverge da pasta" para você decidir.
            </p>
            <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
              <button className="btn btn-primary" onClick={atualizar} disabled={trabalho.length === 0}>
                Atualizar ({resumo.novas + resumo.atualizar} peças, {resumo.fotosParaSubir} fotos)
              </button>
              <button className="btn btn-ghost" onClick={() => raiz && ler(raiz)}>
                Ler as pastas de novo
              </button>
            </div>
          </section>
        </>
      )}

      {fase === "executando" && (
        <div className="card">
          <div className="loading-state">Atualizando... {progresso}</div>
          <p className="hint">Não feche esta página até terminar.</p>
        </div>
      )}

      {fase === "pronto" && relatorio && (
        <section className="card">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.15rem", marginBottom: 8 }}>{relatorio.falhas.length === 0 ? "Pronto, atualizado" : "Atualizado, com problemas"}</h2>
          <div className="stat-grid auto" style={{ marginBottom: 10 }}>
            <div className="stat-tile">
              <div className="label">Peças novas</div>
              <div className="value">{relatorio.criadas}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Peças atualizadas</div>
              <div className="value">{relatorio.atualizadas}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Fotos enviadas</div>
              <div className="value">{relatorio.fotos}</div>
            </div>
            <div className="stat-tile">
              <div className="label">Arquivos renomeados</div>
              <div className="value">{relatorio.renomeados}</div>
            </div>
          </div>
          {relatorio.falhas.length > 0 && (
            <div className="banner banner-warning" role="alert" style={{ marginBottom: 10, alignItems: "flex-start" }}>
              <span>⚠️</span>
              <span>
                <strong>Não deu certo:</strong>
                <ul style={{ margin: "6px 0 0 18px" }}>
                  {relatorio.falhas.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
                Clique em "Ler as pastas de novo" e depois em Atualizar: o que já subiu é pulado.
              </span>
            </div>
          )}
          {relatorio.avisos.length > 0 && (
            <>
              <h3 style={{ margin: "10px 0 6px" }}>Avisos para você olhar ({relatorio.avisos.length})</h3>
              <ul style={{ margin: "0 0 10px 18px" }}>
                {relatorio.avisos.map((a, i) => (
                  <li key={i}>{a}</li>
                ))}
              </ul>
            </>
          )}
          <div className="modal-actions" style={{ justifyContent: "flex-start" }}>
            <a className="btn btn-primary" href="/cadastros">
              Ver em Produtos e cadastros
            </a>
            {relatorio.registro.length > 0 && (
              <button className="btn btn-ghost" onClick={() => baixarRegistro(relatorio.registro)} title="Lista com o nome antigo e o novo de cada arquivo renomeado">
                Baixar registro dos nomes antigos
              </button>
            )}
            <a className="btn btn-ghost" href="/cadastros/catalogo">
              Criar catálogo
            </a>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setRelatorio(null);
                if (raiz) ler(raiz);
                else setFase("inicio");
              }}
            >
              Ler as pastas de novo
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
