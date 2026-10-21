/**
 * Disponibilidade de Equipamentos - Painel principal (Fase 4).
 *
 * Servidor: sessão + permissão "ver" no módulo disponibilidade.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { PainelDisponibilidade } from "./painel-client";

export const metadata = { title: "Disponibilidade | Portal Danmo" };

export default async function PaginaDisponibilidade() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "disponibilidade", "ver")) return <SemAcesso pagina="disponibilidade" />;

  return <PainelDisponibilidade />;
}
