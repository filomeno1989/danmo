/**
 * /api/aquisicao/denominacoes - CRUD das denominações do campo
 * Denominação do pedido (Cotação, Pro-forma, Venda a Dinheiro...).
 *
 * POST aceita também a criação INLINE do editor (+ Nova denominação...);
 * se o nome já existir devolve o existente. Apagar é recusado quando já
 * há pedidos com essa denominação (arquiva em vez de apagar, como no hub).
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, queryTudo, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import type { DenominacaoAq } from "@/lib/aquisicao";

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "aquisicao",
    "aquisicao.novo",
    "aquisicao.historico",
    "aquisicao.configuracoes"
  ]);
  if (eErro(auth)) return auth;
  try {
    const lista = await queryTudo<DenominacaoAq>(
      "aquisicao_denominacoes",
      "select=*&order=ordem.asc,nome.asc"
    );
    return NextResponse.json({ ok: true, denominacoes: lista });
  } catch (e) {
    return erroBase(e, "aquisicao denominacoes GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizadoEmAlguma(["aquisicao.novo", "aquisicao.configuracoes"]);
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      accao?: string;
      dados?: { nome?: string; ordem?: number };
    };
    if (corpo.accao !== "criar" || !corpo.dados?.nome?.trim()) {
      return NextResponse.json({ ok: false, erro: "Indica o nome da denominação." }, { status: 400 });
    }
    const nome = corpo.dados.nome.trim();
    const todas = await query<DenominacaoAq>("aquisicao_denominacoes", "select=id,nome,ordem");
    const existente = todas.find((d) => d.nome.toLowerCase() === nome.toLowerCase());
    if (existente) {
      return NextResponse.json({ ok: true, denominacao: existente, jaExistia: true });
    }
    const ordem = Number(corpo.dados.ordem) || todas.length + 1;
    const [criada] = await insert<DenominacaoAq>("aquisicao_denominacoes", {
      nome,
      ordem,
      ativo: true
    });
    return NextResponse.json({ ok: true, denominacao: criada });
  } catch (e) {
    return erroBase(e, "aquisicao denominacoes POST");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("aquisicao.configuracoes", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      id?: string;
      dados?: { nome?: string; ordem?: number; ativo?: boolean };
    };
    if (!corpo.id || !corpo.dados) {
      return NextResponse.json({ ok: false, erro: "Pedido desconhecido." }, { status: 400 });
    }
    const payload: Record<string, unknown> = {};
    if (corpo.dados.nome !== undefined) payload.nome = String(corpo.dados.nome).trim();
    if (corpo.dados.ordem !== undefined) payload.ordem = Number(corpo.dados.ordem) || 0;
    if (corpo.dados.ativo !== undefined) payload.ativo = Boolean(corpo.dados.ativo);
    await update("aquisicao_denominacoes", `id=eq.${corpo.id}`, payload);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "aquisicao denominacoes PATCH");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autorizado("aquisicao.configuracoes", "apagar");
  if (eErro(auth)) return auth;
  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Denominação não indicada." }, { status: 400 });
    }
    const [d] = await query<DenominacaoAq>(
      "aquisicao_denominacoes",
      `select=nome&id=eq.${id}&limit=1`
    );
    if (d) {
      const usos = await query<{ id: string }>(
        "aquisicao_pedidos",
        `select=id&tipo_documento=eq.${encodeURIComponent(d.nome)}&limit=1`
      );
      if (usos.length) {
        return NextResponse.json(
          { ok: false, erro: "Esta denominação já tem pedidos associados. Arquiva-a em vez de apagar." },
          { status: 409 }
        );
      }
    }
    await del("aquisicao_denominacoes", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "aquisicao denominacoes DELETE");
  }
}
