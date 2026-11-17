/**
 * /escalas/folgas - folgas guardadas que a gente acumula.
 *
 * Regista folgas ganhas (aceita meios dias), acompanha o saldo por
 * pessoa e marca o gozo num dia (pode já apontar a Folga na escala).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { FolgasClient } from "./folgas-client";

export const metadata = { title: "Escalas - Folgas Guardadas | Portal Danmo" };

export default async function PaginaEscalasFolgas() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "escalas.folgas", "ver")) {
    return <SemAcesso pagina="escalas.folgas" />;
  }
  return <FolgasClient podeMexer={pode(sessao, "escalas.folgas", "mexer")} podeApagar={pode(sessao, "escalas.folgas", "apagar")} />;
}
