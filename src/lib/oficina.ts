/**
 * oficina.ts - Tipos, constantes e helpers do módulo Oficina.
 *
 * Ficheiro partilhado entre SERVIDOR e NAVEGADOR (não importa nada do
 * servidor). Os nomes de estados, sectores e as regras de cálculo são
 * os mesmos do hub original (oficina/*.html), para o trabalho diário
 * continuar igual - só que mais rápido e protegido no servidor.
 */

/* ============ Tipos vindos da base de dados ============ */

export type Equipamento = {
  id: number;
  code: string;
  name?: string | null;
  model?: string | null;
  fleet_type?: string | null;
  group_name?: string | null;
  year_acquired?: number | null;
  year_decommissioned?: number | null;
  active: boolean;
};

export type CategoriaEquip = {
  id: number;
  nome: string;
  ativo: boolean;
};

export type GrupoEquip = {
  id: number;
  nome: string;
  categoria_id: number;
  ativo: boolean;
};

export type OrdemServico = {
  id: number;
  numero_obra?: string | null;
  equipment_id: number;
  data_abertura?: string | null;
  data_fecho?: string | null;
  status_atual: string;
  status_fisico?: string | null;
  aberto_por?: string[] | null;
  observacoes?: string | null;
  descricao_avaria?: string | null;
  hora_equipamento?: number | null;
  unidade_medida?: string | null;
  tipo_intervencao?: string[] | null;
  sector?: string | null;
  nome_cliente?: string | null;
  criado_em?: string;
  atualizado_em?: string;
};

export type LogEstado = {
  id: number;
  os_id: number;
  status_anterior?: string | null;
  status_novo: string;
  data_mudanca: string;
  responsavel?: string | null;
  observacao?: string | null;
};

export type LogFisico = {
  id: number;
  os_id: number;
  status_fisico: string;
  data_mudanca: string;
};

export type ColaboradorLinha = {
  id: number;
  name: string;
  code?: string | null;
  setor?: string | null;
};

export type Intervencao = {
  id: number;
  os_id: number;
  equipment_id: number;
  shift_date?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  hours?: number | null;
  description?: string | null;
  status?: string | null;
  /** Preenchido pelo servidor: técnicos ligados via record_collaborators */
  tecnicos?: { id: number; name: string; code?: string | null }[];
  /** Sectores únicos dos técnicos (servidor calcula) */
  setores?: string[];
};

export type PecaOS = {
  id: number;
  os_id: number;
  peca: string;
  data?: string | null;
  quantidade?: number | null;
  unidade?: string | null;
  colaborador?: string | null;
  material_id?: string | null;
  stock_movimento_id?: string | null;
};

export type TemplateChecklist = {
  id: number;
  categoria_equipamento: string;
  nome: string;
  tipo: string; // mecanica | eletrica | diario
  intervalo_horas?: number | null;
  intervalo_label?: string | null;
  ref_versao?: string | null;
  ativo: boolean;
};

export type SecaoTemplate = {
  id: number;
  template_id: number;
  nome_secao: string;
  ordem: number;
};

export type ItemTemplate = {
  id: number;
  secao_id: number;
  numero_item?: number | null;
  descricao: string;
  ordem: number;
  // NOTA: a tabela real não tem coluna "ativo" nem "template_id"
  // (colunas reais: id, secao_id, numero_item, descricao, ordem).
};

export type ChecklistPreenchido = {
  id: number;
  os_id?: number | null;
  template_id: number;
  equipment_id?: number | null;
  numero_obra?: string | null;
  horas_equipamento?: number | null;
  data_revisao?: string | null;
  horas_trabalho?: number | null;
  folha_numero?: string | null;
  executante?: string | null;
  encarregado?: string | null;
  /** Datas de assinatura gravadas quando o nome é preenchido (impresso). */
  executante_data?: string | null;
  encarregado_data?: string | null;
  observacoes_gerais?: string | null;
  substituido?: boolean;
};

export type ItemPreenchido = {
  id: number;
  checklist_id: number;
  template_item_id: number;
  executado?: "sim" | "nao" | null;
  estado?: "bom" | "danificado" | null;
  observacao?: string | null;
};

export type TrocaRevisao = {
  id: number;
  os_id: number;
  template_anterior_nome?: string | null;
  template_novo_nome?: string | null;
  motivo: string;
  responsavel?: string | null;
  criado_em?: string;
};

/* ============ Faturação CdM (obras fechadas) ============ */

/** Um material usado no fecho (Oxigênio, Gas Propano, Gas Acetileno, ...). */
export type MaterialFecho = {
  id?: number;
  fecho_id?: number;
  material: string;
  quantidade: number;
  valor_unitario: number;
  total: number;
};

/** O fecho de uma obra que foi facturada à CdM. */
export type ObraFechada = {
  id: number;
  os_id: number;
  data_fecho: string;
  horas_cdm: number;
  valor_hora: number;
  total_mao_obra: number;
  total_material: number;
  total_geral: number;
  responsavel?: string | null;
  observacao?: string | null;
  criado_em?: string;
};

