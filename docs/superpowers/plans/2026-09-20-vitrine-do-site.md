# Vitrine do site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O João escolhe pelo Radar quais peças aparecem na loja e qual foto vai em cada área do site (carrossel do topo, foto de cada categoria, capa de cada peça), com bloqueio de publicar peça incompleta.

**Architecture:** Uma tabela nova `site_slots` (migração 012, só acrescenta) guarda as "vagas" de foto. O Radar ganha regras de publicar, API `/api/vitrine`, a tela "Vitrine do site" e o botão "Tornar principal". O usuário de leitura da loja ganha SELECT nas 5 colunas de `site_slots`, e a loja passa a usar as vagas no carrossel e nas categorias.

**Tech Stack:** Next.js 14 (App Router), TypeScript estrito, React 18, CSS puro (`app/globals.css`), `pg`, Postgres (Neon), Vitest 3. Loja: Next.js 14, Vitest, PGlite.

**Spec:** `docs/superpowers/specs/2026-09-20-vitrine-do-site-design.md` (ler antes de começar).

## Global Constraints

- Todo texto de tela e de mensagem em português do Brasil simples. **Sem travessão** (nenhum "—") em textos do sistema, documentos ou commits.
- Dinheiro em centavos inteiros nas contas (`lib/finance/money.ts`). Campo vazio é "sem valor", nunca zero.
- Migrações só acrescentam. Nunca renomear nem apagar coisa que já existe. A migração roda sozinha no banco real na primeira chamada.
- Limite do carrossel: **8** destaques (`MAX_CARROSSEL`), o mesmo que a loja usa hoje.
- Regra de visibilidade da loja (a mesma da consulta dela): `p.sale_channel = 'varejo' AND p.active = true AND p.show_online = true AND p.price > 0`.
- Cuidado com fim de linha: os arquivos do Windows ficam com CRLF na pasta e LF no Git (`core.autocrlf=true`). Edite com as ferramentas Edit/Write. **Não** reescreva arquivos inteiros com scripts que dividem e juntam linhas sem detectar o fim de linha (já duplicou `\r` no `globals.css` uma vez).
- Testes de banco só rodam em banco local descartável (`tests/db/helpers.ts`). Nunca apontar para o Neon.
- Nunca dar `git push` de branch. Publicar só com o "pode publicar" do João dito na hora.
- Commits terminam com a linha `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Trabalho na branch `vitrine-do-site` do Radar (`C:\Users\João\Documents\radar-vendas`). A parte da loja é feita no projeto `C:\Users\João\Documents\loja-fernanda-brilhante` (Tasks 10 e 11), em branch própria `vitrine-do-site`.
- Rodar sempre no fim de cada task: `npx tsc --noEmit -p .` e os testes citados.

## Mapa de arquivos (Radar)

| Arquivo | O que faz |
|---|---|
| `lib/store-rules.ts` (editar) | Regra de publicar: `faltaParaPublicar`, `mensagemDeFalta`; `StoreContext.photoUrl`; erro `incomplete_for_site` |
| `lib/migrations.ts` (editar) | Migração 012: tabela `site_slots` |
| `lib/vitrine.ts` (novo) | Regras puras: `MAX_CARROSSEL`, `fotosDaPeca`, `validarCarrossel`, `validarCategoria`, `avisoDeVagasRemovidas` |
| `lib/vitrine-db.ts` (novo) | SQL da vitrine: `carregarPecas`, `carregarVagas`, `salvarCarrossel`, `salvarCategoria`, `removerCategoria`, `carrosselCheio`, `reconciliarPeca` |
| `app/api/vitrine/route.ts` (novo) | `GET /api/vitrine` |
| `app/api/vitrine/carrossel/route.ts` (novo) | `PUT` lista do carrossel |
| `app/api/vitrine/categoria/route.ts` (novo) | `PUT` e `DELETE` foto de categoria |
| `app/api/products/route.ts`, `app/api/products/[id]/route.ts`, `app/api/products/[id]/store/route.ts` (editar) | Usam a regra de publicar e reconciliam as vagas |
| `app/api/products/[id]/photos/route.ts` (editar) | Apagar foto reconcilia as vagas |
| `app/api/products/[id]/photos/principal/route.ts` (novo) | `POST` tornar principal |
| `app/cadastros/loja-online-section.tsx`, `app/cadastros/produtos-tab.tsx` (editar) | Botão "Tornar principal", etiqueta "Incompleta", avisos |
| `app/loja-online/vitrine/page.tsx` (novo) | Tela "Vitrine do site" |
| `app/nav-bar.tsx`, `app/globals.css` (editar) | Menu e estilos |
| `scripts/loja-usuario-leitura.sql`, `scripts/ensaio-loja-leitura.mjs`, `docs/loja-contrato.md` (editar) | Contrato de leitura |
| `tests/unit/store-rules.test.ts`, `tests/unit/vitrine.test.ts` (novo), `tests/db/vitrine.db.test.ts` (novo), `tests/db/vitrine-db.db.test.ts` (novo), `tests/db/store.db.test.ts` (editar) | Testes |

---

### Task 1: Regra de publicar (foto principal, preço e descrição)

**Files:**
- Modify: `lib/store-rules.ts`
- Modify: `app/api/products/route.ts:65`, `app/api/products/[id]/route.ts:48-59`, `app/api/products/[id]/store/route.ts:24-41`
- Test: `tests/unit/store-rules.test.ts`

**Interfaces:**
- Produces: `faltaParaPublicar(p: { photoUrl?: string | null; price?: number | string | null; description?: string | null }): string[]` (lista de rótulos que faltam, na ordem `foto principal`, `preço`, `descrição`), `mensagemDeFalta(falta: string[]): string`, e `StoreContext` ganha `photoUrl: string | null | undefined`. Novo erro de `resolveStoreFields`: `incomplete_for_site`.

- [ ] **Step 1: Escrever os testes novos (falham)**

Em `tests/unit/store-rules.test.ts`, trocar o import e as constantes do topo por:

```ts
import { describe, expect, it } from "vitest";
import {
  WHOLESALE_BLOCK_MESSAGE,
  faltaParaPublicar,
  mensagemDeFalta,
  parseStoreSettings,
  readMoneyOrNull,
  resolveStoreFields,
  rowsToSettings,
  settingsToRows,
  type StoreState,
} from "../../lib/store-rules";

