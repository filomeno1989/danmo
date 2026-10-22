/**
 * Aniversários & Cartazes (RH) - O mês inteiro numa página, com o
 * estudio de cartazes para os grupos do WhatsApp.
 *
 * Servidor: sessao + permissao "ver" na pagina rh.aniversarios (nova
 * na matriz: nasce bloqueada para todos menos a administracao). Os
 * dados entram pela API propria (menos colunas que a lista do Quadro),
 * que volta a verificar a permissao no servidor.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { dataHojeISO } from "@/lib/rh";
import { SemAcesso } from "@/components/sem-acesso";
import { AniversariosClient } from "./aniversarios-client";

export const metadata = { title: "Aniversários & Cartazes | Portal Danmo" };

export default async function PaginaAniversarios() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "rh.aniversarios", "ver")) return <SemAcesso pagina="rh.aniversarios" />;

  return <AniversariosClient hoje={dataHojeISO()} />;
}
