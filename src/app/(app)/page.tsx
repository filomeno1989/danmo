/**
 * Painel Principal (o "Início" dos mockups do Filomeno).
 *
 * Servidor: lê a sessão e passa o nome/cargo ao bloco partilhado
 * (PainelInicio). A saudação usa a hora de Maputo.
 */

import { obterSessao, NIVEL_LABEL } from "@/lib/auth";
import { PainelInicio } from "@/components/painel-inicio";

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

  return (
    <PainelInicio
      nome={nome ? `${cumprimento()}, ${nome}.` : "Bem-vindo ao portal Danmo"}
      quem={quem}
    />
  );
}
