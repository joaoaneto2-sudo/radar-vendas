// Lê e confere os dados de um fabricante vindos da tela.
// Fabricante representado precisa ter o percentual de comissão; o prazo padrão é 15 dias.

export type ManufacturerBody =
  | {
      ok: true;
      name: string;
      represented: boolean;
      commissionPct: number | null;
      commissionDays: number;
      wholesaleMode: "pronta_entrega" | "encomenda";
    }
  | { ok: false; error: string; message: string };

export function parseManufacturerBody(body: Record<string, unknown>): ManufacturerBody {
  const name = String(body.name ?? "").trim();
  if (!name) return { ok: false, error: "missing_name", message: "Informe o nome do fabricante." };

  const represented = body.represented === true || body.represented === "true";

  let commissionPct: number | null = null;
  if (represented) {
    const bruto = body.commission_pct;
    const numero = bruto === "" || bruto === null || bruto === undefined ? NaN : Number(bruto);
    if (Number.isNaN(numero)) {
      return {
        ok: false,
        error: "commission_required",
        message: "Informe o percentual de comissão do fabricante que vocês representam.",
      };
    }
    if (numero < 0 || numero > 100) {
      return { ok: false, error: "commission_range", message: "A comissão precisa estar entre 0% e 100%." };
    }
    commissionPct = Math.round(numero * 100) / 100;
  }

  const diasBruto = body.commission_days;
  const dias =
    diasBruto === "" || diasBruto === null || diasBruto === undefined ? 15 : Math.trunc(Number(diasBruto));
  if (Number.isNaN(dias) || dias < 0 || dias > 365) {
    return { ok: false, error: "days_range", message: "O prazo precisa ser um número de dias entre 0 e 365." };
  }

  const wholesaleMode = body.wholesale_mode === "encomenda" ? "encomenda" : "pronta_entrega";

  return { ok: true, name, represented, commissionPct, commissionDays: dias, wholesaleMode };
}
