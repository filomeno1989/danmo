/**
 * ponte-os.ts - A ponte entre as Ordens de Serviço e a Disponibilidade.
 *
 * Regras (pedido do Filomeno):
 * - A abertura de uma obra interrompe a disponibilidade da máquina a
 *   partir da data de abertura, com o estado físico da obra.
 * - A máquina só volta a "Disponível" quando a obra é enviada à CdM
 *   (estado CdM) ou fechada (Fechada); nesse dia já conta como disponível.
 * - Máquinas sem obras nem marcações assumem-se Disponíveis 24h por dia.
 * - As marcações manuais da Grelha ganham sempre à síntese das ordens.
 * - NUNCA se inventa o futuro: com "hoje" no sítio, a síntese para no
 *   último dia vivido (pedido do Filomeno de 21/10: a percentagem do mês
 *   em curso não pode contar dias que ainda não aconteceram).
 *
 * Tudo é calculado à LEITURA (síntese), sem escrever nada nas tabelas
 * disp_*: assim as ordens mudam e a grelha acompanha no segundo seguinte,
 * sem duplicar dados nem mexer no disp_mensal dos excels (fonte oficial
 * do Painel para os anos fechados).
 */

import { PRIORIDADE_FISICO } from "@/lib/oficina";

/** Ordem já preparada pela rota (com a data de saída da oficina). */
export type OrdemPonte = {
  id: number;
  numero_obra: string | null;
  equipment_id: number;
  data_abertura: string | null;
  status_atual: string;
  status_fisico: string | null;
  /** Dia (AAAA-MM-DD) em que a obra saiu da oficina (CdM/Fechada); null = ainda lá está. */
  saida: string | null;
};

/** Um troço de paragem: do dia inicial ao dia final (ambos incluídos). */
export type SegmentoPonte = {
  equipment_id: number;
  estado: string;
  inicio: string; // AAAA-MM-DD
  fim: string | null; // AAAA-MM-DD; null = ainda parada
  os_id: number | null;
  numero_obra: string | null;
  origem: "ordem" | "transicao";
};

/** Dia gerado pela ponte (só existe onde não há marcação explícita). */
export type DiaSintetizado = {
  id: number;
  equipment_id: number;
  data: string;
  estado: string;
  horas_disponiveis: number;
  hora_entrada: null;
  hora_saida: null;
  observacao: null;
  origem: "ordem" | "transicao" | "auto";
  os_id: number | null;
  numero_obra: string | null;
};

/** Quanto pior o estado, menor o índice (Acidentada ganha a tudo). */
export function indiceGravidade(estado: string | null | undefined): number {
  const i = PRIORIDADE_FISICO.indexOf(estado || "");
  return i === -1 ? PRIORIDADE_FISICO.length : i;
}

