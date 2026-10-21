/**
 * Oficina - Configurações (categorias, grupos e Tabela de Preços).
 *
 * Servidor: sessão + permissão "ver" (oficina).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { ConfigClient } from "./config-client";

export const metadata = { title: "Oficina - Configurações | Portal Danmo" };

export default async function PaginaConfig() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina.config", "ver")) return <SemAcesso pagina="oficina.config" />;

  return (
    <ConfigClient
      podeCriar={pode(sessao, "oficina.config", "criar")}
      podeEditar={pode(sessao, "oficina.config", "editar")}
      podeApagar={pode(sessao, "oficina.config", "apagar")}
    />
  );
}
