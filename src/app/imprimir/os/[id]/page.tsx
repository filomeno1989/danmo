/**
 * /imprimir/os/[id] - Folha de impressão da Ordem de Reparação (A4).
 *
 * Fora do shell do portal (sem sidebar/topbar): folha limpa com o
 * cabeçalho da empresa, identificação da obra, avaria, mão de obra,
 * peças e histórico de estados. Botão de impressão escondido no papel.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { OsImprimir } from "./os-imprimir";

export const metadata = { title: "Ordem de Reparação | Portal Danmo" };

export default async function PaginaImprimirOs({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina", "ver")) redirect("/");

  const { id } = await params;
  return <OsImprimir osId={Number(id) || 0} />;
}
