# Fundos do negócio: prospecção, transporte e custos fixos

Data: 28/09/2026. Pedido do João. Desenho aprovado por ele em conversa (as três decisões e as duas partes do desenho).

## Objetivo

Toda venda (e toda entrada que entra na divisão) passa a separar uma % para três fundos novos, do mesmo jeito que já separa 30% para o fundo de reposição:

- **Prospecção**
- **Transporte**
- **Custos fixos** (aplicativos, MEI, contador)

O João decide a % de cada fundo, e decide **quando ela vale**: só neste mês, a partir do mês que vem, ou por tempo indeterminado. Os acumulados de cada fundo ficam visíveis no alto do Painel financeiro.

## Decisões do João

1. **De onde sai o dinheiro:** do valor da venda, junto com os 30% da reposição, antes de dividir o lucro. Os dois sócios pagam metade. (Não é sobre o lucro, nem só da parte do João.)
2. **Como o fundo é usado:** ao lançar uma despesa, escolhe-se "Pagar com o fundo de: nenhum / prospecção / transporte / custos fixos". O fundo paga primeiro; só o que faltar sai do lucro (mesma ideia do fundo de reposição).
3. **Quando a % vale:** o mês inteiro (do dia 1 ao último), inclusive as vendas do mês que já aconteceram. Meses anteriores não mudam.
4. **Faixa de fundos no alto do Painel financeiro**, com os quatro fundos (reposição e os três novos): acumulado, gasto, saldo e a % do mês.

## Regras de cálculo

Cada evento que entra na divisão (venda ou parcela de varejo, consignado, comissão de atacado, outra receita; aporte de sócio não entra) passa por:

```
reposição   = base x % de reposição do tipo (como hoje)
cada fundo  = base x % do fundo no mês da data do evento
lucro       = base - reposição - soma dos fundos - custos da venda
```

O resto da cascata continua igual (compensar despesas e prejuízos, dividir entre os sócios, abater a dívida do João).

**Exemplo (venda de R$ 250; prospecção 5%, transporte 3%, custos fixos 4%):** reposição 75,00; prospecção 12,50; transporte 7,50; custos fixos 10,00; sobra para dividir 145,00 (72,50 para cada).

**Despesa paga com fundo:** a despesa entra na ordem do tempo como hoje. Se ela tem fundo, `coberto = min(saldo do fundo naquele ponto, valor da despesa)`. O coberto sai do fundo (não desconta do lucro). O que faltar (`valor - coberto`) entra em "a compensar", como toda despesa entra hoje. O saldo nunca fica negativo.

**Arredondamento:** cada fundo usa `pctOf(base, pct)` separadamente (mesmo arredondamento da reposição). A soma das partes continua fechando em centavos.

**Venda cancelada:** já fica fora da cascata, então deixa de separar para os fundos (o saldo se ajusta sozinho).

**Padrão:** sem nenhuma regra, a % de cada fundo é 0. Com todas as % em 0, todos os números do sistema são idênticos aos de hoje (os testes atuais da cascata continuam passando sem alteração).

## Regras por mês

Uma regra: `fund`, `pct`, `from_month`, `to_month` (nulo = sem fim), `created_at`, `created_by_id`, `created_by_name`. Meses são sempre o dia 1 do mês (`DATE`), inclusive nas duas pontas.

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
- Em todos os meses afetados, `soma das % dos três fundos + a maior das % de reposição (varejo, consignado, atacado) <= 100`. Confere no mês inicial da regra e em cada mês em que alguma regra começa ou termina dali para frente (os únicos meses em que o total muda).
- Fundo desconhecido é recusado.

**Apagar uma regra** é permitido (com confirmação): a regra anterior volta a valer naqueles meses. Fica registrado no Histórico de alterações. Não há "desfazer" para regras nesta versão.

## Banco de dados (migração 016, só acrescenta)

```sql
CREATE TABLE fund_rules (
  id SERIAL PRIMARY KEY,
  fund TEXT NOT NULL CHECK (fund IN ('prospeccao','transporte','custos_fixos')),
  pct NUMERIC(5,2) NOT NULL CHECK (pct BETWEEN 0 AND 100),
  from_month DATE NOT NULL CHECK (from_month = date_trunc('month', from_month)::date),
  to_month DATE CHECK (to_month IS NULL OR (to_month = date_trunc('month', to_month)::date AND to_month >= from_month)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_id INT,
  created_by_name TEXT
);
CREATE INDEX fund_rules_fund_idx ON fund_rules (fund, from_month);

ALTER TABLE expenses ADD COLUMN fund TEXT
  CHECK (fund IS NULL OR fund IN ('prospeccao','transporte','custos_fixos'));

DROP TRIGGER IF EXISTS fund_rules_log ON fund_rules;
CREATE TRIGGER fund_rules_log AFTER UPDATE OR DELETE ON fund_rules
  FOR EACH ROW EXECUTE FUNCTION log_change();
```

- Nada existente é alterado ou apagado. Despesas antigas ficam com `fund` nulo.
- `loja_leitura` não recebe nenhum grant novo (nenhuma das duas tabelas é lida pela loja). O teste de permissões existente continua provando isso.
- O histórico de alterações passa a mostrar "Regra de fundo" (`lib/change-log.ts`: nome da tabela, tipo "Regras dos fundos", título e rótulo do campo novo `fund`, "Fundo").

