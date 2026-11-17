/**
 * escalas-server.ts - Dados do módulo Escalas lidos do SERVIDOR.
 *
 * Junta as leituras repetidas (registo, folgas, feriados, férias do
 * plano) num sítio só, com a degradação honesta: se as tabelas da Fase
 * 9 ainda não existem (SQL por colar), a resposta traz sqlFalta e o
 * ecrã diz ao Filomeno o que fazer. Os feriados continuam a viver em
 * ferias_feriados (Plano de Férias) e as férias em ferias_plano: aqui
 * só se LÊ, nunca se duplica.
 */

import { queryTudo } from "@/lib/supabase";
import { eFaltaSQL, type EscColab, type EscFolga } from "@/lib/escalas";

export const PAGINAS_ESCALAS = [
  "escalas.mensal",
  "escalas.semanal",
  "escalas.folgas",
  "escalas.colaboradores",
  "escalas.configuracoes"
] as const;

export type FeriadoAtivo = { data: string; descricao: string };

export type BaseEscalas = {
  sqlFalta: boolean;
  erro?: string;
  colaboradores: EscColab[];
  folgas: EscFolga[];
  feriados: FeriadoAtivo[];
};

/** Registo + folgas + feriados (todos os anos resolvíveis). */
export async function carregarBase(): Promise<BaseEscalas> {
  try {
    const [colaboradores, folgas, feriados] = await Promise.all([
      queryTudo<EscColab>("esc_colaboradores", "select=*&order=ordem.asc&order=nome.asc"),
      queryTudo<EscFolga>("esc_folgas", "select=*&order=criado_em.asc"),
      queryTudo<{ data: string; descricao: string; recorrente: boolean }>(
        "ferias_feriados",
        "select=data,descricao,recorrente"
      )
    ]);
    return { sqlFalta: false, colaboradores, folgas, feriados: resolverFeriados(feriados) };
  } catch (e) {
    if (eFaltaSQL(e)) {
      return { sqlFalta: true, colaboradores: [], folgas: [], feriados: [] };
    }
    throw e;
  }
}

/** Resolve feriados recorrentes (âncora 2000) para os anos pedidos. */
export function resolverFeriados(
  brutos: { data: string; descricao: string; recorrente: boolean }[],
  anos?: number[]
): FeriadoAtivo[] {
  const lista: FeriadoAtivo[] = [];
  const hojeAno = new Date().getUTCFullYear();
  const alvos = anos && anos.length ? anos : [hojeAno, hojeAno + 1];
  for (const f of brutos) {
    if (!f.recorrente) {
      lista.push({ data: f.data.slice(0, 10), descricao: f.descricao });
      continue;
    }
    const mmdd = f.data.slice(5, 10);
    for (const ano of alvos) {
      lista.push({ data: `${ano}-${mmdd}`, descricao: f.descricao });
    }
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data));
}

/** Feriados que caem dentro do intervalo ISO [de, ate]. */
export function feriadosNoIntervalo(feriados: FeriadoAtivo[], de: string, ate: string): FeriadoAtivo[] {
  return feriados.filter((f) => f.data >= de && f.data <= ate);
}

/** Férias do plano que tocam o intervalo, já com o código da escala. */
export type FeriasDoPlano = {
  codigo: string;
  data_inicio: string;
  data_fim: string;
};

export async function feriasDoPlano(
  de: string,
  ate: string,
  codigosColaboradores: Map<number, string>
): Promise<FeriasDoPlano[]> {
  const linhas = await queryTudo<{
    collaborator_id: number;
    data_inicio: string | null;
    data_fim: string | null;
    status: string | null;
  }>("ferias_plano", "select=collaborator_id,data_inicio,data_fim,status&order=data_inicio.asc");
  return linhas
    .filter((l) => l.data_inicio && l.data_fim)
    .filter((l) => (l.data_fim || "").slice(0, 10) >= de && (l.data_inicio || "").slice(0, 10) <= ate)
    .filter((l) => codigosColaboradores.has(l.collaborator_id))
    .map((l) => ({
      codigo: codigosColaboradores.get(l.collaborator_id) as string,
      data_inicio: (l.data_inicio || "").slice(0, 10),
      data_fim: (l.data_fim || "").slice(0, 10)
    }));
}

/** Bridge collaborator_id -> código DM (para casar o plano com a escala). */
export async function bridgeColaboradores(): Promise<Map<number, string>> {
  const linhas = await queryTudo<{ id: number; code: string | null }>(
    "collaborators",
    "select=id,code"
  );
  return new Map(
    linhas.filter((l) => l.code).map((l) => [l.id, l.code as string])
  );
}
