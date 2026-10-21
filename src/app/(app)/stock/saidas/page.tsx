/**
 * Stock - Saídas de material.
 *
 * Servidor: sessão + permissão "ver" no módulo stock.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SaidasClient } from "./saidas-client";

export const metadata = { title: "Stock - Saídas | Portal Danmo" };

export default async function PaginaStockSaidas() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "stock", "ver")) redirect("/");

  return (
    <SaidasClient
      podeCriar={pode(sessao, "stock", "criar")}
      podeEditar={pode(sessao, "stock", "editar")}
      podeApagar={pode(sessao, "stock", "apagar")}
    />
  );
}
