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

/* ============ Controlo de tensão: campanha diária, período e CSV ============ */

/**
 * O Filomeno pediu controlo A SÉRIO: "temos colegas hipertensos, então
 * devemos medir todos os dias e registrar no papelinho e enviar
 * diariamente ao posto de saúde". Estas funções são o cérebro desse
 * controlo, partilhadas pelo ecrã, pelo papel A4 e pelas provas.
 */

/** Corta o ISO no dia (YYYY-MM-DD) sem deslocar fuso: o dia é o que está gravado. */
export function diaTensao(iso: string | null | undefined): string {
  return String(iso || "").slice(0, 10);
}

/**
 * Medições num intervalo de datas fechado nos dois lados ("de" e "ate"
 * em YYYY-MM-DD; vazio = sem limite desse lado).
 */
export function medicoesNoPeriodo(
  medicoes: MedicaoTensaoHST[],
  de: string,
  ate: string
): MedicaoTensaoHST[] {
  return medicoes.filter((m) => {
    const dia = diaTensao(m.data_medicao);
    if (!dia) return false;
    if (de && dia < de) return false;
    if (ate && dia > ate) return false;
    return true;
  });
}

/** Indicadores do período (linguagem simples, números redondos). */
export type ResumoTensaoPeriodo = {
  total: number; // medições no período
  pessoas: number; // pessoas distintas medidas
  mediaSys: number; // média das sistólicas
  mediaDia: number; // média das diastólicas
  medicoesHta: number; // medições com tensão alta
  pctHta: number; // % das medições com tensão alta
  diasComMedicao: number; // dias diferentes com pelo menos 1 medição
};

export function resumoTensaoPeriodo(medicoes: MedicaoTensaoHST[]): ResumoTensaoPeriodo {
  const total = medicoes.length;
  const somaSys = medicoes.reduce((s, m) => s + (Number(m.sistolica) || 0), 0);
  const somaDia = medicoes.reduce((s, m) => s + (Number(m.diastolica) || 0), 0);
  const hta = medicoes.filter((m) => eHta(Number(m.sistolica), Number(m.diastolica)));
  return {
    total,
    pessoas: new Set(medicoes.map((m) => m.colaborador_nome || "")).size,
    mediaSys: total ? Math.round(somaSys / total) : 0,
    mediaDia: total ? Math.round(somaDia / total) : 0,
    medicoesHta: hta.length,
    pctHta: total ? Math.round((hta.length / total) * 100) : 0,
    diasComMedicao: new Set(medicoes.map((m) => diaTensao(m.data_medicao))).size
  };
}

/** Uma pessoa na fila da campanha diária. */
export type CampanhaPessoa = {
  nome: string;
  ultima: MedicaoTensaoHST;
  classificacao: ClassificacaoTensao;
  estado: "medido_hoje" | "por_medir";
  diasSemMedir: number; // dias desde a última medição (0 = hoje)
};

/**
 * Campanha diária: quem tem a ÚLTIMA medição com tensão alta precisa de
 * medir TODOS os dias até a tensão baixar. A fila ordena por quem está
 * há mais dias sem medir, para o técnico saber por onde começar.
 */
export function campanhaTensao(medicoes: MedicaoTensaoHST[], hoje: string): CampanhaPessoa[] {
  const ultima: Record<string, MedicaoTensaoHST> = {};
  for (const m of medicoes) {
    const nome = m.colaborador_nome || "";
    if (!nome) continue;
    if (!ultima[nome] || String(m.data_medicao) > String(ultima[nome].data_medicao)) {
      ultima[nome] = m;
    }
  }
  const lista: CampanhaPessoa[] = [];
  for (const nome of Object.keys(ultima)) {
    const u = ultima[nome];
    if (!eHta(Number(u.sistolica), Number(u.diastolica))) continue;
    const diaUltima = diaTensao(u.data_medicao);
    let dias = 0;
    if (diaUltima && diaUltima < hoje) {
      dias = Math.round(
        (new Date(hoje).getTime() - new Date(diaUltima).getTime()) / 86400000
      );
    }
    lista.push({
      nome,
      ultima: u,
      classificacao: classificarTensao(Number(u.sistolica), Number(u.diastolica)),
      estado: diaUltima === hoje ? "medido_hoje" : "por_medir",
      diasSemMedir: Math.max(0, dias)
    });
  }
  return lista.sort(
    (a, b) => b.diasSemMedir - a.diasSemMedir || a.nome.localeCompare(b.nome)
  );
}

