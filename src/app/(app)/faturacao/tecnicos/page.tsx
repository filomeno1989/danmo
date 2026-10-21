/**
 * /faturacao/tecnicos - Técnicos das linhas de mão-de-obra (servidor).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { TecnicosClient } from "./tecnicos-client";

export const metadata = { title: "Faturação - Técnicos | Portal Danmo" };

export default async function PaginaTecnicosFat() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "faturacao.tecnicos", "ver")) return <SemAcesso pagina="faturacao.tecnicos" />;

  return (
    <TecnicosClient
      podeEditar={pode(sessao, "faturacao.tecnicos", "mexer")}
      podeApagar={pode(sessao, "faturacao.tecnicos", "apagar")}
    />
  );
}
