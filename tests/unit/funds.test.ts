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
