/**
 * /hst/configuracoes - Configuração do Portal HST.
 *
 * Migração do config.html do hub com melhorias: contagens das 6 tabelas
 * (vindas do servidor, com as linhas reais), próxima numeração calculada
 * pela MESMA regra do servidor, backup JSON completo e a limpeza total
 * com dupla confirmação e um delFiltro ÚNICO por tabela (o hub apagava
 * linha a linha: N pedidos e uma janela de falha em cada). O formulário
 * de empresa que gravava em localStorage e NENHUM impresso lia sai fora:
 * os papéis usam a identidade do portal, como os outros módulos.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { ConfiguracoesClient } from "./configuracoes-client";

export const metadata = { title: "Configuração | Portal HST | Portal Danmo" };

export default async function PaginaConfiguracoesHst() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "hst.configuracoes", "ver")) return <SemAcesso pagina="hst.configuracoes" />;

  return <ConfiguracoesClient podeApagar={pode(sessao, "hst.configuracoes", "apagar")} />;
}
