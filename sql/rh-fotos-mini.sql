-- ================================================================
-- PORTAL DANMO - RH: MINI DAS FOTOS (para a grelha do Quadro)
-- ----------------------------------------------------------------
-- COMO CORRER (uma unica vez, ~10 segundos):
--   1. Abre o Supabase (supabase.com/dashboard) > o teu projecto
--   2. Menu lateral: SQL Editor > New query
--   3. Cola TODO este ficheiro e clica em RUN
--   4. Espera a mensagem verde de sucesso
--
-- SEGURANCA: pode correr-se mais do que uma vez sem partir nada
-- ("if not exists"). NAO toca em RLS, nem em linhas, nem em nada
-- que o hub use: so ACRESCENTA uma coluna na tabela de fotos que
-- ja existe e que so o portal usa.
--
-- O QUE FAZ:
--   mini - a versao PEQUENA da foto (quadrado, ~240px, base64)
--          gerada no navegador no momento do upload. E a MINI que
--          a grelha do Quadro carrega, para a lista continuar
--          leve mesmo com todos de foto na mesa. As fotos grandes
--          continuam onde estao e continuam a sair na ficha e no
--          zoom. Fotos gravadas antes desta coluna ficam sem mini:
--          a grelha mostra-as pela foto grande (e basta gravar a
--          foto outra vez na ficha para nascer a mini).
-- ================================================================

alter table public.rh_colaborador_fotos
  add column if not exists mini text;
