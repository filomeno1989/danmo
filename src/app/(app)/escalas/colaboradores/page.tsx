/**
 * /escalas/colaboradores - o registo da gente da escala.
 *
 * Nome, código, contacto (o que o cliente usa para ligar), categoria,
 * área da escala, grupo de turno e ordem de afixação. Quem sai da
 * escala fica desactivado, não apagado.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { ColaboradoresClient } from "./colaboradores-client";

export const metadata = { title: "Escalas - Colaboradores | Portal Danmo" };

export default async function PaginaEscalasColaboradores() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "escalas.colaboradores", "ver")) {
    return <SemAcesso pagina="escalas.colaboradores" />;
  }
  return (
    <ColaboradoresClient
      podeMexer={pode(sessao, "escalas.colaboradores", "mexer")}
      podeApagar={pode(sessao, "escalas.colaboradores", "apagar")}
    />
  );
}
