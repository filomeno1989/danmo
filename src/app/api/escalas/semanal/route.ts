/**
 * /api/escalas/semanal?inicio=AAAA-MM-DD - a semana Sáb a Sex.
 *
 * A escala semanal NÃO é escrita à mão: é a mensal fatiada na semana
 * (Sábado a Sexta, como o mapa antigo), lida diretamente de esc_dias.
 * Vem com feriados da semana, férias do plano que a tocam e o registo
 * completo para os contactos.
 */

import { NextResponse } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import { hojeEsc, semanaContendo, somaDiasISO, type EscDia } from "@/lib/escalas";
import {
  PAGINAS_ESCALAS,
  bridgeColaboradores,
  carregarBase,
  feriadosNoIntervalo,
  feriasDoPlano
} from "@/lib/escalas-server";

export async function GET(request: Request) {
  const auth = await autorizadoEmAlguma([...PAGINAS_ESCALAS]);
  if (eErro(auth)) return auth;

  const url = new URL(request.url);
  const hoje = hojeEsc();
  const inicioPedida = url.searchParams.get("inicio") || "";
  const inicio = /^\d{4}-\d{2}-\d{2}$/.test(inicioPedida)
    ? semanaContendo(inicioPedida)[0]
    : semanaContendo(hoje)[0];
  const fim = somaDiasISO(inicio, 6);

  try {
    const base = await carregarBase();
    if (base.sqlFalta) {
      return NextResponse.json({ ok: true, hoje, inicio, fim, sqlFalta: true });
    }
    const [dias, notas, bridge] = await Promise.all([
      queryTudo<EscDia>(
        "esc_dias",
        `select=colaborador_id,data,codigo&data=gte.${inicio}&data=lte.${fim}&order=data.asc`
      ),
      queryTudo<{ texto: string }>(
        "esc_notas",
        `select=texto&ano=eq.${Number(inicio.slice(0, 4))}&mes=eq.${Number(inicio.slice(5, 7))}`
      ),
      bridgeColaboradores()
    ]);
    const ferias = await feriasDoPlano(inicio, fim, bridge).catch(() => []);

    return NextResponse.json({
      ok: true,
      hoje,
      inicio,
      fim,
      colaboradores: base.colaboradores,
      dias,
      nota: notas[0]?.texto || "",
      feriados: feriadosNoIntervalo(base.feriados, inicio, fim),
      ferias
    });
  } catch (e) {
    return erroBase(e, "escalas semanal GET");
  }
}