/** Linha do módulo Faturação: o fecho + tudo o que o servidor calcula. */
export type LinhaFaturacao = ObraFechada & {
  // da obra / máquina
  numero_obra?: string | null;
  equipment_id?: number | null;
  equip_code?: string | null;
  sector?: string | null;
  data_abertura?: string | null;
  diagnostico?: string | null; // descricao_avaria da obra (Diagnóstico / Avaria / Motivo de Entrada)
  // calculado pelo servidor
  horas_nossas: number; // soma das horas das intervenções (records)
  data_ultima_intervencao?: string | null;
  dias_ate_fecho: number; // data_fecho - data_abertura
  dias_apos_trabalho: number; // data_fecho - última intervenção
  diferenca_horas: number; // horas_cdm - horas_nossas
  materiais: MaterialFecho[];
};

export type ResumoMes = {
  mes: string; // "2026-01"
  obras: number;
  horas_cdm: number;
  horas_nossas: number;
  total_material: number;
  total_geral: number;
};

/** Os materiais que a CdM factura mais vezes (sugestões do campo). */
export const MATERIAIS_FECHO = [
  "Oxigênio",
  "Gas Propano",
  "Gas Acetileno"
] as const;

/* ============ Tabela de Preços (catálogo da faturação) ============ */

/** Um preço unitário registado nas Configurações da Oficina. */
export type PrecoCatalogo = {
  id: number;
  tipo: "mao_obra" | "material";
  nome: string;
  unidade: "hora" | "un" | "kg" | "lt" | string;
  valor: number;
  criado_em?: string;
  actualizado_em?: string;
};

/** Rótulos dos tipos de preço. */
export const TIPOS_PRECO = {
  mao_obra: "Mão de obra",
  material: "Material"
} as const;

/** Rótulos das unidades de preço (aceita qualquer valor vindo da base). */
export const UNIDADES_PRECO: Record<string, string> = {
  hora: "hora",
  un: "unidade",
  kg: "kg",
  lt: "litro"
};

/* ============ Constantes de negócio (iguais ao hub) ============ */

export const ESTADOS_FISICO = [
  "Avariada",
  "Acidentada",
  "Pneumático",
  "Revisão/Manutenção",
  "Inspeção",
  "Aguarda Acessório",
  "Concluído"
];

export const ESTADOS_WORKFLOW = [
  "Aberta (DTEC)",
  "Supervisão",
  "Chefe da Oficina",
  "Departamento Técnico",
  "CdM",
  "Fechada"
];

export const PRIORIDADE_FISICO = [
  "Acidentada",
  "Avariada",
  "Pneumático",
  "Aguarda Acessório",
  "Revisão/Manutenção",
  "Inspeção",
  "Concluído"
];

export const SECTORES = [
  "Elétrica",
  "Mecânica",
  "Serralharia",
  "Pneumática",
  "Lubrificação",
  "Piquete",
  "Máquinas e Ferramentas"
];

export const TIPOS_INTERVENCAO = [
  "Inspeção Geral",
  "Reparação Pneus",
  "Lubrificação",
  "Rep. Sis. Mecânico",
  "Rep. Sis. Hidráulico",
  "Rep. Sis. Elétrico",
  "Revisão",
  "Rep. Estrutura",
  "Outros"
];

export const UNIDADES_PECA = [
  "Unidade",
  "Litro",
  "Kg",
  "Metro",
  "Caixa",
  "Par",
  "Rolo"
];

/**
 * Classe Tailwind da etiqueta de cada estado físico (2 temas).
 *
 * Sistema semântico único do portal (Grelha, Painel, Oficina e legenda do
 * gráfico partilham exactamente as mesmas cores): a cor identifica o estado
 * à primeira vista, na ordem da legenda do Power BI do Director.
 * Cada estado tem a sua cor, sem repetições nem tons parecidos.
 * As etiquetas e as células da Grelha usam a COR CHEIA (a mesma do gráfico
 * do Painel), visível em claro e escuro, com o texto em --sobre-* garantido
 * por cima da cor.
 */
export const COR_FISICO: Record<string, string> = {
  Disponível: "bg-sucesso text-sobre-sucesso",
  Avariada: "bg-erro text-sobre-erro",
  Acidentada: "bg-aviso text-sobre-aviso",
  Pneumático: "bg-roxo text-sobre-roxo",
  "Revisão/Manutenção": "bg-ambar text-sobre-ambar",
  Inspeção: "bg-rosa text-sobre-rosa",
  "Aguarda Acessório": "bg-info text-sobre-info",
  Concluído: "bg-sucesso text-sobre-sucesso"
};

export const COR_ESTADO: Record<string, string> = {
  "Aberta (DTEC)": "bg-info-bg text-info",
  Supervisão: "bg-ambar-claro text-ambar-texto",
  "Chefe da Oficina": "bg-ambar-claro text-ambar-texto",
  "Departamento Técnico": "bg-info-bg text-info",
  CdM: "bg-ambar-claro text-ambar-texto",
  Fechada: "bg-sucesso-bg text-sucesso"
};

