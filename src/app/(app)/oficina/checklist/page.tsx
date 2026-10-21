/**
 * Oficina - Checklist: gestão dos templates.
 *
 * Servidor: sessão + permissão "ver" (oficina).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { GestaoChecklist } from "./gestao-client";

export const metadata = { title: "Checklist - Gestão | Portal Danmo" };

export default async function PaginaChecklistGestao() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina.checklist", "ver")) return <SemAcesso pagina="oficina.checklist" />;

  return (
    <GestaoChecklist
      podeCriar={pode(sessao, "oficina.checklist", "criar")}
      podeEditar={pode(sessao, "oficina.checklist", "editar")}
      podeApagar={pode(sessao, "oficina.checklist", "apagar")}
    />
  );
}
