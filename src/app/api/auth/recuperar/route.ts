/**
 * POST /api/auth/recuperar
 * Recuperacao de acesso SEM email (Fase 8), mediada pela administracao.
 *
 * - action "pedir":  { codigo }  -> nasce um pedido na aba Recuperacoes
 *   da pagina Permissoes. A administracao gera o codigo e passa-o ao
 *   colega em pessoa / WhatsApp.
 * - action "aplicar": { codigo, codigo_recuperacao, nova } -> o colega
 *   define a nova senha com o codigo de utilizacao unica que recebeu.
 *   A RPC na base valida o codigo, grava o hash, mata as sessoes activas
 *   e deixa tudo no registo de acessos.
 *
 * Proteccoes: limite de tentativas por codigo (5 falhas = 15 min), igual
 * ao login; mensagem amigavel enquanto o SQL da Fase 8 nao estiver na base.
 */

import { NextRequest, NextResponse } from "next/server";
import { rpc, modoEstrutura } from "@/lib/supabase";
import { estaBloqueado, registarFalha, minutosDeEspera } from "@/lib/rate-limit";

function erro(msg: string, status: number) {
  return NextResponse.json({ ok: false, erro: msg }, { status });
}

export async function POST(req: NextRequest) {
  let corpo: { action?: string; codigo?: string; codigo_recuperacao?: string; nova?: string };
  try {
    corpo = await req.json();
  } catch {
    return erro("Pedido inválido.", 400);
  }

  const action = String(corpo.action || "");
  if (action !== "pedir" && action !== "aplicar") {
    return erro("Acção desconhecida.", 400);
  }

  const codigo = String(corpo.codigo || "").trim().toUpperCase();

  // Modo estrutura: apenas em desenvolvimento, sem chaves configuradas.
  if (modoEstrutura()) {
    return NextResponse.json({ ok: true, estrutura: true });
  }

  const chaveBloqueio = `RECUP:${codigo || "?"}`;
  const bloqueio = estaBloqueado(chaveBloqueio);
  if (bloqueio.bloqueado) {
    return erro(
      `Muitas tentativas. Espera ${minutosDeEspera(bloqueio.esperaMs)} minuto(s) antes de voltar a tentar.`,
      429
    );
  }

  try {
    if (action === "pedir") {
      if (!codigo) {
        return erro("Escreve o teu código de colaborador.", 400);
      }
      await rpc("recuperacao_pedir", { p_usuario: codigo });
      return NextResponse.json({ ok: true });
    }

    // action "aplicar"
    const codigoRecuperacao = String(corpo.codigo_recuperacao || "").trim();
    const nova = String(corpo.nova || "");
    if (!codigo || !codigoRecuperacao || !nova) {
      return erro("Preenche o teu código, o código de recuperação e a nova senha.", 400);
    }
    if (nova.length < 6) {
      return erro("A nova senha precisa de ter pelo menos 6 caracteres.", 400);
    }
    await rpc("recuperacao_aplicar", {
      p_usuario: codigo,
      p_codigo: codigoRecuperacao,
      p_senha_nova: nova
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 404) {
      return erro(
        "A recuperação de acesso ainda está a ser activada. Fala com a administração, por favor.",
        503
      );
    }
    // Erro da própria RPC (ex.: código não encontrado, código errado):
    // credencial inválida, conta para o limite de tentativas.
    registarFalha(chaveBloqueio);
    return erro(err.message || "Não foi possível concluir a recuperação.", 400);
  }
}
