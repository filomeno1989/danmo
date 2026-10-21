/**
 * Os meus dados - Perfil de cada utilizador (garantido a todos).
 *
 * Conta do portal + cadastro do colaborador em leitura, troca de senha e
 * solicitações de alteração (o próprio NUNCA edita: o admin resolve -
 * decisão do Filomeno contra dados falsificados).
 */

import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
import { PerfilClient } from "./perfil-client";

export const metadata = { title: "Os meus dados | Portal Danmo" };

export default async function PaginaPerfil() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");

  return (
    <PerfilClient
      nome={sessao.utilizador.nome}
      usuario={sessao.utilizador.usuario}
    />
  );
}
