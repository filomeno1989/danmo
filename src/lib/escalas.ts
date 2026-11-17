/**
 * escalas.ts - Cérebro do módulo Escalas (Admin. Oficinal).
 *
 * A escala mensal que vivia no Excel passa a viver aqui: grelha de
 * colaboradores x dias com os códigos da legenda da casa (07/19,
 * 19/07, Norm., Folga, Sup., Esc., LD, FRD, CCIS, TDP), contagens por
 * secção e totais do dia, folgas guardadas e a escala semanal (Sábado
 * a Sexta, como o mapa antigo) que nasce da mensal com um clique.
 *
 * Funções PURAS: correm no servidor (API, papel, provas) e no
 * navegador (ecrãs) sem importar React nem next. O gerador do ciclo
 * de turnos é o juiz único: ecrã, API e provas usam o mesmo padrão.
 *
 * Regra da auditoria interna: quem tem férias (LD) num mês não pode
 * fazer NENHUM dia de turno nesse mês (só 11 meses de 12 com turno).
 * O gerador salta essas pessoas e avisa; nunca bloqueia à força.
 *
 * Tabelas (sql/fase9-escalas.sql): esc_colaboradores, esc_dias,
 * esc_folgas, esc_notas. Os feriados fixos e móveis de Moçambique
 * continuam a viver em ferias_feriados (módulo Plano de Férias), e as
 * férias do plano em ferias_plano: o módulo Escalas LÊ essas duas
 * tabelas, não duplica o que já existe.
 */

import { hojeMaputo } from "@/lib/disponibilidade";

/* ============ Vocabulário da escala ============ */

/** Os 10 códigos da legenda, na ordem em que aparecem no mapa. */
export const CODIGOS_ESCALA = [
  "07/19",
  "19/07",
  "Norm.",
  "Folga",
  "Sup.",
  "Esc.",
  "LD",
  "FRD",
  "CCIS",
  "TDP"
] as const;

export type CodigoEscala = (typeof CODIGOS_ESCALA)[number];

/** O que cada código significa (a legenda do papel). */
export const SIGNIFICADO: Record<CodigoEscala, string> = {
  "07/19": "Turno da manhã",
  "19/07": "Turno da noite",
  "Norm.": "Horário normal (07/17)",
  Folga: "Folga do dia",
  "Sup.": "Supervisão",
  "Esc.": "Escalados para o dia",
  LD: "Férias / licença",
  FRD: "Feriado",
  CCIS: "Trabalhos na CCIS",
  TDP: "Tolerância de ponto"
};

/** Etiqueta visual de cada código (claro/escuro, cores do tema). */
export const COR_CODIGO: Record<string, string> = {
  "07/19": "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  "19/07": "bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300",
  "Norm.": "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  Folga: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  "Sup.": "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-300",
  "Esc.": "bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300",
  LD: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
  FRD: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  CCIS: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300",
  TDP: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950/60 dark:text-yellow-300"
};

/** Código verdadeiro se a string escrita é um dos códigos da legenda. */
export function eCodigoValido(v: string | null | undefined): v is CodigoEscala {
  return !!v && (CODIGOS_ESCALA as readonly string[]).includes(v);
}

/** Códigos que o gerador do ciclo pode escrever por cima. */
const REGENERAVEIS = ["07/19", "19/07", "Folga"] as const;

/* ============ Áreas (secções do mapa, por ordem de afixação) ============ */

export const AREAS_ESCALA = [
  "Supervisores",
  "Grupos de Turno",
  "Pneumáticos",
  "Mecânica",
  "Eléctrica",
  "Serralharia",
  "Outros"
] as const;

export type AreaEscala = (typeof AREAS_ESCALA)[number];

