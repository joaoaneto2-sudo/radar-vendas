-- USUARIO SOMENTE LEITURA PARA A LOJA ONLINE
--
-- O que este arquivo faz: cria o usuario "loja_leitura", que so consegue LER estas colunas:
--   products:         id, name, category, subtype, jewelry_type, material, karat, gemstone, warranty,
--                     public_description, price, sale_price, stock_qty, featured, photo_url,
--                     created_at, sale_channel, active, show_online
--   product_photos:   id, product_id, url, position
--   store_settings:   key, value
--   site_slots:       area, category, position, product_id, photo_url
-- Ele NAO consegue ler custo (cost), dados de compra (purchase_date, purchase_qty,
-- purchase_payment_method), fornecedor, fabricante, vendas, clientes, recebimentos, financeiro
-- nem nenhuma outra tabela, e NAO consegue escrever nada.
--
-- COMO USAR (voce faz sozinho, no painel do Neon):
--   1. Neon > seu projeto > SQL Editor. Confira que esta no banco certo, logado como o dono.
--   2. No PASSO A, troque so o texto entre aspas na linha "senha text := ..." por uma senha
--      forte que so voce sabe (pelo menos 16 caracteres, so para este usuario).
--      NAO mande essa senha no chat, nem para mim. Se voce esquecer de trocar, o script
--      para com um aviso e nao cria nada.
--   3. Rode o PASSO A, depois o PASSO B, depois o PASSO C (a conferencia).
--   4. Guarde a senha no cofre de senhas e cole so na Vercel da loja.
--
-- Pode rodar de novo sem estragar nada (se o usuario ja existe, a senha nao e alterada).
-- Coluna nova de products NAO fica liberada sozinha: se a loja precisar de uma, acrescente-a
-- aqui no PASSO B, de proposito.

-- ====================== PASSO A: criar o usuario ======================
-- Criado por SQL de proposito: usuarios criados pela tela "Roles" do Neon podem receber
-- poder de leitura total do banco, e aqui isso seria o contrario do que queremos.
DO $$
DECLARE
  senha text := 'TROQUE_ESTA_SENHA';  -- <<< troque so o texto entre aspas
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'loja_leitura') THEN
    IF senha = 'TROQUE_ESTA_SENHA' OR length(senha) < 16 THEN
      RAISE EXCEPTION 'Troque a senha de exemplo por uma senha sua, com pelo menos 16 caracteres, e rode de novo.';
    END IF;
    EXECUTE format(
      'CREATE ROLE loja_leitura LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 20',
      senha
    );
  END IF;
END $$;

-- Mesmo que alguem tente, a sessao dele nao consegue gravar.
ALTER ROLE loja_leitura SET default_transaction_read_only = on;

-- ====================== PASSO B: permissoes ======================
-- Comeca do zero: tira qualquer permissao que ele possa ter em tabelas e visoes
-- (isso tira tambem as permissoes de colunas).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM loja_leitura;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM loja_leitura;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM loja_leitura;

GRANT USAGE ON SCHEMA public TO loja_leitura;

-- So estas colunas, e mais nenhuma.
GRANT SELECT (
  id, name, category, subtype, jewelry_type, material, karat, gemstone, warranty,
  public_description, price, sale_price, stock_qty, featured, photo_url,
  created_at, sale_channel, active, show_online
) ON products TO loja_leitura;

GRANT SELECT (id, product_id, url, position) ON product_photos TO loja_leitura;

GRANT SELECT (key, value) ON store_settings TO loja_leitura;

GRANT SELECT (area, category, position, product_id, photo_url) ON site_slots TO loja_leitura;

-- ====================== PASSO C: conferencia (nao precisa da senha) ======================
-- 1) O usuario nao tem nenhum poder especial. Tudo abaixo deve ser "false":
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolreplication
  FROM pg_roles WHERE rolname = 'loja_leitura';

-- 2) Em quais tabelas ele consegue ler ALGUMA coluna. Deve aparecer "true" SOMENTE em:
--    product_photos, products, site_slots, store_settings.
SELECT c.relname AS tabela_ou_visao,
       has_any_column_privilege('loja_leitura', c.oid, 'SELECT') AS consegue_ler_alguma_coluna
  FROM pg_class c
 WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'v', 'm')
 ORDER BY consegue_ler_alguma_coluna DESC, c.relname;

-- 3) Colunas de products que ele consegue ler. Devem ser "true" so as 19 combinadas;
--    cost, purchase_date, purchase_qty, purchase_payment_method e o resto devem ser "false".
SELECT column_name AS coluna_de_products,
       has_column_privilege('loja_leitura', 'products', column_name, 'SELECT') AS consegue_ler
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'products'
 ORDER BY consegue_ler DESC, column_name;

-- 4) Ele nao pode escrever em nada. Deve ser "false":
SELECT has_table_privilege('loja_leitura', 'products', 'INSERT, UPDATE, DELETE') AS pode_escrever;
