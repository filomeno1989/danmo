/**
 * ferramentaria.ts - Cérebro do módulo Ferramentaria.
 *
 * Migração do hub antigo (ferramentaria/*.html, 8 páginas) com melhorias
 * de analista. Funções PURAS: correm no servidor (API, papel, provas) e
 * no navegador (ecrãs) sem importar React nem next.
 *
 * Correcções de fundo em relação ao hub (o juiz vive AQUI, partilhado):
 * - a devolução do hub era 4 operações SEQUENCIAIS DO NAVEGADOR (gravar
 *   a linha de devolução, actualizar a linha de empréstimo, mudar o
 *   estado da ferramenta, criar o dano): qualquer falha a meio deixava
 *   dados a meio. No portal o SERVIDOR faz as 4 e decide tudo;
 * - o estado da ferramenta após a devolução era escolhido no navegador:
 *   agora nasce do juiz único estadoAposDevolucao (bom/avariado/
 *   inutilizado), o mesmo em ecrã, API e papel;
 * - o hub tinha DOIS juízes contraditórios de dano: o dashboard contava
 *   "sujo/desgastado/torto/avariado/perdido" como problema e a devolução
 *   criava dano só para "avariado/torto/partido/perdido" (o "desgastado"
 *   que aparecia no painel nunca criava dano). Aqui fica a verdade única:
 *   CONSERVACAO (sujo, desgastado) avisa sem dano; DESASTRES (torto,
 *   partido, avariado, perdido) criam dano;
 * - fechar um dano como REPARADO no hub não tocava na ferramenta (ficava
 *   "avariado" para sempre) e INUTILIZAR também não. Agora o servidor
 *   sincroniza o inventário;
 * - a disponibilidade era verificada no NAVEGADOR antes de inserir (duas
 *   pessoas podiam levar a mesma unidade): agora o POST revalida contra
 *   a base no momento de gravar;
 * - o inventário do hub aceitava criar ferramenta com código duplicado;
 *   agora o servidor recusa (409);
 * - o relatório "Na Rua" cortava pelo período escolhido e escondia quem
 *   saiu há 2 meses: a lista da rua passa a ser TODA a gente sem
 *   devolver, que é o que a coluna "Tempo em Atraso" promete;
 * - os contadores "este mês" correm no fuso do navegador: agora Maputo.
 *
 * Sem SQL novo: as 6 tabelas (tools, tool_movements, tool_damage,
 * tool_staff, tool_categories, departamentos) já existem na base com os
 * dados reais da casa.
 */

import { hojeMaputo } from "@/lib/disponibilidade";

/* ============ Tipos ============ */

/** Ferramenta do inventário (tabela tools, id UUID). */
export type Ferramenta = {
  id: string;
  code: string;
  nome: string;
  category_id: string | null;
  marca: string | null;
  estado: string | null;
  localizacao: string | null;
  quantidade: number | null;
  unidade: string | null;
  valor_unitario: number | null;
  active: boolean | null;
  created_at?: string;
};

/** Movimento de tool_movements (emprestimo ou devolucao). */
export type Movimento = {
  id: string;
  tool_id: string;
  tipo: string; // emprestimo | devolucao
  colaborador: string | null;
  departamento: string | null;
  os_id: string | null;
  equipamento_id: string | null;
  estado_ao_sair: string | null;
  estado_ao_voltar: string | null;
  entregue_por: string | null;
  recebido_por: string | null;
  data_saida: string | null;
  data_devolucao: string | null;
  prazo_devolucao: string | null;
  observacoes_saida: string | null;
  observacoes_devolucao: string | null;
  created_at?: string;
};

/** Movimento com a ferramenta JÁ resolvida pelo servidor. */
export type MovimentoVisao = Movimento & {
  code: string | null;
  nome: string | null;
};

/** Dano registado em tool_damage (nascido de devolução com problema). */
export type Dano = {
  id: string;
  tool_id: string | null;
  movement_id: string | null;
  tipo_dano: string | null;
  estado_reportado: string | null;
  severidade: string | null; // leve | moderado | grave
  custo_reparacao: number | null;
  status: string | null; // reportado | em reparo | reparado | inutilizado
  colaborador: string | null;
  responsavel: string | null;
  observacoes: string | null;
  resolved_at: string | null;
  created_at?: string;
};

