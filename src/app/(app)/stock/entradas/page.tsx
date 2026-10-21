/**
 * Stock - Entradas de material.
 *
 * Servidor: sessão + permissão "ver" no módulo stock.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { EntradasClient } from "./entradas-client";

export const metadata = { title: "Stock - Entradas | Portal Danmo" };

export default async function PaginaStockEntradas() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "stock.entradas", "ver")) return <SemAcesso pagina="stock.entradas" />;

  return (
    <EntradasClient
      podeCriar={pode(sessao, "stock.entradas", "criar")}
      podeEditar={pode(sessao, "stock.entradas", "editar")}
      podeApagar={pode(sessao, "stock.entradas", "apagar")}
    />
  );
}
