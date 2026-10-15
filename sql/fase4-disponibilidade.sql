-- ================================================================
-- PORTAL DANMO (nova geracao) - Fase 4: DISPONIBILIDADE DE EQUIPAMENTOS
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
-- O QUE ISTO ACTIVA (o modulo Disponibilidade de Equipamentos):
--   Os 7 requisitos do Filomeno, com os dados reais dos excels
--   "AVAILABILITY OF MACHINES" (2022 a 2026) ja importados:
--
--   disp_dias        -> 1 linha por maquina por dia: estado fisico do dia
--                       (Disponivel, Avariada, Acidentada, Pneumatico,
--                       Revisao/Manutencao, Inspecao, Aguarda Acessorio),
--                       horas disponiveis (0 a 24, como nos excels antigos)
--                       e hora de entrada/saida (a folha DAN_DTEC_FR_005
--                       passa a ser preenchida aqui, sem papel)
--   disp_mensal      -> agregado mensal por maquina em horas por estado
--                       (A, PM, TY, AC, BD, SP no excel), igual ao SUMMARY
--                       do excel; e a fonte das comparacoes mes/mes e ano/ano
--   disp_horometro   -> leituras mensais INITIAL / END / W.H. (a folha
--                       HOURMETER CONTROL DAN_ADO_FR_021 passa a ser
--                       lancada aqui, maquina por maquina, ou directamente
--                       pelos colaboradores na recolha)
--   disp_transicoes  -> segmentos com data/hora de cada periodo que a
--                       maquina passou parada (entrou Avariada as 10:22,
--                       as 15:00 mudou para Aguarda Acessorio: o sistema
--                       grava os 2 segmentos e soma as horas de cada estado,
--                       contando 24h por dia mesmo sem a maquina ser mexida)
--   disp_config      -> configuracoes do modulo: meta de disponibilidade
--                       (80% por defeito, ajustavel)
--   disp_semanal     -> Resumo Semanal da Direccao por frota: pendentes
--                       de inicio, entradas, saidas, aguardam pecas
--                       (pendentes de fecho = inicio + entradas - saidas)
--   disp_semana_geral-> por semana: dificuldades da semana e plano de
--                       melhorias (responsavel, prazo, estado), como no
--                       ficheiro do Director
-- ================================================================

-- 1) GRELHA DIARIA ------------------------------------------------
create table if not exists public.disp_dias (
  id bigint generated always as identity primary key,
  equipment_id integer not null references public.equipment(id) on delete cascade,
  data date not null,
  estado text,
  horas_disponiveis numeric(5, 2),
  hora_entrada text,
  hora_saida text,
  observacao text,
  origem text not null default 'sistema',
  criado_por text,
  criado_em timestamptz not null default now()
);
create unique index if not exists disp_dias_eq_data_idx
  on public.disp_dias(equipment_id, data);
create index if not exists disp_dias_data_idx on public.disp_dias(data);

-- 2) AGREGADO MENSAL (fonte das comparacoes) ----------------------
create table if not exists public.disp_mensal (
  id bigint generated always as identity primary key,
  equipment_id integer not null references public.equipment(id) on delete cascade,
  ano integer not null,
  mes integer not null,
  horas_a numeric(7, 2) not null default 0,
  horas_pm numeric(7, 2) not null default 0,
  horas_ty numeric(7, 2) not null default 0,
  horas_ac numeric(7, 2) not null default 0,
  horas_bd numeric(7, 2) not null default 0,
  horas_sp numeric(7, 2) not null default 0,
  horas_total numeric(7, 2) not null default 0,
  origem text not null default 'sistema',
  constraint disp_mensal_unica unique (equipment_id, ano, mes)
);
create index if not exists disp_mensal_periodo_idx on public.disp_mensal(ano, mes);

-- 3) HOROMETRO MENSAL ---------------------------------------------
create table if not exists public.disp_horometro (
  id bigint generated always as identity primary key,
  equipment_id integer not null references public.equipment(id) on delete cascade,
  ano integer not null,
  mes integer not null,
  leitura_inicial numeric(12, 2),
  leitura_final numeric(12, 2),
  horas_trabalhadas numeric(12, 2),
  lancado_por text,
  lancado_em timestamptz not null default now(),
  observacao text,
  constraint disp_horometro_unica unique (equipment_id, ano, mes)
);
create index if not exists disp_horometro_periodo_idx on public.disp_horometro(ano, mes);

-- 4) TRANSICOES DE ESTADO (segmentos com data/hora) ---------------
create table if not exists public.disp_transicoes (
  id bigint generated always as identity primary key,
  equipment_id integer not null references public.equipment(id) on delete cascade,
  estado text not null,
  inicio timestamptz not null,
  fim timestamptz,
  os_id integer references public.ordens_servico(id) on delete set null,
  observacao text,
  criado_por text,
  criado_em timestamptz not null default now()
);
create index if not exists disp_transicoes_eq_idx
  on public.disp_transicoes(equipment_id, inicio);

-- 5) CONFIGURACOES (meta 80% ajustavel) ---------------------------
create table if not exists public.disp_config (
  id integer primary key default 1,
  meta_disponibilidade numeric(5, 2) not null default 80,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
insert into public.disp_config (id, meta_disponibilidade)
values (1, 80)
on conflict (id) do nothing;

-- 6) RESUMO SEMANAL DA DIRECCAO (por frota) ------------------------
create table if not exists public.disp_semanal (
  id bigint generated always as identity primary key,
  ano integer not null,
  semana integer not null,
  frota text not null,
  pend_inicio integer not null default 0,
  entradas integer not null default 0,
  saidas integer not null default 0,
  aguardam_pecas integer not null default 0,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint disp_semanal_unica unique (ano, semana, frota)
);
create index if not exists disp_semanal_periodo_idx on public.disp_semanal(ano, semana);

-- 7) RESUMO SEMANAL: DIFICULDADES + PLANO DE MELHORIAS -------------
create table if not exists public.disp_semana_geral (
  id bigint generated always as identity primary key,
  ano integer not null,
  semana integer not null,
  dificuldades text,
  melhorias jsonb not null default '[]'::jsonb,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint disp_semana_geral_unica unique (ano, semana)
);

-- 8) PERMISSOES do modulo (igual ao padrao da oficina) -------------
-- A matriz de permissoes e lida por nivel; damos o modulo "disponibilidade"
-- aos mesmos niveis que ja veem a Oficina (o admin ve sempre tudo).
-- ATENCAO: a coluna chama-se "acao" (com UM c), igual na fase 1.
insert into public.permissoes (nivel, modulo, acao, permitido)
select n.nivel, 'disponibilidade', a.acao, true
from (select distinct nivel from public.permissoes where modulo = 'oficina') n
cross join (values ('ver'), ('criar'), ('editar'), ('apagar')) as a(acao)
on conflict do nothing;

-- Rede de seguranca: se a matriz ainda nao tiver linhas da Oficina,
-- damos o modulo aos niveis que ja existem nos utilizadores activos
-- (em vez de nao dar a ninguem). O admin ve sempre tudo de qualquer forma.
insert into public.permissoes (nivel, modulo, acao, permitido)
select n.nivel, 'disponibilidade', a.acao, true
from (select distinct nivel from public.utilizadores where coalesce(ativo, true)) n
cross join (values ('ver'), ('criar'), ('editar'), ('apagar')) as a(acao)
where not exists (select 1 from public.permissoes where modulo = 'oficina')
on conflict do nothing;