const TEXTO = "Solitário delicado com zircônia.";
const FORA: StoreState = { show_online: false, featured: false, sale_price: null, public_description: null };
const PRONTA_FORA: StoreState = { ...FORA, public_description: TEXTO };
const NO_SITE: StoreState = { show_online: true, featured: false, sale_price: null, public_description: TEXTO };
const VAREJO = { saleChannel: "varejo", price: 200, photoUrl: "https://x/a.jpg" };
```

Nos dois testes `liga e desliga o site` e `carrossel só liga com o site ligado`, trocar o segundo argumento **`FORA`** por **`PRONTA_FORA`** nas chamadas que ligam `show_online: true` (as três linhas que começam com `resolveStoreFields({ show_online: true }, FORA, VAREJO)`, `resolveStoreFields({ featured: true }, FORA, VAREJO)` (essa continua `FORA`, porque o erro esperado vem antes) e `resolveStoreFields({ show_online: true, featured: true }, FORA, VAREJO)`). Em `peça de atacado`, o contexto passa a ter `photoUrl`: `{ saleChannel: "atacado", price: 200, photoUrl: "https://x/a.jpg" }` nas duas chamadas.

Acrescentar no fim do arquivo:

```ts
describe("regra de publicar: foto principal, preço e descrição", () => {
  it("lista o que falta, sempre na mesma ordem", () => {
    expect(faltaParaPublicar({ photoUrl: null, price: null, description: null })).toEqual(["foto principal", "preço", "descrição"]);
    expect(faltaParaPublicar({ photoUrl: "https://x/a.jpg", price: 0, description: "  " })).toEqual(["preço", "descrição"]);
    expect(faltaParaPublicar({ photoUrl: "  ", price: "89.90", description: "ok" })).toEqual(["foto principal"]);
    expect(faltaParaPublicar({ photoUrl: "https://x/a.jpg", price: "89.90", description: "ok" })).toEqual([]);
  });

  it("mensagem em português, no singular e no plural", () => {
    expect(mensagemDeFalta(["descrição"])).toBe("Falta: descrição para ir para o site.");
    expect(mensagemDeFalta(["foto principal", "descrição"])).toBe("Faltam: foto principal e descrição para ir para o site.");
    expect(mensagemDeFalta(["foto principal", "preço", "descrição"])).toBe("Faltam: foto principal, preço e descrição para ir para o site.");
  });

  it("bloqueia ligar o site sem foto, preço ou descrição", () => {
    const r = resolveStoreFields({ show_online: true }, FORA, VAREJO);
    expect(r).toEqual({ ok: false, error: "incomplete_for_site", message: "Falta: descrição para ir para o site." });
    const semFoto = resolveStoreFields({ show_online: true }, PRONTA_FORA, { ...VAREJO, photoUrl: null });
    expect(semFoto).toMatchObject({ ok: false, error: "incomplete_for_site" });
    const semPreco = resolveStoreFields({ show_online: true }, PRONTA_FORA, { ...VAREJO, price: null });
    expect(semPreco).toMatchObject({ ok: false, error: "incomplete_for_site" });
  });

  it("peça já publicada também não pode ficar sem descrição ou foto", () => {
    expect(resolveStoreFields({ public_description: "" }, NO_SITE, VAREJO)).toMatchObject({ ok: false, error: "incomplete_for_site" });
    expect(resolveStoreFields({}, NO_SITE, { ...VAREJO, photoUrl: null })).toMatchObject({ ok: false, error: "incomplete_for_site" });
  });

  it("tirar do site nunca é bloqueado, mesmo incompleta", () => {
    expect(resolveStoreFields({ show_online: false }, NO_SITE, { ...VAREJO, photoUrl: null })).toMatchObject({ ok: true, value: { show_online: false } });
  });

  it("descrição e foto completas deixam publicar", () => {
    expect(resolveStoreFields({ show_online: true }, PRONTA_FORA, VAREJO)).toMatchObject({ ok: true, value: { show_online: true } });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/store-rules.test.ts`
Expected: FAIL (`faltaParaPublicar` não existe / TypeScript reclama de `photoUrl`).

- [ ] **Step 3: Implementar em `lib/store-rules.ts`**

Trocar a interface `StoreContext` por:

```ts
export interface StoreContext {
  saleChannel: string | null | undefined; // "varejo" ou "atacado"
  price: number | null; // preço normal da peça
  photoUrl: string | null | undefined; // foto principal da peça
}
```

Acrescentar, logo antes de `export function resolveStoreFields`:

```ts
/** O que falta para a peça poder ir para o site: foto principal, preço maior que zero e descrição. */
export function faltaParaPublicar(p: {
  photoUrl?: string | null;
  price?: number | string | null;
  description?: string | null;
}): string[] {
  const falta: string[] = [];
  if (!p.photoUrl || String(p.photoUrl).trim() === "") falta.push("foto principal");
  const preco = p.price === null || p.price === undefined || p.price === "" ? null : Number(p.price);
  if (preco === null || !Number.isFinite(preco) || preco <= 0) falta.push("preço");
  if (!p.description || p.description.trim() === "") falta.push("descrição");
  return falta;
}

export function mensagemDeFalta(falta: string[]): string {
  const lista = falta.length <= 1 ? falta.join("") : `${falta.slice(0, -1).join(", ")} e ${falta[falta.length - 1]}`;
  return `${falta.length === 1 ? "Falta" : "Faltam"}: ${lista} para ir para o site.`;
}
```

Dentro de `resolveStoreFields`, logo depois do bloco que calcula `description` (antes do `return { ok: true, ...}` final), inserir:

```ts
  if (showOnline) {
    const falta = faltaParaPublicar({ photoUrl: ctx.photoUrl, price: ctx.price, description });
    if (falta.length > 0) return { ok: false, error: "incomplete_for_site", message: mensagemDeFalta(falta) };
  }
```

- [ ] **Step 4: Passar a foto principal nas três rotas**

`app/api/products/route.ts` (linha 65), trocar por:

```ts
  const loja = resolveStoreFields(body, LOJA_INICIAL, { saleChannel, price, photoUrl: body.photo_url || null });
```

`app/api/products/[id]/route.ts`, no objeto do quarto argumento de `resolveStoreFields`, trocar `{ saleChannel, price }` por `{ saleChannel, price, photoUrl: body.photo_url || null }`.

`app/api/products/[id]/store/route.ts`: na consulta `SELECT show_online, featured, sale_price, public_description, sale_channel, price FROM products WHERE id = $1` acrescentar `, photo_url` no fim do SELECT, e trocar o contexto por:

```ts
      { saleChannel: p.sale_channel, price: p.price === null ? null : Number(p.price), photoUrl: p.photo_url }
```

- [ ] **Step 5: Rodar tudo**

Run: `npx tsc --noEmit -p . ; npx vitest run tests/unit/store-rules.test.ts`
Expected: sem erro de tipo; testes PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/store-rules.ts app/api/products tests/unit/store-rules.test.ts
git commit -m "Regra de publicar: foto principal, preco e descricao"
```

---

### Task 2: Migração 012 (tabela `site_slots`)

**Files:**
- Modify: `lib/migrations.ts` (acrescentar depois da migração `011`, antes do `];`)
- Modify: `tests/db/store.db.test.ts:140`
- Create: `tests/db/vitrine.db.test.ts`

**Interfaces:**
- Produces: tabela `site_slots(id, area, category, position, product_id, photo_url, created_at)`. `area` só aceita `carrossel` ou `categoria`. Índices únicos parciais: um `product_id` por vaga de carrossel, uma `category` por vaga de categoria.

- [ ] **Step 1: Escrever o teste (falha)**

Criar `tests/db/vitrine.db.test.ts`:

```ts
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../../lib/migrations";
import { bancoDeTesteDisponivel, criarBancoDescartavel } from "./helpers";

// Vitrine do site: a tabela de vagas (migração 012) e as regras que o próprio banco garante.

const disponivel = await bancoDeTesteDisponivel();

describe.skipIf(!disponivel)("vitrine do site no banco (migração 012)", () => {
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

  async function novaPeca(nome: string): Promise<number> {
    const { rows } = await pool.query(`INSERT INTO products (name, price) VALUES ($1, 100) RETURNING id`, [nome]);
    return rows[0].id;
  }

  it("cria a tabela com as colunas combinadas", async () => {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'site_slots' ORDER BY column_name`
    );
    expect(rows.map((r) => r.column_name)).toEqual(["area", "category", "created_at", "id", "photo_url", "position", "product_id"]);
  });

  it("carrossel: a mesma peça não entra duas vezes", async () => {
    await pool.query(`DELETE FROM products`);
    const a = await novaPeca("A");
    await pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, 'https://x/a.jpg')`, [a]);
    await expect(
      pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 1, $1, 'https://x/a2.jpg')`, [a])
    ).rejects.toThrow();
  });

  it("categoria: uma foto escolhida por categoria; mas a mesma peça pode estar no carrossel e numa categoria", async () => {
    await pool.query(`DELETE FROM products`);
    const a = await novaPeca("A");
    const b = await novaPeca("B");
    await pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, 'https://x/a.jpg')`, [a]);
    await pool.query(`INSERT INTO site_slots (area, category, product_id, photo_url) VALUES ('categoria', 'Anéis', $1, 'https://x/a.jpg')`, [a]);
    await expect(
      pool.query(`INSERT INTO site_slots (area, category, product_id, photo_url) VALUES ('categoria', 'Anéis', $1, 'https://x/b.jpg')`, [b])
    ).rejects.toThrow();
    await pool.query(`INSERT INTO site_slots (area, category, product_id, photo_url) VALUES ('categoria', 'Brincos', $1, 'https://x/b.jpg')`, [b]);
  });

  it("área e categoria seguem as regras", async () => {
    await pool.query(`DELETE FROM products`);
    const a = await novaPeca("A");
    await expect(pool.query(`INSERT INTO site_slots (area, product_id, photo_url) VALUES ('banner', $1, 'https://x/a.jpg')`, [a])).rejects.toThrow();
    await expect(pool.query(`INSERT INTO site_slots (area, product_id, photo_url) VALUES ('categoria', $1, 'https://x/a.jpg')`, [a])).rejects.toThrow(); // sem categoria
    await expect(pool.query(`INSERT INTO site_slots (area, category, product_id, photo_url) VALUES ('categoria', '  ', $1, 'https://x/a.jpg')`, [a])).rejects.toThrow();
    await expect(pool.query(`INSERT INTO site_slots (area, category, position, product_id, photo_url) VALUES ('carrossel', 'Anéis', 0, $1, 'https://x/a.jpg')`, [a])).rejects.toThrow(); // carrossel não tem categoria
    await expect(pool.query(`INSERT INTO site_slots (area, product_id, photo_url) VALUES ('carrossel', 999999, 'https://x/a.jpg')`)).rejects.toThrow(); // peça inexistente
  });

  it("apagar a peça apaga as vagas dela", async () => {
    await pool.query(`DELETE FROM products`);
    const a = await novaPeca("A");
    await pool.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, 'https://x/a.jpg')`, [a]);
    await pool.query(`INSERT INTO site_slots (area, category, product_id, photo_url) VALUES ('categoria', 'Anéis', $1, 'https://x/a.jpg')`, [a]);
    await pool.query(`DELETE FROM products WHERE id = $1`, [a]);
    expect((await pool.query(`SELECT count(*)::int AS n FROM site_slots`)).rows[0].n).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/db/vitrine.db.test.ts`
Expected: FAIL (`relation "site_slots" does not exist`). Se o teste for ignorado ("skipped"), o banco local do Docker não está ligado: subir o Postgres de testes antes.

- [ ] **Step 3: Escrever a migração**

Em `lib/migrations.ts`, logo depois do `}` que fecha a migração `"011"` e antes de `];`, acrescentar:

```ts
  {
    id: "012",
    name: "vitrine do site: vagas de foto (carrossel e categorias)",
    statements: [
      // Cada vaga guarda uma foto escolhida pelo João para uma área do site. A foto tem de ser uma foto da
      // peça: quem confere isso é a API (o banco não consegue ver os dois lugares onde as fotos ficam).
      `CREATE TABLE IF NOT EXISTS site_slots (
        id SERIAL PRIMARY KEY,
        area TEXT NOT NULL CHECK (area IN ('carrossel', 'categoria')),
        category TEXT,
        position INT NOT NULL DEFAULT 0,
        product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        photo_url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (
          (area = 'categoria' AND category IS NOT NULL AND btrim(category) <> '')
          OR (area = 'carrossel' AND category IS NULL)
        )
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS site_slots_carrossel_peca_idx ON site_slots (product_id) WHERE area = 'carrossel'`,
      `CREATE UNIQUE INDEX IF NOT EXISTS site_slots_categoria_idx ON site_slots (category) WHERE area = 'categoria'`,
      `CREATE INDEX IF NOT EXISTS site_slots_area_posicao_idx ON site_slots (area, position)`,
    ],
  },
```

- [ ] **Step 4: Ajustar o teste antigo que conta migrações**

Em `tests/db/store.db.test.ts`, a linha que hoje é `expect(await runMigrations(banco.pool)).toEqual(["011"]);` passa a ser:

```ts
        expect(await runMigrations(banco.pool)).toEqual(["011", "012"]);
```

- [ ] **Step 5: Rodar**

Run: `npx vitest run tests/db/vitrine.db.test.ts tests/db/store.db.test.ts tests/db/migrations.db.test.ts`
Expected: PASS. (Se `migrations.db.test.ts` contar migrações, ajustar o número esperado do mesmo jeito.)

- [ ] **Step 6: Commit**

```bash
git add lib/migrations.ts tests/db
git commit -m "Migracao 012: tabela site_slots (vagas de foto da vitrine)"
```

---

### Task 3: Regras puras da vitrine (`lib/vitrine.ts`)

**Files:**
- Create: `lib/vitrine.ts`
- Test: `tests/unit/vitrine.test.ts`

**Interfaces:**
- Produces:
  - `MAX_CARROSSEL = 8`
  - `interface PecaDaVitrine { id: number; name: string | null; category: string | null; publicada: boolean; fotos: string[] }` (`fotos` com a principal primeiro, sem repetição)
  - `interface VagaCarrossel { product_id: number; photo_url: string }`
  - `interface VagaCategoria { category: string; product_id: number; photo_url: string }`
  - `type Resultado<T> = { ok: true; value: T } | { ok: false; error: string; message: string }`
  - `fotosDaPeca(principal, extras): string[]`
  - `validarCarrossel(entrada: unknown, pecas: PecaDaVitrine[]): Resultado<VagaCarrossel[]>`
  - `validarCategoria(entrada: unknown, pecas: PecaDaVitrine[]): Resultado<VagaCategoria>`
  - `avisoDeVagasRemovidas(v: { area: string; category: string | null }[]): string | null`

- [ ] **Step 1: Escrever os testes (falham)**

Criar `tests/unit/vitrine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  MAX_CARROSSEL,
  avisoDeVagasRemovidas,
  fotosDaPeca,
  validarCarrossel,
  validarCategoria,
  type PecaDaVitrine,
} from "../../lib/vitrine";

const PECAS: PecaDaVitrine[] = [
  { id: 1, name: "Anel Solitário", category: "Anéis", publicada: true, fotos: ["https://x/1a.jpg", "https://x/1b.jpg"] },
  { id: 2, name: "Brinco Argola", category: "Brincos", publicada: true, fotos: ["https://x/2a.jpg"] },
  { id: 3, name: "Colar escondido", category: "Colares e Correntes", publicada: false, fotos: ["https://x/3a.jpg"] },
];

describe("fotos da peça", () => {
  it("principal primeiro, sem repetir e sem vazias", () => {
    expect(fotosDaPeca("a.jpg", ["b.jpg", "a.jpg", "  ", "c.jpg"])).toEqual(["a.jpg", "b.jpg", "c.jpg"]);
    expect(fotosDaPeca(null, ["b.jpg"])).toEqual(["b.jpg"]);
    expect(fotosDaPeca(undefined, [])).toEqual([]);
  });
});

