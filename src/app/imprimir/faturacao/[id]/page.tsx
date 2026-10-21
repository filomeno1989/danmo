/**
 * /imprimir/faturacao/[id] - Papel A4 da Faturação (Cotação ou Fatura)
 * e o Anexo de Material do Cliente (?modo=anexo).
 *
 * Fora do shell do portal: folha limpa no desenho do hub antigo
 * (cabeçalho DANMO/MMM fixo, rodapé com o código do modelo, tabela
 * mágica de margens dinâmicas), agora lido pelo SERVIDOR: quem abre por
 * URL sem permissão nem chega a ver os dados.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { FaturaImprimir } from "../fatura-imprimir";

export const metadata = { title: "Documento | Faturação | Portal Danmo" };

export default async function PaginaImprimirFaturacao({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ modo?: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  const autorizadoVer =
    pode(sessao, "faturacao", "ver") ||
    pode(sessao, "faturacao.editor", "ver") ||
    pode(sessao, "faturacao.relatorios", "ver");
  if (!autorizadoVer) redirect("/");

  const { id } = await params;
  const { modo = "" } = await searchParams;

  return <FaturaImprimir docId={id} anexo={modo === "anexo"} />;
}
