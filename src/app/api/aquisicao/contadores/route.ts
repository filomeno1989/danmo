/**
 * /api/aquisicao/contadores - Numeração manual por ano.
 *
 * GET: contadores configurados + o último pedido gravado de cada ano
 *      (a tabela da aba Numeração das Configurações).
 * POST: fixa o próximo número de um ano. O sistema nunca volta atrás
 *       por conta própria: ao gravar um pedido o número real é sempre
 *       o MAIOR entre este contador e o último gravado no ano.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, query, queryTudo, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import type { ContadorAq, PedidoAquisicao } from "@/lib/aquisicao";

export async function GET() {
  const auth = await autorizado("aquisicao.configuracoes", "ver");
  if (eErro(auth)) return auth;
  try {
    const contadores = await queryTudo<ContadorAq>("aquisicao_contadores", "select=*&order=ano.desc");
    const pedidos = await queryTudo<{ ano: number; numero: number }>(
      "aquisicao_pedidos",
      "select=ano,numero"
    );
    const ultimoPorAno: Record<number, number> = {};
    for (const p of pedidos) {
      if (!ultimoPorAno[p.ano] || p.numero > ultimoPorAno[p.ano]) ultimoPorAno[p.ano] = p.numero;
    }
    return NextResponse.json({ ok: true, contadores, ultimoPorAno });
  } catch (e) {
    return erroBase(e, "aquisicao contadores GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("aquisicao.configuracoes", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      accao?: string;
      ano?: number;
      proximo_numero?: number;
    };
    const ano = Number(corpo.ano);
    const proximo = Number(corpo.proximo_numero);
    if (corpo.accao !== "fixar" || !ano || !proximo || proximo < 1) {
      return NextResponse.json(
        { ok: false, erro: "Indica o ano e o próximo número (mínimo 1)." },
        { status: 400 }
      );
    }
    const [existente] = await query<ContadorAq>("aquisicao_contadores", `select=id&ano=eq.${ano}&limit=1`);
    if (existente?.id) {
      await update("aquisicao_contadores", `id=eq.${existente.id}`, { proximo_numero: proximo });
    } else {
      await insert("aquisicao_contadores", [{ ano, proximo_numero: proximo }]);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "aquisicao contadores POST");
  }
}
