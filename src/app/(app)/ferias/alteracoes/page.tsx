/**
 * /ferias/alteracoes - Adiamentos e antecipações, com motivo e histórico.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { AlteracoesClient } from "./alteracoes-client";

export const metadata = { title: "Alterações de Férias | Portal Danmo" };

export default async function PaginaFeriasAlteracoes() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferias.alteracoes", "ver")) return <SemAcesso pagina="ferias.alteracoes" />;

  return <AlteracoesClient />;
}
