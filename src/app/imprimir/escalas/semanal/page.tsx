/**
 * /imprimir/escalas/semanal?inicio=AAAA-MM-DD - papel A4 paisagem da
 * escala semanal, pronta a afixar.
 *
 * Wrapper de SERVIDOR (sessão + permissão); dados pela API
 * /api/escalas/semanal no componente cliente. A semana é Sáb a Sex
 * (mapa antigo) e NADA é reescrito à mão: tudo vem de esc_dias. No
 * topo, o bloco compacto dos turnos dia a dia; depois a grelha
 * completa com contactos, que é o que o cliente usa para ligar.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { PapelSemanal } from "./papel-semanal";

export const metadata = { title: "Escala Semanal | Portal Danmo" };

export default async function PaginaPapelSemanal({
  searchParams
}: {
  searchParams: Promise<{ inicio?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  const verAlgum =
    pode(sessao, "escalas.semanal", "ver") ||
    pode(sessao, "escalas.mensal", "ver") ||
    pode(sessao, "escalas.configuracoes", "ver");
  if (!verAlgum) redirect("/");

  const { inicio } = await searchParams;
  const inicioLimpo = /^\d{4}-\d{2}-\d{2}$/.test(inicio || "") ? inicio! : "";
  return <PapelSemanal inicio={inicioLimpo} />;
}
