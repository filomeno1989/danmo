/**
 * /api/escalas/config - configuração do módulo Escalas.
 *
 * GET: os feriados de Moçambique (lidos de ferias_feriados, módulo
 * Plano de Férias, já resolvidos para este ano e o próximo), a saúde do
 * registo e um aviso se o SQL da Fase 9 ainda não foi colado.
 */

import { NextResponse } from "next/server";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import { eFaltaSQL, hojeEsc } from "@/lib/escalas";
import { PAGINAS_ESCALAS, carregarBase } from "@/lib/escalas-server";

export async function GET() {
  const auth = await autorizadoEmAlguma([...PAGINAS_ESCALAS]);
  if (eErro(auth)) return auth;
  try {
    const base = await carregarBase();
    const hoje = hojeEsc();
    const ano = Number(hoje.slice(0, 4));
    return NextResponse.json({
      ok: true,
      hoje,
      ano,
      sqlFalta: base.sqlFalta,
      feriados: base.feriados,
      totalAtivos: base.colaboradores.filter((c) => c.ativo).length,
      totalComContacto: base.colaboradores.filter((c) => c.ativo && c.contacto).length,
      turnos: {
        A: base.colaboradores.filter((c) => c.ativo && c.grupo === "A").length,
        B: base.colaboradores.filter((c) => c.ativo && c.grupo === "B").length,
        C: base.colaboradores.filter((c) => c.ativo && c.grupo === "C").length,
        D: base.colaboradores.filter((c) => c.ativo && c.grupo === "D").length
      }
    });
  } catch (e) {
    if (eFaltaSQL(e)) {
      return NextResponse.json({ ok: true, hoje: hojeEsc(), sqlFalta: true, feriados: [] });
    }
    return erroBase(e, "escalas config GET");
  }
}
