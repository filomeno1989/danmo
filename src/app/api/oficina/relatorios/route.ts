/**
 * /api/oficina/relatorios - Dados dos relatórios da Oficina.
 *
 * GET: equipamentos + todas as obras + TODOS os registos de mudança de
 * estado (o histórico completo). As datas da CdM (ida, volta, fecho) e
 * os dias são calculados no navegador, exatamente como o hub faz.
 */

import { NextResponse } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import type { Equipamento, LogEstado, OrdemServico } from "@/lib/oficina";

export async function GET() {
  const auth = await autorizado("ver");
  if (eErro(auth)) return auth;
  try {
    const [equipamentos, ordens, logs] = await Promise.all([
      queryTudo<Equipamento>("equipment", "select=*&order=code.asc"),
      queryTudo<OrdemServico>("ordens_servico", "select=*"),
      queryTudo<LogEstado>("os_status_log", "select=*&order=data_mudanca.asc")
    ]);
    return NextResponse.json({ ok: true, equipamentos, ordens, logs });
  } catch (e) {
    return erroBase(e, "relatorios GET");
  }
}