/** Dano com a ferramenta JÁ resolvida pelo servidor. */
export type DanoVisao = Dano & {
  code: string | null;
  nome: string | null;
};

/** Ferramenteiro de tool_staff (quem entrega e recebe na ferramentaria). */
export type Ferramenteiro = {
  id: string;
  nome: string;
  codigo: string | null;
  turno: string | null;
  active: boolean | null;
  created_at?: string;
};

/** Categoria de tools (tool_categories). */
export type Categoria = {
  id: string;
  nome: string;
  active: boolean | null;
};

/** Departamento de trabalho (tabela departamentos, partilhada). */
export type Departamento = {
  id: string;
  nome: string;
  active: boolean | null;
};

/** Pessoa do catálogo de colaboradores (para os campos de pessoa). */
export type ColaboradorFerr = {
  id: number;
  name: string | null;
  code: string | null;
};

/* ============ Vocabulário dos estados ============ */

/** Estados possíveis de uma ferramenta no inventário. */
export const ESTADOS_FERRAMENTA = [
  "novo",
  "bom",
  "desgastado",
  "emprestado",
  "avariado",
  "inutilizado"
] as const;

/** Estados possíveis ao devolver (o dropdown da devolução). */
export const ESTADOS_VOLTAR = [
  "bom",
  "sujo",
  "desgastado",
  "torto",
  "partido",
  "avariado",
  "perdido"
] as const;

/** Estados de conservação: aviso no painel, NUNCA criam dano. */
export const CONSERVACAO = ["sujo", "desgastado"] as const;

/** Desastres: a devolução destes cria registo de dano. */
export const DESASTRES = ["torto", "partido", "avariado", "perdido"] as const;

/** Estados de dano (tool_damage.status) por ordem de avanço. */
export const STATUS_DANO = ["reportado", "em reparo", "reparado", "inutilizado"] as const;

/** Severidades aceites no dano. */
export const SEVERIDADES = ["leve", "moderado", "grave"] as const;

/* ============ Etiquetas (cores do tema) ============ */

const ETIQ_OK = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300";
const ETIQ_AVISO = "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300";
const ETIQ_ERRO = "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300";
const ETIQ_INFO = "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300";
const ETIQ_NULO = "bg-muted text-muted-foreground";

export const COR_ESTADO_FERRAMENTA: Record<string, string> = {
  novo: ETIQ_OK,
  bom: ETIQ_OK,
  desgastado: ETIQ_AVISO,
  emprestado: ETIQ_INFO,
  avariado: ETIQ_ERRO,
  inutilizado: ETIQ_ERRO
};

export const COR_ESTADO_VOLTAR: Record<string, string> = {
  bom: ETIQ_OK,
  sujo: ETIQ_AVISO,
  desgastado: ETIQ_AVISO,
  torto: ETIQ_ERRO,
  partido: ETIQ_ERRO,
  avariado: ETIQ_ERRO,
  perdido: ETIQ_ERRO
};

export const COR_SEVERIDADE: Record<string, string> = {
  leve: ETIQ_OK,
  moderado: ETIQ_AVISO,
  grave: ETIQ_ERRO
};

export const COR_STATUS_DANO: Record<string, string> = {
  reportado: ETIQ_AVISO,
  "em reparo": ETIQ_INFO,
  reparado: ETIQ_OK,
  inutilizado: ETIQ_ERRO
};

export function corEstadoFerramenta(estado: string | null | undefined): string {
  if (!estado) return ETIQ_NULO;
  return COR_ESTADO_FERRAMENTA[estado.toLowerCase()] || ETIQ_NULO;
}

export function corEstadoVoltar(estado: string | null | undefined): string {
  if (!estado) return ETIQ_NULO;
  return COR_ESTADO_VOLTAR[estado.toLowerCase()] || ETIQ_NULO;
}

export function corSeveridade(sev: string | null | undefined): string {
  if (!sev) return ETIQ_NULO;
  return COR_SEVERIDADE[sev.toLowerCase()] || ETIQ_NULO;
}

export function corStatusDano(status: string | null | undefined): string {
  if (!status) return ETIQ_NULO;
  return COR_STATUS_DANO[status.toLowerCase()] || ETIQ_NULO;
}

/* ============ Juízes de tempo ============ */

/** Verdadeiro quando o prazo de devolução já passou (prazo < hoje). */
export function estaAtrasada(prazo: string | null, hoje: string): boolean {
  if (!prazo) return false;
  const p = prazo.slice(0, 10);
  return p < hoje;
}

