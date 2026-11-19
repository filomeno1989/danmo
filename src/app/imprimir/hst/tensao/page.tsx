/**
 * /imprimir/hst/tensao?colab=NOME&de=AAAA-MM-DD&ate=AAAA-MM-DD&campanha=ID
 *
 * Papel A4 do Controlo de Tensão Arterial, para enviar ao posto de
 * saúde. Sem colab nem campanha = relatório COLETIVO (todos os
 * colaboradores do período, resumo por pessoa + todas as medições); com
 * colab = relatório INDIVIDUAL (ficha completa da pessoa no período);
 * com campanha = relatório DA CAMPANHA numerada (só o pessoal dela, no
 * período dela, arquivada ou aberta, com o resumo por pessoa e a
 * medicação em curso). Wrapper de SERVIDOR (sessão + permissão), igual
 * aos outros papéis.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { TensaoImprimir } from "./tensao-imprimir";

export const metadata = { title: "Relatório de Tensão Arterial" };

export default async function PaginaImprimirTensao({
  searchParams
}: {
  searchParams: Promise<{ colab?: string; de?: string; ate?: string; campanha?: string }>;
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

  const { colab, de, ate, campanha } = await searchParams;
  const deLimpa = /^\d{4}-\d{2}-\d{2}$/.test(de || "") ? de! : "";
  const ateLimpa = /^\d{4}-\d{2}-\d{2}$/.test(ate || "") ? ate! : "";
  // O id da campanha só passa se parecer um uuid (o PostgREST devolve
  // erro de sintaxe com outro texto no filtro id=eq.X).
  const campanhaLimpa = /^[0-9a-fA-F-]{8,64}$/.test(campanha || "") ? campanha!.trim() : "";
  return (
    <TensaoImprimir
      colab={(colab || "").trim()}
      de={deLimpa}
      ate={ateLimpa}
      campanha={campanhaLimpa}
    />
  );
}
