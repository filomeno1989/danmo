/**
 * hst.ts - Cérebro do módulo Portal HST (Higiene e Segurança no Trabalho).
 *
 * Migração do hub antigo (hst/*.html, 10 páginas) com melhorias de
 * analista. Funções PURAS aqui: correm no servidor (API, provas) e no
 * navegador (ecrãs) sem importar React nem next.
 *
 * Correcções de fundo em relação ao hub (o juiz vive AQUI, partilhado):
 * - o NÚMERO do acidente (DAN-HST-AAAA-NNN) passa a ser decidido no
 *   SERVIDOR; o hub calculava no navegador, o mesmo defeito da corrida
 *   que duplicou a fatura 002/26;
 * - o acidente ganha INVESTIGAÇÃO EDITÁVEL: o hub prometia "preencher
 *   após investigação" mas não tinha edição nenhuma, e o status ficava
 *   "Em Investigação" para sempre (confirmado na base: as 4 linhas);
 * - a ENTREGA de EPI baixa o stock no SERVIDOR (o hub gravava a entrega
 *   e o stock ficava intocado para sempre);
 * - o CLASSIFICADOR de tensão arterial segue a cascata OMS/ESH correcta:
 *   o hub põe "Limítrofe" numa sistólica de 150 (HTA Grau 1) porque a
 *   comparação com "||" deixa a diastólica baixa arrastar a sistólica
 *   alta para baixo. A categoria correcta vem SEMPRE do pior dos dois
 *   valores, como manda a tabela de referência;
 * - os nomes (colaborador, EPI) são resolvidos pela BASE no servidor,
 *   nunca copiados do navegador.
 *
 * As 6 tabelas (hst_acidentes, hst_acoes_corretivas, hst_areas_risco,
 * hst_epis, hst_epi_entregas, hst_medicoes_tensao) já existem na base
 * com dados reais: nenhum SQL novo nesta fase. A hst_acidentes carrega
 * colunas da era antiga (danmo-hst) ao lado das da era hub; as linhas
 * antigas (com collaborator_id e sem nome) são resolvidas pelo
 * servidor contra a tabela collaborators antes de chegar ao ecrã.
 */

/* ============ Tipos ============ */

/** Acidente/incidente gravado em hst_acidentes (esquema misto). */
export type AcidenteHST = {
  id: number;
  // Era hub (o módulo usa estas)
  numero: string | null;
  status: string | null;
  colaborador_nome: string | null;
  colaborador_id: number | null;
  area_risco_id: number | null;
  area_risco_nome: string | null;
  data_hora: string | null;
  tipo_ocorrencia: string | null;
  tipo_lesao: string | null;
  parte_corpo: string | null;
  dias_afastamento: number | null;
  gerou_atestado: boolean | null;
  numero_atestado: string | null;
  testemunhas: string | null;
  causa_raiz: string | null;
  fator_humano: string | null;
  fator_ambiental: string | null;
  fator_equipamento: string | null;
  registrado_por: string | null;
  // Era antiga (danmo-hst): lidas com carinho, nunca apagadas
  collaborator_id: number | null;
  data_acidente: string | null;
  hora_acidente: string | null;
  gravidade: string | null;
  dias_baixa: number | null;
  zona: string | null;
  local: string | null;
  tipo_acidente: string | null;
  encaminhado_para: string | null;
  epi_usado: string | null;
  registado_por: string | null; // gravação da era antiga (registrado_por é a da era hub)
  // Comum
  descricao: string | null;
  created_at?: string;
};

/** Acidente como o ecrã recebe: nome e data JÁ resolvidos pelo servidor. */
export type AcidenteVisao = AcidenteHST & {
  nomeDisplay: string;
  dataDisplay: string; // ISO da data/hora do evento (hub ou antiga)
  eAntigo: boolean; // linha da era danmo-hst (mostra nota de origem)
};

/** Acção correctiva de hst_acoes_corretivas. */
export type AccaoHST = {
  id: number;
  acidente_id: number;
  descricao_acao: string;
  responsavel: string;
  prazo: string; // YYYY-MM-DD
  status: string | null; // Pendente | Em Andamento | Concluida
  data_conclusao: string | null;
  observacoes: string | null;
  created_at?: string;
};

/** Área de risco de hst_areas_risco. */
export type AreaRiscoHST = {
  id: number;
  nome: string;
  nivel_risco: string; // Baixo | Medio | Alto | Critico
  descricao: string | null;
  medidas_controlo: string | null;
  ativo: boolean | null;
  created_at?: string;
};

