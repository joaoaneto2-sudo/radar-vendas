# Vitrine do site: escolher no Radar as peças e as fotos que aparecem na loja

Data: 20/09/2026. Estado: aguardando revisão do João. Nada disto foi construído ainda.

## 1. Objetivo

O João quer **garantir que o que aparece na loja online está disponível, correto e com foto boa**, e quer
**decidir tudo isso pelo Radar**. O site enxerga o estoque, mas quem decide o que é publicado, e com qual
foto em cada área do site, é o João.

## 2. Decisões do João

1. **Sem estoque:** a peça publicada continua no site com a etiqueta "Esgotada", sem botão de comprar. A loja já faz
   isso hoje (não muda nada).
2. **Para publicar**, o Radar **bloqueia** o "No site" se faltar **foto principal, preço ou descrição** e diz o que falta.
3. **Fotos:** vêm só das peças (a principal e as extras). Sem imagens soltas.
4. **Carrossel do topo:** só o que o João escolher, na ordem que definir. Sem nenhum escolhido, o carrossel some.
5. **Cada área do site tem um lugar no Radar** para escolher a foto.

## 3. Áreas do site e como cada uma passa a funcionar

| Área da loja | Hoje | Depois |
|---|---|---|
| Carrossel do topo (até 8) | Peças marcadas "Carrossel", depois promoções, depois novidades, com a foto principal | **Só as vagas que o João escolher**, cada uma com a peça, a foto e a ordem. Sem vagas, some. |
| Foto de cada categoria (página inicial) | Foto principal da peça mais nova da categoria | **A foto escolhida.** Sem escolha, continua a automática de hoje. |
| Capa da peça (cartões de Promoções, Novidades, categoria, busca, carrinho) | Foto principal | Igual, mas o João pode **tornar principal qualquer foto** da peça. |
| Galeria da peça | Principal e depois as extras, em ordem | Igual (a ordem das extras já pode ser mudada no Radar). |
| Fundo com textura, logo | Arquivo fixo do projeto da loja | Não muda. |

## 4. Banco de dados (migração 012, só acrescenta)

Uma tabela nova, `site_slots` (as "vagas"):

| Coluna | Para quê |
|---|---|
| `id` | identificador |
| `area` | `carrossel` ou `categoria` (lista fixa no código, com `CHECK`) |
| `category` | nome da categoria, obrigatório quando `area = categoria`, vazio no carrossel |
| `position` | ordem dentro do carrossel |
| `product_id` | a peça dona da foto, `NOT NULL`, `ON DELETE CASCADE` (apagou a peça, some a vaga) |
| `photo_url` | a foto escolhida, `NOT NULL` |
| `created_at` | data |

Garantias no banco: uma peça só aparece uma vez no carrossel (índice único parcial em `product_id` onde
`area = carrossel`); uma categoria só tem uma foto escolhida (índice único parcial em `category` onde
`area = categoria`). A regra "a foto tem de ser uma foto **daquela peça**" e o limite de 8 no carrossel ficam na API,
porque o banco não consegue conferir isso sozinho.

Nenhuma coluna existente muda. A coluna `products.featured` continua existindo (o contrato da loja lê ela) e passa a ser
**mantida em sincronia** (ver seção 6).

## 5. Contrato de leitura da loja

- Novo `GRANT SELECT (area, category, position, product_id, photo_url) ON site_slots TO loja_leitura;` no PASSO B de
  `scripts/loja-usuario-leitura.sql`. O script continua podendo ser rodado de novo sem estragar nada.
- Duas consultas novas para a loja (as duas só devolvem vagas de peças **ainda publicadas**, com a mesma regra de
  visibilidade das peças, isto é `p.sale_channel = 'varejo' AND p.active = true AND p.show_online = true AND p.price > 0`):
  - carrossel: `SELECT s.product_id, s.photo_url, s.position FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'carrossel' AND (regra de visibilidade acima) ORDER BY s.position, s.id`
  - categorias: `SELECT s.category, s.photo_url FROM site_slots s JOIN products p ON p.id = s.product_id WHERE s.area = 'categoria' AND (regra de visibilidade acima)`
- `docs/loja-contrato.md` e o teste `tests/db/store.db.test.ts` passam a incluir essas consultas, rodadas **com o usuário de
  leitura**, junto com a recusa de ler qualquer outra coisa.
- No banco real, o João roda o PASSO B de novo no Neon (uma linha nova). Passo pequeno, guiado.

## 6. Radar: o que muda

### 6.1 Regra de publicar (bloqueio)
Uma peça só pode ficar "No site" se tiver **foto principal, preço maior que zero e descrição**. Vale em três lugares:
ao clicar "No site" na lista, ao salvar o cadastro com "No site" ligado, e **ao editar uma peça já publicada** (não deixa
apagar a foto principal nem a descrição sem antes tirar do site). A mensagem diz o que falta, por exemplo: "Faltam: foto
principal e descrição." A regra fica numa função de `lib/store-rules.ts` (testada) e a API e as telas usam essa mesma função.
A lista de produtos passa a mostrar a etiqueta **"Incompleta"** em peça que não cumpre a regra.

