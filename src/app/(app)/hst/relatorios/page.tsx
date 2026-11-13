/**
 * /hst/relatorios - Relatórios do Portal HST.
 *
 * Migração do relatorios.html do hub: os 4 relatórios impressos passam
 * a abrir PÁGINAS A4 do portal (nada de window.open com document.write,
 * que o bloqueador de popups partia) e a lista de acidentes abre o
 * relatório de investigação de cada um.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { RelatoriosClient } from "./relatorios-client";

export const metadata = { title: "Relatórios | Portal HST | Portal Danmo" };

export default async function PaginaRelatoriosHst() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "hst.relatorios", "ver")) return <SemAcesso pagina="hst.relatorios" />;

  return <RelatoriosClient />;
}
