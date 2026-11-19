"use client";

// Validação de Estoque: tela da Fernanda, sem menu. Aparece a foto de uma peça por vez, em ordem aleatória;
// X = não tem mais (sai do catálogo e o estoque zera na hora), V = ainda tem, e o voltar desfaz a última resposta.

import { useEffect, useRef, useState } from "react";
import { urlDaImagem } from "@/lib/catalogo-imagem";

type Peca = { id: number; nome: string; fabricante: string | null; foto: string | null; modelo: string | null; validacao: "tem" | "saiu" | null };

const foto = (url: string | null) => (url ? urlDaImagem(url, { largura: 900, qualidade: "leve" }) : "");

function embaralhar<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function ValidarEstoque() {
  const [fila, setFila] = useState<Peca[]>([]);
  const [historico, setHistorico] = useState<Peca[]>([]);
  const [mensagem, setMensagem] = useState("Carregando as fotos…");
  const [aviso, setAviso] = useState("");
  const ocupado = useRef(false);

  useEffect(() => {
    fetch("/api/validar-estoque")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const faltam = (d.items as Peca[]).filter((p) => !p.validacao);
        setFila(embaralhar(faltam));
        setMensagem(faltam.length ? "" : "Pronto! Todas as peças já foram conferidas.");
      })
      .catch(() => setMensagem("As fotos não carregaram. Feche e abra de novo."));
  }, []);

  // Já deixa a próxima foto baixando.
  useEffect(() => {
    const prox = fila[1];
    if (prox?.foto) new Image().src = foto(prox.foto);
    if (prox?.modelo) new Image().src = foto(prox.modelo);
  }, [fila]);

  async function gravar(id: number, status: "tem" | "saiu" | null) {
    const r = await fetch("/api/validar-estoque", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    if (!r.ok) throw new Error();
  }

  async function responder(status: "tem" | "saiu") {
    const atual = fila[0];
    if (!atual || ocupado.current) return;
    ocupado.current = true;
    setFila((f) => f.slice(1));
    setHistorico((h) => [...h, atual]);
    try {
      await gravar(atual.id, status);
      setAviso("");
    } catch {
      setFila((f) => [atual, ...f]);
      setHistorico((h) => h.slice(0, -1));
      setAviso("Não salvou. Confira a internet e toque de novo.");
    } finally {
      ocupado.current = false;
    }
    if (fila.length === 1) setMensagem("Pronto! Todas as peças já foram conferidas.");
  }

  async function voltar() {
    const ultima = historico[historico.length - 1];
    if (!ultima || ocupado.current) return;
    ocupado.current = true;
    try {
      await gravar(ultima.id, null);
      setHistorico((h) => h.slice(0, -1));
      setFila((f) => [ultima, ...f]);
      setMensagem("");
      setAviso("");
    } catch {
      setAviso("Não deu para voltar. Confira a internet e toque de novo.");
    } finally {
      ocupado.current = false;
    }
  }

  const atual = fila[0];

  return (
    <div className="validar">
      <style>{`
        .validar{position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;background:#fff;color:#2B1A12;font-family:system-ui,sans-serif}
        .validar .fotos{flex:1;min-height:0;display:flex;gap:2px;background:#F4F0EC}
        .validar .fotos img{flex:1;min-width:0;width:100%;height:100%;object-fit:contain;background:#fff;display:block}
        .validar .msg{flex:1;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 24px;color:#7A6152;font-size:1.05rem}
        .validar .aviso{text-align:center;color:#C8362E;font-size:.9rem;padding:8px 16px 0}
        .validar .botoes{display:flex;align-items:center;justify-content:center;gap:clamp(24px,10vw,60px);
          padding-top:20px;padding-bottom:max(22px,env(safe-area-inset-bottom,0px));
          padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
        .validar .bt{width:clamp(88px,25vw,116px);aspect-ratio:1;border-radius:50%;border:0;background:#fff;box-shadow:0 6px 20px rgba(40,25,15,.18);
          display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;padding:0}
        .validar .bt svg{width:52%;height:52%}
        .validar .volta{width:52px;height:52px;border-radius:50%;border:0;background:#fff;box-shadow:0 3px 12px rgba(40,25,15,.16);
          display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation;padding:0;flex:none}
        .validar .volta svg{width:24px;height:24px}
        .validar button:disabled{opacity:.3;cursor:default}
        .validar button:active:not(:disabled){transform:scale(.94)}
        .validar button:focus-visible{outline:3px solid #22A33A;outline-offset:4px}
      `}</style>

      {atual ? (
        <div className="fotos">
          {atual.foto && <img key={atual.id + "f"} src={foto(atual.foto)} alt={atual.nome} />}
          {atual.modelo && <img key={atual.id + "m"} src={foto(atual.modelo)} alt={`${atual.nome} na modelo`} />}
        </div>
      ) : (
        <div className="msg">{mensagem || "Pronto! Todas as peças já foram conferidas."}</div>
      )}

      {aviso && <div className="aviso">{aviso}</div>}

      <div className="botoes">
        <button className="volta" onClick={voltar} disabled={historico.length === 0} aria-label="Voltar para a peça anterior">
          <svg viewBox="0 0 24 24" fill="none" stroke="#8A7A70" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 14L4 9l5-5" />
            <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
          </svg>
        </button>
        <button className="bt" onClick={() => responder("saiu")} disabled={!atual} aria-label="Não tenho mais esta peça">
          <svg viewBox="0 0 24 24" fill="none" stroke="#E0261B" strokeWidth="3.2" strokeLinecap="round">
            <path d="M5 5l14 14M19 5L5 19" />
          </svg>
        </button>
        <button className="bt" onClick={() => responder("tem")} disabled={!atual} aria-label="Ainda tenho esta peça">
          <svg viewBox="0 0 24 24" fill="none" stroke="#22A33A" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 12.5l5.5 5.5L20.5 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
