/**
 * Oficina - Configurações (categorias, grupos e Tabela de Preços).
 *
 * Servidor: sessão + permissão "ver" (oficina).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { ConfigClient } from "./config-client";

export const metadata = { title: "Oficina - Configurações | Portal Danmo" };

export default async function PaginaConfig() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina", "ver")) redirect("/");

  return (
    <ConfigClient
      podeCriar={pode(sessao, "oficina", "criar")}
      podeEditar={pode(sessao, "oficina", "editar")}
      podeApagar={pode(sessao, "oficina", "apagar")}
    />
  );
}
