"use client";

import { useState } from "react";
import { MAX_FOTOS_EXTRAS, type Troca } from "@/lib/product-photos";

// Fotos da peça no cadastro: a primeira é o destaque e as outras acompanham.
// Dá para subir várias de uma vez, escolher o destaque, reordenar, girar, trocar e remover.
// Nada é gravado aqui: o que muda fica no formulário e vale ao clicar em "Salvar produto".

const MAX_TOTAL = MAX_FOTOS_EXTRAS + 1;

export type MudancaDeFotos = { destaque: string; extras: string[]; trocas: Troca[] };

async function enviar(arquivo: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", arquivo);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  if (res.ok) return (await res.json()).url as string;
  const d = await res.json().catch(() => ({}));
  if (d.error === "invalid_type") throw new Error("Use fotos JPG, PNG, WEBP ou GIF.");
  if (d.error === "too_large") throw new Error("Cada foto pode ter até 8 MB.");
  throw new Error("Não foi possível enviar a foto. Verifique se o armazenamento (Vercel Blob) está configurado.");
}

// Gira a foto no navegador e devolve um arquivo novo (a foto original continua no armazenamento).
async function girarArquivo(url: string, graus: 90 | -90): Promise<File> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((ok, erro) => {
    img.onload = () => ok();
    img.onerror = () => erro(new Error("Não foi possível abrir esta foto para girar. Use \"Trocar\" e envie a foto já girada."));
    img.src = url + (url.includes("?") ? "&" : "?") + "girar=" + Date.now();
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalHeight;
  canvas.height = img.naturalWidth;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível girar a foto neste navegador.");
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((graus * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.92));
  if (!blob) throw new Error("Não foi possível girar a foto. Use \"Trocar\" e envie a foto já girada.");
  return new File([blob], "girada.jpg", { type: "image/jpeg" });
}

export default function FotosDaPeca({
  destaque,
  extras,
  pronto,
  onChange,
}: {
  destaque: string;
  extras: string[];
  pronto: boolean; // as fotos extras já foram carregadas (ao editar uma peça que já existe)
  onChange: (m: MudancaDeFotos) => void;
}) {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const todas = [destaque, ...extras].filter(Boolean);

  function aplicar(lista: string[], trocas: Troca[] = []) {
    onChange({ destaque: lista[0] ?? "", extras: lista.slice(1), trocas });
  }

  async function agir(chave: string, tarefa: () => Promise<void>) {
    if (ocupado) return;
    setOcupado(chave);
    setErro("");
    try {
      await tarefa();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível concluir. Tente novamente.");
    } finally {
      setOcupado(null);
    }
  }

  async function adicionar(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (arquivos.length === 0) return;
    await agir("novas", async () => {
      let lista = [...todas];
      let cortou = false;
      for (const arquivo of arquivos) {
        if (lista.length >= MAX_TOTAL) {
          cortou = true;
          break;
        }
        try {
          lista = [...lista, await enviar(arquivo)];
        } finally {
          aplicar(lista); // o que já subiu fica, mesmo se uma das fotos falhar
        }
      }
      if (cortou) throw new Error(`Cada peça pode ter até ${MAX_TOTAL} fotos (o destaque e mais ${MAX_FOTOS_EXTRAS}). As que passaram disso não foram enviadas.`);
    });
  }

  function trocarPor(i: number, nova: string) {
    const lista = [...todas];
    const antiga = lista[i];
    lista[i] = nova;
    aplicar(lista, [{ de: antiga, para: nova }]);
  }

  async function trocar(i: number, e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    await agir(`trocar-${i}`, async () => trocarPor(i, await enviar(arquivo)));
  }

  async function girar(i: number, graus: 90 | -90) {
    await agir(`girar-${i}`, async () => trocarPor(i, await enviar(await girarArquivo(todas[i], graus))));
  }

  function mover(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= todas.length) return;
    const lista = [...todas];
    [lista[i], lista[j]] = [lista[j], lista[i]];
    aplicar(lista);
  }

  function tornarDestaque(i: number) {
    const lista = [...todas];
    const [foto] = lista.splice(i, 1);
    aplicar([foto, ...lista]);
  }

  function remover(i: number) {
    const eDestaque = i === 0;
    const aviso = eDestaque && todas.length > 1 ? "Remover o destaque? A próxima foto vira o destaque." : "Remover esta foto?";
    if (!window.confirm(aviso)) return;
    aplicar(todas.filter((_, j) => j !== i));
  }

  return (
    <div className="field field--full" style={{ marginBottom: 18 }}>
      <label>Fotos da peça</label>
      <span className="hint">
        A primeira é o destaque: aparece nos cartões, no carrinho e no carrossel. As outras acompanham, na ordem abaixo. As mudanças valem
        quando você clicar em "Salvar produto".
      </span>

      {!pronto && <div className="hint">Carregando as fotos da peça...</div>}

      <div className="photo-strip">
        {todas.length === 0 && pronto && <div className="photo-preview-empty">💎</div>}
        {todas.map((url, i) => (
          <div className="photo-item" key={`${i}-${url}`}>
            <img src={url} alt="" />
            <div className="photo-actions">
              {i === 0 ? (
                <span className="stock-pill ok">Destaque</span>
              ) : (
                <button type="button" className="icon-btn" disabled={!!ocupado} onClick={() => tornarDestaque(i)}>
                  Tornar destaque
                </button>
              )}
              <button type="button" className="icon-btn" disabled={i === 0 || !!ocupado} onClick={() => mover(i, -1)} aria-label="Mover para antes">
                ←
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={i === todas.length - 1 || !!ocupado}
                onClick={() => mover(i, 1)}
                aria-label="Mover para depois"
              >
                →
              </button>
              <button type="button" className="icon-btn" disabled={!!ocupado} onClick={() => girar(i, -90)} aria-label="Girar para a esquerda" title="Girar para a esquerda">
                ↺
              </button>
              <button type="button" className="icon-btn" disabled={!!ocupado} onClick={() => girar(i, 90)} aria-label="Girar para a direita" title="Girar para a direita">
                ↻
              </button>
              <label className="icon-btn" style={{ cursor: ocupado ? "not-allowed" : "pointer" }}>
                {ocupado === `trocar-${i}` || ocupado === `girar-${i}` ? "Enviando..." : "Trocar"}
                <input type="file" accept="image/*" hidden disabled={!!ocupado} onChange={(e) => trocar(i, e)} />
              </label>
              <button type="button" className="icon-btn danger" disabled={!!ocupado} onClick={() => remover(i)}>
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      <input type="file" accept="image/*" multiple onChange={adicionar} disabled={!!ocupado || !pronto || todas.length >= MAX_TOTAL} />
      <div className="hint">
        {ocupado === "novas" ? "Enviando..." : `Dá para escolher várias fotos de uma vez. ${todas.length} de ${MAX_TOTAL} fotos.`}
      </div>
      {erro && (
        <div className="hint" style={{ color: "var(--danger)" }}>
          {erro}
        </div>
      )}
    </div>
  );
}
