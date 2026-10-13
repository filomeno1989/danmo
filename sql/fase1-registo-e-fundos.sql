-- ================================================================
-- PORTAL DANMO (nova geracao) - Fase 1: Auto-registo + Fundos do login
-- ----------------------------------------------------------------
-- COMO CORRER (uma unica vez, ~1 minuto):
--   1. Abre o Supabase (supabase.com/dashboard) > o teu projeto
--   2. Menu lateral: SQL Editor > New query
--   3. Cola TODO este ficheiro e clica em RUN
--   4. Espera a mensagem verde de sucesso
--
-- SEGURANCA: pode correr-se mais do que uma vez sem partir nada
-- (tudo usa "create or replace" e "on conflict do nothing").
--
-- O QUE ISTO ACTIVA:
--   A) Auto-registo: o colega escreve o codigo (ex.: DM0069), o sistema
--      busca nome/area/contacto da tabela collaborators e ele so define
--      a senha. A conta nasce no nivel "pendente": ve SO o Painel
--      Principal ate a administracao lhe dar os restantes acessos
--      (pelo painel Permissoes do hub, como sempre).
--   B) Fundos do login: ate 4 fotos da empresa em slideshow discreto,
--      carregadas pelo admin no portal (Personalizar portal).
-- ================================================================

-- ================================================================
-- A) AUTO-REGISTO
-- ================================================================

-- A.1) Permissoes do nivel "pendente": so o Painel Principal
insert into public.permissoes (nivel, modulo, acao, permitido)
values ('pendente', 'inicio', 'ver', true)
on conflict (nivel, modulo, acao) do nothing;

-- A.2) Dados do colaborador para pre-preencher o registo
--      (nome, area, funcao e contacto vem da tabela collaborators)
create or replace function public.dados_para_registo(p_codigo text)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  c record;
  v_registado boolean;
begin
  if p_codigo is null or length(trim(p_codigo)) = 0 then
    raise exception 'Escreve o teu codigo de colaborador.';
  end if;

  select * into c
    from public.collaborators
   where upper(trim(code)) = upper(trim(p_codigo))
   limit 1;

  if c.id is null then
    raise exception 'Codigo nao encontrado na base de colaboradores. Confere com a administracao.';
  end if;

  if c.active is not true then
    raise exception 'Este colaborador esta inactivo na base. Fala com a administracao.';
  end if;

  select exists (
    select 1 from public.utilizadores
     where usuario = upper(trim(p_codigo))
  ) into v_registado;

  return json_build_object(
    'nome', c.name,
    'departamento', coalesce(c.department, ''),
    'categoria', coalesce(c.categoria, ''),
    'contacto', coalesce(c.contacto, ''),
    'ja_registado', coalesce(v_registado, false)
  );
end;
$$;

-- A.3) Criar a conta do colaborador (nivel pendente, so o Painel)
create or replace function public.registrar_utilizador(p_codigo text, p_senha text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  c record;
  v_usuario text;
  v_id uuid;
begin
  if p_codigo is null or length(trim(p_codigo)) = 0 then
    raise exception 'Escreve o teu codigo de colaborador.';
  end if;
  if p_senha is null or length(p_senha) < 6 then
    raise exception 'A senha precisa de ter pelo menos 6 caracteres.';
  end if;

  v_usuario := upper(trim(p_codigo));

  select * into c
    from public.collaborators
   where upper(trim(code)) = v_usuario
   limit 1;

  if c.id is null then
    raise exception 'Codigo nao encontrado na base de colaboradores. Confere com a administracao.';
  end if;

  if c.active is not true then
    raise exception 'Este colaborador esta inactivo na base. Fala com a administracao.';
  end if;

  if exists (select 1 from public.utilizadores where usuario = v_usuario) then
    raise exception 'Este codigo ja tem acesso criado. Entra normalmente com a tua senha.';
  end if;

  insert into public.utilizadores
    (nome, cargo, usuario, senha_hash, nivel, ativo, precisa_trocar)
  values
    (trim(c.name),
     coalesce(nullif(trim(c.categoria), ''), trim(c.department), ''),
     v_usuario,
     crypt(p_senha, gen_salt('bf', 10)),
     'pendente',
     true,
     false)
  returning id into v_id;

  perform public.registar_acesso(v_id, v_usuario, 'auto_registo', true, 'Conta criada pelo proprio colaborador');

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- ================================================================
-- B) FUNDOS DO LOGIN (slideshow de fotos da empresa)
-- ================================================================

-- B.1) Lista publica das fotos (o ecra de login e aberto; so devolve
--      imagens, nunca dados de utilizadores)
create or replace function public.fundos_login()
returns json
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(
    json_agg(
      json_build_object(
        'posicao', right(cs.chave, 1)::int,
        'nome', cs.valor::json->>'nome',
        'foto', cs.valor::json->>'foto'
      ) order by right(cs.chave, 1)::int
    ),
    '[]'::json
  )
    from public.config_sistema cs
   where cs.chave like 'login_fundo\_%' escape '\'
     and cs.valor like 'data:image/%';
$$;

-- B.2) Guarda uma foto (posicao 1 a 4) - so administracao
create or replace function public.guardar_fundo_login(
  p_token text, p_chave text, p_posicao int, p_foto text, p_nome text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  v_chave text;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode fazer isto.';
  end if;
  if not public.chave_admin_ok(p_chave) then
    perform public.registar_acesso(s.id, s.usuario, 'chave_admin_errada', false, 'guardar_fundo_login');
    raise exception 'Chave de administracao errada.';
  end if;

  if p_posicao is null or p_posicao < 1 or p_posicao > 4 then
    raise exception 'Posicao invalida (usa 1 a 4).';
  end if;
  if p_foto is null or left(p_foto, 11) <> 'data:image/' then
    raise exception 'Ficheiro de imagem invalido.';
  end if;
  if length(p_foto) > 1000000 then
    raise exception 'A foto ficou grande demais. Tenta outra mais simples.';
  end if;

  v_chave := 'login_fundo_' || p_posicao::text;

  insert into public.config_sistema (chave, valor)
  values (
    v_chave,
    json_build_object('nome', coalesce(left(p_nome, 80), ''), 'foto', p_foto)::text
  )
  on conflict (chave) do update
    set valor = excluded.valor;

  perform public.registar_acesso(s.id, s.usuario, 'guardar_fundo', true, v_chave);
  return json_build_object('ok', true);
end;
$$;

-- B.3) Apaga uma foto (posicao 1 a 4) - so administracao
create or replace function public.apagar_fundo_login(
  p_token text, p_chave text, p_posicao int)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  v_chave text;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode fazer isto.';
  end if;
  if not public.chave_admin_ok(p_chave) then
    perform public.registar_acesso(s.id, s.usuario, 'chave_admin_errada', false, 'apagar_fundo_login');
    raise exception 'Chave de administracao errada.';
  end if;

  if p_posicao is null or p_posicao < 1 or p_posicao > 4 then
    raise exception 'Posicao invalida (usa 1 a 4).';
  end if;

  v_chave := 'login_fundo_' || p_posicao::text;
  delete from public.config_sistema where chave = v_chave;

  perform public.registar_acesso(s.id, s.usuario, 'apagar_fundo', true, v_chave);
  return json_build_object('ok', true);
end;
$$;

-- ================================================================
-- FIM. Depois de correr:
--   - Os colegas podem criar o proprio acesso no login
--     ("E a primeira vez? Criar o meu acesso")
--   - Tu (admin) podes carregar as fotos em: menu do utilizador >
--     Personalizar portal
-- ================================================================
