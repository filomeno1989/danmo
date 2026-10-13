/**
 * Oficina - Relatórios.
 *
 * Servidor: sessão + permissão "ver" (oficina).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { RelatoriosClient } from "./relatorios-client";

export const metadata = { title: "Oficina - Relatórios | Portal Danmo" };

export default async function PaginaRelatorios() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina", "ver")) redirect("/");

  return (
    <RelatoriosClient
      nomeUtilizador={sessao.utilizador.nome}
      podeEditar={pode(sessao, "oficina", "editar")}
    />
  );
}
