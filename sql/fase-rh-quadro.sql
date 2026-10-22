-- ================================================================
-- PORTAL DANMO (nova geracao) - RH: QUADRO DE PESSOAL (Fichas)
-- ----------------------------------------------------------------
-- COMO CORRER (uma unica vez, ~1 minuto):
--   1. Abre o Supabase (supabase.com/dashboard) > o teu projecto
--   2. Menu lateral: SQL Editor > New query
--   3. Cola TODO este ficheiro e clica em RUN
--   4. Espera a mensagem verde de sucesso
--
-- SEGURANCA: pode correr-se mais do que uma vez sem partir nada
-- (tudo usa "if not exists" e "where ... is null").
--
-- NAO TOCA em nada do que ja existe: a tabela collaborators continua
-- a ser a MESMA que o hub e a Oficina/Faturacao leem hoje. Nao se
-- cria RLS novo, nao se apaga coluna nenhuma, nao se muda valor de
-- campo algum que o hub use. So se ACRESCENTA o que o novo modulo
-- precisa:
--
--   A) empresa - a empresa a que o colaborador pertence HOJE:
--        'porto' = Danmo Porto (gerida por nos)
--        'danmo' = Danmo (gerida pelo pessoal da TCM)
--      A coluna nasce preenchida a partir de empresa_origem, onde a
--      equipa ja registava isto (93 'Porto', 23 'TCM'); quem ficar
--      sem valor aparece como "Sem classificar" no portal para o
--      Filomeno classificar a mao.
--
--   B) estagio_resultado - a decisao tomada no fim de um estagio:
--        null            = a decorrer (ou nao se aplica)
--        'promovido'     = passou a efetivo
--        'nao_permaneceu'= terminou e nao ficou
--
--   C) rh_colaborador_fotos - a foto de cada ficha, numa tabela a
--      parte com UMA linha por colaborador. Fora da tabela principal
--      de proposito: o hub le collaborators com select=* e a foto
--      (grande, em base64) nunca o ha-de atrasar. O portal le a foto
--      so na ficha aberta.
-- ================================================================

-- ================================================================
-- A) Empresa do colaborador (Porto / Danmo)
-- ================================================================
alter table public.collaborators
  add column if not exists empresa text;

-- Migra o que a equipa ja registava na empresa_origem
update public.collaborators
  set empresa = 'porto'
  where empresa is null
    and upper(btrim(coalesce(empresa_origem, ''))) = 'PORTO';

update public.collaborators
  set empresa = 'danmo'
  where empresa is null
    and upper(btrim(coalesce(empresa_origem, ''))) = 'TCM';

-- ================================================================
-- B) Resultado do estagio (a decisao do fim do periodo)
-- ================================================================
alter table public.collaborators
  add column if not exists estagio_resultado text;

-- ================================================================
-- C) Fotos das fichas (so o portal usa; uma linha por colaborador)
-- ================================================================
create table if not exists public.rh_colaborador_fotos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id bigint not null unique references public.collaborators(id) on delete cascade,
  foto text not null, -- data URL (base64) da imagem ja comprimida
  actualizado_em timestamptz not null default now()
);

create index if not exists idx_rh_fotos_colaborador
  on public.rh_colaborador_fotos (colaborador_id);
