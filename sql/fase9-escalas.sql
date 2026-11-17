-- ================================================================
-- PORTAL DANMO (nova geracao) - Fase 9: ESCALAS (Mensal e Semanal)
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
-- O QUE ISTO ACTIVA (o modulo Escalas do Admin. Oficinal):
--   A escala mensal e a escala semanal saem do Excel para o portal.
--   A mensal passa a ser editada na grelha (com gerador do ciclo de
--   turnos A-D, feriados e ferias trazidas do plano) e a semanal nasce
--   dela com 1 clique (semana de Sabado a Sexta, com contactos e
--   contagens), pronta a imprimir e afixar na vitrine.
--
--   esc_colaboradores -> registo da gente da escala: codigo, nome,
--                        contacto (o cliente usa para ligar), categoria,
--                        area (Supervisores, Grupos de Turno,
--                        Pneumaticos, Mecanica, Electrica, Serralharia,
--                        Outros), grupo de turno A-D, ordem de afixacao.
--   esc_dias          -> 1 linha por colaborador por dia: o codigo do
--                        dia (07/19, 19/07, Norm., Folga, Sup., Esc.,
--                        LD, FRD, CCIS, TDP). Celula vazia = sem
--                        apontamento. A semana e a mensal leem daqui.
--   esc_folgas        -> folgas guardadas que a gente acumula: nasce
--                        com valor (aceita 0.5 dia), goza-se numa data
--                        e fica com saldo visivel no mapa.
--   esc_notas         -> a nota importante do mes que vai no pe do
--                        papel afixado (ex.: operacao de granito).
-- ================================================================

-- 1) REGISTO DA GENTE DA ESCALA -----------------------------------
create table if not exists public.esc_colaboradores (
  id uuid primary key default gen_random_uuid(),
  colaborador_id integer references public.collaborators(id) on delete set null,
  codigo text not null,
  nome text not null,
  contacto text not null default '',
  categoria text not null default '',
  area text not null default 'Outros',
  grupo text,
  ordem integer not null default 999,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists esc_colaboradores_codigo_idx
  on public.esc_colaboradores(codigo);
create index if not exists esc_colaboradores_area_idx on public.esc_colaboradores(area, ordem);

-- 2) GRELHA DIARIA (celula da escala) ------------------------------
create table if not exists public.esc_dias (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.esc_colaboradores(id) on delete cascade,
  data date not null,
  codigo text not null,
  criado_em timestamptz not null default now()
);
create unique index if not exists esc_dias_colab_data_idx
  on public.esc_dias(colaborador_id, data);
create index if not exists esc_dias_data_idx on public.esc_dias(data);

-- 3) FOLGAS GUARDADAS ----------------------------------------------
create table if not exists public.esc_folgas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.esc_colaboradores(id) on delete cascade,
  data_origem date,
  valor numeric(4, 1) not null default 1,
  data_gozo date,
  estado text not null default 'guardada',
  obs text,
  criado_por text,
  criado_em timestamptz not null default now()
);
create index if not exists esc_folgas_colab_idx on public.esc_folgas(colaborador_id, estado);

-- 4) NOTA IMPORTANTE DO MES ----------------------------------------
create table if not exists public.esc_notas (
  id bigint generated always as identity primary key,
  ano integer not null,
  mes integer not null,
  texto text not null default '',
  criado_em timestamptz not null default now(),
  constraint esc_notas_unica unique (ano, mes)
);
