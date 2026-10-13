/**
 * Layout de todas as páginas dentro do portal (área autenticada).
 *
 * Corre no SERVIDOR, antes de a página ser enviada:
 * 1. Valida a sessão (cookie httpOnly) com a base de dados;
 * 2. Sem sessão: manda para o login;
 * 3. Senha temporária: manda trocar a senha;
 * 4. Filtra o menu por permissões - só chega ao navegador o que o
 *    utilizador pode ver.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { MODULOS } from "@/lib/permissoes";
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

  // Menu visível: admin vê tudo; os outros seguem a matriz da base de
  // dados. O Painel Principal ("inicio") é visível para todos, como
  // pediste (o utilizador entra e vê o painel, mesmo com módulos limitados).
  const modulosVisiveis = MODULOS.filter((m) => {
    if (m.id === "inicio") return true;
    if (m.dev) return sessao.utilizador.nivel === "admin";
    return pode(sessao, m.id, "ver");
  });

  return (
    <Shell utilizador={sessao.utilizador} modulos={modulosVisiveis}>
      {children}
    </Shell>
  );
}
