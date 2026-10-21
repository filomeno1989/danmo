/**
 * /api/faturacao/tarifas - Tarifas de mão-de-obra (Standard, CdM...)
 * usadas como atalhos no editor para preencher o valor unitário.
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import type { TarifaFat } from "@/lib/faturacao";

const corta = (v: unknown, max: number) =>
  String(v === undefined || v === null ? "" : v).slice(0, max).trim();

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "faturacao",
    "faturacao.tarifas",
    "faturacao.editor"
  ]);
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true, tarifas: [] });
  }
  try {
    const tarifas = await query<TarifaFat>("tarifas", "select=*&order=valor_mzn.desc");
    return NextResponse.json({ ok: true, tarifas });
  } catch (e) {
    return erroBase(e, "faturacao tarifas GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("faturacao.tarifas", "mexer");
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true, id: "est-tar-nova" });
  }
  try {
    const c = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const descricao = corta(c.descricao, 120);
    if (!descricao)
      return NextResponse.json({ ok: false, erro: "Descrição obrigatória." }, { status: 400 });
    const criados = await insert<TarifaFat>("tarifas", {
      descricao,
      valor_mzn: num(c.valor_mzn)
    });
    return NextResponse.json({ ok: true, tarifa: criados[0] });
  } catch (e) {
    return erroBase(e, "faturacao tarifas POST");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("faturacao.tarifas", "mexer");
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true });
  }
  try {
    const c = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = corta(c.id, 40);
    if (!id) return NextResponse.json({ ok: false, erro: "Tarifa inválida." }, { status: 400 });
    const descricao = corta(c.descricao, 120);
    if (!descricao)
      return NextResponse.json({ ok: false, erro: "Descrição obrigatória." }, { status: 400 });
    await update<TarifaFat>("tarifas", `id=eq.${id}`, {
      descricao,
      valor_mzn: num(c.valor_mzn),
      ...(typeof c.ativo === "boolean" ? { ativo: c.ativo } : {})
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "faturacao tarifas PATCH");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autorizado("faturacao.tarifas", "apagar");
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true });
  }
  try {
    const id = corta(new URL(req.url).searchParams.get("id"), 40);
    if (!id) return NextResponse.json({ ok: false, erro: "Tarifa inválida." }, { status: 400 });
    await del("tarifas", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "faturacao tarifas DELETE");
  }
}