describe("validar o carrossel", () => {
  it("aceita uma lista boa e mantém a ordem", () => {
    const r = validarCarrossel([{ product_id: 2, photo_url: "https://x/2a.jpg" }, { product_id: 1, photo_url: "https://x/1b.jpg" }], PECAS);
    expect(r).toEqual({ ok: true, value: [{ product_id: 2, photo_url: "https://x/2a.jpg" }, { product_id: 1, photo_url: "https://x/1b.jpg" }] });
  });

  it("lista vazia é válida (o carrossel some)", () => {
    expect(validarCarrossel([], PECAS)).toEqual({ ok: true, value: [] });
  });

  it("recusa formato errado", () => {
    expect(validarCarrossel("x", PECAS)).toMatchObject({ ok: false, error: "invalid_list" });
    expect(validarCarrossel([{ product_id: "abc", photo_url: "https://x/1a.jpg" }], PECAS)).toMatchObject({ ok: false, error: "invalid_item" });
    expect(validarCarrossel([{ product_id: 1, photo_url: "" }], PECAS)).toMatchObject({ ok: false, error: "invalid_item" });
  });

  it("recusa mais de 8, peça repetida, peça inexistente e peça fora do site", () => {
    const nove = Array.from({ length: MAX_CARROSSEL + 1 }, (_, i) => ({ product_id: i + 1, photo_url: "https://x/1a.jpg" }));
    expect(validarCarrossel(nove, PECAS)).toMatchObject({ ok: false, error: "too_many" });
    const repetida = [{ product_id: 1, photo_url: "https://x/1a.jpg" }, { product_id: 1, photo_url: "https://x/1b.jpg" }];
    expect(validarCarrossel(repetida, PECAS)).toMatchObject({ ok: false, error: "duplicate_piece" });
    expect(validarCarrossel([{ product_id: 99, photo_url: "https://x/1a.jpg" }], PECAS)).toMatchObject({ ok: false, error: "piece_not_found" });
    const fora = validarCarrossel([{ product_id: 3, photo_url: "https://x/3a.jpg" }], PECAS);
    expect(fora).toMatchObject({ ok: false, error: "piece_not_published" });
    expect(!fora.ok && fora.message).toContain("Colar escondido");
  });

  it("recusa foto que não é da peça", () => {
    const r = validarCarrossel([{ product_id: 1, photo_url: "https://x/2a.jpg" }], PECAS);
    expect(r).toMatchObject({ ok: false, error: "photo_not_from_piece" });
  });
});

describe("validar a foto da categoria", () => {
  it("aceita foto de uma peça publicada daquela categoria", () => {
    const r = validarCategoria({ category: "Anéis", product_id: 1, photo_url: "https://x/1b.jpg" }, PECAS);
    expect(r).toEqual({ ok: true, value: { category: "Anéis", product_id: 1, photo_url: "https://x/1b.jpg" } });
  });

  it("recusa categoria vazia, peça de outra categoria, peça fora do site e foto de outra peça", () => {
    expect(validarCategoria({ category: " ", product_id: 1, photo_url: "https://x/1a.jpg" }, PECAS)).toMatchObject({ ok: false, error: "invalid_item" });
    expect(validarCategoria({ category: "Brincos", product_id: 1, photo_url: "https://x/1a.jpg" }, PECAS)).toMatchObject({ ok: false, error: "wrong_category" });
    expect(validarCategoria({ category: "Colares e Correntes", product_id: 3, photo_url: "https://x/3a.jpg" }, PECAS)).toMatchObject({ ok: false, error: "piece_not_published" });
    expect(validarCategoria({ category: "Anéis", product_id: 1, photo_url: "https://x/2a.jpg" }, PECAS)).toMatchObject({ ok: false, error: "photo_not_from_piece" });
    expect(validarCategoria({ category: "Anéis", product_id: 99, photo_url: "https://x/1a.jpg" }, PECAS)).toMatchObject({ ok: false, error: "piece_not_found" });
  });
});

