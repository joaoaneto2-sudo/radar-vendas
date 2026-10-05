// Liga as fotos novas (close + modelo) da pasta Blue Diamond as 3 pecas e cadastra as que faltam no
// banco de TESTE local. Script de uso unico. Recusa se DATABASE_URL nao for localhost.
// Uso: node --env-file=.env.local scripts/ligar-fotos-novas-blue-diamond.mjs

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL || "";
const dbHost = (() => { try { return new URL(DATABASE_URL).hostname; } catch { return ""; } })();
if (dbHost !== "localhost" && dbHost !== "127.0.0.1") {
  console.error(`RECUSADO: DATABASE_URL nao e local ("${dbHost}").`);
  process.exit(1);
}

const PASTA = "Blue Diamond";
const RAIZ = "C:\\Users\\João\\Claude\\Projetos\\Fernanda Brilhante\\Estoque\\1 - Estoque Principal";
const PORT = 4550;
const MARKUP = 2.5;

const arquivos = fs.readdirSync(path.join(RAIZ, PASTA)).filter((f) => /\.png$/i.test(f));
const achar = (comeco) => {
  const f = arquivos.find((a) => a.startsWith(comeco));
  if (!f) throw new Error(`Foto nao encontrada: ${comeco}`);
  return `http://localhost:${PORT}/${encodeURIComponent(PASTA)}/${encodeURIComponent(f)}`;
};

// fx/fy = onde esta a joia na foto da modelo (para o corte do painel direito).
const PECAS = [
  { nome: "Colar em cristal azul e ródio", categoria: "Colares e Correntes", custo: 159, close: "Colar de Gemas Azuis sobre", modelo: "Colar de Gemas Azul-Turquesa", fx: 50, fy: 60 },
  { nome: "Brinco rode negro e zircônias", categoria: "Brincos", custo: 49, close: "Brincos Lavanda em Leque", modelo: "Retrato Glamouroso", fx: 75, fy: 50 },
  { nome: "Brinco longo em pedras legítimas", categoria: "Brincos", custo: 94, close: "Brincos Dourados com Gemas", modelo: "Retrato de luxo", fx: 75, fy: 50 },
];

const pool = new pg.Pool({ connectionString: DATABASE_URL });
const { rows: fab } = await pool.query("SELECT id FROM manufacturers WHERE lower(name) = 'blue diamond'");
const manufacturerId = fab[0]?.id;
if (!manufacturerId) throw new Error("Fabricante Blue Diamond nao encontrado");

for (const p of PECAS) {
  const close = achar(p.close);
  const modelo = achar(p.modelo);
  const foto = JSON.stringify({ kind: "limpa", fx: p.fx, fy: p.fy, zoom: 1 });

  const { rows: ja } = await pool.query("SELECT id FROM products WHERE lower(name) = lower($1) AND manufacturer_id = $2", [p.nome, manufacturerId]);
  let id = ja[0]?.id;
  if (id) {
    await pool.query("UPDATE products SET photo_url = $1, catalog_photo = $2::jsonb WHERE id = $3", [close, foto, id]);
    console.log(`Atualizada: ${p.nome} (id ${id})`);
  } else {
    const preco = Math.round(p.custo * MARKUP * 100) / 100;
    const { rows } = await pool.query(
      `INSERT INTO products (category, name, manufacturer_id, cost, price, stock_qty, sale_channel, active,
         photo_url, show_online, availability, show_catalog, catalog_photo)
       VALUES ($1,$2,$3,$4,$5,1,'varejo',true,$6,false,'pronta_entrega',true,$7::jsonb) RETURNING id`,
      [p.categoria, p.nome, manufacturerId, p.custo, preco, close, foto]
    );
    id = rows[0].id;
    console.log(`Cadastrada: ${p.nome} (id ${id}, custo ${p.custo})`);
  }

  await pool.query("DELETE FROM product_photos WHERE product_id = $1 AND kind = 'modelo'", [id]);
  await pool.query("INSERT INTO product_photos (product_id, url, position, kind) VALUES ($1, $2, 0, 'modelo')", [id, modelo]);
}

const { rows: total } = await pool.query("SELECT count(*)::int AS n, sum(cost)::numeric(12,2) AS custo FROM products WHERE manufacturer_id = $1", [manufacturerId]);
console.log(`Blue Diamond agora: ${total[0].n} peca(s), custo R$ ${total[0].custo}`);
await pool.end();
