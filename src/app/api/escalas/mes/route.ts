/**
 * /api/escalas/mes?ano=AAAA&mes=MM - dados da escala mensal.
 *
 * GET: o registo, as células do mês, a nota do mês, os feriados, as
 * férias do plano que caem no mês (por código da escala) e o saldo de
 * folgas guardadas de cada pessoa. Sem SQL da Fase 9, responde
 * sqlFalta para o ecrã dizer ao Filomeno o que falta.
 */

import { NextResponse } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import { hojeEsc, mesDatas, type EscDia, type EscFolga } from "@/lib/escalas";
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
  const ano = Number(url.searchParams.get("ano")) || Number(hoje.slice(0, 4));
  const mes = Number(url.searchParams.get("mes")) || Number(hoje.slice(5, 7));

  try {
    const base = await carregarBase();
    if (base.sqlFalta) {
      return NextResponse.json({ ok: true, hoje, ano, mes, sqlFalta: true, feriados: base.feriados });
    }
    const datas = mesDatas(ano, mes);
    const de = datas[0];
    const ate = datas[datas.length - 1];

    const [dias, notas, bridge] = await Promise.all([
      queryTudo<EscDia>(
        "esc_dias",
        `select=colaborador_id,data,codigo&data=gte.${de}&data=lte.${ate}&order=data.asc`
      ),
      queryTudo<{ ano: number; mes: number; texto: string }>(
        "esc_notas",
        `select=ano,mes,texto&ano=eq.${ano}&mes=eq.${mes}`
      ),
      bridgeColaboradores()
    ]);

    const ferias = await feriasDoPlano(de, ate, bridge).catch(() => []);

    return NextResponse.json({
      ok: true,
      hoje,
      ano,
      mes,
      colaboradores: base.colaboradores,
      dias,
      nota: notas[0]?.texto || "",
      feriados: feriadosNoIntervalo(base.feriados, de, ate),
      ferias,
      folgasSaldo: saldos(base.folgas)
    });
  } catch (e) {
    return erroBase(e, "escalas mes GET");
  }
}

/** Saldo de folgas guardadas por pessoa (esc_folgas lidas na base). */
function saldos(folgas: EscFolga[]): { colaborador_id: string; saldo: number }[] {
  const mapa = new Map<string, number>();
  for (const f of folgas) {
    if (f.estado !== "guardada") continue;
    mapa.set(f.colaborador_id, (mapa.get(f.colaborador_id) || 0) + (Number(f.valor) || 0));
  }
  return [...mapa.entries()].map(([colaborador_id, saldo]) => ({ colaborador_id, saldo }));
}
