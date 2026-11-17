/**
 * /api/escalas/dias - gravação das células da grelha mensal.
 *
 * POST { ano, mes, linhas: [{ id, celulas: { "AAAA-MM-DD": codigo|null } }] }
 * Célula com código -> upsert (esc_dias, conflito colaborador_id+data).
 * Célula null -> apagada (o supervisor limpou a marcação).
 * Valida os códigos contra a legenda; nada de valor desconhecido entra.
 */

import { NextResponse } from "next/server";
import { delFiltro, upsert } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { CODIGOS_ESCALA, eFaltaSQL, eCodigoValido, mesDatas } from "@/lib/escalas";

type LinhaEntrada = { id: string; celulas: Record<string, string | null> };

export async function POST(request: Request) {
  const auth = await autorizado("escalas.mensal", "mexer");
  if (eErro(auth)) return auth;

  try {
    const corpo = (await request.json()) as {
      ano?: number;
      mes?: number;
      linhas?: LinhaEntrada[];
    };
    const linhas = corpo.linhas || [];
    if (!linhas.length) {
      return NextResponse.json({ ok: true, gravadas: 0, apagadas: 0 });
    }

    const datasMes = new Set(
      mesDatas(Number(corpo.ano) || 2000, Number(corpo.mes) || 1)
    );

    const paraGravar: { colaborador_id: string; data: string; codigo: string }[] = [];
    const filtrosApagar: string[] = [];

    for (const linha of linhas) {
      if (!linha?.id || !linha.celulas || typeof linha.celulas !== "object") continue;
      for (const [data, codigo] of Object.entries(linha.celulas)) {
        if (!datasMes.has(data)) continue; // só o mês aberto
        if (codigo == null || codigo === "") {
          filtrosApagar.push(`and(colaborador_id.eq.${linha.id},data.eq.${data})`);
          continue;
        }
        if (!eCodigoValido(codigo)) {
          return NextResponse.json(
            {
              ok: false,
              erro: `Código desconhecido em ${data} (aceites: ${CODIGOS_ESCALA.join(", ")}).`
            },
            { status: 400 }
          );
        }
        paraGravar.push({ colaborador_id: linha.id, data, codigo });
      }
    }

    let gravadas = 0;
    for (let i = 0; i < paraGravar.length; i += 500) {
      const lote = paraGravar.slice(i, i + 500);
      await upsert("esc_dias", lote, "colaborador_id,data");
      gravadas += lote.length;
    }

    let apagadas = 0;
    for (let i = 0; i < filtrosApagar.length; i += 60) {
      const lote = filtrosApagar.slice(i, i + 60);
      await delFiltro("esc_dias", `or=(${lote.join(",")})`);
      apagadas += lote.length;
    }

    return NextResponse.json({ ok: true, gravadas, apagadas });
  } catch (e) {
    if (eFaltaSQL(e)) {
      return NextResponse.json(
        {
          ok: false,
          erro: "As tabelas da Escala ainda não existem na base. Cola o sql/fase9-escalas.sql no Supabase."
        },
        { status: 503 }
      );
    }
    return erroBase(e, "escalas dias POST");
  }
}
