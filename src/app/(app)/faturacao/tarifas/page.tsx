/**
 * /faturacao/tarifas - Tarifas de mão-de-obra (servidor).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { TarifasClient } from "./tarifas-client";

export const metadata = { title: "Faturação - Tarifas | Portal Danmo" };

export default async function PaginaTarifasFat() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "faturacao.tarifas", "ver")) return <SemAcesso pagina="faturacao.tarifas" />;

  return (
    <TarifasClient
      podeEditar={pode(sessao, "faturacao.tarifas", "mexer")}
      podeApagar={pode(sessao, "faturacao.tarifas", "apagar")}
    />
  );
}
