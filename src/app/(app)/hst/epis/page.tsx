/**
 * /hst/epis - Equipamentos de Protecção Individual (Portal HST).
 *
 * Migração do epis.html do hub com as correcções de fundo:
 * - a ENTREGA BAIXA O STOCK no servidor (o hub gravava a entrega e o
 *   stock ficava intocado para sempre) e recusa stock insuficiente;
 * - o EPI ganha EDIÇÃO (o hub só criava: um nome mal escrito ficava
 *   errado para sempre);
 * - o nome do EPI e do colaborador vêm da base, nunca do navegador;
 * - apagar entrega REPÕE o stock (engano devolve material ao catálogo).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { EpisClient } from "./epis-client";

export const metadata = { title: "EPIs | Portal HST | Portal Danmo" };

export default async function PaginaEpisHst() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "hst.epis", "ver")) return <SemAcesso pagina="hst.epis" />;

  return <EpisClient podeApagar={pode(sessao, "hst.epis", "apagar")} />;
}
