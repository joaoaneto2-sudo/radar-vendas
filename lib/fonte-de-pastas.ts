// Acesso às pastas do computador pelo navegador (Chrome/Edge): "File System Access API". O João escolhe a pasta
// "Estoque\1 - Estoque Principal" uma vez e autoriza; o Radar lembra qual é. Também há uma pasta de mentira
// (em memória) usada só nos testes. Código de navegador: não roda no servidor.

import type { ArquivoDaPasta } from "./varredura";
import { ehImagem } from "./varredura";

export interface ArquivoFonte extends ArquivoDaPasta {
  /** Conteúdo do arquivo. */
  ler(): Promise<Blob>;
  /** Renomeia o arquivo na própria pasta e devolve o arquivo com o nome novo (tamanho e data lidos de novo). */
  renomear(novoNome: string): Promise<ArquivoFonte>;
}

export interface DiretorioFonte {
  nome: string;
  arquivos(): Promise<ArquivoFonte[]>;
}

export interface RaizFonte {
  nome: string;
  diretorios(): Promise<DiretorioFonte[]>;
}

// Pastas dentro de "1 - Estoque Principal" que não são de fabricante.
export const PASTA_QUE_NAO_E_FABRICANTE = /para nomear|^lote /i;

// ---------------------------------------------------------------------------------------------------------------
// Pasta de verdade (File System Access API)
// ---------------------------------------------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export const temAcessoAPastas = (): boolean => typeof window !== "undefined" && typeof (window as any).showDirectoryPicker === "function";

async function arquivoDoHandle(dir: any, fh: any): Promise<ArquivoFonte> {
  const f: File = await fh.getFile();
  return {
    nome: fh.name,
    tamanho: f.size,
    modificadoEm: f.lastModified,
    ler: async () => await fh.getFile(),
    renomear: async (novoNome: string) => {
      let jaExiste = true;
      try {
        await dir.getFileHandle(novoNome);
      } catch {
        jaExiste = false;
      }
      if (jaExiste) throw new Error(`Já existe um arquivo chamado "${novoNome}" nesta pasta.`);
      if (typeof fh.move === "function") {
        await fh.move(novoNome);
        return arquivoDoHandle(dir, fh);
      }
      // Navegador sem "mover": copia para o nome novo e apaga o antigo.
      const novo = await dir.getFileHandle(novoNome, { create: true });
      const w = await novo.createWritable();
      await w.write(await fh.getFile());
      await w.close();
      await dir.removeEntry(fh.name);
      return arquivoDoHandle(dir, novo);
    },
  };
}

export function raizDeHandle(raiz: any): RaizFonte {
  return {
    nome: raiz.name,
    diretorios: async () => {
      const lista: DiretorioFonte[] = [];
      for await (const entrada of raiz.values()) {
        if (entrada.kind !== "directory" || PASTA_QUE_NAO_E_FABRICANTE.test(entrada.name)) continue;
        lista.push({
          nome: entrada.name,
          arquivos: async () => {
            const arquivos: ArquivoFonte[] = [];
            for await (const e of entrada.values()) {
              if (e.kind === "file" && ehImagem(e.name)) arquivos.push(await arquivoDoHandle(entrada, e));
            }
            return arquivos;
          },
        });
      }
      return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    },
  };
}

export async function escolherPasta(): Promise<any> {
  return await (window as any).showDirectoryPicker({ id: "radar-estoque", mode: "readwrite" });
}

// ---------------------------------------------------------------------------------------------------------------
// Lembrar a pasta escolhida (IndexedDB), para não pedir de novo a cada vez
// ---------------------------------------------------------------------------------------------------------------

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open("radar-pastas", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("handles");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}

export async function lembrarPasta(handle: any): Promise<void> {
  try {
    const db = await abrirBanco();
    await new Promise<void>((ok, erro) => {
      const t = db.transaction("handles", "readwrite");
      t.objectStore("handles").put(handle, "raiz");
      t.oncomplete = () => ok();
      t.onerror = () => erro(t.error);
    });
  } catch {
    // sem IndexedDB: só não lembra
  }
}

export async function pastaLembrada(): Promise<any | null> {
  try {
    const db = await abrirBanco();
    return await new Promise((ok) => {
      const r = db.transaction("handles").objectStore("handles").get("raiz");
      r.onsuccess = () => ok(r.result ?? null);
      r.onerror = () => ok(null);
    });
  } catch {
    return null;
  }
}

/** Garante a permissão de leitura e escrita (precisa de um clique do usuário para perguntar). */
export async function garantirPermissao(handle: any): Promise<boolean> {
  const opcoes = { mode: "readwrite" };
  if ((await handle.queryPermission(opcoes)) === "granted") return true;
  return (await handle.requestPermission(opcoes)) === "granted";
}

// ---------------------------------------------------------------------------------------------------------------
// Pasta de mentira, em memória (testes)
// ---------------------------------------------------------------------------------------------------------------

export interface ArquivoDeMentira {
  nome: string;
  blob: Blob;
  modificadoEm?: number;
}

export function raizDeMentira(nome: string, pastas: Record<string, ArquivoDeMentira[]>): RaizFonte {
  const criar = (lista: ArquivoDeMentira[], i: number): ArquivoFonte => {
    const a = lista[i];
    return {
      nome: a.nome,
      tamanho: a.blob.size,
      modificadoEm: a.modificadoEm ?? 1_700_000_000_000 + i,
      ler: async () => a.blob,
      renomear: async (novo: string) => {
        if (lista.some((x) => x.nome === novo)) throw new Error(`Já existe um arquivo chamado "${novo}" nesta pasta.`);
        a.nome = novo;
        return criar(lista, i);
      },
    };
  };
  return {
    nome,
    diretorios: async () =>
      Object.entries(pastas)
        .filter(([n]) => !PASTA_QUE_NAO_E_FABRICANTE.test(n))
        .map(([n, lista]) => ({ nome: n, arquivos: async () => lista.map((_, i) => criar(lista, i)).filter((a) => ehImagem(a.nome)) })),
  };
}
