-- ================================================================
-- PORTAL DANMO (nova geracao) - Fase 7 R1: PERMISSOES POR UTILIZADOR
-- ----------------------------------------------------------------
-- COMO CORRER (uma unica vez, ~1 minuto):
--   1. Abre o Supabase (supabase.com/dashboard) > o teu projecto
--   2. Menu lateral: SQL Editor > New query
--   3. Cola TODO este ficheiro e clica em RUN
--   4. Espera a mensagem verde de sucesso
--
-- SEGURANCA: pode correr-se mais do que uma vez sem partir nada
-- (tudo usa "create or replace" e "on conflict do nothing").
--
-- NAO TOCA em nada do que ja existe: a sessao continua a validar pela
-- funcao "validar_sessao" de sempre ate o portal novo comecar a usar a
-- "validar_sessao_v2"; as tabelas antigas (permissoes por nivel,
-- utilizadores) ficam exactamente como estao.
--
-- O QUE ISTO ACTIVA (decisoes do Filomeno de 21/10):
--   A) Matriz de permissoes POR UTILIZADOR (nada de modelos por cargo):
--      cada pessoa tem, POR PAGINA, tres marcas: Ver / Mexer / Apagar.
--      "Mexer" cobre criar, editar e (quando existir) arquivar. Atribuicao
--      100% a mao pelo Filomeno, um a um.
--      Paginas atribuiveis (18, cada uma com o seu id no portal):
--        oficina, oficina.ordens, oficina.checklist, oficina.equipamentos,
--        oficina.faturacao, oficina.relatorios, oficina.config,
--        disponibilidade, disponibilidade.grelha, disponibilidade.horometro,
--        disponibilidade.semana, disponibilidade.config,
--        stock, stock.entradas, stock.saidas, stock.materiais,
--        stock.relatorios, stock.config
--      Garantidos a todos sem matriz: Inicio e o perfil proprio.
--      Fora da matriz e admin-only por nivel: a propria pagina Permissoes.
--   B) GESTAO DE CONTAS pela pagina Permissoes (so admin, com chave de
--      administracao nas accoes destrutivas, como no hub): aprovar
--      registos pendentes (escolhendo o rotulo), rejeitar (apaga a conta
--      pendente nunca usada), criar conta, desactivar/activar, reset de
--      senha (a pessoa troca no proximo login) e mudar o rotulo.
--      Nao existe "apagar conta": desactivar cobre e o historico fica.
--   C) PERFIL PROPRIO de cada utilizador: ver os dados do cadastro de
--      colaboradores (leitura) e PEDIR alteracao (campo, valor pretendido
--      e motivo). O proprio NUNCA edita: o admin resolve a solicitacao
--      (aplica ou ignora). Campos aceites nesta ronda (lista ajustavel):
--        contacto, contacto_1, contacto_2, email, endereco, naturalidade,
--        estado_civil
--   D) Quem pode APROVAR/REJEITAR registos: quem o Filomeno escolher
--      (por enquanto so admin; passa a ser configuravel na Ronda 2 com a
--      accao propria na matriz).
-- ================================================================

-- ================================================================
-- TABELAS NOVAS
-- ================================================================

-- A) A matriz: uma linha por utilizador x pagina (so entra quem o
--    Filomeno deixar; pagina sem linha = bloqueada)
create table if not exists public.permissoes_usuario (
  id uuid primary key default gen_random_uuid(),
  utilizador_id uuid not null references public.utilizadores(id) on delete cascade,
  pagina text not null,
  ver boolean not null default false,
  mexer boolean not null default false,
  apagar boolean not null default false,
  actualizado_em timestamptz not null default now(),
  unique (utilizador_id, pagina)
);

-- B) Solicitacoes de alteracao de dados proprios
create table if not exists public.solicitacoes_dados (
  id uuid primary key default gen_random_uuid(),
  utilizador_id uuid not null references public.utilizadores(id) on delete cascade,
  campo text not null,
  valor_pretendido text not null,
  motivo text not null default '',
  estado text not null default 'pendente', -- pendente | aplicada | ignorada
  criado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resposta text default ''
);

