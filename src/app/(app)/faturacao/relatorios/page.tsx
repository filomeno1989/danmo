/**
 * /faturacao/relatorios - Relatórios de Cotações e Faturas (servidor).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { RelatoriosClient } from "./relatorios-client";

export const metadata = { title: "Faturação - Relatórios | Portal Danmo" };

export default async function PaginaRelatoriosFat() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "faturacao.relatorios", "ver")) return <SemAcesso pagina="faturacao.relatorios" />;

  return <RelatoriosClient />;
}
