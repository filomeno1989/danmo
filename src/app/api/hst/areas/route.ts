/**
 * /api/hst/areas - Áreas de risco do Portal HST.
 *
 * GET: todas (activas e inactivas; o filtro fica no ecrã, igual ao hub).
 * POST: cria área. PATCH em /areas/[id] edita e activa/desactiva.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import { problemaArea, type AreaRiscoHST } from "@/lib/hst";

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "hst",
    "hst.areas",
    "hst.acidentes",
    "hst.relatorios"
  ]);
  if (eErro(auth)) return auth;
  try {
    const areas = await queryTudo<AreaRiscoHST>(
      "hst_areas_risco",
      "select=*&order=nome.asc"
    );
    return NextResponse.json({ ok: true, areas });
  } catch (e) {
    return erroBase(e, "hst areas GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("hst.areas", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      nome?: string;
      nivel_risco?: string;
      descricao?: string;
      medidas_controlo?: string;
    };
    const problema = problemaArea(corpo);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }
    const [criada] = await insert<AreaRiscoHST>("hst_areas_risco", {
      nome: corpo.nome!.trim(),
      nivel_risco: corpo.nivel_risco!.trim(),
      descricao: corpo.descricao?.trim() || null,
      medidas_controlo: corpo.medidas_controlo?.trim() || null,
      ativo: true
    });
    return NextResponse.json({ ok: true, area: criada });
  } catch (e) {
    return erroBase(e, "hst areas POST");
  }
}