/** Dias inteiros fora (de data_saida a hoje); null sem data. */
export function diasFora(dataSaida: string | null, hoje: string): number | null {
  if (!dataSaida) return null;
  const saida = dataSaida.slice(0, 10);
  const ms = new Date(hoje + "T00:00:00Z").getTime() - new Date(saida + "T00:00:00Z").getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 86400000);
}

/** "Hoje", "1 dia", "n dias" (o mesmo discurso do hub). */
export function fmtDias(n: number | null): string {
  if (n === null) return "-";
  if (n === 0) return "Hoje";
  if (n === 1) return "1 dia";
  return `${n} dias`;
}

/** Devolve a data de amanhã como YYYY-MM-DD (prazo por omissão). */
export function amanhaISO(): string {
  const amanha = new Date(Date.now() + 86400000);
  return amanha.toISOString().slice(0, 10);
}

/* ============ Juízes de estado ============ */

/**
 * Estado do inventário após devolver com "estadoVoltar".
 * Regra do negócio (do hub, agora num juiz único): torto/partido/
 * avariado voltam avariado, perdido mata a ferramenta, tudo o resto
 * volta bom.
 */
export function estadoAposDevolucao(estadoVoltar: string): "bom" | "avariado" | "inutilizado" {
  const e = (estadoVoltar || "").toLowerCase();
  if (e === "perdido") return "inutilizado";
  if (e === "avariado" || e === "torto" || e === "partido") return "avariado";
  return "bom";
}

/** Verdadeiro quando devolver com este estado CRIA registo de dano. */
export function geraDano(estadoVoltar: string): boolean {
  return (DESASTRES as readonly string[]).includes((estadoVoltar || "").toLowerCase());
}

/** Estado seguinte do dano (reportado -> em reparo -> reparado). */
export function proximoStatusDano(status: string | null): string | null {
  if (status === "reportado") return "em reparo";
  if (status === "em reparo") return "reparado";
  return null;
}

/* ============ Juízes de disponibilidade ============ */

/** Linhas de empréstimo ainda não devolvidas de uma ferramenta. */
export function activosDa(
  movimentos: Movimento[],
  toolId: string
): Movimento[] {
  return movimentos.filter(
    (m) => m.tool_id === toolId && m.tipo === "emprestimo" && !m.data_devolucao
  );
}

/** Disponibilidade real de uma ferramenta: total - unidades na rua. */
export function disponibilidadeDe(
  ferramenta: Ferramenta,
  movimentos: Movimento[]
): { total: number; emprestadas: number; disponivel: number; activos: Movimento[] } {
  const total = Math.max(1, Number(ferramenta.quantidade) || 1);
  const activos = activosDa(movimentos, ferramenta.id);
  const disponivel = Math.max(0, total - activos.length);
  return { total, emprestadas: activos.length, disponivel, activos };
}

/* ============ Juízes de formulário (partilhados ecrã + API) ============ */

export type DadosEmprestimo = {
  ferramentaCode?: string;
  colaborador?: string;
  departamento?: string;
  prazo?: string;
  entreguePorId?: string;
};

/** Recusa o empréstimo quando falta o essencial. Mensagem para o ecrã. */
export function problemaEmprestimo(d: DadosEmprestimo): string | null {
  if (!d.ferramentaCode?.trim()) return "Indica a ferramenta pelo código.";
  if (!d.colaborador?.trim()) return "Indica quem leva a ferramenta.";
  if (!d.departamento?.trim()) return "Indica o departamento.";
  if (!d.entreguePorId?.trim()) return "Indica o ferramenteiro que entrega.";
  if (!d.prazo?.trim()) return "Indica o prazo de devolução.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.prazo.trim())) return "Prazo com data inválida.";
  return null;
}

export type DadosDevolucao = {
  estadoVoltar?: string;
  recebidoPorId?: string;
};

/** Recusa a devolução quando falta o essencial. */
export function problemaDevolucao(d: DadosDevolucao): string | null {
  if (!d.estadoVoltar?.trim()) return "Indica o estado em que a ferramenta volta.";
  if (!(ESTADOS_VOLTAR as readonly string[]).includes(d.estadoVoltar.trim().toLowerCase())) {
    return "Estado de devolução desconhecido.";
  }
  if (!d.recebidoPorId?.trim()) return "Indica o ferramenteiro que recebe.";
  return null;
}

