/**
 * Quadro de Pessoal (RH) - Fichas de Colaboradores.
 *
 * Servidor: sessao + permissao "ver" na pagina rh.quadro (matriz por
 * utilizador). Os dados entram pela API, que volta a verificar.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { QuadroClient } from "./quadro-client";

export const metadata = { title: "Quadro de Pessoal | Portal Danmo" };

export default async function PaginaQuadroPessoal() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "rh.quadro", "ver")) return <SemAcesso pagina="rh.quadro" />;

  return (
    <QuadroClient
      podeMexer={pode(sessao, "rh.quadro", "mexer")}
      podeApagar={pode(sessao, "rh.quadro", "apagar")}
    />
  );
}
