/**
 * Painel Principal (o "Início" dos mockups do Filomeno).
 *
 * Servidor: lê a sessão e passa o nome/cargo + as permissões da pessoa
 * (matriz por utilizador) ao bloco partilhado (PainelInicio). A saudação
 * usa a hora de Maputo.
 *
 * Para quem vê o Quadro de Pessoal, o home ganha os DOIS avisos vivos:
 * os aniversariantes do mês e os documentos a vencer (B.I. e carta de
 * condução). Os dados vêm directo da base (servidor a servidor) e uma
 * falha aqui NUNCA parte o home: os avisos simplesmente não aparecem.
 */

import { obterSessao, pode, podeVerAlgum, NIVEL_LABEL } from "@/lib/auth";
import { avisosDoQuadro } from "@/lib/avisos-server";
import { PainelInicio } from "@/components/painel-inicio";

const PAGINAS_FATURACAO = [
  "faturacao",
  "faturacao.editor",
  "faturacao.clientes",
  "faturacao.tecnicos",
  "faturacao.tarifas",
  "faturacao.relatorios"
];

/** Cumprimento certo à hora local de Moçambique (UTC+2). */
function cumprimento(): string {
  const agoraUtc = new Date();
  const horaMaputo = (agoraUtc.getUTCHours() + 2) % 24;
  if (horaMaputo < 12) return "Bom dia";
  if (horaMaputo < 19) return "Boa tarde";
  return "Boa noite";
}

export default async function PaginaInicio() {
  const sessao = await obterSessao();
  const nome = sessao?.utilizador.nome || "";
  const nivel = sessao?.utilizador.nivel || "";
  const cargo = sessao?.utilizador.cargo || "";
  const nivelTexto = NIVEL_LABEL[nivel] || nivel;
  const quem = cargo || nivelTexto || "";

  const podeQuadro = pode(sessao, "rh.quadro", "ver");
  const avisos = podeQuadro ? await avisosDoQuadro() : null;

  return (
    <PainelInicio
      nome={nome ? `${cumprimento()}, ${nome}.` : "Bem-vindo ao portal Danmo"}
      quem={quem}
      podeOficina={pode(sessao, "oficina", "ver")}
      podeStock={pode(sessao, "stock", "ver")}
      podeFaturacao={podeVerAlgum(sessao, PAGINAS_FATURACAO)}
      podeQuadro={podeQuadro}
      eAdmin={sessao?.utilizador.nivel === "admin"}
      avisos={avisos}
    />
  );
}
