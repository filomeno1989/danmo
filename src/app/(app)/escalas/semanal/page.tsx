/**
 * /escalas/semanal - a semana Sáb a Sex nascida da mensal (1 clique).
 *
 * Nada é reescrito à mão: a vista lê esc_dias da semana e mostra o
 * bloco dos turnos, a grelha com contactos e as contagens. O papel A4
 * (Imprimir) é o que vai para a vitrine.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { SemanalClient } from "./semanal-client";

export const metadata = { title: "Escalas - Semanal | Portal Danmo" };

export default async function PaginaEscalasSemanal({
  searchParams
}: {
  searchParams: Promise<{ inicio?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "escalas.semanal", "ver")) {
    return <SemAcesso pagina="escalas.semanal" />;
  }
  const { inicio } = await searchParams;
  const inicioLimpo = /^\d{4}-\d{2}-\d{2}$/.test(inicio || "") ? inicio! : "";
  return <SemanalClient inicioInicial={inicioLimpo} />;
}
