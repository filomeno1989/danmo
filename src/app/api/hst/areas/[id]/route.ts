/**
 * /api/hst/areas/[id] - Uma área de risco (editar, activar/desactivar, apagar).
 */

import { NextResponse, NextRequest } from "next/server";
import { del, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { problemaArea, type AreaRiscoHST } from "@/lib/hst";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await autorizado("hst.areas", "mexer");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const corpo = (await req.json()) as {
      nome?: string;
      nivel_risco?: string;
      descricao?: string;
      medidas_controlo?: string;
      ativo?: boolean;
    };
    if (corpo.nome !== undefined || corpo.nivel_risco !== undefined) {
      const problema = problemaArea(corpo);
      if (problema) {
        return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
      }
    }
    const mudancas: Record<string, unknown> = {};
    if (corpo.nome !== undefined) mudancas.nome = corpo.nome.trim();
    if (corpo.nivel_risco !== undefined) mudancas.nivel_risco = corpo.nivel_risco.trim();
    if (corpo.descricao !== undefined) mudancas.descricao = corpo.descricao.trim() || null;
    if (corpo.medidas_controlo !== undefined) {
      mudancas.medidas_controlo = corpo.medidas_controlo.trim() || null;
    }
    if (corpo.ativo !== undefined) mudancas.ativo = corpo.ativo === true;
    if (!Object.keys(mudancas).length) {
      return NextResponse.json({ ok: false, erro: "Nada para actualizar." }, { status: 400 });
    }
    const [editada] = await update<AreaRiscoHST>(
      "hst_areas_risco",
      `id=eq.${encodeURIComponent(id)}`,
      mudancas
    );
    if (!editada) {
      return NextResponse.json({ ok: false, erro: "Área não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, area: editada });
  } catch (e) {
    return erroBase(e, "hst area PATCH");
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await autorizado("hst.areas", "apagar");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    await del("hst_areas_risco", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "hst area DELETE");
  }
}
