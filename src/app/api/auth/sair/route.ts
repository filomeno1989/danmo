/**
 * POST /api/auth/sair
 * Termina a sessão na base (RPC "terminar_sessao", a mesma do hub) e
 * apaga o cookie. Mesmo que a chamada à base falhe, o cookie é apagado:
 * o navegador fica sempre limpo.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rpc, modoEstrutura } from "@/lib/supabase";
import { COOKIE_SESSAO } from "@/lib/auth";

export async function POST(_req: NextRequest) {
  const loja = await cookies();
  const token = loja.get(COOKIE_SESSAO)?.value;

  if (token && !modoEstrutura()) {
    try {
      await rpc("terminar_sessao", { p_token: token });
    } catch {
      // Sessão já morta ou sem ligação: seguimos, o cookie morre na mesma.
    }
  }

  const resposta = NextResponse.json({ ok: true });
  resposta.cookies.set(COOKIE_SESSAO, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return resposta;
}
