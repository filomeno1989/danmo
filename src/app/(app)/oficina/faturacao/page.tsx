/**
 * Oficina - Faturação CdM (obras fechadas que vão a facturação).
 *
 * Servidor: sessão + permissão "ver" (oficina).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { FaturacaoClient } from "./faturacao-client";

export const metadata = { title: "Oficina - Faturação CdM | Portal Danmo" };

export default async function PaginaFaturacao() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina.faturacao", "ver")) return <SemAcesso pagina="oficina.faturacao" />;

  return (
    <FaturacaoClient
      nomeUtilizador={sessao.utilizador.nome}
      podeEditar={pode(sessao, "oficina.faturacao", "editar")}
      podeApagar={pode(sessao, "oficina.faturacao", "apagar")}
    />
  );
}
