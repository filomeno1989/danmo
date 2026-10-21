/**
 * /api/portal/perfil - "Os meus dados" (todos os utilizadores).
 *
 * GET: conta + cadastro do colaborador (leitura) + as minhas solicitações.
 * POST:
 *   pedir  { campo, valor_pretendido, motivo }  solicita alteração
 *          (o próprio NUNCA edita: o admin resolve)
 */

import { NextRequest, NextResponse } from "next/server";
import { rpc, modoEstrutura } from "@/lib/supabase";
import { obterSessao } from "@/lib/auth";

const DADOS_FICTICIOS = {
  conta: {
    usuario: "ESTRUTURA",
    nome: "Modo Estrutura",
    cargo: "Apenas para desenvolver o desenho",
    nivel: "admin"
  },
  cadastro: {
    encontrado: true,
    code: "DM0069",
    name: "Filomeno (Modo Estrutura)",
    department: "Informática",
    categoria: "Técnico",
    setor: "Porto da Beira",
    funcao_grupo: "Sistemas",
    contacto: "+258 84 000 0000",
    contacto_1: "",
    contacto_2: "",
    email: "exemplo@danmo.co.mz",
    endereco: "Porto da Beira, Sofala",
    naturalidade: "Beira",
    estado_civil: "Casado",
    data_admissao: "2020-01-15"
  }
};

const MINHAS_FICTICIAS = [
  {
    id: "s1",
    campo: "contacto",
    valor_pretendido: "+258 84 000 0000",
    estado: "pendente",
    criado_em: "2026-10-20T08:00:00Z",
    resolvido_em: null,
    resposta: ""
  }
];

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "Sessão expirada. Entra de novo." },
      { status: 401 }
    );
  }

  if (modoEstrutura()) {
    return NextResponse.json({
      ok: true,
      dados: DADOS_FICTICIOS,
      minhas: MINHAS_FICTICIAS,
      campos: [
        "contacto",
        "contacto_1",
        "contacto_2",
        "email",
        "endereco",
        "naturalidade",
        "estado_civil"
      ]
    });
  }

  try {
    const [dados, minhas] = await Promise.all([
      rpc("meus_dados", { p_token: sessao.token_sessao }),
      rpc("meus_dados_minhas", { p_token: sessao.token_sessao })
    ]);
    return NextResponse.json({
      ok: true,
      dados,
      minhas: Array.isArray(minhas) ? minhas : []
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 404) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            "As funções do perfil ainda não estão na base. Cola o SQL da Fase 7 R1 no Supabase."
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
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "Sessão expirada. Entra de novo." },
      { status: 401 }
    );
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  if (String(corpo.action || "") !== "pedir") {
    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  }

  if (modoEstrutura()) {
    return NextResponse.json({ ok: true, estrutura: true });
  }

  try {
    await rpc("meus_dados_pedir", {
      p_token: sessao.token_sessao,
      p_campo: String(corpo.campo || ""),
      p_valor_pretendido: String(corpo.valor || ""),
      p_motivo: String(corpo.motivo || "")
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 404) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            "As funções do perfil ainda não estão na base. Cola o SQL da Fase 7 R1 no Supabase."
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, erro: err.message || "Não foi possível enviar a solicitação." },
      { status: err.status || 400 }
    );
  }
}
