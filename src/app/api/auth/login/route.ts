/**
 * POST /api/auth/login
 * Recebe { codigo, senha }, valida contra a RPC "autenticar" (a mesma do
 * hub, com bcrypt na base) e cria o cookie de sessão httpOnly.
 *
 * Protecções:
 * - Limite de tentativas (5 falhas -> 15 min de espera) antes de tocar na base;
 * - Cookie httpOnly + secure + sameSite lax, validade de 12h (igual ao hub);
 * - Texto vazio é rejeitado sem gastar tentativa.
 */

import { NextRequest, NextResponse } from "next/server";
import { rpc, modoEstrutura } from "@/lib/supabase";
import { COOKIE_SESSAO } from "@/lib/auth";
import { estaBloqueado, registarFalha, limparFalhas, minutosDeEspera } from "@/lib/rate-limit";

type RespostaAutenticar = {
  token: string;
  expira_em: string;
  utilizador: {
    id: number | string;
    usuario: string;
    nome: string;
    cargo: string;
    nivel: string;
    precisa_trocar: boolean;
  };
};

export async function POST(req: NextRequest) {
  let corpo: { codigo?: string; senha?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  const codigo = String(corpo.codigo || "").trim().toUpperCase();
  const senha = String(corpo.senha || "");

  if (!codigo || !senha) {
    return NextResponse.json(
      { ok: false, erro: "Escreve o teu código e a senha." },
      { status: 400 }
    );
  }

  // Modo estrutura: apenas em desenvolvimento, sem chaves configuradas.
  // Em produção isto nunca corre (ver supabase.ts).
  if (modoEstrutura()) {
    const res = NextResponse.json({ ok: true, precisa_trocar: false, estrutura: true });
    res.cookies.set(COOKIE_SESSAO, "estrutura", {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 12
    });
    return res;
  }

  const bloqueio = estaBloqueado(codigo);
  if (bloqueio.bloqueado) {
    const minutos = minutosDeEspera(bloqueio.esperaMs);
    return NextResponse.json(
      {
        ok: false,
        erro: `Muitas tentativas falhadas. Espera ${minutos} minuto(s) antes de voltar a tentar.`
      },
      { status: 429 }
    );
  }

  let res: RespostaAutenticar;
  try {
    res = await rpc<RespostaAutenticar>("autenticar", {
      p_usuario: codigo,
      p_senha: senha
    });
  } catch (err) {
    const e = err as Error & { status?: number };
    if (e.status === 404) {
      return NextResponse.json(
        { ok: false, erro: "O sistema está em atualização. Tenta dentro de momentos." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, erro: e.message || "Erro de ligação. Tenta novamente." },
      { status: 500 }
    );
  }

  if (!res || !res.token) {
    return NextResponse.json(
      { ok: false, erro: "Não foi possível entrar. Tenta de novo." },
      { status: 401 }
    );
  }

  limparFalhas(codigo);

  // Validade do cookie = validade do token (12h no hub). Se a base mandar
  // uma data, usamos essa; senão 12h fixas.
  const expira = res.expira_em ? new Date(res.expira_em).getTime() : Date.now() + 12 * 3600 * 1000;
  const maxAge = Math.max(60, Math.floor((expira - Date.now()) / 1000));

  const resposta = NextResponse.json({
    ok: true,
    precisa_trocar: Boolean(res.utilizador?.precisa_trocar)
  });
  resposta.cookies.set(COOKIE_SESSAO, res.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge
  });
  return resposta;
}
