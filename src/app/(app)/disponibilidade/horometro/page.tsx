/**
 * Disponibilidade - Horómetro (a folha HOURMETER CONTROL sem papel).
 *
 * Servidor: sessão + permissão "ver" no módulo disponibilidade.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { HorometroClient } from "./horometro-client";

export const metadata = { title: "Disponibilidade - Horómetro | Portal Danmo" };

export default async function PaginaHorometro() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "disponibilidade", "ver")) redirect("/");

  return (
    <HorometroClient
      podeEditar={pode(sessao, "disponibilidade", "editar")}
      nomeUtilizador={sessao.utilizador.nome}
    />
  );
}
