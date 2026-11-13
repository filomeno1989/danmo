/**
 * /imprimir/hst/lista?tipo=acidentes|epis|tensao&de=AAAA-MM-DD&ate=...
 *
 * Wrapper de SERVIDOR (sessão + permissão) para as 3 listagens do hub
 * (acidentes, entregas de EPIs, tensão arterial) num único papel A4.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { ListaImprimir } from "./lista-imprimir";

export const metadata = { title: "Listagem HST" };

const TIPOS_VALIDOS = ["acidentes", "epis", "tensao"];

export default async function PaginaImprimirLista({
  searchParams
}: {
  searchParams: Promise<{ tipo?: string; de?: string; ate?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "hst.relatorios", "ver") && !pode(sessao, "hst", "ver")) redirect("/");

  const { tipo = "", de = "", ate = "" } = await searchParams;
  if (!TIPOS_VALIDOS.includes(tipo)) redirect("/hst/relatorios");

  return <ListaImprimir tipo={tipo} de={de} ate={ate} />;
}
