/**
 * /api/ferramentaria/cadastros - Ferramenteiros (tabela tool_staff).
 *
 * GET: todos (activos e inactivos) + contagem de empréstimos entregues
 *      por cada nome (o hub contava no navegador).
 * POST: novo ferramenteiro. Nome duplicado (sem acentos, sem maiúsculas)
 *       recusado - MAS se existir desactivado com o mesmo nome,
 *       reactiva-o com os dados novos em vez de duplicar pessoa.
 * PATCH (?id=): editar nome/código ou alternar activo (desactivar tira
 *       das listas de entrega/recepção sem perder histórico).
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  nomeDuplicado,
  problemaNomeSimples,
  type Ferramenteiro,
  type Movimento
} from "@/lib/ferramentaria";

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "ferramentaria",
    "ferramentaria.emprestimos",
    "ferramentaria.ferramenteiros",
    "ferramentaria.configuracoes"
  ]);
  if (eErro(auth)) return auth;
  try {
    const [staff, movimentos] = await Promise.all([
      queryTudo<Ferramenteiro>("tool_staff", "select=*&order=nome.asc"),
      queryTudo<Movimento>("tool_movements", "select=entregue_por")
    ]);
    const contagem = new Map<string, number>();
    for (const m of movimentos) {
      if (m.entregue_por) contagem.set(m.entregue_por, (contagem.get(m.entregue_por) || 0) + 1);
    }
    return NextResponse.json({
      ok: true,
      ferramenteiros: staff,
      emprestimosPorNome: Object.fromEntries(contagem) as Record<string, number>
    });
  } catch (e) {
    return erroBase(e, "ferramentaria cadastros GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("ferramentaria.ferramenteiros", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as { nome?: string; codigo?: string; turno?: string };
    const problema = problemaNomeSimples(corpo.nome);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const todos = await queryTudo<Ferramenteiro>("tool_staff", "select=*");
    const mesmoNome = (s: Ferramenteiro) =>
      (s.nome || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") ===
      corpo.nome!.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    const activoIgual = todos.find((s) => s.active === true && mesmoNome(s));
    if (activoIgual) {
      return NextResponse.json(
        { ok: false, erro: `Já existe um ferramenteiro com o nome ${corpo.nome!.trim()}.` },
        { status: 409 }
      );
    }
    const inactivoIgual = todos.find((s) => s.active === false && mesmoNome(s));
    if (inactivoIgual) {
      // Pessoa que já existiu: reactiva em vez de duplicar.
      const [nova] = await update<Ferramenteiro>(
        "tool_staff",
        `id=eq.${encodeURIComponent(inactivoIgual.id)}`,
        {
          nome: corpo.nome!.trim(),
          codigo: corpo.codigo?.trim() || inactivoIgual.codigo,
          turno: corpo.turno?.trim() || inactivoIgual.turno,
          active: true
        }
      );
      return NextResponse.json({ ok: true, ferramenteiro: nova, reactivado: true });
    }

    const [criado] = await insert<Ferramenteiro>("tool_staff", {
      nome: corpo.nome!.trim(),
      codigo: corpo.codigo?.trim() || null,
      turno: corpo.turno?.trim() || null,
      active: true
    });
    return NextResponse.json({ ok: true, ferramenteiro: criado });
  } catch (e) {
    return erroBase(e, "ferramentaria cadastros POST");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("ferramentaria.ferramenteiros", "mexer");
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Id do ferramenteiro em falta." }, { status: 400 });
    }
    const corpo = (await req.json()) as {
      nome?: string;
      codigo?: string | null;
      turno?: string | null;
      active?: boolean;
    };

    const dados: Record<string, unknown> = {};
    if (corpo.nome !== undefined) {
      const problema = problemaNomeSimples(corpo.nome);
      if (problema) {
        return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
      }
      const todos = await queryTudo<Ferramenteiro>("tool_staff", "select=id,nome");
      const outros = todos.filter((t) => t.id !== id);
      if (nomeDuplicado(corpo.nome, outros.map((t) => t.nome || ""))) {
        return NextResponse.json(
          { ok: false, erro: `Já existe um ferramenteiro com o nome ${corpo.nome.trim()}.` },
          { status: 409 }
        );
      }
      dados.nome = corpo.nome.trim();
    }
    if (corpo.codigo !== undefined) dados.codigo = corpo.codigo?.trim() || null;
    if (corpo.turno !== undefined) dados.turno = corpo.turno?.trim() || null;
    if (corpo.active !== undefined) dados.active = corpo.active;

    const [nova] = await update<Ferramenteiro>(
      "tool_staff",
      `id=eq.${encodeURIComponent(id)}`,
      dados
    );
    return NextResponse.json({ ok: true, ferramenteiro: nova });
  } catch (e) {
    return erroBase(e, "ferramentaria cadastros PATCH");
  }
}
