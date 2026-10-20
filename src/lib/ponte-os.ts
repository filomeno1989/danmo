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
 *
 * Tudo é calculado à LEITURA (síntese), sem escrever nada nas tabelas
 * disp_*: assim as ordens mudam e a grelha acompanha no segundo seguinte,
 * sem duplicar dados nem mexer no disp_mensal (fonte oficial do Painel).
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
 */
export function sintetizarDias(params: {
  mes: string;
  equipamentos: { id: number; active: boolean }[];
  chavesExplicitas: Set<string>;
  segmentos: SegmentoPonte[];
}): DiaSintetizado[] {
  const { mes, equipamentos, chavesExplicitas, segmentos } = params;
  const dias = diasDoMes(mes);

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
