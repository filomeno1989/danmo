/**
 * /api/faturacao/tecnicos - Técnicos disponíveis nas linhas de
 * mão-de-obra (lista própria da Faturação, separada dos colaboradores
 * da oficina, igual ao hub antigo).
 *
 * Melhoria: as tarifas por técnico servem para preencher o valor
 * unitário automaticamente quando são maiores que zero (no histórico
 * real estão a 0 e usa-se os atalhos da página Tarifas).
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import type { TecnicoFat } from "@/lib/faturacao";

const corta = (v: unknown, max: number) =>
  String(v === undefined || v === null ? "" : v).slice(0, max).trim();

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "faturacao",
    "faturacao.tecnicos",
    "faturacao.editor"
  ]);
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true, tecnicos: [] });
  }
  try {
    const tecnicos = await query<TecnicoFat>("tecnicos", "select=*&order=nome.asc");
    return NextResponse.json({ ok: true, tecnicos });
  } catch (e) {
    return erroBase(e, "faturacao tecnicos GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("faturacao.tecnicos", "mexer");
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true, id: "est-tec-novo" });
  }
  try {
    const c = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const nome = corta(c.nome, 120);
    if (!nome) return NextResponse.json({ ok: false, erro: "Nome obrigatório." }, { status: 400 });
    const criados = await insert<TecnicoFat>("tecnicos", {
      nome,
      tarifa_mzn: num(c.tarifa_mzn),
      tarifa_usd: num(c.tarifa_usd)
    });
    return NextResponse.json({ ok: true, tecnico: criados[0] });
  } catch (e) {
    return erroBase(e, "faturacao tecnicos POST");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("faturacao.tecnicos", "mexer");
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true });
  }
  try {
    const c = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const id = corta(c.id, 40);
    if (!id) return NextResponse.json({ ok: false, erro: "Técnico inválido." }, { status: 400 });
    const nome = corta(c.nome, 120);
    if (!nome) return NextResponse.json({ ok: false, erro: "Nome obrigatório." }, { status: 400 });
    await update<TecnicoFat>("tecnicos", `id=eq.${id}`, {
      nome,
      tarifa_mzn: num(c.tarifa_mzn),
      tarifa_usd: num(c.tarifa_usd),
      ...(typeof c.ativo === "boolean" ? { ativo: c.ativo } : {})
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "faturacao tecnicos PATCH");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autorizado("faturacao.tecnicos", "apagar");
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true });
  }
  try {
    const id = corta(new URL(req.url).searchParams.get("id"), 40);
    if (!id) return NextResponse.json({ ok: false, erro: "Técnico inválido." }, { status: 400 });
    // As linhas de documentos guardam o nome por cópia (tecnico_nome),
    // por isso o histórico continua correto após apagar o técnico.
    const ligados = await query<{ id: string }>(
      "documento_itens",
      `select=id&tecnico_id=eq.${id}&limit=1`
    );
    if (ligados.length) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            "Este técnico já tem linhas em documentos. Desactiva-o em vez de apagar, para o histórico ficar coerente."
        },
        { status: 409 }
      );
    }
    await del("tecnicos", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "faturacao tecnicos DELETE");
  }
}
