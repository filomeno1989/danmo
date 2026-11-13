/**
 * /api/hst/epis/[id] - Um EPI (editar, activar/desactivar, apagar).
 *
 * PATCH: o stock pode ser ajustado à mão (o stock "verdade" é o do
 *        catálogo; as entregas baixam-no e a reposição é editada aqui).
 */

import { NextResponse, NextRequest } from "next/server";
import { del, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { problemaEpi, type EpiHST } from "@/lib/hst";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await autorizado("hst.epis", "mexer");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const corpo = (await req.json()) as {
      nome?: string;
      ca?: string;
      stock_atual?: number;
      descricao?: string;
      ativo?: boolean;
    };
    if (corpo.nome !== undefined || corpo.stock_atual !== undefined) {
      const problema = problemaEpi(corpo);
      if (problema) {
        return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
      }
    }
    const mudancas: Record<string, unknown> = {};
    if (corpo.nome !== undefined) mudancas.nome = corpo.nome.trim();
    if (corpo.ca !== undefined) mudancas.ca = corpo.ca.trim() || null;
    if (corpo.stock_atual !== undefined) {
      mudancas.stock_atual = Math.max(0, Number(corpo.stock_atual) || 0);
    }
    if (corpo.descricao !== undefined) mudancas.descricao = corpo.descricao.trim() || null;
    if (corpo.ativo !== undefined) mudancas.ativo = corpo.ativo === true;
    if (!Object.keys(mudancas).length) {
      return NextResponse.json({ ok: false, erro: "Nada para actualizar." }, { status: 400 });
    }
    const [editado] = await update<EpiHST>(
      "hst_epis",
      `id=eq.${encodeURIComponent(id)}`,
      mudancas
    );
    if (!editado) {
      return NextResponse.json({ ok: false, erro: "EPI não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, epi: editado });
  } catch (e) {
    return erroBase(e, "hst epi PATCH");
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await autorizado("hst.epis", "apagar");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    await del("hst_epis", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "hst epi DELETE");
  }
}
