/**
 * /api/hst/campanha - A CAMPANHA DE CONTROLE da tensão arterial.
 *
 * O técnico de HST abre a campanha escolhendo o pessoal que passa a
 * medir com acompanhamento (quem não está na campanha mede normal para
 * controle pessoal). Com a campanha aberta, o % de tensão alta do
 * painel conta SOBRE o pessoal da campanha e deixa de ser uma
 * percentagem solta sobre todas as medições.
 *
 * GET: membros activos (ordem de entrada).
 * POST: entra na campanha (409 se já estiver activa).
 * DELETE: TIRA da campanha SEM apagar nada (a linha fica com
 *         ativo=false e a data de saída: é o histórico da campanha).
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import type { LinhaCampanhaHST } from "@/lib/hst";

/** Hoje em Maputo (UTC+2, sem hora de verão). */
function hojeMaputo(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET() {
  const auth = await autorizadoEmAlguma(["hst", "hst.tensao", "hst.relatorios"]);
  if (eErro(auth)) return auth;
  try {
    const membros = await queryTudo<LinhaCampanhaHST>(
      "hst_tensao_campanha",
      "select=*&ativo=eq.true&order=inicio.asc,criado_em.asc"
    );
    return NextResponse.json({ ok: true, membros });
  } catch (e) {
    return erroBase(e, "hst campanha GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("hst.tensao", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      colaborador_id?: number | null;
      colaborador_nome?: string;
    };
    const nome = corpo.colaborador_nome?.trim();
    if (!nome) {
      return NextResponse.json({ ok: false, erro: "Indica o colaborador." }, { status: 400 });
    }
    const activos = await queryTudo<LinhaCampanhaHST>(
      "hst_tensao_campanha",
      "select=*&ativo=eq.true"
    );
    const jaEsta = activos.some(
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
    await update(
      "hst_tensao_campanha",
      `id=eq.${id}`,
      { ativo: false, fim: hojeMaputo() }
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "hst campanha DELETE");
  }
}
