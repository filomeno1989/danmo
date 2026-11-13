/**
 * /hst/tensao/pessoa?colab=Nome - Histórico de tensão de um colaborador.
 *
 * Migração do tensao_colaborador.html do hub: resumo (total, última,
 * medições com HTA), gráfico de barras das últimas 20 (sistólica e
 * diastólica, ordem cronológica), tabela completa e nova medição para
 * esta pessoa. Rota por query (sem pasta dinâmica), como a Afixação
 * das Férias.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { PessoaClient } from "./pessoa-client";

export const metadata = { title: "Histórico de Tensão | Portal HST | Portal Danmo" };

export default async function PaginaTensaoPessoa({
  searchParams
}: {
  searchParams: Promise<{ colab?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "hst.tensao", "ver")) return <SemAcesso pagina="hst.tensao" />;

  const { colab = "" } = await searchParams;
  if (!colab.trim()) redirect("/hst/tensao");

  return <PessoaClient colab={colab} podeApagar={pode(sessao, "hst.tensao", "apagar")} />;
}
