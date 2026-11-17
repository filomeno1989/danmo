/**
 * /imprimir/escalas/mensal?ano=AAAA&mes=MM - papel A4 paisagem da
 * escala mensal, para afixar na vitrine.
 *
 * Wrapper de SERVIDOR (sessão + permissão, igual aos outros papéis);
 * os dados vêm da API /api/escalas/mes pelo componente cliente, por
 * isso o papel usa EXATAMENTE o mesmo juiz que o ecrã e as provas.
 * Ano e mês por query (sem segmentos dinâmicos na rota).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { PapelMensal } from "./papel-mensal";

export const metadata = { title: "Escala Mensal | Portal Danmo" };

export default async function PaginaPapelMensal({
  searchParams
}: {
  searchParams: Promise<{ ano?: string; mes?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  const verAlgum =
    pode(sessao, "escalas.mensal", "ver") ||
    pode(sessao, "escalas.semanal", "ver") ||
    pode(sessao, "escalas.configuracoes", "ver");
  if (!verAlgum) redirect("/");

  const { ano: anoP, mes: mesP } = await searchParams;
  const anoLimpo = /^\d{4}$/.test(anoP || "") ? Number(anoP) : null;
  const mesLimpo = /^\d{1,2}$/.test(mesP || "") && Number(mesP) >= 1 && Number(mesP) <= 12 ? Number(mesP) : null;
  return <PapelMensal ano={anoLimpo} mes={mesLimpo} />;
}
