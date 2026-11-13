/**
 * /imprimir/hst/resumo?ano=AAAA&mes=MM - Resumo Mensal HST (A4).
 *
 * Wrapper de SERVIDOR (sessão + permissão) e o cliente ResumoImprimir,
 * que busca as 4 fontes à API e calcula os indicadores com a lib
 * partilhada (indicadoresResumoMensal) - o mesmo juiz das provas.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { ResumoImprimir } from "./resumo-imprimir";

export const metadata = { title: "Resumo Mensal HST" };

export default async function PaginaImprimirResumo({
  searchParams
}: {
  searchParams: Promise<{ ano?: string; mes?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "hst.relatorios", "ver") && !pode(sessao, "hst", "ver")) redirect("/");

  const { ano: anoP, mes: mesP } = await searchParams;
  const ano = Number(anoP);
  const mes = Number(mesP);
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    redirect("/hst/relatorios");
  }

  return <ResumoImprimir ano={ano} mes={mes} />;
}
