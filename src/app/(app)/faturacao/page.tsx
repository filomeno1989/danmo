/**
 * /faturacao - Painel da Faturação da Administração (servidor).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { FaturacaoClient } from "./faturacao-client";

export const metadata = { title: "Faturação | Portal Danmo" };

export default async function PaginaFaturacaoAdmin() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "faturacao", "ver")) return <SemAcesso pagina="faturacao" />;

  return <FaturacaoClient podeApagar={pode(sessao, "faturacao.editor", "apagar")} />;
}
