/**
 * ferias.ts - Plano de Férias da Administração Oficinal (migração do hub).
 *
 * O módulo NÃO calcula direitos nem abatimentos: os dias de direito vêm
 * SEMPRE do RH central (quem tem os atrasos e faltas é o RH). O sistema
 * gere o CICLO: folha anual (Outubro) -> lista mensal ao RH central ->
 * lançamento dos dias -> folha de afixação -> adiamentos/antecipações.
 *
 * Regras do desenho (herdadas do hub e mantidas):
 * - Dias CORRIDOS: sábado e domingo contam (fim = início + dias - 1);
 * - Limite de colaboradores por setor/mês (config, por defeito 2) com
 *   exceção permitida (aviso, nunca bloqueio silencioso);
 * - Adiamento/antecipação com motivo obrigatório e aviso prévio mínimo;
 * - Nada de salários, provisões ou aprovações.
 *
 * Tabelas (já existiam da época do hub, SEM SQL novo):
 * - ferias_plano: 1 linha = 1 colaborador x 1 ano (unique ano+colaborador)
 * - ferias_alteracoes: histórico imutável das mudanças de mês
 * - ferias_feriados: feriados fixos recorrentes (âncora ano 2000) e móveis
 * - ferias_config: linha única (id=1) com as regras
 */

/**
 * MESES_FERIAS: rótulos dos meses para este módulo (grafia certa, com
 * cedilha). NÃO é o MESES do rh.ts: aquele é o vocabulário guardado na
 * ficha do colaborador ("Marco" sem cedilha, legado da base), aqui é só
 * apresentação.
 */
export const MESES_FERIAS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

/* ============ Tipos ============ */

export type ConfigFerias = {
  id: number;
  limite_departamento: number;
  permitir_excedente: boolean;
  dias_aviso_alteracao: number;
  dias_antes_envio_rh: number;
  mes_planeamento: number;
  atualizado_em?: string;
};

export type FeriadoFerias = {
  id: string;
  /** ISO. recorrente=true: só MM-DD importa (âncora ano 2000). */
  data: string;
  descricao: string;
  recorrente: boolean;
};

export type LinhaPlano = {
  id: string;
  ano: number;
  collaborator_id: number;
  mes_previsto: number | null;
  status: string;
  enviado_rh_em: string | null;
  enviado_rh_por: string | null;
  dias_rh: number | null;
  data_inicio: string | null;
  data_fim: string | null;
  obs_rh: string | null;
  criado_em?: string;
  atualizado_em?: string;
};

export type ColabFerias = {
  id: number;
  name: string;
  code: string | null;
  categoria: string | null;
  setor: string | null;
};

export type AlteracaoFerias = {
  id: string;
  ano: number;
  collaborator_id: number;
  tipo: string;
  mes_anterior: number | null;
  mes_novo: number;
  data_inicio_anterior: string | null;
  data_inicio_nova: string | null;
  motivo: string;
  aviso_dias: number | null;
  aviso_ok: boolean | null;
  registado_por: string | null;
  criado_em?: string;
};

/** Linha do plano com o colaborador já junto (a vista de todas as páginas). */
export type LinhaViva = LinhaPlano & {
  nome: string;
  codigo: string | null;
  categoria: string | null;
  setor: string;
};

/* ============ Datas (tudo ISO yyyy-mm-dd, UTC, sem surpresas de fuso) ============ */

