/**
 * /api/disponibilidade/painel - Dados do Painel da Disponibilidade.
 *
 * GET ?ano=2026&mes=10|0&frota=<macro-frota|todos>
 *
 * Devolve numa só viagem (agregações calculadas no servidor):
 * - meta de disponibilidade (80% por defeito, ajustável nas configurações);
 * - resumo dos 12 meses do ano (horas disponíveis, paradas, percentagem);
 * - comparação entre todos os anos existentes na base;
 * - quadro por frota (mês e ano, contra a meta);
 * - distribuição de horas por estado físico no período;
 * - horas trabalhadas do horómetro no mês;
 * - as 6 máquinas com mais horas paradas no período.
 *
 * FONTES (pedido do Filomeno de 21/10: o Painel não pode estar vazio no
 * ano em que o diário já mostra dados reais):
 * - anos fechados: disp_mensal oficial (excels AVAILABILITY OF MACHINES
 *   2022-2025), como sempre, intacto;
 * - ano em curso: calculado na hora pela ponte das ordens (ponte-os.ts,
 *   o mesmo motor da Grelha), com marcações explícitas a ganhar e só
 *   dias já vividos (o mês em curso entra até hoje). Quando sair o excel
 *   oficial do ano, ele passa a mandar sozinho (ano passa a ser fechado).
 *
 * "mes=0" significa o ano inteiro.
 */

import { NextResponse } from "next/server";
import { query, queryTudo } from "@/lib/supabase";
import { autorizadoDisp, eErro, erroBase } from "@/lib/guarda-api";
import { frotaDeGrupo, gruposDaFrota, hojeMaputo, pctDisponibilidade } from "@/lib/disponibilidade";
import {
  segmentosDeOrdens,
  segmentosDeTransicoes,
  sintetizarAnoMensal,
  type OrdemPonte,
  type SegmentoPonte
} from "@/lib/ponte-os";
import type { OrdemServico } from "@/lib/oficina";

export const dynamic = "force-dynamic";

type MensalLinha = {
  equipment_id: number;
  ano: number;
  mes: number;
  horas_a: number | string;
  horas_pm: number | string;
  horas_ty: number | string;
  horas_ac: number | string;
  horas_bd: number | string;
  horas_sp: number | string;
  horas_total: number | string;
};

type EquipLinha = { id: number; code: string; name: string | null; group_name: string | null; active: boolean };
type HorometroLinha = { equipment_id: number; ano: number; mes: number; horas_trabalhadas: number | string | null };
type MaquinaPainel = {
  id: number;
  code: string;
  nome: string;
  pctMes: number | null;
  pctAno: number | null;
  horasMesA: number;
  paradoMes: number;
};

const n = (v: number | string | null | undefined): number => Number(v) || 0;

