/**
 * /imprimir/hst/acidente?id=NN - Relatório de Investigação de Acidente (A4).
 *
 * Wrapper de SERVIDOR: sem sessão nem permissão, nem chega a ver o
 * papel. O conteúdo é o cliente AcidenteImprimir, que busca os dados à
 * API (mesma receita do papel da Aquisição e da Faturação) e desenha o
 * DAN_QSS_FR_018_REV01 fiel ao hub.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { AcidenteImprimir } from "./acidente-imprimir";

export const metadata = { title: "Relatório de Investigação | Portal HST" };

export default async function PaginaImprimirAcidente({
  searchParams
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  const verAlgum = pode(sessao, "hst.acidentes", "ver") || pode(sessao, "hst.relatorios", "ver");
  if (!verAlgum) redirect("/");

  const { id = "" } = await searchParams;
  if (!id) redirect("/hst/acidentes");

  return <AcidenteImprimir id={id} />;
}
