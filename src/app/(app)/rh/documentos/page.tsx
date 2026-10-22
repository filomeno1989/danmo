/**
 * Documentos (RH) - O arquivo central de TODOS os anexos.
 *
 * Servidor: sessao + permissao "ver" na pagina rh.documentos (nova na
 * matriz: nasce bloqueada para todos menos a administracao). Os dados
 * entram pela API (modo=tudo: metadados dos anexos com o nome de quem
 * os possui, SEM os ficheiros, que pesam), que volta a verificar a
 * permissao no servidor. Os ficheiros abem/descarregam por clique na
 * rota do arquivo.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { dataHojeISO } from "@/lib/rh";
import { SemAcesso } from "@/components/sem-acesso";
import { DocumentosClient } from "./documentos-client";

export const metadata = { title: "Documentos | Portal Danmo" };

export default async function PaginaDocumentos() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "rh.documentos", "ver")) return <SemAcesso pagina="rh.documentos" />;

  return <DocumentosClient hoje={dataHojeISO()} />;
}
