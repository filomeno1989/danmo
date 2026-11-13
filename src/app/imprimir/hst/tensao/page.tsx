/**
 * /imprimir/hst/tensao?colab=NOME&de=AAAA-MM-DD&ate=AAAA-MM-DD
 *
 * Papel A4 do Controlo de Tensão Arterial, para enviar ao posto de
 * saúde. Sem colab = relatório COLETIVO (todos os colaboradores do
 * período, resumo por pessoa + todas as medições); com colab =
 * relatório INDIVIDUAL (ficha completa da pessoa no período).
 * Wrapper de SERVIDOR (sessão + permissão), igual aos outros papéis.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { TensaoImprimir } from "./tensao-imprimir";

export const metadata = { title: "Relatório de Tensão Arterial" };

export default async function PaginaImprimirTensao({
  searchParams
}: {
  searchParams: Promise<{ colab?: string; de?: string; ate?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (
    !pode(sessao, "hst.tensao", "ver") &&
    !pode(sessao, "hst.relatorios", "ver") &&
    !pode(sessao, "hst", "ver")
  ) {
    redirect("/");
  }

  const { colab, de, ate } = await searchParams;
  const deLimpa = /^\d{4}-\d{2}-\d{2}$/.test(de || "") ? de! : "";
  const ateLimpa = /^\d{4}-\d{2}-\d{2}$/.test(ate || "") ? ate! : "";
  return <TensaoImprimir colab={(colab || "").trim()} de={deLimpa} ate={ateLimpa} />;
}
