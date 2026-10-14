-- ================================================================
-- PORTAL DANMO (nova geracao) - Fase 3b: FATURACAO CdM (obras fechadas)
-- ----------------------------------------------------------------
-- COMO CORRER (uma unica vez, ~1 minuto):
--   1. Abre o Supabase (supabase.com/dashboard) > o teu projecto
--   2. Menu lateral: SQL Editor > New query
--   3. Cola TODO este ficheiro e clica em RUN
--   4. Espera a mensagem verde de sucesso
--
-- SEGURANCA: pode correr-se mais do que uma vez sem partir nada
-- (tudo usa "create table if not exists").
--
-- O QUE ISTO ACTIVA:
--   Quando a obra volta da CdM e se escolhe o estado "Fechada", a ficha
--   abre um formulario de FECHO onde se registam:
--     - Data de fecho (a data que a CdM fechou)
--     - Horas que a CdM considerou para o trabalho
--     - Valor que a CdM paga por hora  -> total = horas x valor
--     - Materiais usados (Oxigenio, Gas Propano, Gas Acetileno, outros)
--       com quantidade e valor unitario -> juntam ao total
--   E cria o modulo "Faturacao CdM" no menu da Oficina, onde se ve:
--   quantas obras fechadas por mes, totais, material aplicado, tempo
--   da CdM vs tempo do nosso pessoal, a diferenca e dias ate ao fecho.
--
-- PORQUE DUAS TABELAS:
--   obras_fechadas_cdm        -> uma linha por obra fechada (o fecho)
--   obras_fechadas_cdm_material -> os materiais desse fecho (1 ou mais)
-- ================================================================

-- 1) Tabela principal do fecho
create table if not exists public.obras_fechadas_cdm (
  id            bigint generated always as identity primary key,
  os_id         bigint not null references public.ordens_servico(id),
  data_fecho    date not null,
  horas_cdm     numeric(10,2) not null default 0,
  valor_hora    numeric(12,2) not null default 0,
  total_mao_obra numeric(14,2) not null default 0,
  total_material numeric(14,2) not null default 0,
  total_geral    numeric(14,2) not null default 0,
  responsavel   text,
  observacao    text,
  criado_em     timestamptz not null default now()
);

-- 2) Materiais do fecho (apagam-se sozinhos se o fecho for apagado)
create table if not exists public.obras_fechadas_cdm_material (
  id             bigint generated always as identity primary key,
  fecho_id       bigint not null references public.obras_fechadas_cdm(id) on delete cascade,
  material       text not null,
  quantidade     numeric(12,2) not null default 0,
  valor_unitario numeric(12,2) not null default 0,
  total          numeric(14,2) not null default 0
);

-- 3) Indices para as listas do modulo (rapido com muitos fechos)
create index if not exists idx_fechos_os on public.obras_fechadas_cdm(os_id);
create index if not exists idx_fechos_data on public.obras_fechadas_cdm(data_fecho);
create index if not exists idx_fechos_material on public.obras_fechadas_cdm_material(fecho_id);

-- NOTA sobre permissoes: tal como as restantes tabelas do portal, estas
-- duas ficam sem RLS - o acesso e controlado no servidor do portal
-- (guarda-api), onde o utilizador so escreve com sessao e permissao
-- do modulo Oficina.
