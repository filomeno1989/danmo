/**
 * Stock - Materiais (catálogo).
 *
 * Servidor: sessão + permissão "ver" no módulo stock.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { MateriaisClient } from "./materiais-client";

export const metadata = { title: "Stock - Materiais | Portal Danmo" };

export default async function PaginaStockMateriais() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "stock.materiais", "ver")) return <SemAcesso pagina="stock.materiais" />;

  return (
    <MateriaisClient
      podeCriar={pode(sessao, "stock.materiais", "criar")}
      podeEditar={pode(sessao, "stock.materiais", "editar")}
    />
  );
}
