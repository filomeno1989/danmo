-- ================================================================
-- PORTAL DANMO (nova geracao) - Fase 3c: TABELA DE PRECOS (catalogo)
-- ----------------------------------------------------------------
-- COMO CORRER (uma unica vez, ~1 minuto):
--   1. Abre o Supabase (supabase.com/dashboard) > o teu projecto
--   2. Menu lateral: SQL Editor > New query
--   3. Cola TODO este ficheiro e clica em RUN
--   4. Espera a mensagem verde de sucesso
--
-- SEGURANCA: pode correr-se mais do que uma vez sem partir nada
-- (usa "create table if not exists").
--
-- O QUE ISTO ACTIVA:
--   Nas Configuracoes da Oficina passa a existir a "Tabela de Precos",
--   onde se registam os valores unitarios que a CdM paga, por exemplo:
--     - Mao de Obra CdM  - 850 MT / hora
--     - Oxigenio         - 120 MT / kg
--     - Gas Propano      - 95 MT / kg
--     - Gas Acetileno    - 210 MT / kg
--   No pop-up de Fecho da obra, o valor da mao de obra e o valor dos
--   materiais SAO ASSUMIDOS AUTOMATICAMENTE desta tabela (podem ainda
--   ser ajustados naquele fecho, se a CdM acordar outro preco).
--
--   IMPORTANTE (regra do Filomeno): se um preco for EDITADO nesta
--   tabela, as obras JA FECHADAS nao mudam - cada fecho grava os seus
--   proprios valores (foto do preco no momento do fecho). Apenas os
--   fechos NOVOS usam o preco novo.
-- ================================================================

create table if not exists public.oficina_precos (
  id             bigint generated always as identity primary key,
  tipo           text not null default 'material',  -- 'mao_obra' | 'material'
  nome           text not null,
  unidade        text not null default 'un',        -- 'hora' | 'un' | 'kg' | 'lt'
  valor          numeric(12,2) not null default 0,
  criado_em      timestamptz not null default now(),
  actualizado_em timestamptz not null default now()
);

-- Nome unico dentro de cada tipo (evita "Oxigenio" duas vezes)
create unique index if not exists idx_precos_tipo_nome
  on public.oficina_precos(tipo, lower(nome));

create index if not exists idx_precos_tipo on public.oficina_precos(tipo);

-- NOTA sobre permissoes: tal como as restantes tabelas do portal, esta
-- fica sem RLS - o acesso e controlado no servidor do portal (guarda-api),
-- onde o utilizador so escreve com sessao e permissao do modulo Oficina.
