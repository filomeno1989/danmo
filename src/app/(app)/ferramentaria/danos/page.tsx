/**
 * /ferramentaria/danos - Registo e acompanhamento de danos.
 *
 * Migração do danos.html do hub: filtros por período, severidade e
 * status; resumo (total, custo, pior colaborador); acções de avançar
 * estado e inutilizar com confirmação. Os danos nascem das devoluções
 * com desastre (torto/partido/avariado/perdido); a sincronização do
 * inventário é feita pelo servidor.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { DanosClient } from "./danos-client";

export const metadata = { title: "Registo de Danos | Ferramentaria | Portal Danmo" };

export default async function PaginaDanos() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferramentaria.danos", "ver")) {
    return <SemAcesso pagina="ferramentaria.danos" />;
  }

  return <DanosClient />;
}
