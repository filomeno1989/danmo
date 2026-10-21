/**
 * /api/portal/permissoes - Gestão de contas e da matriz de permissões
 * (página Permissões, Fase 7 R1). Só a administração.
 *
 * GET: lista de contas (pendentes primeiro) + solicitações de dados.
 * POST: acções, todas contra funções RPC security definer:
 *   matriz               { utilizador_id }
 *   gravar-pagina        { utilizador_id, pagina, ver, mexer, apagar }
 *   criar-conta          { codigo, senha, nivel, chave }
 *   aprovar              { utilizador_id, nivel }
 *   rejeitar             { utilizador_id, chave }              (destrutiva)
 *   activar              { utilizador_id, activo }
 *   reset-senha          { utilizador_id, senha_nova, chave }  (destrutiva)
 *   nivel                { utilizador_id, nivel }
 *   resolver-solicitacao { solicitacao_id, aplicar, resposta }
 */

import { NextRequest, NextResponse } from "next/server";
import { rpc, modoEstrutura } from "@/lib/supabase";
import { obterSessao } from "@/lib/auth";

/* Dados fictícios do modo estrutura (para desenhar/testar sem base). */
const USUARIOS_FICTICIOS = [
  {
    id: "1",
    usuario: "DM0069",
    nome: "Filomeno (Modo Estrutura)",
    cargo: "Administrador do sistema",
    nivel: "admin",
    ativo: true,
    precisa_trocar: false,
    tem_permissoes: false
  },
  {
    id: "2",
    usuario: "DM0101",
    nome: "Gestor do Stock (exemplo)",
    cargo: "Encarregado do armazém",
    nivel: "gestor",
    ativo: true,
    precisa_trocar: false,
    tem_permissoes: true
  },
  {
    id: "3",
    usuario: "DM0140",
    nome: "Colega por aprovar (exemplo)",
    cargo: "Motorista",
    nivel: "pendente",
    ativo: true,
    precisa_trocar: false,
    tem_permissoes: false
  }
];
const SOLICITACOES_FICTICIAS = [
  {
    id: "s1",
    utilizador: "DM0101",
    nome: "Gestor do Stock (exemplo)",
    campo: "contacto",
    valor_pretendido: "+258 84 000 0000",
    motivo: "Mudei de número.",
    estado: "pendente",
    criado_em: "2026-10-20T08:00:00Z",
    resolvido_em: null,
    resposta: ""
  }
];
const MATRIZ_FICTICIA = [
  { pagina: "stock", ver: true, mexer: true, apagar: false },
  { pagina: "stock.entradas", ver: true, mexer: true, apagar: true }
];

function semSessao() {
  return NextResponse.json(
    { ok: false, erro: "Sessão expirada. Entra de novo." },
    { status: 401 }
  );
}

function soAdmin() {
  return NextResponse.json(
    { ok: false, erro: "Só a administração pode usar a página Permissões." },
    { status: 403 }
  );
}

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) return semSessao();
  if (sessao.utilizador.nivel !== "admin") return soAdmin();

  if (modoEstrutura()) {
    return NextResponse.json({
      ok: true,
      usuarios: USUARIOS_FICTICIOS,
      solicitacoes: SOLICITACOES_FICTICIAS
    });
  }

  try {
    const [usuarios, solicitacoes] = await Promise.all([
      rpc("permissoes_usuarios_lista", { p_token: sessao.token_sessao }),
      rpc("meus_dados_solicitacoes", { p_token: sessao.token_sessao })
    ]);
    return NextResponse.json({
      ok: true,
      usuarios: Array.isArray(usuarios) ? usuarios : [],
      solicitacoes: Array.isArray(solicitacoes) ? solicitacoes : []
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 404) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            "As funções de permissões ainda não estão na base. Cola o SQL da Fase 7 R1 no Supabase."
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, erro: err.message || "Não foi possível carregar." },
      { status: err.status || 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const sessao = await obterSessao();
  if (!sessao) return semSessao();
  if (sessao.utilizador.nivel !== "admin") return soAdmin();

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  const action = String(corpo.action || "");
  const token = sessao.token_sessao;

  if (modoEstrutura()) {
    if (action === "matriz") {
      return NextResponse.json({ ok: true, matriz: MATRIZ_FICTICIA });
    }
    return NextResponse.json({ ok: true, estrutura: true });
  }

  try {
    switch (action) {
      case "matriz": {
        const matriz = await rpc("permissoes_matriz", {
          p_token: token,
          p_utilizador_id: String(corpo.utilizador_id || "")
        });
        return NextResponse.json({
          ok: true,
          matriz: Array.isArray(matriz) ? matriz : []
        });
      }
      case "gravar-pagina": {
        await rpc("permissoes_gravar", {
          p_token: token,
          p_utilizador_id: String(corpo.utilizador_id || ""),
          p_pagina: String(corpo.pagina || ""),
          p_ver: Boolean(corpo.ver),
          p_mexer: Boolean(corpo.mexer),
          p_apagar: Boolean(corpo.apagar)
        });
        return NextResponse.json({ ok: true });
      }
      case "criar-conta": {
        await rpc("permissoes_criar_conta", {
          p_token: token,
          p_chave_admin: String(corpo.chave || ""),
          p_codigo: String(corpo.codigo || ""),
          p_senha: String(corpo.senha || ""),
          p_nivel: String(corpo.nivel || "")
        });
        return NextResponse.json({ ok: true });
      }
      case "aprovar": {
        await rpc("permissoes_aprovar", {
          p_token: token,
          p_utilizador_id: String(corpo.utilizador_id || ""),
          p_nivel: String(corpo.nivel || "")
        });
        return NextResponse.json({ ok: true });
      }
      case "rejeitar": {
        await rpc("permissoes_rejeitar", {
          p_token: token,
          p_utilizador_id: String(corpo.utilizador_id || ""),
          p_chave_admin: String(corpo.chave || "")
        });
        return NextResponse.json({ ok: true });
      }
      case "activar": {
        await rpc("permissoes_activar", {
          p_token: token,
          p_utilizador_id: String(corpo.utilizador_id || ""),
          p_activo: Boolean(corpo.activo)
        });
        return NextResponse.json({ ok: true });
      }
      case "reset-senha": {
        await rpc("permissoes_reset_senha", {
          p_token: token,
          p_chave_admin: String(corpo.chave || ""),
          p_utilizador_id: String(corpo.utilizador_id || ""),
          p_senha_nova: String(corpo.senha_nova || "")
        });
        return NextResponse.json({ ok: true });
      }
      case "nivel": {
        await rpc("permissoes_nivel", {
          p_token: token,
          p_utilizador_id: String(corpo.utilizador_id || ""),
          p_nivel: String(corpo.nivel || "")
        });
        return NextResponse.json({ ok: true });
      }
      case "resolver-solicitacao": {
        await rpc("meus_dados_resolver", {
          p_token: token,
          p_solicitacao_id: String(corpo.solicitacao_id || ""),
          p_aplicar: Boolean(corpo.aplicar),
          p_resposta: String(corpo.resposta || "")
        });
        return NextResponse.json({ ok: true });
      }
      default:
        return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
    }
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 404) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            "As funções de permissões ainda não estão na base. Cola o SQL da Fase 7 R1 no Supabase."
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, erro: err.message || "Não foi possível gravar." },
      { status: err.status || 400 }
    );
  }
}
