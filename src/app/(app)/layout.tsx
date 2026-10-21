/**
 * Layout de todas as páginas dentro do portal (área autenticada).
 *
 * Corre no SERVIDOR, antes de a página ser enviada:
 * 1. Valida a sessão (cookie httpOnly) com a base de dados;
 * 2. Sem sessão: manda para o login;
 * 3. Senha temporária: manda trocar a senha;
 * 4. Envia o menu COMPLETO + a lista de páginas autorizadas da matriz
 *    POR UTILIZADOR (Fase 7 R1): o menu nunca esconde, mostra bloqueado
 *    o que a pessoa não pode usar. O servidor decide sempre - as páginas
 *    e as APIs voltam a verificar do lado de lá.
 */

import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
import { MODULOS, PAGINAS } from "@/lib/permissoes";
import { Shell } from "@/components/shell";

export default async function LayoutApp({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const sessao = await obterSessao();

  if (!sessao) {
    redirect("/login?motivo=sem_sessao");
  }

  if (sessao.utilizador.precisa_trocar) {
    redirect("/login?trocar=1");
  }

  // Páginas autorizadas desta pessoa: admin entra em tudo; os outros
  // seguem a matriz (linha com "ver"). Início e o perfil próprio são
  // garantidos a todos e nem entram na matriz.
  const paginasAutorizadas =
    sessao.utilizador.nivel === "admin"
      ? PAGINAS.map((p) => p.pagina)
      : sessao.matriz.filter((p) => p.ver).map((p) => p.pagina);

  return (
    <Shell utilizador={sessao.utilizador} modulos={MODULOS} paginas={paginasAutorizadas}>
      {children}
    </Shell>
  );
}
