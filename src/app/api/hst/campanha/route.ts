/**
 * /api/hst/campanha - A CAMPANHA DE CONTROLE da tensão arterial (Fase 11/12).
 *
 * A campanha tem NUMERAÇÃO, DATAS GERIDAS PELA EQUIPA e CICLO DE VIDA:
 * o técnico ABRE a Campanha 01 escolhendo a data de início e o pessoal
 * que passa a medir com acompanhamento; pode CORRIGIR o início enquanto
 * estiver aberta; quando o controle termina, ARQUIVA escolhendo a data
 * de fim (fica no histórico para consultar ou gerar o relatório a
 * qualquer momento) e a campanha seguinte nasce com o número seguinte
 * (nunca reusa). Quem não está na campanha mede normal para controle
 * pessoal. Com a campanha aberta, o % de tensão alta do painel conta
 * SOBRE o pessoal da campanha.
 *
 * GET: campanha aberta + membros activos + arquivadas (e a contagem do
 *      pessoal antigo sem campanha numerada, para o ecrã avisar).
 *      Com ?id=<uuid> devolve UMA campanha e o pessoal do RELATÓRIO:
 *      na aberta são os que estão nela AGORA (quem foi tirado não
 *      aparece); na arquivada são os que estavam nela quando foi
 *      arquivada (quem saiu antes não aparece). É o que o papel usa.
 * POST: { acao: "abrir", inicio? } cria a campanha com o número
 *       seguinte e a data de início ESCOLHIDA (ou hoje) e LIGA
 *       automaticamente o pessoal activo que ficou sem campanha;
 *       { acao: "datas", inicio } corrige o início da campanha aberta;
 *       { acao: "arquivar", fim? } fecha a campanha aberta na data de
 *       fim ESCOLHIDA (ou hoje); sem acao (ou "entrar") mete um
 *       colaborador na campanha aberta (409 se já estiver).
 * DELETE: TIRA o colaborador da campanha SEM apagar nada (a linha fica
 *         com ativo=false e a data de saída: é o histórico).
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  filtroMembrosRelatorio,
  problemaDatasCampanha,
  proximoNumeroCampanha,
  type CampanhaHST,
  type LinhaCampanhaHST
} from "@/lib/hst";

/** Hoje em Maputo (UTC+2, sem hora de verão). */
function hojeMaputo(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Data validada do corpo (AAAA-MM-DD) ou null quando não veio. */
function dataDoCorpo(valor: string | undefined): string | null {
  const v = String(valor || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function GET(req: NextRequest) {
  const auth = await autorizadoEmAlguma(["hst", "hst.tensao", "hst.relatorios"]);
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (id) {
      // Consulta de UMA campanha (arquivada ou aberta), para o papel.
      const [campanha] = await queryTudo<CampanhaHST>(
        "hst_tensao_campanhas",
        `select=*&id=eq.${id}`
      );
      if (!campanha) {
        return NextResponse.json({ ok: false, erro: "Campanha não encontrada." }, { status: 404 });
      }
      // O relatório respeita as REMOÇÕES: quem foi tirado (ativo=false
      // com data de saída própria) não entra. Na campanha ABERTA entram
      // os que estão nela agora; na ARQUIVADA entram os que estavam
      // quando foi arquivada (fim deles = fim da campanha, gravação
      // antiga) ou continuam marcados como estavam (fim vazio).
      const filtroMembros = filtroMembrosRelatorio(campanha);
      const membros = await queryTudo<LinhaCampanhaHST>(
        "hst_tensao_campanha",
        `select=*&${filtroMembros}&order=inicio.asc,criado_em.asc`
      );
      return NextResponse.json({ ok: true, campanha, membros });
    }

    const abertas = await queryTudo<CampanhaHST>(
      "hst_tensao_campanhas",
      "select=*&estado=eq.aberta&order=numero.desc"
    );
    const campanha = abertas[0] || null;
    const membros = campanha
      ? await queryTudo<LinhaCampanhaHST>(
          "hst_tensao_campanha",
          `select=*&campanha_id=eq.${campanha.id}&ativo=eq.true&order=inicio.asc,criado_em.asc`
        )
      : [];
    const arquivadas = await queryTudo<CampanhaHST>(
      "hst_tensao_campanhas",
      "select=*&estado=eq.arquivada&order=numero.desc"
    );
    // Pessoal activo antigo (fase 10) que ainda não tem campanha numerada.
    const orfaos = await queryTudo<LinhaCampanhaHST>(
      "hst_tensao_campanha",
      "select=*&ativo=eq.true&campanha_id=is.null"
    );
    return NextResponse.json({
      ok: true,
      campanha,
      membros,
      arquivadas,
      semCampanha: orfaos.length
    });
  } catch (e) {
    return erroBase(e, "hst campanha GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("hst.tensao", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      acao?: "abrir" | "arquivar" | "entrar" | "datas";
      colaborador_id?: number | null;
      colaborador_nome?: string;
      inicio?: string;
      fim?: string;
    };
    const acao = corpo.acao || "entrar";

    if (acao === "abrir") {
      const abertas = await queryTudo<CampanhaHST>(
        "hst_tensao_campanhas",
        "select=*&estado=eq.aberta&order=numero.desc"
      );
      if (abertas.length > 0) {
        return NextResponse.json(
          { ok: false, erro: "Já há uma campanha aberta. Arquiva-a antes de abrir outra." },
          { status: 409 }
        );
      }
      const inicio = dataDoCorpo(corpo.inicio) || hojeMaputo();
      const avisoDatas = problemaDatasCampanha(inicio);
      if (avisoDatas) {
        return NextResponse.json({ ok: false, erro: avisoDatas }, { status: 400 });
      }
      const numeradas = await queryTudo<{ numero: number }>(
        "hst_tensao_campanhas",
        "select=numero&order=numero.desc"
      );
      const numero = proximoNumeroCampanha(numeradas[0]?.numero);
      const [campanha] = await insert<CampanhaHST>("hst_tensao_campanhas", {
        numero,
        inicio,
        criado_por: auth.utilizador.nome
      });
      // O pessoal activo antigo (sem campanha numerada) entra nesta
      // automaticamente: nada do que já foi escolhido se perde.
      await update("hst_tensao_campanha", "campanha_id=is.null&ativo=eq.true", {
        campanha_id: campanha.id
      });
      return NextResponse.json({ ok: true, campanha });
    }

    if (acao === "datas") {
      // Correcção do INÍCIO da campanha aberta (as equipas gerem as datas).
      const abertas = await queryTudo<CampanhaHST>(
        "hst_tensao_campanhas",
        "select=*&estado=eq.aberta&order=numero.desc"
      );
      const campanha = abertas[0];
      if (!campanha) {
        return NextResponse.json({ ok: false, erro: "Não há campanha aberta para ajustar." }, { status: 409 });
      }
      const inicio = dataDoCorpo(corpo.inicio);
      if (!inicio) {
        return NextResponse.json(
          { ok: false, erro: problemaDatasCampanha(corpo.inicio) || "Indica a data de início." },
          { status: 400 }
        );
      }
      await update("hst_tensao_campanhas", `id=eq.${campanha.id}`, { inicio });
      return NextResponse.json({ ok: true });
    }

    if (acao === "arquivar") {
      const abertas = await queryTudo<CampanhaHST>(
        "hst_tensao_campanhas",
        "select=*&estado=eq.aberta&order=numero.desc"
      );
      const campanha = abertas[0];
      if (!campanha) {
        return NextResponse.json({ ok: false, erro: "Não há campanha aberta para arquivar." }, { status: 409 });
      }
      const fim = dataDoCorpo(corpo.fim) || hojeMaputo();
      const avisoDatas = problemaDatasCampanha(campanha.inicio, fim);
      if (avisoDatas) {
        return NextResponse.json({ ok: false, erro: avisoDatas }, { status: 400 });
      }
      // Fecha SÓ a campanha: o pessoal fica como está (quem foi tirado
      // continua fora, quem estava continua no relatório arquivado).
      await update("hst_tensao_campanhas", `id=eq.${campanha.id}`, {
        estado: "arquivada",
        fim
      });
      return NextResponse.json({ ok: true });
    }

    // entrar: sem campanha aberta não há onde entrar.
    const abertas = await queryTudo<CampanhaHST>(
      "hst_tensao_campanhas",
      "select=*&estado=eq.aberta&order=numero.desc"
    );
    const campanha = abertas[0];
    if (!campanha) {
      return NextResponse.json(
        { ok: false, erro: "Abre a campanha primeiro: não há campanha aberta." },
        { status: 409 }
      );
    }
    const nome = corpo.colaborador_nome?.trim();
    if (!nome) {
      return NextResponse.json({ ok: false, erro: "Indica o colaborador." }, { status: 400 });
    }
    const membros = await queryTudo<LinhaCampanhaHST>(
      "hst_tensao_campanha",
      `select=*&campanha_id=eq.${campanha.id}&ativo=eq.true`
    );
    const jaEsta = membros.some(
      (m) =>
        (corpo.colaborador_id != null && m.colaborador_id === corpo.colaborador_id) ||
        m.colaborador_nome === nome
    );
    if (jaEsta) {
      return NextResponse.json(
        { ok: false, erro: "Este colaborador já está na campanha." },
        { status: 409 }
      );
    }
    const [membro] = await insert<LinhaCampanhaHST>("hst_tensao_campanha", {
      colaborador_id: corpo.colaborador_id ?? null,
      colaborador_nome: nome,
      campanha_id: campanha.id,
      criado_por: auth.utilizador.nome
    });
    return NextResponse.json({ ok: true, membro });
  } catch (e) {
    return erroBase(e, "hst campanha POST");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autorizado("hst.tensao", "mexer");
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Id do membro em falta." }, { status: 400 });
    }
    // Sai da campanha sem apagar: fica o histórico com a data de saída.
    await update("hst_tensao_campanha", `id=eq.${id}`, {
      ativo: false,
      fim: hojeMaputo()
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "hst campanha DELETE");
  }
}
