/**
 * /api/disponibilidade/dias - Grelha diária de disponibilidade.
 *
 * GET ?mes=2026-02&frota=<macro-frota|todos>
 *   -> máquinas da frota + marcações diárias do mês + transições em curso
 *      (máquinas paradas neste momento) + resumo semanal do mês.
 *
 * POST { marcacoes: [{ equipment_id, data, estado, horas_disponiveis,
 *                      hora_entrada, hora_saida, observacao }] }
 *   -> grava a marcação (upsert), recalcula o agregado mensal de cada
 *      máquina tocada (disp_mensal) e reconstrói os segmentos de estado
 *      (disp_transicoes) das máquinas tocadas. Um segmento começa no
 *      primeiro dia marcado no estado e acaba no dia seguinte ao último
 *      dia marcado nesse estado; mudança de estado a meio = dois segmentos,
 *      cada um com as suas horas (requisito do Filomeno: contar 24h por dia
 *      desde que a máquina entra na oficina, mesmo sem ser mexida).
 */

import { NextResponse } from "next/server";
import { delFiltro, insert, query, queryTudo, upsert } from "@/lib/supabase";
import { autorizadoDisp, eErro, erroBase } from "@/lib/guarda-api";
import { gruposDaFrota, hojeMaputo, pctDisponibilidade, semanaISOde } from "@/lib/disponibilidade";

export const dynamic = "force-dynamic";

type EquipLinha = { id: number; code: string; name: string | null; group_name: string | null; active: boolean };
type DiaLinha = {
  id: number;
  equipment_id: number;
  data: string;
  estado: string | null;
  horas_disponiveis: number | string | null;
  hora_entrada: string | null;
  hora_saida: string | null;
  observacao: string | null;
  origem: string;
};
type TransicaoLinha = { id: number; equipment_id: number; estado: string; inicio: string; fim: string | null };

const n = (v: unknown): number => Number(v) || 0;

