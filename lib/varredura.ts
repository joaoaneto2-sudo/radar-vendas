// Varredura das pastas de fornecedor feita pelo Radar (botão "Atualizar pelas pastas").
// Lógica pura: recebe os arquivos de UMA pasta de fabricante e as peças que o Radar já tem desse fabricante, e devolve
// o plano: que peças existem, o par close + modelo de cada uma, o código definitivo, o que precisa subir e o que
// renomear. O navegador lê as pastas e executa o plano; aqui nada mexe em arquivo nem em banco.
//
// Padrão de nome (o código é opcional ao salvar; a varredura coloca):
//   close  -> [CÓDIGO - ]Nome - custo 77,00.ext
//   modelo -> [CÓDIGO - ]Nome - modelo.ext
// Ainda entendemos os formatos antigos: "NN - Nome - custo 59,50" e foto com o nome simples como par do close.

import { CATEGORIA_DO_TIPO, ehProvisorio, proximoCodigo, siglaDoNome, tipoPeloNome } from "./codigo-da-peca";
import { semAcento } from "./catalogo-filtro";

export interface ArquivoDaPasta {
  nome: string;
  tamanho: number;
  modificadoEm: number; // milissegundos
}

export interface PecaDoRadar {
  id: number;
  nome: string;
  codigo: string | null;
  custo: number | null;
  custoDaPasta?: number | null; // custo em dúvida já registrado no Radar (alerta "Custo diverge da pasta")
  temFoto: boolean;
  temModelo: boolean;
  fotoOrigem: string | null;
  modeloOrigem: string | null;
}

/** Assinatura que identifica "este arquivo desta vez" (sem o nome, para sobreviver a renomeação). */
export const assinatura = (a: ArquivoDaPasta): string => `${a.tamanho}|${a.modificadoEm}`;

const EXTENSAO = /\.(png|jpe?g|webp)$/i;
export const ehImagem = (nome: string) => EXTENSAO.test(nome);
const semExtensao = (nome: string) => nome.replace(EXTENSAO, "");
const extensaoDe = (nome: string) => nome.match(EXTENSAO)?.[0] ?? "";
const norm = (s: string) => semAcento(s).replace(/\s+/g, " ");

const RE_CODIGO = /^(\p{Lu}+)-(BR|CO|PU|AN|OU|PI|CJ)-(\d{3})(_\d)? - (.+?) - (custo ([\d.,_]*)|modelo)$/u;
const RE_NUMERADA = /^(\d{1,3}) - (.+?) - custo ([\d.,_]*)$/;
const RE_SEM_CODIGO = /^(.+?) - (custo ([\d.,_]*)|modelo)$/;

export interface ArquivoLido {
  arquivo: ArquivoDaPasta;
  forma: "codigo" | "numerada" | "sem-codigo" | "simples";
  codigo: string | null; // SIGLA-TIPO-NNN quando o nome tem
  extra: boolean; // _2, _3: foto extra da mesma peça
  nome: string;
  papel: "close" | "modelo" | null; // nulo = nome simples, o papel depende do par
  custo: number | null;
}

