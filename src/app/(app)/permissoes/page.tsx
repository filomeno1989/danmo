/**
 * Permissões - Gestão de contas e da matriz de permissões por utilizador
 * (Fase 7 R1, modelo do Filomeno). Página só da administração.
 */

import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { PermissoesClient } from "./permissoes-client";

export const metadata = { title: "Permissões | Portal Danmo" };

export default async function PaginaPermissoes() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (sessao.utilizador.nivel !== "admin") return <SemAcesso pagina="permissoes" />;

  return (
    <PermissoesClient
      nomeAdmin={sessao.utilizador.nome}
    />
  );
}
