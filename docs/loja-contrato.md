# Contrato do Radar com a loja online

O que a loja pode ler no banco do Radar, com os nomes exatos. Tudo abaixo existe depois das
migrações 010, 011 e 012. O usuário `loja_leitura` (criado por `scripts/loja-usuario-leitura.sql`) só lê
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
| origem_atual | `'salvador'` ou `'recife'` | `recife` | considerar `'salvador'` |
| cep_origem_salvador | 8 números, sem traço | `40015970` | CEP de Salvador não definido |
| cep_origem_recife | 8 números, sem traço | `50030230` | CEP de Recife não definido |
| entrega_recife | decimal com ponto | `20.00` | entrega "a combinar" |
| caixa_comprimento_cm | inteiro, mínimo 16 | `20` | medida não definida |
| caixa_largura_cm | inteiro, mínimo 11 | `15` | medida não definida |
| caixa_altura_cm | inteiro, mínimo 2 | `5` | medida não definida |
| caixa_peso_g | inteiro, maior que 0 | `150` | peso não definido |

`0.00` é entrega grátis (valor de propósito). Campo em branco no Radar APAGA a chave (exceto
`origem_atual`, que nunca fica em branco: o Radar sempre grava `salvador` ou `recife`).

As peças viajam juntas, de Salvador ou do Recife (a Fernanda leva o estoque quando viaja). `origem_atual`,
os dois CEPs e a caixinha padrão servem para a loja calcular PAC e SEDEX pelo Melhor Envio a partir de onde
as peças estão saindo agora. Pedido do João, 22/09/2026.

## site_slots (vitrine do site: as fotos que o João escolhe no Radar)

Só estas 5 colunas são liberadas: `area`, `category`, `position`, `product_id`, `photo_url`.
As colunas `id` e `created_at` existem, mas NÃO são liberadas (por isso a ordenação usa `position` e `product_id`).

| area | category | O que é |
|---|---|---|
| carrossel | nulo | Um destaque do carrossel do topo. `position` é a ordem (menor primeiro). `product_id` é a peça e `photo_url` a foto escolhida (uma foto dessa peça). |
| categoria | nome da categoria | A foto do quadrado dessa categoria na página inicial. Uma por categoria. |

Consultas da loja (as duas já devolvem só vagas de peças ainda publicadas):

```sql
-- carrossel: só o que o João escolheu, na ordem dele. Sem linhas = o carrossel não aparece.
SELECT s.product_id, s.photo_url, s.position
  FROM site_slots s JOIN products p ON p.id = s.product_id
 WHERE s.area = 'carrossel'
   AND p.sale_channel = 'varejo' AND p.active = true AND p.show_online = true AND p.price > 0
 ORDER BY s.position, s.product_id;

-- foto de cada categoria. Sem linha para a categoria = usar a foto automática (peça mais nova).
SELECT s.category, s.photo_url
  FROM site_slots s JOIN products p ON p.id = s.product_id
 WHERE s.area = 'categoria'
   AND p.sale_channel = 'varejo' AND p.active = true AND p.show_online = true AND p.price > 0;
```

Regras: no máximo 8 destaques no carrossel; a foto de uma vaga é sempre uma foto da peça (a principal ou uma extra);
peça que sai do site some sozinha das duas consultas; uma peça publicada só existe com foto principal, preço e descrição.

## Diferenças em relação ao pedido original

Nenhuma nos nomes. Extras que o Radar acrescentou, sem efeito para a loja:

- regras no banco: carrossel só com site ligado, atacado fora do site, promoção maior que zero e
  menor que o preço normal;
- tabela `store_settings_v1` (o formato antigo de uma linha só, guardado);
- visões `store_products` e `store_product_photos` (sem uso pela loja, sem acesso do usuário de leitura).

## Conferência

`tests/db/store.db.test.ts` roda as consultas `SQL_PECAS`, `SQL_PECA`, `SQL_CONFIG`, `SQL_VITRINE_CARROSSEL` e
`SQL_VITRINE_CATEGORIAS` da loja com o usuário de leitura e confirma que ler `cost`, dados de compra, vendas e clientes é recusado.
