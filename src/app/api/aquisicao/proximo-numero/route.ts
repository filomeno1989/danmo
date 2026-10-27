/**
 * /api/aquisicao/proximo-numero?ano=YYYY - Sugestão do servidor.
 *
 * O editor já não calcula o número (era aí que nasciam duplicados):
 * pergunta ao servidor, que olha para o contador configurado e para o
 * último pedido gravado do ano e devolve o maior + 1. Em edição o
 * número está fixo, o editor nem pergunta.
 */

import { NextResponse, NextRequest } from "next/server";
import { query } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { proximoNumero } from "@/lib/aquisicao";

export async function GET(req: NextRequest) {
  const auth = await autorizado("aquisicao.novo", "ver");
  if (eErro(auth)) return auth;
  try {
    const ano = Number(new URL(req.url).searchParams.get("ano")) || new Date().getFullYear();
    const [contador] = await query<{ proximo_numero: number }>(
      "aquisicao_contadores",
      `select=proximo_numero&ano=eq.${ano}&limit=1`
    );
    const existentes = await query<{ numero: number }>(
      "aquisicao_pedidos",
      `select=numero&ano=eq.${ano}&order=numero.desc&limit=1`
    );
    const numero = proximoNumero(ano, contador?.proximo_numero, existentes[0]?.numero);
    return NextResponse.json({
      ok: true,
      ano,
      numero,
      sugerido: `${String(numero).padStart(3, "0")}/${ano}`
    });
  } catch (e) {
    return erroBase(e, "aquisicao proximo-numero GET");
  }
}
