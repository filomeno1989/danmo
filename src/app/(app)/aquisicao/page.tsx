/**
 * /aquisicao - Painel dos Pedidos de Aquisição (Admin. Oficinal).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { AquisicaoClient } from "./aquisicao-client";

export const metadata = { title: "Pedidos de Aquisição | Portal Danmo" };

export default async function PaginaAquisicao() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "aquisicao", "ver")) return <SemAcesso pagina="aquisicao" />;

  return <AquisicaoClient />;
}
