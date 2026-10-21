/**
 * Stock - Materiais (catálogo).
 *
 * Servidor: sessão + permissão "ver" no módulo stock.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { MateriaisClient } from "./materiais-client";

export const metadata = { title: "Stock - Materiais | Portal Danmo" };

export default async function PaginaStockMateriais() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "stock", "ver")) redirect("/");

  return (
    <MateriaisClient
      podeCriar={pode(sessao, "stock", "criar")}
      podeEditar={pode(sessao, "stock", "editar")}
    />
  );
}
