/**
 * /api/aquisicao/fornecedores - CRUD de fornecedores dos pedidos.
 *
 * GET: todos (o histórico precisa dos arquivados para manter os nomes).
 * POST: criar (o editor cria inline "+ Novo fornecedor..." como no hub;
 *       se o nome já existir, devolve o existente em vez de duplicar).
 * PATCH/DELETE: Configurações. Apagar é recusado quando o fornecedor
 *       já tem pedidos (mesma regra do hub: arquiva em vez de apagar).
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, queryTudo, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import type { FornecedorAq } from "@/lib/aquisicao";

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "aquisicao",
    "aquisicao.novo",
    "aquisicao.historico",
    "aquisicao.configuracoes"
  ]);
  if (eErro(auth)) return auth;
  try {
    const lista = await queryTudo<FornecedorAq>("aquisicao_fornecedores", "select=*&order=nome.asc");
    return NextResponse.json({ ok: true, fornecedores: lista });
  } catch (e) {
    return erroBase(e, "aquisicao fornecedores GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizadoEmAlguma(["aquisicao.novo", "aquisicao.configuracoes"]);
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      accao?: string;
      dados?: Partial<FornecedorAq>;
    };
    if (corpo.accao !== "criar" || !corpo.dados?.nome?.trim()) {
      return NextResponse.json({ ok: false, erro: "Indica o nome do fornecedor." }, { status: 400 });
    }
    const nome = corpo.dados.nome.trim();
    const todos = await query<FornecedorAq>("aquisicao_fornecedores", "select=id,nome");
    const existente = todos.find((f) => f.nome.toLowerCase() === nome.toLowerCase());
    if (existente) {
      return NextResponse.json({ ok: true, fornecedor: existente, jaExistia: true });
    }
    const [criado] = await insert<FornecedorAq>("aquisicao_fornecedores", {
      nome,
      contacto: corpo.dados.contacto?.trim() || null,
      morada: corpo.dados.morada?.trim() || null,
      nuit: corpo.dados.nuit?.trim() || null,
      observacao: corpo.dados.observacao?.trim() || null,
      ativo: true
    });
    return NextResponse.json({ ok: true, fornecedor: criado });
  } catch (e) {
    return erroBase(e, "aquisicao fornecedores POST");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("aquisicao.configuracoes", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      id?: string;
      dados?: Partial<FornecedorAq>;
    };
    if (!corpo.id || !corpo.dados) {
      return NextResponse.json({ ok: false, erro: "Pedido desconhecido." }, { status: 400 });
    }
    const payload: Record<string, unknown> = {};
    if (corpo.dados.nome !== undefined) payload.nome = String(corpo.dados.nome).trim();
    if (corpo.dados.contacto !== undefined) payload.contacto = String(corpo.dados.contacto).trim() || null;
    if (corpo.dados.morada !== undefined) payload.morada = String(corpo.dados.morada).trim() || null;
    if (corpo.dados.nuit !== undefined) payload.nuit = String(corpo.dados.nuit).trim() || null;
    if (corpo.dados.observacao !== undefined) payload.observacao = String(corpo.dados.observacao).trim() || null;
    if (corpo.dados.ativo !== undefined) payload.ativo = Boolean(corpo.dados.ativo);
    await update("aquisicao_fornecedores", `id=eq.${corpo.id}`, payload);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "aquisicao fornecedores PATCH");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autorizado("aquisicao.configuracoes", "apagar");
  if (eErro(auth)) return auth;
  try {
    const id = new URL(req.url).searchParams.get("id") || "";
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Fornecedor não indicado." }, { status: 400 });
    }
    const usos = await query<{ id: string }>(
      "aquisicao_pedidos",
      `select=id&fornecedor_id=eq.${id}&limit=1`
    );
    if (usos.length) {
      return NextResponse.json(
        { ok: false, erro: "Este fornecedor já tem pedidos associados. Arquiva-o em vez de apagar." },
        { status: 409 }
      );
    }
    await del("aquisicao_fornecedores", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "aquisicao fornecedores DELETE");
  }
}
