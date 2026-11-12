import { reaisCurtos, type DadosDaArte } from "./arte-do-relatorio";

// Desenho da arte do fechamento (1080x1350), na paleta da Fernanda Brilhante (a mesma do Radar):
// champanhe, couro, dourado, rosé e sálvia. Feito para o satori (next/og): tudo em flex.

export const PALETA = {
  fundo: "#fdf6ed",
  cartao: "#fffcf8",
  suave: "#f8efe3",
  borda: "#ecdfcb",
  bordaForte: "#dcc7a8",
  tinta: "#33190d",
  tintaSuave: "#715a48",
  tintaFraca: "#9b846f",
  couro: "#5a2f17",
  couroForte: "#3a1a0b",
  ouro: "#a9772a",
  ouroVivo: "#e8b253",
  ouroSuave: "#f8ecc8",
  rose: "#f8e6e2",
  salvia: "#55703f",
  salviaSuave: "#e7eedf",
  alerta: "#b04a3a",
  alertaSuave: "#f8e4df",
};
const P = PALETA;

const SERIF = "Instrument Serif";
const SANS = "Instrument Sans";

function Rotulo({ children, cor }: { children: string; cor?: string }) {
  return <div style={{ display: "flex", fontFamily: SANS, fontWeight: 700, fontSize: 19, letterSpacing: 3, color: cor ?? P.ouro }}>{children}</div>;
}

function Bloco({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", background: P.cartao, border: `1px solid ${P.borda}`, borderRadius: 22, padding: "16px 24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <Rotulo>{titulo}</Rotulo>
        {nota ? <div style={{ display: "flex", fontFamily: SANS, fontSize: 18, color: P.tintaFraca }}>{nota}</div> : <div style={{ display: "flex" }} />}
      </div>
      {children}
    </div>
  );
}

