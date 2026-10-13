/**
 * /imprimir/checklist/[id] - Folha de impressão do Checklist (A4).
 * Fora do shell do portal: folha limpa com respostas e assinaturas.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { ChecklistImprimir } from "./checklist-imprimir";

export const metadata = { title: "Checklist de Manutenção | Portal Danmo" };

export default async function PaginaImprimirChecklist({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina", "ver")) redirect("/");

  const { id } = await params;
  return <ChecklistImprimir checklistId={Number(id) || 0} />;
}
