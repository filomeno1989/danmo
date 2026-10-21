/**
 * Stock - Configurações.
 *
 * Servidor: sessão + permissão "ver" no módulo stock.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { ConfigClient } from "./config-client";

export const metadata = { title: "Stock - Configurações | Portal Danmo" };

export default async function PaginaStockConfig() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "stock", "ver")) redirect("/");

  return (
    <ConfigClient
      podeCriar={pode(sessao, "stock", "criar")}
      podeEditar={pode(sessao, "stock", "editar")}
    />
  );
}
