/**
 * /imprimir/ferramentaria/relatorio?de=AAAA-MM-DD&ate=AAAA-MM-DD
 *
 * Papel A4 do Relatório de Movimentação da Ferramentaria, para arquivar
 * e levar à direcção. As 6 secções do relatório no ecrã, no papel:
 * indicadores do período, ferramentas mais emprestadas, colaboradores
 * com mais movimentações, mapa de danos, ferramentas na rua agora e
 * estado do inventário, com assinaturas O Ferramenteiro Chefe e Visto
 * Direcção. Wrapper de SERVIDOR (sessão + permissão), igual aos outros.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { RelatorioImprimir } from "./relatorio-imprimir";

export const metadata = { title: "Relatório da Ferramentaria" };

export default async function PaginaImprimirRelatorio({
  searchParams
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (
    !pode(sessao, "ferramentaria.relatorios", "ver") &&
    !pode(sessao, "ferramentaria", "ver")
  ) {
    redirect("/");
  }

  const { de, ate } = await searchParams;
  const deLimpa = /^\d{4}-\d{2}-\d{2}$/.test(de || "") ? de! : "";
  const ateLimpa = /^\d{4}-\d{2}-\d{2}$/.test(ate || "") ? ate! : "";
  return <RelatorioImprimir de={deLimpa} ate={ateLimpa} />;
}
