/**
 * Disponibilidade - Resumo Semanal da Direcção.
 *
 * Servidor: sessão + permissão "ver" no módulo disponibilidade.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { SemanaClient } from "./semana-client";

export const metadata = { title: "Disponibilidade - Resumo Semanal | Portal Danmo" };

export default async function PaginaSemana() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "disponibilidade.semana", "ver")) return <SemAcesso pagina="disponibilidade.semana" />;

  return <SemanaClient podeEditar={pode(sessao, "disponibilidade.semana", "editar")} />;
}
