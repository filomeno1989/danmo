/**
 * /api/oficina/equipamentos - Máquinas da oficina.
 *
 * GET: todos os equipamentos (activos e inactivos) + categorias e grupos
 *      activos (para o formulário e os filtros).
 * POST: "criar" e "editar" (código obrigatório; categoria obrigatória).
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, query, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import type {
  CategoriaEquip,
  Equipamento,
  GrupoEquip
} from "@/lib/oficina";

export async function GET() {
  const auth = await autorizado("ver");
  if (eErro(auth)) return auth;
  try {
    const [equipamentos, categorias, grupos] = await Promise.all([
      queryTudoSafe(),
      query<CategoriaEquip>("categorias_equipamento", "select=*&ativo=eq.true&order=nome.asc"),
      query<GrupoEquip>("grupos_equipamento", "select=*&ativo=eq.true&order=nome.asc")
    ]);
    return NextResponse.json({ ok: true, equipamentos, categorias, grupos });
  } catch (e) {
    return erroBase(e, "equipamentos GET");
  }
}

async function queryTudoSafe(): Promise<Equipamento[]> {
  const { queryTudo } = await import("@/lib/supabase");
  return queryTudo<Equipamento>("equipment", "select=*&order=code.asc");
}

type Corpo = {
  action: "criar" | "editar";
  id?: number;
  code?: string;
  name?: string | null;
  fleet_type?: string;
  group_name?: string | null;
  model?: string | null;
  year_acquired?: number | null;
  year_decommissioned?: number | null;
  active?: boolean;
};

export async function POST(req: NextRequest) {
  const auth0 = await autorizado("ver");
  if (eErro(auth0)) return auth0;

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  const auth = await autorizado(corpo.action === "criar" ? "criar" : "editar");
  if (eErro(auth)) return auth;

  try {
    if (!corpo.code?.trim() || !corpo.fleet_type?.trim()) {
      return NextResponse.json(
        { ok: false, erro: "Código e Categoria são obrigatórios." },
        { status: 400 }
      );
    }
    // Código único: dois equipamentos com o mesmo código confundem a
    // frota inteira (obras, checklists e histórico ficam ambíguos).
    const codeLimpo = corpo.code.trim();
    const duplicados = await query<{ id: number }>(
      "equipment",
      `select=id&code=eq.${encodeURIComponent(codeLimpo)}${
        corpo.action === "editar" && corpo.id ? `&id=neq.${corpo.id}` : ""
      }`
    );
    if (duplicados.length) {
      return NextResponse.json(
        {
          ok: false,
          erro: `Já existe um equipamento com o código ${codeLimpo}. Escolhe outro código.`
        },
        { status: 409 }
      );
    }
    const payload = {
      code: corpo.code.trim(),
      name: (corpo.name || "").trim() || null,
      fleet_type: corpo.fleet_type.trim(),
      group_name: (corpo.group_name || "").trim() || null,
      model: (corpo.model || "").trim() || null,
      year_acquired: corpo.year_acquired ? Number(corpo.year_acquired) : null,
      year_decommissioned: corpo.year_decommissioned ? Number(corpo.year_decommissioned) : null,
      active: corpo.active !== false
    };

    if (corpo.action === "criar") {
      const criado = await insert<Equipamento>("equipment", payload);
      return NextResponse.json({ ok: true, id: criado[0].id });
    }

    if (!corpo.id) {
      return NextResponse.json({ ok: false, erro: "Equipamento não indicado." }, { status: 400 });
    }
    await update("equipment", `id=eq.${corpo.id}`, payload);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, `equipamentos POST ${corpo.action}`);
  }
}
