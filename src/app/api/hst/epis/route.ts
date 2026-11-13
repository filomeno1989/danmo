/**
 * /api/hst/epis - Catálogo de EPIs + entregas (Portal HST).
 *
 * GET: catálogo completo + entregas. O nome do EPI nas entregas vem da
 *      base; as linhas antigas com epi_nome apagado continuam a ler o
 *      que ficou gravado (história honesta).
 * POST: cria EPI (o hub só criava: sem edição nenhuma, um nome mal
 *       escrito ficava errado para sempre).
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import { problemaEpi, type EntregaEpiHST, type EpiHST } from "@/lib/hst";

export async function GET() {
  const auth = await autorizadoEmAlguma(["hst", "hst.epis", "hst.relatorios"]);
  if (eErro(auth)) return auth;
  try {
    const [epis, entregas] = await Promise.all([
      queryTudo<EpiHST>("hst_epis", "select=*&order=nome.asc"),
      queryTudo<EntregaEpiHST>("hst_epi_entregas", "select=*&order=data_entrega.desc,id.desc")
    ]);
    return NextResponse.json({ ok: true, epis, entregas });
  } catch (e) {
    return erroBase(e, "hst epis GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("hst.epis", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      nome?: string;
      ca?: string;
      stock_atual?: number;
      descricao?: string;
    };
    const problema = problemaEpi(corpo);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }
    const [criado] = await insert<EpiHST>("hst_epis", {
      nome: corpo.nome!.trim(),
      ca: corpo.ca?.trim() || null,
      stock_atual: Number.isFinite(Number(corpo.stock_atual))
        ? Math.max(0, Number(corpo.stock_atual))
        : 0,
      descricao: corpo.descricao?.trim() || null,
      ativo: true
    });
    return NextResponse.json({ ok: true, epi: criado });
  } catch (e) {
    return erroBase(e, "hst epis POST");
  }
}
