/**
 * /api/portal/fundos - Fotos do slideshow de fundo do login.
 *
 * GET: lista pública (a página de login é aberta). Lê as fotos da base
 * pela função "fundos_login" (segura, definida no SQL). Sem fotos ou
 * função ainda não colada: devolve lista vazia e o login usa o fundo
 * de gradiente da marca.
 *
 * POST: gestão (só administração, com cookie de sessão + chave de
 * administração, igual ao hub):
 * - action "guardar": { posicao (1 a 4), foto (data URL), nome }
 * - action "apagar": { posicao }
 */

import { NextRequest, NextResponse } from "next/server";
import { rpc, modoEstrutura } from "@/lib/supabase";
import { obterSessao } from "@/lib/auth";
import type { FundoLogin } from "@/lib/uso-comum";

const MAX_FOTO_BASE64 = 700_000; // ~700 KB por foto depois de comprimida
const POSICOES = [1, 2, 3, 4];

export async function GET() {
  // As fotos mudam raramente (só quando a administração grava): deixar o
  // navegador guardá-las 5 minutos e revalidar em segundo plano. O login
  // e o painel partilham a mesma resposta, sem pesar na rede.
  const cabecalhos = {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=3600"
  };
  if (modoEstrutura()) {
    return NextResponse.json({ ok: true, fundos: [] as FundoLogin[] }, { headers: cabecalhos });
  }
  try {
    const lista = await rpc<FundoLogin[]>("fundos_login");
    return NextResponse.json(
      {
        ok: true,
        fundos: Array.isArray(lista) ? lista : []
      },
      { headers: cabecalhos }
    );
  } catch {
    // Função ausente ou base indisponível: login segue com o gradiente
    return NextResponse.json({ ok: true, fundos: [] as FundoLogin[] }, { headers: cabecalhos });
  }
}

export async function POST(req: NextRequest) {
  // Só administração, com sessão válida (cookie httpOnly)
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "Sessão expirada. Entra de novo." },
      { status: 401 }
    );
  }
  if (sessao.utilizador.nivel !== "admin") {
    return NextResponse.json(
      { ok: false, erro: "Só a administração pode personalizar o portal." },
      { status: 403 }
    );
  }

  let corpo: {
    action?: string;
    posicao?: number;
    foto?: string;
    nome?: string;
    chave?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  const posicao = Number(corpo.posicao || 0);
  if (!POSICOES.includes(posicao)) {
    return NextResponse.json(
      { ok: false, erro: "Escolhe uma posição entre 1 e 4." },
      { status: 400 }
    );
  }

  if (modoEstrutura()) {
    return NextResponse.json({ ok: true, estrutura: true });
  }

  try {
    if (corpo.action === "guardar") {
      const foto = String(corpo.foto || "");
      if (!foto.startsWith("data:image/")) {
        return NextResponse.json(
          { ok: false, erro: "Ficheiro de imagem inválido." },
          { status: 400 }
        );
      }
      if (foto.length > MAX_FOTO_BASE64) {
        return NextResponse.json(
          { ok: false, erro: "A foto ficou grande demais depois de comprimir. Tenta outra com menos detalhe." },
          { status: 413 }
        );
      }
      await rpc("guardar_fundo_login", {
        p_token: sessao.token_sessao,
        p_chave: String(corpo.chave || ""),
        p_posicao: posicao,
        p_foto: foto,
        p_nome: String(corpo.nome || "").slice(0, 80)
      });
      return NextResponse.json({ ok: true });
    }

    if (corpo.action === "apagar") {
      await rpc("apagar_fundo_login", {
        p_token: sessao.token_sessao,
        p_chave: String(corpo.chave || ""),
        p_posicao: posicao
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 404) {
      return NextResponse.json(
        { ok: false, erro: "As funções ainda não estão activadas na base (cola o SQL da Fase 1)." },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { ok: false, erro: err.message || "Não foi possível gravar." },
      { status: err.status || 500 }
    );
  }
}
