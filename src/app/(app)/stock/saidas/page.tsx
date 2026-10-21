/**
 * Stock - Saídas de material.
 *
 * Servidor: sessão + permissão "ver" no módulo stock.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { SaidasClient } from "./saidas-client";

export const metadata = { title: "Stock - Saídas | Portal Danmo" };

export default async function PaginaStockSaidas() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "stock.saidas", "ver")) return <SemAcesso pagina="stock.saidas" />;

  return (
    <SaidasClient
      podeCriar={pode(sessao, "stock.saidas", "criar")}
      podeEditar={pode(sessao, "stock.saidas", "editar")}
      podeApagar={pode(sessao, "stock.saidas", "apagar")}
    />
  );
}
