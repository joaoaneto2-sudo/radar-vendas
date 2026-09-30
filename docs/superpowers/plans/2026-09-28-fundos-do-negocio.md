# Fundos do negócio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada venda separa uma % para fundos que o João escolhe (7 nascem prontos, lista editável), a % vale por mês com regras de "quando vale", despesas podem ser pagas por um fundo, e os acumulados aparecem no alto do Painel financeiro.

**Architecture:** Regras puras em `lib/finance/funds.ts` (sem banco); o motor `computeCascade` ganha um parâmetro opcional `funds` (sem ele, nada muda); duas tabelas novas (`funds`, `fund_rules`) e uma coluna nova (`expenses.fund_id`) numa migração só de acréscimo (016); rotas `/api/funds*`; telas novas (faixa no Painel, página Fundos, campo em Despesas).

**Tech Stack:** Next.js 14 App Router, TypeScript strict, React 18, `pg`, Postgres (Neon), Vitest, CSS puro (`app/globals.css`). Dinheiro sempre em centavos inteiros (`lib/finance/money.ts`).

**Spec:** `docs/superpowers/specs/2026-09-28-fundos-do-negocio-design.md`

## Global Constraints

- Texto para o usuário em português simples do Brasil, **sem travessão** (nada de "—" nem "–" em textos do sistema); textos em nome do João no masculino.
- Só acrescentar no banco: nada existente é alterado ou apagado. Migração nova = id `"016"` (a última existente é `"015"`).
- Com todas as % em 0 (ou sem fundos), **todos os números do sistema ficam idênticos aos de hoje**: os testes atuais da cascata (`tests/unit/cascade.test.ts`) passam sem mudança.
- Dinheiro em centavos inteiros; `pctOf(base, pct)` de `lib/finance/money.ts` para cada fundo separadamente.
- Meses são texto `AAAA-MM-01` (dia 1). A % de um fundo num mês vem da regra que cobre o mês e tem maior `createdAt` (desempate por maior `id`).
- Só publicar com "pode publicar" do João dito na hora. Este plano NÃO publica. Não tocar o banco real.
- Arquivos do Windows: o repositório tem fim de linha misto (CRLF na pasta, LF no Git). Use a ferramenta Edit/Write normalmente; NÃO rode scripts que dividam por `\n` sem tratar `\r\n`.
- Os testes de banco precisam do Docker com o container `radar-teste-db` ligado (`docker start radar-teste-db`). Rode-os com `npx vitest run tests/db/<arquivo>` para evitar competição por conexões.
- Commits terminam com a linha `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Trabalhar na branch `fundos-do-negocio` (já criada, a partir da main).

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `lib/finance/funds.ts` (novo) | Regras puras: meses, % por mês, opções de "quando vale", validações, textos |
| `lib/finance/cascade.ts` (editar) | Motor: separa os fundos por evento, despesas pagas por fundo, contas por fundo |
| `lib/migrations.ts` (editar) | Migração 016 |
| `lib/funds-db.ts` (novo) | Consultas ao banco: fundos e regras |
| `lib/finance/load.ts` (editar) | Lê fundos, regras e `expenses.fund_id` e passa ao motor |
| `lib/expenses.ts` (editar) | `parseExpenseBody` aceita `fund_id` |
| `app/api/expenses/route.ts`, `app/api/expenses/[id]/route.ts` (editar) | Gravam e devolvem o fundo da despesa |
| `app/api/funds/route.ts`, `app/api/funds/[id]/route.ts`, `app/api/funds/rules/route.ts`, `app/api/funds/rules/[id]/route.ts` (novos) | API de fundos e regras |
| `lib/change-log.ts` (editar) | Histórico de alterações reconhece fundos e regras |
| `lib/faixa-dos-fundos.ts` (novo) | Monta os cartões da faixa (texto pronto) |
| `app/financeiro/faixa-dos-fundos.tsx` (novo) | Componente da faixa |
| `app/financeiro/page.tsx` (editar) | Faixa no alto e coluna "Fundos" na tabela |
| `app/financeiro/fundos/page.tsx` (novo) | Tela Financeiro > Fundos |
| `app/nav-bar.tsx` (editar) | Menu, caminho e "Mais" |
| `app/financeiro/despesas/page.tsx` (editar) | Campo "Pagar com o fundo de" |
| `app/globals.css` (editar) | Estilos da faixa e da tela |

---

### Task 1: Regras puras dos fundos (`lib/finance/funds.ts`)

**Files:**
- Create: `lib/finance/funds.ts`
- Test: `tests/unit/funds.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces (usados nas tarefas 2, 3, 5, 6, 8):
  - `type MesISO = string` (`"AAAA-MM-01"`)
  - `interface Fundo { id: number; name: string; active: boolean }`
  - `interface FundRule { id: number; fundId: number; pct: number; fromMonth: MesISO; toMonth: MesISO | null; createdAt: string }`
  - `type OpcaoDeQuando = "so_este_mes" | "proximo_mes" | "sempre"`; `const OPCOES_DE_QUANDO: OpcaoDeQuando[]`
  - `mesDe(dataISO: string): MesISO`, `mesSeguinte(mes: MesISO): MesISO`
  - `pctDoFundo(regras: FundRule[], fundId: number, mes: MesISO): number`
  - `periodoDaOpcao(opcao: OpcaoDeQuando, hojeISO: string): { fromMonth: MesISO; toMonth: MesISO | null }`
  - `nomeDoMes(mes: MesISO): string`, `descreverOpcao(opcao, hojeISO): string`, `descreverPeriodo(fromMonth, toMonth): string`, `formatarPct(n: number): string`
  - `type Resultado = { ok: true } | { ok: false; error: string; message: string }`
  - `validarRegra(regras, nova: { fundId: number; pct: number; fromMonth: MesISO; toMonth: MesISO | null }, todosOsFundIds: number[], reposicaoMaximaPct: number): Resultado`
  - `podeArquivar(regras, fundId, hojeISO, saldoCents): Resultado`
  - `validarNomeDoFundo(nome: unknown, descricao: unknown): { ok: true; nome: string; descricao: string | null } | { ok: false; error: string; message: string }`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/funds.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  descreverOpcao,
  descreverPeriodo,
  mesDe,
  mesSeguinte,
  nomeDoMes,
  pctDoFundo,
  periodoDaOpcao,
  podeArquivar,
  validarNomeDoFundo,
  validarRegra,
  type FundRule,
} from "../../lib/finance/funds";

let seq = 0;
function regra(fundId: number, pct: number, fromMonth: string, toMonth: string | null, createdAt: string): FundRule {
  seq += 1;
  return { id: seq, fundId, pct, fromMonth, toMonth, createdAt };
}

describe("meses", () => {
  it("mesDe pega o dia 1 do mês da data", () => {
    expect(mesDe("2026-09-21")).toBe("2026-09-01");
    expect(mesDe("2026-12-31")).toBe("2026-12-01");
  });

  it("mesSeguinte passa de dezembro para janeiro do ano seguinte", () => {
    expect(mesSeguinte("2026-09-01")).toBe("2026-10-01");
    expect(mesSeguinte("2026-12-01")).toBe("2027-01-01");
  });

  it("nome do mês por extenso", () => {
    expect(nomeDoMes("2026-09-01")).toBe("setembro de 2026");
    expect(nomeDoMes("2027-01-01")).toBe("janeiro de 2027");
  });
});

describe("% de um fundo em cada mês", () => {
  it("sem regra é 0", () => {
    expect(pctDoFundo([], 1, "2026-09-01")).toBe(0);
  });

  it("regra sem fim vale do mês de início em diante, e não antes", () => {
    const rs = [regra(1, 5, "2026-09-01", null, "2026-09-10T10:00:00.000Z")];
    expect(pctDoFundo(rs, 1, "2026-08-01")).toBe(0);
    expect(pctDoFundo(rs, 1, "2026-09-01")).toBe(5);
    expect(pctDoFundo(rs, 1, "2027-03-01")).toBe(5);
  });

  it("regra de um mês só não vale no mês seguinte", () => {
    const rs = [regra(1, 5, "2026-09-01", "2026-09-01", "2026-09-10T10:00:00.000Z")];
    expect(pctDoFundo(rs, 1, "2026-09-01")).toBe(5);
    expect(pctDoFundo(rs, 1, "2026-10-01")).toBe(0);
  });

  it("uma exceção de um mês volta sozinha à regra anterior", () => {
    const rs = [
      regra(1, 5, "2026-09-01", null, "2026-09-01T10:00:00.000Z"),
      regra(1, 8, "2026-10-01", "2026-10-01", "2026-09-20T10:00:00.000Z"),
    ];
    expect(pctDoFundo(rs, 1, "2026-09-01")).toBe(5);
    expect(pctDoFundo(rs, 1, "2026-10-01")).toBe(8);
    expect(pctDoFundo(rs, 1, "2026-11-01")).toBe(5);
  });

  it("a regra criada por último vence nos meses em comum", () => {
    const rs = [
      regra(1, 5, "2026-09-01", null, "2026-09-01T10:00:00.000Z"),
      regra(1, 3, "2026-11-01", null, "2026-09-25T10:00:00.000Z"),
    ];
    expect(pctDoFundo(rs, 1, "2026-10-01")).toBe(5);
    expect(pctDoFundo(rs, 1, "2026-11-01")).toBe(3);
    expect(pctDoFundo(rs, 1, "2027-01-01")).toBe(3);
  });

  it("empate na hora de criar: vale a de maior id", () => {
    const igual = "2026-09-01T10:00:00.000Z";
    const rs = [regra(1, 5, "2026-09-01", null, igual), regra(1, 7, "2026-09-01", null, igual)];
    expect(pctDoFundo(rs, 1, "2026-09-01")).toBe(7);
  });

  it("regra de outro fundo não interfere", () => {
    const rs = [regra(2, 9, "2026-09-01", null, "2026-09-01T10:00:00.000Z")];
    expect(pctDoFundo(rs, 1, "2026-09-01")).toBe(0);
    expect(pctDoFundo(rs, 2, "2026-09-01")).toBe(9);
  });
});

describe("as três opções de 'quando vale'", () => {
  it("só este mês", () => {
    expect(periodoDaOpcao("so_este_mes", "2026-09-28")).toEqual({ fromMonth: "2026-09-01", toMonth: "2026-09-01" });
  });

  it("a partir do mês que vem (inclusive na virada do ano)", () => {
    expect(periodoDaOpcao("proximo_mes", "2026-09-28")).toEqual({ fromMonth: "2026-10-01", toMonth: null });
    expect(periodoDaOpcao("proximo_mes", "2026-12-15")).toEqual({ fromMonth: "2027-01-01", toMonth: null });
  });

  it("por tempo indeterminado, já neste mês", () => {
    expect(periodoDaOpcao("sempre", "2026-09-28")).toEqual({ fromMonth: "2026-09-01", toMonth: null });
  });

  it("textos das opções", () => {
    expect(descreverOpcao("so_este_mes", "2026-09-28")).toBe("Só em setembro de 2026");
    expect(descreverOpcao("proximo_mes", "2026-09-28")).toBe("A partir de outubro de 2026");
    expect(descreverOpcao("sempre", "2026-09-28")).toBe("Por tempo indeterminado, a partir de setembro de 2026");
  });

  it("texto do período de uma regra", () => {
    expect(descreverPeriodo("2026-09-01", "2026-09-01")).toBe("só em setembro de 2026");
    expect(descreverPeriodo("2026-09-01", null)).toBe("a partir de setembro de 2026, sem fim");
    expect(descreverPeriodo("2026-09-01", "2026-11-01")).toBe("de setembro de 2026 até novembro de 2026");
  });
});

describe("validar uma regra nova", () => {
  const FUNDOS = [1, 2, 3];
  const nova = (pct: number, fromMonth = "2026-09-01", toMonth: string | null = null) => ({ fundId: 1, pct, fromMonth, toMonth });

  it("aceita de 0 a 100 com até duas casas", () => {
    expect(validarRegra([], nova(0), FUNDOS, 30)).toEqual({ ok: true });
    expect(validarRegra([], nova(5.25), FUNDOS, 30)).toEqual({ ok: true });
    expect(validarRegra([], nova(70), FUNDOS, 30)).toEqual({ ok: true });
  });

  it("recusa fora de 0 a 100, com mais de duas casas ou que não é número", () => {
    for (const ruim of [-1, 101, 5.555, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validarRegra([], nova(ruim), FUNDOS, 30)).toMatchObject({ ok: false, error: "invalid_pct" });
    }
  });

  it("a soma de todos os fundos mais a reposição não passa de 100%", () => {
    const outras = [
      regra(2, 40, "2026-09-01", null, "2026-09-01T10:00:00.000Z"),
      regra(3, 25, "2026-09-01", null, "2026-09-01T10:00:00.000Z"),
    ];
    expect(validarRegra(outras, nova(5), FUNDOS, 30)).toEqual({ ok: true }); // 40 + 25 + 5 + 30 = 100
    expect(validarRegra(outras, nova(6), FUNDOS, 30)).toMatchObject({ ok: false, error: "over_100" }); // 101
  });

  it("confere também os meses futuros em que outra regra muda", () => {
    const futura = [regra(2, 60, "2026-11-01", null, "2026-09-01T10:00:00.000Z")];
    const r = validarRegra(futura, nova(20), FUNDOS, 30); // set e out: 50; nov em diante: 110
    expect(r).toMatchObject({ ok: false, error: "over_100" });
    expect((r as { message: string }).message).toContain("11/2026");
  });

  it("uma regra de um mês só não é barrada por meses que ela não toca", () => {
    const futura = [regra(2, 60, "2026-11-01", null, "2026-09-01T10:00:00.000Z")];
    expect(validarRegra(futura, nova(20, "2026-09-01", "2026-09-01"), FUNDOS, 30)).toEqual({ ok: true });
  });
});

describe("arquivar um fundo", () => {
  const HOJE = "2026-09-28";

  it("pode com % zero agora e depois, e saldo zero", () => {
    expect(podeArquivar([], 1, HOJE, 0)).toEqual({ ok: true });
    const encerrada = [regra(1, 5, "2026-06-01", "2026-08-01", "2026-06-01T10:00:00.000Z")];
    expect(podeArquivar(encerrada, 1, HOJE, 0)).toEqual({ ok: true });
  });

  it("não pode com % neste mês", () => {
    const rs = [regra(1, 5, "2026-09-01", null, "2026-09-01T10:00:00.000Z")];
    expect(podeArquivar(rs, 1, HOJE, 0)).toMatchObject({ ok: false });
  });

  it("não pode se uma regra futura separa %", () => {
    const rs = [regra(1, 3, "2026-10-01", null, "2026-09-01T10:00:00.000Z")];
    expect(podeArquivar(rs, 1, HOJE, 0)).toMatchObject({ ok: false });
  });

  it("não pode com saldo", () => {
    expect(podeArquivar([], 1, HOJE, 500)).toMatchObject({ ok: false });
  });
});

