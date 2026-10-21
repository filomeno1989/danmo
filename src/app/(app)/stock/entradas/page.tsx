/**
 * Stock - Entradas de material.
 *
 * Servidor: sessão + permissão "ver" no módulo stock.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { EntradasClient } from "./entradas-client";

export const metadata = { title: "Stock - Entradas | Portal Danmo" };

export default async function PaginaStockEntradas() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "stock", "ver")) redirect("/");

  return (
    <EntradasClient
      podeCriar={pode(sessao, "stock", "criar")}
      podeEditar={pode(sessao, "stock", "editar")}
      podeApagar={pode(sessao, "stock", "apagar")}
    />
  );
}
