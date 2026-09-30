# Catálogo online (desenho)

Data: 28/09/2026. Pedido do João. Substitui o catálogo em PDF. Ainda não há código: este documento espera o OK do João.

## O que é

Um catálogo interativo dentro da loja online que já existe (`loja-fernanda-brilhante.vercel.app`, projeto `C:\Users\João\Documents\loja-fernanda-brilhante`). Ele lê o banco do Radar, como a loja. Um cadastro só, sem segundo estoque.

Modelo visual: o catálogo da GAB (Gabi), com a marca Fernanda Brilhante. Cada peça é um cartão com foto limpa e foto da modelo, tipo e preço, por exemplo "Brinco 129,90".

## Decisões do João (28/09/2026)

1. Caminho A: uma área nova `/catalogo` dentro da loja que já existe.
2. Peças sob encomenda aparecem no catálogo. O cliente NÃO vê aviso de "sob encomenda" nem prazo. Só nós sabemos, no Radar, que a peça não tem pronta entrega.
3. A cliente pede só pelo WhatsApp. Sem carrinho no catálogo.
4. Preço de cada peça = custo x 2,5 (o markup de sempre).

## Como o cliente usa

- `/catalogo`: todas as categorias, cada uma com uma foto e o nome. Cada categoria só aparece se tiver peça no catálogo.
- `/catalogo/aneis`, `/catalogo/brincos` e assim por diante: um link por categoria, feito para mandar no WhatsApp.
- Cartão da peça: foto limpa e foto da modelo, tipo e preço.
- Clique no cartão: abre a galeria com todas as fotos da peça.
- Botão "Quero esta peça": abre o WhatsApp da Fernanda (5581988990095) com a mensagem já escrita, com o nome da peça e a referência.
- Sem carrinho, sem frete, sem parcelamento. Se a cliente quiser, isso se resolve na conversa.

## Banco de dados (migração 017, só acrescenta)

Depois da 016 dos fundos. Ensaiada numa cópia do banco antes de ir para produção. Nada é apagado.

Colunas novas em `products`:

| Coluna | Tipo | Para que serve |
|---|---|---|
| `availability` | text, padrão `'pronta_entrega'`, só aceita `'pronta_entrega'` ou `'encomenda'` | Diz se a peça existe na mão da Fernanda. `'encomenda'` = só existe no catálogo do fabricante. Uso interno, a loja NÃO lê. |
| `manufacturer_code` | text, pode ser nulo | Código do fabricante (por exemplo 023612809015). Uso interno, a loja NÃO lê. Único por fabricante quando preenchido. |
| `show_catalog` | boolean, padrão false | A peça aparece no catálogo online. Independe de `show_online` (a loja com carrinho). |
| `catalog_position` | int, pode ser nulo | Ordem dentro da categoria. Nulo = ordem de cadastro. |

Coluna nova em `product_photos`:

| Coluna | Tipo | Para que serve |
|---|---|---|
| `kind` | text, pode ser nulo, só aceita `'limpa'` ou `'modelo'` | Diz qual foto vai na colagem. A foto principal da peça (`products.photo_url`) é tratada como a limpa. |

Regras:
- Peça de atacado (`sale_channel = 'atacado'`, da Bia) nunca entra no catálogo. Trava no banco, como já existe para `show_online`.
- Peça `'encomenda'` tem `stock_qty = 0` e nunca conta como estoque nosso, nem na dívida do João. O que o Radar mostra como estoque, alerta de estoque baixo e totais precisa ignorar `'encomenda'` (a conferir no plano).
- Regra de publicação do catálogo: `sale_channel = 'varejo' AND active AND show_catalog AND price > 0`, com foto principal.
- Usuário de leitura `loja_leitura`: ganha `show_catalog`, `catalog_position` e `product_photos.kind`. NÃO ganha `availability`, `manufacturer_code`, `cost` nem dados de compra.
- Auditoria: as colunas novas entram no histórico de alterações que já existe.

## Sigilo do fabricante (regra que vale sempre)

- Nem o nome, nem o código, nem a etiqueta do fabricante aparecem no site.
- Fotos sobem para o Vercel Blob com nome neutro (sem código do fabricante) e sem metadados.
- O nome da peça que a cliente vê é o nome comercial, nunca o do fabricante.

## Cadastro das peças no Radar

Os prints que a Fernanda mandou têm a barra do celular. Os que têm 739 x 1600 pixels trazem a foto útil na faixa entre 430 e 1170 de altura, e os de 591 x 1280 na faixa proporcional. O corte é fixo, conferido visualmente numa cópia, sem tocar nos originais.

Fluxo:
1. Cortar as cópias (peça do estoque físico, pasta `Zarpellon - renomeadas`).
2. Uma tela de importação no Radar (parecida com a do catálogo da Bia) recebe as fotos e a planilha com código, nome, custo e tipo. Ela cria as peças, calcula o preço = custo x 2,5, liga as fotos (limpa ou modelo) e marca `show_catalog`.
3. Peças de encomenda entram do mesmo jeito, com `availability = 'encomenda'` e estoque 0, a partir do catálogo da Zarpellon.
4. Só roda depois do OK do João e do ensaio numa cópia.

Dados que ainda faltam: nome comercial de cada peça, e o custo de cada código (tabela da Zarpellon). Sem o custo não há preço.

## Fases

1. Este desenho aprovado.
2. Migração 017 e os campos novos no cadastro do Radar (peça pronta entrega ou encomenda, código, no catálogo, ordem, tipo da foto), com testes.
3. Tela de importação e cadastro das peças.
4. Páginas do catálogo na loja (`/catalogo`, `/catalogo/[categoria]`, galeria, botão de WhatsApp), com testes.
5. Conferência no celular e no computador, depois publicação, só com o "pode publicar" do João.

## Fora do escopo

Carrinho e frete no catálogo, atacado no catálogo, mostrar prazo de encomenda, e catálogo em PDF.
