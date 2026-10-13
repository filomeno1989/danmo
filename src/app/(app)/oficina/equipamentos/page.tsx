/**
 * Oficina - Equipamentos (máquinas).
 *
 * Servidor: sessão + permissão "ver" (oficina).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { EquipamentosClient } from "./equipamentos-client";

export const metadata = { title: "Equipamentos | Portal Danmo" };

export default async function PaginaEquipamentos() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina", "ver")) redirect("/");

  return (
    <EquipamentosClient
      podeCriar={pode(sessao, "oficina", "criar")}
      podeEditar={pode(sessao, "oficina", "editar")}
    />
  );
}