/** EPI do catálogo de hst_epis. */
export type EpiHST = {
  id: number;
  nome: string;
  ca: string | null;
  stock_atual: number | null;
  descricao: string | null;
  ativo: boolean | null;
  created_at?: string;
};

/** Entrega de EPI de hst_epi_entregas. */
export type EntregaEpiHST = {
  id: number;
  colaborador_nome: string;
  colaborador_id?: number | null;
  epi_id: number;
  epi_nome: string;
  quantidade: number | null;
  observacoes: string | null;
  data_entrega: string | null;
  created_at?: string;
};

/** Medição de tensão arterial de hst_medicoes_tensao. */
export type MedicaoTensaoHST = {
  id: number;
  colaborador_nome: string;
  colaborador_id?: number | null;
  sistolica: number;
  diastolica: number;
  frequencia_cardiaca: number | null;
  classificacao: string | null;
  medido_por: string | null;
  observacoes: string | null;
  data_medicao: string | null;
  created_at?: string;
};

/** Colaborador leve (datalist + resolução de linhas antigas). */
export type ColaboradorHST = {
  id: number;
  name: string | null;
  code: string | null;
  active: boolean | null;
};

/* ============ Vocabulário do módulo ============ */

export const STATUS_ACIDENTE = ["Em Investigacao", "Investigado", "Encerrado"] as const;
export const TIPOS_OCORRENCIA = [
  "Acidente com Afastamento",
  "Acidente sem Afastamento",
  "Incidente",
  "Doenca Ocupacional"
] as const;
export const NIVEIS_RISCO = ["Baixo", "Medio", "Alto", "Critico"] as const;
export const STATUS_ACCAO = ["Pendente", "Em Andamento", "Concluida"] as const;

export const ORDEM_RISCO: Record<string, number> = {
  Critico: 0,
  Alto: 1,
  Medio: 2,
  Baixo: 3
};

/* ============ Números (DAN-HST-AAAA-NNN) ============ */

/** Formato do papel: DAN-HST-2026-001. */
export function numeroFmtHst(ano: number, numero: number): string {
  return `DAN-HST-${ano}-${String(numero).padStart(3, "0")}`;
}

/** Extrai o ano e o número de um "DAN-HST-2026-001" (ou null). */
export function partirNumeroHst(numero: string | null | undefined): { ano: number; seq: number } | null {
  const m = /^DAN-HST-(\d{4})-(\d{1,})$/.exec(String(numero || ""));
  if (!m) return null;
  return { ano: Number(m[1]), seq: Number(m[2]) };
}

/**
 * Próximo número do ano: o MAIOR entre o último gravado nesse ano e o
 * próprio último (nunca reusa). Corre no SERVIDOR: o hub calculava no
 * navegador e duas gravações ao mesmo tempo nasciam iguais.
 */
export function proximoNumeroHst(ano: number, ultimoGravadoNoAno: number | undefined): number {
  const maior = ultimoGravadoNoAno || 0;
  return Math.max(maior + 1, 1);
}

/* ============ Classificação de tensão (OMS/ESH) ============ */

export type ClassificacaoTensao = {
  texto: string;
  cls: "normal" | "limitrofe" | "alta";
};

/**
 * Cascata correcta: a categoria é decidida pelo PIOR dos dois valores.
 * O hub com "||" dentro de ifs encadeados classificava 150/70 (HTA
 * Grau 1) como "Limítrofe", porque 70 < 90 dá verdade antes de olhar
 * para a sistólica. Referência OMS/ESH:
 * Ótima <120 e <80; Normal <130/85; Limítrofe 130-139 ou 85-89;
 * Grau 1 140-159 ou 90-99; Grau 2 160-179 ou 100-109; Grau 3 >=180 ou >=110.
 */
export function classificarTensao(sys: number, dia: number): ClassificacaoTensao {
  if (sys >= 180 || dia >= 110) return { texto: "HTA Grau 3", cls: "alta" };
  if (sys >= 160 || dia >= 100) return { texto: "HTA Grau 2", cls: "alta" };
  if (sys >= 140 || dia >= 90) return { texto: "HTA Grau 1", cls: "alta" };
  if (sys >= 130 || dia >= 85) return { texto: "Limítrofe", cls: "limitrofe" };
  if (sys >= 120 || dia >= 80) return { texto: "Normal", cls: "normal" };
  return { texto: "Ótima", cls: "normal" };
}

/** Verdadeiro quando a medição é hipertensão (qualquer grau). */
export function eHta(sys: number, dia: number): boolean {
  return classificarTensao(sys, dia).cls === "alta";
}

