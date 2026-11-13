/**
 * /ferramentaria/relatorios - Relatórios e estatísticas do período.
 *
 * Migração do relatorios.html do hub com 3 melhorias: o período filtra
 * NO SERVIDOR, "Na Rua" mostra TODAS as ferramentas sem devolver (o hub
 * cortava pelo período e escondia atrasadas antigas), e há CSV do
 * período + papel A4 para arquivar (o hub não imprimia nada).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { RelatoriosClient } from "./relatorios-client";

export const metadata = { title: "Relatórios | Ferramentaria | Portal Danmo" };

export default async function PaginaRelatorios() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferramentaria.relatorios", "ver")) {
    return <SemAcesso pagina="ferramentaria.relatorios" />;
  }

  return <RelatoriosClient />;
}
