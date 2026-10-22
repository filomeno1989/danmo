-- ================================================================
-- PORTAL DANMO (nova geracao) - RH: ALERTAS DE DOCUMENTOS + ARQUIVO
-- DE DOCUMENTOS (scans em PDF/foto) DO QUADRO DE PESSOAL
-- ----------------------------------------------------------------
-- COMO CORRER (uma unica vez, ~1 minuto):
--   1. Abre o Supabase (supabase.com/dashboard) > o teu projecto
--   2. Menu lateral: SQL Editor > New query
--   3. Cola TODO este ficheiro e clica em RUN
--   4. Espera a mensagem verde de sucesso
--
-- SEGURANCA: pode correr-se mais do que uma vez sem partir nada
-- (tudo usa "if not exists").
--
-- NAO TOCA em nada do que ja existe. So ACRESCENTA:
--
--   A) 3 colunas novas em collaborators (as datas dos documentos
--      que alimentam os ALERTAS):
--        bi_validade              - validade do Bilhete de Identidade
--        carta_conducao           - numero da Carta de Conducao
--        carta_conducao_validade  - validade da Carta de Conducao
--      Todas opcionais: quem ja tem ficha fica como esta, sem
--      alerta nenhum ate a data ser preenchida.
--
--   B) rh_colaborador_documentos - o ARQUIVO de documentos de cada
--      colaborador: o scan em PDF (ou foto) anexado a ficha, para
--      quando se precisar ser so abrir, descarregar e imprimir.
--      Igual as fotos: base64 numa tabela a PARTE, para a lista de
--      colaboradores nunca pesar. A lista so le os metadados; o
--      ficheiro em si vem so na rota propria.
-- ================================================================

-- ================================================================
-- A) Datas dos documentos que alimentam os alertas
-- ================================================================
alter table public.collaborators
  add column if not exists bi_validade date;

alter table public.collaborators
  add column if not exists carta_conducao text;

alter table public.collaborators
  add column if not exists carta_conducao_validade date;

-- ================================================================
-- B) Arquivo de documentos (scans) por colaborador
-- ================================================================
create table if not exists public.rh_colaborador_documentos (
  id uuid primary key default gen_random_uuid(),
  colaborador_id bigint not null references public.collaborators(id) on delete cascade,
  tipo text not null,          -- B.I. | NIF/NUIT | Contrato | Carta de conducao | ...
  titulo text not null,        -- nome dado ao documento (do ficheiro)
  validade date,               -- opcional; alimenta os alertas se for B.I. ou carta
  arquivo text not null,       -- data URL (base64) do PDF ou da imagem comprimida
  arquivo_nome text not null,  -- nome original do ficheiro
  arquivo_tipo text not null,  -- mime: application/pdf, image/jpeg, ...
  arquivo_bytes integer not null,
  criado_em timestamptz not null default now()
);

create index if not exists idx_rh_docs_colaborador
  on public.rh_colaborador_documentos (colaborador_id);