create index if not exists idx_permissoes_usuario_util
  on public.permissoes_usuario (utilizador_id);
create index if not exists idx_solicitacoes_pendentes
  on public.solicitacoes_dados (estado, criado_em);

-- RLS: o navegador nunca le estas tabelas directamente; as funcoes
-- security definer abaixo sao a unica porta (igual ao resto do portal).
alter table public.permissoes_usuario enable row level security;
alter table public.solicitacoes_dados enable row level security;

-- ================================================================
-- SESSAO v2: valida o token de sempre e devolve a matriz POR UTILIZADOR
-- ================================================================
create or replace function public.validar_sessao_v2(p_token text)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  s record;
  u record;
  m json;
begin
  if p_token is null or length(trim(p_token)) = 0 then
    return json_build_object('valido', false, 'motivo', 'Sessao inexistente.');
  end if;

  select * into s from public.sessao_utilizador(p_token);
  if s.id is null then
    return json_build_object('valido', false, 'motivo', 'Sessao expirada. Entra de novo.');
  end if;

  select * into u from public.utilizadores where id = s.id;
  if u.id is null then
    return json_build_object('valido', false, 'motivo', 'Conta nao encontrada.');
  end if;
  if coalesce(u.ativo, true) is not true then
    return json_build_object('valido', false, 'motivo', 'Esta conta esta desactivada. Fala com a administracao.');
  end if;

  select coalesce(
           json_agg(
             json_build_object('pagina', x.pagina, 'ver', x.ver,
                               'mexer', x.mexer, 'apagar', x.apagar)
             order by x.pagina
           ),
           '[]'::json
         )
    into m
    from public.permissoes_usuario x
   where x.utilizador_id = u.id;

  return json_build_object(
    'valido', true,
    'utilizador', json_build_object(
      'id', u.id,
      'usuario', u.usuario,
      'nome', u.nome,
      'cargo', u.cargo,
      'nivel', u.nivel,
      'precisa_trocar', coalesce(u.precisa_trocar, false)
    ),
    'matriz', m
  );
end;
$$;

-- ================================================================
-- GESTAO DE CONTAS E MATRIZ (pagina Permissoes, so admin)
-- ================================================================

-- Lista de contas para a pagina Permissoes (pendentes primeiro)
create or replace function public.permissoes_usuarios_lista(p_token text)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  s record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode ver a lista de contas.';
  end if;

  return coalesce((
    select json_agg(
             json_build_object(
               'id', x.id,
               'usuario', x.usuario,
               'nome', x.nome,
               'cargo', x.cargo,
               'nivel', x.nivel,
               'ativo', coalesce(x.ativo, true),
               'precisa_trocar', coalesce(x.precisa_trocar, false),
               'tem_permissoes', exists (
                 select 1 from public.permissoes_usuario p
                  where p.utilizador_id = x.id
               )
             )
             order by (x.nivel = 'pendente') desc, (coalesce(x.ativo, true)) desc, x.nome
           )
    from public.utilizadores x
  ), '[]'::json);
end;
$$;

-- Matriz de uma pessoa (as linhas que ela ja tem, por pagina)
create or replace function public.permissoes_matriz(p_token text, p_utilizador_id uuid)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  s record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode ver as permissoes.';
  end if;
  if p_utilizador_id is null then
    raise exception 'Escolhe a pessoa.';
  end if;

  return coalesce((
    select json_agg(
             json_build_object('pagina', p.pagina, 'ver', p.ver,
                               'mexer', p.mexer, 'apagar', p.apagar)
             order by p.pagina
           )
    from public.permissoes_usuario p
   where p.utilizador_id = p_utilizador_id
  ), '[]'::json);
end;
$$;