/** CSV de tensão (o papelinho digital que vai ao posto de saúde). */
export function csvTensao(medicoes: MedicaoTensaoHST[]): string {
  return paraCSV(
    ["Data", "Hora", "Colaborador", "Sistolica", "Diastolica", "FC (bpm)", "Classificacao", "Medido por", "Observacoes"],
    medicoes.map((m) => {
      const iso = String(m.data_medicao || "");
      return [
        fmtDataHst(iso),
        iso.length >= 16 ? iso.slice(11, 16) : "",
        m.colaborador_nome || "",
        m.sistolica,
        m.diastolica,
        m.frequencia_cardiaca == null ? "" : m.frequencia_cardiaca,
        // Sempre recalculada: o hub gravou graus errados na base (ex.:
        // "Limítrofe" numa 150/70) e o papelinho não pode levar erro.
        classificarTensao(Number(m.sistolica), Number(m.diastolica)).texto,
        m.medido_por || "",
        m.observacoes || ""
      ];
    })
  );
}

/* ============ Campanha de controle e medicação (Fase 10/11) ============ */

/** Uma linha da campanha de controle (a gente escolhida pelo técnico de HST). */
export type LinhaCampanhaHST = {
  id: string;
  colaborador_id: number | null;
  colaborador_nome: string;
  inicio: string | null;
  ativo: boolean;
  fim: string | null;
  campanha_id?: string | null;
  criado_por?: string | null;
};

/** A CAMPANHA numerada (Fase 11): Campanha 01, 02... com início, fim e estado. */
export type CampanhaHST = {
  id: string;
  numero: number;
  inicio: string | null;
  fim: string | null;
  estado: "aberta" | "arquivada";
  criado_por?: string | null;
};

/** Rótulo do papel e do ecrã: Campanha 01, Campanha 02... */
export function rotuloCampanha(numero: number): string {
  return `Campanha ${String(Math.max(1, numero)).padStart(2, "0")}`;
}

/**
 * Próximo número de campanha: o MAIOR entre o último gravado e o próprio
 * anterior (nunca reusa, igual à numeração DAN-HST).
 */
export function proximoNumeroCampanha(ultimoGravado: number | undefined): number {
  return Math.max(ultimoGravado || 0, 0) + 1;
}

/**
 * Dia em que a campanha está (contando o dia de abertura como dia 1).
 * 0 quando a data de abertura não está gravada ou é futura.
 */
export function diasDeCampanha(inicio: string | null | undefined, hoje: string): number {
  const d = String(inicio || "").slice(0, 10);
  if (!d || d > hoje) return 0;
  const diff = Math.round((new Date(hoje).getTime() - new Date(d).getTime()) / 86400000);
  return diff + 1;
}

/** A medicação que uma pessoa toma (activo=false = pausada, nunca apagada). */
export type MedicacaoTensaoHST = {
  id: string;
  colaborador_id: number | null;
  colaborador_nome: string;
  medicamento: string;
  dosagem: string | null;
  desde: string | null;
  regular: boolean;
  activo: boolean;
  observacoes: string | null;
  criado_por?: string | null;
};

/** Estado do membro da campanha com a tensão já em controle. */
export type MembroEmControle = {
  nome: string;
  ultima: MedicaoTensaoHST;
  classificacao: ClassificacaoTensao;
};

/**
 * Resumo da CAMPANHA DE CONTROLE: a percentagem conta SOBRE o pessoal
 * escolhido para a campanha (e não sobre todas as medições soltas). Os
 * membros ficam em três grupos: fila (última medição alta, medem todos
 * os dias), sem medição nenhuma na campanha (urgente: ninguém sabe a
 * tensão deles) e em controle (última já normal ou limítrofe).
 */
