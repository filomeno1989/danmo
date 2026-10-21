/**
 * /api/faturacao/proximo-numero - Sugestão de número para o editor.
 *
 * GET ?tipo=cotacao|fatura -> { ok, numero } (ex.: 011/2026).
 * Calculado no SERVIDOR: a sugestão nunca nasce do navegador (o bug da
 * fatura 002/26 duplicada no histórico do hub veio daqui).
 */

import { NextResponse, NextRequest } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { proximoNumero, anoActual } from "@/lib/faturacao";

export async function GET(req: NextRequest) {
  const auth = await autorizado("faturacao.editor", "ver");
  if (eErro(auth)) return auth;

  const tipo = new URL(req.url).searchParams.get("tipo") === "fatura" ? "fatura" : "cotacao";

  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({
      ok: true,
      estrutura: true,
      numero: tipo === "fatura" ? "012/2026" : "009/2026"
    });
  }

  try {
    const docs = await queryTudo<{ tipo: string; numero: string; data: string }>(
      "documentos",
      "select=tipo,numero,data"
    );
    return NextResponse.json({ ok: true, numero: proximoNumero(tipo, docs, anoActual()) });
  } catch (e) {
    return erroBase(e, "faturacao proximo-numero");
  }
}
