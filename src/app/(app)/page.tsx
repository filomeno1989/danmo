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
import { chavesConfiguradas, query, queryTudo } from "@/lib/supabase";
import {
  MESES,
  alertasDocumentos,
  aniversariantesDoMes,
  dataHojeISO,
  type AlertaDoc,
  type Aniversariante,
  type Colaborador,
  type ValidadeDoc
} from "@/lib/rh";
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

/** Dados dos avisos do Quadro, a cavalo: falha vira lista vazia. */
async function avisosQuadro(): Promise<{
  aniversariantes: Aniversariante[];
  mesNome: string;
  alertas: AlertaDoc[];
}> {
  const vazio = { aniversariantes: [] as Aniversariante[], mesNome: "", alertas: [] as AlertaDoc[] };
  if (!chavesConfiguradas()) return vazio;
  try {
    const hoje = dataHojeISO();
    // O select completo precisa das colunas novas (SQL fase-rh-documentos).
    // Enquanto o SQL nao for colado no Supabase, repete so com as colunas
    // antigas: os ANIVERSARIANTES ja funcionam, os alertas de documentos
    // entram quando as colunas existirem.
    let cols: Colaborador[];
    try {
      cols = await queryTudo<Colaborador>(
        "collaborators",
        "select=id,name,categoria,empresa,active,data_nascimento,bi_validade,carta_conducao_validade"
      );
    } catch {
      cols = await queryTudo<Colaborador>(
        "collaborators",
        "select=id,name,categoria,empresa,active,data_nascimento"
      );
    }
    let docs: ValidadeDoc[] = [];
    try {
      docs = await query<ValidadeDoc>(
        "rh_colaborador_documentos",
        "select=colaborador_id,tipo,validade&validade=not.is.null"
      );
    } catch {
      docs = [];
    }
    const mes = Number(hoje.slice(5, 7));
    return {
      aniversariantes: aniversariantesDoMes(cols, hoje),
      mesNome: MESES[mes - 1] ? MESES[mes - 1] : "",
      alertas: alertasDocumentos(cols, docs, hoje)
    };
  } catch {
    return vazio;
  }
}

export default async function PaginaInicio() {
  const sessao = await obterSessao();
  const nome = sessao?.utilizador.nome || "";
  const nivel = sessao?.utilizador.nivel || "";
  const cargo = sessao?.utilizador.cargo || "";
  const nivelTexto = NIVEL_LABEL[nivel] || nivel;
  const quem = cargo || nivelTexto || "";

  const podeQuadro = pode(sessao, "rh.quadro", "ver");
  const avisos = podeQuadro ? await avisosQuadro() : null;

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
