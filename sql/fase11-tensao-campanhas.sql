-- ================================================================
-- PORTAL DANMO (nova geracao) - Fase 11: CAMPANHAS NUMERADAS DA TENSAO
-- ----------------------------------------------------------------
-- COMO CORRER (uma unica vez, ~1 minuto):
--   1. Abre o Supabase (supabase.com/dashboard) > o teu projecto
--   2. Menu lateral: SQL Editor > New query
--   3. Cola TODO este ficheiro e clica em RUN
--   4. Espera a mensagem verde de sucesso
--
-- SEGURANCA: pode correr-se mais do que uma vez sem partir nada
-- (usa "create table if not exists" e "add column if not exists") e
-- NAO apaga nem muda nenhum dado que ja consta. O pessoal que ja esta
-- na campanha (aberta pela fase 10) continua na base: quando abrires
-- a primeira campanha numerada no portal, ele entra nela
-- automaticamente (Campanha 01).
--
-- O QUE ISTO ACTIVA (Portal HST > Tensão Arterial > Campanha):
--   hst_tensao_campanhas  -> o REGISTO das campanhas com NUMERAÇÃO:
--                            Campanha 01, Campanha 02, ... cada uma com
--                            data de início, data de fim e estado
--                            (aberta ou arquivada). Ao ARQUIVAR, a
--                            campanha fica no histórico para consultar
--                            ou gerar o relatório a qualquer momento,
--                            e a campanha nova segue a numeração
--                            (nunca reusa número). Só pode haver 1
--                            campanha aberta de cada vez.
--   hst_tensao_campanha.campanha_id -> liga cada pessoa à campanha
--                            em que entrou (o histórico de quem saiu
--                            continua lá, agora sabendo a que campanha
--                            pertenceu).
-- ================================================================

-- 1) REGISTO DAS CAMPANHAS NUMERADAS ------------------------------
create table if not exists public.hst_tensao_campanhas (
  id uuid primary key default gen_random_uuid(),
  numero integer not null,
  inicio date not null default (current_date at time zone 'Africa/Maputo'),
  fim date,
  estado text not null default 'aberta',
  criado_por text,
  criado_em timestamptz not null default now(),
  constraint hst_tensao_campanhas_numero_unica unique (numero)
);
-- Só pode existir 1 campanha aberta de cada vez.
create unique index if not exists hst_tensao_campanhas_aberta_unica
  on public.hst_tensao_campanhas(estado)
  where estado = 'aberta';
create index if not exists hst_tensao_campanhas_estado_idx
  on public.hst_tensao_campanhas(estado, numero desc);

-- 2) LIGAÇÃO DO PESSOAL À CAMPANHA --------------------------------
alter table public.hst_tensao_campanha
  add column if not exists campanha_id uuid
  references public.hst_tensao_campanhas(id) on delete set null;
create index if not exists hst_tensao_campanha_campanha_idx
  on public.hst_tensao_campanha(campanha_id, ativo);
