/**
 * /aquisicao/historico - Histórico de Pedidos (lista).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { HistoricoClient } from "./historico-client";

export const metadata = { title: "Histórico | Aquisição | Portal Danmo" };

export default async function PaginaHistoricoAquisicao() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "aquisicao.historico", "ver")) return <SemAcesso pagina="aquisicao.historico" />;

  return <HistoricoClient podeApagar={pode(sessao, "aquisicao.historico", "apagar")} />;
}