export type DadosFerramenta = {
  code?: string;
  nome?: string;
  category_id?: string;
  quantidade?: number | string;
  valor_unitario?: number | string;
  estado?: string;
};

/** Recusa a ferramenta nova/edição quando falta o essencial. */
export function problemaFerramenta(d: DadosFerramenta): string | null {
  if (!d.code?.trim()) return "Indica o código da ferramenta.";
  if (d.code.trim().length > 40) return "Código demasiado longo (máx. 40).";
  if (!d.nome?.trim()) return "Indica o nome da ferramenta.";
  if (d.nome.trim().length > 120) return "Nome demasiado longo (máx. 120).";
  if (!d.category_id?.trim()) return "Indica a categoria.";
  const q = Number(d.quantidade ?? 1);
  if (!Number.isFinite(q) || q < 1 || !Number.isInteger(q)) {
    return "Quantidade tem de ser um número inteiro maior ou igual a 1.";
  }
  const v = Number(d.valor_unitario ?? 0);
  if (!Number.isFinite(v) || v < 0) return "Valor unitário inválido.";
  if (d.estado && !(ESTADOS_FERRAMENTA as readonly string[]).includes(d.estado)) {
    return "Estado desconhecido.";
  }
  return null;
}

/** Recusa nomes de listas simples (ferramenteiro, categoria, departamento). */
export function problemaNomeSimples(nome: string | undefined, max = 120): string | null {
  if (!nome?.trim()) return "Indica o nome.";
  if (nome.trim().length > max) return `Nome demasiado longo (máx. ${max}).`;
  return null;
}

/** Duplicado por nome, sem acentos e sem ligar a maiúsculas. */
export function nomeDuplicado(nome: string, nomes: string[], exceto?: string): boolean {
  const alvo = nome.trim().toLowerCase();
  const alvoSemAcento = alvo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return nomes.some((n) => {
    if (n === exceto) return false;
    const limpo = n.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return limpo === alvoSemAcento;
  });
}

