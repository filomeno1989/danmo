/**
 * /ferramentaria/devolucoes - Histórico de devoluções.
 *
 * Migração do devolucoes.html do hub: filtros por período, estado e
 * colaborador (por nome ou código) + tabela com as devoluções. Fonte
 * única: tipo=devolucao (cada devolução grava uma linha própria, por
 * isso nunca se duplica).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { DevolucoesClient } from "./devolucoes-client";

export const metadata = { title: "Devoluções | Ferramentaria | Portal Danmo" };

export default async function PaginaDevolucoes() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferramentaria.devolucoes", "ver")) {
    return <SemAcesso pagina="ferramentaria.devolucoes" />;
  }

  return <DevolucoesClient />;
}
