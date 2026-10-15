/**
 * guarda-api.ts - Porta de entrada de todas as rotas /api/oficina/*.
 *
 * Toda a escrita e leitura sensível passa aqui primeiro:
 * 1. Tem de haver sessão válida (cookie httpOnly);
 * 2. A acção pedida (ver/criar/editar/apagar) tem de estar permitida
 *    na matriz de permissões da base de dados (igual ao hub, mas agora
 *    exigida NO SERVIDOR - o navegador não decide sozinho).
 */

import { NextResponse } from "next/server";
import { obterSessao, pode, type Sessao } from "@/lib/auth";

export type AccaoOficina = "ver" | "criar" | "editar" | "apagar";

/**
 * Devolve a sessão se tudo estiver certo, ou uma NextResponse de erro
 * pronta a devolver (401 sem sessão, 403 sem permissão).
 */
export async function autorizado(
  accao: AccaoOficina
): Promise<Sessao | NextResponse> {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "Sessão expirada. Entra de novo." },
      { status: 401 }
    );
  }
  if (!pode(sessao, "oficina", accao)) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          accao === "ver"
            ? "Não tens permissão para ver a Oficina."
            : `Não tens permissão para ${accao} na Oficina.`
      },
      { status: 403 }
    );
  }
  return sessao;
}

/** Verdadeiro quando o resultado do autorizado é um erro pronto. */
export function eErro(
  r: Sessao | NextResponse
): r is NextResponse {
  return r instanceof NextResponse;
}

/** Converte erros da base numa resposta limpa (sem expor detalhes internos). */
export function erroBase(e: unknown, accao: string): NextResponse {
  const msg = e instanceof Error ? e.message : "Erro inesperado.";
  console.error(`[api/oficina] falha em ${accao}:`, msg);
  return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
}

/**
 * Guarda das rotas /api/disponibilidade/* - igual ao autorizado da Oficina,
 * mas contra o módulo "disponibilidade" (a matriz da base decide).
 */
export async function autorizadoDisp(
  accao: AccaoOficina
): Promise<Sessao | NextResponse> {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "Sessão expirada. Entra de novo." },
      { status: 401 }
    );
  }
  if (!pode(sessao, "disponibilidade", accao)) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          accao === "ver"
            ? "Não tens permissão para ver a Disponibilidade."
            : `Não tens permissão para ${accao} na Disponibilidade.`
      },
      { status: 403 }
    );
  }
  return sessao;
}
