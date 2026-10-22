/**
 * logica.ts - Cerebro do Quadro de Pessoal, em funcoes PURAS.
 *
 * Tudo aqui corre tanto no servidor (API, provas) como no navegador
 * (ficha, cartoes). Nao importa React nem next: so datas e strings.
 *
 * Decisoes do desenho:
 * - Duas listas: Danmo Porto (gerida por nos) e Danmo (gerida pela
 *   TCM). A coluna nova "empresa" guarda onde a pessoa esta HOJE;
 *   "empresa_origem" continua a significar de onde VEIO (transferidos).
 * - Estagiarios: periodo com inicio e fim previsto e DECISAO no fim
 *   (promovido / nao permaneceu). O fim do periodo e que conta como
 *   inicio de servico enquanto estagiario.
 * - Transferidos do grupo: o tempo ANTES da Danmo guarda-se separado
 *   (empresa de origem + data no grupo) e o TOTAL e a soma dos dois
 *   periodos, sempre com as duas parcelas a vista.
 */

export type Empresa = "porto" | "danmo";

/** Linha de colaborador com as colunas que o modulo usa. */
export type Colaborador = {
  id: number;
  code: string | null;
  name: string | null;
  categoria: string | null;
  setor: string | null;
  department: string | null;
  active: boolean | null;
  tipo_colaborador: string | null; // efetivo | estagiario
  tipo_vinculo: string | null; // contratado | transferido
  empresa: string | null; // porto | danmo | null (sem classificar)
  empresa_origem: string | null;
  data_admissao_danmo: string | null;
  data_admissao_grupo: string | null;
  data_admissao: string | null;
  data_inativo: string | null;
  data_nascimento: string | null;
  naturalidade: string | null;
  estado_civil: string | null;
  endereco: string | null;
  num_dependentes: number | null;
  mes_ferias: string | null;
  bi_numero: string | null;
  inss_numero: string | null;
  nuit_numero: string | null;
  contacto_1: string | null;
  contacto_2: string | null;
  contacto: string | null;
  email: string | null;
  grupo_sanguineo: string | null;
  doenca_cronica: string | null;
  altura_cm: number | null;
  observacoes_gerais: string | null;
  estagio_instituicao: string | null;
  estagio_orientador: string | null;
  estagio_data_inicio: string | null;
  estagio_data_fim: string | null;
  estagio_resultado: string | null;
  funcao_grupo: string | null;
  faz_turno: boolean | null;
  grupo_id: number | null;
  created_at: string | null;
};

export const EMPRESA_LABEL: Record<string, string> = {
  porto: "Danmo Porto",
  danmo: "Danmo (TCM)"
};

export const ESTAGIO_RESULTADO_LABEL: Record<string, string> = {
  promovido: "Promovido a efetivo",
  nao_permaneceu: "Terminou e nao permaneceu"
};

export const MESES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export const AREAS = [
  "Mecanica", "Electrica", "Serralharia", "Pneumaticos", "Inspeccao",
  "Supervisao", "Administracao", "Direccao", "Armazem", "Outra"
];

export const GRUPOS_SANGUINEOS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

export const ESTADOS_CIVIS = [
  "Solteiro(a)",
  "Casado(a)",
  "União de facto",
  "Divorciado(a)",
  "Viuvo(a)"
];

/* ------------------------------------------------------------------
 * Texto e datas
 * ------------------------------------------------------------------ */

