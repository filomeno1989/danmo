/**
 * Oficina - Histórico completo de uma máquina.
 *
 * Servidor: sessão + permissão "ver" (oficina).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { MaquinaClient } from "./maquina-client";

export const metadata = { title: "Histórico da Máquina | Portal Danmo" };

export default async function PaginaMaquina({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina", "ver")) redirect("/");

  const { id } = await params;
  const equipId = Number(id);
  if (!equipId) redirect("/oficina/equipamentos");

  return <MaquinaClient equipId={equipId} />;
}