const lerCusto = (t: string | undefined): number | null => {
  if (t === undefined || !/^[\d.,]+$/.test(t)) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function lerArquivo(arquivo: ArquivoDaPasta): ArquivoLido {
  const base = semExtensao(arquivo.nome.normalize("NFC"));
  let m = base.match(RE_CODIGO);
  if (m) {
    return { arquivo, forma: "codigo", codigo: `${m[1]}-${m[2]}-${m[3]}`, extra: !!m[4], nome: m[5], papel: m[6] === "modelo" ? "modelo" : "close", custo: m[6] === "modelo" ? null : lerCusto(m[7]) };
  }
  m = base.match(RE_NUMERADA);
  if (m) return { arquivo, forma: "numerada", codigo: null, extra: false, nome: m[2], papel: "close", custo: lerCusto(m[3]) };
  m = base.match(RE_SEM_CODIGO);
  if (m) return { arquivo, forma: "sem-codigo", codigo: null, extra: false, nome: m[1], papel: m[2] === "modelo" ? "modelo" : "close", custo: m[2] === "modelo" ? null : lerCusto(m[3]) };
  return { arquivo, forma: "simples", codigo: null, extra: false, nome: base, papel: null, custo: null };
}

const custoBR = (n: number) => n.toFixed(2).replace(".", ",");

export interface PecaPlanejada {
  nome: string;
  codigo: string;
  codigoNovo: boolean; // o código foi dado agora (nome sem código ou provisório)
  categoria: string;
  custo: number | null;
  close: ArquivoDaPasta | null;
  modelo: ArquivoDaPasta | null;
  radarId: number | null;
  situacao: "nova" | "atualizar" | "igual";
  subir: { close: boolean; modelo: boolean };
  catalogoKind: "limpa" | "modelo"; // "modelo" quando a única foto é a da modelo
  custoNoRadar: number | null;
  renomear: { de: string; para: string; motivo: string }[];
}

export interface PlanoDaPasta {
  fabricante: string;
  pecas: PecaPlanejada[];
  avulsas: string[]; // fotos que não entraram em nenhuma peça (nome fora do padrão ou sem par)
  alertas: string[];
}

export function planejarPasta(fabricante: string, arquivos: ArquivoDaPasta[], doRadar: PecaDoRadar[]): PlanoDaPasta {
  const alertas: string[] = [];
  let lidos = arquivos.filter((a) => ehImagem(a.nome)).map(lerArquivo);

  // Duas versões do mesmo arquivo (mesmo nome, extensões diferentes, ex.: .jpg e .png): vale a mais nova.
  const porNomeSemExt = new Map<string, ArquivoLido[]>();
  for (const l of lidos) {
    const k = semExtensao(l.arquivo.nome.normalize("NFC")).toLowerCase();
    porNomeSemExt.set(k, [...(porNomeSemExt.get(k) ?? []), l]);
  }
  const descartados = new Set<ArquivoLido>();
  for (const grupo of porNomeSemExt.values()) {
    if (grupo.length < 2) continue;
    const [maisNova, ...resto] = [...grupo].sort((a, b) => b.arquivo.modificadoEm - a.arquivo.modificadoEm);
    for (const r of resto) descartados.add(r);
    alertas.push(`${fabricante}: duas versões do mesmo arquivo (${grupo.map((g) => g.arquivo.nome).join(" e ")}); usei a mais nova, ${maisNova.arquivo.nome}`);
  }
  lidos = lidos.filter((l) => !descartados.has(l));

  const extras = lidos.filter((l) => l.extra);
  for (const e of extras) alertas.push(`${fabricante}: "${e.arquivo.nome}" é uma foto extra (_2) e ainda não é enviada`);
  const principais = lidos.filter((l) => !l.extra);

  const closes = principais.filter((l) => l.papel === "close");
  const modelos = principais.filter((l) => l.papel === "modelo");
  const simples = principais.filter((l) => l.papel === null);
  const nomesDosCloses = new Map<string, number>();
  for (const c of closes) nomesDosCloses.set(norm(c.nome), (nomesDosCloses.get(norm(c.nome)) ?? 0) + 1);

  const consumidos = new Set<ArquivoLido>();
  const pecas: PecaPlanejada[] = [];
  const codigosDefinitivosNosArquivos = principais.filter((l) => l.codigo && !ehProvisorio(l.codigo)).map((l) => l.codigo as string);
  const codigosEmUso: { manufacturer_code: string | null }[] = [
    ...doRadar.map((p) => ({ manufacturer_code: p.codigo })),
    ...codigosDefinitivosNosArquivos.map((c) => ({ manufacturer_code: c })),
  ];

  for (const c of closes) {
    const repetido = (nomesDosCloses.get(norm(c.nome)) ?? 0) > 1;
    // modelo explícito: pelo código quando os dois têm; senão pelo nome
    let modelo = modelos.find((m) => !consumidos.has(m) && (c.codigo && m.codigo ? c.codigo === m.codigo : !repetido && norm(m.nome) === norm(c.nome)));
    if (!modelo && !repetido) modelo = simples.find((m) => !consumidos.has(m) && norm(m.nome) === norm(c.nome));
    if (!modelo && repetido && !c.codigo) alertas.push(`${fabricante}: o nome "${c.nome}" aparece em mais de uma peça; dê um código a cada uma para eu parear as fotos`);
    consumidos.add(c);
    if (modelo) consumidos.add(modelo);

    // Peça no Radar: pelo código, senão pelo nome (só se o nome for único no Radar)
    let noRadar = c.codigo && !ehProvisorio(c.codigo) ? doRadar.find((p) => p.codigo === c.codigo) : undefined;
    if (!noRadar && !repetido) {
      const porNome = doRadar.filter((p) => norm(p.nome) === norm(c.nome));
      if (porNome.length === 1) noRadar = porNome[0];
    }

    const tipo = c.codigo && CATEGORIA_DO_TIPO[c.codigo.split("-")[1]] ? c.codigo.split("-")[1] : tipoPeloNome(c.nome);
    const categoria = CATEGORIA_DO_TIPO[tipo] ?? "Outros";
    let codigo: string;
    let codigoNovo = false;
    if (c.codigo && !ehProvisorio(c.codigo)) codigo = c.codigo;
    else if (noRadar?.codigo && !ehProvisorio(noRadar.codigo)) {
      codigo = noRadar.codigo;
      codigoNovo = true;
    } else {
      codigo = proximoCodigo(codigosEmUso, fabricante || siglaDoNome(fabricante), categoria);
      codigosEmUso.push({ manufacturer_code: codigo });
      codigoNovo = true;
    }

    const custo = c.custo;
    const subirClose = !(noRadar && (noRadar.fotoOrigem === assinatura(c.arquivo) || (noRadar.fotoOrigem === null && noRadar.temFoto)));
    const subirModelo = !!modelo && !(noRadar && (noRadar.modeloOrigem === assinatura(modelo.arquivo) || (noRadar.modeloOrigem === null && noRadar.temModelo)));
    const duvidaJaRegistrada = !!noRadar && custo !== null && noRadar.custoDaPasta != null && Math.abs(noRadar.custoDaPasta - custo) < 0.001;
    const mudouCusto = !!noRadar && custo !== null && !duvidaJaRegistrada && (noRadar.custo === null || Math.abs(noRadar.custo - custo) > 0.001);
    const mudouCodigo = !!noRadar && noRadar.codigo !== codigo;
    const situacao: PecaPlanejada["situacao"] = !noRadar ? "nova" : subirClose || subirModelo || mudouCusto || mudouCodigo ? "atualizar" : "igual";

    const renomear: PecaPlanejada["renomear"] = [];
    const ext = extensaoDe(c.arquivo.nome);
    if (custo === null) alertas.push(`${fabricante}: "${c.nome}" está sem custo no nome do arquivo (a peça entra com o alerta "Falta preço de custo")`);
    else {
      const novo = `${codigo} - ${c.nome} - custo ${custoBR(custo)}${ext}`;
      if (novo !== c.arquivo.nome.normalize("NFC")) renomear.push({ de: c.arquivo.nome, para: novo, motivo: codigoNovo ? "código definitivo" : "nome no padrão" });
    }
    if (modelo) {
      const novo = `${codigo} - ${c.nome} - modelo${extensaoDe(modelo.arquivo.nome)}`;
      if (novo !== modelo.arquivo.nome.normalize("NFC")) renomear.push({ de: modelo.arquivo.nome, para: novo, motivo: "foto da modelo no padrão" });
    }

    pecas.push({
      nome: c.nome, codigo, codigoNovo, categoria, custo, close: c.arquivo, modelo: modelo?.arquivo ?? null,
      radarId: noRadar?.id ?? null, situacao, subir: { close: subirClose, modelo: subirModelo }, catalogoKind: "limpa",
      custoNoRadar: noRadar?.custo ?? null, renomear,
    });
  }

  // Modelo com nome padrão sem close correspondente: peça cuja única foto é a da modelo (vale se o nome tem "- modelo" e custo não vem).
  for (const m of modelos) {
    if (consumidos.has(m)) continue;
    alertas.push(`${fabricante}: a foto da modelo "${m.arquivo.nome}" não tem a foto de close com o mesmo nome (e o custo). Salve o close como "${m.nome} - custo 00,00"`);
  }

  const avulsas = [...simples.filter((s) => !consumidos.has(s)).map((s) => s.arquivo.nome), ...extras.map((e) => e.arquivo.nome)];
  for (const s of simples.filter((x) => !consumidos.has(x))) alertas.push(`${fabricante}: "${s.arquivo.nome}" não está no padrão de nome (Nome - custo 00,00 ou Nome - modelo) e foi deixada de fora`);

  // Código repetido entre peças da mesma pasta
  const vistos = new Map<string, string>();
  for (const p of pecas) {
    const outra = vistos.get(p.codigo);
    if (outra) alertas.push(`${fabricante}: o código ${p.codigo} está em duas peças ("${outra}" e "${p.nome}")`);
    vistos.set(p.codigo, p.nome);
  }
  return { fabricante, pecas, avulsas, alertas };
}

/** Resumo para a tela de conferência. */
export function resumoDoPlano(planos: PlanoDaPasta[]) {
  const pecas = planos.flatMap((p) => p.pecas);
  return {
    novas: pecas.filter((p) => p.situacao === "nova").length,
    atualizar: pecas.filter((p) => p.situacao === "atualizar").length,
    iguais: pecas.filter((p) => p.situacao === "igual").length,
    fotosParaSubir: pecas.reduce((s, p) => s + (p.subir.close ? 1 : 0) + (p.subir.modelo && p.modelo ? 1 : 0), 0),
    renomeacoes: pecas.reduce((s, p) => s + p.renomear.length, 0),
    alertas: planos.reduce((s, p) => s + p.alertas.length, 0),
  };
}
