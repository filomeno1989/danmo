/**
 * /api/oficina/config - Categorias e Grupos de equipamento.
 *
 * GET: as duas listas completas (activas e inactivas, como no hub).
 * POST: criar/editar categoria e criar/editar grupo.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, query, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase, type AccaoOficina } from "@/lib/guarda-api";
import type { CategoriaEquip, GrupoEquip } from "@/lib/oficina";

export async function GET() {
  const auth = await autorizado("ver");
  if (eErro(auth)) return auth;
  try {
    const [categorias, grupos] = await Promise.all([
      query<CategoriaEquip>("categorias_equipamento", "select=*&order=nome.asc"),
      query<GrupoEquip>("grupos_equipamento", "select=*&order=nome.asc")
    ]);
    return NextResponse.json({ ok: true, categorias, grupos });
  } catch (e) {
    return erroBase(e, "config GET");
  }
}

type Corpo = {
  action: "criar-categoria" | "editar-categoria" | "criar-grupo" | "editar-grupo";
  id?: number;
  nome?: string;
  ativo?: boolean;
  categoria_id?: number;
};

const ACCOES: Record<string, AccaoOficina> = {
  "criar-categoria": "criar",
  "editar-categoria": "editar",
  "criar-grupo": "criar",
  "editar-grupo": "editar"
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

  const accao = ACCOES[corpo.action];
  if (!accao) {
    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  }
  const auth = await autorizado(accao);
  if (eErro(auth)) return auth;

  try {
    const nome = (corpo.nome || "").trim();
    if (!nome) {
      return NextResponse.json({ ok: false, erro: "Escreve o nome." }, { status: 400 });
    }

    switch (corpo.action) {
      case "criar-categoria": {
        const duplicada = await query<{ id: number }>(
          "categorias_equipamento",
          `select=id&nome=eq.${encodeURIComponent(nome)}&limit=1`
        );
        if (duplicada.length) {
          return NextResponse.json(
            { ok: false, erro: "Já existe uma categoria com este nome." },
            { status: 409 }
          );
        }
        const criada = await insert<CategoriaEquip>("categorias_equipamento", {
          nome,
          ativo: corpo.ativo !== false
        });
        return NextResponse.json({ ok: true, id: criada[0].id });
      }

      case "editar-categoria": {
        if (!corpo.id) {
          return NextResponse.json({ ok: false, erro: "Categoria não indicada." }, { status: 400 });
        }
        await update("categorias_equipamento", `id=eq.${corpo.id}`, {
          nome,
          ativo: corpo.ativo !== false
        });
        return NextResponse.json({ ok: true });
      }

      case "criar-grupo": {
        if (!corpo.categoria_id) {
          return NextResponse.json(
            { ok: false, erro: "Escolhe a categoria do grupo." },
            { status: 400 }
          );
        }
        const duplicado = await query<{ id: number }>(
          "grupos_equipamento",
          `select=id&nome=eq.${encodeURIComponent(nome)}&categoria_id=eq.${corpo.categoria_id}&limit=1`
        );
        if (duplicado.length) {
          return NextResponse.json(
            { ok: false, erro: "Já existe um grupo com este nome nesta categoria." },
            { status: 409 }
          );
        }
        const criado = await insert<GrupoEquip>("grupos_equipamento", {
          nome,
          categoria_id: corpo.categoria_id,
          ativo: corpo.ativo !== false
        });
        return NextResponse.json({ ok: true, id: criado[0].id });
      }

      case "editar-grupo": {
        if (!corpo.id) {
          return NextResponse.json({ ok: false, erro: "Grupo não indicado." }, { status: 400 });
        }
        await update("grupos_equipamento", `id=eq.${corpo.id}`, {
          nome,
          categoria_id: corpo.categoria_id,
          ativo: corpo.ativo !== false
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
    }
  } catch (e) {
    return erroBase(e, `config POST ${corpo.action}`);
  }
}
