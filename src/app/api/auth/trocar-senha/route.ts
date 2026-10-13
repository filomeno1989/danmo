/**
 * POST /api/auth/trocar-senha
 * Troca da própria senha (primeiro acesso com senha temporária ou por
 * vontade própria). Usa a RPC "trocar_senha" (a mesma do hub), que valida
 * a senha actual e grava o novo hash bcrypt.
 *
 * Depois de trocar com sucesso, a sessão é terminada e o utilizador volta
 * ao login com a mensagem de confirmação. Assim não dependemos de estados
 * internos: entra limpo com a senha nova.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { rpc, modoEstrutura } from "@/lib/supabase";
import { COOKIE_SESSAO } from "@/lib/auth";

export async function POST(req: NextRequest) {
  let corpo: { atual?: string; nova?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  const atual = String(corpo.atual || "");
  const nova = String(corpo.nova || "");

  if (!atual || !nova) {
    return NextResponse.json(
      { ok: false, erro: "Preenche a senha atual e a nova senha." },
      { status: 400 }
    );
  }
  if (nova.length < 6) {
    return NextResponse.json(
      { ok: false, erro: "A nova senha precisa de ter pelo menos 6 caracteres." },
      { status: 400 }
    );
  }
  if (nova === atual) {
    return NextResponse.json(
      { ok: false, erro: "A nova senha não pode ser igual à atual." },
      { status: 400 }
    );
  }

  if (modoEstrutura()) {
    return NextResponse.json(
      { ok: false, erro: "Modo estrutura: sem base de dados para trocar a senha." },
      { status: 400 }
    );
  }

  const loja = await cookies();
  const token = loja.get(COOKIE_SESSAO)?.value;
  if (!token) {
    return NextResponse.json(
      { ok: false, erro: "Sessão expirada. Entra de novo." },
      { status: 401 }
    );
  }

  try {
    await rpc("trocar_senha", { p_token: token, p_atual: atual, p_nova: nova });
  } catch (err) {
    const e = err as Error;
    return NextResponse.json(
      { ok: false, erro: e.message || "Não foi possível trocar a senha." },
      { status: 400 }
    );
  }

  // Fecha a sessão actual por segurança: entra de novo com a senha nova.
  try {
    await rpc("terminar_sessao", { p_token: token });
  } catch {
    // seguimos
  }

  const resposta = NextResponse.json({ ok: true, entrar_de_novo: true });
  resposta.cookies.set(COOKIE_SESSAO, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0
  });
  return resposta;
}
