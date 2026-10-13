/**
 * Oficina - Ficha da Obra (detalhe de uma Ordem de Serviço).
 *
 * Servidor: sessão + permissão "ver" (oficina). As permissões de criar,
 * editar e apagar são verificadas de novo em cada acção na API.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { OsClient } from "./os-client";

export const metadata = { title: "Ficha da Obra | Portal Danmo" };

export default async function PaginaObra({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina", "ver")) redirect("/");

  const { id } = await params;
  const osId = Number(id);
  if (!osId) redirect("/oficina/ordens");

  return (
    <OsClient
      osId={osId}
      podeCriar={pode(sessao, "oficina", "criar")}
      podeEditar={pode(sessao, "oficina", "editar")}
      podeApagar={pode(sessao, "oficina", "apagar")}
    />
  );
}