/** Última hora do dia em Maputo como timestamptz ISO (fim "por defeito"). */
function fimDeSegmento(dataUltimoDia: string): string {
  const d = new Date(dataUltimoDia + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

/** Reconstrói os segmentos de estado de uma máquina a partir dos dias marcados. */
async function reconstituirTransicoes(equipmentId: number, nomeUtilizador: string) {
  const dias = await queryTudo<{ data: string; estado: string | null }>(
    "disp_dias",
    `select=data,estado&equipment_id=eq.${equipmentId}&estado=not.is.null&order=data.asc`
  );
  await delFiltro("disp_transicoes", `equipment_id=eq.${equipmentId}&os_id=is.null`);

  const segmentos: { estado: string; primeiro: string; ultimo: string }[] = [];
  for (const d of dias) {
    const data = d.data.slice(0, 10);
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.estado === d.estado && new Date(fimDeSegmento(ultimo.ultimo)).getTime() === new Date(data + "T00:00:00Z").getTime()) {
      ultimo.ultimo = data;
    } else {
      segmentos.push({ estado: d.estado as string, primeiro: data, ultimo: data });
    }
  }
  if (!segmentos.length) return 0;
  const hoje = hojeMaputo();
  const agora = new Date();
  const linhas = segmentos.map((s) => {
    const fim = fimDeSegmento(s.ultimo);
    const aberto = new Date(fim).getTime() > agora.getTime() - 24 * 3600 * 1000 && s.ultimo >= hoje;
    return {
      equipment_id: equipmentId,
      estado: s.estado,
      inicio: `${s.primeiro}T00:00:00+02:00`,
      fim: aberto ? null : fim.replace("Z", "+02:00"),
      observacao: null,
      criado_por: nomeUtilizador
    };
  });
  await insert("disp_transicoes", linhas);
  return linhas.length;
}

/** Recalcula o agregado mensal (disp_mensal) de uma máquina num mês. */
async function recalcularMensal(equipmentId: number, ano: number, mes: number) {
  const de = `${ano}-${String(mes).padStart(2, "0")}-01`;
  const ateProx = mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  const dias = await queryTudo<{ estado: string | null; horas_disponiveis: number | string | null }>(
    "disp_dias",
    `select=estado,horas_disponiveis&equipment_id=eq.${equipmentId}&data=gte.${de}&data=lt.${ateProx}`
  );
  let a = 0, pm = 0, ty = 0, ac = 0, bd = 0, sp = 0;
  const temDados = dias.length > 0;
  for (const d of dias) {
    const horas = n(d.horas_disponiveis);
    a += horas;
    if (d.estado && d.estado !== "Disponível") {
      const horasEstado = Math.max(0, 24 - horas);
      if (d.estado === "Avariada") bd += horasEstado;
      else if (d.estado === "Acidentada") ac += horasEstado;
      else if (d.estado === "Pneumático") ty += horasEstado;
      else if (d.estado === "Revisão/Manutenção") pm += horasEstado;
      else if (d.estado === "Aguarda Acessório") sp += horasEstado;
      else if (d.estado === "Inspeção") pm += horasEstado;
    }
  }
  const total = new Date(Date.UTC(ano, mes, 0)).getUTCDate() * 24;
  const linha = {
    equipment_id: equipmentId, ano, mes,
    horas_a: Math.round(a * 100) / 100,
    horas_pm: Math.round(pm * 100) / 100,
    horas_ty: Math.round(ty * 100) / 100,
    horas_ac: Math.round(ac * 100) / 100,
    horas_bd: Math.round(bd * 100) / 100,
    horas_sp: Math.round(sp * 100) / 100,
    horas_total: total,
    origem: "sistema"
  };
  if (!temDados) {
    // sem marcações: apagar linha mensal antiga (a máquina sai das contas)
    await delFiltro("disp_mensal", `equipment_id=eq.${equipmentId}&ano=eq.${ano}&mes=eq.${mes}`);
    return;
  }
  await upsert("disp_mensal", [linha], "equipment_id,ano,mes");
}

export async function GET(request: Request) {
  const auth = await autorizadoDisp("ver");
  if (eErro(auth)) return auth;

  const url = new URL(request.url);
  const mesParam = url.searchParams.get("mes");
  const frota = url.searchParams.get("frota") || "todos";
  if (!mesParam || !/^\d{4}-\d{2}$/.test(mesParam)) {
    return NextResponse.json({ ok: false, erro: "Mês inválido (usar AAAA-MM)." }, { status: 400 });
  }
  const ano = Number(mesParam.slice(0, 4));
  const mes = Number(mesParam.slice(5, 7));
  if (mes < 1 || mes > 12) {
    return NextResponse.json({ ok: false, erro: "Mês inválido." }, { status: 400 });
  }

  try {
    const [equipamentos, dias, transicoesAbertas] = await Promise.all([
      queryTudo<EquipLinha>("equipment", "select=id,code,name,group_name,active&order=code.asc"),
      queryTudo<DiaLinha>(
        "disp_dias",
        `select=*&data=gte.${mesParam}-01&data=lt.${mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, "0")}-01`}`
      ),
      queryTudo<TransicaoLinha>("disp_transicoes", "select=id,equipment_id,estado,inicio,fim&fim=is.null")
    ]);

    const gruposFrota = gruposDaFrota(frota);
    const eqs = equipamentos.filter((e) => !gruposFrota || gruposFrota.includes(e.group_name || ""));
    const ids = new Set(eqs.map((e) => e.id));

    // resumo semanal do mês (requisito: disponibilidade também por semana)
    const semanas = new Map<number, { horasA: number; maquinas: Set<number>; dias: Set<string> }>();
    for (const d of dias) {
      if (!ids.has(d.equipment_id)) continue;
      const { ano: anoISO, semana } = semanaISOde(new Date(d.data.slice(0, 10) + "T00:00:00Z"));
      const chave = anoISO === ano ? semana : 0; // semanas que pertencem ao mês pela data
      if (!chave) continue;
      let bloco = semanas.get(semana);
      if (!bloco) {
        bloco = { horasA: 0, maquinas: new Set(), dias: new Set() };
        semanas.set(semana, bloco);
      }
      bloco.horasA += n(d.horas_disponiveis);
      bloco.maquinas.add(d.equipment_id);
      bloco.dias.add(d.data.slice(0, 10));
    }
    const resumoSemanal = [...semanas.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([semana, v]) => {
        const total = v.dias.size * v.maquinas.size * 24;
        return { semana, pct: pctDisponibilidade(v.horasA, total), maquinas: v.maquinas.size, dias: v.dias.size };
      });

    const horasMes = dias.reduce((s, d) => s + n(d.horas_disponiveis), 0);
    const abertas = transicoesAbertas.filter((t) => ids.has(t.equipment_id));

    return NextResponse.json({
      ok: true,
      mes: mesParam,
      equipamentos: eqs,
      dias: dias.filter((d) => ids.has(d.equipment_id)),
      transicoesAbertas: abertas.map((t) => {
        const e = eqs.find((x) => x.id === t.equipment_id);
        return { ...t, code: e?.code || "?", nome: e?.name || "" };
      }),
      resumoSemanal,
      resumoMes: {
        horasDisponiveis: Math.round(horasMes),
        diasMarcados: new Set(dias.map((d) => d.data.slice(0, 10))).size
      }
    });
  } catch (e) {
    return erroBase(e, "ler grelha");
  }
}

type Marcacao = {
  equipment_id: number;
  data: string;
  estado: string | null;
  horas_disponiveis: number | null;
  hora_entrada?: string | null;
  hora_saida?: string | null;
  observacao?: string | null;
};

export async function POST(request: Request) {
  const auth = await autorizadoDisp("editar");
  if (eErro(auth)) return auth;
  const nomeUtilizador = auth.utilizador.nome;

  let corpo: { marcacoes?: Marcacao[] };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }
  const marcacoes = corpo.marcacoes || [];
  if (!Array.isArray(marcacoes) || marcacoes.length === 0) {
    return NextResponse.json({ ok: false, erro: "Nenhuma marcação recebida." }, { status: 400 });
  }
  if (marcacoes.length > 20000) {
    return NextResponse.json({ ok: false, erro: "Demasiadas marcações de uma vez." }, { status: 400 });
  }

  try {
    const estadosValidos = new Set([
      "Disponível", "Avariada", "Acidentada", "Pneumático",
      "Revisão/Manutenção", "Inspeção", "Aguarda Acessório"
    ]);
    for (const m of marcacoes) {
      if (!m.equipment_id || !/^\d{4}-\d{2}-\d{2}$/.test(m.data || "")) {
        return NextResponse.json({ ok: false, erro: "Marcação com máquina ou data inválida." }, { status: 400 });
      }
      if (m.estado !== null && m.estado !== undefined && !estadosValidos.has(m.estado)) {
        return NextResponse.json({ ok: false, erro: `Estado desconhecido: ${m.estado}` }, { status: 400 });
      }
      if (m.horas_disponiveis !== null && m.horas_disponiveis !== undefined &&
          (n(m.horas_disponiveis) < 0 || n(m.horas_disponiveis) > 24)) {
        return NextResponse.json({ ok: false, erro: "As horas do dia vão de 0 a 24." }, { status: 400 });
      }
    }

    // estado -> horas por defeito (24 disponível, 0 parada); horas explicitas manda
    const linhas = marcacoes.map((m) => ({
      equipment_id: m.equipment_id,
      data: m.data,
      estado: m.estado ?? null,
      horas_disponiveis:
        m.horas_disponiveis !== null && m.horas_disponiveis !== undefined
          ? m.horas_disponiveis
          : m.estado
            ? m.estado === "Disponível" ? 24 : 0
            : null,
      hora_entrada: m.hora_entrada || null,
      hora_saida: m.hora_saida || null,
      observacao: m.observacao || null,
      origem: "sistema",
      criado_por: nomeUtilizador
    }));

    const gravadas = await upsert<DiaLinha>("disp_dias", linhas, "equipment_id,data");

    // pares (equipamento, mês) tocados -> recalcular mensal + transições
    const pares = new Map<number, Set<string>>();
    for (const l of gravadas) {
      const mesChave = l.data.slice(0, 7);
      if (!pares.has(l.equipment_id)) pares.set(l.equipment_id, new Set());
      pares.get(l.equipment_id)!.add(mesChave);
    }
    for (const [eq, meses] of pares) {
      for (const mesChave of meses) {
        await recalcularMensal(eq, Number(mesChave.slice(0, 4)), Number(mesChave.slice(5, 7)));
      }
      await reconstituirTransicoes(eq, nomeUtilizador);
    }

    return NextResponse.json({
      ok: true,
      gravadas: gravadas.length,
      maquinasTocadas: pares.size
    });
  } catch (e) {
    return erroBase(e, "gravar marcações");
  }
}

/** PATCH: apagar uma marcação (deixar o dia em branco). */
export async function DELETE(request: Request) {
  const auth = await autorizadoDisp("editar");
  if (eErro(auth)) return auth;

  const url = new URL(request.url);
  const equipmentId = Number(url.searchParams.get("equipment_id"));
  const data = url.searchParams.get("data");
  if (!equipmentId || !data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return NextResponse.json({ ok: false, erro: "Máquina ou data inválida." }, { status: 400 });
  }
  try {
    await delFiltro("disp_dias", `equipment_id=eq.${equipmentId}&data=eq.${data}`);
    await recalcularMensal(equipmentId, Number(data.slice(0, 4)), Number(data.slice(5, 7)));
    await reconstituirTransicoes(equipmentId, auth.utilizador.nome);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "apagar marcação");
  }
}
