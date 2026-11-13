-- ============================================================================
-- Fase 8 - Recuperacao de senha SEM email
-- ============================================================================
-- Problema: o login entra com codigo (DMxxxx) + senha, nao existe email na
-- conta (contacto dos colaboradores e telefone), logo a recuperacao por
-- email e impossivel. O colega que esquece a senha depende da administracao.
--
-- Solucao: codigo de recuperacao de UTILIZACAO UNICA, mediado pela
-- administracao (que e o intermediario de confianca da empresa):
--   1. O colega clica "Esqueci a minha senha" no login e escreve o codigo
--      dele: nasce um pedido na aba Recuperacoes da pagina Permissoes.
--   2. A administracao ve o pedido e gera um CODIGO de 8 caracteres
--      (valido 30 minutos, uma unica utilizacao). O codigo so aparece uma
--      vez, para a administracao, que passa-o ao colega em pessoa / WhatsApp.
--   3. O colega escreve codigo + codigo de recuperacao + nova senha no
--      proprio login. A nova senha nunca passa pelas maos da administracao.
--   4. Ao aplicar: o hash troca, precisa_trocar fica false, TODAS as sessoes
--      activas dessa conta sao terminadas e tudo fica no registo de acessos.
--
-- Nada de email, nada de SMS pago, nada de Supabase Auth: e a mesma
-- arquitectura RPC + bcrypt que o sistema inteiro ja usa. Quem tem a chave
-- de administracao pode tambem continuar a usar o "Redefinir senha" direto,
-- que ja existia (Fase 7 R1).
--
-- Colar este ficheiro no SQL Editor do Supabase (una execucao).
-- ============================================================================

-- 1) Pedidos de recuperacao (uma linha por utilizador: o pedido novo
--    substitui o anterior, sempre. Histórico fino fica no registos_acesso).
create table if not exists public.recuperacoes_senha (
  utilizador_id    uuid primary key references public.utilizadores(id) on delete cascade,
  usuario          text not null,
  nome             text,
  pedido_em        timestamptz not null default now(),
  codigo_hash      text,
  codigo_gerado_em timestamptz,
  expira_em        timestamptz,
  usado_em         timestamptz
);

-- Ninguem le a tabela por PostgREST: so atraves das funcoes security definer.
alter table public.recuperacoes_senha enable row level security;

-- 2) Pedido feito pelo colega no login (chamada anonima, sem sessao).
create or replace function public.recuperacao_pedir(p_usuario text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  u record;
  r record;
  v_usuario text;
begin
  v_usuario := upper(trim(coalesce(p_usuario, '')));
  if length(v_usuario) = 0 then
    raise exception 'Escreve o teu codigo de colaborador.';
  end if;

  select * into u from public.utilizadores
   where upper(trim(usuario)) = v_usuario limit 1;
  if u.id is null then
    raise exception 'Codigo nao encontrado. Confere com a administracao.';
  end if;
  if u.ativo is not true then
    raise exception 'Esta conta esta desactivada. Fala com a administracao.';
  end if;

  -- Anti-lixo: dentro de 60 segundos nao reabre nem mexe (evita estragar um
  -- codigo acabado de gerar e nao enche o registo de acessos com spam).
  select * into r from public.recuperacoes_senha where utilizador_id = u.id;
  if r.utilizador_id is not null
     and r.usado_em is null
     and now() - r.pedido_em < interval '60 seconds' then
    return json_build_object('ok', true);
  end if;

  insert into public.recuperacoes_senha
    (utilizador_id, usuario, nome, pedido_em, codigo_hash, codigo_gerado_em, expira_em, usado_em)
  values
    (u.id, u.usuario, u.nome, now(), null, null, null, null)
  on conflict (utilizador_id) do update
    set pedido_em        = now(),
        usuario          = excluded.usuario,
        nome             = excluded.nome,
        codigo_hash      = null,
        codigo_gerado_em = null,
        expira_em        = null,
        usado_em         = null;

  perform public.registar_acesso(u.id, u.usuario, 'recuperacao_pedida', true, u.usuario);
  return json_build_object('ok', true);
end;
$$;

-- 3) A administracao ve a lista de pedidos abertos (ultimos 7 dias).
create or replace function public.recuperacoes_lista(p_token text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao ve as recuperacoes.';
  end if;
  return coalesce((
    select json_agg(t order by t.pedido_em desc)
    from (
      select r.utilizador_id, r.usuario, r.nome, r.pedido_em,
             r.codigo_gerado_em, r.expira_em, r.usado_em
      from public.recuperacoes_senha r
      where r.usado_em is null
        and r.pedido_em > now() - interval '7 days'
    ) t
  ), '[]'::json);
end;
$$;

-- 4) A administracao gera o codigo (mostrado UMA vez; na base so fica o hash).
--    Alfabeto sem caracteres ambiguos (sem 0/O/1/I), 8 caracteres.
create or replace function public.recuperacao_gerar_codigo(
  p_token text, p_chave_admin text, p_utilizador_id uuid)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  u record;
  r record;
  v_codigo text;
  i int;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode gerar codigos de recuperacao.';
  end if;
  if not public.chave_admin_ok(p_chave_admin) then
    perform public.registar_acesso(s.id, s.usuario, 'chave_admin_errada', false, 'recuperacao_gerar_codigo');
    raise exception 'Chave de administracao errada.';
  end if;

  select * into u from public.utilizadores where id = p_utilizador_id;
  if u.id is null then
    raise exception 'Conta nao encontrada.';
  end if;
  if u.ativo is not true then
    raise exception 'Esta conta esta desactivada. Activa-a primeiro.';
  end if;

  select * into r from public.recuperacoes_senha where utilizador_id = u.id;
  if r.utilizador_id is null then
    raise exception 'A pessoa ainda nao pediu a recuperacao no login.';
  end if;
  if r.usado_em is not null then
    raise exception 'Este pedido ja foi usado. A pessoa pede de novo no login.';
  end if;

  v_codigo := '';
  for i in 1..8 loop
    v_codigo := v_codigo || substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
                                   floor(random() * 34)::int + 1, 1);
  end loop;

  update public.recuperacoes_senha
     set codigo_hash      = crypt(v_codigo, gen_salt('bf', 10)),
         codigo_gerado_em = now(),
         expira_em        = now() + interval '30 minutes',
         usado_em         = null
   where utilizador_id = u.id;

  perform public.registar_acesso(s.id, s.usuario, 'recuperacao_codigo_gerado', true, u.usuario);
  return json_build_object('ok', true, 'codigo', v_codigo);
