/**
 * /ferramentaria - Painel da Ferramentaria.
 *
 * Migração do dashboard.html do hub: 5 KPIs clicáveis, dois gráficos de
 * barras (top empréstimos e top danos por colaborador), ferramentas
 * fora agora e últimas devoluções com problema. Os números vivem na
 * lib/ferramentaria.ts (statsPainel), partilhados com a API e provas.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { PainelClient } from "./painel-client";

export const metadata = { title: "Painel Ferramentaria | Portal Danmo" };

export default async function PaginaFerramentaria() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferramentaria", "ver")) return <SemAcesso pagina="ferramentaria" />;

  return <PainelClient />;
}