/** minusculas sem acentos: "José" e "jose" passam a encontrar-se. */
export function normalizar(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** "AAAA-MM-DD" -> "DD/MM/AAAA" (vazio se nao houver data). */
export function formatoData(iso: string | null | undefined): string {
  if (!iso) return "";
  const partes = String(iso).slice(0, 10).split("-");
  if (partes.length !== 3) return "";
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

/** Data de hoje no fuso de Maputo (UTC+2), em AAAA-MM-DD. */
export function dataHojeISO(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

function paraData(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Tempo curto entre duas datas, no estilo do quadro do hub: "3a 5m".
 * Sem data de inicio devolve "-". Sem fim conta ate hoje.
 */
export function tempoServico(inicio: string | null | undefined, fim?: string | null): string {
  const a = paraData(inicio);
  if (!a) return "-";
  const b = paraData(fim ?? null) || paraData(dataHojeISO())!;
  if (b < a) return "0a 0m";
  let anos = b.getUTCFullYear() - a.getUTCFullYear();
  let meses = b.getUTCMonth() - a.getUTCMonth();
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }
  return `${anos}a ${meses}m`;
}

/**
 * Tempo longo, no estilo da ficha do hub: "3 anos, 5 meses e 12 dias".
 * Mesma aritmetica do hub (dias emprestam 30 ao mes) para os numeros
 * baterem certo com o que a equipa ja conhece.
 */
export function tempoLongo(inicio: string | null | undefined, fim?: string | null): string {
  const a = paraData(inicio);
  if (!a) return "-";
  const b = paraData(fim ?? null) || paraData(dataHojeISO())!;
  if (b < a) return "0 anos, 0 meses e 0 dias";
  let anos = b.getUTCFullYear() - a.getUTCFullYear();
  let meses = b.getUTCMonth() - a.getUTCMonth();
  let dias = b.getUTCDate() - a.getUTCDate();
  if (dias < 0) {
    meses -= 1;
    dias += 30;
  }
  if (meses < 0) {
    anos -= 1;
    meses += 12;
  }
  const anoTxt = anos === 1 ? "ano" : "anos";
  const mesTxt = meses === 1 ? "mes" : "meses";
  const diaTxt = dias === 1 ? "dia" : "dias";
  return `${anos} ${anoTxt}, ${meses} ${mesTxt} e ${dias} ${diaTxt}`;
}

/* ------------------------------------------------------------------
 * Empresa (as duas listas)
 * ------------------------------------------------------------------ */

/** Idade em anos completos ("" se nao houver data). */
export function idadeAnos(nascimento: string | null | undefined, hojeISO?: string): string {
  const a = paraData(nascimento);
  if (!a) return "";
  const hoje = paraData(hojeISO || dataHojeISO())!;
  let anos = hoje.getUTCFullYear() - a.getUTCFullYear();
  const antes =
    hoje.getUTCMonth() < a.getUTCMonth() ||
    (hoje.getUTCMonth() === a.getUTCMonth() && hoje.getUTCDate() < a.getUTCDate());
  if (antes) anos -= 1;
  return anos > 0 ? String(anos) : "";
}

/** Da empresa_origem antiga ('Porto'/'TCM') para a empresa nova. */
export function classificarEmpresa(origem: string | null | undefined): string | null {
  const t = normalizar(origem).trim();
  if (t === "porto") return "porto";
  if (t === "tcm") return "danmo";
  return null;
}

/** Rotulo da lista a que a pessoa pertence (ou "Sem classificar"). */
export function empresaRotulo(c: Pick<Colaborador, "empresa">): string {
  return EMPRESA_LABEL[c.empresa || ""] || "Sem classificar";
}

/* ------------------------------------------------------------------
 * Estagiarios
 * ------------------------------------------------------------------ */

export type EstadoEstagio =
  | { situacao: "promovido" | "nao_permaneceu" }
  | { situacao: "a_decorrer"; dias: number }
  | { situacao: "terminado"; diasAtraso: number }
  | null;

/**
 * Situacao do estagio de uma pessoa. Null quando nao e estagiario.
 * "a_decorrer" traz os dias que faltam para o fim previsto;
 * "terminado" traz quantos dias passaram sem decisao registada.
 */
export function estadoEstagio(
  c: Pick<Colaborador, "tipo_colaborador" | "estagio_data_fim" | "estagio_resultado" | "active">,
  hojeISO?: string
): EstadoEstagio {
  if ((c.tipo_colaborador || "") !== "estagiario") return null;
  if (c.estagio_resultado === "promovido") return { situacao: "promovido" };
  if (c.estagio_resultado === "nao_permaneceu") return { situacao: "nao_permaneceu" };
  const fim = paraData(c.estagio_data_fim);
  if (!fim) return { situacao: "a_decorrer", dias: Infinity };
  const hoje = paraData(hojeISO || dataHojeISO())!;
  const dias = Math.round((fim.getTime() - hoje.getTime()) / 86400000);
  if (dias >= 0) return { situacao: "a_decorrer", dias };
  return { situacao: "terminado", diasAtraso: -dias };
}

/** Verdadeiro quando o estagio termina dentro dos proximos N dias (ou ja passou). */
export function estagioATerminar(
  c: Pick<Colaborador, "tipo_colaborador" | "estagio_data_fim" | "estagio_resultado" | "active">,
  dias = 30
): boolean {
  if ((c.tipo_colaborador || "") !== "estagiario") return false;
  if (c.estagio_resultado) return false;
  if (c.active === false) return false;
  const e = estadoEstagio(c);
  if (!e) return false;
  if (e.situacao === "terminado") return true;
  if (e.situacao === "a_decorrer") return e.dias <= dias;
  return false;
}

/* ------------------------------------------------------------------
 * Inicio de servico e tempos por pessoa
 * ------------------------------------------------------------------ */

/** Data de inicio do servico na Danmo (estagio conta pelo inicio dele). */
export function inicioServico(
  c: Pick<Colaborador, "tipo_colaborador" | "estagio_data_inicio" | "data_admissao_danmo" | "data_admissao">
): string | null {
  if ((c.tipo_colaborador || "") === "estagiario") {
    return c.estagio_data_inicio || c.data_admissao_danmo || c.data_admissao || null;
  }
  return c.data_admissao_danmo || c.data_admissao || null;
}

/** Fim de servico: a data de desvinculamento de quem saiu. */
export function fimServico(c: Pick<Colaborador, "active" | "data_inativo">): string | null {
  return c.active === false ? c.data_inativo || null : null;
}

/** Tempo de casa curto (para o cartao e a tabela). */
export function tempoDeCasa(c: Colaborador): string {
  return tempoServico(inicioServico(c), fimServico(c));
}

export type TemposTransferido = {
  antes: string; // tempo no grupo antes da Danmo
  total: string; // tempo total (origem ate hoje/saida)
} | null;

/**
 * Parcelas do transferido: tempo ANTES da Danmo e tempo TOTAL no
 * grupo. Null quando nao e transferido (ou faltam datas).
 */
export function temposTransferido(c: Colaborador): TemposTransferido {
  if ((c.tipo_colaborador || "") === "estagiario") return null;
  if ((c.tipo_vinculo || "") !== "transferido") return null;
  if (!c.data_admissao_grupo) return null;
  return {
    antes: tempoLongo(c.data_admissao_grupo, c.data_admissao_danmo || fimServico(c) || undefined),
    total: tempoLongo(c.data_admissao_grupo, fimServico(c) || undefined)
  };
}

/* ------------------------------------------------------------------
 * Codigo de trabalhador
 * ------------------------------------------------------------------ */

/** Normaliza um codigo: maiusculas e sem espacos ("EST 01" -> "EST01"). */
export function normalizarCodigo(codigo: string | null | undefined): string {
  return (codigo || "").replace(/\s+/g, "").toUpperCase();
}

/**
 * Proximo codigo livre: "DM0269" para efetivos, "EST007" para
 * estagiarios. Conta os numeros JA usados mesmo em formatos antigos
 * ("EST 01" conta como EST01) e salta os ocupados.
 */
export function proximoCodigo(codigos: string[], tipo: "efetivo" | "estagiario"): string {
  const prefixo = tipo === "estagiario" ? "EST" : "DM";
  const digitos = tipo === "estagiario" ? 3 : 4;
  let max = 0;
  const usados = new Set<number>();
  for (const bruto of codigos) {
    const c = normalizarCodigo(bruto);
    const m = new RegExp(`^${prefixo}(\\d+)$`, "i").exec(c);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    usados.add(n);
    if (n > max) max = n;
  }
  let proximo = max + 1;
  while (usados.has(proximo)) proximo += 1;
  return `${prefixo}${String(proximo).padStart(digitos, "0")}`;
}

/* ------------------------------------------------------------------
 * Validacao da ficha (o mesmo juiz no form e na API)
 * ------------------------------------------------------------------ */

export type DadosFicha = {
  code: string;
  name: string;
  categoria: string;
  setor: string;
  empresa: string; // porto | danmo
  tipo_colaborador: string; // efetivo | estagiario
  tipo_vinculo: string; // contratado | transferido
  empresa_origem: string;
  data_admissao_danmo: string;
  data_admissao_grupo: string;
  estagio_instituicao: string;
  estagio_orientador: string;
  estagio_data_inicio: string;
  estagio_data_fim: string;
  active: boolean;
  data_inativo: string;
  data_nascimento: string;
  naturalidade: string;
  estado_civil: string;
  endereco: string;
  num_dependentes: string; // texto do input; converte-se no payload
  mes_ferias: string;
  bi_numero: string;
  inss_numero: string;
  nuit_numero: string;
  contacto_1: string;
  contacto_2: string;
  email: string;
  grupo_sanguineo: string;
  doenca_cronica: string;
  altura_cm: string;
  observacoes_gerais: string;
};

/**
 * Devolve o PRIMEIRO problema encontrado (texto pronto a mostrar) ou
 * null quando a ficha esta valida. As regras:
 * - sempre: nome, funcao, empresa (Porto ou Danmo) e codigo;
 * - efetivo: data de admissao; transferido: origem e data no grupo;
 * - estagiario: inicio e fim previsto (fim depois do inicio);
 * - inactivo: data de desvinculamento.
 */
export function problemaDaFicha(f: DadosFicha): string | null {
  if (!f.name.trim()) return "Escreve o nome completo.";
  if (!f.categoria.trim()) return "Escreve a funcao/cargo.";
  if (f.empresa !== "porto" && f.empresa !== "danmo") {
    return "Escolhe a empresa: Danmo Porto ou Danmo (TCM).";
  }
  if (!normalizarCodigo(f.code)) return "Preenche o codigo de trabalhador (podes pedir para sugerir).";

  const estagiario = f.tipo_colaborador === "estagiario";
  if (estagiario) {
    if (!f.estagio_data_inicio) return "Indica o inicio do estagio.";
    if (!f.estagio_data_fim) return "Indica o fim previsto do estagio.";
    if (f.estagio_data_fim < f.estagio_data_inicio) {
      return "O fim previsto tem de ser depois do inicio do estagio.";
    }
  } else {
    if (!f.data_admissao_danmo) return "Indica a data de admissao na Danmo.";
    if (f.tipo_vinculo === "transferido") {
      if (!f.empresa_origem.trim()) return "Indica a empresa de origem (de onde veio no grupo).";
      if (!f.data_admissao_grupo) return "Indica a data de admissao no grupo.";
      if (f.data_admissao_danmo < f.data_admissao_grupo) {
        return "A admissao na Danmo tem de ser depois da admissao no grupo.";
      }
    }
  }

  if (!f.active && !f.data_inativo) {
    return "Indica a data de desvinculamento de quem sai.";
  }
  return null;
}

/** Converte os dados do formulario para o payload da API (so campos RH). */
export function payloadDaFicha(f: DadosFicha): Record<string, unknown> {
  const limpo = (v: string) => v.trim() || null;
  const estagiario = f.tipo_colaborador === "estagiario";
  const transferido = !estagiario && f.tipo_vinculo === "transferido";
  const altura = parseFloat(f.altura_cm.replace(",", "."));
  const dependentes = parseInt(f.num_dependentes, 10);
  return {
    code: normalizarCodigo(f.code),
    name: f.name.trim(),
    categoria: f.categoria.trim(),
    setor: limpo(f.setor),
    empresa: f.empresa === "danmo" ? "danmo" : "porto",
    tipo_colaborador: estagiario ? "estagiario" : "efetivo",
    tipo_vinculo: estagiario ? null : transferido ? "transferido" : "contratado",
    empresa_origem: transferido ? limpo(f.empresa_origem) : null,
    data_admissao_danmo: estagiario ? null : f.data_admissao_danmo || null,
    data_admissao_grupo: transferido ? f.data_admissao_grupo || null : null,
    estagio_instituicao: estagiario ? limpo(f.estagio_instituicao) : null,
    estagio_orientador: estagiario ? limpo(f.estagio_orientador) : null,
    estagio_data_inicio: estagiario ? f.estagio_data_inicio || null : null,
    estagio_data_fim: estagiario ? f.estagio_data_fim || null : null,
    active: f.active,
    data_inativo: !f.active ? f.data_inativo || null : null,
    data_nascimento: f.data_nascimento || null,
    naturalidade: limpo(f.naturalidade),
    estado_civil: limpo(f.estado_civil),
    endereco: limpo(f.endereco),
    num_dependentes: Number.isFinite(dependentes) && dependentes > 0 ? dependentes : 0,
    mes_ferias: limpo(f.mes_ferias),
    bi_numero: limpo(f.bi_numero),
    inss_numero: limpo(f.inss_numero),
    nuit_numero: limpo(f.nuit_numero),
    contacto_1: limpo(f.contacto_1),
    contacto_2: limpo(f.contacto_2),
    email: limpo(f.email),
    grupo_sanguineo: limpo(f.grupo_sanguineo),
    doenca_cronica: limpo(f.doenca_cronica),
    altura_cm: Number.isFinite(altura) ? altura : null,
    observacoes_gerais: limpo(f.observacoes_gerais)
  };
}

/* ------------------------------------------------------------------
 * Resumo do painel (cartoes do topo)
 * ------------------------------------------------------------------ */

export type ResumoQuadro = {
  total: number;
  activos: number;
  inactivos: number;
  porto: number;
  danmo: number;
  semClassificar: number;
  estagiarios: number;
  estagiosATerminar: number;
};

export function resumoQuadro(cols: Colaborador[]): ResumoQuadro {
  const activos = cols.filter((c) => c.active !== false);
  return {
    total: cols.length,
    activos: activos.length,
    inactivos: cols.length - activos.length,
    porto: cols.filter((c) => c.empresa === "porto").length,
    danmo: cols.filter((c) => c.empresa === "danmo").length,
    semClassificar: cols.filter((c) => !c.empresa).length,
    estagiarios: activos.filter((c) => c.tipo_colaborador === "estagiario").length,
    estagiosATerminar: activos.filter((c) => estagioATerminar(c)).length
  };
}

/* ------------------------------------------------------------------
 * Filtros e pesquisa
 * ------------------------------------------------------------------ */

export type Filtros = {
  texto: string;
  empresa: string; // "" | porto | danmo | sem
  estado: string; // "" | activos | inactivos
  tipo: string; // "" | efetivo | estagiario
  vinculo: string; // "" | contratado | transferido
};

export function filtrarQuadro(cols: Colaborador[], f: Filtros): Colaborador[] {
  const t = normalizar(f.texto).trim();
  return cols.filter((c) => {
    if (t) {
      const alvo = `${normalizar(c.name)} ${normalizar(c.code)} ${normalizar(c.categoria)}`;
      if (!alvo.includes(t)) return false;
    }
    if (f.empresa === "sem" && c.empresa) return false;
    if (f.empresa === "porto" && c.empresa !== "porto") return false;
    if (f.empresa === "danmo" && c.empresa !== "danmo") return false;
    if (f.estado === "activos" && c.active === false) return false;
    if (f.estado === "inactivos" && c.active !== false) return false;
    const tipo = (c.tipo_colaborador || "efetivo") === "estagiario" ? "estagiario" : "efetivo";
    if (f.tipo && f.tipo !== tipo) return false;
    if (f.vinculo && tipo === "efetivo") {
      if ((c.tipo_vinculo || "contratado") !== f.vinculo) return false;
    }
    if (f.vinculo === "transferido" && tipo === "estagiario") return false;
    return true;
  });
}

/** Iniciais para o avatar: "Filomeno Alexandre" -> "FA". */
export function iniciais(nome: string | null | undefined): string {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  const primeira = partes[0][0] || "";
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + ultima).toUpperCase();
}

/* ------------------------------------------------------------------
 * Fotos da grelha
 * ------------------------------------------------------------------ */

export type FotoGrelha = { id: number; img: string };

/**
 * Junta as duas respostas da tabela de fotos num mapa simples para a
 * grelha: quem tem MINI usa a mini (leve, e a que a lista carrega);
 * quem so tem a foto grande (gravada antes de a mini existir) usa a
 * foto grande mesmo, que e melhor do que ficar sem cara no cartao.
 * A mini ganha quando a mesma ficha aparece nas duas listas.
 */
export function fotosParaGrelha(
  minis: { colaborador_id: number; mini: string | null }[],
  grandes: { colaborador_id: number; foto: string | null }[]
): FotoGrelha[] {
  const mapa = new Map<number, string>();
  for (const g of grandes || []) {
    if (g.foto && g.colaborador_id) mapa.set(Number(g.colaborador_id), g.foto);
  }
  for (const m of minis || []) {
    if (m.mini && m.colaborador_id) mapa.set(Number(m.colaborador_id), m.mini);
  }
  return [...mapa]
    .map(([id, img]) => ({ id, img }))
    .sort((a, b) => a.id - b.id);
}