export type ResumoCampanha = {
  total: number; // membros activos na campanha
  medidosHoje: number; // membros com pelo menos 1 medição hoje
  comHta: number; // membros com a ÚLTIMA medição alta
  pctHta: number; // % da campanha (0 a 100)
  fila: CampanhaPessoa[];
  semMedicao: string[];
  emControlo: MembroEmControle[];
};

export function resumoCampanha(
  membros: { colaborador_nome: string }[],
  medicoes: MedicaoTensaoHST[],
  hoje: string
): ResumoCampanha {
  const nomes = [...new Set(membros.map((p) => (p.colaborador_nome || "").trim()).filter(Boolean))];
  const proprias = medicoes.filter((m) => nomes.includes(m.colaborador_nome || ""));
  const ultima: Record<string, MedicaoTensaoHST> = {};
  for (const m of proprias) {
    const nome = m.colaborador_nome || "";
    if (!nome) continue;
    if (!ultima[nome] || String(m.data_medicao) > String(ultima[nome].data_medicao)) {
      ultima[nome] = m;
    }
  }
  const fila = campanhaTensao(proprias, hoje);
  const semMedicao: string[] = [];
  const emControlo: MembroEmControle[] = [];
  for (const nome of nomes) {
    const u = ultima[nome];
    if (!u) semMedicao.push(nome);
    else if (!eHta(Number(u.sistolica), Number(u.diastolica))) {
      emControlo.push({
        nome,
        ultima: u,
        classificacao: classificarTensao(Number(u.sistolica), Number(u.diastolica))
      });
    }
  }
  emControlo.sort((a, b) => a.nome.localeCompare(b.nome));
  const medidosHoje = new Set(
    proprias.filter((m) => diaTensao(m.data_medicao) === hoje).map((m) => m.colaborador_nome || "")
  ).size;
  return {
    total: nomes.length,
    medidosHoje,
    comHta: fila.length,
    pctHta: nomes.length ? Math.round((fila.length / nomes.length) * 100) : 0,
    fila,
    semMedicao,
    emControlo
  };
}

/** Números secos de um conjunto de medições (a média e a parte alta). */
export type EstatisticaTensao = {
  total: number;
  alta: number;
  pctAlta: number;
  mediaSys: number;
  mediaDia: number;
};

export function estatisticaTensao(medicoes: MedicaoTensaoHST[]): EstatisticaTensao {
  const total = medicoes.length;
  const altas = medicoes.filter((m) => eHta(Number(m.sistolica), Number(m.diastolica))).length;
  const somaSys = medicoes.reduce((s, m) => s + (Number(m.sistolica) || 0), 0);
  const somaDia = medicoes.reduce((s, m) => s + (Number(m.diastolica) || 0), 0);
  return {
    total,
    alta: altas,
    pctAlta: total ? Math.round((altas / total) * 100) : 0,
    mediaSys: total ? Math.round(somaSys / total) : 0,
    mediaDia: total ? Math.round(somaDia / total) : 0
  };
}

/**
 * Estatística desde o início da medicação, comparada com o período
 * antes dela (mesma pessoa, medições de antes de "desde" vs. de "desde"
 * em diante). Null quando a medicação ainda não tem medições novas.
 */
export function estatisticaMedicacao(
  medicoes: MedicaoTensaoHST[],
  desde: string
): { desde: EstatisticaTensao; antes: EstatisticaTensao } | null {
  const depois = medicoes.filter((m) => {
    const d = diaTensao(m.data_medicao);
    return d && d >= desde;
  });
  if (!depois.length) return null;
  const antes = medicoes.filter((m) => {
    const d = diaTensao(m.data_medicao);
    return d && d < desde;
  });
  return { desde: estatisticaTensao(depois), antes: estatisticaTensao(antes) };
}

/* ============ Gráfico comparativo da ficha (Fase 10) ============ */

/** Limiar de hipertensão (HTA Grau 1) que marca o gráfico. */
export const LIMIAR_HTA_SYS = 140;
export const LIMIAR_HTA_DIA = 90;

export type PontoGraficoTensao = { x: number; y: number; v: number; iso: string };