/** Descobre a área a partir da categoria escrita no Excel. */
export function areaDeCategoria(categoria: string): AreaEscala {
  const c = (categoria || "").trim();
  const semAcento = c
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/^supervisor/.test(semAcento)) return "Supervisores";
  if (/(^|\s)grupo\s+[a-d]\b/.test(semAcento) || /\bgrupo\s+[a-d]\s*[-.]/.test(semAcento)) {
    return "Grupos de Turno";
  }
  if (/pneumatic|pneumaric/.test(semAcento)) return "Pneumáticos";
  if (/mecanic|torneiro|lubrific/.test(semAcento)) return "Mecânica";
  if (/electric|eletric/.test(semAcento)) return "Eléctrica";
  if (/serralheir|pintor|bate.?chapa/.test(semAcento)) return "Serralharia";
  return "Outros";
}

/** Descobre o grupo de turno A-D a partir da categoria. */
export function grupoDeCategoria(categoria: string): "A" | "B" | "C" | "D" | null {
  const m = (categoria || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/grupo\s+([a-d])\b/);
  if (!m) return null;
  return m[1].toUpperCase() as "A" | "B" | "C" | "D";
}

/** Marca se a categoria traz "C.T." (chefe do turno) ou "C.G." (chefe do grupo). */
export function chefeDaCategoria(categoria: string): "C.T." | "C.G." | null {
  const c = (categoria || "").toUpperCase().replace(/\s+/g, "");
  if (c.includes("C.T.")) return "C.T.";
  if (c.includes("C.G.")) return "C.G.";
  return null;
}

/* ============ Tipos das tabelas ============ */

/** Pessoa da escala (esc_colaboradores). */
export type EscColab = {
  id: string;
  colaborador_id: number | null;
  codigo: string;
  nome: string;
  contacto: string;
  categoria: string;
  area: string;
  grupo: string | null;
  ordem: number;
  ativo: boolean;
  criado_em?: string;
};

/** Uma célula da grelha (esc_dias). */
export type EscDia = {
  id?: string;
  colaborador_id: string;
  data: string;
  codigo: string;
};

/** Folga guardada (esc_folgas). */
export type EscFolga = {
  id: string;
  colaborador_id: string;
  data_origem: string | null;
  valor: number;
  data_gozo: string | null;
  estado: string; // guardada | usada | cancelada
  obs: string | null;
  criado_por?: string | null;
  criado_em?: string;
};

/* ============ Datas (tudo ISO yyyy-mm-dd, UTC, sem fuso) ============ */

