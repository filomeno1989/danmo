/**
 * /ferias/configuracoes - Regras do plano, feriados e manutenção.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { ConfiguracoesClient } from "./configuracoes-client";

export const metadata = { title: "Configurações de Férias | Portal Danmo" };

export default async function PaginaFeriasConfiguracoes() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferias.configuracoes", "ver")) {
    return <SemAcesso pagina="ferias.configuracoes" />;
  }

  return <ConfiguracoesClient podeApagar={pode(sessao, "ferias.configuracoes", "apagar")} />;
}
