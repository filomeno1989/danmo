/**
 * /api/aquisicao/colaboradores - Seletor de Solicitante.
 *
 * Lista LEVE dos colaboradores activos (id, nome, código, sector) para
 * a pesquisa do campo Solicitante, como o seletor do hub (criarSeletor
 * Colaborador lia collaborators directamente do navegador). Aqui a
 * leitura é servida pelo servidor com a permissão do módulo.
 */

import { NextResponse } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import type { ColaboradorAq } from "@/lib/aquisicao";

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "aquisicao",
    "aquisicao.novo",
    "aquisicao.historico",
    "aquisicao.configuracoes"
  ]);
  if (eErro(auth)) return auth;
  try {
    const lista = await queryTudo<ColaboradorAq>(
      "collaborators",
      "select=id,name,code,setor&active=eq.true&order=name.asc"
    );
    return NextResponse.json({ ok: true, colaboradores: lista });
  } catch (e) {
    return erroBase(e, "aquisicao colaboradores GET");
  }
}
