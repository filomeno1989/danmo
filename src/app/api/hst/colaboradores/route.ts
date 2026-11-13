/**
 * /api/hst/colaboradores - Lista leve dos colaboradores activos
 * (datalist de Acidentes, Entregas de EPI e Medição de Tensão). Igual ao
 * padrão da Aquisição: a leitura é servida com a permissão do módulo.
 */

import { NextResponse } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import type { ColaboradorHST } from "@/lib/hst";

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "hst",
    "hst.acidentes",
    "hst.epis",
    "hst.tensao",
    "hst.relatorios"
  ]);
  if (eErro(auth)) return auth;
  try {
    const lista = await queryTudo<ColaboradorHST>(
      "collaborators",
      "select=id,name,code,active&active=eq.true&order=name.asc"
    );
    return NextResponse.json({ ok: true, colaboradores: lista });
  } catch (e) {
    return erroBase(e, "hst colaboradores GET");
  }
}
