# Contrato do Radar com a loja online

O que a loja pode ler no banco do Radar, com os nomes exatos. Tudo abaixo existe depois das
migrações 010 e 011. O usuário `loja_leitura` (criado por `scripts/loja-usuario-leitura.sql`) só lê
estas colunas, e não escreve em nada.

## products (só estas 19 colunas)

| Coluna | Tipo | Observação |
|---|---|---|
| id | serial | |
| name | text | |
| category | text | |
| subtype | text | |
| jewelry_type | text | |
| material | text | |
| karat | text | |
| gemstone | text | |
| warranty | text | |
| public_description | text, pode ser nulo | descrição escrita para o cliente |
| price | numeric(12,2), pode ser nulo | preço normal |
| sale_price | numeric(12,2), pode ser nulo | preço promocional; nulo = sem promoção; sempre menor que `price` |
| stock_qty | int | |
| featured | boolean, padrão false | carrossel do topo; só pode ser true com `show_online` true |
| photo_url | text, pode ser nulo | foto principal |
| created_at | timestamptz | |
| sale_channel | text | `'varejo'` ou `'atacado'` |
| active | boolean | |
| show_online | boolean, padrão false | a peça aparece na loja; nunca é true para `sale_channel = 'atacado'` |

Regra sugerida para a loja (ela já usa): `sale_channel = 'varejo' AND active AND show_online AND price > 0`.
O usuário de leitura enxerga também as peças que NÃO estão no site (só estas colunas), por isso a
loja precisa filtrar.

## product_photos (fotos extras; a principal é `products.photo_url`)

`id`, `product_id`, `url`, `position` (ordem, menor primeiro).
A coluna `created_at` existe, mas NÃO é liberada para a loja.

## store_settings (chave e valor, os dois em texto)

`key` (chave primária), `value`.

| key | value | exemplo | se a chave não existir |
|---|---|---|---|
| entrega_salvador | decimal com ponto | `15.00` | entrega "a combinar" |
| correios | decimal com ponto | `25.00` | envio "a combinar" |
| acrescimo_parcela | decimal com ponto | `10.00` | R$ 10,00 por parcela |
| max_parcelas | inteiro de 1 a 24 | `12` | 12x |

`0.00` é entrega grátis (valor de propósito). Campo em branco no Radar APAGA a chave.

## Diferenças em relação ao pedido original

Nenhuma nos nomes. Extras que o Radar acrescentou, sem efeito para a loja:

- regras no banco: carrossel só com site ligado, atacado fora do site, promoção maior que zero e
  menor que o preço normal;
- tabela `store_settings_v1` (o formato antigo de uma linha só, guardado);
- visões `store_products` e `store_product_photos` (sem uso pela loja, sem acesso do usuário de leitura).

## Conferência

`tests/db/store.db.test.ts` roda as consultas `SQL_PECAS`, `SQL_PECA` e `SQL_CONFIG` da loja com o
usuário de leitura e confirma que ler `cost`, dados de compra, vendas e clientes é recusado.
