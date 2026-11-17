/**
 * /escalas/configuracoes - configuração do módulo Escalas.
 *
 * A peça central é a IMPORTAÇÃO do Excel: o navegador lê o
 * ESCALA MENSAL com o parser da lib (sem subir o ficheiro para
 * lado nenhum), mostra o resumo e o que é estranho, e manda os dados
 * para a base mês a mês. Também mostra os feriados (lidos do Plano de
 * Férias) e a composição dos grupos de turno.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { ConfiguracoesClient } from "./configuracoes-client";

export const metadata = { title: "Escalas - Configurações | Portal Danmo" };

export default async function PaginaEscalasConfiguracoes() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "escalas.configuracoes", "ver")) {
    return <SemAcesso pagina="escalas.configuracoes" />;
  }
  return <ConfiguracoesClient podeMexer={pode(sessao, "escalas.configuracoes", "mexer")} />;
}