-- Grava as 3 marcas (Ver/Mexer/Apagar) de UMA pagina de UMA pessoa.
-- O admin pode tudo por nivel; as linhas so servem para os outros.
create or replace function public.permissoes_gravar(
  p_token text, p_utilizador_id uuid,
  p_pagina text, p_ver boolean, p_mexer boolean, p_apagar boolean)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  u record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode gravar permissoes.';
  end if;
  if p_utilizador_id is null or p_pagina is null or length(trim(p_pagina)) = 0 then
    raise exception 'Escolhe a pessoa e a pagina.';
  end if;

  select * into u from public.utilizadores where id = p_utilizador_id;
  if u.id is null then
    raise exception 'Pessoa nao encontrada.';
  end if;
  if u.nivel = 'admin' then
    raise exception 'A administracao tem sempre acesso total; nao se limita uma conta admin.';
  end if;

  -- mexer sem ver nao faz sentido (e apagar sem mexer tambem nao)
  if not coalesce(p_ver, false) then
    p_mexer := false;
    p_apagar := false;
  elsif not coalesce(p_mexer, false) then
    p_apagar := false;
  end if;

  insert into public.permissoes_usuario
    (utilizador_id, pagina, ver, mexer, apagar)
  values
    (p_utilizador_id, trim(p_pagina), coalesce(p_ver, false), coalesce(p_mexer, false), coalesce(p_apagar, false))
  on conflict (utilizador_id, pagina) do update
    set ver = excluded.ver,
        mexer = excluded.mexer,
        apagar = excluded.apagar,
        actualizado_em = now();

  perform public.registar_acesso(s.id, s.usuario, 'permissao_gravada', true,
    u.usuario || ' :: ' || trim(p_pagina));
  return json_build_object('ok', true);
end;
$$;

