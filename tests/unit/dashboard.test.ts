import { describe, expect, it } from "vitest";
import {
  comissaoDoAtacado,
  parsePeriodo,
  periodRange,
  porcentagem,
  primeiros,
  receberPorSemana,
  receitaDaEmpresa,
  somarPor,
  ticketMedio,
  totalPorDiaDaSemana,
  valorVendido,
  vendasDoPeriodo,
  vendidoPorTempo,
  type VendaLinha,
} from "../../lib/dashboard";

const HOJE = "2026-09-19"; // sábado

const VENDAS: VendaLinha[] = [
  { sale_date: "2026-09-01", sale_value: "590.00", price_tier: "varejo", payment_method: "Pix à vista", seller: "Fernanda", product_type: "Anel", client_name: "Ana" },
  { sale_date: "2026-09-01", sale_value: "280.00", price_tier: "varejo", payment_method: "Não informada", seller: null, product_type: null, client_name: "Bia" },
  { sale_date: "2026-09-14", sale_value: "600.00", price_tier: "consignado", payment_method: "Pix a prazo", seller: "João", client_name: "Lu" },
  { sale_date: "2026-09-15", sale_value: "1500.00", price_tier: "atacado", commission_pct: 20, payment_method: "Pix direto ao fabricante", client_name: "Revendedora" },
  { sale_date: "2026-08-20", sale_value: "100.00", price_tier: "varejo", client_name: "Antiga" },
  { sale_date: "2026-09-10", sale_value: "999.00", price_tier: "varejo", status: "cancelada", client_name: "Cancelada" },
];

describe("períodos", () => {
  it("cada período tem o seu intervalo", () => {
    expect(periodRange("semana", HOJE)).toEqual({ from: "2026-09-13", to: HOJE });
    expect(periodRange("mes", HOJE)).toEqual({ from: "2026-09-01", to: HOJE });
    expect(periodRange("ano", HOJE)).toEqual({ from: "2026-01-01", to: HOJE });
    expect(periodRange("tudo", HOJE)).toEqual({ from: null, to: HOJE });
  });

  it("período desconhecido vira 'Este mês'", () => {
    expect(parsePeriodo(undefined)).toBe("mes");
    expect(parsePeriodo("lixo")).toBe("mes");
    expect(parsePeriodo("ano")).toBe("ano");
  });

  it("filtra por período e tira as canceladas", () => {
    const mes = vendasDoPeriodo(VENDAS, periodRange("mes", HOJE));
    expect(mes.map((v) => v.client_name)).toEqual(["Ana", "Bia", "Lu", "Revendedora"]);
    expect(vendasDoPeriodo(VENDAS, periodRange("tudo", HOJE))).toHaveLength(5);
  });
});

describe("o que é vendido e o que é receita da empresa", () => {
  it("atacado não entra no vendido; a receita dele é a comissão", () => {
    const atacado = VENDAS[3];
    expect(valorVendido(atacado)).toBe(0);
    expect(comissaoDoAtacado(atacado)).toBe(30000);
    expect(receitaDaEmpresa(atacado)).toBe(30000);
    expect(receitaDaEmpresa(VENDAS[0])).toBe(59000);
  });

  it("atacado de fabricante que não é representado não gera comissão", () => {
    expect(comissaoDoAtacado({ sale_date: "2026-09-01", sale_value: "1000", price_tier: "atacado", commission_pct: null })).toBe(0);
  });

  it("ticket médio só conta varejo e consignado", () => {
    const mes = vendasDoPeriodo(VENDAS, periodRange("mes", HOJE));
    expect(ticketMedio(mes)).toBe(Math.round((59000 + 28000 + 60000) / 3));
    expect(ticketMedio([])).toBe(0);
  });
});

