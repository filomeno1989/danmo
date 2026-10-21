/**
 * /faturacao/clientes - Cadastro de clientes (servidor).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { ClientesClient } from "./clientes-client";

export const metadata = { title: "Faturação - Clientes | Portal Danmo" };

export default async function PaginaClientesFat() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "faturacao.clientes", "ver")) return <SemAcesso pagina="faturacao.clientes" />;

  return (
    <ClientesClient
      podeEditar={pode(sessao, "faturacao.clientes", "mexer")}
      podeApagar={pode(sessao, "faturacao.clientes", "apagar")}
    />
  );
}
