/**
 * /api/hst/acoes/[id] - Uma acção correctiva (editar, mudar status, apagar).
 *
 * PATCH: aceita qualquer subconjunto (descrição, responsável, prazo,
 *        observações, status). "Concluida" grava data_conclusao; sair de
 *        "Concluida" limpa a data (o hub nunca limpava: uma acção
 *        reaberta continuava com data de conclusão velha).
 * DELETE: apaga a acção (permissão de apagar).
 */

import { NextResponse, NextRequest } from "next/server";
import { del, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { problemaAccao, STATUS_ACCAO, type AccaoHST } from "@/lib/hst";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await autorizado("hst.acidentes", "mexer");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const corpo = (await req.json()) as {
      descricao_acao?: string;
      responsavel?: string;
      prazo?: string;
      observacoes?: string;
      status?: string;
    };

    if (
      corpo.descricao_acao !== undefined ||
      corpo.responsavel !== undefined ||
      corpo.prazo !== undefined
    ) {
      const problema = problemaAccao(corpo);
      if (problema) {
        return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
      }
    }

    const mudancas: Record<string, unknown> = {};
    if (corpo.descricao_acao !== undefined) mudancas.descricao_acao = corpo.descricao_acao.trim();
    if (corpo.responsavel !== undefined) mudancas.responsavel = corpo.responsavel.trim();
    if (corpo.prazo !== undefined) mudancas.prazo = String(corpo.prazo).slice(0, 10);
    if (corpo.observacoes !== undefined) mudancas.observacoes = corpo.observacoes.trim() || null;
    if (corpo.status !== undefined) {
      if (!STATUS_ACCAO.includes(corpo.status as (typeof STATUS_ACCAO)[number])) {
        return NextResponse.json({ ok: false, erro: "Status desconhecido." }, { status: 400 });
      }
      mudancas.status = corpo.status;
      mudancas.data_conclusao =
        corpo.status === "Concluida" ? new Date().toISOString() : null;
    }

    if (!Object.keys(mudancas).length) {
      return NextResponse.json({ ok: false, erro: "Nada para actualizar." }, { status: 400 });
    }

    const [editada] = await update<AccaoHST>(
      "hst_acoes_corretivas",
      `id=eq.${encodeURIComponent(id)}`,
      mudancas
    );
    if (!editada) {
      return NextResponse.json({ ok: false, erro: "Acção não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, accao: editada });
  } catch (e) {
    return erroBase(e, "hst accao PATCH");
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await autorizado("hst.acidentes", "apagar");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    await del("hst_acoes_corretivas", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "hst accao DELETE");
  }
}
