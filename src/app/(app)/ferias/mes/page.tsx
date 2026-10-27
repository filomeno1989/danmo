/**
 * /ferias/mes - Folha do Mês: o ciclo do RH central.
 *
 * Um mês de cada vez: copiar o texto do email, marcar como enviado,
 * lançar os dias de direito que o RH devolve e imprimir a folha de
 * afixação. É a única página operacional do ciclo - o hub tinha isto
 * espalhado pelo index, pelo plano e pelo rh-mensal.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { MesClient } from "./mes-client";

export const metadata = { title: "Folha do Mês de Férias | Portal Danmo" };

export default async function PaginaFeriasMes() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferias.mes", "ver")) return <SemAcesso pagina="ferias.mes" />;

  return <MesClient />;
}
