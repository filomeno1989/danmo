/**
 * /api/hst/entregas - Entregas de EPI (Portal HST).
 *
 * POST: cria a entrega E BAIXA O STOCK no SERVIDOR. O hub gravava a
 *       entrega e o stock ficava intocado para sempre (confirmado na
 *       base: Luvas Nitrilo 10 em stock, entrega registada, stock 10).
 *       Stock insuficiente é recusado (400): o stock nunca fica negativo.
 *       O nome do EPI e do colaborador são resolvidos pela BASE.
 * DELETE: apaga a entrega e REPÕE a quantidade no stock (era um engano;
 *       sem reposição o material desaparecia do inventário sem nunca
 *       ter existido).
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { problemaEntrega, type EntregaEpiHST } from "@/lib/hst";

export async function POST(req: NextRequest) {
  const auth = await autorizado("hst.epis", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      colaborador_nome?: string;
      epi_id?: number;
      quantidade?: number;
      observacoes?: string;
      data_entrega?: string; // YYYY-MM-DD; ausente = agora (default da base)
    };
    const problema = problemaEntrega(corpo);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const qtd = Math.max(1, Math.floor(Number(corpo.quantidade) || 1));
    const [epi] = await query<{ id: number; nome: string; stock_atual: number; ativo: boolean }>(
      "hst_epis",
      `select=id,nome,stock_atual,ativo&id=eq.${Number(corpo.epi_id)}&limit=1`
    );
    if (!epi) {
      return NextResponse.json({ ok: false, erro: "EPI não encontrado." }, { status: 400 });
    }
    if (epi.ativo === false) {
      return NextResponse.json({ ok: false, erro: "Este EPI está desactivado." }, { status: 400 });
    }
    const stock = Number(epi.stock_atual) || 0;
    if (stock < qtd) {
      return NextResponse.json(
        { ok: false, erro: `Stock insuficiente: ${epi.nome} tem ${stock} unidade(s).` },
        { status: 400 }
      );
    }

    // Colaborador confirmado na base (o hub copiava o texto do navegador).
    const nome = String(corpo.colaborador_nome).trim();
    const [colab] = await query<{ id: number }>(
      "collaborators",
      `select=id&name=eq.${encodeURIComponent(nome)}&limit=1`
    );

    const dados: Record<string, unknown> = {
      colaborador_nome: nome,
      colaborador_id: colab?.id ?? null,
      epi_id: epi.id,
      epi_nome: epi.nome,
      quantidade: qtd,
      observacoes: corpo.observacoes?.trim() || null
    };
    if (corpo.data_entrega && /^\d{4}-\d{2}-\d{2}$/.test(corpo.data_entrega)) {
      dados.data_entrega = `${corpo.data_entrega}T12:00:00+00:00`;
    }

    const [criada] = await insert<EntregaEpiHST>("hst_epi_entregas", dados);
    await update("hst_epis", `id=eq.${epi.id}`, { stock_atual: stock - qtd });

    return NextResponse.json({ ok: true, entrega: criada, stockRestante: stock - qtd });
  } catch (e) {
    return erroBase(e, "hst entregas POST");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autorizado("hst.epis", "apagar");
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Id da entrega em falta." }, { status: 400 });
    }
    const [entrega] = await query<EntregaEpiHST>(
      "hst_epi_entregas",
      `select=*&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    if (!entrega) {
      return NextResponse.json({ ok: false, erro: "Entrega não encontrada." }, { status: 404 });
    }
    await del("hst_epi_entregas", id);
    // Repõe o stock (se o EPI ainda existir).
    if (entrega.epi_id) {
      const [epi] = await query<{ id: number; stock_atual: number }>(
        "hst_epis",
        `select=id,stock_atual&id=eq.${entrega.epi_id}&limit=1`
      );
      if (epi) {
        await update("hst_epis", `id=eq.${epi.id}`, {
          stock_atual: (Number(epi.stock_atual) || 0) + (entrega.quantidade || 0)
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "hst entregas DELETE");
  }
}
