/**
 * Disponibilidade - Configurações (meta ajustável e regras do módulo).
 *
 * Servidor: sessão + permissão "ver" no módulo disponibilidade.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { ConfigClient } from "./config-client";

export const metadata = { title: "Disponibilidade - Configurações | Portal Danmo" };

export default async function PaginaConfig() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "disponibilidade", "ver")) redirect("/");

  return <ConfigClient podeEditar={pode(sessao, "disponibilidade", "editar")} />;
}