### 6.2 Tornar principal e ordem da galeria
Na peça, cada foto ganha o botão **"Tornar principal"**: a foto escolhida vira `photo_url` e a principal antiga vai
para as extras. A ordem das extras continua como já é. Vagas que apontam para uma foto que **sai** da peça (foto extra
apagada, ou principal substituída por outra foto nova) **são removidas** e a tela avisa quais.

### 6.3 Tela "Vitrine do site" (menu Loja)
Duas partes:
- **Carrossel do topo** (contador "3 de 8"): lista de vagas, cada uma com miniatura, nome, botões **subir / descer**,
  **trocar foto** (mostra as fotos daquela peça para escolher) e **remover**. Botão **adicionar peça** (lista das peças
  publicadas que ainda não estão no carrossel; começa com a foto principal). Salvar grava a lista inteira de uma vez.
- **Categorias:** uma linha por categoria que tem peça publicada. Mostra a foto atual (escolhida, ou "automática: nome da
  peça") e **escolher foto** (fotos das peças publicadas daquela categoria) e **voltar ao automático**.
Vaga cuja peça saiu do site aparece em vermelho, "fora do site, não aparece na loja". No celular, as mesmas
telas em uma coluna, e a ordem muda por botões (sem arrastar).

### 6.4 O botão "Carrossel" da lista
Continua existindo como **atalho**: ligar coloca a peça no fim do carrossel com a foto principal (se já houver 8, avisa);
desligar tira a peça do carrossel. `featured` é gravado junto, na mesma transação, e vira sempre igual a "tem vaga no
carrossel". Tirar a peça do site tira a vaga do carrossel (como hoje "desligar o site desliga o carrossel"); a foto de
categoria escolhida **fica guardada** e volta a valer se a peça for publicada de novo.

### 6.5 API
- `GET /api/vitrine`: carrossel, categorias e as peças publicadas com suas fotos.
- `PUT /api/vitrine/carrossel`: recebe a lista `[{product_id, photo_url}]` na ordem; valida (no máximo 8, sem peça
  repetida, peça publicada, foto pertence à peça) e substitui tudo numa transação.
- `PUT /api/vitrine/categoria`: define `{category, product_id, photo_url}`; `DELETE` volta ao automático.
- `POST /api/products/[id]/photos/principal`: torna uma foto a principal.

## 7. Loja (projeto `loja-fernanda-brilhante`)

- A fonte de dados ganha `vitrine()`, que roda as duas consultas novas (e a fonte de teste devolve vagas de exemplo).
- O carrossel usa **só** as vagas: sem vagas, não aparece (a função `pecasDoHero` deixa de completar com promoções e
  novidades). O conteúdo do slide continua sendo o nome e o preço da peça, com a foto da vaga.
- O quadrado de cada categoria usa a foto da vaga; sem vaga, a foto automática de hoje.
- Cartões e carrinho continuam usando a foto principal (agora escolhida no Radar), sem mudança.
- Como a loja ainda não foi publicada, não há risco de quebrar algo que já está no ar. A loja tem seus próprios testes.

## 8. Testes

- **Unitários** (`lib/`): regra de publicar (o que falta), validação da lista do carrossel (limite, repetição, foto da
  peça, peça publicada), escolha da foto de categoria.
- **Banco descartável:** migração 012, índices únicos, `CASCADE`, e a sincronia de `featured`.
- **Contrato:** as consultas novas rodando com o usuário `loja_leitura`, e a recusa de ler o que não deve.
- **Na tela:** conferência no navegador (computador e celular), sem rolagem lateral.
- **Script de conferência** `scripts/ensaio-loja-leitura.mjs` passa a rodar também as consultas novas.

## 9. Entrega

1. Branch `vitrine-do-site` (a partir de `arruma-fim-de-linha`, que já inclui o conserto do CSS). Ordem: regras e migração,
   regra de publicar, tornar principal, APIs da vitrine, tela, contrato e documentação.
2. Ensaio da migração 012 e do PASSO B numa **cópia do Neon**, como já fizemos.
3. Só publico com o "pode publicar" do João. Depois, ele roda o PASSO B na produção.
4. Alterações na loja num passo separado, no projeto dela, com os testes dela.

## 10. Fora do escopo

Imagens soltas que não são de peça, banners e faixas de campanha, página "Sobre", arrastar e soltar com o mouse, e
mexer no fundo/logo do site. Cada um pode virar um pedido futuro; a tabela de vagas foi feita para receber áreas novas
sem migração nova (basta acrescentar o valor à lista fixa de áreas).

## 11. Pontos para o João confirmar

- O botão "Carrossel" da lista vira atalho (seção 6.4). Se preferir **tirá-lo da lista** e usar só a tela Vitrine, é
  uma mudança pequena.
- A foto de categoria escolhida **fica guardada** quando a peça sai do site, e a loja a ignora até a peça voltar
  (seção 6.4). Se preferir que ela seja apagada junto, também é simples.
- O limite de 8 destaques no carrossel é o que a loja já usa hoje.
