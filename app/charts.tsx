import { formatCentsBRL } from "@/lib/finance/money";
import type { Parte, Ponto } from "@/lib/dashboard";

// Gráficos simples em SVG e HTML, sem biblioteca. Funcionam no servidor (sem JavaScript no navegador)
// e usam as cores da marca: couro, dourado, rosé, sálvia e areia.

export const CORES = ["#5a2f17", "#e8b253", "#e9b8ae", "#a9c08f", "#dcc7a8", "#b4826a"];

const reais = formatCentsBRL;
const reaisCurto = (c: number) =>
  Math.abs(c) >= 100000 ? `R$ ${(c / 100000).toFixed(1).replace(".", ",")} mil` : `R$ ${Math.round(c / 100).toLocaleString("pt-BR")}`;

export function Quadro({
  titulo,
  nota,
  largo,
  children,
}: {
  titulo: string;
  nota?: string;
  largo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={"dash-card" + (largo ? " dash-card--wide" : "")}>
      <header>
        <h3>{titulo}</h3>
        {nota && <span>{nota}</span>}
      </header>
      {children}
    </section>
  );
}

export function SemDados({ texto = "Sem dados neste período." }: { texto?: string }) {
  return <div className="dash-empty">{texto}</div>;
}

/**
 * Barras verticais (um valor por ponto no tempo ou por categoria).
 * Em quadro largo, desenha duas versões: a larga (computador) e a estreita (celular), para o texto não ficar miúdo.
 */
export function BarrasVerticais({
  pontos,
  cor,
  descricao,
  largo = false,
}: {
  pontos: Ponto[];
  cor?: string;
  descricao: string;
  largo?: boolean;
}) {
  if (!largo) return <DesenhoDeBarras pontos={pontos} cor={cor} descricao={descricao} />;
  return (
    <>
      <div className="dash-svg-desk">
        <DesenhoDeBarras pontos={pontos} cor={cor} descricao={descricao} largura={860} />
      </div>
      <div className="dash-svg-mob">
        <DesenhoDeBarras pontos={pontos} cor={cor} descricao={descricao} largura={460} />
      </div>
    </>
  );
}

