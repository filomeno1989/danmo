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
 *   (para o botão "Preencher das OS") + disponibilidade da semana.
 * POST { ano, semana, linhas:[{frota,pend_inicio,entradas,saidas,
 *        aguardam_pecas}], dificuldades, melhorias } -> grava tudo.
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

export const dynamic = "force-dynamic";

type OsLinha = {
  id: number;
  equipment_id: number;
  data_abertura: string | null;
  data_fecho: string | null;
  status_atual: string | null;
  status_fisico: string | null;
};
type EquipLinha = { id: number; group_name: string | null };
type DiaLinha = { equipment_id: number; data: string; horas_disponiveis: number | string | null };
type SemanalLinha = {
  frota: string;
  pend_inicio: number | string;
  entradas: number | string;
  saidas: number | string;
  aguardam_pecas: number | string;
};
type GeralLinha = { dificuldades: string | null; melhorias: unknown };

const int = (v: unknown): number => Math.max(0, Math.trunc(Number(v) || 0));

/** Números calculados das OS para uma semana (o preenchimento automático). */
function calcularDasOs(
  os: OsLinha[],
  grupoDe: Map<number, string>,
  de: string,
  ate: string,
  inicioSemanaAnterior: string
) {
  const contagem = new Map<string, { pend: number; ent: number; sai: number; pecas: number }>();
  for (const f of FROTAS_PADRAO) {
    contagem.set(f.label, { pend: 0, ent: 0, sai: 0, pecas: 0 });
  }
  for (const o of os) {
    const frota = frotaDeGrupo(grupoDe.get(o.equipment_id));
    const linha = contagem.get(frota);
    if (!linha) continue;
    const abertura = (o.data_abertura || "").slice(0, 10);
    const fecho = (o.data_fecho || "").slice(0, 10);
    const aberta = Boolean(abertura) && !fecho;
    if (abertura && abertura < de && (!fecho || fecho >= de)) linha.pend += 1;
    if (abertura >= de && abertura < ate) linha.ent += 1;
    if (fecho && fecho >= de && fecho < ate) linha.sai += 1;
    if (aberta && abertura < ate && (o.status_fisico || "") === "Aguarda Acessório") linha.pecas += 1;
  }
  return contagem;
}

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
    const anterior = new Date(de + "T00:00:00Z");
    anterior.setUTCDate(anterior.getUTCDate() - 7);
    const inicioSemanaAnterior = anterior.toISOString().slice(0, 10);

    const [os, equipamentos, dias, guardadas, geral, config] = await Promise.all([
      queryTudo<OsLinha>("ordens_servico", "select=id,equipment_id,data_abertura,data_fecho,status_atual,status_fisico"),
      queryTudo<EquipLinha>("equipment", "select=id,group_name"),
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
    const osCalculado = Object.fromEntries(calcularDasOs(os, grupoDe, de, ate, inicioSemanaAnterior));

    // disponibilidade real da semana por frota (da grelha diária)
    const dispSemana = new Map<string, { a: number; t: number }>();
    for (const d of dias) {
      const frota = frotaDeGrupo(grupoDe.get(d.equipment_id));
      let bloco = dispSemana.get(frota);
      if (!bloco) {
        bloco = { a: 0, t: 0 };
        dispSemana.set(frota, bloco);
      }
      bloco.a += Number(d.horas_disponiveis) || 0;
      bloco.t += 24;
    }
    const disponibilidade = Object.fromEntries(
      [...dispSemana.entries()].map(([f, v]) => [f, pctDisponibilidade(v.a, v.t)])
    );

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

    return NextResponse.json({ ok: true, frotas: linhas.length, melhorias: melhorias.length });
  } catch (e) {
    return erroBase(e, "gravar resumo semanal");
  }
}