/** Coordenadas prontas do gráfico comparativo (sistólica vs. diastólica). */
export type GraficoTensao = {
  largura: number;
  altura: number;
  escalaMin: number;
  escalaMax: number;
  ticks: number[];
  yTicks: { v: number; y: number }[];
  sys: PontoGraficoTensao[];
  dia: PontoGraficoTensao[];
  yLimiarSys: number;
  yLimiarDia: number;
  rotulos: { x: number; texto: string }[];
};

/** Rótulo curto de data para o eixo X (dd/mm do que está gravado). */
export function rotuloCurtoTensao(iso: string): string {
  const s = String(iso || "");
  return s.length >= 10 ? `${s.slice(8, 10)}/${s.slice(5, 7)}` : "";
}

/**
 * Pontos do gráfico comparativo (SVG): duas linhas (sistólica e
 * diastólica) na MESMA escala, com as linhas de corte 140/90 marcadas.
 * As medições chegam em ordem ASCENDENTE (a mais antiga à esquerda).
 */
export function pontosGraficoTensao(
  medicoes: MedicaoTensaoHST[],
  largura = 760,
  altura = 240
): GraficoTensao {
  const padEsq = 36;
  const padDir = 12;
  const padTopo = 14;
  const padBaixo = 24;
  let min = 60;
  let max = 160;
  for (const m of medicoes) {
    min = Math.min(min, Number(m.sistolica) || min, Number(m.diastolica) || min);
    max = Math.max(max, Number(m.sistolica) || max, Number(m.diastolica) || max);
  }
  const escalaMin = Math.max(40, Math.floor((min - 10) / 20) * 20);
  const escalaMax = Math.max(LIMIAR_HTA_SYS + 20, Math.ceil((max + 10) / 20) * 20);
  const ticks: number[] = [];
  for (let v = escalaMin; v <= escalaMax; v += 20) ticks.push(v);
  const yDe = (v: number) =>
    padTopo + ((escalaMax - v) / (escalaMax - escalaMin)) * (altura - padTopo - padBaixo);
  const n = medicoes.length;
  const xDe = (i: number) =>
    n === 1
      ? (padEsq + (largura - padDir)) / 2
      : padEsq + (i * (largura - padDir - padEsq)) / (n - 1);
  const arred = (v: number) => Math.round(v * 10) / 10;
  const ponto = (m: MedicaoTensaoHST, i: number, campo: "sistolica" | "diastolica"): PontoGraficoTensao => {
    const v = Number(m[campo]) || 0;
    return { x: arred(xDe(i)), y: arred(yDe(v)), v, iso: String(m.data_medicao || "") };
  };
  // Rótulos do eixo X: espaçados para nunca se tocarem, com o último sempre.
  const passo = Math.max(1, Math.ceil(n / 10));
  const rotulos: { x: number; texto: string }[] = [];
  for (let i = 0; i < n; i += passo) {
    const texto = rotuloCurtoTensao(String(medicoes[i].data_medicao || ""));
    if (texto) rotulos.push({ x: arred(xDe(i)), texto });
  }
  const ultimaRot = rotuloCurtoTensao(String(medicoes[n - 1]?.data_medicao || ""));
  if (n > 1 && ultimaRot && !rotulos.some((r) => r.x === arred(xDe(n - 1)))) {
    rotulos.push({ x: arred(xDe(n - 1)), texto: ultimaRot });
  }
  return {
    largura,
    altura,
    escalaMin,
    escalaMax,
    ticks,
    yTicks: ticks.map((v) => ({ v, y: arred(yDe(v)) })),
    sys: medicoes.map((m, i) => ponto(m, i, "sistolica")),
    dia: medicoes.map((m, i) => ponto(m, i, "diastolica")),
    yLimiarSys: arred(yDe(LIMIAR_HTA_SYS)),
    yLimiarDia: arred(yDe(LIMIAR_HTA_DIA)),
    rotulos
  };
}

/** Nome do mês em português (resumo mensal). */
export const MESES_HST = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

/** Alvo de pesquisa sem acentos (número, colaborador, área, descrição). */
import { paraCSV, semAcentos } from "./uso-comum";
export { paraCSV, semAcentos };

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
