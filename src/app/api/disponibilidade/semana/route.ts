/**
 * /api/disponibilidade/semana - Resumo Semanal da Direcção.
 *
 * Integra o ficheiro do Director (Dashboard_Semanal_DANMO) no portal:
 * - tabela das 12 macro-frotas com Pend. início / Entradas / Saídas /
 *   Pend. fecho (início + entradas - saídas) / Aguardam peças;
 * - dificuldades da semana + plano de melhorias (responsável, prazo,
 *   estado: Por iniciar / Em curso / Concluído);
 * - disponibilidade real de cada frota na semana, calculada da grelha
 *   diária (disp_dias) e comparada com a meta.
 *
 * GET ?ano=2026&semana=42 -> dados guardados + números calculados das OS
 *   (pend_inicio/entradas/saidas/aguardam_pecas - preenchem as caixas
 *   sozinhos quando a semana ainda não foi gravada) + disponibilidade da
 *   semana + total de máquinas por frota + avarias frequentes/complexas
 *   da secção 03 + disponibilidade global da semana.
 * POST { ano, semana, linhas:[{frota,pend_inicio,entradas,saidas,
 *        aguardam_pecas}], dificuldades, melhorias,
 *        avarias:[{frota,frequentes,complexas}] } -> grava tudo.
 *   Se a tabela das avarias ainda não existir no Supabase, o resto
 *   grava na mesma e a resposta traz um aviso.
 */

import { NextResponse } from "next/server";
import { query, queryTudo, upsert } from "@/lib/supabase";
import { autorizadoDisp, eErro, erroBase } from "@/lib/guarda-api";
import {
  FROTAS_PADRAO,
  frotaDeGrupo,
  gruposDaFrota,
  intervaloSemanaISO,
  pctDisponibilidade
} from "@/lib/disponibilidade";
import { calcularMovimentoDeOrdens } from "@/lib/ponte-os";

export const dynamic = "force-dynamic";

type OsLinha = {
  id: number;
  equipment_id: number;
  data_abertura: string | null;
  data_fecho: string | null;
  status_atual: string | null;
  status_fisico: string | null;
};
type DiaLinha = { equipment_id: number; data: string; horas_disponiveis: number | string | null };
type SemanalLinha = {
  frota: string;
  pend_inicio: number | string;
  entradas: number | string;
  saidas: number | string;
  aguardam_pecas: number | string;
};
type GeralLinha = { dificuldades: string | null; melhorias: unknown };
type AvariaLinha = { frota: string; frequentes: string | null; complexas: string | null };
type EquipTotalLinha = { id: number; group_name: string | null; active: boolean | null };

const int = (v: unknown): number => Math.max(0, Math.trunc(Number(v) || 0));

export async function GET(request: Request) {
  const auth = await autorizadoDisp("ver");
  if (eErro(auth)) return auth;

  const url = new URL(request.url);
  const agora = new Date();
  const ano = Number(url.searchParams.get("ano")) || agora.getFullYear();
  const semana = Number(url.searchParams.get("semana"));
  if (!semana || semana < 1 || semana > 53) {
    return NextResponse.json({ ok: false, erro: "Semana inválida (1 a 53)." }, { status: 400 });
  }

  try {
    const { de, ate } = intervaloSemanaISO(ano, semana);

    const [os, equipamentos, dias, guardadas, geral, config] = await Promise.all([
      queryTudo<OsLinha>("ordens_servico", "select=id,equipment_id,data_abertura,data_fecho,status_atual,status_fisico"),
      queryTudo<EquipTotalLinha>("equipment", "select=id,group_name,active"),
      queryTudo<DiaLinha>(
        "disp_dias",
        `select=equipment_id,data,horas_disponiveis&data=gte.${de}&data=lt.${ate}`
      ),
      query<SemanalLinha>(
        "disp_semanal",
        `select=frota,pend_inicio,entradas,saidas,aguardam_pecas&ano=eq.${ano}&semana=eq.${semana}`
      ),
      query<GeralLinha>(
        "disp_semana_geral",
        `select=dificuldades,melhorias&ano=eq.${ano}&semana=eq.${semana}&limit=1`
      ),
      query<{ meta_disponibilidade: number }>("disp_config", "select=meta_disponibilidade&id=eq.1&limit=1")
    ]);

    const grupoDe = new Map(equipamentos.map((e) => [e.id, e.group_name || ""]));
    // números calculados das ordens (chaves iguais às linhas gravadas:
    // pend_inicio, entradas, saidas, aguardam_pecas)
    const osCalculado = calcularMovimentoDeOrdens(
      os,
      (id) => frotaDeGrupo(grupoDe.get(id)),
      FROTAS_PADRAO.map((f) => f.label),
      de,
      ate
    );

    // total de máquinas activas por frota (a coluna Total do ficheiro)
    const totalFrota: Record<string, number> = {};
    for (const f of FROTAS_PADRAO) totalFrota[f.label] = 0;
    for (const e of equipamentos) {
      if (e.active === false) continue;
      const frota = frotaDeGrupo(e.group_name);
      totalFrota[frota] = (totalFrota[frota] || 0) + 1;
    }

    // avarias frequentes e complexas da secção 03. Se a tabela ainda
    // não foi criada no Supabase, a secção nasce vazia e o resto segue.
    let avarias: Record<string, { frequentes: string; complexas: string }> = {};
    try {
      const av = await query<AvariaLinha>(
        "disp_semana_avarias",
        `select=frota,frequentes,complexas&ano=eq.${ano}&semana=eq.${semana}`
      );
      avarias = Object.fromEntries(
        av.map((a) => [a.frota, { frequentes: a.frequentes || "", complexas: a.complexas || "" }])
      );
    } catch {
      avarias = {};
    }

    // disponibilidade real da semana por frota (da grelha diária)
    const dispSemana = new Map<string, { a: number; t: number }>();
    let globalA = 0;
    let globalT = 0;
    for (const d of dias) {
      const frota = frotaDeGrupo(grupoDe.get(d.equipment_id));
      let bloco = dispSemana.get(frota);
      if (!bloco) {
        bloco = { a: 0, t: 0 };
        dispSemana.set(frota, bloco);
      }
      const horas = Number(d.horas_disponiveis) || 0;
      bloco.a += horas;
      bloco.t += 24;
      globalA += horas;
      globalT += 24;
    }
    const disponibilidade = Object.fromEntries(
      [...dispSemana.entries()].map(([f, v]) => [f, pctDisponibilidade(v.a, v.t)])
    );
    const disponibilidadeGlobal = globalT > 0 ? pctDisponibilidade(globalA, globalT) : null;

    const guardado = Object.fromEntries(
      guardadas.map((l) => [
        l.frota,
        {
          pend_inicio: int(l.pend_inicio),
          entradas: int(l.entradas),
          saidas: int(l.saidas),
          aguardam_pecas: int(l.aguardam_pecas)
        }
      ])
    );

    return NextResponse.json({
      ok: true,
      ano,
      semana,
      intervalo: { de, ate: new Date(new Date(ate + "T00:00:00Z").getTime() - 86400000).toISOString().slice(0, 10) },
      meta: config.length ? Number(config[0].meta_disponibilidade) || 80 : 80,
      frotas: FROTAS_PADRAO.map((f) => f.label),
      osCalculado,
      guardado,
      disponibilidade,
      disponibilidadeGlobal,
      totalFrota,
      avarias,
      geral: geral.length
        ? { dificuldades: geral[0].dificuldades || "", melhorias: geral[0].melhorias || [] }
        : { dificuldades: "", melhorias: [] }
    });
  } catch (e) {
    return erroBase(e, "ler resumo semanal");
  }
}

