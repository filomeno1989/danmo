/**
 * /api/ferramentaria/ferramentas - Inventário (tabela tools).
 *
 * GET: todas as ferramentas activas com o nome da categoria resolvido.
 * POST: nova ferramenta. O juiz problemaFerramenta decide; código
 *       duplicado (mesmo com maiúsculas/minúsculas diferentes) recusa
 *       com 409, o hub deixava nascer.
 * PATCH (?id=): editar. Regra do hub mantida e agora decidida AQUI: se
 *       a ferramenta tem empréstimo activo, o estado segue sendo
 *       "emprestado" (o estado dela é gerido pelos movimentos, não pelo
 *       formulário).
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  problemaFerramenta,
  type Categoria,
  type Ferramenta
} from "@/lib/ferramentaria";

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "ferramentaria",
    "ferramentaria.inventario",
    "ferramentaria.emprestimos",
    "ferramentaria.relatorios"
  ]);
  if (eErro(auth)) return auth;
  try {
    const [ferramentas, categorias] = await Promise.all([
      queryTudo<Ferramenta>("tools", "select=*&active=eq.true&order=code.asc"),
      queryTudo<Categoria>("tool_categories", "select=id,nome&order=nome.asc")
    ]);
    const mapa = new Map(categorias.map((c) => [c.id, c.nome]));
    return NextResponse.json({
      ok: true,
      ferramentas,
      categoriaNome: Object.fromEntries(mapa) as Record<string, string>
    });
  } catch (e) {
    return erroBase(e, "ferramentaria ferramentas GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("ferramentaria.inventario", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      code?: string;
      nome?: string;
      category_id?: string;
      marca?: string;
      estado?: string;
      localizacao?: string;
      quantidade?: number | string;
      unidade?: string;
      valor_unitario?: number | string;
    };
    const problema = problemaFerramenta(corpo);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const code = corpo.code!.trim();
    const existentes = await queryTudo<Ferramenta>(
      "tools",
      "select=id,code&code=ilike." + encodeURIComponent(code)
    );
    if (existentes.length > 0) {
      return NextResponse.json(
        { ok: false, erro: `Já existe uma ferramenta com o código ${code}.` },
        { status: 409 }
      );
    }

    const dados = {
      code,
      nome: corpo.nome!.trim(),
      category_id: corpo.category_id!.trim(),
      marca: corpo.marca?.trim() || null,
      estado: corpo.estado?.trim() || "novo",
      localizacao: corpo.localizacao?.trim() || null,
      quantidade: Math.max(1, Number(corpo.quantidade ?? 1) || 1),
      unidade: corpo.unidade?.trim() || "unidade",
      valor_unitario: Number(corpo.valor_unitario ?? 0) || 0,
      active: true
    };
    const [criada] = await insert<Ferramenta>("tools", dados);
    return NextResponse.json({ ok: true, ferramenta: criada });
  } catch (e) {
    return erroBase(e, "ferramentaria ferramentas POST");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("ferramentaria.inventario", "mexer");
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Id da ferramenta em falta." }, { status: 400 });
    }

    const corpo = (await req.json()) as {
      code?: string;
      nome?: string;
      category_id?: string;
      marca?: string;
      estado?: string;
      localizacao?: string;
      quantidade?: number | string;
      unidade?: string;
      valor_unitario?: number | string;
    };
    // O editor de inventário manda sempre o formulário inteiro (mesma
    // validação da criação).
    const problema = problemaFerramenta(corpo);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const dados: Record<string, unknown> = {};
    if (corpo.code !== undefined) dados.code = corpo.code.trim();
    if (corpo.nome !== undefined) dados.nome = corpo.nome.trim();
    if (corpo.category_id !== undefined) dados.category_id = corpo.category_id.trim();
    if (corpo.marca !== undefined) dados.marca = corpo.marca.trim() || null;
    if (corpo.localizacao !== undefined) dados.localizacao = corpo.localizacao.trim() || null;
    if (corpo.quantidade !== undefined) {
      dados.quantidade = Math.max(1, Number(corpo.quantidade) || 1);
    }
    if (corpo.unidade !== undefined) dados.unidade = corpo.unidade.trim() || "unidade";
    if (corpo.valor_unitario !== undefined) dados.valor_unitario = Number(corpo.valor_unitario) || 0;

    // Regra do estado: com empréstimo activo, o formulário não manda.
    if (corpo.estado !== undefined) {
      const activos = await queryTudo<{ id: string }>(
        "tool_movements",
        `select=id&tool_id=eq.${encodeURIComponent(id)}&tipo=eq.emprestimo&data_devolucao=is.null&limit=1`
      );
      dados.estado = activos.length > 0 ? "emprestado" : corpo.estado;
    }

    const [nova] = await update<Ferramenta>("tools", `id=eq.${encodeURIComponent(id)}`, dados);
    return NextResponse.json({ ok: true, ferramenta: nova });
  } catch (e) {
    return erroBase(e, "ferramentaria ferramentas PATCH");
  }
}