/* ============ Checklist: regras partilhadas (servidor e testes) ============ */

/**
 * Filtro PostgREST para linhas de resposta com conteúdo real.
 *
 * Quando alguém clica "Sim" e depois despista o botão, a linha da
 * resposta fica com tudo NULL - e não conta como "respondido". Sem
 * este filtro, essas linhas vazias bloqueavam para sempre a apagagem
 * de itens e secções do template.
 */
export const FILTRO_ITEM_RESPONDIDO =
  "or=(executado.neq.null,estado.neq.null,observacao.neq.null)";

/**
 * Data de assinatura do Executante / Encarregado do checklist.
 *
 * - Nome mudou e ficou preenchido -> data de hoje (gravada no impresso);
 * - Nome mudou e ficou vazio -> sem data;
 * - Nome igual ao que já estava -> mantém a data anterior.
 *
 * Pura: recebe "hoje" em AAAA-MM-DD (o chamador usa dataHojeISO()).
 */
export function proximaDataAssinatura(
  nomeNovo: string | null | undefined,
  nomeAntigo: string | null | undefined,
  dataAnterior: string | null | undefined,
  hoje: string
): string | null {
  const novo = (nomeNovo || "").trim();
  const antigo = (nomeAntigo || "").trim();
  if (novo === antigo) return dataAnterior || null;
  return novo ? hoje : null;
}

/* ============ Helpers de data e cálculo (iguais ao hub) ============ */

/** Data de hoje em AAAA-MM-DD (na hora de Maputo). */
export function dataHojeISO(): string {
  const agora = new Date();
  const mapa = new Date(agora.getTime() + 2 * 3600 * 1000);
  return mapa.toISOString().slice(0, 10);
}

/** Mostra AAAA-MM-DD como DD/MM/AAAA. */
export function formatarData(s?: string | null): string {
  if (!s) return "-";
  const parte = String(s).slice(0, 10);
  const [a, m, d] = parte.split("-");
  if (!a || !m || !d) return parte;
  return `${d}/${m}/${a}`;
}

export function formatarDataHora(s?: string | null): string {
  if (!s) return "-";
  const data = formatarData(s);
  const hora = String(s).slice(11, 16);
  return hora ? `${data} ${hora}` : data;
}

/** Número inteiro de dias desde uma data até hoje. */
export function diasDesde(s?: string | null): number {
  if (!s) return 0;
  const partes = String(s).slice(0, 10).split("-").map(Number);
  if (partes.length < 3) return 0;
  const d = new Date(partes[0], partes[1] - 1, partes[2]);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - d.getTime()) / 86400000);
}

/** Horas entre início e fim, descontando o intervalo de almoço 12h-13h. */
export function calcularHorasExcluindoAlmoco(inicio: string, fim: string): number {
  const [h1, m1] = inicio.split(":").map(Number);
  const [h2, m2] = fim.split(":").map(Number);
  const ini = h1 * 60 + m1;
  let fimM = h2 * 60 + m2;
  if (fimM <= ini) fimM += 24 * 60; // atravessa a meia-noite
  let totalMin = fimM - ini;
  const almocoIni = 12 * 60;
  const almocoFim = 13 * 60;
  const overlap = Math.max(0, Math.min(fimM, almocoFim) - Math.max(ini, almocoIni));
  totalMin -= overlap;
  return totalMin / 60;
}

/** Arredonda para o inteiro: minutos >= 30 sobem. */
export function arredondarHoras(horasDecimal: number): number {
  const horas = Math.floor(horasDecimal);
  const minutos = (horasDecimal - horas) * 60;
  return minutos >= 30 ? horas + 1 : horas;
}

/**
 * Estado físico efectivo de um equipamento, dado o conjunto de obras
 * abertas (não fechadas e não em CdM, como no dashboard do hub).
 * Sem obra aberta = Disponível; com obras, o pior estado ganha.
 */
export function estadoDoEquip(
  equipId: number,
  obrasAbertas: OrdemServico[]
): string {
  const minhas = obrasAbertas.filter((o) => o.equipment_id === equipId);
  if (!minhas.length) return "Disponível";
  let melhorIdx = 999;
  let estado = "Concluído";
  minhas.forEach((o) => {
    const idx = PRIORIDADE_FISICO.indexOf(o.status_fisico || "");
    if (idx !== -1 && idx < melhorIdx) {
      melhorIdx = idx;
      estado = o.status_fisico || "Concluído";
    }
  });
  return estado;
}

/** Obras "na oficina" = nem Fechada nem CdM. */
export function eObraNaOficina(o: OrdemServico): boolean {
  return o.status_atual !== "Fechada" && o.status_atual !== "CdM";
}

/** Corte de segurança para texto comprido nas tabelas. */
export function truncar(t: string | null | undefined, n = 50): string {
  if (!t) return "-";
  return t.length > n ? t.slice(0, n) + "..." : t;
}
