/**
 * /faturacao/editor - Editor de Cotações e Faturas (servidor).
 *
 * ?id=<id>  : editar um documento existente.
 * ?de=<id>  : gerar Fatura a partir de uma Cotação (decisão do Filomeno:
 *             copia cliente, descrição, linhas e configurações; a nova
 *             fatura ganha a SUA numeração e só fica gravada ao Guardar).
 * sem args  : documento novo.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { SemAcesso } from "@/components/sem-acesso";
import { EditorClient } from "./editor-client";

export const metadata = { title: "Editor de Documento | Faturação | Portal Danmo" };

export default async function PaginaEditorFaturacao({
  searchParams
}: {
  searchParams: Promise<{ id?: string; de?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  if (!pode(sessao, "faturacao.editor", "ver")) return <SemAcesso pagina="faturacao.editor" />;

  const { id = "", de = "" } = await searchParams;

  return (
    <EditorClient
      idEdit={/^[a-zA-Z0-9_-]{1,40}$/.test(id) ? id : ""}
      idFonte={/^[a-zA-Z0-9_-]{1,40}$/.test(de) ? de : ""}
      nomeUtilizador={sessao.utilizador.nome}
      cargoUtilizador={sessao.utilizador.cargo || ""}
    />
  );
}
