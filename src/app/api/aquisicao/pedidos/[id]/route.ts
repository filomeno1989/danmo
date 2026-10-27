/**
 * /api/aquisicao/pedidos/[id] - Um pedido (ler, editar, apagar).
 *
 * PATCH: atualiza o pedido e SUBSTITUI os itens num ÚNICO pedido de
 *        remoção (o hub apagava item a item: N pedidos, uma janela de
 *        concorrência em cada - o mesmo defeito que duplicou linhas na
 *        cotação 008/26 da Faturação).
 * DELETE: apaga os itens de uma vez e depois o pedido.
 */

import { NextResponse, NextRequest } from "next/server";
import { del, delFiltro, insert, query, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  itensParaGravar,
  problemaDoPedido,
  type DadosPedido,
  type ItemAquisicao,
  type PedidoAquisicao
} from "@/lib/aquisicao";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await autorizadoEmAlguma([
    "aquisicao",
    "aquisicao.novo",
    "aquisicao.historico",
    "aquisicao.configuracoes"
  ]);
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const [pedido] = await query<PedidoAquisicao>(
      "aquisicao_pedidos",
      `select=*&id=eq.${id}&limit=1`
    );
    if (!pedido) {
      return NextResponse.json({ ok: false, erro: "Pedido não encontrado." }, { status: 404 });
    }
    const itens = await query<ItemAquisicao>(
      "aquisicao_itens",
      `select=*&pedido_id=eq.${id}&order=numero_ordem.asc`
    );
    return NextResponse.json({ ok: true, pedido, itens });
  } catch (e) {
    return erroBase(e, "aquisicao pedido GET");
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await autorizado("aquisicao.novo", "mexer");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const corpo = (await req.json()) as {
      accao?: string;
      dados?: Partial<DadosPedido>;
      itens?: Partial<ItemAquisicao>[];
    };
    if (corpo.accao !== "editar" || !corpo.dados) {
      return NextResponse.json({ ok: false, erro: "Pedido desconhecido." }, { status: 400 });
    }
    const itens = itensParaGravar(corpo.itens || []);
    const problema = problemaDoPedido(corpo.dados, itens);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const [atual] = await query<PedidoAquisicao>(
      "aquisicao_pedidos",
      `select=id,ano,numero&id=eq.${id}&limit=1`
    );
    if (!atual) {
      return NextResponse.json({ ok: false, erro: "Pedido não encontrado." }, { status: 404 });
    }

    /* Nome do fornecedor sempre da base (mesma regra da criação). */
    const [fornecedor] = await query<{ nome: string }>(
      "aquisicao_fornecedores",
      `select=nome&id=eq.${encodeURIComponent(corpo.dados.fornecedor_id!)}&limit=1`
    );
    if (!fornecedor) {
      return NextResponse.json({ ok: false, erro: "Fornecedor não encontrado na base." }, { status: 400 });
    }

    // Em edição o número está fixo (não se mexe em ano nem número).
    await update("aquisicao_pedidos", `id=eq.${id}`, {
      data_pedido: corpo.dados.data_pedido,
      tipo_documento: String(corpo.dados.tipo_documento).trim(),
      numero_cotacao_proforma: String(corpo.dados.numero_cotacao_proforma).trim(),
      fornecedor_id: corpo.dados.fornecedor_id,
      fornecedor_nome: fornecedor.nome,
      solicitante: String(corpo.dados.solicitante).trim(),
      solicitante_codigo: corpo.dados.solicitante_codigo || null,
      observacao_geral: String(corpo.dados.observacao_geral || "").trim()
    });

    // Substituição dos itens: UM delete por filtro + um insert.
    await delFiltro("aquisicao_itens", `pedido_id=eq.${id}`);
    if (itens.length) {
      await insert<ItemAquisicao>(
        "aquisicao_itens",
        itens.map((i) => ({ ...i, pedido_id: id }))
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "aquisicao pedido PATCH");
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await autorizado("aquisicao.historico", "apagar");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    await delFiltro("aquisicao_itens", `pedido_id=eq.${id}`);
    await del("aquisicao_pedidos", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "aquisicao pedido DELETE");
  }
}
