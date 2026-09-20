import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../lib/migrations";
import {
  carregarPecas,
  carregarVagas,
  carrosselCheio,
  reconciliarPeca,
  removerCategoria,
  salvarCarrossel,
  salvarCategoria,
} from "../../lib/vitrine-db";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("vitrine: funções de banco", () => {
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
    await pool.query(`DELETE FROM products`);
  });

  async function peca(
    nome: string,
    o: { site?: boolean; featured?: boolean; foto?: string | null; categoria?: string; canal?: string } = {}
  ): Promise<number> {
    const { rows } = await pool.query(
      `INSERT INTO products (name, price, category, photo_url, show_online, featured, sale_channel, public_description)
       VALUES ($1, 100, $2, $3, $4, $5, $6, 'texto') RETURNING id`,
      [nome, o.categoria ?? "Anéis", o.foto === undefined ? `https://x/${nome}.jpg` : o.foto, o.site ?? true, o.featured ?? false, o.canal ?? "varejo"]
    );
    return rows[0].id;
  }

  it("carregarPecas: marca quem está publicada e junta as fotos (principal primeiro)", async () => {
    const a = await peca("A");
    await peca("B", { site: false });
    await peca("C", { canal: "atacado", site: false });
    await pool.query(`INSERT INTO product_photos (product_id, url, position) VALUES ($1, 'https://x/A-2.jpg', 2), ($1, 'https://x/A-1.jpg', 1)`, [a]);
    const pecas = await carregarPecas(pool);
    const porNome = Object.fromEntries(pecas.map((p) => [p.name, p]));
    expect(porNome.A).toMatchObject({ publicada: true, fotos: ["https://x/A.jpg", "https://x/A-1.jpg", "https://x/A-2.jpg"] });
    expect(porNome.B.publicada).toBe(false);
    expect(porNome.C.publicada).toBe(false);
  });

  it("salvarCarrossel: troca a lista na ordem e ajusta featured", async () => {
    const a = await peca("A", { featured: true });
    const b = await peca("B");
    const c = await peca("C");
    await salvarCarrossel(pool, [{ product_id: b, photo_url: "https://x/B.jpg" }, { product_id: c, photo_url: "https://x/C.jpg" }]);
    let vagas = (await carregarVagas(pool)).filter((v) => v.area === "carrossel");
    expect(vagas.map((v) => [v.product_id, v.position])).toEqual([[b, 0], [c, 1]]);
    const { rows } = await pool.query(`SELECT name, featured FROM products ORDER BY name`);
    expect(rows).toEqual([{ name: "A", featured: false }, { name: "B", featured: true }, { name: "C", featured: true }]);
    // trocar a ordem e tirar uma
    await salvarCarrossel(pool, [{ product_id: c, photo_url: "https://x/C.jpg" }]);
    vagas = (await carregarVagas(pool)).filter((v) => v.area === "carrossel");
    expect(vagas.map((v) => v.product_id)).toEqual([c]);
    expect((await pool.query(`SELECT featured FROM products WHERE id = $1`, [b])).rows[0].featured).toBe(false);
    // lista vazia esvazia o carrossel
    await salvarCarrossel(pool, []);
    expect((await carregarVagas(pool)).length).toBe(0);
    expect(a).toBeGreaterThan(0);
  });

  it("categoria: escolher, trocar e voltar ao automático", async () => {
    const a = await peca("A");
    await salvarCategoria(pool, { category: "Anéis", product_id: a, photo_url: "https://x/A.jpg" });
    await salvarCategoria(pool, { category: "Anéis", product_id: a, photo_url: "https://x/A-2.jpg" });
    let vagas = (await carregarVagas(pool)).filter((v) => v.area === "categoria");
    expect(vagas).toHaveLength(1);
    expect(vagas[0]).toMatchObject({ category: "Anéis", photo_url: "https://x/A-2.jpg", publicada: true, peca_nome: "A" });
    await removerCategoria(pool, "Anéis");
    vagas = (await carregarVagas(pool)).filter((v) => v.area === "categoria");
    expect(vagas).toHaveLength(0);
  });

  it("carrosselCheio: só é cheio para peça que ainda não está e com 8 outras", async () => {
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) ids.push(await peca(`P${i}`));
    await salvarCarrossel(pool, ids.map((id, i) => ({ product_id: id, photo_url: `https://x/P${i}.jpg` })));
    const nova = await peca("Nova");
    expect(await carrosselCheio(pool, nova)).toBe(true);
    expect(await carrosselCheio(pool, 0)).toBe(true); // peça ainda não criada
    expect(await carrosselCheio(pool, ids[0])).toBe(false); // já está: mexer nela não passa do limite
  });

  it("reconciliarPeca: carrossel ligado ganha vaga com a foto principal; desligado perde", async () => {
    const a = await peca("A", { featured: true });
    expect((await reconciliarPeca(pool, a)).removidas).toEqual([]);
    let vagas = (await carregarVagas(pool)).filter((v) => v.area === "carrossel");
    expect(vagas).toMatchObject([{ product_id: a, photo_url: "https://x/A.jpg", position: 0 }]);
    await pool.query(`UPDATE products SET featured = false WHERE id = $1`, [a]);
    await reconciliarPeca(pool, a);
    vagas = (await carregarVagas(pool)).filter((v) => v.area === "carrossel");
    expect(vagas).toHaveLength(0);
  });

  it("reconciliarPeca: vaga que aponta para foto que saiu da peça é removida, e o carrossel volta para a principal", async () => {
    const a = await peca("A", { featured: true });
    await pool.query(`INSERT INTO product_photos (product_id, url, position) VALUES ($1, 'https://x/A-extra.jpg', 0)`, [a]);
    await salvarCarrossel(pool, [{ product_id: a, photo_url: "https://x/A-extra.jpg" }]);
    await salvarCategoria(pool, { category: "Anéis", product_id: a, photo_url: "https://x/A-extra.jpg" });
    await pool.query(`DELETE FROM product_photos WHERE product_id = $1`, [a]); // a foto extra foi apagada
    const { removidas } = await reconciliarPeca(pool, a);
    expect(removidas.map((r) => r.area).sort()).toEqual(["carrossel", "categoria"]);
    const vagas = await carregarVagas(pool);
    expect(vagas).toMatchObject([{ area: "carrossel", product_id: a, photo_url: "https://x/A.jpg" }]); // volta para a principal
  });

  it("reconciliarPeca: tirar do site tira a vaga do carrossel, mas guarda a foto de categoria", async () => {
    const a = await peca("A", { featured: true });
    await reconciliarPeca(pool, a);
    await salvarCategoria(pool, { category: "Anéis", product_id: a, photo_url: "https://x/A.jpg" });
    await pool.query(`UPDATE products SET show_online = false, featured = false WHERE id = $1`, [a]);
    await reconciliarPeca(pool, a);
    const vagas = await carregarVagas(pool);
    expect(vagas.map((v) => v.area)).toEqual(["categoria"]);
    expect(vagas[0].publicada).toBe(false);
  });
});