/** Limites aceites no formulário (igual ao hub: sistólica 60-260, diastólica 40-160). */
export function problemaValoresTensao(sys: number, dia: number, fc: number | null): string | null {
  if (!Number.isFinite(sys) || !Number.isFinite(dia)) return "Preenche sistólica e diastólica.";
  if (sys < 60 || sys > 260) return "Sistólica fora dos limites (60 a 260 mmHg).";
  if (dia < 40 || dia > 160) return "Diastólica fora dos limites (40 a 160 mmHg).";
  if (dia >= sys) return "A diastólica tem de ser menor que a sistólica.";
  if (fc != null && (fc < 30 || fc > 220)) return "Frequência cardíaca fora dos limites (30 a 220 bpm).";
  return null;
}

/* ============ Juízes de validação (editor + API) ============ */

/** Campos que o editor de acidente manda (novo ou investigação). */
export type DadosAcidente = {
  colaborador_nome: string;
  data_hora: string; // datetime-local (YYYY-MM-DDTHH:mm)
  tipo_ocorrencia: string;
  area_risco_id: number | null;
  tipo_lesao: string;
  parte_corpo: string;
  dias_afastamento: number;
  gerou_atestado: boolean;
  numero_atestado: string;
  testemunhas: string;
  descricao: string;
  // Investigação (editável a partir do 2o passo)
  status?: string;
  causa_raiz?: string;
  fator_humano?: string;
  fator_ambiental?: string;
  fator_equipamento?: string;
};

/** Juiz do acidente: devolve o texto do problema ou null. */
export function problemaAcidente(d: Partial<DadosAcidente>): string | null {
  if (!d.colaborador_nome?.trim()) return "Indica o colaborador acidentado.";
  if (!d.data_hora?.trim()) return "Indica a data e a hora do evento.";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(d.data_hora.trim())) {
    return "Data e hora do evento inválidas.";
  }
  if (!d.tipo_ocorrencia?.trim()) return "Selecciona o tipo de ocorrência.";
  if (!TIPOS_OCORRENCIA.includes(d.tipo_ocorrencia.trim() as (typeof TIPOS_OCORRENCIA)[number])) {
    return "Tipo de ocorrência desconhecido.";
  }
  if (!d.descricao?.trim()) return "Descreve o que aconteceu.";
  if (d.status != null && d.status !== "" &&
      !STATUS_ACIDENTE.includes(d.status as (typeof STATUS_ACIDENTE)[number])) {
    return "Status desconhecido.";
  }
  if (d.gerou_atestado && !d.numero_atestado?.trim() && d.status === "Encerrado") {
    return "Indica o número do atestado (ou marca que não gerou atestado).";
  }
  return null;
}

/** Juiz da acção correctiva. */
export function problemaAccao(a: {
  descricao_acao?: string;
  responsavel?: string;
  prazo?: string;
}): string | null {
  if (!a.descricao_acao?.trim()) return "Descreve a acção a tomar.";
  if (!a.responsavel?.trim()) return "Indica o responsável.";
  if (!a.prazo?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(a.prazo.trim())) {
    return "Indica o prazo (data).";
  }
  return null;
}

/** Juiz da área de risco. */
export function problemaArea(a: { nome?: string; nivel_risco?: string }): string | null {
  if (!a.nome?.trim()) return "Indica o nome da área.";
  if (!NIVEIS_RISCO.includes((a.nivel_risco || "") as (typeof NIVEIS_RISCO)[number])) {
    return "Nível de risco desconhecido.";
  }
  return null;
}

/** Juiz do EPI. */
export function problemaEpi(e: { nome?: string; stock_atual?: number }): string | null {
  if (!e.nome?.trim()) return "Indica o nome do EPI.";
  if (e.stock_atual != null && (!Number.isFinite(e.stock_atual) || e.stock_atual < 0)) {
    return "O stock não pode ser negativo.";
  }
  return null;
}

/** Juiz da entrega de EPI. */
export function problemaEntrega(e: {
  colaborador_nome?: string;
  epi_id?: number | null;
  quantidade?: number;
}): string | null {
  if (!e.colaborador_nome?.trim()) return "Indica o colaborador.";
  if (!e.epi_id) return "Selecciona o EPI entregue.";
  if (!Number.isFinite(Number(e.quantidade)) || !(Number(e.quantidade) > 0)) {
    return "A quantidade tem de ser maior que zero.";
  }
  return null;
}

/* ============ Resolução de linhas antigas ============ */

/**
 * O ecrã recebe o acidente já "vestido": nome e data resolvem as duas
 * eras. Linhas da era danmo-hst (sem numero, com collaborator_id) usam
 * o nome resolvido na base pelo servidor e a data do campo antigo.
 */
