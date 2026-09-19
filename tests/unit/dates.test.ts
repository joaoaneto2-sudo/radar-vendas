import { describe, expect, it } from "vitest";
import { addDaysISO, todayBR } from "../../lib/finance/dates";

describe("datas", () => {
  it("soma dias, inclusive virando mês e ano", () => {
    expect(addDaysISO("2026-09-14", 15)).toBe("2026-09-29");
    expect(addDaysISO("2026-09-20", 15)).toBe("2026-10-05");
    expect(addDaysISO("2026-12-25", 15)).toBe("2027-01-09");
    expect(addDaysISO("2026-09-14", 0)).toBe("2026-09-14");
    expect(addDaysISO("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("o ano bissexto de 2028 tem 29 de fevereiro", () => {
    expect(addDaysISO("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysISO("2027-02-28", 1)).toBe("2027-03-01");
  });

  it("hoje no horário de Brasília: às 02:00 UTC do dia 20 ainda é dia 19 no Brasil, e às 03:00 UTC já é dia 20", () => {
    expect(todayBR(Date.UTC(2026, 8, 20, 2, 0, 0))).toBe("2026-09-19");
    expect(todayBR(Date.UTC(2026, 8, 20, 3, 0, 0))).toBe("2026-09-20");
  });
});