export function addDiasISO(iso: string, dias: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Dias inteiros de a para b (positivo quando b é futuro). */
export function diasEntre(aISO: string, bISO: string): number {
  const a = new Date(aISO + "T00:00:00Z").getTime();
  const b = new Date(bISO + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}

/** Fim das férias: dias CORRIDOS, sábado e domingo contam. */
export function fimDe(inicioISO: string, dias: number): string {
  if (!inicioISO || !(dias > 0)) return "";
  return addDiasISO(inicioISO, dias - 1);
}

/** Mês 1-12 legível; fora da gama devolve "". */
export function nomeMes(mes: number | null | undefined): string {
  const m = Number(mes);
  return Number.isInteger(m) && m >= 1 && m <= 12 ? MESES_FERIAS[m - 1] : "";
}

/* ============ Estados (UMA só implementação para o sistema todo) ============ */

export type EstadoLinha = "gozadas" | "emCurso" | "confirmado" | "aguardaRH" | "planeado";

export const ROTULO_ESTADO: Record<EstadoLinha, string> = {
  gozadas: "Gozadas",
  emCurso: "Em curso",
  confirmado: "Confirmado",
  aguardaRH: "Aguarda RH",
  planeado: "Planeado"
};

/**
 * Estado VISÍVEL da linha, calculado e nunca gravado:
 * 1. Gozadas: o fim já passou;
 * 2. Em curso: hoje entre início e fim;
 * 3. Confirmado: dias do RH + início lá estão;
 * 4. Aguarda RH: a lista deste mês já foi enviada;
 * 5. Planeado: só o mês está marcado.
 */
export function estadoDaLinha(
  l: Pick<LinhaPlano, "status" | "enviado_rh_em" | "dias_rh" | "data_inicio" | "data_fim" | "mes_previsto">,
  hojeISO: string
): EstadoLinha {
  if (l.data_fim && l.data_fim < hojeISO) return "gozadas";
  if (l.data_inicio && l.data_fim && l.data_inicio <= hojeISO && hojeISO <= l.data_fim) {
    return "emCurso";
  }
  if ((l.dias_rh || 0) > 0 && l.data_inicio) return "confirmado";
  if (l.enviado_rh_em || l.status === "Aguarda RH") return "aguardaRH";
  return "planeado";
}

/* ============ Setores e limite por setor/mês ============ */

export function setorDe(c: Pick<ColabFerias, "setor"> | null | undefined): string {
  const s = (c?.setor || "").trim();
  return s || "Sem setor";
}

/** Junta plano + colaboradores numa só lista viva (o "mapa" das páginas). */
export function vivas(
  plano: LinhaPlano[],
  colaboradores: ColabFerias[]
): LinhaViva[] {
  const porId = new Map(colaboradores.map((c) => [c.id, c]));
  return plano.map((l) => {
    const c = porId.get(l.collaborator_id);
    return {
      ...l,
      nome: c?.name || `(colaborador ${l.collaborator_id})`,
      codigo: c?.code || null,
      categoria: c?.categoria || null,
      setor: setorDe(c)
    };
  });
}

/** Chave de grupo setor|mes -> quantas pessoas marcadas. */
export function contasSetorMes(linhas: LinhaViva[]): Map<string, number> {
  const contas = new Map<string, number>();
  for (const l of linhas) {
    if (!l.mes_previsto) continue;
    const chave = `${l.setor}|${l.mes_previsto}`;
    contas.set(chave, (contas.get(chave) || 0) + 1);
  }
  return contas;
}

/**
 * Meses acima do limite: lista de {setor, mes, qtd} para pintar as células
 * a vermelho e alimentar o aviso (exceção permitida pela configuração).
 */
export function excedentes(
  linhas: LinhaViva[],
  limite: number
): { setor: string; mes: number; qtd: number }[] {
  const saida: { setor: string; mes: number; qtd: number }[] = [];
  for (const [chave, qtd] of contasSetorMes(linhas)) {
    if (qtd > limite) {
      const [setor, mes] = chave.split("|");
      saida.push({ setor, mes: Number(mes), qtd });
    }
  }
  saida.sort((a, b) => a.setor.localeCompare(b.setor) || a.mes - b.mes);
  return saida;
}

/** Está o setor+mês acima do limite? (para o servidor recusar ou avisar) */
export function contaNoMes(linhas: LinhaViva[], setor: string, mes: number): number {
  return contasSetorMes(linhas).get(`${setor}|${mes}`) || 0;
}

/* ============ Ciclo do RH (folha do mês) ============ */

/**
 * Prazo de envio ao RH: dias_antes_envio_rh antes do 1.º dia do mês em
 * causa. Devolve os dias que faltam (negativo = prazo já passou).
 */
export function diasAtePrazoEnvio(hojeISO: string, mes: number, diasAntes: number): number {
  const ano = Number(hojeISO.slice(0, 4));
  const alvo = mes >= Number(hojeISO.slice(5, 7)) ? ano : ano + 1;
  const primeiro = `${alvo}-${String(mes).padStart(2, "0")}-01`;
  const prazo = addDiasISO(primeiro, -Math.max(0, diasAntes));
  return diasEntre(hojeISO, prazo);
}

/** Texto pronto a colar no email para o RH central (modelo do hub). */
export function textoEmailRh(
  ano: number,
  mes: number,
  linhas: Pick<LinhaViva, "nome" | "codigo" | "categoria" | "setor">[],
  autor: string
): string {
  const tituloMes = `${nomeMes(mes)} de ${ano}`;
  let txt =
    `Assunto: Férias - colaboradores do mês de ${tituloMes}\n\n` +
    `Bom dia,\n\n` +
    `Seguem os colaboradores da Administração Oficinal com férias planeadas ` +
    `para ${tituloMes}, para verificação dos dias de direito:\n\n`;
  linhas.forEach((r, i) => {
    txt += `${i + 1}. ${r.nome}${r.codigo ? ` (${r.codigo})` : ""} - ${r.categoria || "-"} - ${r.setor}\n`;
  });
  txt +=
    `\nAgradecemos a confirmação dos dias de direito de cada colaborador ` +
    `para podermos afixar o plano.\n\nCom os melhores cumprimentos,\n` +
    `${autor || "Administração Oficinal"} - Danmo Services`;
  return txt;
}

/* ============ Adiamentos e antecipações ============ */

export type TipoAlteracao = "Adiamento" | "Antecipação";

/**
 * Ano do destino quando a alteração atravessa a viragem do ano
 * (Dezembro -> Janeiro seguinte ou Janeiro -> Dezembro anterior).
 * A folha é por ano: o mês novo pode nascer em OUTRA folha.
 */
export function anoDoMesNovo(
  ano: number,
  tipo: TipoAlteracao | string,
  mesAnterior: number,
  mesNovo: number
): number {
  if (tipo === "Adiamento" && mesAnterior === 12 && mesNovo === 1) return ano + 1;
  if (tipo === "Antecipação" && mesAnterior === 1 && mesNovo === 12) return ano - 1;
  return ano;
}

/**
 * Juiz da alteração (partilhado entre página e servidor):
 * devolve "" quando tudo certo, senão o motivo do recuso.
 */
export function problemaAlteracao(args: {
  tipo: string;
  mesAnterior: number | null;
  mesNovo: number;
  motivo: string;
  temMes: boolean;
}): string {
  if (!args.temMes) return "O colaborador não tem mês marcado nesta folha.";
  if (args.tipo !== "Adiamento" && args.tipo !== "Antecipação") {
    return "Escolhe Adiamento ou Antecipação.";
  }
  if (!args.mesAnterior) return "O mês anterior não está definido.";
  if (!mesValido(args.mesNovo)) return "Escolhe o mês novo.";
  if (args.tipo === "Adiamento" && args.mesNovo <= args.mesAnterior) {
    return "No adiamento, o mês novo tem de ser DEPOIS do actual (Jan de 2027 serve, verá na folha de 2027).";
  }
  if (args.tipo === "Antecipação" && args.mesNovo >= args.mesAnterior) {
    return "Na antecipação, o mês novo tem de ser ANTES do actual (Dez do ano anterior serve, verá na folha de 2025).";
  }
  if (!args.motivo.trim()) return "O motivo é obrigatório (fica no histórico).";
  return "";
}

/** Base do aviso prévio: início já gravado ou 1.º dia do mês previsto. */
export function baseAviso(ano: number, mes: number, dataInicio: string | null): string {
  if (dataInicio) return dataInicio;
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

export function avaliarAviso(
  hojeISO: string,
  baseISO: string,
  diasMinimos: number
): { dias: number; ok: boolean } {
  const dias = diasEntre(hojeISO, baseISO);
  return { dias, ok: dias >= diasMinimos };
}

/* ============ Feriados ============ */

/** Feriados do ano: os móveis pela data própria, os fixos pelo MM-DD. */
export function feriadosDoAno(
  feriados: FeriadoFerias[],
  ano: number
): { data: string; descricao: string }[] {
  const lista = feriados.map((f) => {
    if (!f.recorrente) return { data: f.data, descricao: f.descricao };
    const mmdd = f.data.slice(5, 10);
    return { data: `${ano}-${mmdd}`, descricao: f.descricao };
  });
  return lista
    .filter((f) => f.data.startsWith(`${ano}-`))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/** Próximos feriados a partir de hoje (inclui o ano seguinte). */
export function proximosFeriados(
  feriados: FeriadoFerias[],
  hojeISO: string,
  limite = 4
): { data: string; descricao: string }[] {
  const anos = [Number(hojeISO.slice(0, 4)), Number(hojeISO.slice(0, 4)) + 1];
  const todos = anos.flatMap((a) => feriadosDoAno(feriados, a));
  return todos.filter((f) => f.data >= hojeISO).slice(0, limite);
}

/* ============ Validações soltas ============ */

export function mesValido(m: unknown): number | null {
  const n = Number(m);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

/** CSV de qualquer tabela de linhas (o export da casa, com ; e BOM). */
export function paraCSV(cabecalho: string[], linhas: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    "\uFEFF" +
    [cabecalho, ...linhas].map((l) => l.map(esc).join(";")).join("\n")
  );
}
