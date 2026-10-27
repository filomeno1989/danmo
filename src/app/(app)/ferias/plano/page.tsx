/**
 * /ferias/plano - Plano Anual de Férias (Admin. Oficinal).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { PlanoClient } from "./plano-client";

export const metadata = { title: "Plano Anual de Férias | Portal Danmo" };

export default async function PaginaFeriasPlano() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferias.plano", "ver")) return <SemAcesso pagina="ferias.plano" />;

  return <PlanoClient />;
}
