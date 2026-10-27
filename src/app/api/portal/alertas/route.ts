/**
 * /api/portal/alertas - O sino do topo com ALERTAS REAIS do portal.
 *
 * O sino antigo mostrava três novidades penduradas no código (da Fase 1)
 * e por isso "não dava informação nenhuma". Este feed junta o que é vivo
 * hoje, cada bloco só para quem TEM PERMISSÃO de ver a página em causa:
 *
 * - Quadro de Pessoal: aniversariantes de HOJE e documentos a vencer
 *   (B.I. / carta de condução: vencidos e urgentes, motor do RH);
 * - Plano de Férias: quem está de férias HOJE e a folha do mês à espera
 *   de envio ao RH (dentro do prazo configurado ou já atrasada).
 *
 * Falha macio: qualquer erro numa fonte nunca parte o feed inteiro.
 */

import { NextResponse } from "next/server";
import { obterSessao, pode, podeVerAlgum } from "@/lib/auth";
import { queryTudo, chavesConfiguradas } from "@/lib/supabase";
import { avisosDoQuadro } from "@/lib/avisos-server";
import { dataHojeISO } from "@/lib/rh";
import {
  diasAtePrazoEnvio,
  FILTRO_EMPRESA_FERIAS,
  nomeMes,
  type ConfigFerias,
  type LinhaPlano
} from "@/lib/ferias";

export type AlertaPortal = {
  id: string;
  tipo: "documento" | "aniversario" | "ferias";
  titulo: string;
  texto: string;
  href: string;
  grave: boolean;
};

export async function GET() {
  const sessao = await obterSessao();
  if (!sessao) {
    return NextResponse.json({ ok: false, erro: "Sessão expirada." }, { status: 401 });
  }

  const alertas: AlertaPortal[] = [];
  const hoje = dataHojeISO();

  /* --- Quadro de Pessoal (só para quem o pode ver) --- */
  const podeQuadro = pode(sessao, "rh.quadro", "ver");
  if (podeQuadro && chavesConfiguradas()) {
    try {
      const avisos = await avisosDoQuadro();
      for (const a of avisos.aniversariantes.filter((x) => x.hoje)) {
        alertas.push({
          id: `aniv-${a.id}`,
          tipo: "aniversario",
          titulo: `${a.nome} faz anos hoje`,
          texto: `Faz ${a.idadeFaz} anos. Os parabéns estão a um clique.`,
          href: "/rh/aniversarios",
          grave: false
        });
      }
      const docs = avisos.alertas
        .filter((d) => d.situacao !== "proximo")
        .sort((a, b) => a.dias - b.dias)
        .slice(0, 8);
      for (const d of docs) {
        const venceu = d.dias < 0;
        alertas.push({
          id: `doc-${d.colaborador_id}-${d.documento}`,
          tipo: "documento",
          titulo: `${d.nome}: ${d.documento} ${venceu ? "vencido" : "a vencer"}`,
          texto: venceu
            ? `Venceu há ${Math.abs(d.dias)} dia(s) (${d.validade}).`
            : `Vence em ${d.dias} dia(s) (${d.validade}).`,
          href: "/rh/documentos",
          grave: venceu
        });
      }
    } catch {
      /* sem avisos do quadro hoje: o sino continua com as outras fontes */
    }
  }

  /* --- Plano de Férias (só para quem o pode ver) --- */
  const podeFerias = podeVerAlgum(sessao, [
    "ferias.plano",
    "ferias.mes",
    "ferias.alteracoes"
  ]);
  if (podeFerias && chavesConfiguradas()) {
    try {
      /* Âmbito: só férias da gente da DANMO PORTO (quem se gere). */
      const idsPorto = new Set(
        (
          await queryTudo<{ id: number }>(
            "collaborators",
            `select=id&${FILTRO_EMPRESA_FERIAS}&active=neq.false`
          )
        ).map((c) => c.id)
      );
      const emCurso = (
        await queryTudo<
          Pick<LinhaPlano, "id" | "data_inicio" | "data_fim" | "collaborator_id">
        >(
          "ferias_plano",
          `select=id,data_inicio,data_fim,collaborator_id&data_inicio=lte.${hoje}&data_fim=gte.${hoje}`
        )
      ).filter((l) => idsPorto.has(l.collaborator_id));
      if (emCurso.length) {
        const ids = [...new Set(emCurso.map((l) => l.collaborator_id))]
          .slice(0, 10)
          .join(",");
        const cols = await queryTudo<{ id: number; name: string }>(
          "collaborators",
          `select=id,name&${FILTRO_EMPRESA_FERIAS}&id=in.(${ids})`
        );
        const nomes = emCurso
          .map((l) => cols.find((c) => c.id === l.collaborator_id)?.name || "")
          .filter(Boolean)
          .slice(0, 5);
        alertas.push({
          id: "ferias-curso",
          tipo: "ferias",
          titulo: `De férias hoje: ${nomes.length}`,
          texto: nomes.length
            ? `${nomes.join(", ")}${emCurso.length > nomes.length ? " e mais" : ""} (até ${emCurso[0].data_fim}).`
            : "Há colegas de férias hoje.",
          href: "/ferias/mes",
          grave: false
        });
      }

      const mesActual = Number(hoje.slice(5, 7));
      const config = (
        await queryTudo<ConfigFerias>("ferias_config", "select=*&id=eq.1")
      )[0];
      if (config) {
        const faltam = diasAtePrazoEnvio(hoje, mesActual, config.dias_antes_envio_rh);
        if (faltam <= config.dias_antes_envio_rh) {
          const marcados = (
            await queryTudo<
              Pick<LinhaPlano, "id" | "collaborator_id" | "enviado_rh_em">
            >(
              "ferias_plano",
              `select=id,collaborator_id,enviado_rh_em&ano=eq.${hoje.slice(0, 4)}&mes_previsto=eq.${mesActual}`
            )
          ).filter((l) => idsPorto.has(l.collaborator_id));
          const porEnviar = marcados.filter((l) => !l.enviado_rh_em).length;
          if (porEnviar > 0) {
            alertas.push({
              id: "ferias-prazo",
              tipo: "ferias",
              titulo: `Folha de ${nomeMes(mesActual)} ainda não enviada ao RH`,
              texto:
                faltam >= 0
                  ? `${porEnviar} colaborador(es) por enviar; faltam ${faltam} dia(s) para o prazo.`
                  : `${porEnviar} colaborador(es) por enviar; o prazo já passou (${Math.abs(faltam)} dia(s)).`,
              href: "/ferias/mes",
              grave: faltam < 0
            });
          }
        }
      }
    } catch {
      /* férias fora do ar não parte o resto do sino */
    }
  }

  return NextResponse.json({ ok: true, alertas });
}
