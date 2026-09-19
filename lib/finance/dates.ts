// Datas como texto AAAA-MM-DD, sem fuso horário (para não errar o dia).

/** Soma dias a uma data. Ex.: addDaysISO("2026-09-14", 15) devolve "2026-09-29". */
export function addDaysISO(data: string, dias: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const somada = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return somada.toISOString().slice(0, 10);
}

/** Hoje no horário de Brasília (UTC-3), como AAAA-MM-DD. */
export function todayBR(agoraEmMs: number = Date.now()): string {
  return new Date(agoraEmMs - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
