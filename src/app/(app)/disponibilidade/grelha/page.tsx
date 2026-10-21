/**
 * Disponibilidade - Grelha Diária (a folha DAN_DTEC_FR_005 sem papel).
 *
 * Servidor: sessão + permissão "ver" no módulo disponibilidade.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { GrelhaClient } from "./grelha-client";

export const metadata = { title: "Disponibilidade - Grelha Diária | Portal Danmo" };

export default async function PaginaGrelha() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "disponibilidade.grelha", "ver")) return <SemAcesso pagina="disponibilidade.grelha" />;

  return (
    <GrelhaClient
      podeEditar={pode(sessao, "disponibilidade.grelha", "editar")}
      podeApagar={pode(sessao, "disponibilidade.grelha", "apagar")}
    />
  );
}