end;
$$;

-- 5) O colega aplica o codigo e define a nova senha (chamada anonima).
--    Uma unica utilizacao, expira em 30 minutos, mata todas as sessoes
--    activas da conta e grava no registo de acessos.
create or replace function public.recuperacao_aplicar(
  p_usuario text, p_codigo text, p_senha_nova text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  u record;
  r record;
  v_usuario text;
  v_codigo text;
begin
  v_usuario := upper(trim(coalesce(p_usuario, '')));
  v_codigo  := trim(coalesce(p_codigo, ''));

  if length(v_usuario) = 0 then
    raise exception 'Escreve o teu codigo de colaborador.';
  end if;
  if length(v_codigo) = 0 then
    raise exception 'Escreve o codigo de recuperacao que recebeste.';
  end if;
  if p_senha_nova is null or length(p_senha_nova) < 6 then
    raise exception 'A nova senha precisa de ter pelo menos 6 caracteres.';
  end if;

  select * into u from public.utilizadores
   where upper(trim(usuario)) = v_usuario limit 1;
  if u.id is null then
    raise exception 'Codigo nao encontrado. Confere com a administracao.';
  end if;
  if u.ativo is not true then
    raise exception 'Esta conta esta desactivada. Fala com a administracao.';
  end if;

  select * into r from public.recuperacoes_senha where utilizador_id = u.id;
  if r.utilizador_id is null
     or r.codigo_hash is null
     or r.usado_em is not null
     or r.expira_em is null
     or r.expira_em < now() then
    raise exception 'Codigo invalido ou expirado. Pede um novo codigo a administracao.';
  end if;

  if crypt(v_codigo, r.codigo_hash) <> r.codigo_hash then
    perform public.registar_acesso(u.id, u.usuario, 'recuperacao_codigo_errado', false, u.usuario);
    raise exception 'Codigo invalido ou expirado. Pede um novo codigo a administracao.';
  end if;

  update public.utilizadores
     set senha_hash = crypt(p_senha_nova, gen_salt('bf', 10)),
         precisa_trocar = false
   where id = u.id;

  update public.recuperacoes_senha set usado_em = now() where utilizador_id = u.id;
  delete from public.sessoes where utilizador_id = u.id;

  perform public.registar_acesso(u.id, u.usuario, 'recuperacao_aplicada', true, u.usuario);
  return json_build_object('ok', true);
end;
$$;
