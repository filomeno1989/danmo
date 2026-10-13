/**
 * POST /api/auth/registo
 *
 * Auto-registo de utilizadores (o teu pedido: o colega coloca o código
 * do colaborador, o sistema busca os dados na base e ele só define a
 * senha). Duas acções no mesmo route:
 *
 * - action "verificar": recebe o código (ex.: DM0069) e devolve os
 *   dados pre-preenchidos da tabela collaborators (nome, departamento,
 *   categoria, contacto). Rejeita: código inexistente, colaborador
 *   inactivo ou que já tenha conta criada.
 * - action "criar": recebe código + senha e cria a conta com nível
 *   "pendente" (só vê o Painel Principal até a administração dar os
 *   acessos). O hash bcrypt corre na base, igual ao resto do sistema.
 *
 * Protecções: limite de tentativas por código (5 falhas = 15 min) e
 * mensagem amigável quando a base ainda não tem as funções do registo
 * (SQL ainda não colado).
 */

import { NextRequest, NextResponse } from "next/server";
import { rpc, modoEstrutura } from "@/lib/supabase";
import { estaBloqueado, registarFalha, minutosDeEspera } from "@/lib/rate-limit";

type DadosColaborador = {
  nome: string;
  departamento: string;
  categoria: string;
  contacto: string;
  ja_registado: boolean;
};

function erro(msg: string, status: number) {
  return NextResponse.json({ ok: false, erro: msg }, { status });
}

function rpcInexistente(e: { status?: number }): boolean {
  // 404: a função ainda não existe na base (SQL não colado)
  return e.status === 404;
}

export async function POST(req: NextRequest) {
  let corpo: { action?: string; codigo?: string; senha?: string };
  try {
    corpo = await req.json();
  } catch {
    return erro("Pedido inválido.", 400);
  }

  const codigo = String(corpo.codigo || "").trim().toUpperCase();
  if (!codigo) return erro("Escreve o teu código de colaborador.", 400);

  // Ambiente de desenho (sem chaves): dados fictícios, não grava nada.
  if (modoEstrutura()) {
    if (corpo.action === "criar") {
      return NextResponse.json({ ok: true, estrutura: true });
    }
    return NextResponse.json({
      ok: true,
      estrutura: true,
      dados: {
        nome: "Colaborador de Exemplo",
        departamento: "Manutenção",
        categoria: "Técnico",
        contacto: "84xxxxxxx",
        ja_registado: false
      }
    });
  }

  // Limite de tentativas por código de colaborador
  const chaveBloqueio = `REGISTO:${codigo}`;
  const bloqueio = estaBloqueado(chaveBloqueio);
  if (bloqueio.bloqueado) {
    return erro(
      `Muitas tentativas. Espera ${minutosDeEspera(bloqueio.esperaMs)} minuto(s) antes de voltar a tentar.`,
      429
    );
  }

  // ============ VERIFICAR código do colaborador ============
  if (corpo.action === "verificar") {
    try {
      const dados = await rpc<DadosColaborador>("dados_para_registo", {
        p_codigo: codigo
      });
      if (!dados || !dados.nome) {
        registarFalha(chaveBloqueio);
        return erro("Código não encontrado. Confere com a administração.", 404);
      }
      if (dados.ja_registado) {
        return erro(
          "Este código já tem acesso criado. Entra normalmente com a tua senha.",
          409
        );
      }
      return NextResponse.json({ ok: true, dados });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (rpcInexistente(err)) {
        return erro(
          "O auto-registo ainda está a ser activado. Tenta dentro de momentos ou fala com a administração.",
          503
        );
      }
      // A própria função devolve mensagens úteis (ex.: inactivo)
      registarFalha(chaveBloqueio);
      return erro(
        err.message || "Não foi possível verificar o código.",
        err.status || 500
      );
    }
  }

  // ============ CRIAR conta ============
  if (corpo.action === "criar") {
    const senha = String(corpo.senha || "");
    if (senha.length < 6) {
      return erro("A senha precisa de ter pelo menos 6 caracteres.", 400);
    }
    try {
      const res = await rpc<{ ok: boolean }>("registrar_utilizador", {
        p_codigo: codigo,
        p_senha: senha
      });
      if (!res || res.ok !== true) {
        return erro("Não foi possível criar o acesso. Tenta de novo.", 500);
      }
      return NextResponse.json({ ok: true });
    } catch (e) {
      const err = e as Error & { status?: number };
      if (rpcInexistente(err)) {
        return erro(
          "O auto-registo ainda está a ser activado. Tenta dentro de momentos ou fala com a administração.",
          503
        );
      }
      registarFalha(chaveBloqueio);
      return erro(
        err.message || "Não foi possível criar o acesso.",
        err.status || 500
      );
    }
  }

  return erro("Acção desconhecida.", 400);
}
