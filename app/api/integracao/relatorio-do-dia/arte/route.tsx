import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { getPool, ensureSchema } from "@/lib/db";
import { tokenDaIntegracaoValido } from "@/lib/auth/integration-token";
import { todayBR } from "@/lib/finance/dates";
import { dadosDaArte } from "@/lib/arte-do-relatorio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Arte (PNG 1080x1350) que o Roberto posta no grupo junto com o texto do relatório do dia.
// GET ?dia=AAAA-MM-DD (opcional; padrão: hoje em Brasília). Mesmo token da rota do relatório.

const CAFE = "#2a1c13";
const CAFE_CLARO = "#3a281c";
const OURO = "#d4af6a";
const CREME = "#f5ece0";
const VERDE = "#8fd19e";
const VERMELHO = "#f2a091";

export async function GET(req: NextRequest) {
  if (!tokenDaIntegracaoValido(req.headers.get("authorization"), process.env.ROBERTO_INTEGRATION_TOKEN)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const pedido = req.nextUrl.searchParams.get("dia");
  const dia = pedido && /^\d{4}-\d{2}-\d{2}$/.test(pedido) ? pedido : todayBR();

  await ensureSchema();
  const vendas = await db.query(
    `SELECT to_char(sale_date, 'YYYY-MM-DD') AS sale_date, sale_value, price_tier, status FROM sales`
  );
  const d = dadosDaArte(vendas.rows, dia);

  let logo: string | null = null;
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", "marca", "logo-clara.png"));
    logo = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    logo = null;
  }

  const Caixa = ({ children, flex }: { children: React.ReactNode; flex?: number }) => (
    <div style={{ display: "flex", flexDirection: "column", background: CAFE_CLARO, borderRadius: 28, padding: "26px 32px", flex: flex ?? 1 }}>
      {children}
    </div>
  );

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: CAFE, color: CREME, padding: "56px 60px", fontSize: 30 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", color: OURO, fontSize: 30, letterSpacing: 4 }}>FECHAMENTO DO DIA</div>
            <div style={{ display: "flex", fontSize: 58, fontWeight: 700, marginTop: 6 }}>{d.titulo}</div>
          </div>
          {logo ? <img src={logo} width={330} height={90} /> : <div style={{ display: "flex" }} />}
        </div>

        <div style={{ display: "flex", gap: 24, marginTop: 34 }}>
          <Caixa>
            <div style={{ display: "flex", color: OURO, fontSize: 26 }}>HOJE</div>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700 }}>{d.hojeValor}</div>
            <div style={{ display: "flex", fontSize: 26 }}>{`${d.hojeVendas} venda${d.hojeVendas === 1 ? "" : "s"}`}</div>
          </Caixa>
          <Caixa>
            <div style={{ display: "flex", color: OURO, fontSize: 26 }}>{d.mesNome.toUpperCase()}</div>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700 }}>{d.mesValor}</div>
            <div style={{ display: "flex", fontSize: 26 }}>{`média ${d.media}/dia · ${d.diasComVenda} dias com venda`}</div>
          </Caixa>
        </div>

        <div style={{ display: "flex", color: OURO, fontSize: 30, letterSpacing: 3, marginTop: 36, marginBottom: 14 }}>META DOS CARTÕES</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {d.cartoes.map((c) => (
            <Caixa key={c.nome}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ display: "flex", fontWeight: 700 }}>{`${c.nome} · vence ${c.vence}`}</div>
                <div style={{ display: "flex" }}>{`${c.parte} · ${c.total}`}</div>
              </div>
              <div style={{ display: "flex", height: 18, background: "#5a4535", borderRadius: 9, marginTop: 14, marginBottom: 12 }}>
                <div style={{ display: "flex", width: `${Math.max(2, Math.round(c.fracao * 100))}%`, background: OURO, borderRadius: 9 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26 }}>
                <div style={{ display: "flex" }}>{`Guardado ${c.guardado}`}</div>
                <div style={{ display: "flex", color: c.previsaoOk ? VERDE : VERMELHO }}>{`Pela média: ${c.previsao}`}</div>
              </div>
            </Caixa>
          ))}
        </div>

        <div style={{ display: "flex", color: OURO, fontSize: 30, letterSpacing: 3, marginTop: 34, marginBottom: 14 }}>PROJEÇÃO DO CAIXA</div>
        <Caixa>
          {d.projecao.map((p) => (
            <div key={p.nome} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 28 }}>
              <div style={{ display: "flex" }}>{`${p.vence} · paga ${p.nome} ${p.paga}`}</div>
              <div style={{ display: "flex", color: p.ok ? VERDE : VERMELHO, fontWeight: 700 }}>{p.ok ? `fica ${p.fica}` : p.fica}</div>
            </div>
          ))}
        </Caixa>

        <div style={{ display: "flex", marginTop: "auto", fontSize: 22, color: "#bfa98c" }}>
          {"Pela média por dia com venda; domingo e segunda não contam. Radar de Vendas."}
        </div>
      </div>
    ),
    { width: 1080, height: 1350 }
  );
}