export async function GET(request: Request) {
  const auth = await autorizadoDisp("disponibilidade", "ver");
  if (eErro(auth)) return auth;

  const url = new URL(request.url);
  const agora = new Date();
  const ano = Number(url.searchParams.get("ano")) || agora.getFullYear();
  const mes = Number(url.searchParams.get("mes")) || 0;
  const frota = url.searchParams.get("frota") || "todos";

  try {
    const [equipamentos, mensalTudo, horometroAno, config] = await Promise.all([
      queryTudo<EquipLinha>("equipment", "select=id,code,name,group_name,active"),
      queryTudo<MensalLinha>("disp_mensal", "select=equipment_id,ano,mes,horas_a,horas_pm,horas_ty,horas_ac,horas_bd,horas_sp,horas_total"),
      queryTudo<HorometroLinha>(
        "disp_horometro",
        `select=equipment_id,ano,mes,horas_trabalhadas&ano=eq.${ano}`
      ),
      query<{ meta_disponibilidade: number }>("disp_config", "select=meta_disponibilidade&id=eq.1&limit=1")
    ]);

    const meta = config.length ? n(config[0].meta_disponibilidade) : 80;

    // filtro por macro-frota (via group_name dos equipamentos)
    const gruposFrota = gruposDaFrota(frota);
    const eqVisiveis = new Set(
      equipamentos
        .filter((e) => !gruposFrota || gruposFrota.includes(e.group_name || ""))
        .map((e) => e.id)
    );
    const grupoDe = new Map(equipamentos.map((e) => [e.id, e.group_name || ""]));

    const mensal = mensalTudo.filter((l) => eqVisiveis.has(l.equipment_id));

    const hoje = hojeMaputo();
    const anoActual = Number(hoje.slice(0, 4));

    /* ===== linhas do ano escolhido (oficial ou síntese do ano em curso) ===== */
    let linhasAno: MensalLinha[] = [];
    if (ano === anoActual) {
      const idsVisiveis = [...equipamentos.filter((e) => eqVisiveis.has(e.id)).map((e) => e.id)];
      const [ordensBrutas, transicoesAbertas, diasAno] = await Promise.all([
        queryTudo<OrdemServico>(
          "ordens_servico",
          `select=id,numero_obra,equipment_id,data_abertura,data_fecho,status_atual,status_fisico,atualizado_em&data_abertura=lte.${ano}-12-31`
        ),
        queryTudo<{ id: number; equipment_id: number; estado: string; inicio: string }>(
          "disp_transicoes",
          "select=id,equipment_id,estado,inicio&fim=is.null"
        ),
        queryTudo<{ equipment_id: number; data: string; estado: string | null; horas_disponiveis: number | string | null }>(
          "disp_dias",
          `select=equipment_id,data,estado,horas_disponiveis&data=gte.${ano}-01-01&data=lt.${ano + 1}-01-01`
        )
      ]);
      const conjunto = new Set(idsVisiveis);
      const ordensVisiveis = ordensBrutas.filter((o) => conjunto.has(o.equipment_id));
      const idsCdm = ordensVisiveis
        .filter((o) => o.status_atual === "CdM" && !o.data_fecho)
        .map((o) => o.id);
      const logsCdm = idsCdm.length
        ? await queryTudo<{ os_id: number; data_mudanca: string }>(
            "os_status_log",
            `select=os_id,data_mudanca&status_novo=eq.CdM&os_id=in.(${idsCdm.join(",")})&order=data_mudanca.asc`
          )
        : [];
      const saidaCdM = new Map<number, string>();
      for (const l of logsCdm) {
        const d = (l.data_mudanca || "").slice(0, 10);
        if (d && d > (saidaCdM.get(l.os_id) || "")) saidaCdM.set(l.os_id, d);
      }
      const ordensPonte: OrdemPonte[] = ordensVisiveis.map((o) => ({
        id: o.id,
        numero_obra: o.numero_obra || null,
        equipment_id: o.equipment_id,
        data_abertura: o.data_abertura || null,
        status_atual: o.status_atual,
        status_fisico: o.status_fisico || null,
        saida:
          o.status_atual === "Fechada" || o.status_atual === "CdM"
            ? (o.data_fecho || "").slice(0, 10) ||
              saidaCdM.get(o.id) ||
              (o.atualizado_em || "").slice(0, 10) ||
              null
            : null
      }));
      const segmentos: SegmentoPonte[] = [
        ...segmentosDeOrdens(ordensPonte),
        ...segmentosDeTransicoes(
          transicoesAbertas
            .filter((t) => conjunto.has(t.equipment_id))
            .map((t) => ({ id: t.id, equipment_id: t.equipment_id, estado: t.estado, inicio: (t.inicio || "").slice(0, 10) })),
          hoje
        )
      ];
      linhasAno = sintetizarAnoMensal({
        ano,
        hoje,
        equipamentos: equipamentos.filter((e) => eqVisiveis.has(e.id)),
        diasExplicitos: diasAno.filter((d) => conjunto.has(d.equipment_id)),
        segmentos
      });
    } else {
      linhasAno = mensal.filter((l) => l.ano === ano);
    }

    // --- resumo dos 12 meses do ano escolhido
    const resumoMensal = Array.from({ length: 12 }, (_, i) => {
      const linhas = linhasAno.filter((l) => l.mes === i + 1);
      const horasA = linhas.reduce((s, l) => s + n(l.horas_a), 0);
      const horasTotal = linhas.reduce((s, l) => s + n(l.horas_total), 0);
      const horasBD = linhas.reduce((s, l) => s + n(l.horas_bd), 0);
      const horasAC = linhas.reduce((s, l) => s + n(l.horas_ac), 0);
      const horasTY = linhas.reduce((s, l) => s + n(l.horas_ty), 0);
      const horasPM = linhas.reduce((s, l) => s + n(l.horas_pm), 0);
      const horasSP = linhas.reduce((s, l) => s + n(l.horas_sp), 0);
      return {
        mes: i + 1,
        horasA: Math.round(horasA),
        parado: Math.round(horasTotal - horasA),
        total: Math.round(horasTotal),
        pct: pctDisponibilidade(horasA, horasTotal),
        maquinas: linhas.length,
        estados: {
          Disponível: Math.round(horasA),
          Acidentada: Math.round(horasAC),
          Avariada: Math.round(horasBD),
          "Revisão/Manutenção": Math.round(horasPM),
          "Aguarda Acessório": Math.round(horasSP),
          Pneumático: Math.round(horasTY)
        }
      };
    });

    // --- comparação entre anos (oficiais + o ano em curso sintetizado;
    // as linhas disp_mensal do ano em curso ficam de fora para não contar dobrado)
    const todasLinhas =
      ano === anoActual ? [...mensal.filter((l) => l.ano !== anoActual), ...linhasAno] : mensal;
    const anosPresentes = [...new Set(todasLinhas.map((l) => l.ano))].sort((a, b) => a - b);
    const comparacaoAnos = anosPresentes.map((a) => {
      const linhas = todasLinhas.filter((l) => l.ano === a);
      const horasA = linhas.reduce((s, l) => s + n(l.horas_a), 0);
      const horasTotal = linhas.reduce((s, l) => s + n(l.horas_total), 0);
      return { ano: a, pct: pctDisponibilidade(horasA, horasTotal), horasA: Math.round(horasA), total: Math.round(horasTotal) };
    });

    // --- período activo (mês escolhido ou ano inteiro)
    const linhasPeriodo = linhasAno.filter((l) => mes === 0 || l.mes === mes);
    const aPeriodo = linhasPeriodo.reduce((s, l) => s + n(l.horas_a), 0);
    const totalPeriodo = linhasPeriodo.reduce((s, l) => s + n(l.horas_total), 0);

    const estados: Record<string, number> = {
      Disponível: 0, Avariada: 0, Acidentada: 0, Pneumático: 0,
      "Revisão/Manutenção": 0, "Aguarda Acessório": 0, Inspeção: 0
    };
    for (const l of linhasPeriodo) {
      estados.Disponível += n(l.horas_a);
      estados.Avariada += n(l.horas_bd);
      estados.Acidentada += n(l.horas_ac);
      estados.Pneumático += n(l.horas_ty);
      estados["Revisão/Manutenção"] += n(l.horas_pm);
      estados["Aguarda Acessório"] += n(l.horas_sp);
    }

    // --- horómetro (mês escolhido ou o ano inteiro)
    const linhasH = horometroAno.filter(
      (h) => (mes === 0 || h.mes === mes) && eqVisiveis.has(h.equipment_id)
    );
    const trabalhadas = linhasH.reduce((s, h) => s + n(h.horas_trabalhadas), 0);
    const comFinal = linhasH.filter((h) => h.horas_trabalhadas !== null && h.horas_trabalhadas !== undefined);
    const totalMaquinas = equipamentos.filter((e) => e.active && eqVisiveis.has(e.id)).length;
    const horometroMes = {
      trabalhadas: Math.round(trabalhadas),
      lancadas: comFinal.length,
      totalMaquinas
    };

    // --- quadro por frota (12 macro-frotas; com dados do mês e do ano)
    const mapaFrota = new Map<string, { mesA: number; mesT: number; anoA: number; anoT: number; maquinas: Set<number> }>();
    const garantir = (g: string | null) => {
      const chave = frotaDeGrupo(g);
      let linha = mapaFrota.get(chave);
      if (!linha) {
        linha = { mesA: 0, mesT: 0, anoA: 0, anoT: 0, maquinas: new Set() };
        mapaFrota.set(chave, linha);
      }
      return linha;
    };
    for (const e of equipamentos) {
      if (!eqVisiveis.has(e.id) || !e.active) continue;
      garantir(e.group_name).maquinas.add(e.id);
    }
    for (const l of linhasAno) {
      const linha = garantir(grupoDe.get(l.equipment_id) ?? "");
      linha.anoA += n(l.horas_a);
      linha.anoT += n(l.horas_total);
      if (l.mes === mes) {
        linha.mesA += n(l.horas_a);
        linha.mesT += n(l.horas_total);
      }
    }
    const porFrota = [...mapaFrota.entries()]
      .map(([frotaL, v]) => ({
        frota: frotaL,
        maquinas: v.maquinas.size,
        pctMes: mes === 0 ? null : pctDisponibilidade(v.mesA, v.mesT),
        pctAno: pctDisponibilidade(v.anoA, v.anoT),
        paradoMes: Math.round(v.mesT - v.mesA)
      }))
      .sort((a, b) => a.frota.localeCompare(b.frota));

    // --- drill-down: quando uma frota é escolhida, devolve CADA máquina
    // da frota com a sua própria percentagem (mês e ano) - o pedido do
    // Filomeno: "seleciono Reach-Stacker e ele descarrega todas com a
    // percentagem de cada uma"
    let maquinas: MaquinaPainel[] | null = null;
    if (frota !== "todos") {
      const mesPorEq = new Map<number, { a: number; t: number }>();
      for (const l of linhasPeriodo) {
        const r = mesPorEq.get(l.equipment_id) || { a: 0, t: 0 };
        r.a += n(l.horas_a);
        r.t += n(l.horas_total);
        mesPorEq.set(l.equipment_id, r);
      }
      const anoPorEq = new Map<number, { a: number; t: number }>();
      for (const l of linhasAno) {
        const r = anoPorEq.get(l.equipment_id) || { a: 0, t: 0 };
        r.a += n(l.horas_a);
        r.t += n(l.horas_total);
        anoPorEq.set(l.equipment_id, r);
      }
      maquinas = equipamentos
        .filter((e) => e.active && eqVisiveis.has(e.id))
        .map((e) => {
          const m = mesPorEq.get(e.id);
          const a = anoPorEq.get(e.id);
          return {
            id: e.id,
            code: e.code,
            nome: e.name || "",
            pctMes: m && m.t > 0 ? pctDisponibilidade(m.a, m.t) : null,
            pctAno: a && a.t > 0 ? pctDisponibilidade(a.a, a.t) : null,
            horasMesA: Math.round(m?.a || 0),
            paradoMes: Math.round(m ? m.t - m.a : 0)
          };
        })
        .sort((x, y) => {
          // as piores do período primeiro (sem dados no fim), desempate por código
          if (x.pctMes === null && y.pctMes === null) return x.code.localeCompare(y.code);
          if (x.pctMes === null) return 1;
          if (y.pctMes === null) return -1;
          return x.pctMes - y.pctMes || x.code.localeCompare(y.code);
        });
    }

    // --- top 6 máquinas com mais horas paradas no período
    const paradasPorEq = new Map<number, number>();
    for (const l of linhasPeriodo) {
      paradasPorEq.set(l.equipment_id, (paradasPorEq.get(l.equipment_id) || 0) + (n(l.horas_total) - n(l.horas_a)));
    }
    const topParadas = [...paradasPorEq.entries()]
      .filter(([, h]) => h > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, horas]) => {
        const e = equipamentos.find((x) => x.id === id);
        return {
          code: e?.code || "?",
          nome: e?.name || "",
          frota: frotaDeGrupo(e?.group_name),
          horas: Math.round(horas)
        };
      });

    return NextResponse.json({
      ok: true,
      meta,
      ano,
      mes,
      resumoMensal,
      comparacaoAnos,
      estados,
      horometroMes,
      porFrota,
      maquinas,
      topParadas,
      disponibilidade: pctDisponibilidade(aPeriodo, totalPeriodo)
    });
  } catch (e) {
    return erroBase(e, "painel disponibilidade");
  }
}
