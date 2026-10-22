import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { jpegValido, larguraValida, origemDaImagem } from "@/lib/catalogo-imagem";
import { comporMoldura, limitarProporcao } from "@/lib/moldura-sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Foto do catálogo em PDF, redimensionada e em JPEG (sem transparência). O PDF fica leve e abre em qualquer leitor.
// modo=fundo devolve uma cópia pequena e já borrada, para o fundo das molduras (no lugar do filtro de borrão do CSS,
// que vira uma imagem enorme no PDF).

const TAMANHO_MAXIMO = 40 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const origem = origemDaImagem(req.nextUrl.searchParams.get("u"), req.nextUrl.host);
  if (!origem) return NextResponse.json({ error: "origem_invalida" }, { status: 400 });

  const largura = larguraValida(req.nextUrl.searchParams.get("w"));
  const qualidade = jpegValido(req.nextUrl.searchParams.get("q"));
  const modo = req.nextUrl.searchParams.get("modo");
  const fundo = modo === "fundo";

  const endereco = origem.tipo === "site" ? `${req.nextUrl.origin}${origem.caminho}` : origem.url;
  let original: Buffer;
  try {
    // Arquivos do próprio site também passam pelo porteiro (login): leva junto o cookie de quem pediu. Para o armazenamento de fotos, nada disso.
    const cabecalhos: Record<string, string> = origem.tipo === "site" ? { cookie: req.headers.get("cookie") ?? "" } : {};
    const resposta = await fetch(endereco, { headers: cabecalhos, signal: AbortSignal.timeout(20000), cache: "no-store", redirect: "manual" });
    if (!resposta.ok) return NextResponse.json({ error: "foto_nao_encontrada" }, { status: 404 });
    if (!(resposta.headers.get("content-type") ?? "").startsWith("image/")) return NextResponse.json({ error: "nao_e_imagem" }, { status: 415 });
    const tamanho = Number(resposta.headers.get("content-length") ?? 0);
    if (tamanho > TAMANHO_MAXIMO) return NextResponse.json({ error: "foto_grande_demais" }, { status: 413 });
    original = Buffer.from(await resposta.arrayBuffer());
    if (original.length > TAMANHO_MAXIMO) return NextResponse.json({ error: "foto_grande_demais" }, { status: 413 });
  } catch {
    return NextResponse.json({ error: "falha_ao_buscar" }, { status: 502 });
  }

  try {
    if (modo === "moldura") {
      const proporcao = limitarProporcao(Number(req.nextUrl.searchParams.get("p")));
      return devolverJpeg(await comporMoldura(original, { largura, proporcao, qualidade }));
    }
    let imagem = sharp(original, { failOn: "none" }).rotate().flatten({ background: "#ffffff" });
    if (fundo) {
      // Pequena, mais clara e um pouco menos saturada, e borrada: o mesmo visual do filtro de borrão de antes.
      imagem = imagem.resize({ width: 240, withoutEnlargement: false }).modulate({ saturation: 0.9, brightness: 1.08 }).blur(14);
      const saida = await imagem.jpeg({ quality: 70, mozjpeg: true }).toBuffer();
      return devolverJpeg(saida);
    }
    const saida = await imagem
      .resize({ width: largura, withoutEnlargement: true })
      .jpeg({ quality: qualidade, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
    return devolverJpeg(saida);
  } catch {
    return NextResponse.json({ error: "imagem_invalida" }, { status: 422 });
  }
}

function devolverJpeg(corpo: Buffer) {
  return new NextResponse(new Uint8Array(corpo), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Length": String(corpo.length),
      // Só neste navegador, e por um dia: a mesma foto não precisa ser refeita a cada vez que o catálogo é aberto.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
