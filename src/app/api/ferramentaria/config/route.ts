/**
 * /api/ferramentaria/config - Categorias de ferramenta e Departamentos.
 *
 * GET: as duas listas com a CONTAGEM DE USO calculada no servidor
 *      (categorias por tools.category_id; departamentos por nome em
 *      tool_movements, porque os movimentos gravam o nome).
 * POST: criar { tipo: "categoria" | "departamento", nome }. Duplicado
 *       (sem acentos, sem maiúsculas) recusado no SERVIDOR (o hub só
 *       conferia no navegador).
 * PATCH (?id=): editar nome e/ou alternar active. Desactivar não apaga
 *       nada: os registos já criados mantêm o nome.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { nomeDuplicado, problemaNomeSimples, type Categoria, type Departamento, type Ferramenta, type Movimento } from "@/lib/ferramentaria";

type Lista = { id: string; tipo: "categoria" | "departamento"; nome: string; active: boolean; count: number };

export async function GET() {
  const auth = await autorizado("ferramentaria.configuracoes", "ver");
  if (eErro(auth)) return auth;
  try {
    const [categorias, departamentos, tools, movimentos] = await Promise.all([
      queryTudo<Categoria>("tool_categories", "select=*&order=nome.asc"),
      queryTudo<Departamento>("departamentos", "select=*&order=nome.asc"),
      queryTudo<Ferramenta>("tools", "select=category_id"),
      queryTudo<Movimento>("tool_movements", "select=departamento")
    ]);

    const usoCat = new Map<string, number>();
    for (const t of tools) {
      if (t.category_id) usoCat.set(t.category_id, (usoCat.get(t.category_id) || 0) + 1);
    }
    const usoDep = new Map<string, number>();
    for (const m of movimentos) {
      if (m.departamento) usoDep.set(m.departamento, (usoDep.get(m.departamento) || 0) + 1);
    }

    const categoriasLista: Lista[] = categorias.map((c) => ({
      id: c.id,
      tipo: "categoria",
      nome: c.nome,
      active: c.active === true,
      count: usoCat.get(c.id) || 0
    }));
    const departamentosLista: Lista[] = departamentos.map((d) => ({
      id: d.id,
      tipo: "departamento",
      nome: d.nome,
      active: d.active === true,
      count: usoDep.get(d.nome) || 0
    }));

    return NextResponse.json({ ok: true, categorias: categoriasLista, departamentos: departamentosLista });
  } catch (e) {
    return erroBase(e, "ferramentaria config GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("ferramentaria.configuracoes", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as { tipo?: string; nome?: string };
    const tipo = normalizarTipo(corpo.tipo);
    if (!tipo) {
      return NextResponse.json({ ok: false, erro: "Tipo desconhecido." }, { status: 400 });
    }
    const problema = problemaNomeSimples(corpo.nome);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const tabela = tipo === "categoria" ? "tool_categories" : "departamentos";
    const existentes = await queryTudo<{ nome: string }>(tabela, "select=nome");
    if (nomeDuplicado(corpo.nome!, existentes.map((e) => e.nome || ""))) {
      return NextResponse.json(
        { ok: false, erro: `Já existe ${tipo === "categoria" ? "uma categoria" : "um departamento"} com este nome.` },
        { status: 409 }
      );
    }

    const [criado] = await insert<{ id: string; nome: string }>(tabela, { nome: corpo.nome!.trim(), active: true });
    return NextResponse.json({ ok: true, item: { ...criado, tipo } });
  } catch (e) {
    return erroBase(e, "ferramentaria config POST");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("ferramentaria.configuracoes", "mexer");
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Id em falta." }, { status: 400 });
    }
    const corpo = (await req.json()) as { tipo?: string; nome?: string; active?: boolean };
    const tipo = normalizarTipo(corpo.tipo);
    if (!tipo) {
      return NextResponse.json({ ok: false, erro: "Tipo desconhecido." }, { status: 400 });
    }
    const tabela = tipo === "categoria" ? "tool_categories" : "departamentos";

    const dados: Record<string, unknown> = {};
    if (corpo.nome !== undefined) {
      const problema = problemaNomeSimples(corpo.nome);
      if (problema) {
        return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
      }
      const existentes = await queryTudo<{ nome: string }>(tabela, "select=nome");
      if (nomeDuplicado(corpo.nome, existentes.map((e) => e.nome || ""))) {
        return NextResponse.json(
          { ok: false, erro: "Já existe um registo com este nome." },
          { status: 409 }
        );
      }
      dados.nome = corpo.nome.trim();
    }
    if (corpo.active !== undefined) dados.active = corpo.active;

    const [novo] = await update<{ id: string; nome: string }>(
      tabela,
      `id=eq.${encodeURIComponent(id)}`,
      dados
    );
    return NextResponse.json({ ok: true, item: novo ? { ...novo, tipo } : null });
  } catch (e) {
    return erroBase(e, "ferramentaria config PATCH");
  }
}

function normalizarTipo(tipo: string | undefined): "categoria" | "departamento" | null {
  if (tipo === "categoria") return "categoria";
  if (tipo === "departamento") return "departamento";
  return null;
}
