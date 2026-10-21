/**
 * Gestão de Stock - Painel.
 *
 * Servidor: sessão + permissão "ver" no módulo stock.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { StockPainelClient } from "./painel-client";

export const metadata = { title: "Stock - Painel | Portal Danmo" };

export default async function PaginaStockPainel() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "stock", "ver")) return <SemAcesso pagina="stock" />;

  return (
    <StockPainelClient
      podeCriar={pode(sessao, "stock", "criar")}
      podeEditar={pode(sessao, "stock", "editar")}
    />
  );
}
