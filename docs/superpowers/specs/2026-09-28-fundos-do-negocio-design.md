# Fundos do negócio: sete fundos e uma lista que o João edita

Data: 28/09/2026. Pedido do João. Desenho aprovado por ele em conversa. Atualizado no mesmo dia: o João acrescentou quatro fundos (Digital, Tráfego pago, Embalagens, Frete), então a lista deixou de ser fixa e passou a ser editável.

## Objetivo

Toda venda (e toda entrada que entra na divisão) passa a separar uma % para cada fundo, do mesmo jeito que já separa 30% para o fundo de reposição. Os fundos que já nascem prontos:

1. **Prospecção**
2. **Transporte** (deslocamento: viagens, motoboy, transporte por aplicativo)
3. **Custos fixos** (aplicativos, MEI, contador)
4. **Digital** (custos digitais; os aplicativos ficam em Custos fixos)
5. **Tráfego pago** (anúncios pagos)
6. **Embalagens**
7. **Frete** (envio para o cliente: Correios, Melhor Envio; é diferente de Transporte)

O João pode **criar, renomear e arquivar fundos** na própria tela. Ele decide a % de cada fundo e **quando ela vale**: só neste mês, a partir do mês que vem, ou por tempo indeterminado. Os acumulados de cada fundo ficam visíveis no alto do Painel financeiro.

## Decisões do João

1. **De onde sai o dinheiro:** do valor da venda, junto com os 30% da reposição, antes de dividir o lucro. Os dois sócios pagam metade. (Não é sobre o lucro, nem só da parte do João.)
2. **Como o fundo é usado:** ao lançar uma despesa, escolhe-se "Pagar com o fundo de: nenhum ou um dos fundos". O fundo paga primeiro; só o que faltar sai do lucro (mesma ideia do fundo de reposição).
3. **Quando a % vale:** o mês inteiro (do dia 1 ao último), inclusive as vendas do mês que já aconteceram. Meses anteriores não mudam.
4. **Faixa de fundos no alto do Painel financeiro**, com o fundo de reposição e todos os fundos novos: acumulado, gasto, saldo e a % do mês.
5. **A lista de fundos é editável** (recomendação do Claude, aceita): nascem os 7 acima; o João cria, renomeia e arquiva.
6. **Digital, aplicativos e frete:** aplicativos são Custos fixos; Transporte e Frete são fundos diferentes.

## Regras de cálculo

Cada evento que entra na divisão (venda ou parcela de varejo, consignado, comissão de atacado, outra receita; aporte de sócio não entra) passa por:

```
reposição   = base x % de reposição do tipo (como hoje)
cada fundo  = base x % do fundo no mês da data do evento
lucro       = base - reposição - soma dos fundos - custos da venda
```

O resto da cascata continua igual (compensar despesas e prejuízos, dividir entre os sócios, abater a dívida do João).

**Exemplo (venda de R$ 250; prospecção 5%, transporte 3%, custos fixos 4%; os outros fundos em 0%):** reposição 75,00; prospecção 12,50; transporte 7,50; custos fixos 10,00; sobra para dividir 145,00 (72,50 para cada).

**Despesa paga com fundo:** a despesa entra na ordem do tempo como hoje. Se ela tem fundo, `coberto = min(saldo do fundo naquele ponto, valor da despesa)`. O coberto sai do fundo (não desconta do lucro). O que faltar (`valor - coberto`) entra em "a compensar", como toda despesa entra hoje. O saldo nunca fica negativo.

**Arredondamento:** cada fundo usa `pctOf(base, pct)` separadamente (mesmo arredondamento da reposição). A soma das partes continua fechando em centavos.

**Venda cancelada:** já fica fora da cascata, então deixa de separar para os fundos (o saldo se ajusta sozinho).

**Padrão:** sem nenhuma regra, a % de cada fundo é 0. Com todas as % em 0, todos os números do sistema são idênticos aos de hoje (os testes atuais da cascata continuam passando sem alteração).

**Fundos arquivados continuam contando o passado:** o motor considera todos os fundos (inclusive arquivados) ao calcular meses antigos.

## Regras por mês

Uma regra: `fund_id`, `pct`, `from_month`, `to_month` (nulo = sem fim), `created_at`, `created_by_id`, `created_by_name`. Meses são sempre o dia 1 do mês (`DATE`), inclusive nas duas pontas.

**% de um fundo no mês M:** entre as regras do fundo que cobrem M (`from_month <= M` e `to_month` nulo ou `>= M`), vale a de **maior `created_at`** (desempate por maior `id`). Sem nenhuma, 0.