function DesenhoDeBarras({
  pontos,
  cor = CORES[0],
  descricao,
  largura = 460,
}: {
  pontos: Ponto[];
  cor?: string;
  descricao: string;
  largura?: number; // largura do desenho: use maior nos quadros largos, para o texto não ficar miúdo
}) {
  const maximo = Math.max(...pontos.map((p) => p.cents), 0);
  if (pontos.length === 0 || maximo <= 0) return <SemDados />;

  const L = largura;
  const A = 190;
  const margemEsq = 58;
  const margemBase = 26;
  const areaL = L - margemEsq - 8;
  const areaA = A - margemBase - 12;
  const passo = areaL / pontos.length;
  const larguraBarra = Math.max(Math.min(passo * 0.62, 34), 4);
  // Mostra no máximo ~10 rótulos no eixo, para não embolar.
  const de = Math.max(1, Math.ceil(pontos.length / 10));

  return (
    <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={descricao} className="dash-svg">
      <title>{descricao}</title>
      {[0, 0.5, 1].map((f) => {
        const y = 8 + areaA - areaA * f;
        return (
          <g key={f}>
            <line x1={margemEsq} x2={L - 8} y1={y} y2={y} stroke="#ecdfcb" strokeWidth="1" />
            <text x={margemEsq - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#9b846f">
              {reaisCurto(maximo * f)}
            </text>
          </g>
        );
      })}
      {pontos.map((p, i) => {
        const h = (p.cents / maximo) * areaA;
        const x = margemEsq + passo * i + (passo - larguraBarra) / 2;
        return (
          <g key={p.chave}>
            <rect x={x} y={8 + areaA - h} width={larguraBarra} height={Math.max(h, p.cents > 0 ? 2 : 0)} rx="3" fill={cor}>
              <title>{`${p.rotulo}: ${reais(p.cents)}`}</title>
            </rect>
            {i % de === 0 && (
              <text x={x + larguraBarra / 2} y={A - 8} textAnchor="middle" fontSize="10" fill="#9b846f">
                {p.rotulo}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Lista de barras horizontais: rótulo, barra e valor. */
export function BarrasHorizontais({
  partes,
  formato = "dinheiro",
  cor = CORES[0],
}: {
  partes: Parte[];
  formato?: "dinheiro" | "quantidade";
  cor?: string;
}) {
  const util = partes.filter((p) => (formato === "dinheiro" ? p.cents > 0 : p.quantidade > 0));
  if (util.length === 0) return <SemDados />;
  const valor = (p: Parte) => (formato === "dinheiro" ? p.cents : p.quantidade);
  const maximo = Math.max(...util.map(valor));
  return (
    <ul className="hbars">
      {util.map((p) => (
        <li key={p.rotulo}>
          <div className="hbars-top">
            <span className="hbars-label" title={p.rotulo}>
              {p.rotulo}
            </span>
            <span className="hbars-value">
              {formato === "dinheiro" ? reais(p.cents) : p.quantidade.toLocaleString("pt-BR")}
              {formato === "dinheiro" && p.quantidade > 0 && <em>{` · ${p.quantidade} ${p.quantidade === 1 ? "venda" : "vendas"}`}</em>}
            </span>
          </div>
          <div className="hbars-track">
            <div className="hbars-fill" style={{ width: `${Math.max((valor(p) / maximo) * 100, 2)}%`, background: cor }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Rosca com legenda. Cada parte usa uma cor da marca. */
export function Rosca({
  partes,
  formato = "dinheiro",
  centro,
  descricao,
}: {
  partes: Parte[];
  formato?: "dinheiro" | "quantidade";
  centro?: string;
  descricao: string;
}) {
  const valor = (p: Parte) => (formato === "dinheiro" ? p.cents : p.quantidade);
  const util = partes.filter((p) => valor(p) > 0);
  const total = util.reduce((t, p) => t + valor(p), 0);
  if (util.length === 0 || total <= 0) return <SemDados />;

  let acumulado = 0;
  const raio = 15.9155; // circunferência = 100
  return (
    <div className="donut">
      <svg viewBox="0 0 42 42" role="img" aria-label={descricao} className="donut-svg">
        <title>{descricao}</title>
        <circle cx="21" cy="21" r={raio} fill="none" stroke="#f6e9d3" strokeWidth="6" />
        {util.map((p, i) => {
          const pct = (valor(p) / total) * 100;
          const arco = (
            <circle
              key={p.rotulo}
              cx="21"
              cy="21"
              r={raio}
              fill="none"
              stroke={CORES[i % CORES.length]}
              strokeWidth="6"
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={25 - acumulado}
            >
              <title>{`${p.rotulo}: ${formato === "dinheiro" ? reais(p.cents) : p.quantidade}`}</title>
            </circle>
          );
          acumulado += pct;
          return arco;
        })}
        {centro && (
          <text x="21" y="22.5" textAnchor="middle" fontSize="4.2" fill="#3a1a0b" fontWeight="600">
            {centro}
          </text>
        )}
      </svg>
      <ul className="donut-legend">
        {util.map((p, i) => (
          <li key={p.rotulo}>
            <i style={{ background: CORES[i % CORES.length] }} aria-hidden="true" />
            <span className="donut-name">{p.rotulo}</span>
            <span className="donut-val">
              {Math.round((valor(p) / total) * 100)}%
              <em>{formato === "dinheiro" ? ` · ${reais(p.cents)}` : ` · ${p.quantidade}`}</em>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barra de progresso com título e números. */
export function Progresso({
  titulo,
  fracao,
  detalhe,
  cor = CORES[0],
}: {
  titulo: string;
  fracao: number; // 0 a 1
  detalhe: string;
  cor?: string;
}) {
  const pct = Math.min(Math.max(fracao, 0), 1) * 100;
  return (
    <div className="progress-item">
      <div className="progress-top">
        <span>{titulo}</span>
        <strong>{`${Math.round(pct)}%`}</strong>
      </div>
      <div className="hbars-track">
        <div className="hbars-fill" style={{ width: `${pct}%`, background: cor }} />
      </div>
      <div className="progress-detail">{detalhe}</div>
    </div>
  );
}

/** Uma barra dividida em duas partes (por exemplo, recebido e a receber). */
export function BarraDupla({
  rotulo,
  a,
  b,
  rotuloA,
  rotuloB,
}: {
  rotulo: string;
  a: number;
  b: number;
  rotuloA: string;
  rotuloB: string;
}) {
  const total = a + b;
  return (
    <div className="progress-item">
      <div className="progress-top">
        <span>{rotulo}</span>
        <strong>{reais(total)}</strong>
      </div>
      <div className="hbars-track split">
        <div className="hbars-fill" style={{ width: total > 0 ? `${(a / total) * 100}%` : "0%", background: "#a9c08f" }} />
        <div className="hbars-fill" style={{ width: total > 0 ? `${(b / total) * 100}%` : "0%", background: CORES[1] }} />
      </div>
      <div className="progress-detail">
        <span className="dot dot-a" /> {`${rotuloA}: ${reais(a)}`} <span className="dot dot-b" /> {`${rotuloB}: ${reais(b)}`}
      </div>
    </div>
  );
}
