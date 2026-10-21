/**
 * auth.ts - Sessão e permissões, do lado do SERVIDOR.
 *
 * Como funciona nesta nova geração:
 * - Ao entrar, a função RPC "autenticar" (a mesma do hub) devolve um token
 *   de sessão. O token fica num cookie httpOnly: o JavaScript do navegador
 *   nunca o vê, e por isso nem vírus nem extensões o conseguem roubar.
 * - Em cada pedido, o servidor valida o token com a RPC "validar_sessao_v2"
 *   (Fase 7 R1) e carrega o utilizador + a matriz POR UTILIZADOR.
 * - A verificação acontece ANTES de a página ser construída: quem não tem
 *   acesso nem chega a ver o conteúdo.
 *
 * Permissões (modelo do Filomeno, R1):
 * - admin: acesso total, sempre;
 * - os outros: a matriz por UTILIZADOR x PÁGINA com 3 marcas
 *   (ver / mexer / apagar), atribuída à mão na página Permissões;
 * - página sem linha na matriz = bloqueada.
 */

import { cookies } from "next/headers";
import { rpc, modoEstrutura } from "@/lib/supabase";
import {
  COOKIE_SESSAO,
  NIVEL_LABEL,
  type Utilizador,
  type LinhaPermissao,
  type AccaoPagina
} from "@/lib/uso-comum";

export { COOKIE_SESSAO, NIVEL_LABEL };
export type { Utilizador, LinhaPermissao, AccaoPagina };

export type RespostaValidacao = {
  valido: boolean;
  motivo?: string;
  utilizador?: Utilizador;
  matriz?: LinhaPermissao[];
};

export type Sessao = {
  utilizador: Utilizador;
  /** Matriz POR UTILIZADOR (linhas por página, com ver/mexer/apagar). */
  matriz: LinhaPermissao[];
  /** Token cru da sessão (para RPCs de gestão que exigem p_token). */
  token_sessao: string;
};

/**
 * Lê o cookie e valida a sessão no servidor.
 * Devolve null quando não há sessão válida.
 */
export async function obterSessao(): Promise<Sessao | null> {
  const loja = await cookies();
  const token = loja.get(COOKIE_SESSAO)?.value;
  if (!token) return null;

  // Modo estrutura (só em desenvolvimento, sem chaves): sessão fictícia
  // para poder desenhar e testar as páginas sem base de dados.
  if (modoEstrutura() && token === "estrutura") {
    return {
      utilizador: {
        id: 0,
        usuario: "ESTRUTURA",
        nome: "Modo Estrutura",
        cargo: "Apenas para desenvolver o desenho",
        nivel: "admin",
        precisa_trocar: false
      },
      matriz: [],
      token_sessao: token
    };
  }

  try {
    const res = await rpc<RespostaValidacao>("validar_sessao_v2", { p_token: token });
    if (!res || res.valido !== true || !res.utilizador) return null;
    return { utilizador: res.utilizador, matriz: res.matriz || [], token_sessao: token };
  } catch {
    // Sem ligação à base de dados: tratar como sessão inválida.
    return null;
  }
}

/**
 * Normaliza o vocabulário antigo (criar/editar) para as 3 marcas novas:
 * criar e editar eram "mexer" na prática, apagar mantém-se.
 */
export function normalizarAcao(acao: string): AccaoPagina {
  if (acao === "criar" || acao === "editar" || acao === "mexer") return "mexer";
  if (acao === "apagar") return "apagar";
  return "ver";
}

/** Admin tem sempre acesso total; os outros seguem a SUA matriz. */
export function pode(
  sessao: Sessao | null,
  pagina: string,
  acao: string
): boolean {
  if (!sessao) return false;
  if (sessao.utilizador.nivel === "admin") return true;
  const marca = normalizarAcao(acao);
  const linha = sessao.matriz.find((p) => p.pagina === pagina);
  if (!linha) return false;
  if (marca === "ver") return linha.ver === true;
  if (marca === "mexer") return linha.mexer === true && linha.ver === true;
  return linha.apagar === true && linha.mexer === true;
}

/**
 * Verdadeiro quando o utilizador pode VER pelo menos uma das páginas
 * (para dados partilhados: o catálogo de materiais serve às Entradas,
 * Saídas, Materiais e Relatórios do Stock, por exemplo).
 */
export function podeVerAlgum(sessao: Sessao | null, paginas: string[]): boolean {
  return paginas.some((p) => pode(sessao, p, "ver"));
}