/** Lista de datas do mês (1..fim) como ISO. */
export function mesDatas(ano: number, mes: number): string[] {
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dias: string[] = [];
  for (let d = 1; d <= total; d++) {
    dias.push(`${ano}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return dias;
}

/** Dom, Seg, Ter, Qua, Qui, Sex, Sáb (ISO sem fuso). */
export function diaSemanaCurto(iso: string): string {
  const d = new Date(iso + "T00:00:00Z").getUTCDay();
  return ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d] || "-";
}

/** Número do dia da semana a la Excel WEEKDAY(...,1): Dom=1 ... Sáb=7. */
export function numeroSemanaExcel(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCDay() + 1;
}

function diasEntre(aISO: string, bISO: string): number {
  const a = new Date(aISO + "T00:00:00Z").getTime();
  const b = new Date(bISO + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

/** Soma dias a uma data ISO (sem fuso). */
export function somaDiasISO(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * A semana da casa começa no SÁBADO e acaba na SEXTA (mapa semanal
 * antigo: Sabado, Domingo, Segunda, Terça, Quarta, Quinta, Sexta).
 * Devolve as 7 datas ISO da semana que contém `iso`.
 */
export function semanaContendo(iso: string): string[] {
  const getUTCDay = new Date(iso + "T00:00:00Z").getUTCDay();
  // getUTCDay: Dom=0 ... Sáb=6; o sábado anterior fica a:
  const recuo = getUTCDay === 6 ? 0 : getUTCDay + 1;
  const inicio = somaDiasISO(iso, -recuo);
  return Array.from({ length: 7 }, (_, i) => somaDiasISO(inicio, i));
}

/** Todos os sábados que tocam o mês (a semana pode nascer no mês anterior). */
export function sabadosDoMes(ano: number, mes: number): string[] {
  const datas = mesDatas(ano, mes);
  const sabados: string[] = [];
  const primeira = semanaContendo(datas[0])[0];
  let sat = primeira;
  while (sat <= datas[datas.length - 1]) {
    sat = semanaContendo(sat)[0];
    if (sat <= datas[datas.length - 1]) sabados.push(sat);
    sat = somaDiasISO(sat, 7);
  }
  return sabados;
}

/** "22/11" (papel e grelha). */
export function fmtDiaCurto(iso: string): string {
  if (!iso || iso.length < 10) return iso || "-";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "Sáb 22/11 a Sex 28/11" (título da semana). */
export function labelSemana(inicioISO: string): string {
  const dias = semanaContendo(inicioISO);
  return `Sáb ${fmtDiaCurto(dias[0])} a Sex ${fmtDiaCurto(dias[6])}`;
}

/** Nome do mês por número (1 = Janeiro). */
export const MESES_ESCALA = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

/* ============ Gerador do ciclo de turnos A-D ============ */

/**
 * O ciclo de 8 dias dos grupos de turno: 2 manhãs, 2 noites, 4 folgas.
 * Grupo A = âncora (o dia do seu 1º 07/19); B começa a manhã no dia
 * seguinte ao fim da manhã de A (offset 2), C offset 4, D offset 6 -
 * assim há sempre gente de manhã, gente na noite e gente de folga.
 */
export const PADRAO_CICLO: CodigoEscala[] = [
  "07/19", "07/19", "19/07", "19/07", "Folga", "Folga", "Folga", "Folga"
];

export const OFFSET_GRUPO: Record<string, number> = { A: 0, B: 2, C: 4, D: 6 };

/** Códigos de um grupo para as datas pedidas, a partir da âncora do Grupo A. */
export function cicloDeGrupo(
  grupo: string,
  ancoraAISO: string,
  datas: string[]
): { data: string; codigo: CodigoEscala }[] {
  const offset = OFFSET_GRUPO[grupo] ?? 0;
  return datas.map((data) => {
    const diff = diasEntre(ancoraAISO, data) - offset;
    const fase = ((diff % 8) + 8) % 8;
    return { data, codigo: PADRAO_CICLO[fase] };
  });
}

export type PropostaCiclo = {
  /** colaborador_id -> data -> código proposto. */
  celulas: Record<string, Record<string, CodigoEscala>>;
  /** Avisos de auditoria e saltos (o ecrã mostra, nada é silencioso). */
  avisos: string[];
};

/**
 * Proposta de preenchimento do ciclo para o mês. Regras:
 * - só escreve em célula VAZIA ou já regenerável (07/19, 19/07, Folga);
 * - NUNCA toca em Norm., Sup., Esc., LD, FRD, CCIS, TDP;
 * - quem tem LD no mês fica FORA do turno nesse mês (auditoria) e ganha
 *   aviso para o supervisor decidir a cobertura.
 */
export function propostaCiclo(
  ancoraAISO: string,
  grupos: Record<string, string[]>,
  existentes: Record<string, Record<string, string>>,
  datas: string[]
): PropostaCiclo {
  const celulas: Record<string, Record<string, CodigoEscala>> = {};
  const avisos: string[] = [];
  for (const [grupo, ids] of Object.entries(grupos)) {
    if (OFFSET_GRUPO[grupo] === undefined) continue;
    const ciclo = new Map(cicloDeGrupo(grupo, ancoraAISO, datas).map((c) => [c.data, c.codigo]));
    for (const id of ids) {
      const linha = existentes[id] || {};
      const temLD = Object.values(linha).includes("LD");
      if (temLD) {
        avisos.push(
          `Auditoria: ${id} tem LD (férias) neste mês e fica fora do turno do Grupo ${grupo}. Decide a cobertura à mão.`
        );
        continue;
      }
      const linhaNova: Record<string, CodigoEscala> = {};
      for (const data of datas) {
        const atual = linha[data];
        const proposto = ciclo.get(data);
        if (!proposto) continue;
        const livre =
          !atual || (REGENERAVEIS as readonly string[]).includes(atual);
        if (livre) linhaNova[data] = proposto;
      }
      if (Object.keys(linhaNova).length) celulas[id] = linhaNova;
    }
  }
  return { celulas, avisos };
}

/**
 * Proposta de COBERTURA: aplica o ciclo de um grupo a uma pessoa de
 * fora (o substituto do turno, da mesma área), num intervalo de dias.
 * Mesmas regras de escrita da propostaCiclo.
 */
export function propostaCobertura(
  grupo: string,
  ancoraAISO: string,
  idPessoa: string,
  existentes: Record<string, string>,
  datas: string[]
): Record<string, CodigoEscala> {
  const uma = propostaCiclo(
    ancoraAISO,
    { [grupo]: [idPessoa] },
    { [idPessoa]: existentes },
    datas
  );
  return uma.celulas[idPessoa] || {};
}

/* ============ Contagens do mês ============ */

export type ContagemDia = Partial<Record<CodigoEscala, number>>;

export type Contagens = {
  /** area -> uma ContagemDia por data do mês. */
  porArea: Record<string, ContagemDia[]>;
  /** Global do dia: todos os códigos, uma ContagemDia por data. */
  global: ContagemDia[];
};

/**
 * Conta códigos por área e no total. `linhaDe` devolve o mapa
 * data -> código de cada colaborador (vazio para quem não tem células).
 */
export function contagensDe(
  membros: EscColab[],
  linhaDe: (id: string) => Record<string, string>,
  datas: string[]
): Contagens {
  const porArea: Record<string, ContagemDia[]> = {};
  for (const area of AREAS_ESCALA) porArea[area] = datas.map(() => ({}));
  const global: ContagemDia[] = datas.map(() => ({}));

  for (const m of membros) {
    if (!m.ativo) continue;
    const linha = linhaDe(m.id) || {};
    const area = (AREAS_ESCALA as readonly string[]).includes(m.area) ? m.area : "Outros";
    datas.forEach((data, i) => {
      const codigo = linha[data];
      if (!eCodigoValido(codigo)) return;
      porArea[area][i][codigo] = (porArea[area][i][codigo] || 0) + 1;
      global[i][codigo] = (global[i][codigo] || 0) + 1;
    });
  }
  return { porArea, global };
}

/** Total de códigos "de trabalho" do dia (Norm. + turnos + Sup. + Esc. + CCIS). */
export function totalTrabalho(c: ContagemDia): number {
  return (
    (c["Norm."] || 0) +
    (c["07/19"] || 0) +
    (c["19/07"] || 0) +
    (c["Sup."] || 0) +
    (c["Esc."] || 0) +
    (c["CCIS"] || 0)
  );
}

/** Quem faz um dado código num dado dia, por área (bloco compacto da semana). */
export function nomesPorCodigo(
  membros: EscColab[],
  linhaDe: (id: string) => Record<string, string>,
  data: string,
  codigo: CodigoEscala
): { area: string; nomes: string[] }[] {
  const porArea = new Map<string, string[]>();
  for (const m of membros) {
    if (!m.ativo) continue;
    const codigoDia = (linhaDe(m.id) || {})[data];
    if (codigoDia !== codigo) continue;
    const lista = porArea.get(m.area) || [];
    lista.push(m.nome);
    porArea.set(m.area, lista);
  }
  return [...porArea.entries()]
    .sort((a, b) => (AREAS_ESCALA as readonly string[]).indexOf(a[0] as AreaEscala) - (AREAS_ESCALA as readonly string[]).indexOf(b[0] as AreaEscala))
    .map(([area, nomes]) => ({ area, nomes: nomes.sort() }));
}

/* ============ Folgas guardadas ============ */

/** Saldo de folgas guardadas (aceita meios dias). */
export function saldoFolgas(folgas: EscFolga[]): number {
  return folgas
    .filter((f) => f.estado === "guardada")
    .reduce((s, f) => s + (Number(f.valor) || 0), 0);
}

export type DadosFolga = {
  valor?: number | string;
  data_origem?: string;
  obs?: string;
};

/** Recusa a folga nova quando falta o essencial. Mensagem para o ecrã. */
export function problemaFolga(d: DadosFolga): string | null {
  const v = Number(d.valor);
  if (!Number.isFinite(v) || v <= 0) return "Indica o valor da folga (0.5, 1, 1.5...).";
  if (Math.round(v * 2) !== v * 2) return "O valor avança em meios dias (0.5, 1, 1.5...).";
  if (v > 30) return "Valor demasiado alto (máx. 30).";
  if (d.data_origem) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data_origem)) return "Data de origem inválida.";
    const calendario = new Date(d.data_origem + "T00:00:00Z");
    if (Number.isNaN(calendario.getTime()) || calendario.toISOString().slice(0, 10) !== d.data_origem) {
      return "Data de origem inválida.";
    }
  }
  if (d.obs && d.obs.length > 200) return "Observação demasiado longa (máx. 200).";
  return null;
}

/* ============ Validações do registo ============ */

/** Duplicado por nome, sem acentos e sem ligar a maiúsculas (registo). */
export function nomeDuplicadoEscalas(nome: string, nomes: string[], exceto?: string): boolean {
  const alvo = chaveNomeSimples(nome);
  return nomes.some((n) => {
    if (n === exceto) return false;
    return chaveNomeSimples(n) === alvo;
  });
}

function chaveNomeSimples(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export type DadosColab = {
  codigo?: string;
  nome?: string;
  contacto?: string;
  categoria?: string;
  area?: string;
  grupo?: string | null;
  ordem?: number | string;
};

/** Recusa a pessoa nova/edição quando falta o essencial. */
export function problemaColab(d: DadosColab): string | null {
  if (!d.codigo?.trim()) return "Indica o código da pessoa (DMxxxx ou EST).";
  if (d.codigo.trim().length > 20) return "Código demasiado longo (máx. 20).";
  if (!d.nome?.trim()) return "Indica o nome.";
  if (d.nome.trim().length > 120) return "Nome demasiado longo (máx. 120).";
  const tel = (d.contacto || "").replace(/\s/g, "");
  if (tel && !/^\+?\d{7,15}$/.test(tel)) return "Contacto inválido (7 a 15 dígitos).";
  if ((d.categoria || "").length > 80) return "Categoria demasiado longa (máx. 80).";
  if (d.area && !(AREAS_ESCALA as readonly string[]).includes(d.area)) {
    return "Área desconhecida.";
  }
  if (
    d.grupo &&
    !(["A", "B", "C", "D"] as string[]).includes(d.grupo)
  ) {
    return "Grupo tem de ser A, B, C ou D.";
  }
  const ordem = Number(d.ordem ?? 999);
  if (!Number.isFinite(ordem) || ordem < 0) return "Ordem inválida.";
  return null;
}

/* ============ Hoje (Maputo, como o resto do portal) ============ */

export function hojeEsc(): string {
  return hojeMaputo();
}

/* ============ Ajudas das rotas de API ============ */

/** Verdadeiro quando a base respondeu "tabela não existe" (SQL por colar). */
export function eFaltaSQL(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e);
  return /404|42P01|PGRST205|does not exist|Could not find the table/i.test(m);
}

/**
 * Aviso de auditoria de uma linha do mês: a regra da casa é NENHUM dia
 * de turno no mês em que a pessoa tem férias (LD). Devolve o texto do
 * aviso ou null. Nada bloqueia: quem decide é o supervisor.
 */
export function avisoAuditoria(linha: Record<string, string>): string | null {
  const valores = Object.values(linha);
  const temLD = valores.includes("LD");
  if (!temLD) return null;
  const temTurno = valores.some((v) => v === "07/19" || v === "19/07");
  return temTurno
    ? "Tem LD (férias) e turnos no MESMO mês: a auditoria interna não permite. Decide a cobertura."
    : null;
}
