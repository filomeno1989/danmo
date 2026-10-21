/**
 * guarda-api.ts - Porta de entrada de todas as rotas /api/*.
 *
 * Toda a escrita e leitura sensível passa aqui primeiro:
 * 1. Tem de haver sessão válida (cookie httpOnly);
 * 2. A acção pedida (ver/mexer/apagar) tem de estar permitida na matriz
 *    POR UTILIZADOR da base de dados para a PÁGINA a que a rota pertence
 *    - o navegador não decide sozinho (Fase 7 R1).
 */

import { NextResponse } from "next/server";
import { obterSessao, pode, podeVerAlgum, type Sessao } from "@/lib/auth";
import type { AccaoPagina } from "@/lib/uso-comum";

/**
 * Vocabulário antigo das rotas (criar/editar) mantido por compatibilidade:
 * autorizado() normaliza para as 3 marcas da matriz.
 */
export type AccaoOficina = "ver" | "criar" | "editar" | "apagar";

/**
 * Devolve a sessão se tudo estiver certo, ou uma NextResponse de erro
 * pronta a devolver (401 sem sessão, 403 sem permissão).
 * `pagina` é o id da página na matriz (ex.: "stock.entradas").
 */
export async function autorizado(
  pagina: string,
  accao: AccaoPagina | string
): Promise<Sessao | NextResponse> {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "Sessão expirada. Entra de novo." },
      { status: 401 }
    );
  }
  if (!pode(sessao, pagina, accao)) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          accao === "ver"
            ? `Não tens permissão para ver esta página (${pagina}).`
            : `Não tens permissão para ${accao} nesta página (${pagina}).`
      },
      { status: 403 }
    );
  }
  return sessao;
}

/**
 * Igual ao autorizado, mas basta ter permissão de "ver" numa das páginas
 * (para APIs de dados partilhados entre páginas do mesmo módulo).
 */
export async function autorizadoEmAlguma(
  paginas: string[]
): Promise<Sessao | NextResponse> {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json(
      { ok: false, erro: "Sessão expirada. Entra de novo." },
      { status: 401 }
    );
  }
  if (!podeVerAlgum(sessao, paginas)) {
    return NextResponse.json(
      { ok: false, erro: "Não tens permissão para ver esta área." },
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
  console.error(`[api] falha em ${accao}:`, msg);
  return NextResponse.json({ ok: false, erro: msg }, { status: 500 });
}

/* ------------------------------------------------------------------
 * Wrappers por módulo (mantêm a assinatura de sempre nas rotas:
 * autorizadoStock("stock.entradas", "mexer"), etc.)
 * ------------------------------------------------------------------ */

/** Guarda das rotas /api/oficina/*: página da oficina em causa. */
export async function autorizadoOficina(
  pagina: string,
  accao: AccaoPagina | string
): Promise<Sessao | NextResponse> {
  return autorizado(pagina, accao);
}

/** Guarda das rotas /api/disponibilidade/*. */
export async function autorizadoDisp(
  pagina: string,
  accao: AccaoPagina | string
): Promise<Sessao | NextResponse> {
  return autorizado(pagina, accao);
}

/** Guarda das rotas /api/stock/*. */
export async function autorizadoStock(
  pagina: string,
  accao: AccaoPagina | string
): Promise<Sessao | NextResponse> {
  return autorizado(pagina, accao);
}