describe("nome do fundo", () => {
  it("tira espaços; descrição vazia vira nulo", () => {
    expect(validarNomeDoFundo("  Frete ", "")).toEqual({ ok: true, nome: "Frete", descricao: null });
    expect(validarNomeDoFundo("Digital", " Site ")).toEqual({ ok: true, nome: "Digital", descricao: "Site" });
  });

  it("recusa nome vazio ou grande demais", () => {
    expect(validarNomeDoFundo("   ", null)).toMatchObject({ ok: false, error: "missing_name" });
    expect(validarNomeDoFundo("x".repeat(41), null)).toMatchObject({ ok: false, error: "name_too_long" });
    expect(validarNomeDoFundo(undefined, null)).toMatchObject({ ok: false, error: "missing_name" });
  });

  it("recusa descrição grande demais", () => {
    expect(validarNomeDoFundo("Ok", "y".repeat(201))).toMatchObject({ ok: false, error: "description_too_long" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/funds.test.ts`
Expected: FAIL (o arquivo `lib/finance/funds` não existe).

- [ ] **Step 3: Write minimal implementation**

Create `lib/finance/funds.ts`:

```ts
// Fundos do negócio: as regras que não falam com o banco.
// Cada fundo separa uma % de toda entrada que entra na divisão (como a reposição de 30%).
// A % vale por MÊS. Cada mudança que o João faz vira uma regra; no mês M vale a regra mais
// recente (por data de criação) entre as que cobrem M. Sem regra, a % é 0.

export type MesISO = string; // sempre "AAAA-MM-01"

export interface Fundo {
  id: number;
  name: string;
  active: boolean;
}

export interface FundRule {
  id: number;
  fundId: number;
  pct: number; // 0 a 100, até 2 casas
  fromMonth: MesISO;
  toMonth: MesISO | null; // nulo = sem fim
  createdAt: string; // ISO; decide qual regra vale quando duas cobrem o mesmo mês
}

export type OpcaoDeQuando = "so_este_mes" | "proximo_mes" | "sempre";
export const OPCOES_DE_QUANDO: OpcaoDeQuando[] = ["so_este_mes", "proximo_mes", "sempre"];

export type Resultado = { ok: true } | { ok: false; error: string; message: string };

const NOMES_DOS_MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

export function mesDe(dataISO: string): MesISO {
  return `${dataISO.slice(0, 7)}-01`;
}

export function mesSeguinte(mes: MesISO): MesISO {
  const [ano, m] = mes.split("-").map(Number);
  return m === 12 ? `${ano + 1}-01-01` : `${ano}-${String(m + 1).padStart(2, "0")}-01`;
}

export function nomeDoMes(mes: MesISO): string {
  const [ano, m] = mes.split("-").map(Number);
  return `${NOMES_DOS_MESES[m - 1]} de ${ano}`;
}

/** "09/2026", para mensagens curtas. */
function mesCurto(mes: MesISO): string {
  return `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;
}

export function formatarPct(n: number): string {
  return String(n).replace(".", ",");
}

/** A % de um fundo num mês: a regra mais recente entre as que cobrem o mês. Sem regra, 0. */
export function pctDoFundo(regras: FundRule[], fundId: number, mes: MesISO): number {
  let vencedora: FundRule | null = null;
  for (const r of regras) {
    if (r.fundId !== fundId || r.fromMonth > mes || (r.toMonth !== null && r.toMonth < mes)) continue;
    if (!vencedora || r.createdAt > vencedora.createdAt || (r.createdAt === vencedora.createdAt && r.id > vencedora.id)) {
      vencedora = r;
    }
  }
  return vencedora ? vencedora.pct : 0;
}

/** De qual mês até qual mês vale uma regra, para cada opção da tela. */
export function periodoDaOpcao(opcao: OpcaoDeQuando, hojeISO: string): { fromMonth: MesISO; toMonth: MesISO | null } {
  const atual = mesDe(hojeISO);
  if (opcao === "so_este_mes") return { fromMonth: atual, toMonth: atual };
  if (opcao === "proximo_mes") return { fromMonth: mesSeguinte(atual), toMonth: null };
  return { fromMonth: atual, toMonth: null };
}

export function descreverOpcao(opcao: OpcaoDeQuando, hojeISO: string): string {
  const atual = mesDe(hojeISO);
  if (opcao === "so_este_mes") return `Só em ${nomeDoMes(atual)}`;
  if (opcao === "proximo_mes") return `A partir de ${nomeDoMes(mesSeguinte(atual))}`;
  return `Por tempo indeterminado, a partir de ${nomeDoMes(atual)}`;
}

export function descreverPeriodo(fromMonth: MesISO, toMonth: MesISO | null): string {
  if (toMonth === null) return `a partir de ${nomeDoMes(fromMonth)}, sem fim`;
  if (toMonth === fromMonth) return `só em ${nomeDoMes(fromMonth)}`;
  return `de ${nomeDoMes(fromMonth)} até ${nomeDoMes(toMonth)}`;
}

const emPontos = (pct: number) => Math.round(pct * 100); // 5,25% vira 525 (evita erro de decimal)

/**
 * Confere uma regra nova: % de 0 a 100 com até 2 casas, e, em todo mês que ela muda,
 * a soma das % de todos os fundos mais a maior reposição não pode passar de 100%.
 */
export function validarRegra(
  regras: FundRule[],
  nova: { fundId: number; pct: number; fromMonth: MesISO; toMonth: MesISO | null },
  todosOsFundIds: number[],
  reposicaoMaximaPct: number
): Resultado {
  const { pct } = nova;
  if (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 100 || emPontos(pct) / 100 !== pct) {
    return { ok: false, error: "invalid_pct", message: "A porcentagem precisa ficar entre 0 e 100, com até duas casas." };
  }

  const hipotetica: FundRule = {
    id: Number.MAX_SAFE_INTEGER,
    fundId: nova.fundId,
    pct,
    fromMonth: nova.fromMonth,
    toMonth: nova.toMonth,
    createdAt: "9999-12-31T00:00:00.000Z",
  };
  const todas = [...regras, hipotetica];

  // Os únicos meses em que a soma pode mudar são os que começam ou terminam alguma regra.
  const candidatos = new Set<MesISO>([nova.fromMonth]);
  for (const r of todas) {
    candidatos.add(r.fromMonth);
    if (r.toMonth !== null) candidatos.add(mesSeguinte(r.toMonth));
  }
  const meses = [...candidatos]
    .filter((m) => m >= nova.fromMonth && (nova.toMonth === null || m <= nova.toMonth))
    .sort();

  for (const mes of meses) {
    const soma = todosOsFundIds.reduce((total, id) => total + emPontos(pctDoFundo(todas, id, mes)), 0);
    if (soma + emPontos(reposicaoMaximaPct) > 10000) {
      return {
        ok: false,
        error: "over_100",
        message: `A soma dos fundos (${formatarPct(soma / 100)}%) mais a reposição (${formatarPct(reposicaoMaximaPct)}%) passa de 100% em ${mesCurto(mes)}.`,
      };
    }
  }
  return { ok: true };
}

/** Só dá para arquivar um fundo com % zero (agora e nos meses futuros com regra) e saldo zero. */
export function podeArquivar(regras: FundRule[], fundId: number, hojeISO: string, saldoCents: number): Resultado {
  const hoje = mesDe(hojeISO);
  const doFundo = regras.filter((r) => r.fundId === fundId);
  const meses = new Set<MesISO>([hoje]);
  for (const r of doFundo) {
    if (r.fromMonth >= hoje) meses.add(r.fromMonth);
    if (r.toMonth !== null && mesSeguinte(r.toMonth) >= hoje) meses.add(mesSeguinte(r.toMonth));
  }
  if ([...meses].some((m) => pctDoFundo(regras, fundId, m) > 0)) {
    return { ok: false, error: "has_pct", message: "Zere a porcentagem deste fundo (neste mês e nos próximos) antes de arquivar." };
  }
  if (saldoCents !== 0) {
    return { ok: false, error: "has_balance", message: "Use ou zere o saldo deste fundo antes de arquivar." };
  }
  return { ok: true };
}

export function validarNomeDoFundo(
  nome: unknown,
  descricao: unknown
): { ok: true; nome: string; descricao: string | null } | { ok: false; error: string; message: string } {
  const n = typeof nome === "string" ? nome.trim() : "";
  if (n === "") return { ok: false, error: "missing_name", message: "Escreva o nome do fundo." };
  if (n.length > 40) return { ok: false, error: "name_too_long", message: "O nome do fundo pode ter até 40 letras." };
  const d = typeof descricao === "string" ? descricao.trim() : "";
  if (d.length > 200) return { ok: false, error: "description_too_long", message: "A descrição pode ter até 200 letras." };
  return { ok: true, nome: n, descricao: d === "" ? null : d };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/funds.test.ts`
Expected: PASS (todos os testes do arquivo).

- [ ] **Step 5: Commit**

```bash
git add lib/finance/funds.ts tests/unit/funds.test.ts
git commit -m "Fundos: regras puras (meses, % por mês, opções de quando vale, validações)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Motor da cascata separa os fundos

**Files:**
- Modify: `lib/finance/cascade.ts` (importação no topo; `ExpenseInput`; `CascadeEvent`; `CascadeResult`; `RawEvent`; `computeCascade`)
- Test: `tests/unit/cascade-fundos.test.ts`

**Interfaces:**
- Consumes: de `lib/finance/funds.ts`: `mesDe`, `pctDoFundo`, tipos `Fundo`, `FundRule`.
- Produces (usados nas tarefas 5, 6, 7, 8):
  - `interface FundsInput { funds: Fundo[]; rules: FundRule[]; today: string }` e `const SEM_FUNDOS: FundsInput`
  - `interface FundAccount { fundId: number; enteredCents: Cents; spentCents: Cents; balanceCents: Cents; pctThisMonth: number; enteredThisMonthCents: Cents }`
  - `ExpenseInput.fundId?: number | null`
  - `CascadeEvent.fundsCents: Record<number, Cents>` e `CascadeEvent.fundCoveredCents: Cents`
  - `CascadeResult.funds: FundAccount[]`; `CascadeResult.totals.fundsCents`, `CascadeResult.totals.fundCoveredCents`
  - `computeCascade(settings, sales, joaoPayments, expenses = [], receipts = [], funds = SEM_FUNDOS)`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/cascade-fundos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { SEM_FUNDOS, computeCascade, type ExpenseInput, type ReceiptInput, type SaleInput, type Settings } from "../../lib/finance/cascade";
import type { FundRule } from "../../lib/finance/funds";

const SETTINGS: Settings = { retailPct: 30, wholesalePct: 0, consignmentPct: 30, joaoSharePct: 50, initialStockCents: 1500000, mode: "recebimento" };
const HOJE = "2026-09-15";

const PROSPECCAO = 1;
const TRANSPORTE = 2;
const CUSTOS_FIXOS = 3;
const FUNDOS = [
  { id: PROSPECCAO, name: "Prospecção", active: true },
  { id: TRANSPORTE, name: "Transporte", active: true },
  { id: CUSTOS_FIXOS, name: "Custos fixos", active: true },
];

let seq = 0;
function regra(fundId: number, pct: number, fromMonth: string, toMonth: string | null = null): FundRule {
  seq += 1;
  return { id: seq, fundId, pct, fromMonth, toMonth, createdAt: `2026-09-01T10:00:${String(seq).padStart(2, "0")}.000Z` };
}

function venda(id: number, date: string, amountCents: number, extra: Partial<SaleInput> = {}): SaleInput {
  return { id, date, amountCents, costsCents: 0, tier: "varejo", status: "ativa", paymentMethod: "Pix à vista", payments: [], ...extra };
}

function despesa(id: number, date: string, amountCents: number, fundId: number | null): ExpenseInput {
  return { id, date, amountCents, description: `despesa ${id}`, fundId };
}

const REGRAS_DO_EXEMPLO = [regra(PROSPECCAO, 5, "2026-09-01"), regra(TRANSPORTE, 3, "2026-09-01"), regra(CUSTOS_FIXOS, 4, "2026-09-01")];
const conta = (r: ReturnType<typeof computeCascade>, fundId: number) => r.funds.find((f) => f.fundId === fundId)!;

describe("fundos na cascata: o exemplo de R$ 250", () => {
  const r = computeCascade(SETTINGS, [venda(1, "2026-09-01", 25000)], [], [], [], { funds: FUNDOS, rules: REGRAS_DO_EXEMPLO, today: HOJE });
  const e = r.events[0];

  it("separa a reposição e cada fundo do valor da venda", () => {
    expect(e.replenishCents).toBe(7500);
    expect(e.fundsCents).toEqual({ [PROSPECCAO]: 1250, [TRANSPORTE]: 750, [CUSTOS_FIXOS]: 1000 });
  });

  it("o lucro a dividir cai: 145,00, ou 72,50 para cada um", () => {
    expect(e.profitCents).toBe(14500);
    expect(e.distributableCents).toBe(14500);
    expect(e.joaoShareCents).toBe(7250);
    expect(e.fernandaShareCents).toBe(7250);
  });

  it("cada fundo acumula o que recebeu e mostra o saldo", () => {
    expect(conta(r, PROSPECCAO)).toMatchObject({ enteredCents: 1250, spentCents: 0, balanceCents: 1250, pctThisMonth: 5, enteredThisMonthCents: 1250 });
    expect(conta(r, CUSTOS_FIXOS).balanceCents).toBe(1000);
    expect(r.totals.fundsCents).toBe(3000);
  });

  it("a soma das partes continua fechando", () => {
    expect(r.check.fernandaPlusJoaoEqualsDistributable).toBe(true);
  });
});

describe("a % é por mês", () => {
  it("cada venda usa a % do mês da própria data; o passado não muda", () => {
    const regras = [regra(PROSPECCAO, 5, "2026-10-01")]; // só começa em outubro
    const r = computeCascade(
      SETTINGS,
      [venda(1, "2026-09-10", 10000), venda(2, "2026-10-10", 10000)],
      [],
      [],
      [],
      { funds: FUNDOS, rules: regras, today: HOJE }
    );
    expect(r.events[0].fundsCents[PROSPECCAO]).toBe(0);
    expect(r.events[1].fundsCents[PROSPECCAO]).toBe(500);
    expect(conta(r, PROSPECCAO).pctThisMonth).toBe(0); // hoje é setembro
    expect(conta(r, PROSPECCAO).enteredThisMonthCents).toBe(0);
    expect(conta(r, PROSPECCAO).enteredCents).toBe(500);
  });

  it("uma exceção de um mês volta sozinha à regra anterior", () => {
    const regras = [regra(PROSPECCAO, 5, "2026-09-01"), regra(PROSPECCAO, 8, "2026-10-01", "2026-10-01")];
    const r = computeCascade(
      SETTINGS,
      [venda(1, "2026-09-10", 10000), venda(2, "2026-10-10", 10000), venda(3, "2026-11-10", 10000)],
      [],
      [],
      [],
      { funds: FUNDOS, rules: regras, today: HOJE }
    );
    expect(r.events.map((e) => e.fundsCents[PROSPECCAO])).toEqual([500, 800, 500]);
  });
});

describe("despesa paga com fundo", () => {
  const regras = [regra(CUSTOS_FIXOS, 4, "2026-09-01")];
  const fundos = { funds: FUNDOS, rules: regras, today: HOJE };
  const V = venda(1, "2026-09-01", 25000); // custos fixos ficam com 1000

  it("o fundo paga o que tem; o resto vai para 'a compensar'", () => {
    const r = computeCascade(SETTINGS, [V], [], [despesa(1, "2026-09-02", 15000, CUSTOS_FIXOS)], [], fundos);
    const d = r.events.find((e) => e.kind === "despesa")!;
    expect(d.fundCoveredCents).toBe(1000);
    expect(d.carryAfterCents).toBe(14000);
    expect(conta(r, CUSTOS_FIXOS)).toMatchObject({ spentCents: 1000, balanceCents: 0 });
    expect(r.totals.expensesCents).toBe(15000);
    expect(r.totals.fundCoveredCents).toBe(1000);
  });

  it("com saldo de sobra, o fundo paga tudo e nada sai do lucro", () => {
    const r = computeCascade(SETTINGS, [V], [], [despesa(1, "2026-09-02", 600, CUSTOS_FIXOS)], [], fundos);
    const d = r.events.find((e) => e.kind === "despesa")!;
    expect(d.fundCoveredCents).toBe(600);
    expect(d.carryAfterCents).toBe(0);
    expect(conta(r, CUSTOS_FIXOS).balanceCents).toBe(400);
  });

  it("no mesmo dia, a despesa vem antes da venda: ainda não há saldo", () => {
    const r = computeCascade(SETTINGS, [V], [], [despesa(1, "2026-09-01", 600, CUSTOS_FIXOS)], [], fundos);
    const d = r.events.find((e) => e.kind === "despesa")!;
    expect(d.fundCoveredCents).toBe(0);
    expect(d.carryAfterCents).toBe(600);
  });

  it("despesa sem fundo continua saindo do lucro, como hoje", () => {
    const r = computeCascade(SETTINGS, [V], [], [despesa(1, "2026-09-02", 600, null)], [], fundos);
    const d = r.events.find((e) => e.kind === "despesa")!;
    expect(d.fundCoveredCents).toBe(0);
    expect(d.carryAfterCents).toBe(600);
  });

  it("o saldo nunca fica negativo, mesmo com duas despesas seguidas", () => {
    const r = computeCascade(
      SETTINGS,
      [V],
      [],
      [despesa(1, "2026-09-02", 800, CUSTOS_FIXOS), despesa(2, "2026-09-03", 800, CUSTOS_FIXOS)],
      [],
      fundos
    );
    const cobertos = r.events.filter((e) => e.kind === "despesa").map((e) => e.fundCoveredCents);
    expect(cobertos).toEqual([800, 200]);
    expect(conta(r, CUSTOS_FIXOS).balanceCents).toBe(0);
  });
});

describe("o que entra e o que não entra nos fundos", () => {
  const fundos = { funds: FUNDOS, rules: [regra(PROSPECCAO, 5, "2026-09-01")], today: HOJE };

  it("venda cancelada não separa nada", () => {
    const r = computeCascade(SETTINGS, [venda(1, "2026-09-01", 10000, { status: "cancelada" })], [], [], [], fundos);
    expect(r.events).toEqual([]);
    expect(conta(r, PROSPECCAO).enteredCents).toBe(0);
  });

  it("outra receita entra; aporte de sócio não entra", () => {
    const receitas: ReceiptInput[] = [
      { id: 1, kind: "outra_receita", status: "recebida", receivedDate: "2026-09-03", expectedDate: null, amountCents: 10000 },
      { id: 2, kind: "aporte_socio", status: "recebida", receivedDate: "2026-09-04", expectedDate: null, amountCents: 50000, partner: "joao" },
    ];
    const r = computeCascade(SETTINGS, [], [], [], receitas, fundos);
    expect(r.events).toHaveLength(1);
    expect(r.events[0].fundsCents[PROSPECCAO]).toBe(500);
    expect(r.events[0].profitCents).toBe(9500);
  });

  it("um fundo arquivado continua contando o passado", () => {
    const antigo = { id: 9, name: "Antigo", active: false };
    const r = computeCascade(
      SETTINGS,
      [venda(1, "2026-08-10", 10000)],
      [],
      [],
      [],
      { funds: [...FUNDOS, antigo], rules: [regra(9, 5, "2026-08-01", "2026-08-01")], today: HOJE }
    );
    expect(r.events[0].fundsCents[9]).toBe(500);
    expect(conta(r, 9)).toMatchObject({ enteredCents: 500, pctThisMonth: 0 });
  });
});

describe("regressão: sem fundos, nada muda", () => {
  const vendas = [venda(1, "2026-09-01", 25000), venda(2, "2026-09-05", 12000, { costsCents: 300 })];
  const despesas = [despesa(1, "2026-09-03", 700, null)];

  it("sem o parâmetro dos fundos, o resultado é o de sempre e os fundos ficam vazios", () => {
    const r = computeCascade(SETTINGS, vendas, [], despesas);
    expect(r.funds).toEqual([]);
    expect(r.totals.fundsCents).toBe(0);
    expect(r.totals.fundCoveredCents).toBe(0);
    expect(r.events.every((e) => Object.keys(e.fundsCents).length === 0)).toBe(true);
  });

  it("com fundos existindo, mas todos em 0%, os números são idênticos", () => {
    const sem = computeCascade(SETTINGS, vendas, [], despesas, [], SEM_FUNDOS);
    const zero = computeCascade(SETTINGS, vendas, [], despesas, [], { funds: FUNDOS, rules: [], today: HOJE });
    const campos = (r: typeof sem) =>
      r.events.map((e) => [e.key, e.baseCents, e.replenishCents, e.profitCents, e.distributableCents, e.joaoShareCents, e.fernandaShareCents, e.carryAfterCents, e.debtAfterCents]);
    expect(campos(zero)).toEqual(campos(sem));
    expect(zero.totals).toEqual(sem.totals);
    expect(zero.debt).toEqual(sem.debt);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/cascade-fundos.test.ts`
Expected: FAIL (`SEM_FUNDOS` não é exportado; falta o sexto parâmetro).

- [ ] **Step 3: Write the implementation**

Edit `lib/finance/cascade.ts`:

1. Trocar a primeira linha de importação. Old:
```ts
import { Cents, pctOf, roundDiv } from "./money";
```
New:
```ts
import { Cents, pctOf, roundDiv } from "./money";
import { mesDe, pctDoFundo, type Fundo, type FundRule } from "./funds";
```

2. Em `ExpenseInput`, acrescentar o fundo. Old:
```ts
export interface ExpenseInput {
  id: number;
  date: string;
  amountCents: Cents;
  description?: string | null;
}
```
New:
```ts
export interface ExpenseInput {
  id: number;
  date: string;
  amountCents: Cents;
  description?: string | null;
  fundId?: number | null; // fundo que paga esta despesa (o que faltar sai do lucro)
}
```

3. Logo depois de `ExpenseInput`, acrescentar os tipos dos fundos:
```ts
// Fundos do negócio (prospecção, transporte, custos fixos...): cada um separa uma % de toda entrada.
// Sem fundos (o padrão), a cascata é idêntica à de antes.
export interface FundsInput {
  funds: Fundo[]; // todos, inclusive arquivados (o passado deles continua contando)
  rules: FundRule[];
  today: string; // AAAA-MM-DD, para saber "este mês"
}

export const SEM_FUNDOS: FundsInput = { funds: [], rules: [], today: "1970-01-01" };

export interface FundAccount {
  fundId: number;
  enteredCents: Cents; // acumulado: tudo o que já foi separado para o fundo
  spentCents: Cents; // já pago por ele em despesas
  balanceCents: Cents; // entrou menos gasto
  pctThisMonth: number;
  enteredThisMonthCents: Cents;
}
```

4. Em `CascadeEvent`, depois de `replenishCents: Cents;` acrescentar:
```ts
  fundsCents: Record<number, Cents>; // quanto foi para cada fundo (por id do fundo); vazio nas despesas
```
e, depois de `expenseCents: Cents; // despesa da empresa lançada neste evento`, acrescentar:
```ts
  fundCoveredCents: Cents; // parte da despesa paga pelo fundo escolhido
```

5. Em `CascadeResult`, depois de `debt: { ... };` (o bloco inteiro do `debt`), acrescentar a linha:
```ts
  funds: FundAccount[]; // uma conta por fundo, na ordem em que vieram
```
e, dentro de `totals`, depois de `replenishCents: Cents;`, acrescentar:
```ts
    fundsCents: Cents; // total separado para os fundos
    fundCoveredCents: Cents; // total de despesas pagas por fundos
```

6. Em `RawEvent`, depois de `expenseCents: Cents;`, acrescentar:
```ts
  fundId?: number | null;
```

7. Na assinatura de `computeCascade`. Old:
```ts
  expenses: ExpenseInput[] = [],
  receipts: ReceiptInput[] = []
): CascadeResult {
```
New:
```ts
  expenses: ExpenseInput[] = [],
  receipts: ReceiptInput[] = [],
  funds: FundsInput = SEM_FUNDOS
): CascadeResult {
```

8. Na criação dos eventos de despesa (`raw.push` dentro de `for (const despesa of expenses)`), acrescentar `fundId: despesa.fundId ?? null,` logo depois de `expenseCents: despesa.amountCents,`.

9. Antes de `const events: CascadeEvent[] = [];`, acrescentar:
```ts
  const mesDeHoje = mesDe(funds.today);
  const contaDosFundos = new Map<number, { entrou: Cents; gasto: Cents; saldo: Cents; entrouNoMes: Cents }>();
  for (const f of funds.funds) contaDosFundos.set(f.id, { entrou: 0, gasto: 0, saldo: 0, entrouNoMes: 0 });
```

10. No laço `for (const e of raw)`. Old (do `let reposicao = 0;` até a linha `lucro = e.baseCents - reposicao - e.costsCents;`):
```ts
    let reposicao = 0;
    let lucro = 0;
    let compensado = 0;
    let perdaLevada = 0;
    let distribuivel = 0;

    if (e.kind === "despesa") {
      acompensar += e.expenseCents;
    } else {
      // Comissões e outras receitas usam o percentual de reposição do atacado (0% por padrão).
      const percentual =
        e.kind === "receita" || e.tier === "atacado"
          ? settings.wholesalePct
          : e.tier === "consignado"
            ? settings.consignmentPct
            : settings.retailPct;
      reposicao = pctOf(e.baseCents, percentual);
      lucro = e.baseCents - reposicao - e.costsCents;
```
New:
```ts
    let reposicao = 0;
    let lucro = 0;
    let compensado = 0;
    let perdaLevada = 0;
    let distribuivel = 0;
    let cobertoPeloFundo = 0;
    const paraOsFundos: Record<number, Cents> = {};

    if (e.kind === "despesa") {
      // O fundo escolhido paga primeiro, até onde tem saldo; o que faltar vai para "a compensar".
      const conta = e.fundId != null ? contaDosFundos.get(e.fundId) : undefined;
      if (conta) {
        cobertoPeloFundo = Math.min(conta.saldo, e.expenseCents);
        conta.saldo -= cobertoPeloFundo;
        conta.gasto += cobertoPeloFundo;
      }
      acompensar += e.expenseCents - cobertoPeloFundo;
    } else {
      // Comissões e outras receitas usam o percentual de reposição do atacado (0% por padrão).
      const percentual =
        e.kind === "receita" || e.tier === "atacado"
          ? settings.wholesalePct
          : e.tier === "consignado"
            ? settings.consignmentPct
            : settings.retailPct;
      reposicao = pctOf(e.baseCents, percentual);

      // Cada fundo separa a sua % (do mês da data do evento) do valor que entrou.
      const mesDoEvento = mesDe(e.date);
      let somaDosFundos = 0;
      for (const fundo of funds.funds) {
        const parte = pctOf(e.baseCents, pctDoFundo(funds.rules, fundo.id, mesDoEvento));
        paraOsFundos[fundo.id] = parte;
        somaDosFundos += parte;
        const conta = contaDosFundos.get(fundo.id)!;
        conta.entrou += parte;
        conta.saldo += parte;
        if (mesDoEvento === mesDeHoje) conta.entrouNoMes += parte;
      }
      lucro = e.baseCents - reposicao - somaDosFundos - e.costsCents;
```

11. No `events.push({ ... })`: depois de `replenishCents: reposicao,` acrescentar `fundsCents: paraOsFundos,` e depois de `expenseCents: e.expenseCents,` acrescentar `fundCoveredCents: cobertoPeloFundo,`.

12. No objeto `totals`, depois de `replenishCents: soma((e) => e.replenishCents),` acrescentar:
```ts
    fundsCents: soma((e) => Object.values(e.fundsCents).reduce((total, v) => total + v, 0)),
    fundCoveredCents: soma((e) => e.fundCoveredCents),
```

13. Depois de `totals.pendingCents = soldCents - totals.countedCents;`, acrescentar:
```ts
  const fundAccounts: FundAccount[] = funds.funds.map((f) => {
    const c = contaDosFundos.get(f.id)!;
    return {
      fundId: f.id,
      enteredCents: c.entrou,
      spentCents: c.gasto,
      balanceCents: c.saldo,
      pctThisMonth: pctDoFundo(funds.rules, f.id, mesDeHoje),
      enteredThisMonthCents: c.entrouNoMes,
    };
  });
```

14. No `return { events, totals, debt, check: ..., warnings }` do fim da função, acrescentar `funds: fundAccounts,` logo depois de `debt,`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/cascade-fundos.test.ts tests/unit/cascade.test.ts`
Expected: PASS nos dois arquivos (o segundo prova a regressão: os testes antigos da cascata passam sem alteração).
Run: `npx tsc --noEmit`
Expected: sem erros (se `tests/unit/*` ou outro código monta um `CascadeEvent` à mão e reclamar de campo faltando, acrescente `fundsCents: {}` e `fundCoveredCents: 0` ali).

- [ ] **Step 5: Commit**

```bash
git add lib/finance/cascade.ts tests/unit/cascade-fundos.test.ts
git commit -m "Fundos: a cascata separa a % de cada fundo e deixa o fundo pagar despesas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: Migração 016 e acesso ao banco (`lib/funds-db.ts`)

**Files:**
- Modify: `lib/migrations.ts` (acrescentar a migração `"016"` no fim da lista `MIGRATIONS`)
- Create: `lib/funds-db.ts`
- Modify: `tests/db/store.db.test.ts` (linha que lista as migrações novas)
- Test: `tests/db/funds.db.test.ts`

**Interfaces:**
- Consumes: `Fundo`, `FundRule`, `MesISO` (Task 1); `Quem` de `lib/audit.ts` (`{ id: number | null; name: string | null }`); `comQuem` de `lib/audit.ts`.
- Produces (usados nas tarefas 4, 5, 6, 7, 8):
  - `interface FundoSalvo extends Fundo { description: string | null; position: number }`
  - `interface RegraSalva extends FundRule { createdByName: string | null }`
  - `listarFundos(db): Promise<FundoSalvo[]>` (ordem `position, id`, inclui arquivados)
  - `listarRegras(db): Promise<RegraSalva[]>` (mais nova primeiro)
  - `criarFundo(db, nome: string, descricao: string | null): Promise<number>` (falha com `code === "23505"` se o nome repetir)
  - `mudarFundo(db, id: number, campos: { name?: string; description?: string | null; active?: boolean }): Promise<boolean>`
  - `criarRegraDeFundo(db, r: { fundId: number; pct: number; fromMonth: MesISO; toMonth: MesISO | null }, quem: Quem): Promise<number>`
  - `apagarRegraDeFundo(db, id: number): Promise<boolean>`
  - `fundoDisponivel(db, id: number): Promise<boolean>` (existe e está ativo)
  - `fundoExiste(db, id: number): Promise<boolean>`

- [ ] **Step 1: Write the failing test**

Create `tests/db/funds.db.test.ts`:

```ts
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { comQuem } from "../../lib/audit";
import {
  apagarRegraDeFundo,
  criarFundo,
  criarRegraDeFundo,
  fundoDisponivel,
  fundoExiste,
  listarFundos,
  listarRegras,
  mudarFundo,
} from "../../lib/funds-db";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const JOAO = { id: 1, name: "João" };

describe.skipIf(!disponivel)("fundos no banco (migração 016)", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;

  beforeAll(async () => {
    const banco = await criarBancoDescartavel();
    pool = banco.pool;
    apagar = banco.apagar;
    await runMigrations(pool);
  });
  afterAll(async () => {
    await apagar?.();
  });
  beforeEach(async () => {
    await pool.query(`DELETE FROM fund_rules`);
    await pool.query(`DELETE FROM expenses`);
    await pool.query(`DELETE FROM funds WHERE position > 7`); // fundos criados pelos testes
    await pool.query(`DELETE FROM change_log`); // por último: as exclusões acima também entram no histórico
  });

  const idDe = async (nome: string) => (await pool.query(`SELECT id FROM funds WHERE name = $1`, [nome])).rows[0].id as number;

  it("a migração 016 cria os 7 fundos, em ordem, todos ativos", async () => {
    const fundos = await listarFundos(pool);
    expect(fundos.map((f) => f.name)).toEqual(["Prospecção", "Transporte", "Custos fixos", "Digital", "Tráfego pago", "Embalagens", "Frete"]);
    expect(fundos.every((f) => f.active)).toBe(true);
    expect((await pool.query(`SELECT id FROM schema_migrations WHERE id = '016'`)).rowCount).toBe(1);
    expect(fundos.find((f) => f.name === "Custos fixos")?.description).toContain("MEI");
  });

  it("rodar a migração de novo não duplica os fundos", async () => {
    expect(await runMigrations(pool)).toEqual([]);
    expect((await listarFundos(pool)).length).toBe(7);
  });

  it("regras: mês sempre no dia 1, % de 0 a 100, fim não antes do começo", async () => {
    const f = await idDe("Frete");
    const inserir = (pct: number, de: string, ate: string | null) =>
      pool.query(`INSERT INTO fund_rules (fund_id, pct, from_month, to_month) VALUES ($1, $2, $3, $4)`, [f, pct, de, ate]);
    await expect(inserir(5, "2026-09-01", null)).resolves.toBeDefined();
    await expect(inserir(5, "2026-09-15", null)).rejects.toThrow();
    await expect(inserir(101, "2026-09-01", null)).rejects.toThrow();
    await expect(inserir(-1, "2026-09-01", null)).rejects.toThrow();
    await expect(inserir(5, "2026-09-01", "2026-08-01")).rejects.toThrow();
    await expect(inserir(5, "2026-09-01", "2026-10-15")).rejects.toThrow();
    await expect(inserir(5, "2026-09-01", "2026-09-01")).resolves.toBeDefined();
  });

  it("o nome do fundo não repete, nem com maiúscula diferente", async () => {
    await criarFundo(pool, "Feiras", null);
    await expect(criarFundo(pool, "  FEIRAS ", null)).rejects.toMatchObject({ code: "23505" });
  });

  it("criar fundo vai para o fim da lista; renomear e arquivar", async () => {
    const id = await criarFundo(pool, "Feiras", "Barracas e eventos");
    const criado = (await listarFundos(pool)).find((f) => f.id === id)!;
    expect(criado).toMatchObject({ name: "Feiras", description: "Barracas e eventos", active: true, position: 8 });

    expect(await mudarFundo(pool, id, { name: "Feiras e eventos", description: null })).toBe(true);
    expect(await mudarFundo(pool, id, { active: false })).toBe(true);
    const depois = (await listarFundos(pool)).find((f) => f.id === id)!;
    expect(depois).toMatchObject({ name: "Feiras e eventos", description: null, active: false });
    expect(await mudarFundo(pool, 999999, { name: "x" })).toBe(false);
  });

  it("fundoDisponivel: existe e está ativo; fundoExiste: só existir", async () => {
    const id = await criarFundo(pool, "Feiras", null);
    expect(await fundoDisponivel(pool, id)).toBe(true);
    await mudarFundo(pool, id, { active: false });
    expect(await fundoDisponivel(pool, id)).toBe(false);
    expect(await fundoExiste(pool, id)).toBe(true);
    expect(await fundoExiste(pool, 999999)).toBe(false);
  });

  it("criar e listar regras (a mais nova primeiro), com quem criou", async () => {
    const f = await idDe("Prospecção");
    const a = await criarRegraDeFundo(pool, { fundId: f, pct: 5, fromMonth: "2026-09-01", toMonth: null }, JOAO);
    const b = await criarRegraDeFundo(pool, { fundId: f, pct: 8, fromMonth: "2026-10-01", toMonth: "2026-10-01" }, { id: 2, name: "Fernanda" });
    const regras = await listarRegras(pool);
    expect(regras.map((r) => r.id)).toEqual([b, a]);
    expect(regras[1]).toMatchObject({ fundId: f, pct: 5, fromMonth: "2026-09-01", toMonth: null, createdByName: "João" });
    expect(regras[0]).toMatchObject({ pct: 8, toMonth: "2026-10-01", createdByName: "Fernanda" });
    expect(typeof regras[0].createdAt).toBe("string");
    expect(new Date(regras[0].createdAt).toString()).not.toBe("Invalid Date");
  });

  it("despesa pode apontar para um fundo (e continua sem, como antes)", async () => {
    const f = await idDe("Custos fixos");
    await pool.query(`INSERT INTO expenses (expense_date, description, amount, fund_id) VALUES ('2026-09-05', 'Contador', 150, $1)`, [f]);
    await pool.query(`INSERT INTO expenses (expense_date, description, amount) VALUES ('2026-09-06', 'Frete', 30)`);
    const { rows } = await pool.query(`SELECT description, fund_id FROM expenses ORDER BY id`);
    expect(rows).toEqual([
      { description: "Contador", fund_id: f },
      { description: "Frete", fund_id: null },
    ]);
    await expect(pool.query(`INSERT INTO expenses (expense_date, description, amount, fund_id) VALUES ('2026-09-05', 'x', 1, 999999)`)).rejects.toThrow();
  });

  it("apagar uma regra registra no histórico com o nome de quem apagou", async () => {
    const f = await idDe("Digital");
    const id = await criarRegraDeFundo(pool, { fundId: f, pct: 3, fromMonth: "2026-09-01", toMonth: null }, JOAO);
    expect(await comQuem(pool, JOAO, (c) => apagarRegraDeFundo(c, id))).toBe(true);
    expect(await apagarRegraDeFundo(pool, id)).toBe(false); // já não existe
    const { rows } = await pool.query(`SELECT table_name, op, user_name FROM change_log WHERE table_name = 'fund_rules'`);
    expect(rows).toEqual([{ table_name: "fund_rules", op: "DELETE", user_name: "João" }]);
  });

  it("renomear um fundo fica no histórico", async () => {
    const id = await criarFundo(pool, "Feiras", null);
    await comQuem(pool, JOAO, (c) => mudarFundo(c, id, { name: "Feiras e eventos" }));
    const { rows } = await pool.query(`SELECT table_name, op FROM change_log WHERE table_name = 'funds'`);
    expect(rows).toEqual([{ table_name: "funds", op: "UPDATE" }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker start radar-teste-db` (se o container não estiver ligado) e depois `npx vitest run tests/db/funds.db.test.ts`
Expected: FAIL (`lib/funds-db` não existe).

- [ ] **Step 3: Write the implementation**

3a. Em `lib/migrations.ts`, acrescente a migração no fim do array `MIGRATIONS`. Old (o final do array, depois da migração `"015"`):
```ts
      \`CREATE TABLE IF NOT EXISTS change_undo (
```
Localize o bloco `id: "015"` inteiro e, logo depois do `},` que fecha esse objeto e antes do `];` que fecha o array, insira:

```ts
  {
    id: "016",
    name: "fundos do negocio: lista de fundos, regras de porcentagem por mes e fundo da despesa",
    statements: [
      // Cada fundo separa uma % de toda entrada que entra na divisao. Nunca e apagado, so arquivado.
      `CREATE TABLE IF NOT EXISTS funds (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL CHECK (btrim(name) <> ''),
        description TEXT,
        position INT NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS funds_nome_idx ON funds (lower(btrim(name)))`,
      `INSERT INTO funds (name, description, position) VALUES
        ('Prospecção', 'Conquistar clientes novos', 1),
        ('Transporte', 'Deslocamento: viagens, motoboy, transporte por aplicativo', 2),
        ('Custos fixos', 'Aplicativos, MEI e contador', 3),
        ('Digital', 'Custos digitais. Os aplicativos ficam em Custos fixos', 4),
        ('Tráfego pago', 'Anúncios pagos', 5),
        ('Embalagens', 'Caixas, sacolas e materiais de embalagem', 6),
        ('Frete', 'Envio para o cliente (Correios, Melhor Envio). Diferente de Transporte', 7)
        ON CONFLICT ((lower(btrim(name)))) DO NOTHING`,
      // Cada mudanca de % vira uma regra: vale do mes de inicio ao mes de fim (nulo = sem fim).
      // No mes M vale a regra mais recente (created_at) entre as que cobrem M.
      `CREATE TABLE IF NOT EXISTS fund_rules (
        id SERIAL PRIMARY KEY,
        fund_id INT NOT NULL REFERENCES funds(id),
        pct NUMERIC(5,2) NOT NULL CHECK (pct BETWEEN 0 AND 100),
        from_month DATE NOT NULL CHECK (EXTRACT(DAY FROM from_month) = 1),
        to_month DATE CHECK (to_month IS NULL OR (EXTRACT(DAY FROM to_month) = 1 AND to_month >= from_month)),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_by_id INT,
        created_by_name TEXT
      )`,
      `CREATE INDEX IF NOT EXISTS fund_rules_fund_idx ON fund_rules (fund_id, from_month)`,
      // Qual fundo pagou a despesa (vazio = sai do lucro, como sempre foi).
      `ALTER TABLE expenses ADD COLUMN IF NOT EXISTS fund_id INT REFERENCES funds(id)`,
      // Historico de alteracoes (a funcao log_change ja existe desde a migracao 014).
      `DROP TRIGGER IF EXISTS funds_log ON funds`,
      `CREATE TRIGGER funds_log AFTER UPDATE OR DELETE ON funds FOR EACH ROW EXECUTE FUNCTION log_change()`,
      `DROP TRIGGER IF EXISTS fund_rules_log ON fund_rules`,
      `CREATE TRIGGER fund_rules_log AFTER UPDATE OR DELETE ON fund_rules FOR EACH ROW EXECUTE FUNCTION log_change()`,
    ],
  },
```

3b. Em `tests/db/store.db.test.ts`, trocar a expectativa. Old:
```ts
        expect(await runMigrations(banco.pool)).toEqual(["011", "012", "013", "014", "015"]);
```
New:
```ts
        expect(await runMigrations(banco.pool)).toEqual(["011", "012", "013", "014", "015", "016"]);
```

3c. Create `lib/funds-db.ts`:

```ts
import type { Pool, PoolClient } from "pg";
import type { Quem } from "./audit";
import type { Fundo, FundRule, MesISO } from "./finance/funds";

// Fundos do negócio: as consultas ao banco. As regras (o que vale) ficam em lib/finance/funds.ts.

type Consulta = Pick<Pool | PoolClient, "query">;

export interface FundoSalvo extends Fundo {
  description: string | null;
  position: number;
}

export interface RegraSalva extends FundRule {
  createdByName: string | null;
}

/** Todos os fundos, na ordem da tela, inclusive os arquivados. */
export async function listarFundos(db: Consulta): Promise<FundoSalvo[]> {
  const { rows } = await db.query(`SELECT id, name, description, position, active FROM funds ORDER BY position, id`);
  return rows.map((r) => ({ id: r.id, name: r.name, description: r.description, position: r.position, active: r.active }));
}

/** Todas as regras, a mais nova primeiro. */
export async function listarRegras(db: Consulta): Promise<RegraSalva[]> {
  const { rows } = await db.query(
    `SELECT id, fund_id, pct, to_char(from_month, 'YYYY-MM-DD') AS from_month, to_char(to_month, 'YYYY-MM-DD') AS to_month,
            created_at, created_by_name
       FROM fund_rules ORDER BY created_at DESC, id DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    fundId: r.fund_id,
    pct: Number(r.pct),
    fromMonth: r.from_month,
    toMonth: r.to_month,
    createdAt: new Date(r.created_at).toISOString(),
    createdByName: r.created_by_name,
  }));
}

/** Cria um fundo no fim da lista. Nome repetido dá erro do Postgres com code 23505. */
export async function criarFundo(db: Consulta, nome: string, descricao: string | null): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO funds (name, description, position)
     VALUES ($1, $2, COALESCE((SELECT max(position) FROM funds), 0) + 1) RETURNING id`,
    [nome, descricao]
  );
  return rows[0].id;
}

/** Renomeia, muda a descrição e/ou arquiva. Só muda o que veio. false = o fundo não existe. */
export async function mudarFundo(
  db: Consulta,
  id: number,
  campos: { name?: string; description?: string | null; active?: boolean }
): Promise<boolean> {
  const sets: string[] = [];
  const valores: unknown[] = [];
  if (campos.name !== undefined) {
    valores.push(campos.name);
    sets.push(`name = $${valores.length}`);
  }
  if (campos.description !== undefined) {
    valores.push(campos.description);
    sets.push(`description = $${valores.length}`);
  }
  if (campos.active !== undefined) {
    valores.push(campos.active);
    sets.push(`active = $${valores.length}`);
  }
  if (sets.length === 0) return fundoExiste(db, id);
  valores.push(id);
  const { rowCount } = await db.query(`UPDATE funds SET ${sets.join(", ")} WHERE id = $${valores.length}`, valores);
  return (rowCount ?? 0) > 0;
}

export async function criarRegraDeFundo(
  db: Consulta,
  r: { fundId: number; pct: number; fromMonth: MesISO; toMonth: MesISO | null },
  quem: Quem
): Promise<number> {
  const { rows } = await db.query(
    `INSERT INTO fund_rules (fund_id, pct, from_month, to_month, created_by_id, created_by_name)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [r.fundId, r.pct, r.fromMonth, r.toMonth, quem.id, quem.name]
  );
  return rows[0].id;
}

/** Apaga uma regra (a anterior volta a valer nos meses em comum). false = não existia. */
export async function apagarRegraDeFundo(db: Consulta, id: number): Promise<boolean> {
  const { rowCount } = await db.query(`DELETE FROM fund_rules WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

/** O fundo existe e está ativo (só esses aparecem para escolher numa despesa ou numa regra nova). */
export async function fundoDisponivel(db: Consulta, id: number): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM funds WHERE id = $1 AND active`, [id]);
  return rows.length > 0;
}

export async function fundoExiste(db: Consulta, id: number): Promise<boolean> {
  const { rows } = await db.query(`SELECT 1 FROM funds WHERE id = $1`, [id]);
  return rows.length > 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/db/funds.db.test.ts tests/db/store.db.test.ts`
Expected: PASS nos dois (o segundo confirma que a lista de migrações agora termina em 016 e que `loja_leitura` continua sem ler nada novo).
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/migrations.ts lib/funds-db.ts tests/db/funds.db.test.ts tests/db/store.db.test.ts
git commit -m "Fundos: migração 016 (fundos, regras por mês, fundo da despesa) e acesso ao banco

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Despesa com fundo (leitura do corpo e API de despesas)

**Files:**
- Modify: `lib/expenses.ts` (`ExpenseBody` e `parseExpenseBody`)
- Modify: `tests/unit/expenses.test.ts` (o teste que compara o objeto inteiro)
- Modify: `app/api/expenses/route.ts` (GET e POST)
- Modify: `app/api/expenses/[id]/route.ts` (PATCH)
- Test: `tests/unit/expenses-fundo.test.ts`

**Interfaces:**
- Consumes: `fundoDisponivel`, `fundoExiste` (Task 3).
- Produces: `parseExpenseBody` devolve também `fundId: number | null`; a API de despesas aceita `fund_id` e devolve `fund_id` e `fund_name` no GET.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/expenses-fundo.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseExpenseBody } from "../../lib/expenses";

const BASE = { expense_date: "2026-09-12", description: "Contador", amount: "150" };

describe("despesa com fundo", () => {
  it("sem fundo é nulo (como sempre foi)", () => {
    expect(parseExpenseBody(BASE)).toMatchObject({ ok: true, fundId: null });
    expect(parseExpenseBody({ ...BASE, fund_id: "" })).toMatchObject({ ok: true, fundId: null });
    expect(parseExpenseBody({ ...BASE, fund_id: null })).toMatchObject({ ok: true, fundId: null });
  });

  it("aceita o número do fundo, como texto ou número", () => {
    expect(parseExpenseBody({ ...BASE, fund_id: 3 })).toMatchObject({ ok: true, fundId: 3 });
    expect(parseExpenseBody({ ...BASE, fund_id: "3" })).toMatchObject({ ok: true, fundId: 3 });
  });

  it("recusa fundo que não é um número inteiro maior que zero", () => {
    for (const ruim of ["abc", "0", "-2", "1.5", {}]) {
      expect(parseExpenseBody({ ...BASE, fund_id: ruim })).toMatchObject({ ok: false, error: "invalid_fund" });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/expenses-fundo.test.ts`
Expected: FAIL (`fundId` não existe no resultado).

- [ ] **Step 3: Write the implementation**

3a. Em `lib/expenses.ts`. Old:
```ts
export type ExpenseBody =
  | { ok: true; date: string; description: string; category: string | null; amount: number; notes: string | null }
  | { ok: false; error: string; message: string };
```
New:
```ts
export type ExpenseBody =
  | { ok: true; date: string; description: string; category: string | null; amount: number; notes: string | null; fundId: number | null }
  | { ok: false; error: string; message: string };
```
Old (o `return` do fim de `parseExpenseBody`):
```ts
  return { ok: true, date, description, category: texto(body.category), amount, notes: texto(body.notes) };
```
New:
```ts
  const fundoBruto = body.fund_id;
  let fundId: number | null = null;
  if (fundoBruto !== undefined && fundoBruto !== null && fundoBruto !== "") {
    const n = typeof fundoBruto === "number" || typeof fundoBruto === "string" ? Number(fundoBruto) : NaN;
    if (!Number.isInteger(n) || n <= 0) {
      return { ok: false, error: "invalid_fund", message: "Escolha um fundo válido ou deixe em branco." };
    }
    fundId = n;
  }
  return { ok: true, date, description, category: texto(body.category), amount, notes: texto(body.notes), fundId };
```

3b. Em `tests/unit/expenses.test.ts`, o teste que compara o objeto inteiro precisa do campo novo. Old:
```ts
      amount: 150.5,
      notes: null,
    });
```
New:
```ts
      amount: 150.5,
      notes: null,
      fundId: null,
    });
```

3c. Em `app/api/expenses/route.ts`:
- Acrescentar a importação: `import { fundoDisponivel } from "@/lib/funds-db";`
- No `GET`, trocar a consulta. Old:
```ts
      `SELECT e.id, to_char(e.expense_date, 'YYYY-MM-DD') AS expense_date, e.description, e.category,
              e.amount, e.notes, p.invoice_id, ci.description AS invoice_description
         FROM expenses e
         LEFT JOIN card_invoice_parts p ON p.expense_id = e.id
         LEFT JOIN card_invoices ci ON ci.id = p.invoice_id
        ORDER BY e.expense_date DESC, e.id DESC`
```
New:
```ts
      `SELECT e.id, to_char(e.expense_date, 'YYYY-MM-DD') AS expense_date, e.description, e.category,
              e.amount, e.notes, e.fund_id, f.name AS fund_name, p.invoice_id, ci.description AS invoice_description
         FROM expenses e
         LEFT JOIN funds f ON f.id = e.fund_id
         LEFT JOIN card_invoice_parts p ON p.expense_id = e.id
         LEFT JOIN card_invoices ci ON ci.id = p.invoice_id
        ORDER BY e.expense_date DESC, e.id DESC`
```
- No `POST`. Old:
```ts
    await ensureSchema();
    const { rows } = await db.query(
      `INSERT INTO expenses (expense_date, description, category, amount, notes)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [dados.date, dados.description, dados.category, dados.amount, dados.notes]
    );
```
New:
```ts
    await ensureSchema();
    if (dados.fundId !== null && !(await fundoDisponivel(db, dados.fundId))) {
      return NextResponse.json({ error: "invalid_fund", message: "Esse fundo não existe ou está arquivado." }, { status: 400 });
    }
    const { rows } = await db.query(
      `INSERT INTO expenses (expense_date, description, category, amount, notes, fund_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [dados.date, dados.description, dados.category, dados.amount, dados.notes, dados.fundId]
    );
```

3d. Em `app/api/expenses/[id]/route.ts`:
- Acrescentar a importação: `import { fundoDisponivel, fundoExiste } from "@/lib/funds-db";`
- No `PATCH`, trocar o `UPDATE`. Old:
```ts
    const { rowCount } = await comoUsuario(db, await quemFez()).query(
      `UPDATE expenses SET expense_date = $1, description = $2, category = $3, amount = $4, notes = $5 WHERE id = $6`,
      [dados.date, dados.description, dados.category, dados.amount, dados.notes, id]
    );
```
New:
```ts
    if (dados.fundId !== null) {
      // Manter um fundo já arquivado que a despesa tinha é permitido; escolher um arquivado agora não.
      const { rows: atual } = await db.query(`SELECT fund_id FROM expenses WHERE id = $1`, [id]);
      const mesmoDeAntes = atual.length > 0 && atual[0].fund_id === dados.fundId;
      const valido = mesmoDeAntes ? await fundoExiste(db, dados.fundId) : await fundoDisponivel(db, dados.fundId);
      if (!valido) {
        return NextResponse.json({ error: "invalid_fund", message: "Esse fundo não existe ou está arquivado." }, { status: 400 });
      }
    }
    const { rowCount } = await comoUsuario(db, await quemFez()).query(
      `UPDATE expenses SET expense_date = $1, description = $2, category = $3, amount = $4, notes = $5, fund_id = $6 WHERE id = $7`,
      [dados.date, dados.description, dados.category, dados.amount, dados.notes, dados.fundId, id]
    );
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/expenses-fundo.test.ts tests/unit/expenses.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/expenses.ts tests/unit/expenses.test.ts tests/unit/expenses-fundo.test.ts app/api/expenses/route.ts "app/api/expenses/[id]/route.ts"
git commit -m "Fundos: a despesa pode escolher o fundo que paga (leitura do corpo e API)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: Liga o motor ao banco (`load.ts` e resumo financeiro)

**Files:**
- Modify: `lib/finance/load.ts` (`FinanceInputs`, `loadFinanceInputs`, `summarize`)
- Test: `tests/db/funds-summary.db.test.ts`

**Interfaces:**
- Consumes: `computeCascade` com o parâmetro `funds` (Task 2); `listarFundos`, `listarRegras`, `criarRegraDeFundo` (Task 3).
- Produces: `FinanceInputs.funds: Fundo[]` e `FinanceInputs.fundRules: FundRule[]`; `ExpenseInput.fundId` preenchido pelo `loadFinanceInputs`; `summarize(...).cascade.funds` e `getFinanceSummary(db).cascade.funds` com as contas de cada fundo.

- [ ] **Step 1: Write the failing test**

Create `tests/db/funds-summary.db.test.ts`:

```ts
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { criarRegraDeFundo } from "../../lib/funds-db";
import { loadFinanceInputs, summarize } from "../../lib/finance/load";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();
const JOAO = { id: 1, name: "João" };

describe.skipIf(!disponivel)("fundos no resumo financeiro (do banco até as contas)", () => {
  let pool: Pool;
  let apagar: () => Promise<void>;

  beforeAll(async () => {
    const banco = await criarBancoDescartavel();
    pool = banco.pool;
    apagar = banco.apagar;
    await runMigrations(pool);
  });
  afterAll(async () => {
    await apagar?.();
  });
  beforeEach(async () => {
    await pool.query(`DELETE FROM fund_rules`);
    await pool.query(`DELETE FROM expenses`);
    await pool.query(`DELETE FROM sales`);
  });

  const idDe = async (nome: string) => (await pool.query(`SELECT id FROM funds WHERE name = $1`, [nome])).rows[0].id as number;

  it("uma venda de R$ 250 com regras nos fundos separa e reduz o lucro a dividir", async () => {
    await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-09-01', 'Kika', 250)`);
    const prospeccao = await idDe("Prospecção");
    const custos = await idDe("Custos fixos");
    await criarRegraDeFundo(pool, { fundId: prospeccao, pct: 5, fromMonth: "2026-09-01", toMonth: null }, JOAO);
    await criarRegraDeFundo(pool, { fundId: custos, pct: 4, fromMonth: "2026-09-01", toMonth: null }, JOAO);

    const resumo = summarize(await loadFinanceInputs(pool), { today: "2026-09-15" });
    const e = resumo.cascade.events[0];
    expect(e.replenishCents).toBe(7500); // 30% do acordo padrão
    expect(e.fundsCents[prospeccao]).toBe(1250);
    expect(e.fundsCents[custos]).toBe(1000);
    expect(e.distributableCents).toBe(15250); // 25000 - 7500 - 1250 - 1000
    const conta = resumo.cascade.funds.find((f) => f.fundId === prospeccao)!;
    expect(conta).toMatchObject({ enteredCents: 1250, balanceCents: 1250, pctThisMonth: 5 });
    expect(resumo.cascade.funds).toHaveLength(7); // um por fundo, mesmo os que estão em 0%
  });

  it("uma despesa com fundo é paga por ele e o resto sai do lucro", async () => {
    await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-09-01', 'Kika', 250)`);
    const custos = await idDe("Custos fixos");
    await criarRegraDeFundo(pool, { fundId: custos, pct: 4, fromMonth: "2026-09-01", toMonth: null }, JOAO);
    await pool.query(`INSERT INTO expenses (expense_date, description, amount, fund_id) VALUES ('2026-09-02', 'Contador', 150, $1)`, [custos]);

    const resumo = summarize(await loadFinanceInputs(pool), { today: "2026-09-15" });
    const d = resumo.cascade.events.find((ev) => ev.kind === "despesa")!;
    expect(d.fundCoveredCents).toBe(1000); // o fundo só tinha R$ 10,00
    expect(d.carryAfterCents).toBe(14000);
    expect(resumo.cascade.funds.find((f) => f.fundId === custos)).toMatchObject({ spentCents: 1000, balanceCents: 0 });
  });

  it("sem nenhuma regra, os números são os de sempre", async () => {
    await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-09-01', 'Kika', 250)`);
    const resumo = summarize(await loadFinanceInputs(pool), { today: "2026-09-15" });
    expect(resumo.cascade.events[0].distributableCents).toBe(17500); // 25000 - 7500
    expect(resumo.cascade.totals.fundsCents).toBe(0);
  });

  it("um fundo arquivado continua entrando na conta dos meses em que teve regra", async () => {
    await pool.query(`INSERT INTO sales (sale_date, client_name, sale_value) VALUES ('2026-08-10', 'Kika', 100)`);
    const digital = await idDe("Digital");
    await criarRegraDeFundo(pool, { fundId: digital, pct: 5, fromMonth: "2026-08-01", toMonth: "2026-08-01" }, JOAO);
    await pool.query(`UPDATE funds SET active = false WHERE id = $1`, [digital]);
    const resumo = summarize(await loadFinanceInputs(pool), { today: "2026-09-15" });
    expect(resumo.cascade.funds.find((f) => f.fundId === digital)).toMatchObject({ enteredCents: 500, pctThisMonth: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/funds-summary.db.test.ts`
Expected: FAIL (`resumo.cascade.funds` vem vazio; `fundsCents` não tem os ids).

- [ ] **Step 3: Write the implementation**

Edit `lib/finance/load.ts`:

1. Acrescentar as importações no topo, junto das outras:
```ts
import type { Fundo, FundRule } from "./funds";
```

2. Em `interface FinanceInputs`, depois de `invoiceParts: InvoicePartInput[];`, acrescentar:
```ts
  funds: Fundo[]; // todos os fundos, inclusive arquivados
  fundRules: FundRule[];
```

3. Em `loadFinanceInputs`, trocar a lista de resultados e acrescentar as consultas. Old:
```ts
  const [ajustes, vendas, parcelas, recebimentos, despesas, compras, pagFundo, contas, pagContas, faturas, partesFatura] =
    await Promise.all([
```
New:
```ts
  const [ajustes, vendas, parcelas, recebimentos, despesas, compras, pagFundo, contas, pagContas, faturas, partesFatura, fundos, regrasDeFundo] =
    await Promise.all([
```
Old (a consulta das despesas):
```ts
      db.query(`SELECT id, ${DIA("expense_date")} AS expense_date, description, amount FROM expenses ORDER BY expense_date, id`),
```
New:
```ts
      db.query(`SELECT id, ${DIA("expense_date")} AS expense_date, description, amount, fund_id FROM expenses ORDER BY expense_date, id`),
```
Old (a última consulta da lista, a das partes da fatura):
```ts
      db.query(`SELECT id, invoice_id, nature, amount, description FROM card_invoice_parts ORDER BY id`),
    ]);
```
New:
```ts
      db.query(`SELECT id, invoice_id, nature, amount, description FROM card_invoice_parts ORDER BY id`),
      db.query(`SELECT id, name, active FROM funds ORDER BY position, id`),
      db.query(
        `SELECT id, fund_id, pct, ${DIA("from_month")} AS from_month, ${DIA("to_month")} AS to_month, created_at
           FROM fund_rules ORDER BY id`
      ),
    ]);
```

4. No `return { ... }` de `loadFinanceInputs`: Old (o mapeamento das despesas):
```ts
    expenses: despesas.rows.map((d) => ({
      id: d.id,
      date: d.expense_date,
      amountCents: toCents(d.amount),
      description: d.description,
    })),
```
New:
```ts
    expenses: despesas.rows.map((d) => ({
      id: d.id,
      date: d.expense_date,
      amountCents: toCents(d.amount),
      description: d.description,
      fundId: d.fund_id,
    })),
```
E, no fim do mesmo objeto retornado, depois do mapeamento `invoiceParts: ...,`, acrescentar:
```ts
    funds: fundos.rows.map((f) => ({ id: f.id, name: f.name, active: f.active })),
    fundRules: regrasDeFundo.rows.map((r) => ({
      id: r.id,
      fundId: r.fund_id,
      pct: Number(r.pct),
      fromMonth: r.from_month,
      toMonth: r.to_month,
      createdAt: new Date(r.created_at).toISOString(),
    })),
```

5. Em `summarize`. Old:
```ts
  const cascade = computeCascade(inputs.settings, inputs.sales, inputs.joaoPayments, inputs.expenses, inputs.receipts);
```
New:
```ts
  const cascade = computeCascade(inputs.settings, inputs.sales, inputs.joaoPayments, inputs.expenses, inputs.receipts, {
    funds: inputs.funds,
    rules: inputs.fundRules,
    today: hoje,
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/db/funds-summary.db.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: sem erros. Se algum outro arquivo monta um `FinanceInputs` à mão e reclamar, acrescente `funds: []` e `fundRules: []` ali.
Run: `npx vitest run tests/unit tests/db/acceptance.db.test.ts`
Expected: PASS (nada do que já existia mudou).

- [ ] **Step 5: Commit**

```bash
git add lib/finance/load.ts tests/db/funds-summary.db.test.ts
git commit -m "Fundos: o resumo financeiro lê fundos, regras e o fundo de cada despesa

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: API de fundos e histórico de alterações

**Files:**
- Create: `app/api/funds/route.ts`, `app/api/funds/[id]/route.ts`, `app/api/funds/rules/route.ts`, `app/api/funds/rules/[id]/route.ts`
- Modify: `lib/change-log.ts` (nomes, tipo, títulos e rótulos)
- Test: acrescentar casos em `tests/unit/change-log.test.ts`

**Interfaces:**
- Consumes: `listarFundos`, `listarRegras`, `criarFundo`, `mudarFundo`, `criarRegraDeFundo`, `apagarRegraDeFundo`, `fundoDisponivel` (Task 3); `validarRegra`, `podeArquivar`, `validarNomeDoFundo`, `periodoDaOpcao`, `OPCOES_DE_QUANDO` (Task 1); `getFinanceSummary` (Task 5); `lerAcordo` de `lib/agreement-db.ts`; `todayBR` de `lib/finance/dates.ts`; `quemFez` de `lib/audit-request.ts`; `comoUsuario` de `lib/audit.ts`; `readMoneyOrNull` de `lib/store-rules.ts`.
- Produces: rotas usadas pelas telas (tarefas 8 e 9):
  - `GET /api/funds` → `{ hoje: string, reposicaoMaxima: number, fundos: FundoNaTela[], regras: RegraSalva[] }` onde `FundoNaTela = { id, name, description, active, position, pctThisMonth, enteredCents, spentCents, balanceCents, enteredThisMonthCents }`
  - `POST /api/funds` `{ name, description }` → `201 { id }`
  - `PATCH /api/funds/[id]` `{ name?, description?, active? }` → `{ ok: true }`
  - `POST /api/funds/rules` `{ fund_id, pct, quando }` → `201 { id }`
  - `DELETE /api/funds/rules/[id]` → `{ ok: true }`

- [ ] **Step 1: Write the failing test (histórico de alterações)**

Acrescente ao FIM de `tests/unit/change-log.test.ts` (o arquivo já importa `agruparEventos`, `tituloDaLinha`, `valorLegivel`, `alteracoesEntre` e define o helper `linha`; se `alteracoesEntre` não estiver importado, acrescente-o na linha de importação):

```ts
describe("fundos no histórico de alterações", () => {
  it("títulos de fundo e de regra de fundo", () => {
    expect(tituloDaLinha("funds", { id: 8, name: "Feiras" })).toBe('Fundo "Feiras"');
    expect(tituloDaLinha("fund_rules", { id: 1, fund_id: 3, pct: "5.00", from_month: "2026-09-01", to_month: null })).toBe(
      "Regra de fundo nº 3, 5%, a partir de 09/2026, sem fim"
    );
    expect(tituloDaLinha("fund_rules", { id: 1, fund_id: 3, pct: "8.50", from_month: "2026-10-01", to_month: "2026-10-01" })).toBe(
      "Regra de fundo nº 3, 8,5%, só em 10/2026"
    );
  });

  it("apagar uma regra aparece como evento do tipo Fundos", () => {
    const [e] = agruparEventos([
      linha({ table: "fund_rules", op: "DELETE", before: { id: 1, fund_id: 3, pct: "5.00", from_month: "2026-09-01", to_month: null } }),
    ]);
    expect(e).toMatchObject({ tipo: "fundos", acao: "apagada" });
  });

  it("trocar só o fundo de uma despesa aparece como mudança (o número do fundo)", () => {
    const antes = { id: 1, description: "Contador", amount: 150, fund_id: null };
    const depois = { ...antes, fund_id: 3 };
    expect(alteracoesEntre(antes, depois).map((a) => a.rotulo)).toEqual(["Fundo (nº)"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/change-log.test.ts`
Expected: FAIL (títulos e tipo `fundos` ainda não existem).

- [ ] **Step 3: Write the implementation**

3a. Edit `lib/change-log.ts`:

1. Tipo. Old:
```ts
export type TipoDeRegistro = "venda" | "recebimento" | "despesa" | "fatura" | "fundo" | "divida" | "compra";
```
New:
```ts
export type TipoDeRegistro = "venda" | "recebimento" | "despesa" | "fatura" | "fundo" | "fundos" | "divida" | "compra";
```

2. Em `TIPO_DA_TABELA`, depois da linha `stock_purchases: "compra",` acrescentar:
```ts
  funds: "fundos",
  fund_rules: "fundos",
```

3. Em `ROTULO_DO_TIPO`, depois de `fundo: "Fundo de reposição",` acrescentar:
```ts
  fundos: "Fundos e regras de porcentagem",
```

4. Em `NOME_DA_TABELA`, depois de `stock_purchases: "Compra de estoque",` acrescentar:
```ts
  funds: "Fundo",
  fund_rules: "Regra de fundo",
```

5. Em `ROTULOS`, acrescentar (junto dos outros campos, por exemplo depois de `responsible: "Responsável",`):
```ts
  fund_id: "Fundo (nº)",
  name: "Nome",
  active: "Ativo",
  pct: "Porcentagem",
  from_month: "Começa em",
  to_month: "Termina em",
```

6. Em `tituloDaLinha`, antes de `default:` acrescentar:
```ts
    case "funds":
      return `${nome} "${texto(l.name)}"`;
    case "fund_rules": {
      const pct = texto(l.pct) ? `${String(Number(l.pct)).replace(".", ",")}%` : "";
      const mes = (v: unknown) => `${String(v).slice(5, 7)}/${String(v).slice(0, 4)}`;
      const de = texto(l.from_month);
      const ate = texto(l.to_month);
      const periodo = !de ? "" : !ate ? `a partir de ${mes(de)}, sem fim` : ate === de ? `só em ${mes(de)}` : `de ${mes(de)} até ${mes(ate)}`;
      return junta(`${nome} nº ${texto(l.fund_id)}`, pct, periodo);
    }
```

7. Mostrar o `fund_id` (que termina em `_id` e hoje é escondido). Em `alteracoesEntre`, Old:
```ts
  const chaves = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)])).filter((c) => !IGNORADOS.has(c) && !c.endsWith("_id"));
```
New:
```ts
  const chaves = Array.from(new Set([...Object.keys(antes), ...Object.keys(depois)])).filter(
    (c) => !IGNORADOS.has(c) && (!c.endsWith("_id") || c === "fund_id")
  );
```
Em `camposDaLinha`, Old:
```ts
    .filter((c) => !IGNORADOS.has(c) && !c.endsWith("_id"))
```
New:
```ts
    .filter((c) => !IGNORADOS.has(c) && (!c.endsWith("_id") || c === "fund_id"))
```
Também, em `valorLegivel`, o campo `active` (boolean) já vira "sim"/"não" (regra existente de boolean); nada a fazer.

3b. Create `app/api/funds/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { lerAcordo } from "@/lib/agreement-db";
import { todayBR } from "@/lib/finance/dates";
import { getFinanceSummary } from "@/lib/finance/load";
import { validarNomeDoFundo } from "@/lib/finance/funds";
import { criarFundo, listarFundos, listarRegras } from "@/lib/funds-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Fundos do negócio: a lista com a % do mês, o acumulado, o gasto e o saldo de cada um, e as regras de % por mês.
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const hoje = todayBR();
    const [fundos, regras, resumo, acordo] = await Promise.all([
      listarFundos(db),
      listarRegras(db),
      getFinanceSummary(db, { today: hoje }),
      lerAcordo(db),
    ]);
    const contas = new Map(resumo.cascade.funds.map((c) => [c.fundId, c]));
    const { retailPct, consignmentPct, wholesalePct } = acordo.valores;
    return NextResponse.json({
      hoje,
      reposicaoMaxima: Math.max(retailPct, consignmentPct, wholesalePct),
      fundos: fundos.map((f) => {
        const c = contas.get(f.id);
        return {
          id: f.id,
          name: f.name,
          description: f.description,
          active: f.active,
          position: f.position,
          pctThisMonth: c?.pctThisMonth ?? 0,
          enteredCents: c?.enteredCents ?? 0,
          spentCents: c?.spentCents ?? 0,
          balanceCents: c?.balanceCents ?? 0,
          enteredThisMonthCents: c?.enteredThisMonthCents ?? 0,
        };
      }),
      regras,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const nome = validarNomeDoFundo(body.name, body.description);
  if (!nome.ok) return NextResponse.json({ error: nome.error, message: nome.message }, { status: 400 });
  try {
    await ensureSchema();
    const id = await criarFundo(db, nome.nome, nome.descricao);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json({ error: "name_taken", message: "Já existe um fundo com esse nome." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
```

3c. Create `app/api/funds/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { comoUsuario } from "@/lib/audit";
import { quemFez } from "@/lib/audit-request";
import { todayBR } from "@/lib/finance/dates";
import { getFinanceSummary } from "@/lib/finance/load";
import { podeArquivar, validarNomeDoFundo } from "@/lib/finance/funds";
import { listarFundos, listarRegras, mudarFundo } from "@/lib/funds-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Renomear, mudar a descrição, arquivar ou reativar um fundo.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));

  const campos: { name?: string; description?: string | null; active?: boolean } = {};
  if (body.name !== undefined || body.description !== undefined) {
    const nome = validarNomeDoFundo(body.name, body.description);
    if (!nome.ok) return NextResponse.json({ error: nome.error, message: nome.message }, { status: 400 });
    campos.name = nome.nome;
    campos.description = nome.descricao;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") return NextResponse.json({ error: "invalid_active" }, { status: 400 });
    campos.active = body.active;
  }
  if (Object.keys(campos).length === 0) return NextResponse.json({ error: "nothing_to_change", message: "Nada foi alterado." }, { status: 400 });

  try {
    await ensureSchema();
    if (campos.active === false) {
      const [fundos, regras, resumo] = await Promise.all([listarFundos(db), listarRegras(db), getFinanceSummary(db)]);
      if (!fundos.some((f) => f.id === id)) return NextResponse.json({ error: "not_found", message: "Fundo não encontrado." }, { status: 404 });
      const saldo = resumo.cascade.funds.find((f) => f.fundId === id)?.balanceCents ?? 0;
      const pode = podeArquivar(regras, id, todayBR(), saldo);
      if (!pode.ok) return NextResponse.json({ error: pode.error, message: pode.message }, { status: 409 });
    }
    const achou = await mudarFundo(comoUsuario(db, await quemFez()), id, campos);
    if (!achou) return NextResponse.json({ error: "not_found", message: "Fundo não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if ((err as { code?: string })?.code === "23505") {
      return NextResponse.json({ error: "name_taken", message: "Já existe um fundo com esse nome." }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
```

Nota: `mudarFundo` recebe `Pick<Pool | PoolClient, "query">`; `comoUsuario` devolve `Pick<Pool, "query">`, que serve.

3d. Create `app/api/funds/rules/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { lerAcordo } from "@/lib/agreement-db";
import { quemFez } from "@/lib/audit-request";
import { todayBR } from "@/lib/finance/dates";
import { OPCOES_DE_QUANDO, periodoDaOpcao, validarRegra, type OpcaoDeQuando } from "@/lib/finance/funds";
import { criarRegraDeFundo, fundoDisponivel, listarFundos, listarRegras } from "@/lib/funds-db";
import { readMoneyOrNull } from "@/lib/store-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Muda a % de um fundo: { fund_id, pct, quando: "so_este_mes" | "proximo_mes" | "sempre" }.
export async function POST(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));

  const fundId = Number(body.fund_id);
  if (!Number.isInteger(fundId) || fundId <= 0) {
    return NextResponse.json({ error: "invalid_fund", message: "Escolha o fundo." }, { status: 400 });
  }
  const pct = readMoneyOrNull(body.pct);
  if (pct === null || pct === "invalido") {
    return NextResponse.json({ error: "invalid_pct", message: "Informe a porcentagem (de 0 a 100)." }, { status: 400 });
  }
  if (!OPCOES_DE_QUANDO.includes(body.quando)) {
    return NextResponse.json({ error: "invalid_when", message: "Escolha quando a porcentagem vale." }, { status: 400 });
  }

  try {
    await ensureSchema();
    if (!(await fundoDisponivel(db, fundId))) {
      return NextResponse.json({ error: "invalid_fund", message: "Esse fundo não existe ou está arquivado." }, { status: 400 });
    }
    const periodo = periodoDaOpcao(body.quando as OpcaoDeQuando, todayBR());
    const [regras, fundos, acordo] = await Promise.all([listarRegras(db), listarFundos(db), lerAcordo(db)]);
    const { retailPct, consignmentPct, wholesalePct } = acordo.valores;
    const reposicaoMaxima = Math.max(retailPct, consignmentPct, wholesalePct);
    const v = validarRegra(regras, { fundId, pct, ...periodo }, fundos.map((f) => f.id), reposicaoMaxima);
    if (!v.ok) return NextResponse.json({ error: v.error, message: v.message }, { status: 400 });

    const id = await criarRegraDeFundo(db, { fundId, pct, ...periodo }, await quemFez());
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }
}
```

3e. Create `app/api/funds/rules/[id]/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { comoUsuario } from "@/lib/audit";
import { quemFez } from "@/lib/audit-request";
import { apagarRegraDeFundo } from "@/lib/funds-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Apaga uma regra de %: a regra anterior volta a valer nos meses em comum. Fica no histórico de alterações.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  try {
    await ensureSchema();
    const apagou = await apagarRegraDeFundo(comoUsuario(db, await quemFez()), id);
    if (!apagou) return NextResponse.json({ error: "not_found", message: "Regra não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/change-log.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: sem erros.
Confira as rotas na tarefa 10 (teste no navegador, com login de teste).

- [ ] **Step 5: Commit**

```bash
git add lib/change-log.ts tests/unit/change-log.test.ts app/api/funds
git commit -m "Fundos: API de fundos e regras, e o Histórico de alterações reconhece os dois

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7: Faixa dos fundos no alto do Painel financeiro

**Files:**
- Create: `lib/faixa-dos-fundos.ts`, `app/financeiro/faixa-dos-fundos.tsx`
- Modify: `app/financeiro/page.tsx` (faixa no alto; coluna "Fundos" na tabela)
- Modify: `app/globals.css` (estilos no fim do arquivo)
- Test: `tests/unit/faixa-dos-fundos.test.ts`

**Interfaces:**
- Consumes: `FundAccount` (Task 2); `FundResult` de `lib/finance/accounts.ts`; `listarFundos` (Task 3); `formatCentsBRL`, `formatarPct`.
- Produces: `cartoesDosFundos(entrada): CartaoDeFundo[]` e o componente `FaixaDosFundos({ cartoes })`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/faixa-dos-fundos.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cartoesDosFundos } from "../../lib/faixa-dos-fundos";

const normal = (t: string) => t.replace(/\u00a0/g, " ");

const REPOSICAO = {
  enteredCents: 500000,
  paidCents: 200000,
  balanceCents: 300000,
  purchasesTotalCents: 0,
  payableCents: 0,
  balanceMinusPayableCents: 300000,
  initialStockCents: 0,
  totalStockBoughtCents: 0,
  perPurchase: [],
  warnings: [],
};

describe("cartões da faixa de fundos", () => {
  const fundos = [
    { id: 1, name: "Prospecção", active: true },
    { id: 2, name: "Transporte", active: true },
    { id: 3, name: "Antigo", active: false },
  ];
  const contas = [
    { fundId: 1, enteredCents: 12500, spentCents: 2500, balanceCents: 10000, pctThisMonth: 5, enteredThisMonthCents: 12500 },
    { fundId: 2, enteredCents: 0, spentCents: 0, balanceCents: 0, pctThisMonth: 0, enteredThisMonthCents: 0 },
    { fundId: 3, enteredCents: 900, spentCents: 900, balanceCents: 0, pctThisMonth: 0, enteredThisMonthCents: 0 },
  ];
  const cartoes = cartoesDosFundos({ reposicao: REPOSICAO, retailPct: 30, fundos, contas });

  it("o primeiro é o fundo de reposição, depois um por fundo ativo (arquivado não aparece)", () => {
    expect(cartoes.map((c) => c.titulo)).toEqual(["Fundo de reposição", "Prospecção", "Transporte"]);
  });

  it("mostra acumulado, gasto, saldo e a % do mês", () => {
    const rep = cartoes[0];
    expect(normal(rep.acumulado)).toBe("R$ 5.000,00");
    expect(normal(rep.gasto)).toBe("R$ 2.000,00");
    expect(normal(rep.saldo)).toBe("R$ 3.000,00");
    expect(rep.pct).toBe("30% do varejo");
    expect(rep.href).toBe("/financeiro/fundo");

    const pros = cartoes[1];
    expect(normal(pros.acumulado)).toBe("R$ 125,00");
    expect(normal(pros.gasto)).toBe("R$ 25,00");
    expect(normal(pros.saldo)).toBe("R$ 100,00");
    expect(pros.pct).toBe("5% este mês");
    expect(pros.href).toBe("/financeiro/fundos");
  });

  it("fundo em 0% diz que ainda não separa nada", () => {
    expect(cartoes[2].pct).toBe("0% este mês");
  });

  it("marca saldo negativo do fundo de reposição", () => {
    const [rep] = cartoesDosFundos({ reposicao: { ...REPOSICAO, balanceCents: -1000 }, retailPct: 30, fundos: [], contas: [] });
    expect(rep.saldoNegativo).toBe(true);
    expect(cartoes[1].saldoNegativo).toBe(false);
  });

  it("porcentagem com vírgula", () => {
    const [, c] = cartoesDosFundos({
      reposicao: REPOSICAO,
      retailPct: 30,
      fundos: [{ id: 1, name: "X", active: true }],
      contas: [{ fundId: 1, enteredCents: 0, spentCents: 0, balanceCents: 0, pctThisMonth: 2.5, enteredThisMonthCents: 0 }],
    });
    expect(c.pct).toBe("2,5% este mês");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/faixa-dos-fundos.test.ts`
Expected: FAIL (`lib/faixa-dos-fundos` não existe).

- [ ] **Step 3: Write the implementation**

3a. Create `lib/faixa-dos-fundos.ts`:

```ts
import type { FundResult } from "./finance/accounts";
import type { FundAccount } from "./finance/cascade";
import type { Fundo } from "./finance/funds";
import { formatarPct } from "./finance/funds";
import { formatCentsBRL } from "./finance/money";

// A faixa de fundos no alto do Painel financeiro: um cartão para o fundo de reposição
// e um para cada fundo ativo, com o texto já pronto para mostrar.

export interface CartaoDeFundo {
  chave: string;
  titulo: string;
  acumulado: string; // tudo o que já entrou no fundo
  gasto: string;
  saldo: string;
  saldoNegativo: boolean;
  pct: string;
  href: string;
}

export function cartoesDosFundos(entrada: {
  reposicao: FundResult;
  retailPct: number;
  fundos: Fundo[];
  contas: FundAccount[];
}): CartaoDeFundo[] {
  const cartoes: CartaoDeFundo[] = [
    {
      chave: "reposicao",
      titulo: "Fundo de reposição",
      acumulado: formatCentsBRL(entrada.reposicao.enteredCents),
      gasto: formatCentsBRL(entrada.reposicao.paidCents),
      saldo: formatCentsBRL(entrada.reposicao.balanceCents),
      saldoNegativo: entrada.reposicao.balanceCents < 0,
      pct: `${formatarPct(entrada.retailPct)}% do varejo`,
      href: "/financeiro/fundo",
    },
  ];
  const contas = new Map(entrada.contas.map((c) => [c.fundId, c]));
  for (const f of entrada.fundos) {
    if (!f.active) continue;
    const c = contas.get(f.id);
    cartoes.push({
      chave: `fundo-${f.id}`,
      titulo: f.name,
      acumulado: formatCentsBRL(c?.enteredCents ?? 0),
      gasto: formatCentsBRL(c?.spentCents ?? 0),
      saldo: formatCentsBRL(c?.balanceCents ?? 0),
      saldoNegativo: (c?.balanceCents ?? 0) < 0,
      pct: `${formatarPct(c?.pctThisMonth ?? 0)}% este mês`,
      href: "/financeiro/fundos",
    });
  }
  return cartoes;
}
```

3b. Create `app/financeiro/faixa-dos-fundos.tsx`:

```tsx
import type { CartaoDeFundo } from "@/lib/faixa-dos-fundos";

// Acumulado, gasto e saldo de cada fundo, sempre à vista no alto do Painel financeiro.
export default function FaixaDosFundos({ cartoes }: { cartoes: CartaoDeFundo[] }) {
  return (
    <section className="fundos-faixa" aria-label="Fundos">
      <header>
        <h2>Fundos</h2>
        <a href="/financeiro/fundos">Ver e ajustar</a>
      </header>
      <div className="fundos-grade">
        {cartoes.map((c) => (
          <a className="fundo-cartao" href={c.href} key={c.chave}>
            <span className="fundo-titulo">{c.titulo}</span>
            <span className="fundo-pct">{c.pct}</span>
            <span className="fundo-linha">
              <em>Acumulado</em>
              <strong>{c.acumulado}</strong>
            </span>
            <span className="fundo-linha">
              <em>Gasto</em>
              <strong>{c.gasto}</strong>
            </span>
            <span className={"fundo-linha fundo-saldo" + (c.saldoNegativo ? " negativo" : "")}>
              <em>Saldo</em>
              <strong>{c.saldo}</strong>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
```

3c. Acrescente ao FIM de `app/globals.css`:

```css
/* Faixa de fundos (alto do Painel financeiro) */
.fundos-faixa {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-left: 5px solid var(--accent);
  border-radius: var(--radius-lg);
  padding: 14px 16px 16px;
  box-shadow: var(--shadow);
  margin-bottom: 18px;
}

.fundos-faixa header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.fundos-faixa h2 {
  font-family: var(--font-display);
  font-size: 1.05rem;
  color: var(--accent-strong);
}

.fundos-faixa header a {
  font-size: 0.8rem;
  color: var(--gold);
  font-weight: 600;
}

.fundos-grade {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 10px;
}

.fundo-cartao {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background: var(--surface-soft);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  color: inherit;
  text-decoration: none;
  min-width: 0;
}

.fundo-cartao:hover {
  background: var(--accent-soft);
}

.fundo-titulo {
  font-weight: 600;
  color: var(--accent-strong);
  overflow-wrap: anywhere;
}

.fundo-pct {
  font-size: 0.72rem;
  color: var(--ink-faint);
  margin-bottom: 4px;
}

.fundo-linha {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.8rem;
}

.fundo-linha em {
  font-style: normal;
  color: var(--ink-faint);
}

.fundo-linha strong {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  color: var(--accent-strong);
}

.fundo-saldo strong {
  font-size: 0.95rem;
}

.fundo-saldo.negativo strong {
  color: var(--danger);
}

@media (max-width: 720px) {
  .fundos-grade {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
```

3d. Edit `app/financeiro/page.tsx`:

1. Importações. Old:
```ts
import { lerAcordo } from "@/lib/agreement-db";
import FaixaDoAcordo from "../faixa-do-acordo";
```
New:
```ts
import { lerAcordo } from "@/lib/agreement-db";
import { listarFundos } from "@/lib/funds-db";
import { cartoesDosFundos } from "@/lib/faixa-dos-fundos";
import FaixaDoAcordo from "../faixa-do-acordo";
import FaixaDosFundos from "./faixa-dos-fundos";
```

2. Depois de `const { valores: acordo } = await lerAcordo(db);` acrescentar:
```ts
  const cartoesDeFundos = cartoesDosFundos({
    reposicao: fund,
    retailPct: acordo.retailPct,
    fundos: await listarFundos(db),
    contas: cascade.funds,
  });
```

3. Antes do `<FaixaDoAcordo` acrescentar a faixa (a primeira coisa depois do título da página):
```tsx
      <FaixaDosFundos cartoes={cartoesDeFundos} />

```

4. Na tabela "De onde vem cada número". No cabeçalho, Old:
```tsx
                  <th>Reposição</th>
                  <th>Custos</th>
```
New:
```tsx
                  <th>Reposição</th>
                  <th>Fundos</th>
                  <th>Custos</th>
```
Na linha de cada evento, Old:
```tsx
                      <td className="num">{reais(e.replenishCents)}</td>
                      <td className="num">{reais(e.costsCents)}</td>
                      <td className="num">{e.kind === "despesa" ? `-${reais(e.expenseCents)}` : reais(e.profitCents)}</td>
```
New:
```tsx
                      <td className="num">{reais(e.replenishCents)}</td>
                      <td className="num">
                        {e.kind === "despesa"
                          ? e.fundCoveredCents > 0
                            ? `pago pelo fundo ${reais(e.fundCoveredCents)}`
                            : "-"
                          : reais(Object.values(e.fundsCents).reduce((total, v) => total + v, 0))}
                      </td>
                      <td className="num">{reais(e.costsCents)}</td>
                      <td className="num">{e.kind === "despesa" ? `-${reais(e.expenseCents - e.fundCoveredCents)}` : reais(e.profitCents)}</td>
```
No rodapé, Old:
```tsx
                  <td className="num">{reais(cascade.totals.replenishCents)}</td>
                  <td className="num">{reais(cascade.totals.costsCents)}</td>
                  <td className="num">{reais(cascade.totals.profitCents - cascade.totals.expensesCents)}</td>
```
New:
```tsx
                  <td className="num">{reais(cascade.totals.replenishCents)}</td>
                  <td className="num">{reais(cascade.totals.fundsCents)}</td>
                  <td className="num">{reais(cascade.totals.costsCents)}</td>
                  <td className="num">{reais(cascade.totals.profitCents - (cascade.totals.expensesCents - cascade.totals.fundCoveredCents))}</td>
```
E trocar `<table style={{ minWidth: 1250 }}>` por `<table style={{ minWidth: 1400 }}>`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/faixa-dos-fundos.test.ts`
Expected: PASS.
Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add lib/faixa-dos-fundos.ts app/financeiro/faixa-dos-fundos.tsx app/financeiro/page.tsx app/globals.css tests/unit/faixa-dos-fundos.test.ts
git commit -m "Fundos: faixa com acumulado, gasto e saldo no alto do Painel financeiro

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Tela Financeiro > Fundos e menu

**Files:**
- Create: `app/financeiro/fundos/page.tsx`
- Modify: `app/nav-bar.tsx` (`GRUPOS`, `CAMINHOS`, `MAIS`)
- Modify: `app/globals.css` (poucos estilos no fim)

**Interfaces:**
- Consumes: as rotas da Task 6 (`GET/POST /api/funds`, `PATCH /api/funds/[id]`, `POST /api/funds/rules`, `DELETE /api/funds/rules/[id]`); `descreverOpcao`, `descreverPeriodo`, `formatarPct`, `OPCOES_DE_QUANDO`, `type OpcaoDeQuando` (Task 1); `formatCentsBRL`; `formatDateBR` de `lib/format`.
- Produces: a página `/financeiro/fundos`.

Não há teste automatizado de tela neste projeto: a conferência é no navegador (Task 10). A lógica está toda em funções já testadas (Tasks 1 e 6).

- [ ] **Step 1: Criar a página**

Create `app/financeiro/fundos/page.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCentsBRL } from "@/lib/finance/money";
import { OPCOES_DE_QUANDO, descreverOpcao, descreverPeriodo, formatarPct, type OpcaoDeQuando } from "@/lib/finance/funds";
import { formatDateBR } from "@/lib/format";

type FundoNaTela = {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
  pctThisMonth: number;
  enteredCents: number;
  spentCents: number;
  balanceCents: number;
  enteredThisMonthCents: number;
};
type Regra = { id: number; fundId: number; pct: number; fromMonth: string; toMonth: string | null; createdAt: string; createdByName: string | null };
type Dados = { hoje: string; reposicaoMaxima: number; fundos: FundoNaTela[]; regras: Regra[] };

const reais = formatCentsBRL;

export default function FundosPage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroDeCarga, setErroDeCarga] = useState("");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState("");

  const [mudando, setMudando] = useState<FundoNaTela | null>(null);
  const [pct, setPct] = useState("");
  const [quando, setQuando] = useState<OpcaoDeQuando>("sempre");
  const [editando, setEditando] = useState<FundoNaTela | "novo" | null>(null);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroDaJanela, setErroDaJanela] = useState("");

  const carregar = useCallback(async () => {
    const res = await fetch("/api/funds");
    if (!res.ok) {
      setErroDeCarga("Não foi possível carregar os fundos.");
      return;
    }
    setDados(await res.json());
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!dados) {
    return (
      <main className="shell shell--wide">
        <div className="loading-state">{erroDeCarga || "Carregando..."}</div>
      </main>
    );
  }

  const { hoje, fundos, regras } = dados;
  const ativos = fundos.filter((f) => f.active);
  const arquivados = fundos.filter((f) => !f.active);
  const nomeDoFundo = (id: number) => fundos.find((f) => f.id === id)?.name ?? `Fundo nº ${id}`;

  function abrirMudarPct(f: FundoNaTela) {
    setErroDaJanela("");
    setPct(String(f.pctThisMonth).replace(".", ","));
    setQuando("sempre");
    setMudando(f);
  }

  function abrirEditar(f: FundoNaTela | "novo") {
    setErroDaJanela("");
    setNome(f === "novo" ? "" : f.name);
    setDescricao(f === "novo" ? "" : f.description ?? "");
    setEditando(f);
  }

  async function chamar(url: string, metodo: string, corpo?: unknown) {
    const res = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok, mensagem: (d.message as string | undefined) ?? "" };
  }

  async function salvarPct(e: React.FormEvent) {
    e.preventDefault();
    if (!mudando || salvando) return;
    setSalvando(true);
    setErroDaJanela("");
    try {
      const r = await chamar("/api/funds/rules", "POST", { fund_id: mudando.id, pct, quando });
      if (!r.ok) return setErroDaJanela(r.mensagem || "Não foi possível salvar. Tente novamente.");
      setMudando(null);
      setAviso(`Porcentagem do fundo ${mudando.name} salva. As contas já usam o valor novo.`);
      setErro("");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function salvarFundo(e: React.FormEvent) {
    e.preventDefault();
    if (!editando || salvando) return;
    setSalvando(true);
    setErroDaJanela("");
    try {
      const novo = editando === "novo";
      const r = novo
        ? await chamar("/api/funds", "POST", { name: nome, description: descricao })
        : await chamar(`/api/funds/${editando.id}`, "PATCH", { name: nome, description: descricao });
      if (!r.ok) return setErroDaJanela(r.mensagem || "Não foi possível salvar. Tente novamente.");
      setEditando(null);
      setAviso(novo ? "Fundo criado, com 0%. Use Mudar % para definir quanto separar." : "Fundo atualizado.");
      setErro("");
      await carregar();
    } finally {
      setSalvando(false);
    }
  }

  async function arquivar(f: FundoNaTela, ativo: boolean) {
    if (!ativo && !window.confirm(`Arquivar o fundo "${f.name}"? Ele some das opções, mas o passado continua contando.`)) return;
    const r = await chamar(`/api/funds/${f.id}`, "PATCH", { active: ativo });
    if (!r.ok) {
      setAviso("");
      setErro(r.mensagem || "Não foi possível mudar o fundo.");
      return;
    }
    setErro("");
    setAviso(ativo ? `Fundo ${f.name} reativado.` : `Fundo ${f.name} arquivado.`);
    await carregar();
  }

  async function apagarRegra(r: Regra) {
    const texto = `${nomeDoFundo(r.fundId)}, ${formatarPct(r.pct)}%, ${descreverPeriodo(r.fromMonth, r.toMonth)}`;
    if (!window.confirm(`Apagar esta regra?\n\n${texto}\n\nA regra anterior volta a valer nesses meses.`)) return;
    const res = await chamar(`/api/funds/rules/${r.id}`, "DELETE");
    if (!res.ok) {
      setAviso("");
      setErro(res.mensagem || "Não foi possível apagar a regra.");
      return;
    }
    setErro("");
    setAviso("Regra apagada.");
    await carregar();
  }

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Financeiro</p>
        <h1>Fundos</h1>
        <p>
          Cada venda separa uma parte do valor para estes fundos, junto com os 30% da reposição, antes de dividir o lucro. Aqui você define
          quanto separar em cada um e quando a porcentagem vale. Ao lançar uma despesa, é possível escolher o fundo que paga.
        </p>
      </div>

      {aviso && (
        <div className="banner banner-info" role="status">
          <span>✅</span>
          <span>{aviso}</span>
        </div>
      )}
      {erro && (
        <div className="banner banner-warning" role="alert">
          <span>⚠️</span>
          <span>{erro}</span>
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <div />
        <button className="btn btn-primary" onClick={() => abrirEditar("novo")}>
          + Novo fundo
        </button>
      </div>

      <div className="fundos-grade fundos-grade--paginas">
        {ativos.map((f) => (
          <div className="fundo-cartao fundo-cartao--pagina" key={f.id}>
            <span className="fundo-titulo">{f.name}</span>
            {f.description && <span className="fundo-pct">{f.description}</span>}
            <span className="fundo-pct">{`${formatarPct(f.pctThisMonth)}% este mês`}</span>
            <span className="fundo-linha">
              <em>Acumulado</em>
              <strong>{reais(f.enteredCents)}</strong>
            </span>
            <span className="fundo-linha">
              <em>Entrou neste mês</em>
              <strong>{reais(f.enteredThisMonthCents)}</strong>
            </span>
            <span className="fundo-linha">
              <em>Gasto</em>
              <strong>{reais(f.spentCents)}</strong>
            </span>
            <span className={"fundo-linha fundo-saldo" + (f.balanceCents < 0 ? " negativo" : "")}>
              <em>Saldo</em>
              <strong>{reais(f.balanceCents)}</strong>
            </span>
            <div className="row-actions" style={{ marginTop: 8 }}>
              <button className="btn btn-primary btn-small" onClick={() => abrirMudarPct(f)}>
                Mudar %
              </button>
              <button className="icon-btn" onClick={() => abrirEditar(f)}>
                Renomear
              </button>
              <button className="icon-btn danger" onClick={() => arquivar(f, false)}>
                Arquivar
              </button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="section-title" style={{ marginTop: 22 }}>
        <span className="dot" />
        Regras de porcentagem
      </h2>
      <p className="fin-help">
        Em cada mês vale a regra mais recente entre as que cobrem o mês. Apagar uma regra faz a anterior voltar a valer. Meses sem regra separam 0%.
      </p>
      {regras.length === 0 ? (
        <div className="empty-state">Nenhuma regra ainda: todos os fundos estão em 0%.</div>
      ) : (
        <div className="table-wrap tabela-cabe">
          <table>
            <thead>
              <tr>
                <th>Fundo</th>
                <th>Porcentagem</th>
                <th>Quando vale</th>
                <th>Quem mudou</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {regras.map((r) => (
                <tr key={r.id}>
                  <td>{nomeDoFundo(r.fundId)}</td>
                  <td className="num">{`${formatarPct(r.pct)}%`}</td>
                  <td>{descreverPeriodo(r.fromMonth, r.toMonth)}</td>
                  <td>
                    {r.createdByName ?? "Sem identificação"}
                    <div className="hint">{formatDateBR(r.createdAt.slice(0, 10))}</div>
                  </td>
                  <td>
                    <button className="icon-btn danger" onClick={() => apagarRegra(r)}>
                      Apagar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {arquivados.length > 0 && (
        <>
          <h2 className="section-title" style={{ marginTop: 22 }}>
            <span className="dot" />
            Arquivados
          </h2>
          <div className="table-wrap tabela-cabe">
            <table>
              <tbody>
                {arquivados.map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td className="num">{`Acumulado ${reais(f.enteredCents)}`}</td>
                    <td>
                      <button className="icon-btn" onClick={() => arquivar(f, true)}>
                        Reativar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {mudando && (
        <div className="modal-overlay" onClick={() => setMudando(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>{`Mudar % de ${mudando.name}`}</h2>
              <button className="modal-close" onClick={() => setMudando(null)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <form onSubmit={salvarPct}>
              <div className="form-grid">
                <div className="field">
                  <label>Porcentagem do valor da venda</label>
                  <input type="text" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} required />
                  <span className="hint">De 0 a 100. Ela é separada junto com os 30% da reposição.</span>
                </div>
                <div className="field field--full">
                  <label>Quando vale?</label>
                  <div className="radio-row">
                    {OPCOES_DE_QUANDO.map((o) => (
                      <button type="button" key={o} className={"radio-chip" + (quando === o ? " selected" : "")} onClick={() => setQuando(o)}>
                        {descreverOpcao(o, hoje)}
                      </button>
                    ))}
                  </div>
                  <span className="hint">Vale o mês inteiro, inclusive as vendas deste mês que já aconteceram. Meses anteriores não mudam.</span>
                </div>
              </div>
              {erroDaJanela && (
                <div className="banner banner-error" style={{ marginTop: 14 }}>
                  <span>⚠️</span>
                  <span>{erroDaJanela}</span>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setMudando(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editando && (
        <div className="modal-overlay" onClick={() => setEditando(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>{editando === "novo" ? "Novo fundo" : "Renomear fundo"}</h2>
              <button className="modal-close" onClick={() => setEditando(null)} aria-label="Fechar">
                ✕
              </button>
            </div>
            <form onSubmit={salvarFundo}>
              <div className="form-grid">
                <div className="field field--full">
                  <label>Nome</label>
                  <input type="text" maxLength={40} value={nome} onChange={(e) => setNome(e.target.value)} required />
                </div>
                <div className="field field--full">
                  <label>Descrição (opcional)</label>
                  <input type="text" maxLength={200} value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="O que entra neste fundo" />
                </div>
              </div>
              {erroDaJanela && (
                <div className="banner banner-error" style={{ marginTop: 14 }}>
                  <span>⚠️</span>
                  <span>{erroDaJanela}</span>
                </div>
              )}
              <div className="modal-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Estilos que faltam**

Acrescente ao FIM de `app/globals.css`:

```css
/* Tela Financeiro > Fundos: os cartões usam as mesmas classes da faixa do Painel */
.fundos-grade--paginas {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.fundo-cartao--pagina:hover {
  background: var(--surface-soft);
}
```

- [ ] **Step 3: Menu**

Edit `app/nav-bar.tsx` (três lugares, cada um logo depois da linha do "Histórico de alterações"):

1. Em `GRUPOS`, grupo Financeiro. Old:
```tsx
      { href: "/financeiro/historico", rotulo: "Histórico de alterações", icone: "financeiro" },
```
New:
```tsx
      { href: "/financeiro/fundos", rotulo: "Fundos", icone: "financeiro" },
      { href: "/financeiro/historico", rotulo: "Histórico de alterações", icone: "financeiro" },
```

2. Em `CAMINHOS`. Old:
```tsx
  "/financeiro/historico": ["Financeiro", "Histórico de alterações"],
```
New:
```tsx
  "/financeiro/fundos": ["Financeiro", "Fundos"],
  "/financeiro/historico": ["Financeiro", "Histórico de alterações"],
```

3. Em `MAIS`. Old:
```tsx
  { href: "/financeiro/historico", rotulo: "Histórico de alterações" },
```
New:
```tsx
  { href: "/financeiro/fundos", rotulo: "Fundos" },
  { href: "/financeiro/historico", rotulo: "Histórico de alterações" },
```

- [ ] **Step 4: Conferir tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add app/financeiro/fundos/page.tsx app/nav-bar.tsx app/globals.css
git commit -m "Fundos: tela Financeiro > Fundos (mudar %, quando vale, criar, renomear, arquivar, regras)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Campo "Pagar com o fundo de" na tela de Despesas

**Files:**
- Modify: `app/financeiro/despesas/page.tsx`

**Interfaces:**
- Consumes: `GET /api/funds` (Task 6) para a lista de fundos; `GET /api/expenses` agora devolve `fund_id` e `fund_name` (Task 4); `POST/PATCH /api/expenses` aceitam `fund_id` (Task 4).
- Produces: o formulário de despesa com o campo de fundo, e a coluna "Fundo" na lista.

- [ ] **Step 1: Editar a página**

Edit `app/financeiro/despesas/page.tsx`:

1. Tipo `Despesa`. Old:
```tsx
  notes: string | null;
  invoice_id: number | null;
  invoice_description: string | null;
};

type Parte
```
New:
```tsx
  notes: string | null;
  fund_id: number | null;
  fund_name: string | null;
  invoice_id: number | null;
  invoice_description: string | null;
};

type FundoOpcao = { id: number; name: string };

type Parte
```

2. Estado e carga em `DespesasPage`. Old:
```tsx
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [carregando, setCarregando] = useState(true);

  function carregar() {
    Promise.all([fetch("/api/expenses").then((r) => r.json()), fetch("/api/card-invoices").then((r) => r.json())])
      .then(([d, f]) => {
        setDespesas(d.items || []);
        setFaturas(f.items || []);
      })
      .finally(() => setCarregando(false));
  }
```
New:
```tsx
  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [fundos, setFundos] = useState<FundoOpcao[]>([]);
  const [carregando, setCarregando] = useState(true);

  function carregar() {
    Promise.all([
      fetch("/api/expenses").then((r) => r.json()),
      fetch("/api/card-invoices").then((r) => r.json()),
      fetch("/api/funds").then((r) => r.json()),
    ])
      .then(([d, f, fu]) => {
        setDespesas(d.items || []);
        setFaturas(f.items || []);
        setFundos((fu.fundos || []).filter((x: { active: boolean }) => x.active).map((x: { id: number; name: string }) => ({ id: x.id, name: x.name })));
      })
      .finally(() => setCarregando(false));
  }
```

3. Passar os fundos para a aba. Old:
```tsx
        <DespesasAba despesas={despesas} recarregar={carregar} verFaturas={() => setAba("faturas")} />
```
New:
```tsx
        <DespesasAba despesas={despesas} fundos={fundos} recarregar={carregar} verFaturas={() => setAba("faturas")} />
```
E a assinatura. Old:
```tsx
function DespesasAba({ despesas, recarregar, verFaturas }: { despesas: Despesa[]; recarregar: () => void; verFaturas: () => void }) {
```
New:
```tsx
function DespesasAba({
  despesas,
  fundos,
  recarregar,
  verFaturas,
}: {
  despesas: Despesa[];
  fundos: FundoOpcao[];
  recarregar: () => void;
  verFaturas: () => void;
}) {
```

4. Estado do formulário e `abrir`. Old:
```tsx
  const [form, setForm] = useState({ expense_date: hojeISO(), description: "", category: "", amount: "", notes: "" });
```
New:
```tsx
  const [form, setForm] = useState({ expense_date: hojeISO(), description: "", category: "", amount: "", notes: "", fund_id: "" });
```
Old:
```tsx
        ? { expense_date: hojeISO(), description: "", category: "", amount: "", notes: "" }
        : { expense_date: d.expense_date, description: d.description, category: d.category ?? "", amount: numero(d.amount), notes: d.notes ?? "" }
```
New:
```tsx
        ? { expense_date: hojeISO(), description: "", category: "", amount: "", notes: "", fund_id: "" }
        : {
            expense_date: d.expense_date,
            description: d.description,
            category: d.category ?? "",
            amount: numero(d.amount),
            notes: d.notes ?? "",
            fund_id: d.fund_id ? String(d.fund_id) : "",
          }
```

5. Coluna na tabela. Old:
```tsx
                <th>Categoria</th>
                <th>Origem</th>
```
New:
```tsx
                <th>Categoria</th>
                <th>Fundo</th>
                <th>Origem</th>
```
Old:
```tsx
                  <td>{d.category || "-"}</td>
                  <td>
                    {d.invoice_id ? (
```
New:
```tsx
                  <td>{d.category || "-"}</td>
                  <td>{d.fund_name ?? "-"}</td>
                  <td>
                    {d.invoice_id ? (
```

6. Campo no formulário, depois do campo de categoria e antes da "Observação". Old:
```tsx
                <div className="field field--full">
                  <label>Observação (opcional)</label>
                  <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
```
New:
```tsx
                <div className="field field--full">
                  <label>Pagar com o fundo de</label>
                  <select value={form.fund_id} onChange={(e) => setForm({ ...form, fund_id: e.target.value })}>
                    <option value="">Nenhum (sai do lucro)</option>
                    {fundos.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                    {form.fund_id !== "" && !fundos.some((f) => String(f.id) === form.fund_id) && (
                      <option value={form.fund_id}>Fundo arquivado (manter)</option>
                    )}
                  </select>
                  <span className="hint">O fundo paga primeiro, até onde tiver saldo. O que faltar sai do lucro, como toda despesa.</span>
                </div>
                <div className="field field--full">
                  <label>Observação (opcional)</label>
                  <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
```

- [ ] **Step 2: Conferir tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add app/financeiro/despesas/page.tsx
git commit -m "Fundos: campo Pagar com o fundo de no formulário de despesas, e coluna Fundo na lista

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Conferência final (sem publicar)

**Files:** nenhum arquivo de código novo; só verificação e anotação na memória.

- [ ] **Step 1: Suíte completa e build**

Run: `docker start radar-teste-db` (se preciso), depois:
```bash
npx tsc --noEmit
npx vitest run
npm run build
```
Expected: sem erros de tipo; todos os testes passam (se aparecerem falhas isoladas de conexão com o banco, rode `npx vitest run --pool=forks --poolOptions.forks.singleFork tests/db` para confirmar que é só competição de conexões); build compila e lista as rotas novas (`/financeiro/fundos`, `/api/funds`, `/api/funds/[id]`, `/api/funds/rules`, `/api/funds/rules/[id]`).

- [ ] **Step 2: Conferência no navegador (banco de demonstração local)**

Suba o sistema com `npm run dev -- -p 3100` (só o processo do Radar; não mate nada que não seja seu). Registre um usuário de teste com `POST /api/auth/register` (`inviteCode: "convite-de-teste-local"`, e-mail `visitante@teste.com`, campos `password` e `passwordRepeat`) e confira, na ordem:

1. `/financeiro`: a faixa "Fundos" aparece no alto, com os cartões (reposição + 7 fundos), todos os fundos novos em 0% e saldo R$ 0,00. Tabela "De onde vem cada número" com a coluna "Fundos".
2. `/financeiro/fundos`: Mudar % de "Custos fixos" para 4, "Por tempo indeterminado". Aparece "Regras de porcentagem" com a regra e o nome do usuário. A faixa do Painel mostra "4% este mês" e o acumulado sobe conforme as vendas do banco de demonstração.
3. Mudar % de "Prospecção" para 5 com "Só este mês", e depois para 8 com "A partir do mês que vem": as duas regras aparecem; apagar a segunda; a lista mostra só a primeira.
4. Tentar uma % que estoure 100% (por exemplo, 80 em Frete) e ver a mensagem de erro em português.
5. Novo fundo "Feiras": aparece com 0%; renomear para "Feiras e eventos"; arquivar (deve arquivar, pois está em 0% e saldo 0) e reativar.
6. `/financeiro/despesas`: lançar uma despesa de R$ 150 "Contador" com "Pagar com o fundo de: Custos fixos". A lista mostra o fundo; em `/financeiro` o saldo do fundo de custos fixos diminui (até onde tinha saldo) e a linha da despesa na tabela mostra "pago pelo fundo R$ ...".
7. `/financeiro/historico`: aparecem a despesa, a regra apagada e o fundo renomeado, com o nome do usuário.
8. Celular (janela de 375 px): a faixa mostra dois cartões por linha e nenhuma página tem rolagem para o lado (`document.documentElement.scrollWidth === clientWidth`).

Ao terminar: faça logout, apague o usuário de teste e as regras/fundos/despesas de teste do banco local (`DELETE FROM users WHERE email='visitante@teste.com'`, `DELETE FROM fund_rules`, `DELETE FROM expenses WHERE description='Contador'`, `DELETE FROM funds WHERE position > 7`, `DELETE FROM change_log`), e pare só o seu servidor.

- [ ] **Step 3: Memória e commit final**

Acrescente ao arquivo de memória do projeto (`C:\Users\João\.claude\projects\C--\memory\radar-de-vendas-projeto.md`) uma linha: "FUNDOS DO NEGÓCIO (28/09/2026): construído e testado só local na branch `fundos-do-negocio`, NÃO publicado; migração 016 (tabelas funds e fund_rules, coluna expenses.fund_id) precisa de ensaio numa cópia do Neon antes de publicar; publicar só com 'pode publicar'. Spec e plano em docs/superpowers."

```bash
git status --short
git log --oneline -12
```
Expected: árvore limpa e os commits das tarefas 1 a 9 na branch.

- [ ] **Step 4: Parar e avisar o João**

NÃO publicar. Mostrar ao João o resumo do que foi feito e o que ele pode conferir, e perguntar se quer o ensaio da migração 016 numa cópia do Neon (passo a passo, sem senha na conversa) antes de publicar. Publicar só depois do "pode publicar" dele, com merge na main e push, como nas outras vezes.
