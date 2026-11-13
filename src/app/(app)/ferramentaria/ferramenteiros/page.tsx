/**
 * /ferramentaria/ferramenteiros - Cadastro dos ferramenteiros.
 *
 * Migração do ferramenteiros.html do hub: lista com contagem de
 * empréstimos entregues, modal novo/editar com pesquisa de colaborador
 * por nome ou código (o código auto-preenche) e desactivar. Duplicado
 * recusa-se no servidor; nome desactivado volta a activar-se sem
 * duplicar pessoa.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { FerramenteirosClient } from "./ferramenteiros-client";

export const metadata = { title: "Ferramenteiros | Ferramentaria | Portal Danmo" };

export default async function PaginaFerramenteiros() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferramentaria.ferramenteiros", "ver")) {
    return <SemAcesso pagina="ferramentaria.ferramenteiros" />;
  }

  return <FerramenteirosClient />;
}
