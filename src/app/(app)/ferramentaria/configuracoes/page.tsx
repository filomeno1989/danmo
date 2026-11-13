/**
 * /ferramentaria/configuracoes - Categorias e Departamentos.
 *
 * Migração do configuracoes.html do hub: duas listas (tool_categories e
 * departamentos) com contagem de uso calculada no servidor, edição e
 * alternância activo/inactivo. Duplicados recusam-se no SERVIDOR.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { ConfiguracoesClient } from "./configuracoes-client";

export const metadata = { title: "Configurações | Ferramentaria | Portal Danmo" };

export default async function PaginaConfiguracoes() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferramentaria.configuracoes", "ver")) {
    return <SemAcesso pagina="ferramentaria.configuracoes" />;
  }

  return <ConfiguracoesClient />;
}
