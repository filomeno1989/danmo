/**
 * /hst/acidentes - Acidentes e Incidentes (Portal HST).
 *
 * Migração do acidentes.html do hub com as correcções de fundo:
 * - o número DAN-HST-AAAA-NNN nasce no SERVIDOR (o hub calculava no
 *   navegador);
 * - a INVESTIGAÇÃO É EDITÁVEL: o hub prometia "preencher após
 *   investigação" e não tinha edição nenhuma, o status ficava
 *   "Em Investigação" para sempre (as 4 linhas da base provam);
 * - apagar existe (com permissão de apagar): o hub só tinha a limpeza
 *   nuclear das 6 tabelas, um registo errado ficava para sempre;
 * - acções correctivas com mudança de status no ecrã e prazo atrasado
 *   medido pelo juiz partilhado.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { AcidentesClient } from "./acidentes-client";

export const metadata = { title: "Acidentes | Portal HST | Portal Danmo" };

export default async function PaginaAcidentesHst() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "hst.acidentes", "ver")) return <SemAcesso pagina="hst.acidentes" />;

  return <AcidentesClient podeApagar={pode(sessao, "hst.acidentes", "apagar")} />;
}