**As três opções da tela** (o mês corrente vem de `todayBR()`):

| Opção | from_month | to_month |
|---|---|---|
| Só este mês | mês corrente | mês corrente |
| A partir do mês que vem | mês seguinte | nulo |
| Por tempo indeterminado | mês corrente | nulo |

Como a regra mais recente ganha, um mês de exceção volta sozinho à regra anterior quando termina, e uma decisão nova sempre vence a antiga nos meses em comum.

**Validação de uma regra nova:**
- `pct` entre 0 e 100, até 2 casas.
- Em todos os meses afetados, `soma das % de todos os fundos + a maior das % de reposição (varejo, consignado, atacado) <= 100`. Confere no mês inicial da regra e em cada mês em que alguma regra começa ou termina dali para frente (os únicos meses em que o total muda).
- Fundo desconhecido ou arquivado é recusado.

**Apagar uma regra** é permitido (com confirmação): a regra anterior volta a valer naqueles meses. Fica registrado no Histórico de alterações. Não há "desfazer" para regras nesta versão.

**Criar fundo:** nome (obrigatório, sem repetir outro fundo, sem diferenciar maiúsculas) e descrição opcional. Nasce com 0%.
**Renomear fundo:** muda nome e descrição; o histórico do fundo continua o mesmo.
**Arquivar fundo:** só se a % dele for 0 neste mês e em todos os meses futuros com regra, e se o saldo for zero. Arquivado some das opções de despesa e de regra nova, mas o passado continua contando. Dá para reativar.

## Banco de dados (migração 016, só acrescenta)

```sql
CREATE TABLE funds (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  description TEXT,
  position INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX funds_nome_idx ON funds (lower(btrim(name)));
-- nascem os 7 fundos, em ordem

CREATE TABLE fund_rules (
  id SERIAL PRIMARY KEY,
  fund_id INT NOT NULL REFERENCES funds(id),
  pct NUMERIC(5,2) NOT NULL CHECK (pct BETWEEN 0 AND 100),
  from_month DATE NOT NULL CHECK (EXTRACT(DAY FROM from_month) = 1),
  to_month DATE CHECK (to_month IS NULL OR (EXTRACT(DAY FROM to_month) = 1 AND to_month >= from_month)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id INT,
  created_by_name TEXT
);
CREATE INDEX fund_rules_fund_idx ON fund_rules (fund_id, from_month);

ALTER TABLE expenses ADD COLUMN fund_id INT REFERENCES funds(id);

-- gatilho do histórico (função log_change já existe) em funds e fund_rules
```

- Nada existente é alterado ou apagado. Despesas antigas ficam com `fund_id` nulo.
- `loja_leitura` não recebe nenhum grant novo (nenhuma tabela nova é lida pela loja). O teste de permissões existente continua provando isso.
- O histórico de alterações passa a mostrar "Fundo" e "Regra de fundo" (`lib/change-log.ts`).
- Fundos nunca são apagados (só arquivados), então as chaves estrangeiras nunca ficam órfãs.

## Motor (lib/finance)

- **`lib/finance/funds.ts` (novo, sem banco):** tipos `Fundo`, `FundRule`, `OpcaoDeQuando`; `mesDe`, `mesSeguinte`, `pctDoFundo(regras, fundId, mes)`, `periodoDaOpcao(opcao, hojeISO)`, `validarRegra(...)`, `podeArquivar(...)`, `validarNomeDoFundo(...)`.
- **`lib/finance/cascade.ts`:** recebe um sexto parâmetro opcional `funds` (lista de fundos, regras e a data de hoje) e, nas despesas, o `fundId`. Por evento acrescenta `fundsCents` (quanto foi para cada fundo, por id) e, nas despesas, `fundCoveredCents`. `profitCents` desconta a soma dos fundos. No resultado, `funds` traz por fundo: `enteredCents` (acumulado), `spentCents`, `balanceCents`, `pctThisMonth`, `enteredThisMonthCents`. `totals.expensesCents` continua sendo todas as despesas lançadas; novos `totals.fundsCents` e `totals.fundCoveredCents`.
- **`lib/finance/load.ts`:** lê `funds`, `fund_rules` e `expenses.fund_id` e passa para o motor.
- O fundo de reposição (`computeFund` em `lib/finance/accounts.ts`) não muda. A faixa do Painel só junta os cartões para mostrar.

## API