export function vestirAcidente(
  a: AcidenteHST,
  nomesPorId: Record<number, string>
): AcidenteVisao {
  const eAntigo = !a.numero && (a.data_acidente != null || a.collaborator_id != null);
  const nome =
    a.colaborador_nome?.trim() ||
    (a.collaborator_id != null ? nomesPorId[a.collaborator_id] || "" : "") ||
    (a.registado_por || "") ||
    "";
  const data = a.data_hora || (a.data_acidente ? `${a.data_acidente}T${a.hora_acidente || "00:00"}` : "");
  const afastamento = a.dias_afastamento ?? a.dias_baixa ?? 0;
  const tipo = a.tipo_ocorrencia || (a.tipo_acidente ? `Incidente (${a.tipo_acidente})` : "Incidente");
  return {
    ...a,
    nomeDisplay: nome || "Sem nome",
    dataDisplay: data,
    eAntigo,
    dias_afastamento: afastamento,
    tipo_ocorrencia: tipo
  };
}

/* ============ Painel: KPIs, alertas, gráficos ============ */

/** Verdadeiro quando o prazo da acção passou e ela não está concluída. */
export function accaoAtrasada(a: AccaoHST, hojeISO: string): boolean {
  if (a.status === "Concluida") return false;
  const prazo = String(a.prazo || "").slice(0, 10);
  return Boolean(prazo) && prazo < hojeISO;
}

/** KPIs do topo do Painel HST (todos derivados, função pura). */
export function statsPainelHst(
  acidentes: AcidenteVisao[],
  entregas: EntregaEpiHST[],
  medicoes: MedicaoTensaoHST[],
  areas: AreaRiscoHST[],
  hoje: string // YYYY-MM-DD
) {
  const mes = hoje.slice(0, 7);
  const noMes = (iso: string | null | undefined) => String(iso || "").slice(0, 10).slice(0, 7) === mes;

  const accMes = acidentes.filter((a) => noMes(a.dataDisplay));
  const emInvestigacao = acidentes.filter((a) => a.status === "Em Investigacao");
  const entregasMes = entregas.filter((e) => noMes(e.data_entrega));
  const medicoesMes = medicoes.filter((m) => noMes(m.data_medicao));
  const areasAtivas = areas.filter((a) => a.ativo !== false);

  // Última medição por colaborador: quem está com HTA agora.
  const ultima: Record<string, MedicaoTensaoHST> = {};
  for (const m of medicoes) {
    const nome = m.colaborador_nome || "";
    if (!ultima[nome] || String(m.data_medicao) > String(ultima[nome].data_medicao)) {
      ultima[nome] = m;
    }
  }
  const colabsHta = Object.values(ultima).filter((m) => eHta(m.sistolica, m.diastolica));

  return {
    acidentesMes: accMes.length,
    emInvestigacao: emInvestigacao.length,
    entregasMes: entregasMes.length,
    medicoesMes: medicoesMes.length,
    areasAtivas: areasAtivas.length,
    colabsHta: colabsHta.length,
    colabsHtaLista: colabsHta.map((m) => ({
      nome: m.colaborador_nome,
      data_medicao: m.data_medicao,
      sistolica: m.sistolica,
      diastolica: m.diastolica,
      classificacao: classificarTensao(m.sistolica, m.diastolica)
    }))
  };
}

/** Alertas do painel (HTA, acções atrasadas, áreas críticas). */
export function alertasPainelHst(
  medicoes: MedicaoTensaoHST[],
  acoes: AccaoHST[],
  areas: AreaRiscoHST[],
  hoje: string
): { nivel: "erro" | "aviso" | "ok"; texto: string; badge: string }[] {
  const lista: { nivel: "erro" | "aviso" | "ok"; texto: string; badge: string }[] = [];
  const stats = statsPainelHst([], [], medicoes, areas, hoje);

  if (stats.colabsHta > 0) {
    lista.push({
      nivel: "erro",
      texto: `${stats.colabsHta} colaborador(es) com tensão alta (HTA) na última medição`,
      badge: "Urgente"
    });
  }
  const atrasadas = acoes.filter((a) => accaoAtrasada(a, hoje));
  if (atrasadas.length > 0) {
    lista.push({
      nivel: "aviso",
      texto: `${atrasadas.length} acção(ões) correctiva(s) com prazo ultrapassado`,
      badge: "Atrasada"
    });
  }
  const criticas = areas.filter((a) => a.ativo !== false && a.nivel_risco === "Critico");
  if (criticas.length > 0) {
    lista.push({
      nivel: "aviso",
      texto: `${criticas.length} área(s) de risco crítico activa(s)`,
      badge: "Atenção"
    });
  }
  if (!lista.length) {
    lista.push({ nivel: "ok", texto: "Sem alertas activos. Tudo em ordem.", badge: "OK" });
  }
  return lista;
}

