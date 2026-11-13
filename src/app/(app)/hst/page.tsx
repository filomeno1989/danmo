/**
 * /hst - Painel do Portal HST (Higiene e Segurança no Trabalho).
 *
 * Migração do dashboard.html do hub: KPIs, alertas vivos, dois gráficos
 * de barras e as últimas medições de tensão. Os cálculos vivem na
 * lib/hst.ts (statsPainelHst, alertasPainelHst), partilhados com a API
 * e com as provas.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { HstClient } from "./hst-client";

export const metadata = { title: "Portal HST | Portal Danmo" };

export default async function PaginaHst() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "hst", "ver")) return <SemAcesso pagina="hst" />;

  return <HstClient />;
}
