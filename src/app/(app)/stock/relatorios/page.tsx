/**
 * Stock - Relatórios.
 *
 * Servidor: sessão + permissão "ver" no módulo stock.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { RelatoriosClient } from "./relatorios-client";

export const metadata = { title: "Stock - Relatórios | Portal Danmo" };

export default async function PaginaStockRelatorios() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "stock.relatorios", "ver")) return <SemAcesso pagina="stock.relatorios" />;

  return <RelatoriosClient />;
}