describe("aviso das vagas removidas", () => {
  it("diz onde a foto saiu", () => {
    expect(avisoDeVagasRemovidas([])).toBeNull();
    expect(avisoDeVagasRemovidas([{ area: "carrossel", category: null }])).toBe("Essa foto também saiu da vitrine do site: carrossel.");
    expect(
      avisoDeVagasRemovidas([{ area: "carrossel", category: null }, { area: "categoria", category: "Anéis" }])
    ).toBe("Essa foto também saiu da vitrine do site: carrossel e categoria Anéis.");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/unit/vitrine.test.ts`
Expected: FAIL (módulo `lib/vitrine` não existe).

- [ ] **Step 3: Implementar `lib/vitrine.ts`**

```ts
// Vitrine do site: regras puras (sem banco) para escolher a foto de cada área da loja.
// A foto escolhida sempre tem de ser uma foto da peça (a principal ou uma extra).

export const MAX_CARROSSEL = 8;

export interface PecaDaVitrine {
  id: number;
  name: string | null;
  category: string | null;
  publicada: boolean; // varejo, ativa e "No site"
  fotos: string[]; // principal primeiro, sem repetição
}

export interface VagaCarrossel {
  product_id: number;
  photo_url: string;
}

export interface VagaCategoria {
  category: string;
  product_id: number;
  photo_url: string;
}

export type Resultado<T> = { ok: true; value: T } | { ok: false; error: string; message: string };

const erro = (error: string, message: string) => ({ ok: false as const, error, message });
const nomeDe = (p: PecaDaVitrine) => p.name?.trim() || `peça ${p.id}`;

/** Todas as fotos da peça, a principal primeiro, sem repetir e sem vazias. */
export function fotosDaPeca(principal: string | null | undefined, extras: string[]): string[] {
  const todas = [principal, ...extras].filter((f): f is string => typeof f === "string" && f.trim() !== "");
  return Array.from(new Set(todas));
}

/** Lista do carrossel na ordem escolhida: no máximo 8, sem peça repetida, só peças publicadas e fotos delas. */
export function validarCarrossel(entrada: unknown, pecas: PecaDaVitrine[]): Resultado<VagaCarrossel[]> {
  if (!Array.isArray(entrada)) return erro("invalid_list", "A lista do carrossel veio em formato inválido.");
  if (entrada.length > MAX_CARROSSEL) return erro("too_many", `O carrossel aceita no máximo ${MAX_CARROSSEL} destaques.`);

  const vistos = new Set<number>();
  const vagas: VagaCarrossel[] = [];
  for (const item of entrada) {
    const productId = Number((item as { product_id?: unknown })?.product_id);
    const photoUrl = (item as { photo_url?: unknown })?.photo_url;
    if (!Number.isInteger(productId) || typeof photoUrl !== "string" || photoUrl.trim() === "") {
      return erro("invalid_item", "Há um destaque sem peça ou sem foto.");
    }
    if (vistos.has(productId)) return erro("duplicate_piece", "A mesma peça não pode aparecer duas vezes no carrossel.");
    vistos.add(productId);

    const peca = pecas.find((p) => p.id === productId);
    if (!peca) return erro("piece_not_found", "Uma das peças escolhidas não existe mais.");
    if (!peca.publicada) {
      return erro("piece_not_published", `"${nomeDe(peca)}" não está no site. Publique a peça antes de colocá-la no carrossel.`);
    }
    if (!peca.fotos.includes(photoUrl)) return erro("photo_not_from_piece", `Essa foto não é de "${nomeDe(peca)}".`);
    vagas.push({ product_id: productId, photo_url: photoUrl });
  }
  return { ok: true, value: vagas };
}

/** Foto de uma categoria: de uma peça publicada daquela categoria, e uma foto dela. */
export function validarCategoria(entrada: unknown, pecas: PecaDaVitrine[]): Resultado<VagaCategoria> {
  const categoria = typeof (entrada as { category?: unknown })?.category === "string" ? (entrada as { category: string }).category.trim() : "";
  const productId = Number((entrada as { product_id?: unknown })?.product_id);
  const photoUrl = (entrada as { photo_url?: unknown })?.photo_url;
  if (categoria === "" || !Number.isInteger(productId) || typeof photoUrl !== "string" || photoUrl.trim() === "") {
    return erro("invalid_item", "Escolha a categoria, a peça e a foto.");
  }
  const peca = pecas.find((p) => p.id === productId);
  if (!peca) return erro("piece_not_found", "A peça escolhida não existe mais.");
  if (!peca.publicada) {
    return erro("piece_not_published", `"${nomeDe(peca)}" não está no site. Publique a peça antes de usar a foto dela.`);
  }
  if (peca.category !== categoria) return erro("wrong_category", `"${nomeDe(peca)}" não é da categoria ${categoria}.`);
  if (!peca.fotos.includes(photoUrl)) return erro("photo_not_from_piece", `Essa foto não é de "${nomeDe(peca)}".`);
  return { ok: true, value: { category: categoria, product_id: productId, photo_url: photoUrl } };
}

/** Texto para avisar onde uma foto apagada também saiu da vitrine. */
export function avisoDeVagasRemovidas(vagas: { area: string; category: string | null }[]): string | null {
  if (vagas.length === 0) return null;
  const nomes = vagas.map((v) => (v.area === "carrossel" ? "carrossel" : `categoria ${v.category}`));
  const lista = nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
  return `Essa foto também saiu da vitrine do site: ${lista}.`;
}
```

- [ ] **Step 4: Rodar**

Run: `npx tsc --noEmit -p . ; npx vitest run tests/unit/vitrine.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/vitrine.ts tests/unit/vitrine.test.ts
git commit -m "Vitrine: regras puras (validar carrossel e categoria, fotos da peca)"
```

---

### Task 4: Camada de banco da vitrine (`lib/vitrine-db.ts`)

**Files:**
- Create: `lib/vitrine-db.ts`
- Test: `tests/db/vitrine-db.db.test.ts`

**Interfaces:**
- Consumes: `PecaDaVitrine`, `VagaCarrossel`, `VagaCategoria`, `MAX_CARROSSEL`, `fotosDaPeca` de `lib/vitrine.ts`.
- Produces (todas recebem `Pool`, exceto `carregarPecas`/`carregarVagas`/`carrosselCheio`/`reconciliarPeca`, que aceitam `Pool` ou `PoolClient`):
  - `type Consulta = Pick<Pool | PoolClient, "query">`
  - `carregarPecas(db: Consulta): Promise<PecaDaVitrine[]>` (todas as peças, com o campo `publicada`)
  - `interface VagaSalva { id: number; area: string; category: string | null; position: number; product_id: number; photo_url: string; peca_nome: string | null; publicada: boolean }`
  - `carregarVagas(db: Consulta): Promise<VagaSalva[]>`
  - `salvarCarrossel(pool: Pool, vagas: VagaCarrossel[]): Promise<void>` (troca a lista toda e ajusta `featured`, numa transação)
  - `salvarCategoria(db: Consulta, v: VagaCategoria): Promise<void>` e `removerCategoria(db: Consulta, category: string): Promise<void>`
  - `carrosselCheio(db: Consulta, productId: number): Promise<boolean>` (`true` se a peça ainda não está no carrossel e já há 8 outras; use `0` para peça nova)
  - `reconciliarPeca(db: Consulta, productId: number): Promise<{ removidas: { area: string; category: string | null }[] }>`
  - `MENSAGEM_CARROSSEL_CHEIO: string`

- [ ] **Step 1: Escrever os testes de banco (falham)**

Criar `tests/db/vitrine-db.db.test.ts`:

```ts
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

  async function peca(nome: string, o: { site?: boolean; featured?: boolean; foto?: string | null; categoria?: string; canal?: string } = {}): Promise<number> {
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/db/vitrine-db.db.test.ts`
Expected: FAIL (módulo `lib/vitrine-db` não existe).

- [ ] **Step 3: Implementar `lib/vitrine-db.ts`**

```ts
import type { Pool, PoolClient } from "pg";
import { MAX_CARROSSEL, fotosDaPeca, type PecaDaVitrine, type VagaCarrossel, type VagaCategoria } from "./vitrine";

// Vitrine do site: as consultas ao banco. As regras (o que vale) ficam em lib/vitrine.ts.

export type Consulta = Pick<Pool | PoolClient, "query">;

export const MENSAGEM_CARROSSEL_CHEIO = `O carrossel já tem ${MAX_CARROSSEL} destaques. Tire um deles na Vitrine do site antes de colocar outro.`;

const PUBLICADA = `(p.show_online AND p.active AND p.sale_channel = 'varejo')`;

/** Todas as peças com as fotos (principal primeiro) e se estão publicadas. */
export async function carregarPecas(db: Consulta): Promise<PecaDaVitrine[]> {
  const { rows } = await db.query(
    `SELECT p.id, p.name, p.category, p.photo_url, ${PUBLICADA} AS publicada,
            COALESCE((SELECT json_agg(f.url ORDER BY f.position, f.id) FROM product_photos f WHERE f.product_id = p.id), '[]'::json) AS extras
       FROM products p
      ORDER BY p.name NULLS LAST, p.id`
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    publicada: r.publicada === true,
    fotos: fotosDaPeca(r.photo_url, Array.isArray(r.extras) ? r.extras : []),
  }));
}

export interface VagaSalva {
  id: number;
  area: string;
  category: string | null;
  position: number;
  product_id: number;
  photo_url: string;
  peca_nome: string | null;
  publicada: boolean;
}

export async function carregarVagas(db: Consulta): Promise<VagaSalva[]> {
  const { rows } = await db.query(
    `SELECT s.id, s.area, s.category, s.position, s.product_id, s.photo_url, p.name AS peca_nome, ${PUBLICADA} AS publicada
       FROM site_slots s JOIN products p ON p.id = s.product_id
      ORDER BY s.area, s.position, s.id`
  );
  return rows.map((r) => ({ ...r, publicada: r.publicada === true }));
}

/** Troca a lista inteira do carrossel (na ordem) e deixa `featured` igual a "está no carrossel". */
export async function salvarCarrossel(pool: Pool, vagas: VagaCarrossel[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM site_slots WHERE area = 'carrossel'`);
    for (let i = 0; i < vagas.length; i++) {
      await client.query(
        `INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', $1, $2, $3)`,
        [i, vagas[i].product_id, vagas[i].photo_url]
      );
    }
    const ids = vagas.map((v) => v.product_id);
    await client.query(
      `UPDATE products SET featured = (id = ANY($1::int[])) WHERE featured IS DISTINCT FROM (id = ANY($1::int[]))`,
      [ids]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

export async function salvarCategoria(db: Consulta, v: VagaCategoria): Promise<void> {
  await db.query(
    `INSERT INTO site_slots (area, category, position, product_id, photo_url) VALUES ('categoria', $1, 0, $2, $3)
     ON CONFLICT (category) WHERE area = 'categoria' DO UPDATE SET product_id = EXCLUDED.product_id, photo_url = EXCLUDED.photo_url`,
    [v.category, v.product_id, v.photo_url]
  );
}

export async function removerCategoria(db: Consulta, category: string): Promise<void> {
  await db.query(`DELETE FROM site_slots WHERE area = 'categoria' AND category = $1`, [category]);
}

/** true = a peça ainda não está no carrossel e já há 8 outras. Use 0 como id para peça que ainda vai ser criada. */
export async function carrosselCheio(db: Consulta, productId: number): Promise<boolean> {
  const { rows } = await db.query(
    `SELECT count(*) FILTER (WHERE product_id <> $1)::int AS outros, COALESCE(bool_or(product_id = $1), false) AS ja
       FROM site_slots WHERE area = 'carrossel'`,
    [productId]
  );
  return !rows[0].ja && rows[0].outros >= MAX_CARROSSEL;
}

/**
 * Deixa as vagas de uma peça coerentes com o que ela é agora:
 * 1. apaga vagas cuja foto não é mais foto da peça (foto apagada ou trocada);
 * 2. peça fora do site ou sem "Carrossel": sem vaga de carrossel;
 * 3. peça com "Carrossel" e sem vaga: ganha uma, no fim, com a foto principal.
 * A foto escolhida para uma categoria continua guardada quando a peça sai do site (a loja a ignora até voltar).
 */
export async function reconciliarPeca(
  db: Consulta,
  productId: number
): Promise<{ removidas: { area: string; category: string | null }[] }> {
  const { rows: removidas } = await db.query(
    `DELETE FROM site_slots
      WHERE product_id = $1
        AND photo_url NOT IN (
          SELECT photo_url FROM products WHERE id = $1 AND photo_url IS NOT NULL
          UNION
          SELECT url FROM product_photos WHERE product_id = $1
        )
      RETURNING area, category`,
    [productId]
  );

  const { rows } = await db.query(`SELECT featured, show_online, photo_url FROM products WHERE id = $1`, [productId]);
  const p = rows[0];
  if (p) {
    if (!p.show_online || !p.featured) {
      await db.query(`DELETE FROM site_slots WHERE product_id = $1 AND area = 'carrossel'`, [productId]);
    } else if (p.photo_url) {
      const { rows: tem } = await db.query(`SELECT 1 FROM site_slots WHERE product_id = $1 AND area = 'carrossel'`, [productId]);
      if (tem.length === 0) {
        await db.query(
          `INSERT INTO site_slots (area, position, product_id, photo_url)
           VALUES ('carrossel', (SELECT COALESCE(max(position), -1) + 1 FROM site_slots WHERE area = 'carrossel'), $1, $2)`,
          [productId, p.photo_url]
        );
      }
    }
  }
  return { removidas: removidas.map((r) => ({ area: r.area, category: r.category })) };
}
```

- [ ] **Step 4: Rodar**

Run: `npx tsc --noEmit -p . ; npx vitest run tests/db/vitrine-db.db.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/vitrine-db.ts tests/db/vitrine-db.db.test.ts
git commit -m "Vitrine: consultas ao banco (vagas, carrossel, categorias, reconciliar peca)"
```

---

### Task 5: Rotas de produto mantêm as vagas coerentes + "Tornar principal"

**Files:**
- Modify: `app/api/products/route.ts` (POST), `app/api/products/[id]/route.ts` (PATCH), `app/api/products/[id]/store/route.ts` (PATCH), `app/api/products/[id]/photos/route.ts` (DELETE)
- Create: `app/api/products/[id]/photos/principal/route.ts`
- Test: verificação por chamada real no fim da task (as rotas não têm teste unitário no projeto; a lógica está coberta na Task 4)

**Interfaces:**
- Consumes: `carrosselCheio`, `reconciliarPeca`, `MENSAGEM_CARROSSEL_CHEIO` (`lib/vitrine-db.ts`), `avisoDeVagasRemovidas` (`lib/vitrine.ts`).
- Produces: as respostas de `POST/PATCH` de produto e do `DELETE` de foto passam a trazer `notes: string[]`; erro novo `carousel_full` (400). `POST /api/products/[id]/photos/principal` recebe `{ url }` e devolve `{ photo_url: string, items: { id, url, position }[] }`.

- [ ] **Step 1: `products/route.ts` (POST)**

Acrescentar aos imports do topo:

```ts
import { MENSAGEM_CARROSSEL_CHEIO, carrosselCheio, reconciliarPeca } from "@/lib/vitrine-db";
import { avisoDeVagasRemovidas } from "@/lib/vitrine";
```

Depois do bloco `if (!loja.ok) return ...` e antes do `try {`, inserir:

```ts
  // Carrossel cheio: recusa antes de salvar a peça.
  if (loja.value.featured && (await carrosselCheio(db, 0).catch(() => false))) {
    return NextResponse.json({ error: "carousel_full", message: MENSAGEM_CARROSSEL_CHEIO }, { status: 400 });
  }
```

E no fim do `try`, trocar `return NextResponse.json({ item: rows[0] }, { status: 201 });` por:

```ts
    const { removidas } = await reconciliarPeca(db, rows[0].id);
    const aviso = avisoDeVagasRemovidas(removidas);
    return NextResponse.json({ item: rows[0], notes: aviso ? [aviso] : [] }, { status: 201 });
```

- [ ] **Step 2: `products/[id]/route.ts` (PATCH)**

Mesmos imports. Depois do `if (!loja.ok) ...` inserir:

```ts
    if (loja.value.featured && (await carrosselCheio(db, id))) {
      return NextResponse.json({ error: "carousel_full", message: MENSAGEM_CARROSSEL_CHEIO }, { status: 400 });
    }
```

E trocar `return NextResponse.json({ item: rows[0], notes: loja.notes });` por:

```ts
    const { removidas } = await reconciliarPeca(db, id);
    const aviso = avisoDeVagasRemovidas(removidas);
    return NextResponse.json({ item: rows[0], notes: [...loja.notes, ...(aviso ? [aviso] : [])] });
```

- [ ] **Step 3: `products/[id]/store/route.ts` (PATCH)**

Mesmos imports. Depois do `if (!r.ok) ...` inserir:

```ts
    if (r.value.featured && (await carrosselCheio(db, id))) {
      return NextResponse.json({ error: "carousel_full", message: MENSAGEM_CARROSSEL_CHEIO }, { status: 400 });
    }
```

E trocar o `return NextResponse.json({ item: rows[0], notes: r.notes });` por:

```ts
    const { removidas } = await reconciliarPeca(db, id);
    const aviso = avisoDeVagasRemovidas(removidas);
    return NextResponse.json({ item: rows[0], notes: [...r.notes, ...(aviso ? [aviso] : [])] });
```

- [ ] **Step 4: `photos/route.ts` (DELETE)**

Imports no topo:

```ts
import { reconciliarPeca } from "@/lib/vitrine-db";
import { avisoDeVagasRemovidas } from "@/lib/vitrine";
```

No `DELETE`, trocar as duas linhas depois do `await db.query("DELETE FROM product_photos ...")` por:

```ts
    await db.query(`DELETE FROM product_photos WHERE id = $1 AND product_id = $2`, [photoId, id]);
    const { removidas } = await reconciliarPeca(db, id);
    const aviso = avisoDeVagasRemovidas(removidas);
    return NextResponse.json({ ok: true, notes: aviso ? [aviso] : [] });
```

- [ ] **Step 5: Criar `app/api/products/[id]/photos/principal/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { reconciliarPeca } from "@/lib/vitrine-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Torna principal uma das fotos extras: ela vira a photo_url da peça e a principal antiga
// ocupa o lugar dela nas extras (a ordem das outras não muda).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const id = Number(params.id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (url === "") return NextResponse.json({ error: "invalid_url", message: "Escolha uma foto." }, { status: 400 });

  const client = await db.connect();
  try {
    await ensureSchema();
    await client.query("BEGIN");
    const { rows: peca } = await client.query(`SELECT photo_url FROM products WHERE id = $1 FOR UPDATE`, [id]);
    if (peca.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "not_found", message: "Peça não encontrada." }, { status: 404 });
    }
    const principalAntiga: string | null = peca[0].photo_url;
    if (principalAntiga !== url) {
      const { rows: extra } = await client.query(`SELECT id FROM product_photos WHERE product_id = $1 AND url = $2 LIMIT 1`, [id, url]);
      if (extra.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "photo_not_from_piece", message: "Essa foto não é desta peça." }, { status: 400 });
      }
      await client.query(`UPDATE products SET photo_url = $1 WHERE id = $2`, [url, id]);
      if (principalAntiga) {
        await client.query(`UPDATE product_photos SET url = $1 WHERE id = $2`, [principalAntiga, extra[0].id]);
      } else {
        await client.query(`DELETE FROM product_photos WHERE id = $1`, [extra[0].id]);
      }
    }
    await client.query("COMMIT");
    await reconciliarPeca(db, id);
    const { rows: fotos } = await db.query(`SELECT id, url, position FROM product_photos WHERE product_id = $1 ORDER BY position, id`, [id]);
    return NextResponse.json({ photo_url: url, items: fotos });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  } finally {
    client.release();
  }
}
```

- [ ] **Step 6: Tipos e testes**

Run: `npx tsc --noEmit -p . ; npm run test:all`
Expected: sem erro de tipo; todos os testes PASS.

- [ ] **Step 7: Commit**

```bash
git add app/api
git commit -m "Rotas de produto mantem as vagas da vitrine coerentes; tornar foto principal"
```

---

### Task 6: API da vitrine (`/api/vitrine`)

**Files:**
- Create: `app/api/vitrine/route.ts`, `app/api/vitrine/carrossel/route.ts`, `app/api/vitrine/categoria/route.ts`

**Interfaces:**
- Consumes: `carregarPecas`, `carregarVagas`, `salvarCarrossel`, `salvarCategoria`, `removerCategoria` (`lib/vitrine-db.ts`); `validarCarrossel`, `validarCategoria`, `MAX_CARROSSEL` (`lib/vitrine.ts`).
- Produces:
  - `GET /api/vitrine` → `{ max: number, pecas: PecaDaVitrine[] (só as publicadas), vagas: VagaSalva[] }`
  - `PUT /api/vitrine/carrossel` body `{ items: VagaCarrossel[] }` → `{ vagas: VagaSalva[] }` ou 400 `{ error, message }`
  - `PUT /api/vitrine/categoria` body `{ category, product_id, photo_url }` → `{ vagas }`; `DELETE /api/vitrine/categoria?category=Anéis` → `{ vagas }`

- [ ] **Step 1: `app/api/vitrine/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { carregarPecas, carregarVagas } from "@/lib/vitrine-db";
import { MAX_CARROSSEL } from "@/lib/vitrine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tudo o que a tela "Vitrine do site" precisa: as peças publicadas com as fotos e as vagas escolhidas.
export async function GET() {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  try {
    await ensureSchema();
    const [pecas, vagas] = await Promise.all([carregarPecas(db), carregarVagas(db)]);
    return NextResponse.json({ max: MAX_CARROSSEL, pecas: pecas.filter((p) => p.publicada), vagas });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }
}
```

- [ ] **Step 2: `app/api/vitrine/carrossel/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { carregarPecas, carregarVagas, salvarCarrossel } from "@/lib/vitrine-db";
import { validarCarrossel } from "@/lib/vitrine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Troca a lista inteira do carrossel, na ordem enviada.
export async function PUT(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  try {
    await ensureSchema();
    const valido = validarCarrossel(body.items, await carregarPecas(db));
    if (!valido.ok) return NextResponse.json({ error: valido.error, message: valido.message }, { status: 400 });
    await salvarCarrossel(db, valido.value);
    return NextResponse.json({ vagas: await carregarVagas(db) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: `app/api/vitrine/categoria/route.ts`**

```ts
import { NextRequest, NextResponse } from "next/server";
import { getPool, ensureSchema } from "@/lib/db";
import { carregarPecas, carregarVagas, removerCategoria, salvarCategoria } from "@/lib/vitrine-db";
import { validarCategoria } from "@/lib/vitrine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Escolhe a foto de uma categoria (troca a anterior, se houver).
export async function PUT(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  try {
    await ensureSchema();
    const valido = validarCategoria(body, await carregarPecas(db));
    if (!valido.ok) return NextResponse.json({ error: valido.error, message: valido.message }, { status: 400 });
    await salvarCategoria(db, valido.value);
    return NextResponse.json({ vagas: await carregarVagas(db) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}

// Volta ao automático: ?category=Anéis
export async function DELETE(req: NextRequest) {
  const db = getPool();
  if (!db) return NextResponse.json({ error: "db_not_configured" }, { status: 503 });
  const categoria = (req.nextUrl.searchParams.get("category") ?? "").trim();
  if (categoria === "") return NextResponse.json({ error: "invalid_category", message: "Categoria inválida." }, { status: 400 });
  try {
    await ensureSchema();
    await removerCategoria(db, categoria);
    return NextResponse.json({ vagas: await carregarVagas(db) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Tipos**

Run: `npx tsc --noEmit -p .`
Expected: sem erro.

- [ ] **Step 5: Commit**

```bash
git add app/api/vitrine
git commit -m "API da vitrine: ler, salvar carrossel, escolher e limpar foto de categoria"
```

---

### Task 7: Tela do produto: "Tornar principal", etiqueta "Incompleta" e avisos

**Files:**
- Modify: `app/cadastros/loja-online-section.tsx`, `app/cadastros/produtos-tab.tsx`

**Interfaces:**
- Consumes: `faltaParaPublicar`, `mensagemDeFalta` (`lib/store-rules.ts`); `POST /api/products/[id]/photos/principal`; `notes` das respostas.

- [ ] **Step 1: `loja-online-section.tsx`: receber a principal e avisar quando mudar**

Trocar a assinatura do componente e do `PhotoManager`. Em `LojaOnlineSection`, acrescentar as props `mainPhoto: string` e `onMainPhotoChange: (url: string) => void` (na lista de props e no tipo), e passar para o gerenciador:

```tsx
      <PhotoManager productId={productId} mainPhoto={mainPhoto} onMainPhotoChange={onMainPhotoChange} />
```

Trocar a linha `function PhotoManager({ productId }: { productId: number | null }) {` por:

```tsx
function PhotoManager({
  productId,
  mainPhoto,
  onMainPhotoChange,
}: {
  productId: number | null;
  mainPhoto: string;
  onMainPhotoChange: (url: string) => void;
}) {
```

Acrescentar, junto de `remover` e `mover`, a função:

```tsx
  async function tornarPrincipal(foto: Photo) {
    setErro("");
    const res = await fetch(`/api/products/${productId}/photos/principal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: foto.url }),
    });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(dados.message || "Não foi possível trocar a foto principal.");
      return;
    }
    setPhotos(dados.items || []);
    onMainPhotoChange(dados.photo_url);
  }
```

Em `remover`, trocar o corpo por (mostra o aviso quando a foto também saiu da vitrine):

```tsx
  async function remover(foto: Photo) {
    if (!window.confirm("Remover esta foto?")) return;
    const res = await fetch(`/api/products/${productId}/photos?photoId=${foto.id}`, { method: "DELETE" });
    if (res.ok) {
      setPhotos((atual) => atual.filter((f) => f.id !== foto.id));
      const dados = await res.json().catch(() => ({}));
      if (Array.isArray(dados.notes) && dados.notes.length > 0) window.alert(dados.notes.join("\n"));
    }
  }
```

Na tira de fotos, antes do `{photos.map(...)}`, mostrar a principal, e em cada foto extra acrescentar o botão. Substituir o bloco `<div className="photo-strip">...</div>` por:

```tsx
      <div className="photo-strip">
        {mainPhoto && (
          <div className="photo-item">
            <img src={mainPhoto} alt="" />
            <div className="photo-actions">
              <span className="stock-pill ok">Principal</span>
            </div>
          </div>
        )}
        {photos.map((f, i) => (
          <div className="photo-item" key={f.id}>
            <img src={f.url} alt="" />
            <div className="photo-actions">
              <button type="button" className="icon-btn" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Mover para antes">
                ←
              </button>
              <button
                type="button"
                className="icon-btn"
                disabled={i === photos.length - 1}
                onClick={() => mover(i, 1)}
                aria-label="Mover para depois"
              >
                →
              </button>
              <button type="button" className="icon-btn" onClick={() => tornarPrincipal(f)}>
                Tornar principal
              </button>
              <button type="button" className="icon-btn danger" onClick={() => remover(f)}>
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>
```

E ajustar o texto de ajuda logo acima: `A foto principal é a que aparece nos cartões e no carrinho. Use "Tornar principal" para trocar. As outras aparecem depois dela, na ordem abaixo.`

- [ ] **Step 2: `produtos-tab.tsx`: passar a principal, mostrar avisos e a etiqueta**

Import (junto dos outros imports de `@/lib/...`):

```tsx
import { faltaParaPublicar, mensagemDeFalta } from "@/lib/store-rules";
```

No `<LojaOnlineSection ... />` acrescentar:

```tsx
                mainPhoto={form.photo_url}
                onMainPhotoChange={(url) => setForm((f) => ({ ...f, photo_url: url }))}
```

Em `handleSubmit`, trocar o trecho `if (res.ok) { setEditing(null); load(); } else {...}` por:

```tsx
      const dados = await res.json().catch(() => ({}));
      if (res.ok) {
        setEditing(null);
        load();
        if (Array.isArray(dados.notes) && dados.notes.length > 0) window.alert(dados.notes.join("\n"));
      } else {
        window.alert(dados.message || "Não foi possível salvar. Tente novamente.");
      }
```

Em `toggleStore`, depois do `setItems(...)` acrescentar:

```tsx
    if (Array.isArray(dados.notes) && dados.notes.length > 0) window.alert(dados.notes.join("\n"));
```

Na célula "Loja online" (`<div className="store-toggles">` ... `</div>`), logo **depois** do `</div>` que fecha `store-toggles`, acrescentar:

```tsx
                    {p.sale_channel !== "atacado" &&
                      (() => {
                        const falta = faltaParaPublicar({ photoUrl: p.photo_url, price: p.price, description: p.public_description });
                        return falta.length > 0 ? (
                          <div className="hint" title={mensagemDeFalta(falta)}>
                            <span className="stock-pill out">Incompleta</span> {falta.join(", ")}
                          </div>
                        ) : null;
                      })()}
```

- [ ] **Step 3: Tipos e testes**

Run: `npx tsc --noEmit -p . ; npm run test:all`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/cadastros
git commit -m "Produtos: tornar foto principal, etiqueta Incompleta e avisos da vitrine"
```

---

### Task 8: Tela "Vitrine do site" e menu

**Files:**
- Create: `app/loja-online/vitrine/page.tsx`
- Modify: `app/nav-bar.tsx`, `app/globals.css`

**Interfaces:**
- Consumes: `GET /api/vitrine`, `PUT /api/vitrine/carrossel`, `PUT|DELETE /api/vitrine/categoria`; tipos `PecaDaVitrine` (`lib/vitrine.ts`) e `VagaSalva` (`lib/vitrine-db.ts`, só o tipo).

- [ ] **Step 1: Menu (`app/nav-bar.tsx`)**

Em `GRUPOS`, no grupo `Loja`, trocar `itens` por:

```tsx
    itens: [
      { href: "/loja-online", rotulo: "Loja online", icone: "loja" },
      { href: "/loja-online/vitrine", rotulo: "Vitrine do site", icone: "loja" },
    ],
```

Em `CAMINHOS` acrescentar `"/loja-online/vitrine": ["Loja", "Vitrine do site"],`. Em `MAIS` acrescentar `{ href: "/loja-online/vitrine", rotulo: "Vitrine do site" },` depois do item `Loja online`.

- [ ] **Step 2: Criar `app/loja-online/vitrine/page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PRODUCT_CATEGORY_NAMES } from "@/lib/format";
import type { PecaDaVitrine, VagaCarrossel } from "@/lib/vitrine";
import type { VagaSalva } from "@/lib/vitrine-db";

type Dados = { max: number; pecas: PecaDaVitrine[]; vagas: VagaSalva[] };

// Escolha de foto: para o carrossel (uma peça) ou para uma categoria (várias peças).
type Escolha =
  | { tipo: "carrossel"; indice: number }
  | { tipo: "categoria"; categoria: string }
  | null;

const nomeDe = (p: { name: string | null; id: number }) => p.name?.trim() || `Peça ${p.id}`;

export default function VitrinePage() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [lista, setLista] = useState<VagaCarrossel[]>([]);
  const [sujo, setSujo] = useState(false);
  const [escolha, setEscolha] = useState<Escolha>(null);
  const [adicionando, setAdicionando] = useState("");
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/vitrine");
    if (!res.ok) {
      setErro("Não foi possível carregar a vitrine.");
      return;
    }
    const d: Dados = await res.json();
    setDados(d);
    setLista(d.vagas.filter((v) => v.area === "carrossel").map((v) => ({ product_id: v.product_id, photo_url: v.photo_url })));
    setSujo(false);
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const pecaPorId = useMemo(() => new Map((dados?.pecas ?? []).map((p) => [p.id, p])), [dados]);
  const vagasDoCarrossel = dados?.vagas.filter((v) => v.area === "carrossel") ?? [];
  const foraDoSite = (id: number) => !pecaPorId.has(id);

  function mudar(nova: VagaCarrossel[]) {
    setLista(nova);
    setSujo(true);
    setMsg("");
  }

  function mover(i: number, delta: -1 | 1) {
    const j = i + delta;
    if (j < 0 || j >= lista.length) return;
    const nova = [...lista];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    mudar(nova);
  }

  function adicionar() {
    const peca = pecaPorId.get(Number(adicionando));
    if (!peca || peca.fotos.length === 0) return;
    mudar([...lista, { product_id: peca.id, photo_url: peca.fotos[0] }]);
    setAdicionando("");
  }

  async function salvarCarrossel() {
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/vitrine/carrossel", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: lista }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(d.message || "Não foi possível salvar o carrossel.");
        return;
      }
      await carregar();
      setMsg("Carrossel salvo.");
    } finally {
      setSalvando(false);
    }
  }

  async function escolherFoto(url: string, productId: number) {
    if (!escolha) return;
    if (escolha.tipo === "carrossel") {
      mudar(lista.map((v, i) => (i === escolha.indice ? { product_id: v.product_id, photo_url: url } : v)));
      setEscolha(null);
      return;
    }
    setErro("");
    const res = await fetch("/api/vitrine/categoria", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: escolha.categoria, product_id: productId, photo_url: url }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(d.message || "Não foi possível salvar a foto da categoria.");
      return;
    }
    setEscolha(null);
    await carregar();
    setMsg(`Foto de ${escolha.categoria} salva.`);
  }

  async function voltarAoAutomatico(categoria: string) {
    const res = await fetch(`/api/vitrine/categoria?category=${encodeURIComponent(categoria)}`, { method: "DELETE" });
    if (res.ok) {
      await carregar();
      setMsg(`${categoria} voltou ao automático.`);
    }
  }

  if (!dados) return <main className="shell shell--wide"><div className="loading-state">{erro || "Carregando..."}</div></main>;

  const categorias = PRODUCT_CATEGORY_NAMES.filter((c) => dados.pecas.some((p) => p.category === c));
  const escolhaCategoria = (c: string) => dados.vagas.find((v) => v.area === "categoria" && v.category === c);
  const disponiveis = dados.pecas.filter((p) => !lista.some((v) => v.product_id === p.id) && p.fotos.length > 0);

  // Fotos oferecidas na janela de escolha.
  const opcoes: { peca: PecaDaVitrine; url: string }[] =
    escolha?.tipo === "carrossel"
      ? (pecaPorId.get(lista[escolha.indice]?.product_id)?.fotos ?? []).map((url) => ({ peca: pecaPorId.get(lista[escolha.indice].product_id)!, url }))
      : escolha?.tipo === "categoria"
        ? dados.pecas.filter((p) => p.category === escolha.categoria).flatMap((peca) => peca.fotos.map((url) => ({ peca, url })))
        : [];

  return (
    <main className="shell shell--wide">
      <div className="page-head">
        <p className="eyebrow">Loja</p>
        <h1>Vitrine do site</h1>
        <p>Escolha as fotos que aparecem na página inicial da loja. Só entram peças que estão "No site".</p>
      </div>

      {erro && <div className="banner banner-warning"><span>⚠️</span><span>{erro}</span></div>}
      {msg && <div className="banner banner-info"><span>✅</span><span>{msg}</span></div>}

      <section className="vt-bloco">
        <header className="vt-head">
          <h2>Carrossel do topo</h2>
          <span className="vt-contador">{lista.length} de {dados.max}</span>
        </header>
        <p className="hint">Só o que estiver aqui aparece no carrossel, na ordem da lista. Sem nenhum destaque, o carrossel some do site.</p>

        {lista.length === 0 ? (
          <div className="empty-state">Nenhum destaque escolhido.</div>
        ) : (
          <ol className="vt-lista">
            {lista.map((v, i) => {
              const peca = pecaPorId.get(v.product_id);
              const salva = vagasDoCarrossel.find((s) => s.product_id === v.product_id);
              const nome = peca ? nomeDe(peca) : salva?.peca_nome || `Peça ${v.product_id}`;
              return (
                <li key={v.product_id} className={"vt-item" + (foraDoSite(v.product_id) ? " vt-item--fora" : "")}>
                  <span className="vt-pos">{i + 1}</span>
                  <img src={v.photo_url} alt="" className="vt-thumb" />
                  <div className="vt-info">
                    <strong>{nome}</strong>
                    {foraDoSite(v.product_id) && <span className="vt-aviso">Fora do site: não aparece na loja</span>}
                  </div>
                  <div className="vt-acoes">
                    <button type="button" className="icon-btn" disabled={i === 0} onClick={() => mover(i, -1)} aria-label="Subir">↑</button>
                    <button type="button" className="icon-btn" disabled={i === lista.length - 1} onClick={() => mover(i, 1)} aria-label="Descer">↓</button>
                    <button type="button" className="icon-btn" disabled={!peca} onClick={() => setEscolha({ tipo: "carrossel", indice: i })}>Trocar foto</button>
                    <button type="button" className="icon-btn danger" onClick={() => mudar(lista.filter((_, k) => k !== i))}>Remover</button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="vt-adicionar">
          <select value={adicionando} onChange={(e) => setAdicionando(e.target.value)} disabled={lista.length >= dados.max}>
            <option value="">{lista.length >= dados.max ? "O carrossel está cheio" : "Adicionar uma peça..."}</option>
            {disponiveis.map((p) => (
              <option key={p.id} value={p.id}>{nomeDe(p)}</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-small" onClick={adicionar} disabled={!adicionando}>Adicionar</button>
          <button type="button" className="btn btn-primary" onClick={salvarCarrossel} disabled={!sujo || salvando}>
            {salvando ? "Salvando..." : "Salvar carrossel"}
          </button>
        </div>
      </section>

      <section className="vt-bloco">
        <header className="vt-head"><h2>Foto de cada categoria</h2></header>
        <p className="hint">É o quadrado de cada categoria na página inicial. Sem escolha, a loja usa a foto da peça mais nova.</p>
        {categorias.length === 0 ? (
          <div className="empty-state">Ainda não há peças no site.</div>
        ) : (
          <ul className="vt-lista">
            {categorias.map((c) => {
              const vaga = escolhaCategoria(c);
              return (
                <li key={c} className="vt-item">
                  {vaga ? <img src={vaga.photo_url} alt="" className="vt-thumb" /> : <div className="vt-thumb vt-thumb--vazia">Auto</div>}
                  <div className="vt-info">
                    <strong>{c}</strong>
                    <span className="hint">
                      {vaga ? `Foto escolhida${vaga.peca_nome ? `, de ${vaga.peca_nome}` : ""}` : "Automática: foto da peça mais nova"}
                      {vaga && !vaga.publicada ? " (a peça saiu do site, então a loja ignora até ela voltar)" : ""}
                    </span>
                  </div>
                  <div className="vt-acoes">
                    <button type="button" className="icon-btn" onClick={() => setEscolha({ tipo: "categoria", categoria: c })}>Escolher foto</button>
                    {vaga && <button type="button" className="icon-btn" onClick={() => voltarAoAutomatico(c)}>Voltar ao automático</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {escolha && (
        <div className="modal-overlay" onClick={() => setEscolha(null)}>
          <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: "1.2rem" }}>
                {escolha.tipo === "categoria" ? `Foto de ${escolha.categoria}` : "Escolher a foto do destaque"}
              </h2>
              <button type="button" className="icon-btn" onClick={() => setEscolha(null)}>Fechar</button>
            </div>
            {opcoes.length === 0 ? (
              <div className="empty-state">Nenhuma foto disponível.</div>
            ) : (
              <div className="vt-grade">
                {opcoes.map(({ peca, url }) => (
                  <button type="button" key={`${peca.id}-${url}`} className="vt-opcao" onClick={() => escolherFoto(url, peca.id)}>
                    <img src={url} alt="" />
                    <span>{nomeDe(peca)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 3: CSS (`app/globals.css`)**

Acrescentar no **fim** do arquivo (usar Edit no final do arquivo, mantendo o fim de linha dele):

```css
/* Vitrine do site */
.vt-bloco {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: 16px 18px 18px;
  margin-bottom: 16px;
}

.vt-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 4px;
}

.vt-head h2 {
  font-size: 1.05rem;
  color: var(--accent-strong);
}

.vt-contador {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--accent);
}

.vt-lista {
  list-style: none;
  margin: 12px 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.vt-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface-soft);
  flex-wrap: wrap;
}

.vt-item--fora {
  border-color: #efc7bd;
  background: var(--danger-soft);
}

.vt-pos {
  min-width: 24px;
  text-align: center;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--accent);
}

.vt-thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  flex: none;
}

.vt-thumb--vazia {
  display: grid;
  place-items: center;
  font-size: 0.75rem;
  color: var(--ink-faint);
  border-style: dashed;
}

.vt-info {
  flex: 1 1 160px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.vt-aviso {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--danger);
}

.vt-acoes {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.vt-adicionar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.vt-adicionar select {
  flex: 1 1 220px;
  min-width: 0;
}

.vt-grade {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.vt-opcao {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: var(--radius-md);
  padding: 6px;
  cursor: pointer;
  text-align: center;
  font-size: 0.78rem;
  color: var(--ink-soft);
}

.vt-opcao img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--radius-sm);
  display: block;
  margin-bottom: 4px;
}

.vt-opcao:hover {
  border-color: var(--gold-bright);
  background: var(--gold-soft);
}
```

- [ ] **Step 4: Tipos, testes e conferência na tela**

Run: `npx tsc --noEmit -p . ; npm run test:all`
Expected: PASS.

Depois, com `npm run dev` e os dados de demonstração (`npm run seed:demo`), no navegador (usuário de teste, apagar no fim): abrir `/loja-online/vitrine` no computador e a 375 px. Conferir: (1) sem peça no site, as duas partes mostram os vazios; (2) em Produtos, completar foto, preço e descrição de 2 peças e ligar "No site" (sem os três, a mensagem "Faltam: ..." aparece); (3) na Vitrine, adicionar as duas ao carrossel, trocar a foto de uma, mudar a ordem e salvar; (4) escolher a foto de uma categoria e voltar ao automático; (5) nenhuma rolagem lateral (`document.documentElement.scrollWidth === clientWidth`).

- [ ] **Step 5: Commit**

```bash
git add app/loja-online app/nav-bar.tsx app/globals.css
git commit -m "Tela Vitrine do site: carrossel e foto de cada categoria"
```

---

### Task 9: Contrato de leitura (script, testes, documentação, conferência)

**Files:**
- Modify: `scripts/loja-usuario-leitura.sql`, `scripts/ensaio-loja-leitura.mjs`, `docs/loja-contrato.md`, `tests/db/store.db.test.ts`

**Interfaces:**
- Produces: `loja_leitura` lê `site_slots(area, category, position, product_id, photo_url)` e nada mais dessa tabela. Consultas da loja:
  - `SQL_VITRINE_CARROSSEL`: `SELECT s.product_id, s.photo_url, s.position FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'carrossel' AND <VISIVEL> ORDER BY s.position, s.product_id`
  - `SQL_VITRINE_CATEGORIAS`: `SELECT s.category, s.photo_url FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'categoria' AND <VISIVEL>`

- [ ] **Step 1: Atualizar o teste do contrato (falha)**

Em `tests/db/store.db.test.ts`:

1. Em `COLUNAS_LIBERADAS`, acrescentar a linha `site_slots: ["area", "category", "position", "product_id", "photo_url"],` (depois de `store_settings`).
2. Junto das outras consultas da loja (perto de `SQL_CONFIG`), acrescentar:

```ts
const SQL_VITRINE_CARROSSEL = `SELECT s.product_id, s.photo_url, s.position FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'carrossel' AND ${VISIVEL_NA_LOJA} ORDER BY s.position, s.product_id`;
const SQL_VITRINE_CATEGORIAS = `SELECT s.category, s.photo_url FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'categoria' AND ${VISIVEL_NA_LOJA}`;
```

3. Trocar a expectativa das tabelas legíveis por `["product_photos", "products", "site_slots", "store_settings"]`.
4. No `describe` do usuário de leitura, depois do teste `roda as consultas da própria loja`, acrescentar:

```ts
    it("roda as consultas da vitrine (só vagas de peças publicadas) e não lê o resto de site_slots", async () => {
      const { rows: pub } = await admin.query(`SELECT id FROM products WHERE name = 'Peça pública'`);
      const { rows: esc } = await admin.query(`SELECT id FROM products WHERE name = 'Peça escondida'`);
      await admin.query(`DELETE FROM site_slots`);
      await admin.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 0, $1, 'https://x/car.jpg'), ('carrossel', 1, $2, 'https://x/esc.jpg')`, [pub[0].id, esc[0].id]);
      await admin.query(`INSERT INTO site_slots (area, category, position, product_id, photo_url) VALUES ('categoria', 'Anéis', 0, $1, 'https://x/cat.jpg'), ('categoria', 'Brincos', 0, $2, 'https://x/esc2.jpg')`, [pub[0].id, esc[0].id]);

      const carrossel = await loja.query(SQL_VITRINE_CARROSSEL);
      expect(carrossel.rows.map((r) => [r.product_id, r.photo_url])).toEqual([[pub[0].id, "https://x/car.jpg"]]); // a escondida fica de fora
      const categorias = await loja.query(SQL_VITRINE_CATEGORIAS);
      expect(categorias.rows).toEqual([{ category: "Anéis", photo_url: "https://x/cat.jpg" }]);

      await expect(loja.query(`SELECT id FROM site_slots`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT created_at FROM site_slots`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`SELECT * FROM site_slots`)).rejects.toThrow(/permission denied/);
      await expect(loja.query(`INSERT INTO site_slots (area, position, product_id, photo_url) VALUES ('carrossel', 9, ${pub[0].id}, 'x')`)).rejects.toThrow();
      await admin.query(`DELETE FROM site_slots`);
    });
```

Run: `npx vitest run tests/db/store.db.test.ts`
Expected: FAIL (o usuário ainda não tem permissão em `site_slots`).

- [ ] **Step 2: Script SQL (`scripts/loja-usuario-leitura.sql`)**

No comentário do alto, na lista de colunas, acrescentar depois de `store_settings:   key, value`:

```sql
--   site_slots:       area, category, position, product_id, photo_url
```

No PASSO B, depois de `GRANT SELECT (key, value) ON store_settings TO loja_leitura;` acrescentar:

```sql
GRANT SELECT (area, category, position, product_id, photo_url) ON site_slots TO loja_leitura;
```

No PASSO C, na consulta 2, o comentário passa a dizer `product_photos, products, site_slots, store_settings`.

- [ ] **Step 3: Rodar o teste do contrato**

Run: `npx vitest run tests/db/store.db.test.ts`
Expected: PASS.

- [ ] **Step 4: Script de conferência (`scripts/ensaio-loja-leitura.mjs`)**

Junto das outras consultas, acrescentar:

```js
const SQL_VITRINE_CARROSSEL = `SELECT s.product_id, s.photo_url, s.position FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'carrossel' AND ${VISIVEL_NA_LOJA} ORDER BY s.position, s.product_id`;
const SQL_VITRINE_CATEGORIAS = `SELECT s.category, s.photo_url FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'categoria' AND ${VISIVEL_NA_LOJA}`;
```

Na seção 2 (o que a loja precisa ler), depois de `const config = ...` e do `console.log` das chaves, acrescentar:

```js
  const carrossel = await deveLer("vagas do carrossel", SQL_VITRINE_CARROSSEL);
  console.log(`           ${carrossel.length} destaque(s) no carrossel`);
  const categoriasEscolhidas = await deveLer("fotos escolhidas das categorias", SQL_VITRINE_CATEGORIAS);
  console.log(`           ${categoriasEscolhidas.length} categoria(s) com foto escolhida`);
```

Na seção 3 (o que NÃO pode ler), acrescentar duas linhas:

```js
  await deveSerNegado("site_slots.id", "SELECT id FROM site_slots LIMIT 1");
  await deveSerNegado("site_slots.created_at", "SELECT created_at FROM site_slots LIMIT 1");
```

- [ ] **Step 5: Documentação (`docs/loja-contrato.md`)**

Acrescentar `site_slots` (colunas `area`, `category`, `position`, `product_id`, `photo_url`) à lista de tabelas e colunas liberadas, e uma seção nova "Vitrine do site" com as duas consultas do bloco **Interfaces** desta task, dizendo: carrossel = só as vagas, na ordem de `position`, sem completar; categoria = foto da vaga ou, sem vaga, a foto automática de hoje; peça que sai do site some sozinha das duas consultas (o `JOIN` com a regra de visibilidade).

- [ ] **Step 6: Testes e commit**

Run: `npx tsc --noEmit -p . ; npm run test:all`
Expected: PASS.

```bash
git add scripts docs/loja-contrato.md tests/db/store.db.test.ts
git commit -m "Contrato de leitura: usuario da loja le as vagas da vitrine (site_slots)"
```

---

### Task 10: Loja, fonte de dados lê as vagas da vitrine

**Onde:** projeto `C:\Users\João\Documents\loja-fernanda-brilhante`, branch `vitrine-do-site` (criar com `git switch -c vitrine-do-site`).

**Files:**
- Modify: `lib/tipos.ts`, `lib/dados/fonte.ts`, `lib/dados/postgres.ts`, `lib/dados/teste.ts`
- Test: `lib/dados/postgres.test.ts`, `lib/dados/teste.test.ts`

**Interfaces:**
- Produces:
  - `lib/tipos.ts`: `export type VagaCarrossel = { pecaId: number; foto: string }` e `export type Vitrine = { carrossel: VagaCarrossel[]; categorias: Record<string, string> }` (chave = nome da categoria)
  - `FonteDeDados.vitrine(): Promise<Vitrine>`
  - `lib/dados/postgres.ts`: `SQL_VITRINE_CARROSSEL`, `SQL_VITRINE_CATEGORIAS` (as mesmas do Radar) e `COLUNAS_LIBERADAS.site_slots`
  - `lib/dados/teste.ts`: `VITRINE_TESTE` e o terceiro parâmetro de `criarFonteTeste(linhas, config, vitrine = VITRINE_TESTE)`

- [ ] **Step 1: Testes (falham)**

Em `lib/dados/postgres.test.ts`: no `ESQUEMA` acrescentar (depois de `CREATE TABLE store_settings ...`):

```sql
  CREATE TABLE site_slots (
    id SERIAL PRIMARY KEY, area TEXT NOT NULL, category TEXT, position INT NOT NULL DEFAULT 0,
    product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE, photo_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
```

e no `DADOS`:

```sql
  INSERT INTO site_slots (area, category, position, product_id, photo_url) VALUES
    ('carrossel', NULL, 1, 6, 'car-6.jpg'),
    ('carrossel', NULL, 0, 1, 'car-1.jpg'),
    ('carrossel', NULL, 2, 4, 'fora.jpg'),
    ('categoria', 'Anéis', 0, 6, 'cat-aneis.jpg'),
    ('categoria', 'Brincos', 0, 4, 'cat-fora.jpg');
```

Acrescentar dentro de `describe("fonte Postgres", ...)`:

```ts
  it("vitrine: carrossel na ordem das vagas e categorias com foto escolhida, só de peças visíveis", async () => {
    const v = await criarFontePostgres(consultar).vitrine();
    expect(v.carrossel).toEqual([{ pecaId: 1, foto: "car-1.jpg" }, { pecaId: 6, foto: "car-6.jpg" }]); // a peça 4 (fora do site) não entra
    expect(v.categorias).toEqual({ Anéis: "cat-aneis.jpg" }); // Brincos aponta para peça fora do site
  });

  it("vitrine: sem a tabela site_slots (Radar ainda sem a vitrine), devolve vazio", async () => {
    await db.exec("DROP TABLE site_slots");
    const v = await criarFontePostgres(consultar).vitrine();
    expect(v).toEqual({ carrossel: [], categorias: {} });
  });
```

Em `lib/dados/teste.test.ts` acrescentar:

```ts
  it("vitrine de teste: carrossel e categorias de exemplo", async () => {
    const v = await criarFonteTeste().vitrine();
    expect(v.carrossel.map((c) => c.pecaId)).toEqual([1, 3, 6]);
    expect(v.categorias).toHaveProperty("Anéis");
  });
```

(Se o arquivo não tiver `describe("...")` aberto no fim, colocar o `it` dentro do `describe` principal dele.)

Run: `npx vitest run lib/dados`
Expected: FAIL.

- [ ] **Step 2: Tipos e contrato da fonte**

`lib/tipos.ts`, acrescentar no fim:

```ts
// Vitrine do site: as fotos que o João escolheu no Radar para o carrossel e para cada categoria.
export type VagaCarrossel = { pecaId: number; foto: string };
export type Vitrine = { carrossel: VagaCarrossel[]; categorias: Record<string, string> };
```

`lib/dados/fonte.ts`: importar `Vitrine` e acrescentar à interface:

```ts
  vitrine(): Promise<Vitrine>; // só vagas de peças visíveis; vazio se o Radar ainda não tem a vitrine
```

(o `import type { Configuracoes, Peca } from "../tipos";` passa a incluir `Vitrine`).

- [ ] **Step 3: `lib/dados/postgres.ts`**

Em `COLUNAS_LIBERADAS` acrescentar `site_slots: ["area", "category", "position", "product_id", "photo_url"],`. Depois de `SQL_CONFIG` acrescentar:

```ts
export const SQL_VITRINE_CARROSSEL = `SELECT s.product_id, s.photo_url, s.position FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'carrossel' AND ${VISIVEL} ORDER BY s.position, s.product_id`;
export const SQL_VITRINE_CATEGORIAS = `SELECT s.category, s.photo_url FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'categoria' AND ${VISIVEL}`;
```

E dentro do objeto retornado por `criarFontePostgres`, depois de `configuracoes()`:

```ts
    async vitrine() {
      try {
        const [carrossel, categorias] = await Promise.all([consultar(SQL_VITRINE_CARROSSEL), consultar(SQL_VITRINE_CATEGORIAS)]);
        return {
          carrossel: carrossel.map((l) => ({ pecaId: Number(l.product_id), foto: String(l.photo_url) })),
          categorias: Object.fromEntries(categorias.map((l) => [String(l.category), String(l.photo_url)])),
        };
      } catch (erro) {
        // 42P01 = tabela não existe (Radar ainda sem a Vitrine do site).
        if ((erro as { code?: string }).code === "42P01") return { carrossel: [], categorias: {} };
        throw erro;
      }
    },
```

- [ ] **Step 4: `lib/dados/teste.ts`**

Importar `Vitrine` de `../tipos`. Depois de `CONFIG_TESTE`:

```ts
export const VITRINE_TESTE: Vitrine = {
  carrossel: [
    { pecaId: 1, foto: "/teste/anel-2.svg" },
    { pecaId: 3, foto: "/teste/brinco.svg" },
    { pecaId: 6, foto: "/teste/colar.svg" },
  ],
  categorias: { Anéis: "/teste/anel-2.svg" },
};
```

Trocar a assinatura por `export function criarFonteTeste(linhas: LinhaTeste[] = LINHAS_TESTE, config: Configuracoes = CONFIG_TESTE, vitrine: Vitrine = VITRINE_TESTE): FonteDeDados {` e acrescentar ao objeto retornado:

```ts
    async vitrine() {
      const visiveis = new Set(pecas().map((p) => p.id));
      return { carrossel: vitrine.carrossel.filter((c) => visiveis.has(c.pecaId)), categorias: vitrine.categorias };
    },
```

- [ ] **Step 5: Rodar**

Run: `npx tsc --noEmit ; npx vitest run lib/dados`
Expected: PASS. (Os testes de página que criam fontes falsas podem precisar do método novo: se o TypeScript reclamar, acrescentar `async vitrine() { return { carrossel: [], categorias: {} }; },` nesses objetos de teste.)

- [ ] **Step 6: Commit (no projeto da loja)**

```bash
git add lib
git commit -m "Fonte de dados le as vagas da vitrine do Radar"
```

---

### Task 11: Loja, carrossel e categorias usam as vagas

**Onde:** projeto da loja, branch `vitrine-do-site`.

**Files:**
- Modify: `lib/catalogo.ts`, `components/vitrine-inicial.tsx`, `app/page.tsx`
- Test: `lib/catalogo.test.ts`, `components/vitrine.test.tsx`

**Interfaces:**
- Consumes: `Vitrine`, `VagaCarrossel` (`lib/tipos.ts`).
- Produces:
  - `pecasDoCarrossel(pecas: Peca[], vagas: VagaCarrossel[]): { peca: Peca; foto: string }[]` (na ordem das vagas; ignora vaga cuja peça não está na lista; sem limite de 8 aqui, quem limita é o Radar)
  - `aplicarFotosDeCategoria(categorias: CategoriaVitrine[], escolhidas: Record<string, string>): CategoriaVitrine[]`
  - `slidesDoHero(itens: { peca: Peca; foto: string }[], config: Configuracoes): SlideHero[]` (a foto do slide é a da vaga)
  - `pecasDoHero` **deixa de existir** (o carrossel não completa mais sozinho).

- [ ] **Step 1: Testes (falham)**

Em `lib/catalogo.test.ts`, no import trocar `pecasDoHero` por `pecasDoCarrossel, aplicarFotosDeCategoria`, **apagar** os dois testes `hero: destaques, depois promoções...` e `hero com menos de 5...`, e acrescentar dentro do `describe`:

```ts
  it("carrossel: só as vagas, na ordem, com a foto escolhida; peça que não está à venda é ignorada", () => {
    const itens = pecasDoCarrossel(pecas, [
      { pecaId: 6, foto: "/teste/colar.svg" },
      { pecaId: 1, foto: "/teste/anel-2.svg" },
      { pecaId: 999, foto: "/teste/x.svg" },
    ]);
    expect(itens.map((i) => [i.peca.id, i.foto])).toEqual([[6, "/teste/colar.svg"], [1, "/teste/anel-2.svg"]]);
    expect(pecasDoCarrossel(pecas, [])).toEqual([]); // sem vagas, sem carrossel
  });

  it("foto de categoria: usa a escolhida; sem escolha, mantém a automática", () => {
    const cats = aplicarFotosDeCategoria(categoriasComPecas(pecas), { Anéis: "/teste/anel-2.svg" });
    expect(cats.find((c) => c.nome === "Anéis")!.foto).toBe("/teste/anel-2.svg");
    expect(cats.find((c) => c.nome === "Brincos")!.foto).toBe("/teste/brinco.svg");
  });
```

Em `components/vitrine.test.tsx`, trocar `hero={slidesDoHero(pecasDoHero(pecas), CONFIG_TESTE)}` por `hero={slidesDoHero(pecasDoCarrossel(pecas, VITRINE_TESTE.carrossel), CONFIG_TESTE)}` e ajustar os imports (`pecasDoCarrossel` no lugar de `pecasDoHero`, e `import { VITRINE_TESTE } from "@/lib/dados/teste";`). Acrescentar um teste:

```tsx
  it("sem vagas no carrossel, o carrossel não aparece", () => {
    const html = renderToStaticMarkup(
      <VitrineInicial hero={[]} categorias={categoriasComPecas(pecas)} promocoes={[]} novidades={novidades(pecas)} config={CONFIG_TESTE} />,
    );
    expect(html).not.toContain("Destaques da loja");
  });
```

(usar o mesmo `renderToStaticMarkup` e `pecas` que o arquivo já usa.)

Run: `npx vitest run lib/catalogo.test.ts components/vitrine.test.tsx`
Expected: FAIL.

- [ ] **Step 2: `lib/catalogo.ts`**

Apagar a função `pecasDoHero` inteira (e o comentário dela) e acrescentar:

```ts
// Carrossel do topo: só o que o João escolheu no Radar, na ordem dele, com a foto que ele escolheu.
// Vaga cuja peça não está mais à venda é ignorada (o Radar já filtra, isto é só uma segunda proteção).
export function pecasDoCarrossel(pecas: Peca[], vagas: VagaCarrossel[]): { peca: Peca; foto: string }[] {
  const itens: { peca: Peca; foto: string }[] = [];
  for (const v of vagas) {
    const peca = pecas.find((p) => p.id === v.pecaId);
    if (peca) itens.push({ peca, foto: v.foto });
  }
  return itens;
}

// Foto de cada categoria: a escolhida no Radar; sem escolha, fica a automática (peça mais nova).
export function aplicarFotosDeCategoria(categorias: CategoriaVitrine[], escolhidas: Record<string, string>): CategoriaVitrine[] {
  return categorias.map((c) => (escolhidas[c.nome] ? { ...c, foto: escolhidas[c.nome] } : c));
}
```

e trocar o import do topo por `import type { CategoriaVitrine, Peca, VagaCarrossel } from "./tipos";`.

- [ ] **Step 3: `components/vitrine-inicial.tsx`**

Trocar `slidesDoHero` por:

```tsx
export function slidesDoHero(itens: { peca: Peca; foto: string }[], config: Configuracoes): SlideHero[] {
  return itens.map(({ peca: p, foto }) => ({
    id: p.id,
    nome: p.nome,
    foto,
    precoCentavos: p.precoCentavos,
    promocionalCentavos: p.promocionalCentavos,
    chamada: chamadaParcela(precoAtual(p), config.acrescimoParcelaCentavos, config.maxParcelas),
  }));
}
```

(O componente `CarrosselHero` já devolve `null` quando `slides` está vazio, então não precisa mudar.)

- [ ] **Step 4: `app/page.tsx`**

Substituir o conteúdo por:

```tsx
import { obterFonte } from "@/lib/dados";
import { aplicarFotosDeCategoria, categoriasComPecas, novidades, pecasDoCarrossel, pecasEmPromocao } from "@/lib/catalogo";
import VitrineInicial, { slidesDoHero } from "@/components/vitrine-inicial";

export const revalidate = 60;

export default async function PaginaInicial() {
  const fonte = obterFonte();
  const [pecas, config, vitrine] = await Promise.all([fonte.listarPecas(), fonte.configuracoes(), fonte.vitrine()]);

  return (
    <VitrineInicial
      hero={slidesDoHero(pecasDoCarrossel(pecas, vitrine.carrossel), config)}
      categorias={aplicarFotosDeCategoria(categoriasComPecas(pecas), vitrine.categorias)}
      promocoes={pecasEmPromocao(pecas)}
      novidades={novidades(pecas)}
      config={config}
    />
  );
}
```

- [ ] **Step 5: Rodar tudo da loja**

Run: `npx tsc --noEmit ; npm test`
Expected: PASS (todos, incluindo os 92 anteriores que continuem valendo). Depois `npm run dev` em outra porta (`npx next dev -p 3001`) e conferir a página inicial com os dados de teste: carrossel com 3 destaques (fotos de `VITRINE_TESTE`), categoria "Anéis" com a foto escolhida.

- [ ] **Step 6: Commit (no projeto da loja)**

```bash
git add lib components app
git commit -m "Carrossel e fotos de categoria vem das vagas escolhidas no Radar"
```

---

## Entrega (depois das 11 tasks)

Nada aqui é publicado sem o "pode publicar" do João dito na hora.

- [ ] **A. Revisão final do Radar:** `npx tsc --noEmit -p .`, `npm run test:all`, `npx next build`; conferência no navegador (computador e celular); apagar o usuário de teste e os dados de demonstração criados; parar o servidor local.
- [ ] **B. Ensaio no Neon (o João faz com a minha orientação, como da outra vez):** criar branch `teste-vitrine` a partir da `main`; ligar o sistema local nela (`$env:DATABASE_URL = "..."; npm.cmd run dev -- -p 3100`) para a migração 012 rodar; rodar o **PASSO B** do `scripts/loja-usuario-leitura.sql` no SQL Editor da branch de teste; rodar `node scripts/ensaio-loja-leitura.mjs` com a conexão do `loja_leitura` da cópia; conferir que a `main` continua sem a tabela `site_slots`; apagar a cópia.
- [ ] **C. Publicar (com o "pode publicar"):** incluir a branch `arruma-fim-de-linha` (já feita) e `vitrine-do-site` na `main` e enviar. Conferir a migração 012 no Neon (`SELECT id FROM schema_migrations ORDER BY id;` termina em `012`).
- [ ] **D. Contrato na produção:** o João roda de novo o **PASSO B** na `main` do Neon (a linha nova do `site_slots`) e o script de conferência contra a produção.
- [ ] **E. Loja:** com os testes da loja passando, o João coloca a loja no ar (Task 13 do plano dela) e liga ao banco (Task 14) com a conexão do `loja_leitura` só na Vercel dela.
- [ ] **F. Memória:** atualizar `radar-de-vendas-projeto.md` e `loja-online-fernanda-brilhante.md` com a vitrine, a migração 012 e o que foi publicado.