/** Contagem de acidentes por tipo de ocorrência (gráfico do painel). */
export function acidentesPorTipo(acidentes: AcidenteVisao[]): { label: string; count: number }[] {
  const contagem: Record<string, number> = {};
  for (const a of acidentes) {
    const chave = a.tipo_ocorrencia || "Sem tipo";
    contagem[chave] = (contagem[chave] || 0) + 1;
  }
  return Object.entries(contagem)
    .map(([label, count]) => ({ label, count }))
    .sort((x, y) => y.count - x.count);
}

/** Contagem de áreas activas por nível de risco (gráfico do painel). */
export function areasPorNivel(areas: AreaRiscoHST[]): { label: string; count: number; cls: string }[] {
  const ativas = areas.filter((a) => a.ativo !== false);
  const contagem: Record<string, number> = {};
  for (const a of ativas) {
    const chave = a.nivel_risco || "Sem nível";
    contagem[chave] = (contagem[chave] || 0) + 1;
  }
  const cls: Record<string, string> = {
    Critico: "bg-red-600",
    Alto: "bg-amber-500",
    Medio: "bg-sky-500",
    Baixo: "bg-emerald-500"
  };
  return Object.entries(contagem)
    .map(([label, count]) => ({ label, count, cls: cls[label] || "bg-slate-400" }))
    .sort((x, y) => (ORDEM_RISCO[x.label] ?? 9) - (ORDEM_RISCO[y.label] ?? 9));
}

/* ============ Formatação ============ */

/** ISO -> DD/MM/YYYY (com hora quando pedido). Fuso do servidor; o ecrã corta o que não usa. */
export function fmtDataHst(iso: string | null | undefined, comHora = false): string {
  if (!iso) return "-";
  const s = String(iso);
  if (s.length < 10) return s;
  const [ano, mes, dia] = s.slice(0, 10).split("-");
  const hora = s.length >= 16 ? s.slice(11, 16) : "";
  return comHora && hora ? `${dia}/${mes}/${ano} ${hora}` : `${dia}/${mes}/${ano}`;
}

/** Nome do mês em português (resumo mensal). */
export const MESES_HST = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

/** Alvo de pesquisa sem acentos (número, colaborador, área, descrição). */
import { semAcentos } from "./uso-comum";
export { semAcentos };

export function alvoPesquisaAcidente(a: AcidenteVisao): string {
  return semAcentos(
    [a.numero || "", a.nomeDisplay, a.area_risco_nome || "", a.descricao || "",
     a.tipo_ocorrencia || "", a.tipo_lesao || ""].join(" ")
  );
}

/* ============ Resumo mensal (impresso) ============ */

/** Linhas do quadro de indicadores do resumo mensal (função pura, provada). */
export function indicadoresResumoMensal(
  acidentes: AcidenteVisao[],
  entregas: EntregaEpiHST[],
  medicoes: MedicaoTensaoHST[],
  acoes: AccaoHST[],
  areas: AreaRiscoHST[],
  ano: number,
  mes: number, // 1-12
  hoje: string
) {
  const prefixo = `${ano}-${String(mes).padStart(2, "0")}`;
  const noMes = (iso: string | null | undefined) => String(iso || "").slice(0, 7) === prefixo;

  const accMes = acidentes.filter((a) => noMes(a.dataDisplay));
  const comAfastamento = accMes.filter((a) => a.tipo_ocorrencia === "Acidente com Afastamento");
  const diasAfast = accMes.reduce((s, a) => s + (a.dias_afastamento || 0), 0);
  const entMes = entregas.filter((e) => noMes(e.data_entrega));
  const medMes = medicoes.filter((m) => noMes(m.data_medicao));
  const pendentes = acoes.filter((a) => a.status !== "Concluida");
  const atrasadas = pendentes.filter((a) => accaoAtrasada(a, hoje));
  const stats = statsPainelHst([], [], medicoes, areas, hoje);

  return {
    acidentes: accMes,
    comAfastamento: comAfastamento.length,
    diasAfastamento: diasAfast,
    entregas: entMes,
    medicoes: medMes,
    acoesPendentes: pendentes.length,
    acoesAtrasadas: atrasadas.length,
    areasAtivas: stats.areasAtivas,
    colabsHta: stats.colabsHtaLista
  };
}
