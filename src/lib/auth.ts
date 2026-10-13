/**
 * auth.ts - Sessão e permissões, do lado do SERVIDOR.
 *
 * Como funciona nesta nova geração:
 * - Ao entrar, a função RPC "autenticar" (a mesma do hub) devolve um token
 *   de sessão. O token fica num cookie httpOnly: o JavaScript do navegador
 *   nunca o vê, e por isso nem vírus nem extensões o conseguem roubar.
 * - Em cada pedido, o servidor valida o token com a RPC "validar_sessao"
 *   (a mesma do hub) e carrega o utilizador + a matriz de permissões.
 * - A verificação acontece ANTES de a página ser construída: quem não tem
 *   acesso nem chega a ver o conteúdo.
 *
 * O restante do sistema usa pode() para decidir o que mostrar/permitir.
 */

import { cookies } from "next/headers";
import { rpc, modoEstrutura } from "@/lib/supabase";
import {
  COOKIE_SESSAO,
  NIVEL_LABEL,
  type Utilizador,
  type LinhaPermissao
} from "@/lib/uso-comum";

export { COOKIE_SESSAO, NIVEL_LABEL };
export type { Utilizador, LinhaPermissao };

export type RespostaValidacao = {
  valido: boolean;
  motivo?: string;
  utilizador?: Utilizador;
  matriz?: LinhaPermissao[];
};

export type Sessao = {
  utilizador: Utilizador;
  matriz: LinhaPermissao[];
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
      matriz: []
    };
  }

  try {
    const res = await rpc<RespostaValidacao>("validar_sessao", { p_token: token });
    if (!res || res.valido !== true || !res.utilizador) return null;
    return { utilizador: res.utilizador, matriz: res.matriz || [] };
  } catch {
    // Sem ligação à base de dados: tratar como sessão inválida.
    return null;
  }
}

/** Admin tem sempre acesso total; os outros seguem a matriz da base. */
export function pode(sessao: Sessao | null, modulo: string, acao: string): boolean {
  if (!sessao) return false;
  if (sessao.utilizador.nivel === "admin") return true;
  const linha = sessao.matriz.find(
    (p) => p.nivel === sessao.utilizador.nivel && p.modulo === modulo && p.acao === acao
  );
  return linha ? linha.permitido === true : false;
}
