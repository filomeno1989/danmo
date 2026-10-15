/**
 * /api/disponibilidade/painel - Dados do Painel da Disponibilidade.
 *
 * GET ?ano=2026&mes=10|0&frota=<macro-frota|todos>
 *
 * Devolve numa só viagem (agregações calculadas no servidor a partir de
 * disp_mensal, disp_horometro e disp_config - os dados reais importados
 * dos excels AVAILABILITY OF MACHINES 2022-2026):
 * - meta de disponibilidade (80% por defeito, ajustável nas configurações);
 * - resumo dos 12 meses do ano (horas disponíveis, paradas, percentagem);
 * - comparação entre todos os anos existentes na base;
 * - quadro por frota (mês e ano, contra a meta);
 * - distribuição de horas por estado físico no período;
 * - horas trabalhadas do horómetro no mês;
 * - as 6 máquinas com mais horas paradas no período.
 *
 * "mes=0" significa o ano inteiro.
 */

import { NextResponse } from "next/server";
import { query, queryTudo } from "@/lib/supabase";
import { autorizadoDisp, eErro, erroBase } from "@/lib/guarda-api";
import { frotaDeGrupo, gruposDaFrota, pctDisponibilidade } from "@/lib/disponibilidade";

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

const n = (v: number | string | null | undefined): number => Number(v) || 0;

export async function GET(request: Request) {
  const auth = await autorizadoDisp("ver");
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

    // --- resumo dos 12 meses do ano escolhido
    const resumoMensal = Array.from({ length: 12 }, (_, i) => {
      const linhas = mensal.filter((l) => l.ano === ano && l.mes === i + 1);
      const horasA = linhas.reduce((s, l) => s + n(l.horas_a), 0);
      const horasTotal = linhas.reduce((s, l) => s + n(l.horas_total), 0);
      return {
        mes: i + 1,
        horasA: Math.round(horasA),
        parado: Math.round(horasTotal - horasA),
        total: Math.round(horasTotal),
        pct: pctDisponibilidade(horasA, horasTotal),
        maquinas: linhas.length
      };
    });

    // --- comparação entre anos (todos os que existem na base)
    const anosPresentes = [...new Set(mensal.map((l) => l.ano))].sort();
    const comparacaoAnos = anosPresentes.map((a) => {
      const linhas = mensal.filter((l) => l.ano === a);
      const horasA = linhas.reduce((s, l) => s + n(l.horas_a), 0);
      const horasTotal = linhas.reduce((s, l) => s + n(l.horas_total), 0);
      return { ano: a, pct: pctDisponibilidade(horasA, horasTotal), horasA: Math.round(horasA), total: Math.round(horasTotal) };
    });

    // --- período activo (mês escolhido ou ano inteiro)
    const linhasPeriodo = mensal.filter((l) => l.ano === ano && (mes === 0 || l.mes === mes));
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

    // --- horómetro do mês (só faz sentido por mês)
    let horometroMes: { trabalhadas: number; lancadas: number; totalMaquinas: number } | null = null;
    if (mes !== 0) {
      const linhas = horometroAno.filter((h) => h.mes === mes && eqVisiveis.has(h.equipment_id));
      const trabalhadas = linhas.reduce((s, h) => s + n(h.horas_trabalhadas), 0);
      const comFinal = linhas.filter((h) => h.horas_trabalhadas !== null && h.horas_trabalhadas !== undefined);
      const totalMaquinas = equipamentos.filter((e) => e.active && eqVisiveis.has(e.id)).length;
      horometroMes = {
        trabalhadas: Math.round(trabalhadas),
        lancadas: comFinal.length,
        totalMaquinas
      };
    }

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
    for (const l of mensal) {
      if (l.ano !== ano) continue;
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
      topParadas,
      disponibilidade: pctDisponibilidade(aPeriodo, totalPeriodo)
    });
  } catch (e) {
    return erroBase(e, "painel disponibilidade");
  }
}