describe("vendido ao longo do tempo", () => {
  it("por dia, com zero nos dias sem venda", () => {
    const pontos = vendidoPorTempo(VENDAS, "semana", periodRange("semana", HOJE));
    expect(pontos).toHaveLength(7);
    expect(pontos[0]).toMatchObject({ chave: "2026-09-13", rotulo: "13/09", cents: 0 });
    expect(pontos.find((p) => p.chave === "2026-09-14")?.cents).toBe(60000);
    expect(pontos.find((p) => p.chave === "2026-09-15")?.cents).toBe(0); // atacado não conta
  });

  it("no mês, um ponto por dia desde o dia 1", () => {
    const pontos = vendidoPorTempo(VENDAS, "mes", periodRange("mes", HOJE));
    expect(pontos).toHaveLength(19);
    expect(pontos[0]).toMatchObject({ chave: "2026-09-01", cents: 59000 + 28000 });
  });

  it("no ano e em 'tudo', um ponto por mês, sem pular meses", () => {
    const tudo = vendidoPorTempo(VENDAS, "tudo", periodRange("tudo", HOJE));
    expect(tudo.map((p) => p.rotulo)).toEqual(["ago/26", "set/26"]);
    expect(tudo.map((p) => p.cents)).toEqual([10000, 59000 + 28000 + 60000]);
    const ano = vendidoPorTempo(VENDAS, "ano", periodRange("ano", HOJE));
    expect(ano.map((p) => p.rotulo)).toEqual(["ago/26", "set/26"]);
  });

  it("sem nenhuma venda, ainda devolve o mês atual", () => {
    expect(vendidoPorTempo([], "tudo", periodRange("tudo", HOJE))).toEqual([{ chave: "2026-09", rotulo: "set/26", cents: 0 }]);
  });
});

describe("agrupamentos", () => {
  it("soma por chave, do maior para o menor, com nome para o vazio", () => {
    const mes = vendasDoPeriodo(VENDAS, periodRange("mes", HOJE));
    const porVendedora = somarPor(mes, (v) => v.seller, valorVendido, "Sem vendedora");
    expect(porVendedora.map((p) => [p.rotulo, p.cents])).toEqual([
      ["João", 60000],
      ["Fernanda", 59000],
      ["Sem vendedora", 28000],
    ]);
  });

  it("os N maiores e o resto em 'Outros'", () => {
    const partes = [
      { rotulo: "A", cents: 500, quantidade: 5 },
      { rotulo: "B", cents: 400, quantidade: 4 },
      { rotulo: "C", cents: 300, quantidade: 3 },
      { rotulo: "D", cents: 200, quantidade: 2 },
    ];
    expect(primeiros(partes, 2).map((p) => p.rotulo)).toEqual(["A", "B", "Outros"]);
    expect(primeiros(partes, 2)[2]).toEqual({ rotulo: "Outros", cents: 500, quantidade: 5 });
    expect(primeiros(partes, 10)).toHaveLength(4);
  });

  it("dia da semana: domingo a sábado", () => {
    const mes = vendasDoPeriodo(VENDAS, periodRange("mes", HOJE));
    const semana = totalPorDiaDaSemana(mes);
    expect(semana.map((p) => p.rotulo)).toEqual(["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]);
    // 01/09/2026 foi uma terça; 14/09 foi uma segunda
    expect(semana[2].cents).toBe(59000 + 28000);
    expect(semana[1].cents).toBe(60000);
  });
});

describe("a receber por semana", () => {
  it("separa atrasadas, semanas futuras, depois e sem data", () => {
    const pontos = receberPorSemana(
      [
        { due_date: "2026-09-10", amount: "100.00" }, // atrasada
        { due_date: "2026-09-19", amount: "50.00" }, // hoje = esta semana
        { due_date: "2026-09-25", amount: "140.00" }, // esta semana (até 25/09)
        { due_date: "2026-09-26", amount: "10.00" }, // semana seguinte
        { due_date: "2026-12-01", amount: "300.00" }, // depois
        { due_date: null, amount: "25.50" }, // sem data
      ],
      HOJE,
      3
    );
    expect(pontos.map((p) => p.rotulo)).toEqual(["Atrasadas", "Esta semana", "26/09", "03/10", "Depois", "Sem data"]);
    expect(pontos.map((p) => p.cents)).toEqual([10000, 5000 + 14000, 1000, 0, 30000, 2550]);
  });

  it("nada a receber: tudo zero", () => {
    expect(receberPorSemana([], HOJE).every((p) => p.cents === 0)).toBe(true);
  });
});

describe("porcentagem", () => {
  it("arredonda e não dá erro com total zero", () => {
    expect(porcentagem(1, 3)).toBe(33);
    expect(porcentagem(50, 0)).toBe(0);
    expect(porcentagem(200, 100)).toBe(200);
  });
});
