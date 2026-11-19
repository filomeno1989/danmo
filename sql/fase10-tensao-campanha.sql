-- ================================================================
-- PORTAL DANMO (nova geracao) - Fase 10: CAMPANHA DE TENSAO + MEDICACAO
-- ----------------------------------------------------------------
-- COMO CORRER (uma unica vez, ~1 minuto):
--   1. Abre o Supabase (supabase.com/dashboard) > o teu projecto
--   2. Menu lateral: SQL Editor > New query
--   3. Cola TODO este ficheiro e clica em RUN
--   4. Espera a mensagem verde de sucesso
--
-- SEGURANCA: pode correr-se mais do que uma vez sem partir nada
-- (usa "create table if not exists") e NAO apaga nem muda nenhum
-- dado que ja consta: sao SO tabelas novas.
--
-- O QUE ISTO ACTIVA (Portal HST > Tensão Arterial):
--   hst_tensao_campanha  -> a CAMPANHA DE CONTROLE aberta pelo HST:
--                           a lista do pessoal que entra no controle
--                           (mede com acompanhamento), com data de
--                           entrada. O % de tensão alta do painel conta
--                           SOBRE o pessoal da campanha e deixa de ser
--                           uma percentagem solta sobre tudo. Tirar
--                           alguém NAO apaga nada: a linha fica com
--                           ativo=false no histórico.
--   hst_tensao_medicacao -> a MEDICACAO que cada pessoa toma: nome do
--                           medicamento, dosagem, data de início, se a
--                           tomada é regular e se está activa (pausar
--                           nunca apaga). A ficha da pessoa mostra a
--                           estatística da tensão desde o início de
--                           cada medicação, comparada com o período
--                           antes dela.
-- ================================================================

-- 1) CAMPANHA DE CONTROLE DA TENSAO -------------------------------
create table if not exists public.hst_tensao_campanha (
  id uuid primary key default gen_random_uuid(),
  colaborador_id integer references public.collaborators(id) on delete set null,
  colaborador_nome text not null,
  inicio date not null default (current_date at time zone 'Africa/Maputo'),
  ativo boolean not null default true,
  fim date,
  criado_por text,
  criado_em timestamptz not null default now()
);
-- A mesma pessoa só pode estar 1 vez activa na campanha (saiu uma vez,
-- pode voltar: nasce uma linha nova de histórico).
create unique index if not exists hst_tensao_campanha_activa_idx
  on public.hst_tensao_campanha(colaborador_id)
  where ativo is true and colaborador_id is not null;
create index if not exists hst_tensao_campanha_ativo_idx
  on public.hst_tensao_campanha(ativo, inicio);

-- 2) MEDICACAO DE CADA PESSOA --------------------------------------
create table if not exists public.hst_tensao_medicacao (
  id uuid primary key default gen_random_uuid(),
  colaborador_id integer references public.collaborators(id) on delete set null,
  colaborador_nome text not null,
  medicamento text not null,
  dosagem text not null default '',
  desde date not null default (current_date at time zone 'Africa/Maputo'),
  regular boolean not null default true,
  activo boolean not null default true,
  observacoes text,
  criado_por text,
  criado_em timestamptz not null default now()
);
create index if not exists hst_tensao_medicacao_pessoa_idx
  on public.hst_tensao_medicacao(colaborador_nome, activo);
create index if not exists hst_tensao_medicacao_activo_idx
  on public.hst_tensao_medicacao(activo);