## Motor (lib/finance)

- **`lib/finance/funds.ts` (novo, sem banco):** chaves e nomes dos fundos; `pctDoFundo(regras, fundo, mes)`; `criarRegra(opcao, pct, hojeISO)` devolve `from/to`; `validarRegra(regrasAtuais, nova, reposicaoMaxima)`.
- **`lib/finance/cascade.ts`:** recebe `fundRules` e, nas despesas, o `fund`. Por evento acrescenta `fundsCents` (quanto foi para cada fundo) e, nas despesas, `fundCoveredCents`. `profitCents` desconta a soma dos fundos. No resultado, `funds` traz por fundo: `enteredCents` (acumulado), `spentCents`, `balanceCents`, `pctThisMonth`, `enteredThisMonthCents`. `totals.expensesCents` continua sendo todas as despesas lançadas; novo `totals.fundCoveredCents` mostra quanto delas foi coberto por fundos.
- **`lib/finance/load.ts`:** lê `fund_rules` e `expenses.fund` e passa para o motor. O mês corrente vem de `todayBR()`.
- O fundo de reposição (`computeFund` em `lib/finance/accounts.ts`) não muda. A faixa do Painel só junta os quatro para mostrar.

## API

- `GET /api/funds`: fundos com `pctThisMonth`, `enteredCents`, `spentCents`, `balanceCents`, `enteredThisMonthCents`, e a lista de regras (quem mudou e quando).
- `POST /api/funds/rules`: `{ fund, pct, quando: "so_este_mes" | "proximo_mes" | "sempre" }`. Registra `created_by` pela sessão. Devolve erros claros (em português) das validações.
- `DELETE /api/funds/rules/[id]`: apaga a regra (dentro de `comQuem`, para o histórico saber quem apagou).
- Despesas: `POST/PATCH /api/expenses` aceitam `fund` (vazio ou uma das três chaves). Despesa criada por fatura continua sem poder ser editada, então continua sem fundo (fora de escopo). `GET /api/expenses` devolve `fund`.

## Telas

- **Painel financeiro (`/financeiro`), alto da página:** nova faixa de fundos (`app/financeiro/faixa-dos-fundos.tsx`), logo abaixo do título e antes do quadro do acordo. Quatro cartões: Fundo de reposição, Prospecção, Transporte, Custos fixos. Cada um: **acumulado**, **gasto**, **saldo** e a % do mês. Cartão de fundo novo leva a `/financeiro/fundos`; o de reposição leva a `/financeiro/fundo`. No celular, dois cartões por linha, sem rolagem lateral. A tabela final da cascata ganha uma coluna "Fundos" (o que foi separado em cada venda).
- **Financeiro > Fundos (`/financeiro/fundos`, nova):** os três cartões com o botão "Mudar %"; janelinha com o novo valor e "Quando vale?", cada opção com o mês escrito por extenso (por exemplo, "Só em setembro de 2026"); lista das regras (fundo, %, período, quem mudou e quando) com "Apagar". Entra no menu lateral (grupo Financeiro) e no "Mais" do celular.
- **Despesas:** campo "Pagar com o fundo de" no formulário; a lista mostra o fundo escolhido.

## Testes

- **Unidade (`tests/unit/funds.test.ts`):** resolução da % por mês (só este mês volta à regra anterior; a partir do mês que vem; por tempo indeterminado; a mais recente vence; sem regra = 0); `criarRegra` para as três opções (inclusive virada de ano); validação (0 a 100, soma com a reposição, meses de virada de regra).
- **Cascata (`tests/unit/cascade-fundos.test.ts`):** o exemplo de R$ 250 (145,00 a dividir, 72,50 cada); vários fundos; fundo mudando de % entre meses; despesa coberta por inteiro, em parte e sem saldo; saldo nunca negativo; despesa apagada devolve ao fundo; venda cancelada; atacado (comissão) e outra receita entram, aporte de sócio não; **regressão: com 0% em todos, o resultado é idêntico ao de hoje** (os testes atuais da cascata seguem passando sem mexer neles).
- **Banco (`tests/db/funds.db.test.ts`):** migração 016 (num banco vazio e num banco que já estava na 015 com despesas), regras aceitas e recusadas (CHECKs), API de regras e de despesas com fundo, apagar regra registra no histórico com o nome de quem apagou, `loja_leitura` continua sem ler as tabelas novas.
- **Telas:** conferência no navegador (computador e celular): faixa no Painel, tela de Fundos com as três opções, lançar despesa com fundo e ver o saldo mudar.

## Publicação

- Migração 016 só acrescenta. **Recomendo ensaiar numa cópia do Neon** antes de publicar (a migração mexe na tabela de despesas), mesmo o sistema ficando parado enquanto as % estiverem em 0. A decisão é do João na hora.
- Só publica com "pode publicar" do João.
- Como as % começam em 0, nada muda nos números até ele configurar.

## Fora desta versão

- Escolher fundo em despesas que vêm de fatura do cartão (hoje essas despesas nem podem ser editadas).
- Mais de três fundos; % diferente por tipo de venda.
- Passar dinheiro de um fundo para outro.
- "Desfazer" para mudanças de % (apagar a regra já resolve).
