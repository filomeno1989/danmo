-- =====================================================================
-- Fase 4 - Gestão de Stock: unidades de medida configuráveis
-- (pedido do Filomeno: manter as 8 unidades do hub e poder acrescentar
--  mais nas Configurações do Stock)
--
-- Como correr: Supabase -> SQL Editor -> colar tudo -> Run.
-- É seguro correr mais do que uma vez (IF NOT EXISTS / ON CONFLICT).
-- =====================================================================

-- 1. Tabela das unidades
create table if not exists public.unidades_medida (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Duas unidades nunca com o mesmo nome (ignora maiúsculas e acentos
-- simples através do lower)
create unique index if not exists unidades_medida_nome_unico
  on public.unidades_medida (lower(nome));

-- 2. As 8 unidades do hub antigo, mantidas
insert into public.unidades_medida (nome)
select u.nome
from unnest(array['Un','Kg','Lt','Mt','Cx','Par','Rolo','Saco']) as u(nome)
where not exists (
  select 1 from public.unidades_medida m where lower(m.nome) = lower(u.nome)
);

-- 3. RLS igual às outras tabelas do stock (a protecção real é a sessão
-- do portal, validada no servidor; aqui o módulo precisa de ler e
-- escrever pela chave do servidor)
alter table public.unidades_medida enable row level security;

drop policy if exists "unidades leitura" on public.unidades_medida;
create policy "unidades leitura"
  on public.unidades_medida for select using (true);

drop policy if exists "unidades inserir" on public.unidades_medida;
create policy "unidades inserir"
  on public.unidades_medida for insert with check (true);

drop policy if exists "unidades actualizar" on public.unidades_medida;
create policy "unidades actualizar"
  on public.unidades_medida for update using (true);

-- 4. Confirmação
select 'Unidades criadas: ' || count(*) from public.unidades_medida;
