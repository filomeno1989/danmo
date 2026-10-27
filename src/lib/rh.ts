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
  bi_validade: string | null; // AAAA-MM-DD; alimenta os alertas
  carta_conducao: string | null;
  carta_conducao_validade: string | null;
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
  dias = 30,
  hojeISO?: string
): boolean {
  if ((c.tipo_colaborador || "") !== "estagiario") return false;
  if (c.estagio_resultado) return false;
  if (c.active === false) return false;
  const e = estadoEstagio(c, hojeISO);
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
export function tempoDeCasa(c: Colaborador, hojeISO?: string): string {
  return tempoServico(inicioServico(c), fimServico(c) || hojeISO);
}

export type TemposTransferido = {
  antes: string; // tempo no grupo antes da Danmo
  total: string; // tempo total (origem ate hoje/saida)
} | null;

/**
 * Parcelas do transferido: tempo ANTES da Danmo e tempo TOTAL no
 * grupo. Null quando nao e transferido (ou faltam datas). O hojeISO
 * existe para os testes (mesmo padrao do estadoEstagio); no portal
 * chama-se sem ele e o hoje sai do relógio.
 */
export function temposTransferido(c: Colaborador, hojeISO?: string): TemposTransferido {
  if ((c.tipo_colaborador || "") === "estagiario") return null;
  if ((c.tipo_vinculo || "") !== "transferido") return null;
  if (!c.data_admissao_grupo) return null;
  return {
    antes: tempoLongo(c.data_admissao_grupo, c.data_admissao_danmo || fimServico(c) || undefined),
    total: tempoLongo(c.data_admissao_grupo, fimServico(c) || hojeISO || undefined)
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
  bi_validade: string;
  carta_conducao: string;
  carta_conducao_validade: string;
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
    bi_validade: limpo(f.bi_validade),
    carta_conducao: limpo(f.carta_conducao),
    carta_conducao_validade: limpo(f.carta_conducao_validade),
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

/* ------------------------------------------------------------------
 * Aniversariantes do mes (widget do home)
 * ------------------------------------------------------------------ */

export type Aniversariante = {
  id: number;
  nome: string;
  dia: number; // dia do mes em que faz anos
  idadeFaz: number; // anos que faz neste aniversario
  empresa: string | null;
  hoje: boolean; // faz anos exactamente hoje
};

/**
 * Quem faz anos no MES pedido (por omissao o mes da data de hoje, no
 * fuso de Maputo), ordenado pelo dia. So activos. Fev/29 entra no mes
 * 2 sempre: quando o ano nao e bissexto a pessoa continua a aparecer
 * com o dia 29. O mes navegavel (pagina Aniversarios) usa o 3o
 * argumento; o cartao do home chama sem ele, como sempre.
 */
export function aniversariantesDoMes(
  cols: Pick<Colaborador, "id" | "name" | "active" | "data_nascimento" | "empresa">[],
  hojeISO?: string,
  mesPedido?: number
): Aniversariante[] {
  const hoje = paraData(hojeISO || dataHojeISO())!;
  const mesActual = hoje.getUTCMonth() + 1;
  const mes = mesPedido && mesPedido >= 1 && mesPedido <= 12 ? mesPedido : mesActual;
  const diaHoje = hoje.getUTCDate();
  const ano = hoje.getUTCFullYear();
  const lista: Aniversariante[] = [];
  for (const c of cols) {
    if (c.active === false) continue;
    const nasc = paraData(c.data_nascimento);
    if (!nasc || nasc.getUTCMonth() + 1 !== mes) continue;
    lista.push({
      id: c.id,
      nome: c.name || "?",
      dia: nasc.getUTCDate(),
      idadeFaz: ano - nasc.getUTCFullYear(),
      empresa: c.empresa || null,
      hoje: mes === mesActual && nasc.getUTCDate() === diaHoje
    });
  }
  return lista.sort((a, b) => a.dia - b.dia || a.nome.localeCompare(b.nome, "pt"));
}

/* ------------------------------------------------------------------
 * Anos de casa no mes (aniversario de trabalho, para o cartaz)
 * ------------------------------------------------------------------ */

export type AnoCasa = {
  id: number;
  nome: string;
  dia: number; // dia do mes em que completa os anos
  anosFaz: number; // anos de servico que completa este ano
  empresa: string | null;
  inicio: string; // ISO do inicio do servico (a mesma data que a ficha mostra)
  hoje: boolean; // completa os anos exactamente hoje
};

/**
 * Quem completa anos de SERVICO no mes pedido (por omissao o actual):
 * o mes/dia do inicio de servico (a mesma conta de sempre, o fim do
 * estagio conta como inicio) cai no mes e a pessoa completa 1 ano ou
 * mais este ano. So activos, ordenado pelo dia igual aos
 * aniversarios. A data vem de inicioServico, a mesma fonte do
 * "Tempo de casa" da ficha, para o cartaz nunca contradizer a ficha.
 */
export function anosDeCasaDoMes(
  cols: Pick<
    Colaborador,
    | "id"
    | "name"
    | "active"
    | "empresa"
    | "tipo_colaborador"
    | "estagio_data_inicio"
    | "data_admissao_danmo"
    | "data_admissao"
  >[],
  hojeISO?: string,
  mesPedido?: number
): AnoCasa[] {
  const hoje = paraData(hojeISO || dataHojeISO())!;
  const mesActual = hoje.getUTCMonth() + 1;
  const mes = mesPedido && mesPedido >= 1 && mesPedido <= 12 ? mesPedido : mesActual;
  const diaHoje = hoje.getUTCDate();
  const ano = hoje.getUTCFullYear();
  const lista: AnoCasa[] = [];
  for (const c of cols) {
    if (c.active === false) continue;
    const inicio = paraData(inicioServico(c));
    if (!inicio || inicio.getUTCMonth() + 1 !== mes) continue;
    const anos = ano - inicio.getUTCFullYear();
    if (anos < 1) continue;
    lista.push({
      id: c.id,
      nome: c.name || "?",
      dia: inicio.getUTCDate(),
      anosFaz: anos,
      empresa: c.empresa || null,
      inicio: inicio.toISOString().slice(0, 10),
      hoje: mes === mesActual && inicio.getUTCDate() === diaHoje
    });
  }
  return lista.sort((a, b) => a.dia - b.dia || a.nome.localeCompare(b.nome, "pt"));
}

/* ------------------------------------------------------------------
 * Alertas de documentos a vencer (B.I. e Carta de Conducao)
 * ------------------------------------------------------------------ */

/** Janela do alerta: documento com validade dentro de 60 dias avisa. */
export const DIAS_ALERTA_DOC = 60;

/** A partir daqui o aviso passa de "proximo" para "urgente". */
export const DIAS_URGENTE_DOC = 15;

export type SituacaoDoc = "vencido" | "urgente" | "proximo";

export type AlertaDoc = {
  colaborador_id: number;
  nome: string;
  empresa: string | null;
  documento: string; // "B.I." ou "Carta de condução"
  validade: string; // AAAA-MM-DD, a mais recente das fontes
  dias: number; // negativo = ja venceu
  situacao: SituacaoDoc;
};

/** Uma validade registada num documento anexado (scan) da tabela a parte. */
export type ValidadeDoc = { colaborador_id: number; tipo: string; validade: string };

/** Situacao de UMA validade: alerta, ou "ok" quando ainda esta longe. */
export type ValidadeCor = SituacaoDoc | "ok";

/**
 * Classifica uma validade contra a data de hoje (Maputo): vencido,
 * urgente (ate 15 dias), proximo (ate 60) ou ok (mais longe que isso).
 */
export function situacaoPorValidade(
  validade: string | null | undefined,
  hojeISO?: string
): ValidadeCor | null {
  const v = paraData(validade);
  if (!v) return null;
  const hoje = paraData(hojeISO || dataHojeISO())!;
  const dias = Math.round((v.getTime() - hoje.getTime()) / 86400000);
  if (dias < 0) return "vencido";
  if (dias <= DIAS_URGENTE_DOC) return "urgente";
  if (dias <= DIAS_ALERTA_DOC) return "proximo";
  return "ok";
}

/**
 * Documentos a vencer, juntando as DUAS fontes de verdade: as datas
 * na ficha (bi_validade / carta_conducao_validade) e as datas nos
 * scans anexados do mesmo tipo. Quando as duas existem vence a MAIS
 * RECENTE (renovou e anexou o scan novo? o alerta cala-se mesmo que
 * a ficha ainda esteja com a data velha). So activos.
 */
export function alertasDocumentos(
  cols: Colaborador[],
  docsValidades: ValidadeDoc[] = [],
  hojeISO?: string,
  limiteDias = DIAS_ALERTA_DOC
): AlertaDoc[] {
  const hoje = paraData(hojeISO || dataHojeISO())!;
  const maisRecente = new Map<string, string>();
  const chave = (id: number, tipo: string) => `${id}|${tipo}`;
  for (const d of docsValidades || []) {
    if (!d.validade || !d.colaborador_id) continue;
    const k = chave(Number(d.colaborador_id), d.tipo);
    const actual = maisRecente.get(k);
    if (!actual || d.validade > actual) maisRecente.set(k, d.validade);
  }
  const junta = (id: number, tipo: string, ficha: string | null): string | null => {
    const doc = maisRecente.get(chave(id, tipo));
    if (ficha && doc) return doc > ficha ? doc : ficha;
    return doc || ficha || null;
  };
  const diasDe = (validade: string): number => {
    const v = paraData(validade);
    return v ? Math.round((v.getTime() - hoje.getTime()) / 86400000) : Number.POSITIVE_INFINITY;
  };

  const alertas: AlertaDoc[] = [];
  for (const c of cols) {
    if (c.active === false) continue;
    const pares: [string, string | null][] = [
      ["B.I.", junta(c.id, "B.I.", c.bi_validade)],
      ["Carta de condução", junta(c.id, "Carta de condução", c.carta_conducao_validade)]
    ];
    for (const [documento, validade] of pares) {
      if (!validade) continue;
      const dias = diasDe(validade);
      if (!Number.isFinite(dias) || dias > limiteDias) continue;
      const situacao: SituacaoDoc =
        dias < 0 ? "vencido" : dias <= DIAS_URGENTE_DOC ? "urgente" : "proximo";
      alertas.push({
        colaborador_id: c.id,
        nome: c.name || "?",
        empresa: c.empresa || null,
        documento,
        validade,
        dias,
        situacao
      });
    }
  }
  const ordem: Record<SituacaoDoc, number> = { vencido: 0, urgente: 1, proximo: 2 };
  return alertas.sort(
    (a, b) => ordem[a.situacao] - ordem[b.situacao] || a.dias - b.dias || a.nome.localeCompare(b.nome, "pt")
  );
}

/** Texto do alerta pronto a mostrar: "Venceu ha 3 dias", "Vence hoje"... */
export function textoAlertaDoc(a: Pick<AlertaDoc, "dias" | "situacao">): string {
  if (a.dias < 0) {
    const d = -a.dias;
    return d === 1 ? "Venceu há 1 dia" : `Venceu há ${d} dias`;
  }
  if (a.dias === 0) return "Vence hoje";
  if (a.dias === 1) return "Falta 1 dia";
  return `Faltam ${a.dias} dias`;
}

/* ------------------------------------------------------------------
 * Arquivo de documentos (scans anexados a ficha)
 * ------------------------------------------------------------------ */

/** Tipos que a ficha aceita anexar (o select do anexo). */
export const TIPOS_DOCUMENTOS = [
  "B.I.",
  "NIF/NUIT",
  "Contrato",
  "Carta de condução",
  "Certificado",
  "Atestado médico",
  "Recibo",
  "Outro"
];

/** Tamanho maximo por ficheiro: PDFs passam pela API (limite do Vercel). */
export const MAX_DOC_BYTES = 3_000_000;

/** "2304821" -> "2.2 MB"; "900" -> "900 B". */
export function formatoBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n >= 1_048_576) return `${(n / 1_048_576).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

/** Rotulo bonito do mes guardado na ficha ("Marco" -> "Março"). */
export function mesLabel(mes: string | null | undefined): string {
  return mes === "Marco" ? "Março" : mes || "";
}

/* ------------------------------------------------------------------
 * Arquivo central de documentos (pagina Documentos do RH)
 * ------------------------------------------------------------------ */

/** Linha do arquivo central: metadados do anexo + quem o possui. */
export type LinhaDoc = {
  id: string;
  colaborador_id: number;
  nome: string; // nome do colaborador que possui o anexo
  empresa: string | null;
  tipo: string;
  titulo: string;
  emissao: string | null;
  validade: string | null;
  arquivo_tipo: string;
  arquivo_bytes: number;
  criado_em: string;
};

export type FiltroDocs = {
  busca: string;
  tipo: string; // "" = todos os tipos
  situacao: "" | SituacaoDoc | "ok"; // "" = todas as situacoes
};

/**
 * Filtros do arquivo central: pesquisa SEM ACENTOS por titulo ou nome
 * do colaborador, tipo de documento e situacao da validade (um anexo
 * sem validade nao tem situacao e sai quando o filtro esta activo).
 */
export function filtrarDocumentos(
  docs: LinhaDoc[],
  f: FiltroDocs,
  hojeISO?: string
): LinhaDoc[] {
  const busca = normalizar(f.busca);
  return docs.filter((d) => {
    if (f.tipo && d.tipo !== f.tipo) return false;
    if (busca && !normalizar(d.titulo).includes(busca) && !normalizar(d.nome).includes(busca)) {
      return false;
    }
    if (f.situacao && situacaoPorValidade(d.validade, hojeISO) !== f.situacao) return false;
    return true;
  });
}

/**
 * Ordem do arquivo central: os mais graves primeiro (vencido, urgente,
 * proximo, ok) e, dentro da mesma situacao, o que vence primeiro.
 * Anexos sem validade ficam no fim, pelo mais recente anexado.
 */
export function ordenarDocumentos(docs: LinhaDoc[], hojeISO?: string): LinhaDoc[] {
  const hoje = paraData(hojeISO || dataHojeISO())!;
  const gravidade = (d: LinhaDoc): number => {
    const v = paraData(d.validade);
    if (!v) return 4;
    const dias = Math.round((v.getTime() - hoje.getTime()) / 86400000);
    if (dias < 0) return 0;
    if (dias <= DIAS_URGENTE_DOC) return 1;
    if (dias <= DIAS_ALERTA_DOC) return 2;
    return 3;
  };
  return [...docs].sort(
    (a, b) =>
      gravidade(a) - gravidade(b) ||
      (a.validade || "9999").localeCompare(b.validade || "9999") ||
      b.criado_em.localeCompare(a.criado_em)
  );
}