/** Formata MTn com agrupamento português (6451 -> "6 451,00 MTn"). */
export function fmtMTn(v: number | null | undefined): string {
  const n = Number(v) || 0;
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  const agrupado = int.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${neg ? "-" : ""}${agrupado},${dec} MTn`;
}

/* ============ Agregações do PAINEL ============ */

export type PainelStats = {
  fora: MovimentoVisao[];
  atrasadas: number;
  avariadas: number;
  danosMes: number;
  custoDanosMes: number;
  disponiveis: number;
  totalFerramentas: number;
  topEmprestadas: { label: string; count: number }[];
  topDanos: { label: string; count: number }[];
};

/** Resumo executivo do painel (KPIs + tops). `hoje` é YYYY-MM-DD. */
export function statsPainel(
  ferramentas: Ferramenta[],
  movimentos: MovimentoVisao[],
  danos: DanoVisao[],
  hoje: string
): PainelStats {
  const mes = hoje.slice(0, 7);

  const fora = movimentos
    .filter((m) => m.tipo === "emprestimo" && !m.data_devolucao)
    .sort((a, b) => (a.prazo_devolucao || "").localeCompare(b.prazo_devolucao || ""));

  const atrasadas = fora.filter((m) => estaAtrasada(m.prazo_devolucao, hoje)).length;
  const avariadas = ferramentas.filter(
    (t) => t.active && (t.estado || "").toLowerCase() === "avariado"
  ).length;

  const danosMes = danos.filter((d) => (d.created_at || "").slice(0, 7) === mes);
  const custoDanosMes = danosMes.reduce((s, d) => s + (Number(d.custo_reparacao) || 0), 0);

  const disponiveis = ferramentas.filter((t) => {
    if (!t.active) return false;
    const e = (t.estado || "").toLowerCase();
    return e !== "emprestado" && e !== "avariado" && e !== "inutilizado";
  }).length;

  const contaEmprestimos = new Map<string, number>();
  for (const m of movimentos) {
    if (m.tipo !== "emprestimo") continue;
    const chave = m.code ? `${m.code} ${m.nome || ""}`.trim() : "Desconhecida";
    contaEmprestimos.set(chave, (contaEmprestimos.get(chave) || 0) + 1);
  }
  const topEmprestadas = [...contaEmprestimos.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const contaDanos = new Map<string, number>();
  for (const d of danos) {
    const pessoa = d.colaborador || d.responsavel;
    if (!pessoa) continue;
    contaDanos.set(pessoa, (contaDanos.get(pessoa) || 0) + 1);
  }
  const topDanos = [...contaDanos.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const totalFerramentas = ferramentas.filter((t) => t.active).length;

  return {
    fora,
    atrasadas,
    avariadas,
    danosMes: danosMes.length,
    custoDanosMes,
    disponiveis,
    totalFerramentas,
    topEmprestadas,
    topDanos
  };
}

/** Devoluções com problema (desgaste OU desastre), mais recentes primeiro. */
export function devolucoesComProblema(movimentos: MovimentoVisao[], limite = 10): MovimentoVisao[] {
  return movimentos
    .filter(
      (m) =>
        m.tipo === "devolucao" &&
        m.estado_ao_voltar &&
        ((CONSERVACAO as readonly string[]).includes(m.estado_ao_voltar.toLowerCase()) ||
          geraDano(m.estado_ao_voltar))
    )
    .sort((a, b) => (b.data_devolucao || "").localeCompare(a.data_devolucao || ""))
    .slice(0, limite);
}

/* ============ Agregações do RELATÓRIO ============ */

export type RelatorioStats = {
  totalEmprestimos: number;
  totalDevolucoes: number;
  taxaNoPrazo: number;
  taxaAtraso: number;
  topFerramentas: { code: string; nome: string; count: number; ultimo: string | null }[];
  topColaboradores: { colaborador: string; departamento: string; total: number; atrasadas: number }[];
  danos: {
    total: number;
    custoTotal: number;
    leves: number;
    moderados: number;
    graves: number;
    porTipo: { tipo: string; count: number }[];
  };
  naRua: MovimentoVisao[];
  inventario: { estado: string; count: number }[];
};

/**
 * As 6 secções do relatório do período (o perído filtra data_saida dos
 * empréstimos e created_at dos danos; a lista da RUA é sempre toda a
 * gente sem devolver, corrigindo o corte que escondia atrasados antigos).
 */
export function statsRelatorio(
  movimentos: MovimentoVisao[],
  ferramentas: Ferramenta[],
  danos: DanoVisao[],
  de: string,
  ate: string
): RelatorioStats {
  const periodos = movimentos.filter((m) => {
    if (m.tipo !== "emprestimo" || !m.data_saida) return false;
    const d = m.data_saida.slice(0, 10);
    return d >= de && d <= ate;
  });

  const devolvidos = periodos.filter((m) => m.data_devolucao && m.prazo_devolucao);
  const noPrazo = devolvidos.filter(
    (m) => (m.data_devolucao || "").slice(0, 10) <= (m.prazo_devolucao || "").slice(0, 10)
  ).length;
  const atrasadas = devolvidos.length - noPrazo;
  const totalDevolvidas = devolvidos.length;
  const taxaNoPrazo = totalDevolvidas > 0 ? Math.round((noPrazo / totalDevolvidas) * 100) : 0;
  const taxaAtraso = totalDevolvidas > 0 ? Math.round((atrasadas / totalDevolvidas) * 100) : 0;

  const contaTools = new Map<string, { count: number; ultimo: string | null }>();
  for (const m of periodos) {
    const atual = contaTools.get(m.tool_id);
    contaTools.set(m.tool_id, {
      count: (atual?.count || 0) + 1,
      ultimo: !atual?.ultimo || (m.data_saida || "") > atual.ultimo ? m.data_saida : atual.ultimo
    });
  }
  const mapaTools = new Map(ferramentas.map((t) => [t.id, t]));
  const topFerramentas = [...contaTools.entries()]
    .map(([id, v]) => {
      const t = mapaTools.get(id);
      return { code: t?.code || "-", nome: t?.nome || "-", count: v.count, ultimo: v.ultimo };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const contaColabs = new Map<
    string,
    { colaborador: string; departamento: string; total: number; atrasadas: number }
  >();
  for (const m of periodos) {
    const chave = `${m.colaborador || "-"}|${m.departamento || "-"}`;
    const atual =
      contaColabs.get(chave) ||
      { colaborador: m.colaborador || "-", departamento: m.departamento || "-", total: 0, atrasadas: 0 };
    atual.total += 1;
    if (m.data_devolucao && m.prazo_devolucao) {
      if (
        (m.data_devolucao || "").slice(0, 10) > (m.prazo_devolucao || "").slice(0, 10)
      ) {
        atual.atrasadas += 1;
      }
    }
    contaColabs.set(chave, atual);
  }
  const topColaboradores = [...contaColabs.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const danosPeriodo = danos.filter((d) => {
    const dData = (d.created_at || "").slice(0, 10);
    return dData >= de && dData <= ate;
  });
  const custoTotal = danosPeriodo.reduce((s, d) => s + (Number(d.custo_reparacao) || 0), 0);
  const contaTipos = new Map<string, number>();
  for (const d of danosPeriodo) {
    const tipo = d.tipo_dano || d.estado_reportado || "Nao classificado";
    contaTipos.set(tipo, (contaTipos.get(tipo) || 0) + 1);
  }
  const porTipo = [...contaTipos.entries()]
    .map(([tipo, count]) => ({ tipo, count }))
    .sort((a, b) => b.count - a.count);

  const naRua = movimentos
    .filter((m) => m.tipo === "emprestimo" && !m.data_devolucao)
    .sort((a, b) => (a.data_saida || "").localeCompare(b.data_saida || ""));

  const contaEstados = new Map<string, number>();
  for (const t of ferramentas) {
    if (!t.active) continue;
    const e = (t.estado || "sem estado").toLowerCase();
    contaEstados.set(e, (contaEstados.get(e) || 0) + 1);
  }
  const inventario: { estado: string; count: number }[] = ESTADOS_FERRAMENTA.filter((e) =>
    contaEstados.has(e)
  ).map((e) => ({
    estado: e as string,
    count: contaEstados.get(e) as number
  }));
  const outros = contaEstados.size - inventario.length;
  if (outros > 0) {
    inventario.push({
      estado: "sem estado",
      count: [...contaEstados.entries()]
        .filter(([e]) => !(ESTADOS_FERRAMENTA as readonly string[]).includes(e))
        .reduce((s, [, c]) => s + c, 0)
    });
  }

  return {
    totalEmprestimos: periodos.length,
    totalDevolucoes: totalDevolvidas,
    taxaNoPrazo,
    taxaAtraso,
    topFerramentas,
    topColaboradores,
    danos: {
      total: danosPeriodo.length,
      custoTotal,
      leves: danosPeriodo.filter((d) => (d.severidade || "").toLowerCase() === "leve").length,
      moderados: danosPeriodo.filter((d) => (d.severidade || "").toLowerCase() === "moderado").length,
      graves: danosPeriodo.filter((d) => (d.severidade || "").toLowerCase() === "grave").length,
      porTipo
    },
    naRua,
    inventario
  };
}

/* ============ CSV ============ */

/** CSV (com BOM) dos movimentos do período, para o Excel da casa. */
export function csvMovimentos(linhas: MovimentoVisao[]): string {
  const cab = [
    "Tipo",
    "Codigo",
    "Ferramenta",
    "Colaborador",
    "Departamento",
    "OS",
    "Equipamento",
    "Estado ao sair",
    "Estado ao voltar",
    "Entregue por",
    "Recebido por",
    "Data saida",
    "Prazo",
    "Data devolucao",
    "Observacoes"
  ];
  const corpo = linhas.map((m) => [
    m.tipo,
    m.code || "",
    m.nome || "",
    m.colaborador || "",
    m.departamento || "",
    m.os_id || "",
    m.equipamento_id || "",
    m.estado_ao_sair || "",
    m.estado_ao_voltar || "",
    m.entregue_por || "",
    m.recebido_por || "",
    (m.data_saida || "").slice(0, 10),
    (m.prazo_devolucao || "").slice(0, 10),
    (m.data_devolucao || "").slice(0, 10),
    m.observacoes_devolucao || m.observacoes_saida || ""
  ]);
  return paraCSVLocal(cab, corpo);
}

/** CSV simples com BOM e escapes (mesma receita do uso-comum, local puro). */
function paraCSVLocal(cab: string[], linhas: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = String(v ?? "");
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const linhasCSV = [cab, ...linhas].map((l) => l.map(esc).join(";")).join("\r\n");
  return "\uFEFF" + linhasCSV;
}

/* ============ Hoje de Maputo (fuso da casa) ============ */

/** Data de hoje em Maputo (UTC+2), a mesma do resto do portal. */
export function hojeFerr(): string {
  return hojeMaputo();
}
