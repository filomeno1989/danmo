/**
 * /aquisicao/novo - Editor de Pedido de Aquisição (novo e editar).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { EditorAquisicao } from "./editor-client";

export const metadata = { title: "Novo Pedido | Aquisição | Portal Danmo" };

export default async function PaginaNovoPedido({
  searchParams
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "aquisicao.novo", "ver")) return <SemAcesso pagina="aquisicao.novo" />;

  const { id = "" } = await searchParams;

  return <EditorAquisicao idEdicao={/^[a-zA-Z0-9_-]{1,40}$/.test(id) ? id : ""} />;
}
