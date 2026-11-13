/**
 * /ferramentaria/emprestimos - Registo de empréstimos e devoluções.
 *
 * Migração do emprestimos.html do hub: formulário com autocomplete de
 * ferramenta (código ou nome), colaborador por nome/código (padrão
 * aprovado), lookup de OS que traz o equipamento, prazo nascido amanhã,
 * tabela de empréstimos activos e modais de devolução e de ferramenta
 * indisponível. Tudo o que é regra vive no servidor: disponibilidade
 * revalidada no POST, devolução nas 4 operações do servidor.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { EmprestimosClient } from "./emprestimos-client";

export const metadata = { title: "Empréstimos | Ferramentaria | Portal Danmo" };

export default async function PaginaEmprestimos() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "ferramentaria.emprestimos", "ver")) {
    return <SemAcesso pagina="ferramentaria.emprestimos" />;
  }

  return <EmprestimosClient />;
}
