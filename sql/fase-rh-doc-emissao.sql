-- fase-rh-doc-emissao.sql - DATA DE EMISSAO nos documentos anexados.
--
-- O Filomeno perguntou se a data do anexo era a de emissao ou a de
-- validade: era a de VALIDADE (a que alimenta os alertas). Agora as
-- duas existem, cada uma com o seu rotulo visivel no formulario:
--   emissao  = quando o documento foi emitido (so informacao)
--   validade = quando o documento expira (alimenta os alertas)
--
-- SO ACRESCENTA: uma coluna nova, idempotente (pode colar outra vez
-- sem partir nada). Nao toca em RLS, nem em dados, nem em nada mais.
-- Colar no SQL Editor do Supabase ANTES de usar o campo novo; enquanto
-- nao for colado, o portal grava e lista os anexos NA MESMA, so sem
-- a data de emissao (fallback provado).

ALTER TABLE public.rh_colaborador_documentos
  ADD COLUMN IF NOT EXISTS emissao date;
