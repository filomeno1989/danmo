/**
 * Oficina - Visão Geral (o dashboard da oficina).
 *
 * Servidor: confirma sessão e permissão "ver" no módulo oficina antes
 * de desenhar a página. O conteúdo é do cliente (dados ao vivo).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { PainelOficina } from "./painel-client";

export const metadata = { title: "Oficina - Visão Geral | Portal Danmo" };

export default async function PaginaOficina() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina", "ver")) redirect("/");

  return (
    <PainelOficina
      nivel={sessao.utilizador.nivel}
      podeCriar={pode(sessao, "oficina", "criar")}
      podeApagar={pode(sessao, "oficina", "apagar")}
    />
  );
}
