/**
 * Oficina - Preencher um checklist de manutenção.
 *
 * Servidor: sessão + permissão "ver"; a gravação de respostas exige
 * "editar" (verificado na API).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { PreencherChecklist } from "./preencher-client";

export const metadata = { title: "Checklist de Manutenção | Portal Danmo" };

export default async function PaginaChecklistPreencher({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina.checklist", "ver")) return <SemAcesso pagina="oficina.checklist" />;

  const { id } = await params;
  const ckId = Number(id);
  if (!ckId) redirect("/oficina/ordens");

  return (
    <PreencherChecklist
      checklistId={ckId}
      podeEditar={pode(sessao, "oficina.checklist", "editar")}
    />
  );
}