-- Criar conta a mao (codigo tem de existir e estar activo em
-- collaborators, igual ao auto-registo; a pessoa troca a senha ao entrar)
create or replace function public.permissoes_criar_conta(
  p_token text, p_chave_admin text,
  p_codigo text, p_senha text, p_nivel text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  c record;
  v_usuario text;
  v_id uuid;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode criar contas.';
  end if;
  if not public.chave_admin_ok(p_chave_admin) then
    perform public.registar_acesso(s.id, s.usuario, 'chave_admin_errada', false, 'permissoes_criar_conta');
    raise exception 'Chave de administracao errada.';
  end if;
  if p_nivel not in ('gestor', 'operador', 'consulta', 'pendente') then
    raise exception 'Rotulo invalido (usa gestor, operador, consulta ou pendente).';
  end if;

  v_usuario := upper(trim(coalesce(p_codigo, '')));
  if length(v_usuario) = 0 then
    raise exception 'Escreve o codigo do colaborador.';
  end if;
  if p_senha is null or length(p_senha) < 6 then
    raise exception 'A senha precisa de ter pelo menos 6 caracteres.';
  end if;

  select * into c from public.collaborators
   where upper(trim(code)) = v_usuario limit 1;
  if c.id is null then
    raise exception 'Codigo nao encontrado na base de colaboradores.';
  end if;
  if c.active is not true then
    raise exception 'Este colaborador esta inactivo na base.';
  end if;
  if exists (select 1 from public.utilizadores where usuario = v_usuario) then
    raise exception 'Este codigo ja tem acesso criado.';
  end if;

  insert into public.utilizadores
    (nome, cargo, usuario, senha_hash, nivel, ativo, precisa_trocar)
  values
    (trim(c.name),
     coalesce(nullif(trim(c.categoria), ''), trim(c.department), ''),
     v_usuario,
     crypt(p_senha, gen_salt('bf', 10)),
     p_nivel,
     true,
     true)
  returning id into v_id;

  perform public.registar_acesso(s.id, s.usuario, 'conta_criada', true, v_usuario || ' (' || p_nivel || ')');
  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- Aprovar registo pendente (escolhe o rotulo; as permissoes ficam a
-- seguir, pagina a pagina, no Filomeno)
create or replace function public.permissoes_aprovar(p_token text, p_utilizador_id uuid, p_nivel text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  u record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode aprovar registos.';
  end if;
  if p_nivel not in ('gestor', 'operador', 'consulta') then
    raise exception 'Escolhe o rotulo: gestor, operador ou consulta.';
  end if;

  select * into u from public.utilizadores where id = p_utilizador_id;
  if u.id is null then
    raise exception 'Conta nao encontrada.';
  end if;
  if u.nivel <> 'pendente' then
    raise exception 'Esta conta ja nao esta por aprovar.';
  end if;

  update public.utilizadores
     set nivel = p_nivel, ativo = true
   where id = p_utilizador_id;

  perform public.registar_acesso(s.id, s.usuario, 'registo_aprovado', true, u.usuario || ' -> ' || p_nivel);
  return json_build_object('ok', true);
end;
$$;

-- Rejeitar registo pendente (APAGA a conta pendente nunca usada; accao
-- destrutiva, pede chave de administracao)
create or replace function public.permissoes_rejeitar(p_token text, p_utilizador_id uuid, p_chave_admin text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  u record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode rejeitar registos.';
  end if;
  if not public.chave_admin_ok(p_chave_admin) then
    perform public.registar_acesso(s.id, s.usuario, 'chave_admin_errada', false, 'permissoes_rejeitar');
    raise exception 'Chave de administracao errada.';
  end if;

  select * into u from public.utilizadores where id = p_utilizador_id;
  if u.id is null then
    raise exception 'Conta nao encontrada.';
  end if;
  if u.nivel <> 'pendente' then
    raise exception 'So um registo pendente pode ser rejeitado. Para contas activas usa Desactivar.';
  end if;

  delete from public.utilizadores where id = p_utilizador_id;

  perform public.registar_acesso(s.id, s.usuario, 'registo_rejeitado', true, u.usuario);
  return json_build_object('ok', true);
end;
$$;

-- Desactivar / reactivar conta (ninguem se desactiva a si proprio)
create or replace function public.permissoes_activar(p_token text, p_utilizador_id uuid, p_activo boolean)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  u record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode desactivar contas.';
  end if;
  if p_utilizador_id is null then
    raise exception 'Escolhe a conta.';
  end if;
  if p_utilizador_id = s.id and coalesce(p_activo, true) = false then
    raise exception 'Nao podes desactivar a tua propria conta.';
  end if;

  select * into u from public.utilizadores where id = p_utilizador_id;
  if u.id is null then
    raise exception 'Conta nao encontrada.';
  end if;
  if u.nivel = 'pendente' then
    raise exception 'Esta conta ainda esta por aprovar: aprova ou rejeita.';
  end if;

  update public.utilizadores set ativo = coalesce(p_activo, true) where id = p_utilizador_id;

  perform public.registar_acesso(s.id, s.usuario, 'conta_estado', true,
    u.usuario || ' -> ' || case when coalesce(p_activo, true) then 'activa' else 'desactivada' end);
  return json_build_object('ok', true);
end;
$$;

-- Reset de senha: a pessoa troca no proximo login (accao destrutiva,
-- pede chave de administracao)
create or replace function public.permissoes_reset_senha(
  p_token text, p_chave_admin text, p_utilizador_id uuid, p_senha_nova text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  u record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode fazer reset de senha.';
  end if;
  if not public.chave_admin_ok(p_chave_admin) then
    perform public.registar_acesso(s.id, s.usuario, 'chave_admin_errada', false, 'permissoes_reset_senha');
    raise exception 'Chave de administracao errada.';
  end if;
  if p_senha_nova is null or length(p_senha_nova) < 6 then
    raise exception 'A senha nova precisa de ter pelo menos 6 caracteres.';
  end if;

  select * into u from public.utilizadores where id = p_utilizador_id;
  if u.id is null then
    raise exception 'Conta nao encontrada.';
  end if;

  update public.utilizadores
     set senha_hash = crypt(p_senha_nova, gen_salt('bf', 10)),
         precisa_trocar = true
   where id = p_utilizador_id;

  perform public.registar_acesso(s.id, s.usuario, 'senha_reset', true, u.usuario);
  return json_build_object('ok', true);
end;
$$;

-- Mudar o rotulo (Gestor / Operador / Consulta) - nao muda permissoes,
-- muda so o rotulo visivel
create or replace function public.permissoes_nivel(p_token text, p_utilizador_id uuid, p_nivel text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  u record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode mudar o rotulo.';
  end if;
  if p_nivel not in ('gestor', 'operador', 'consulta') then
    raise exception 'Rotulo invalido (usa gestor, operador ou consulta).';
  end if;

  select * into u from public.utilizadores where id = p_utilizador_id;
  if u.id is null then
    raise exception 'Conta nao encontrada.';
  end if;
  if u.nivel in ('pendente', 'admin') then
    raise exception 'Esta conta nao tem rotulo mudavel.';
  end if;

  update public.utilizadores set nivel = p_nivel where id = p_utilizador_id;

  perform public.registar_acesso(s.id, s.usuario, 'rotulo_mudado', true, u.usuario || ' -> ' || p_nivel);
  return json_build_object('ok', true);
end;
$$;

-- ================================================================
-- PERFIL PROPRIO: ver os dados do cadastro e PEDIR alteracao
-- ================================================================

-- Os meus dados (leitura; nada disto e editavel pelo proprio)
create or replace function public.meus_dados(p_token text)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  s record;
  u record;
  c record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null then
    raise exception 'Sessao expirada. Entra de novo.';
  end if;

  select * into u from public.utilizadores where id = s.id;
  if u.id is null then
    raise exception 'Conta nao encontrada.';
  end if;

  select id, code, name, department, categoria, contacto, contacto_1, contacto_2,
         email, endereco, naturalidade, estado_civil, setor, funcao_grupo,
         data_admissao
    into c
    from public.collaborators
   where upper(trim(code)) = u.usuario
   limit 1;

  return json_build_object(
    'conta', json_build_object(
      'usuario', u.usuario,
      'nome', u.nome,
      'cargo', u.cargo,
      'nivel', u.nivel
    ),
    'cadastro', case
      when c.id is null then null
      else json_build_object(
        'encontrado', true,
        'code', c.code,
        'name', c.name,
        'department', coalesce(c.department, ''),
        'categoria', coalesce(c.categoria, ''),
        'setor', coalesce(c.setor, ''),
        'funcao_grupo', coalesce(c.funcao_grupo, ''),
        'contacto', coalesce(c.contacto, ''),
        'contacto_1', coalesce(c.contacto_1, ''),
        'contacto_2', coalesce(c.contacto_2, ''),
        'email', coalesce(c.email, ''),
        'endereco', coalesce(c.endereco, ''),
        'naturalidade', coalesce(c.naturalidade, ''),
        'estado_civil', coalesce(c.estado_civil, ''),
        'data_admissao', c.data_admissao
      )
    end
  );
end;
$$;

-- Campos que aceitam solicitacao nesta ronda (lista ajustavel no futuro)
create or replace function public.campos_solicitaveis()
returns json
language sql stable security definer set search_path = public, extensions as $$
  select '["contacto","contacto_1","contacto_2","email","endereco","naturalidade","estado_civil"]'::json;
$$;

-- O utilizador pede a alteracao de um dado proprio (o admin resolve)
create or replace function public.meus_dados_pedir(
  p_token text, p_campo text, p_valor_pretendido text, p_motivo text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  u record;
  v_campo text;
  v_valor text;
  v_abertas int;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null then
    raise exception 'Sessao expirada. Entra de novo.';
  end if;

  v_campo := lower(trim(coalesce(p_campo, '')));
  v_valor := trim(coalesce(p_valor_pretendido, ''));
  if not (v_campo = any (array['contacto','contacto_1','contacto_2','email','endereco','naturalidade','estado_civil'])) then
    raise exception 'Este campo nao aceita alteracao por solicitacao.';
  end if;
  if length(v_valor) = 0 then
    raise exception 'Escreve o valor pretendido.';
  end if;
  if length(v_valor) > 300 then
    raise exception 'Valor demasiado longo (maximo 300 caracteres).';
  end if;

  select count(*) into v_abertas
    from public.solicitacoes_dados
   where utilizador_id = s.id and estado = 'pendente' and campo = v_campo;
  if v_abertas >= 1 then
    raise exception 'Ja tens uma solicitacao pendente para este campo. Espera a resposta da administracao.';
  end if;

  insert into public.solicitacoes_dados
    (utilizador_id, campo, valor_pretendido, motivo)
  values
    (s.id, v_campo, v_valor, left(trim(coalesce(p_motivo, '')), 500));

  perform public.registar_acesso(s.id, s.usuario, 'solicitacao_dados', true, v_campo);
  return json_build_object('ok', true);
end;
$$;

-- Lista das solicitacoes (admin): pendentes primeiro, depois as resolvidas
create or replace function public.meus_dados_solicitacoes(p_token text)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  s record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao pode ver as solicitacoes.';
  end if;

  return coalesce((
    select json_agg(
             json_build_object(
               'id', x.id,
               'utilizador', y.usuario,
               'nome', y.nome,
               'campo', x.campo,
               'valor_pretendido', x.valor_pretendido,
               'motivo', x.motivo,
               'estado', x.estado,
               'criado_em', x.criado_em,
               'resolvido_em', x.resolvido_em,
               'resposta', coalesce(x.resposta, '')
             )
             order by (x.estado = 'pendente') desc, x.criado_em desc
           )
    from public.solicitacoes_dados x
    join public.utilizadores y on y.id = x.utilizador_id
  ), '[]'::json);
end;
$$;

-- As MINHAS solicitacoes (o proprio acompanha o estado dos pedidos)
create or replace function public.meus_dados_minhas(p_token text)
returns json
language plpgsql stable security definer set search_path = public, extensions as $$
declare
  s record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null then
    raise exception 'Sessao expirada. Entra de novo.';
  end if;

  return coalesce((
    select json_agg(
             json_build_object(
               'id', x.id,
               'campo', x.campo,
               'valor_pretendido', x.valor_pretendido,
               'estado', x.estado,
               'criado_em', x.criado_em,
               'resolvido_em', x.resolvido_em,
               'resposta', coalesce(x.resposta, '')
             )
             order by (x.estado = 'pendente') desc, x.criado_em desc
           )
    from public.solicitacoes_dados x
   where x.utilizador_id = s.id
  ), '[]'::json);
end;
$$;

-- Resolver uma solicitacao: APLICAR (grava no cadastro do colaborador) ou
-- IGNORAR (marca como resolvida sem mexer; com resposta para a pessoa)
create or replace function public.meus_dados_resolver(
  p_token text, p_solicitacao_id uuid, p_aplicar boolean, p_resposta text)
returns json
language plpgsql security definer set search_path = public, extensions as $$
declare
  s record;
  x record;
  y record;
begin
  select * into s from public.sessao_utilizador(p_token);
  if s.id is null or s.nivel <> 'admin' then
    raise exception 'So a administracao resolve solicitacoes.';
  end if;

  select * into x from public.solicitacoes_dados where id = p_solicitacao_id;
  if x.id is null then
    raise exception 'Solicitacao nao encontrada.';
  end if;
  if x.estado <> 'pendente' then
    raise exception 'Esta solicitacao ja foi resolvida.';
  end if;

  select * into y from public.utilizadores where id = x.utilizador_id;

  if coalesce(p_aplicar, false) then
    if not (x.campo = any (array['contacto','contacto_1','contacto_2','email','endereco','naturalidade','estado_civil'])) then
      raise exception 'Campo fora da lista aceitavel: %', x.campo;
    end if;
    execute format('update public.collaborators set %I = $1 where upper(trim(code)) = $2', x.campo)
      using x.valor_pretendido, y.usuario;
  end if;

  update public.solicitacoes_dados
     set estado = case when coalesce(p_aplicar, false) then 'aplicada' else 'ignorada' end,
         resolvido_em = now(),
         resposta = left(trim(coalesce(p_resposta, '')), 500)
   where id = p_solicitacao_id;

  perform public.registar_acesso(s.id, s.usuario, 'solicitacao_resolvida', true,
    y.usuario || ' :: ' || x.campo || ' :: ' || case when coalesce(p_aplicar, false) then 'aplicada' else 'ignorada' end);
  return json_build_object('ok', true);
end;
$$;