/** Dia anterior a uma data AAAA-MM-DD (a saída da oficina já é dia livre). */
export function diaAnterior(data: string): string {
  const d = new Date(data.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Lista de dias AAAA-MM-DD de um mês "AAAA-MM". */
export function diasDoMes(mes: string): string[] {
  const [a, m] = mes.split("-").map(Number);
  const n = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Segmentos de paragem vindos das ordens de serviço.
 * - Obra ainda na oficina (saida null): parada da abertura em diante.
 * - Obra enviada à CdM / fechada: parada da abertura até ao dia ANTES da saída.
 */
export function segmentosDeOrdens(ordens: OrdemPonte[]): SegmentoPonte[] {
  const segmentos: SegmentoPonte[] = [];
  for (const o of ordens) {
    if (!o.equipment_id || !o.data_abertura || !o.status_fisico) continue;
    const inicio = o.data_abertura.slice(0, 10);
    const fim = o.saida ? diaAnterior(o.saida) : null;
    if (fim && fim < inicio) continue; // abriu e saiu no mesmo dia: não chegou a parar
    segmentos.push({
      equipment_id: o.equipment_id,
      estado: o.status_fisico,
      inicio,
      fim,
      os_id: o.id,
      numero_obra: o.numero_obra || null,
      origem: "ordem"
    });
  }
  return segmentos;
}

/**
 * Segmentos das transições manuais ainda abertas (a Grelha marcou uma
 * parada e ninguém disse que a máquina voltou): cobrem do primeiro dia
 * marcado até hoje, para a grelha bater certo com "Paradas neste momento".
 */
export function segmentosDeTransicoes(
  transicoesAbertas: { id: number; equipment_id: number; estado: string; inicio: string }[],
  hoje: string
): SegmentoPonte[] {
  const segmentos: SegmentoPonte[] = [];
  for (const t of transicoesAbertas) {
    const inicio = (t.inicio || "").slice(0, 10);
    if (!inicio || inicio > hoje) continue;
    segmentos.push({
      equipment_id: t.equipment_id,
      estado: t.estado,
      inicio,
      fim: hoje,
      os_id: null,
      numero_obra: null,
      origem: "transicao"
    });
  }
  return segmentos;
}

/**
 * Sintetiza os dias do mês para as máquinas da frota:
 * 1. dia com marcação explícita -> fica como está (não se toca);
 * 2. dia dentro de um troço de paragem (obra ou transição) -> estado do
 *    troço mais grave, 0h disponíveis;
 * 3. resto -> Disponível 24h (a máquina assume-se disponível até haver
 *    intervenção).
 *
 * Com "hoje" (datas AAAA-MM-DD), os dias DEPOIS de hoje não são gerados:
 * nem o Disponível implícito, nem a parada de uma obra ainda aberta. O
 * mês passado não muda nada (todos os dias já são <= hoje).
 */
export function sintetizarDias(params: {
  mes: string;
  /** Último dia vivido; dias posteriores não são sintetizados. */
  hoje?: string;
  equipamentos: { id: number; active: boolean }[];
  chavesExplicitas: Set<string>;
  segmentos: SegmentoPonte[];
}): DiaSintetizado[] {
  const { mes, hoje, equipamentos, chavesExplicitas, segmentos } = params;
  const dias = diasDoMes(mes).filter((d) => !hoje || d <= hoje);

  const porMaquina = new Map<number, SegmentoPonte[]>();
  for (const s of segmentos) {
    if (!porMaquina.has(s.equipment_id)) porMaquina.set(s.equipment_id, []);
    porMaquina.get(s.equipment_id)!.push(s);
  }

  const sintetizados: DiaSintetizado[] = [];
  let idNegativo = -1;

  for (const eq of equipamentos) {
    if (!eq.active) continue; // máquinas inactivas não geram dias
    const meus = porMaquina.get(eq.id);
    if (!meus || !meus.length) {
      // sem nenhum troço: só os dias livres implícitos
      for (const data of dias) {
        if (chavesExplicitas.has(`${eq.id}|${data}`)) continue;
        sintetizados.push({
          id: idNegativo--,
          equipment_id: eq.id,
          data,
          estado: "Disponível",
          horas_disponiveis: 24,
          hora_entrada: null,
          hora_saida: null,
          observacao: null,
          origem: "auto",
          os_id: null,
          numero_obra: null
        });
      }
      continue;
    }
    for (const data of dias) {
      if (chavesExplicitas.has(`${eq.id}|${data}`)) continue;
      let melhor: SegmentoPonte | null = null;
      for (const s of meus) {
        if (s.inicio > data) continue;
        if (s.fim && s.fim < data) continue;
        if (!melhor || indiceGravidade(s.estado) < indiceGravidade(melhor.estado)) melhor = s;
      }
      if (melhor) {
        sintetizados.push({
          id: idNegativo--,
          equipment_id: eq.id,
          data,
          estado: melhor.estado,
          horas_disponiveis: 0,
          hora_entrada: null,
          hora_saida: null,
          observacao: null,
          origem: melhor.origem,
          os_id: melhor.os_id,
          numero_obra: melhor.numero_obra
        });
      } else {
        sintetizados.push({
          id: idNegativo--,
          equipment_id: eq.id,
          data,
          estado: "Disponível",
          horas_disponiveis: 24,
          hora_entrada: null,
          hora_saida: null,
          observacao: null,
          origem: "auto",
          os_id: null,
          numero_obra: null
        });
      }
    }
  }
  return sintetizados;
}

/**
 * Linha mensal agregada de uma máquina (mesma forma do disp_mensal).
 * Atribuição de horas igual à do agregado oficial: Disponível soma as
 * horas do dia; os outros estados somam o que falta às 24h.
 */
export type MensalSintetico = {
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
};

/**
 * Agregado mensal de um ANO calculado na hora pela ponte (o mesmo motor
 * da Grelha): marcações explícitas ganham, troços de ordens/transições
 * interrompem e o resto é Disponível 24h. Só entram dias já vividos
 * (data <= hoje): os meses anteriores ao mês em curso ficam completos e
 * o mês em curso entra até ao último dia vivido. É o que alimenta o
 * Painel para o ano em curso, sem tocar nos anos oficiais (disp_mensal
 * dos excels), e as marcações do futuro ("repetir até") só entram no dia
 * delas.
 */
export function sintetizarAnoMensal(params: {
  ano: number;
  hoje: string;
  equipamentos: { id: number; active: boolean }[];
  /** Marcações explícitas do ano (disp_dias); ganham à síntese. */
  diasExplicitos: {
    equipment_id: number;
    data: string;
    estado: string | null;
    horas_disponiveis: number | string | null;
  }[];
  segmentos: SegmentoPonte[];
}): MensalSintetico[] {
  const { ano, hoje, equipamentos, diasExplicitos, segmentos } = params;
  const mesHoje = Number(hoje.slice(5, 7));

  const linhas = new Map<string, MensalSintetico>();
  const linhaDe = (equipmentId: number, mes: number): MensalSintetico => {
    const chave = `${equipmentId}|${mes}`;
    let l = linhas.get(chave);
    if (!l) {
      l = {
        equipment_id: equipmentId, ano, mes,
        horas_a: 0, horas_pm: 0, horas_ty: 0, horas_ac: 0, horas_bd: 0, horas_sp: 0, horas_total: 0
      };
      linhas.set(chave, l);
    }
    return l;
  };
  const contarDia = (equipmentId: number, mes: number, estado: string | null, horas: number) => {
    const l = linhaDe(equipmentId, mes);
    l.horas_a += horas;
    if (estado && estado !== "Disponível") {
      const parado = Math.max(0, 24 - horas);
      if (estado === "Avariada") l.horas_bd += parado;
      else if (estado === "Acidentada") l.horas_ac += parado;
      else if (estado === "Pneumático") l.horas_ty += parado;
      else if (estado === "Revisão/Manutenção" || estado === "Inspeção") l.horas_pm += parado;
      else if (estado === "Aguarda Acessório") l.horas_sp += parado;
    }
    l.horas_total += 24;
  };

  // 1. marcações explícitas do ano, só até hoje (o futuro conta no dia dele)
  for (const d of diasExplicitos) {
    const data = (d.data || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || data > hoje) continue;
    if (Number(data.slice(0, 4)) !== ano) continue;
    contarDia(d.equipment_id, Number(data.slice(5, 7)), d.estado ?? null, Number(d.horas_disponiveis) || 0);
  }

  // 2. síntese mês a mês, só nos meses já começados e só até hoje
  const activos = equipamentos.filter((e) => e.active);
  for (let mes = 1; mes <= mesHoje; mes++) {
    const mesStr = `${ano}-${String(mes).padStart(2, "0")}`;
    const sufixo = `-${String(mes).padStart(2, "0")}-`;
    const chaves = new Set<string>();
    for (const d of diasExplicitos) {
      const data = (d.data || "").slice(0, 10);
      if (data.length === 10 && data.slice(4).startsWith(sufixo)) chaves.add(`${d.equipment_id}|${data}`);
    }
    const sintetizados = sintetizarDias({
      mes: mesStr,
      hoje,
      equipamentos: activos,
      chavesExplicitas: chaves,
      segmentos
    });
    for (const s of sintetizados) {
      contarDia(s.equipment_id, mes, s.estado, s.horas_disponiveis);
    }
  }

  const arredondar = (v: number) => Math.round(v * 100) / 100;
  for (const l of linhas.values()) {
    l.horas_a = arredondar(l.horas_a);
    l.horas_pm = arredondar(l.horas_pm);
    l.horas_ty = arredondar(l.horas_ty);
    l.horas_ac = arredondar(l.horas_ac);
    l.horas_bd = arredondar(l.horas_bd);
    l.horas_sp = arredondar(l.horas_sp);
  }
  return [...linhas.values()];
}

/** Movimento semanal de uma frota (a forma que o Resumo Semanal usa). */
export type MovimentoFrota = {
  pend_inicio: number;
  entradas: number;
  saidas: number;
  aguardam_pecas: number;
};

/**
 * Dias sintetizados de um PERÍODO (ex.: a semana do Resumo Semanal),
 * mês a mês para reutilizar o motor da Grelha. Devolve só os dias dentro
 * de [de, ate) e já vividos (data <= hoje), com marcações explícitas a
 * ganhar e troços de ordens/transições a interromper - exactamente as
 * regras da Grelha, para que o Resumo Semanal também nasça das ordens
 * e não de marcações manuais.
 */
export function sintetizarDiasPeriodo(params: {
  de: string; // AAAA-MM-DD (incluído)
  ate: string; // AAAA-MM-DD (excluído)
  hoje: string;
  equipamentos: { id: number; active: boolean }[];
  /** Marcações explícitas dos meses do período (disp_dias). */
  diasExplicitos: {
    equipment_id: number;
    data: string;
    estado: string | null;
    horas_disponiveis: number | string | null;
  }[];
  segmentos: SegmentoPonte[];
}): DiaSintetizado[] {
  const { de, ate, hoje, equipamentos, diasExplicitos, segmentos } = params;
  const meses = new Set<string>();
  for (let d = de; d < ate; d = new Date(new Date(d + "T00:00:00Z").getTime() + 86400000).toISOString().slice(0, 10)) {
    meses.add(d.slice(0, 7));
  }

  const saida: DiaSintetizado[] = [];
  for (const mes of [...meses].sort()) {
    const chaves = new Set<string>();
    for (const d of diasExplicitos) {
      const data = (d.data || "").slice(0, 10);
      if (data.length === 10 && data.slice(0, 7) === mes) chaves.add(`${d.equipment_id}|${data}`);
    }
    for (const s of sintetizarDias({ mes, hoje, equipamentos, chavesExplicitas: chaves, segmentos })) {
      if (s.data >= de && s.data < ate) saida.push(s);
    }
  }
  return saida;
}

/**
 * Movimento da semana calculado das ordens (o "Preencher das OS" e o
 * preenchimento automático do Resumo Semanal):
 * - Pend. início: aberta antes da semana e ainda sem saída no primeiro dia;
 * - Entradas: abertas dentro da semana;
 * - Saídas: com data de fecho dentro da semana;
 * - Aguardam peças: ainda abertas com estado físico "Aguarda Acessório".
 */
export function calcularMovimentoDeOrdens(
  ordens: {
    equipment_id: number;
    data_abertura: string | null;
    data_fecho: string | null;
    status_fisico: string | null;
  }[],
  frotaDe: (equipmentId: number) => string,
  frotas: string[],
  de: string,
  ate: string
): Record<string, MovimentoFrota> {
  const contagem: Record<string, MovimentoFrota> = {};
  for (const f of frotas) contagem[f] = { pend_inicio: 0, entradas: 0, saidas: 0, aguardam_pecas: 0 };
  for (const o of ordens) {
    const linha = contagem[frotaDe(o.equipment_id)];
    if (!linha) continue;
    const abertura = (o.data_abertura || "").slice(0, 10);
    const fecho = (o.data_fecho || "").slice(0, 10);
    const aberta = Boolean(abertura) && !fecho;
    if (abertura && abertura < de && (!fecho || fecho >= de)) linha.pend_inicio += 1;
    if (abertura >= de && abertura < ate) linha.entradas += 1;
    if (fecho && fecho >= de && fecho < ate) linha.saidas += 1;
    if (aberta && abertura < ate && (o.status_fisico || "") === "Aguarda Acessório") linha.aguardam_pecas += 1;
  }
  return contagem;
}

/** Paragem efectiva "neste momento" de cada máquina (a mais grave ganha). */
export function paradasDeHoje(
  segmentos: SegmentoPonte[],
  hoje: string,
  nomes: Map<number, { code: string; nome: string }>
): { id: number; equipment_id: number; estado: string; inicio: string; code: string; nome: string; obra: string | null; os_id: number | null }[] {
  const porMaquina = new Map<number, SegmentoPonte>();
  for (const s of segmentos) {
    if (s.inicio > hoje) continue;
    if (s.fim && s.fim < hoje) continue;
    const atual = porMaquina.get(s.equipment_id);
    if (!atual || indiceGravidade(s.estado) < indiceGravidade(atual.estado)) {
      porMaquina.set(s.equipment_id, s);
    }
  }
  return [...porMaquina.values()]
    .map((s) => {
      const e = nomes.get(s.equipment_id);
      return {
        id: s.os_id ? -s.os_id : -(1000000 + s.equipment_id),
        equipment_id: s.equipment_id,
        estado: s.estado,
        inicio: s.inicio,
        code: e?.code || "?",
        nome: e?.nome || "",
        obra: s.numero_obra,
        os_id: s.os_id
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}