type MelhoriaEntrada = {
  descricao?: string;
  responsavel?: string;
  prazo?: string;
  estado?: string;
};

export async function POST(request: Request) {
  const auth = await autorizadoDisp("editar");
  if (eErro(auth)) return auth;
  const nomeUtilizador = auth.utilizador.nome;

  let corpo: {
    ano?: number;
    semana?: number;
    linhas?: { frota: string; pend_inicio: unknown; entradas: unknown; saidas: unknown; aguardam_pecas: unknown }[];
    dificuldades?: string;
    melhorias?: MelhoriaEntrada[];
    avarias?: { frota: string; frequentes?: unknown; complexas?: unknown }[];
  };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }
  const ano = Number(corpo.ano);
  const semana = Number(corpo.semana);
  if (!ano || !semana || semana < 1 || semana > 53) {
    return NextResponse.json({ ok: false, erro: "Ano ou semana inválidos." }, { status: 400 });
  }

  try {
    const rotulos = new Set(FROTAS_PADRAO.map((f) => f.label));
    const linhas = (corpo.linhas || [])
      .filter((l) => l && rotulos.has(l.frota))
      .map((l) => ({
        ano,
        semana,
        frota: l.frota,
        pend_inicio: int(l.pend_inicio),
        entradas: int(l.entradas),
        saidas: int(l.saidas),
        aguardam_pecas: int(l.aguardam_pecas),
        criado_por: nomeUtilizador
      }));
    if (linhas.length) {
      await upsert("disp_semanal", linhas, "ano,semana,frota");
    }

    const melhorias = (corpo.melhorias || [])
      .map((m) => ({
        descricao: String(m.descricao || "").slice(0, 500),
        responsavel: String(m.responsavel || "").slice(0, 120),
        prazo: String(m.prazo || "").slice(0, 40),
        estado: ["Por iniciar", "Em curso", "Concluído"].includes(m.estado || "")
          ? (m.estado as string)
          : "Por iniciar"
      }))
      .filter((m) => m.descricao);

    await upsert(
      "disp_semana_geral",
      [
        {
          ano,
          semana,
          dificuldades: String(corpo.dificuldades || "").slice(0, 4000) || null,
          melhorias,
          criado_por: nomeUtilizador
        }
      ],
      "ano,semana"
    );

    // Secção 03: avarias frequentes e complexas por frota. Se a tabela
    // ainda não existir no Supabase, o resto da semana fica gravado na
    // mesma e a resposta avisa em vez de partir.
    let avariasGravadas = 0;
    let aviso = "";
    const avarias = (corpo.avarias || [])
      .filter((a) => a && rotulos.has(a.frota))
      .map((a) => ({
        ano,
        semana,
        frota: a.frota,
        frequentes: String(a.frequentes || "").slice(0, 8000) || null,
        complexas: String(a.complexas || "").slice(0, 8000) || null,
        criado_por: nomeUtilizador
      }));
    if (avarias.length) {
      try {
        await upsert("disp_semana_avarias", avarias, "ano,semana,frota");
        avariasGravadas = avarias.length;
      } catch {
        aviso = "Semana gravada, mas as avarias não: falta a tabela disp_semana_avarias (colar o SQL fase4-semanal-avarias.sql no Supabase).";
      }
    }

    return NextResponse.json({
      ok: true,
      frotas: linhas.length,
      melhorias: melhorias.length,
      avarias: avariasGravadas,
      ...(aviso ? { aviso } : {})
    });
  } catch (e) {
    return erroBase(e, "gravar resumo semanal");
  }
}
