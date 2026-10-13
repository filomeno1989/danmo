/**
 * Oficina - Checklist: gestão dos templates.
 *
 * Servidor: sessão + permissão "ver" (oficina).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { GestaoChecklist } from "./gestao-client";

export const metadata = { title: "Checklist - Gestão | Portal Danmo" };

export default async function PaginaChecklistGestao() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina", "ver")) redirect("/");

  return (
    <GestaoChecklist
      podeCriar={pode(sessao, "oficina", "criar")}
      podeEditar={pode(sessao, "oficina", "editar")}
      podeApagar={pode(sessao, "oficina", "apagar")}
    />
  );
}
