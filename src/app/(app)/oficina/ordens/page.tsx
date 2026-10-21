/**
 * Oficina - Ordens de Serviço.
 *
 * Servidor: exige sessão e permissão "ver" (oficina). As permissões de
 * criar/apagar decidem os botões que chegam ao navegador; o servidor
 * volta a verificar tudo na API.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { OrdensClient } from "./ordens-client";

export const metadata = { title: "Ordens de Serviço | Portal Danmo" };

export default async function PaginaOrdens() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "oficina.ordens", "ver")) return <SemAcesso pagina="oficina.ordens" />;

  return (
    <OrdensClient
      podeCriar={pode(sessao, "oficina.ordens", "criar")}
      podeApagar={pode(sessao, "oficina.ordens", "apagar")}
    />
  );
}
