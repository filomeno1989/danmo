/**
 * /hst/tensao - Medições de Tensão Arterial (Portal HST).
 *
 * Migração do tensao.html do hub: cartões por colaborador com a última
 * medição e a classificação RECALCULADA pela cascata correcta (as
 * classificações gravadas pelo hub tinham graus trocados: 150/70 ficava
 * "Limítrofe"; o ecrã mostra sempre o grau certo a partir do valor).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { TensaoClient } from "./tensao-client";

export const metadata = { title: "Tensão Arterial | Portal HST | Portal Danmo" };

export default async function PaginaTensaoHst() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "hst.tensao", "ver")) return <SemAcesso pagina="hst.tensao" />;

  return <TensaoClient />;
}