- `GET /api/funds`: fundos (com `pctThisMonth`, `enteredCents`, `spentCents`, `balanceCents`, `enteredThisMonthCents`), regras (quem mudou e quando) e a data de hoje.
- `POST /api/funds`: cria fundo `{ name, description }`.
- `PATCH /api/funds/[id]`: `{ name?, description?, active? }` (renomear e arquivar/reativar).
- `POST /api/funds/rules`: `{ fund_id, pct, quando: "so_este_mes" | "proximo_mes" | "sempre" }`. Registra `created_by` pela sessão. Devolve erros claros (em português) das validações.
- `DELETE /api/funds/rules/[id]`: apaga a regra (dentro de `comoUsuario`, para o histórico saber quem apagou).
- Despesas: `POST/PATCH /api/expenses` aceitam `fund_id` (vazio ou o id de um fundo ativo). Despesa criada por fatura continua sem poder ser editada, então continua sem fundo (fora de escopo). `GET /api/expenses` devolve `fund_id` e `fund_name`.

## Telas

- **Painel financeiro (`/financeiro`), alto da página:** nova faixa de fundos (`app/financeiro/faixa-dos-fundos.tsx`), logo abaixo do título e antes do quadro do acordo. Um cartão para o Fundo de reposição e um para cada fundo ativo. Cada um: **acumulado**, **gasto**, **saldo** e a % do mês. Cartão de fundo novo leva a `/financeiro/fundos`; o de reposição leva a `/financeiro/fundo`. Os cartões quebram de linha; no celular, dois por linha, sem rolagem lateral. A tabela final da cascata ganha uma coluna "Fundos" (o que foi separado em cada venda).
- **Financeiro > Fundos (`/financeiro/fundos`, nova):** um cartão por fundo com "Mudar %", "Renomear" e "Arquivar"; botão "+ Novo fundo"; janelinha do "Mudar %" com o novo valor e "Quando vale?", cada opção com o mês escrito por extenso (por exemplo, "Só em setembro de 2026"); lista das regras (fundo, %, período, quem mudou e quando) com "Apagar"; seção "Arquivados" com "Reativar". Entra no menu lateral (grupo Financeiro) e no "Mais" do celular.
- **Despesas:** campo "Pagar com o fundo de" no formulário (só fundos ativos); a lista mostra o fundo escolhido.

## Testes

- **Unidade (`tests/unit/funds.test.ts`):** resolução da % por mês (só este mês volta à regra anterior; a partir do mês que vem; por tempo indeterminado; a mais recente vence; sem regra = 0); `periodoDaOpcao` para as três opções (inclusive virada de ano); validação (0 a 100, soma com a reposição, meses de virada de regra); `podeArquivar`; nome do fundo.
- **Cascata (`tests/unit/cascade-fundos.test.ts`):** o exemplo de R$ 250 (145,00 a dividir, 72,50 cada); vários fundos; fundo mudando de % entre meses; despesa coberta por inteiro, em parte e sem saldo; saldo nunca negativo; venda cancelada; atacado (comissão) e outra receita entram, aporte de sócio não; fundo arquivado continua contando o passado; **regressão: sem fundos (ou com 0% em todos), o resultado é idêntico ao de hoje** (os testes atuais da cascata seguem passando sem mexer neles).
- **Banco (`tests/db/funds.db.test.ts`):** migração 016 (num banco vazio e num banco que já estava na 015 com despesas), os 7 fundos nascem, CHECKs das regras, criar/renomear/arquivar fundo, criar e apagar regra registrando quem fez, `loja_leitura` continua sem ler as tabelas novas.
- **Integração (`tests/db/funds-summary.db.test.ts`):** regras e despesa com fundo no banco geram os números certos no resumo financeiro.
- **Telas:** conferência no navegador (computador e celular): faixa no Painel, tela de Fundos, lançar despesa com fundo e ver o saldo mudar.

## Publicação

- Migração 016 só acrescenta. **Recomendo ensaiar numa cópia do Neon** antes de publicar (a migração mexe na tabela de despesas), mesmo o sistema ficando parado enquanto as % estiverem em 0. A decisão é do João na hora.
- Só publica com "pode publicar" do João.
- Como as % começam em 0, nada muda nos números até ele configurar.

## Fora desta versão

- Escolher fundo em despesas que vêm de fatura do cartão (hoje essas despesas nem podem ser editadas).
- % diferente por tipo de venda.
- Passar dinheiro de um fundo para outro.
- "Desfazer" para mudanças de % (apagar a regra já resolve).
- Nome do fundo no título das regras do Histórico de alterações (mostra "fundo nº X").
