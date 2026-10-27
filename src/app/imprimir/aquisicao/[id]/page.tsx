/**
 * /imprimir/aquisicao/[id] - Papel A5 paisagem do Pedido de Aquisição.
 *
 * Fora do shell do portal, fiel ao imprimir.html do hub antigo
 * (cabeçalho DANMO/MMM fixo, caixa de referência verde, tabela de
 * materiais, assinaturas e rodapé com o código do modelo
 * DAN_ADO_FR_010_REV01_16.08.2021), agora lido pelo SERVIDOR: quem abre
 * por URL sem permissão nem chega a ver os dados.
 *
 * Fidelidade documental: este impresso alimenta o processo de compra
 * assinado em papel; as melhorias ficam por baixo da pele (margens
 * dinâmicas medidas no navegador, color-adjust no cabeçalho verde-escuro
 * para o texto branco nunca imprimir invisível sem Background graphics).
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { PedidoImprimir } from "../pedido-imprimir";

export const metadata = { title: "Pedido de Aquisição | Portal Danmo" };

export default async function PaginaImprimirAquisicao({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  const autorizadoVer =
    pode(sessao, "aquisicao", "ver") ||
    pode(sessao, "aquisicao.novo", "ver") ||
    pode(sessao, "aquisicao.historico", "ver") ||
    pode(sessao, "aquisicao.configuracoes", "ver");
  if (!autorizadoVer) redirect("/");

  const { id } = await params;

  return <PedidoImprimir pedidoId={id} />;
}
