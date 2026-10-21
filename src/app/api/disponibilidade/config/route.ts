/**
 * /api/disponibilidade/config - Configurações da Disponibilidade.
 *
 * GET   -> meta de disponibilidade (80% por defeito).
 * PATCH -> actualizar a meta (regra do Filomeno: fixa no ecrã, mas
 *          ajustável aqui nas configurações).
 */

import { NextResponse } from "next/server";
import { query, update } from "@/lib/supabase";
import { autorizadoDisp, eErro, erroBase } from "@/lib/guarda-api";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await autorizadoDisp("disponibilidade.config", "ver");
  if (eErro(auth)) return auth;
  try {
    const linhas = await query<{ meta_disponibilidade: number; atualizado_em: string; atualizado_por: string | null }>(
      "disp_config",
      "select=meta_disponibilidade,atualizado_em,atualizado_por&id=eq.1&limit=1"
    );
    return NextResponse.json({
      ok: true,
      meta: linhas.length ? Number(linhas[0].meta_disponibilidade) || 80 : 80,
      atualizado_em: linhas.length ? linhas[0].atualizado_em : null,
      atualizado_por: linhas.length ? linhas[0].atualizado_por : null
    });
  } catch (e) {
    return erroBase(e, "ler configuração");
  }
}

export async function PATCH(request: Request) {
  const auth = await autorizadoDisp("disponibilidade.config", "editar");
  if (eErro(auth)) return auth;

  let corpo: { meta_disponibilidade?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }
  const meta = Number(corpo.meta_disponibilidade);
  if (!Number.isFinite(meta) || meta < 1 || meta > 100) {
    return NextResponse.json({ ok: false, erro: "A meta tem de estar entre 1 e 100 (%)." }, { status: 400 });
  }

  try {
    await update(
      "disp_config",
      "id=eq.1",
      {
        meta_disponibilidade: Math.round(meta * 10) / 10,
        atualizado_por: auth.utilizador.nome,
        atualizado_em: new Date().toISOString()
      }
    );
    return NextResponse.json({ ok: true, meta: Math.round(meta * 10) / 10 });
  } catch (e) {
    return erroBase(e, "gravar configuração");
  }
}
