/**
 * disponibilidade.ts - Fundos partilhados do módulo Disponibilidade de
 * Equipamentos (Fase 4).
 *
 * Reúne:
 * - os estados físicos do dia (os mesmos de ordens_servico.status_fisico,
 *   que finalmente entram em uso real com este módulo);
 * - as 12 macro-frotas do Resumo Semanal da Direcção (o ficheiro do
 *   Director, agora integrado), mapeadas aos group_name da base;
 * - ajudantes de semanas ISO e de períodos mensais;
 * - tipos das tabelas disp_*.
 */

import { COR_FISICO } from "@/lib/oficina";

/** Estados físicos possíveis num dia (ordem de apresentação). */
export const ESTADOS_DIA = [
  "Disponível",
  "Avariada",
  "Acidentada",
  "Pneumático",
  "Revisão/Manutenção",
  "Inspeção",
  "Aguarda Acessório"
] as const;

export type EstadoDia = (typeof ESTADOS_DIA)[number];

/** Cores por estado (herdam o padrão da Oficina). */
export const COR_ESTADO_DIA = COR_FISICO;

/** Código de 2 letras usado nos excels antigos (A, PM, TY, AC, BD, SP). */
export const CODIGO_ESTADO: Record<string, string> = {
  Disponível: "A",
  "Revisão/Manutenção": "PM",
  Pneumático: "TY",
  Acidentada: "AC",
  Avariada: "BD",
  "Aguarda Acessório": "SP"
};

export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export const MESES_ABA = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * As 12 macro-frotas do Resumo Semanal da Direcção, cada uma com os
 * group_name da base que a compõem (233 máquinas activas no total).
 */
export const FROTAS_PADRAO: { label: string; grupos: string[] }[] = [
  { label: "Reach-Stacker 45T", grupos: ["RST 45T"] },
  { label: "Tratores 70T", grupos: ["TT 70T"] },
  { label: "Tratores 60T", grupos: ["TT 60T"] },
  { label: "Forklifts 2,5-16T", grupos: ["FKL 2.5T", "FKL 3T", "FKL 5T", "FKL 13T", "FKL 16T"] },
  { label: "Forklifts 30-50T", grupos: ["FKL 30T", "FKL 46T", "FKL 50T"] },
  { label: "Plataformas SK", grupos: ["SLT 60T", "SLT 65T"] },
  { label: "Plataformas R-R", grupos: ["R.R 60T", "R.R 80T", "R.R 100T"] },
  { label: "Pás Mecânicas (WLD)", grupos: ["PLY 17T", "PLY 24T"] },
  { label: "Escavadoras", grupos: ["ESC 13T", "ESC 21T", "ESC 37T"] },
  { label: "Manuseadoras", grupos: ["JCB", "M.H.", "BBC"] },
  { label: "Basculantes", grupos: ["Basculante"] },
  {
    label: "Outros",
    grupos: ["CV 9T", "Bombeiro", "Cisterna", "Grua", "Limpeza", "Reboque", "Ansaldo STS", "Outros"]
  }
];

/** Macro-frota de um group_name da base. */
export function frotaDeGrupo(grupo: string | null | undefined): string {
  if (!grupo) return "Outros";
  const achou = FROTAS_PADRAO.find((f) => f.grupos.includes(grupo));
  return achou ? achou.label : "Outros";
}

/** Todos os group_name que pertencem a uma macro-frota (ou undefined = todas). */
export function gruposDaFrota(frota: string | undefined): string[] | undefined {
  if (!frota || frota === "todos") return undefined;
  const achou = FROTAS_PADRAO.find((f) => f.label === frota);
  if (achou) return achou.grupos;
  return [frota]; // aceita também um group_name directo
}

