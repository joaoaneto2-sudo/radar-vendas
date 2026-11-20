import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { apagarModelo, listarModelos, problemaDoModelo, salvarModelo } from "../../lib/modelos-catalogo-db";
import { CAPAS } from "../../lib/catalogo-layout";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Catálogos montados pela Fernanda (migração 026).

describe("problemaDoModelo", () => {
  const certo = { nome: "Brincos de dezembro", capa: CAPAS[0], pecas: [3, 1, 2] };
  it("aceita um modelo certo", () => {
    expect(problemaDoModelo(certo)).toBeNull();
  });
  it("recusa sem nome, capa desconhecida, sem peças e peça repetida", () => {
    expect(problemaDoModelo({ ...certo, nome: "  " })).toMatch(/nome/);
    expect(problemaDoModelo({ ...certo, capa: "/outra.jpg" })).toMatch(/capa/);
    expect(problemaDoModelo({ ...certo, pecas: [] })).toMatch(/peça/);
    expect(problemaDoModelo({ ...certo, pecas: [1, 1] })).toMatch(/repetida/);
    expect(problemaDoModelo(null)).not.toBeNull();
  });
});

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("modelos de catálogo no banco", () => {
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

  it("guarda a ordem das peças, lista do mais novo para o mais antigo e apaga", async () => {
    const a = await salvarModelo(pool, { nome: "A", capa: CAPAS[1], pecas: [9, 4, 7], tipos: ["Brincos"] }, "Fernanda");
    const b = await salvarModelo(pool, { nome: "B", capa: CAPAS[0], pecas: [1] }, null);
    const lista = await listarModelos(pool);
    expect(lista.map((m) => m.id)).toEqual([b, a]);
    expect(lista[1]).toMatchObject({ nome: "A", capa: CAPAS[1], pecas: [9, 4, 7], tipos: ["Brincos"], fabricantes: [], criadoPor: "Fernanda" });
    expect(await apagarModelo(pool, a)).toBe(true);
    expect((await listarModelos(pool)).map((m) => m.id)).toEqual([b]);
  });
});
