/**
 * /api/faturacao/clientes - Cadastro de clientes da Faturação.
 *
 * GET: todos (activos e inactivos; os inactivos ficam fora do select
 *      do editor mas continuam na lista para poderem ser reactivados -
 *      correcção sobre o hub antigo, onde desapareciam para sempre).
 * POST/PATCH/DELETE: gestão pela página Clientes (mexer / apagar).
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import type { ClienteFat } from "@/lib/faturacao";

const corta = (v: unknown, max: number) =>
  String(v === undefined || v === null ? "" : v).slice(0, max).trim();

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "faturacao",
    "faturacao.clientes",
    "faturacao.editor"
  ]);
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true, clientes: [] });
  }
  try {
    const clientes = await query<ClienteFat>("clientes", "select=*&order=nome.asc");
    return NextResponse.json({ ok: true, clientes });
  } catch (e) {
    return erroBase(e, "faturacao clientes GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("faturacao.clientes", "mexer");
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true, id: "est-cli-novo" });
  }
  try {
    const c = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const nome = corta(c.nome, 160);
    if (!nome) return NextResponse.json({ ok: false, erro: "Nome obrigatório." }, { status: 400 });
    const criados = await insert<ClienteFat>("clientes", {
      nome,
      morada: corta(c.morada, 200),
      nuit: corta(c.nuit, 40),
      contacto: corta(c.contacto, 80)
    });
    return NextResponse.json({ ok: true, cliente: criados[0] });
  } catch (e) {
    return erroBase(e, "faturacao clientes POST");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("faturacao.clientes", "mexer");
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true });
  }
  try {
    const c = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = corta(c.id, 40);
    if (!id) return NextResponse.json({ ok: false, erro: "Cliente inválido." }, { status: 400 });
    const nome = corta(c.nome, 160);
    if (!nome) return NextResponse.json({ ok: false, erro: "Nome obrigatório." }, { status: 400 });
    await update<ClienteFat>("clientes", `id=eq.${id}`, {
      nome,
      morada: corta(c.morada, 200),
      nuit: corta(c.nuit, 40),
      contacto: corta(c.contacto, 80),
      ...(typeof c.ativo === "boolean" ? { ativo: c.ativo } : {})
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "faturacao clientes PATCH");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autorizado("faturacao.clientes", "apagar");
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true });
  }
  try {
    const id = corta(new URL(req.url).searchParams.get("id"), 40);
    if (!id) return NextResponse.json({ ok: false, erro: "Cliente inválido." }, { status: 400 });
    // Os documentos guardam cópia dos dados do cliente (snapshot), por
    // isso apagar o cadastro não estraga o histórico (mesma lógica do
    // hub antigo). Alternativa mais suave: desactivar (PATCH com ativo).
    await del("clientes", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "faturacao clientes DELETE");
  }
}
