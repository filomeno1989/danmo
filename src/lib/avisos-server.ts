/**
 * avisos-server.ts - Fonte única dos avisos vivos do Quadro de Pessoal.
 *
 * Usada pelo Home (painel) e pelo sino de alertas do topo. Lê a base
 * servidor a servidor e FALHA MACIO: qualquer erro devolve listas vazias
 * para nunca partir a página que só quer avisar.
 */

import { query, queryTudo, chavesConfiguradas } from "@/lib/supabase";
import {
  MESES,
  alertasDocumentos,
  aniversariantesDoMes,
  dataHojeISO,
  type AlertaDoc,
  type Aniversariante,
  type Colaborador,
  type ValidadeDoc
} from "@/lib/rh";

export type AvisosQuadro = {
  aniversariantes: Aniversariante[];
  mesNome: string;
  alertas: AlertaDoc[];
};

const VAZIO: AvisosQuadro = { aniversariantes: [], mesNome: "", alertas: [] };

export async function avisosDoQuadro(): Promise<AvisosQuadro> {
  if (!chavesConfiguradas()) return VAZIO;
  try {
    const hoje = dataHojeISO();
    // O select completo precisa das colunas novas (SQL fase-rh-documentos).
    // Enquanto o SQL nao for colado no Supabase, repete so com as colunas
    // antigas: os ANIVERSARIANTES ja funcionam, os alertas de documentos
    // entram quando as colunas existirem.
    let cols: Colaborador[];
    try {
      cols = await queryTudo<Colaborador>(
        "collaborators",
        "select=id,name,categoria,empresa,active,data_nascimento,bi_validade,carta_conducao_validade"
      );
    } catch {
      cols = await queryTudo<Colaborador>(
        "collaborators",
        "select=id,name,categoria,empresa,active,data_nascimento"
      );
    }
    let docs: ValidadeDoc[] = [];
    try {
      docs = await query<ValidadeDoc>(
        "rh_colaborador_documentos",
        "select=colaborador_id,tipo,validade&validade=not.is.null"
      );
    } catch {
      docs = [];
    }
    const mes = Number(hoje.slice(5, 7));
    return {
      aniversariantes: aniversariantesDoMes(cols, hoje),
      mesNome: MESES[mes - 1] || "",
      alertas: alertasDocumentos(cols, docs, hoje)
    };
  } catch {
    return VAZIO;
  }
}