/** Dias do mês (calendário). */
export function diasNoMes(ano: number, mes: number): number {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Horas totais do mês (24h por dia, a regra do excel deles). */
export function horasTotaisMes(ano: number, mes: number): number {
  return diasNoMes(ano, mes) * 24;
}

/** Semana ISO de uma data (segunda-feira como dia 1). */
export function semanaISOde(d: Date): { ano: number; semana: number } {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dia = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - dia);
  const inicioAno = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((dt.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
  return { ano: dt.getUTCFullYear(), semana };
}

/** Segunda-feira da semana ISO (ano, semana). */
export function inicioSemanaISO(ano: number, semana: number): Date {
  const simples = new Date(Date.UTC(ano, 0, 4));
  const dia = simples.getUTCDay() || 7;
  simples.setUTCDate(simples.getUTCDate() - dia + 1 + (semana - 1) * 7);
  return simples;
}

/** Intervalo [segunda, domingo) da semana ISO, em datas YYYY-MM-DD. */
export function intervaloSemanaISO(ano: number, semana: number): { de: string; ate: string } {
  const ini = inicioSemanaISO(ano, semana);
  const fim = new Date(ini);
  fim.setUTCDate(fim.getUTCDate() + 7);
  return { de: ini.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
}

/** Data de hoje em Maputo (UTC+2) como YYYY-MM-DD. */
export function hojeMaputo(): string {
  const agora = new Date();
  const maputo = new Date(agora.getTime() + (2 * 60 + agora.getTimezoneOffset()) * 60000);
  return maputo.toISOString().slice(0, 10);
}

/* ============ Tipos das tabelas disp_* ============ */

export type EquipamentoLinha = {
  id: number;
  code: string;
  name: string | null;
  model?: string | null;
  group_name: string | null;
  active: boolean;
};

export type DiaLinha = {
  id?: number;
  equipment_id: number;
  data: string;
  estado: string | null;
  horas_disponiveis: number | null;
  hora_entrada?: string | null;
  hora_saida?: string | null;
  observacao?: string | null;
  origem?: string;
};

export type MensalLinha = {
  equipment_id: number;
  ano: number;
  mes: number;
  horas_a: number;
  horas_pm: number;
  horas_ty: number;
  horas_ac: number;
  horas_bd: number;
  horas_sp: number;
  horas_total: number;
  origem?: string;
};

export type HorometroLinha = {
  id?: number;
  equipment_id: number;
  ano: number;
  mes: number;
  leitura_inicial: number | null;
  leitura_final: number | null;
  horas_trabalhadas: number | null;
  lancado_por?: string | null;
  lancado_em?: string;
  observacao?: string | null;
};

export type TransicaoLinha = {
  id: number;
  equipment_id: number;
  estado: string;
  inicio: string;
  fim: string | null;
  os_id?: number | null;
  observacao?: string | null;
};

export type SemanalLinha = {
  frota: string;
  pend_inicio: number;
  entradas: number;
  saidas: number;
  aguardam_pecas: number;
};

export type SemanaGeralLinha = {
  dificuldades: string | null;
  melhorias: MelhoriaLinha[];
};

export type MelhoriaLinha = {
  descricao: string;
  responsavel: string;
  prazo: string;
  estado: "Por iniciar" | "Em curso" | "Concluído";
};

/** Horas por estado a partir de uma linha mensal (ordem dos estados). */
export function horasPorEstado(l: MensalLinha): Record<string, number> {
  return {
    Disponível: Number(l.horas_a) || 0,
    "Revisão/Manutenção": Number(l.horas_pm) || 0,
    Pneumático: Number(l.horas_ty) || 0,
    Acidentada: Number(l.horas_ac) || 0,
    Avariada: Number(l.horas_bd) || 0,
    "Aguarda Acessório": Number(l.horas_sp) || 0
  };
}

/** Percentagem de disponibilidade, arredondada a 1 decimal. */
export function pctDisponibilidade(horasA: number, horasTotal: number): number {
  if (!horasTotal) return 0;
  return Math.round((horasA / horasTotal) * 1000) / 10;
}
