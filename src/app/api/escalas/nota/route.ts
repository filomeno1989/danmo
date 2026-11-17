/**
 * /api/escalas/nota - a nota importante do mês (pe do papel afixado).
 *
 * POST { ano, mes, texto }: grava a nota do mês (ex.: "Entre os dias
 * 07/01 a 13/01 teremos operação de granito..."). Texto vazio apaga.
 */

import { NextResponse } from "next/server";
import { delFiltro, upsert } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { eFaltaSQL } from "@/lib/escalas";

export async function POST(request: Request) {
  const auth = await autorizado("escalas.mensal", "mexer");
  if (eErro(auth)) return auth;
  try {
    const c = (await request.json()) as { ano?: number; mes?: number; texto?: string };
    const ano = Number(c.ano);
    const mes = Number(c.mes);
    if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
      return NextResponse.json({ ok: false, erro: "Mês ou ano inválido." }, { status: 400 });
    }
    const texto = String(c.texto || "").trim();
    if (texto.length > 400) {
      return NextResponse.json(
        { ok: false, erro: "Nota demasiado longa (máx. 400 caracteres)." },
        { status: 400 }
      );
    }
    if (!texto) {
      await delFiltro("esc_notas", `ano=eq.${ano}&mes=eq.${mes}`);
      return NextResponse.json({ ok: true, texto: "" });
    }
    await upsert("esc_notas", [{ ano, mes, texto }], "ano,mes");
    return NextResponse.json({ ok: true, texto });
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
    return erroBase(e, "escalas nota POST");
  }
}
