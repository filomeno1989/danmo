/**
 * /aquisicao/configuracoes - Configurações dos Pedidos de Aquisição.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { ConfiguracoesClient } from "./configuracoes-client";

export const metadata = { title: "Configurações | Aquisição | Portal Danmo" };

export default async function PaginaConfigAquisicao() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "aquisicao.configuracoes", "ver")) return <SemAcesso pagina="aquisicao.configuracoes" />;

  const sessaoMexer = pode(sessao, "aquisicao.configuracoes", "mexer");
  const sessaoApagar = pode(sessao, "aquisicao.configuracoes", "apagar");
  return <ConfiguracoesClient podeMexer={sessaoMexer} podeApagar={sessaoApagar} />;
}