export function ArteDoFechamento({ d, logo, couro }: { d: DadosDaArte; logo: string | null; couro: string | null }) {
  const maxDia = Math.max(1, ...d.porDia.map((b) => b.cents));
  const maxCaixa = Math.max(1, ...d.caixa.map((c) => c.noVencimentoCents));
  const ALT_DIA = 135;
  const ALT_CAIXA = 140;

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: P.fundo, color: P.tinta, fontFamily: SANS }}>
      {/* faixa de couro com a logo */}
      <div style={{ display: "flex", position: "relative", height: 170, width: "100%" }}>
        {couro ? <img src={couro} width={1080} height={170} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} /> : null}
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: 1080, height: 170, background: "rgba(58,26,11,0.78)" }} />
        <div style={{ display: "flex", position: "absolute", top: 0, left: 0, width: 1080, height: 170, padding: "0 60px", alignItems: "center", justifyContent: "space-between" }}>
          {logo ? <img src={logo} width={290} height={79} /> : <div style={{ display: "flex" }} />}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <Rotulo cor={P.ouroVivo}>FECHAMENTO DO DIA</Rotulo>
            <div style={{ display: "flex", fontFamily: SERIF, fontSize: 50, color: P.ouroSuave, marginTop: 4 }}>{d.titulo}</div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", height: 4, width: "100%", background: P.ouroVivo }} />

      <div style={{ display: "flex", flexDirection: "column", padding: "22px 52px 0", gap: 14 }}>
        {/* números do dia */}
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { r: "HOJE", v: d.hojeValor, n: `${d.hojeVendas} venda${d.hojeVendas === 1 ? "" : "s"}`, fundo: P.couro, cor: P.ouroSuave, nota: P.ouroVivo },
            { r: d.mesNome.toUpperCase(), v: d.mesValor, n: `${d.mesVendas} vendas no mês`, fundo: P.cartao, cor: P.couro, nota: P.tintaSuave },
            { r: "MÉDIA POR DIA", v: d.media, n: `${d.diasComVenda} dias com venda`, fundo: P.cartao, cor: P.couro, nota: P.tintaSuave },
          ].map((k) => (
            <div key={k.r} style={{ display: "flex", flexDirection: "column", flex: 1, background: k.fundo, border: `1px solid ${P.borda}`, borderRadius: 22, padding: "14px 22px" }}>
              <Rotulo cor={k.fundo === P.couro ? P.ouroVivo : P.ouro}>{k.r}</Rotulo>
              <div style={{ display: "flex", fontFamily: SERIF, fontSize: 46, color: k.cor, marginTop: 2 }}>{k.v}</div>
              <div style={{ display: "flex", fontSize: 19, color: k.nota }}>{k.n}</div>
            </div>
          ))}
        </div>

        {/* gráfico: vendas por dia */}
        <Bloco titulo={`VENDAS POR DIA · ${d.mesNome.toUpperCase()}`} nota="domingo e segunda em rosé">
          <div style={{ display: "flex", alignItems: "flex-end", height: ALT_DIA + 44, gap: 4 }}>
            {d.porDia.map((b) => {
              const h = b.cents > 0 ? Math.max(6, Math.round((b.cents / maxDia) * ALT_DIA)) : 3;
              return (
                <div key={b.dia} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", flex: 1, height: ALT_DIA + 44 }}>
                  {b.cents > 0 && (d.porDia.length <= 16 || b.cents === maxDia || b === d.porDia[d.porDia.length - 1]) ? (
                    <div style={{ display: "flex", fontSize: 14, color: P.couro, marginBottom: 4 }}>{reaisCurtos(b.cents).replace("R$ ", "")}</div>
                  ) : null}
                  <div style={{ display: "flex", width: "78%", height: h, borderRadius: 6, background: b.cents > 0 ? P.ouro : b.folga ? P.rose : P.bordaForte }} />
                  <div style={{ display: "flex", fontSize: 14, color: b.folga ? P.alerta : P.tintaFraca, marginTop: 6 }}>{String(b.dia)}</div>
                </div>
              );
            })}
          </div>
        </Bloco>

        {/* tabela: meta dos cartões */}
        <Bloco titulo="META DOS CARTÕES" nota="pela média, no vencimento às 20h">
          <div style={{ display: "flex", padding: "6px 0", borderBottom: `1px solid ${P.borda}`, fontSize: 17, fontWeight: 700, color: P.tintaFraca, letterSpacing: 1 }}>
            <div style={{ display: "flex", width: 230 }}>CARTÃO</div>
            <div style={{ display: "flex", width: 110 }}>VENCE</div>
            <div style={{ display: "flex", width: 160 }}>FATURA</div>
            <div style={{ display: "flex", width: 210 }}>GUARDADO</div>
            <div style={{ display: "flex", flex: 1, justifyContent: "flex-end" }}>PELA MÉDIA</div>
          </div>
          {d.cartoes.map((c) => (
            <div key={c.nome} style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${P.borda}`, fontSize: 22 }}>
              <div style={{ display: "flex", flexDirection: "column", width: 230 }}>
                <div style={{ display: "flex", fontFamily: SERIF, fontSize: 28, color: P.couro }}>{c.nome}</div>
                <div style={{ display: "flex", fontSize: 16, color: P.tintaFraca }}>{`${c.parte} de cada venda`}</div>
              </div>
              <div style={{ display: "flex", width: 110 }}>{c.vence}</div>
              <div style={{ display: "flex", width: 160 }}>{c.total}</div>
              <div style={{ display: "flex", flexDirection: "column", width: 210 }}>
                <div style={{ display: "flex" }}>{c.guardado}</div>
                <div style={{ display: "flex", width: 180, height: 8, borderRadius: 4, background: P.suave, marginTop: 6 }}>
                  <div style={{ display: "flex", width: Math.max(4, Math.round(180 * c.fracao)), height: 8, borderRadius: 4, background: P.ouro }} />
                </div>
              </div>
              <div style={{ display: "flex", flex: 1, justifyContent: "flex-end" }}>
                <div style={{ display: "flex", padding: "6px 12px", borderRadius: 12, fontSize: 19, background: c.previsaoOk ? P.salviaSuave : P.alertaSuave, color: c.previsaoOk ? P.salvia : P.alerta }}>
                  {c.previsao}
                </div>
              </div>
            </div>
          ))}
        </Bloco>

        {/* gráfico: projeção do caixa */}
        {d.caixa.length > 0 ? (
          <Bloco titulo="PROJEÇÃO DO CAIXA" nota="dourado: caixa às 20h · couro: depois de pagar">
            <div style={{ display: "flex", alignItems: "flex-end", height: ALT_CAIXA + 84, gap: 18 }}>
              {d.caixa.map((c) => (
                <div key={c.rotulo} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: ALT_CAIXA + 30 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                      <div style={{ display: "flex", fontSize: 15, color: P.ouro, marginBottom: 4 }}>{reaisCurtos(c.noVencimentoCents).replace("R$ ", "")}</div>
                      <div style={{ display: "flex", width: 46, height: Math.max(4, Math.round((c.noVencimentoCents / maxCaixa) * ALT_CAIXA)), borderRadius: 6, background: P.ouro }} />
                    </div>
                    {c.depoisCents !== null ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ display: "flex", fontSize: 15, color: c.depoisCents >= 0 ? P.couro : P.alerta, marginBottom: 4 }}>
                          {reaisCurtos(Math.abs(c.depoisCents)).replace("R$ ", c.depoisCents >= 0 ? "" : "-")}
                        </div>
                        <div style={{ display: "flex", width: 46, height: Math.max(4, Math.round((Math.max(c.depoisCents, 0) / maxCaixa) * ALT_CAIXA)), borderRadius: 6, background: c.depoisCents >= 0 ? P.couro : P.alerta }} />
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", fontFamily: SERIF, fontSize: 24, color: P.couro, marginTop: 6 }}>{c.rotulo}</div>
                  <div style={{ display: "flex", fontSize: 15, color: P.tintaFraca, height: 20 }}>{c.paga ? `paga ${c.paga.split(" R$")[0]}` : "caixa atual"}</div>
                </div>
              ))}
            </div>
          </Bloco>
        ) : null}
      </div>

      <div style={{ display: "flex", marginTop: "auto", padding: "0 52px 22px", justifyContent: "space-between", fontSize: 16, color: P.tintaFraca }}>
        <div style={{ display: "flex" }}>Média por dia com venda · domingo e segunda não contam · caixa = valor vendido</div>
        <div style={{ display: "flex", color: P.ouro, letterSpacing: 2 }}>RADAR DE VENDAS</div>
      </div>
    </div>
  );
}
