/**
 * /escalas - a escala mensal no portal (Admin. Oficinal > Escalas).
 *
 * A grelha que vivia no Excel: colaboradores x dias com os códigos da
 * legenda. Tudo gravado em esc_dias; a semana e os papéis leem daqui.
 * Ferramentas nesta ordem (a ordem importa):
 * 1. Férias do plano: marca LD nas células vazias com ferias_plano;
 * 2. Gerar ciclo de turnos: o padrão 07/19 07/19 19/07 19/07 + 4 folgas
 *    para os grupos A-D (quem tem LD no mês fica fora, com aviso);
 * 3. Feriados: FRD nas células vazias dos feriados;
 * 4. Norm. nas vazias: enche o resto do mês (o estado de repouso).
 * Depois ajustes à mão clicando nas células (código, intervalo, limpar).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { MensalClient } from "./mensal-client";

export const metadata = { title: "Escalas - Mensal | Portal Danmo" };

export default async function PaginaEscalasMensal({
  searchParams
}: {
  searchParams: Promise<{ ano?: string; mes?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "escalas.mensal", "ver")) {
    return <SemAcesso pagina="escalas.mensal" />;
  }
  const { ano, mes } = await searchParams;
  const anoLimpo = /^\d{4}$/.test(ano || "") ? Number(ano) : null;
  const mesLimpo = /^\d{1,2}$/.test(mes || "") && Number(mes) >= 1 && Number(mes) <= 12 ? Number(mes) : null;
  return <MensalClient anoInicial={anoLimpo} mesInicial={mesLimpo} />;
}
