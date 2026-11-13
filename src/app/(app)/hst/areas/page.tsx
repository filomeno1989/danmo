/**
 * /hst/areas - Áreas de Risco (Portal HST).
 *
 * Migração do areas_risco.html do hub: cartões com o nível de risco à
 * esquerda, filtro por nome/nível/estado, criar, editar e
 * desactivar/reactivar. Completa no hub e fica fiel aqui.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { AreasClient } from "./areas-client";

export const metadata = { title: "Áreas de Risco | Portal HST | Portal Danmo" };

export default async function PaginaAreasHst() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "hst.areas", "ver")) return <SemAcesso pagina="hst.areas" />;

  return <AreasClient podeApagar={pode(sessao, "hst.areas", "apagar")} />;
}
