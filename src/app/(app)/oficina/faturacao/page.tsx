/**
 * Oficina - Faturação CdM (obras fechadas que vão a facturação).
 *
 * Servidor: sessão + permissão "ver" (oficina).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { FaturacaoClient } from "./faturacao-client";

export const metadata = { title: "Oficina - Faturação CdM | Portal Danmo" };

export default async function PaginaFaturacao() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina", "ver")) redirect("/");

  return (
    <FaturacaoClient
      nomeUtilizador={sessao.utilizador.nome}
      podeEditar={pode(sessao, "oficina", "editar")}
      podeApagar={pode(sessao, "oficina", "apagar")}
    />
  );
}
