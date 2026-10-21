/**
 * /api/oficina/painel - Dados da Visão Geral da Oficina (dashboard).
 *
 * GET: devolve tudo o que o painel precisa numa só viagem:
 * - categorias, grupos e equipamentos activos;
 * - todas as ordens de serviço;
 * - os registos de entrada na CdM (para o rastreio e as datas);
 * - o estado dos checklists das obras em revisão (pendências).
 *
 * Os agregados (KPIs, frotas, percentagens) são calculados no navegador,
 * como no hub: aqui devolvemos os dados puros já filtrados pelo servidor.
 */

import { NextResponse } from "next/server";
import { query, queryTudo } from "@/lib/supabase";
import { autorizadoOficina, eErro, erroBase } from "@/lib/guarda-api";
import type {
  CategoriaEquip,
  ColaboradorLinha,
  Equipamento,
  GrupoEquip,
  OrdemServico
} from "@/lib/oficina";

export async function GET() {
  const auth = await autorizadoOficina("oficina", "ver");
  if (eErro(auth)) return auth;

  try {
    const [categorias, grupos, equipamentos, ordens, logCdm] = await Promise.all([
      query<CategoriaEquip>("categorias_equipamento", "select=*&ativo=eq.true&order=nome.asc"),
      query<GrupoEquip>("grupos_equipamento", "select=*&ativo=eq.true&order=nome.asc"),
      queryTudo<Equipamento>("equipment", "select=*&active=eq.true"),
      queryTudo<OrdemServico>("ordens_servico", "select=*"),
      queryTudo<{ os_id: number; data_mudanca: string }>(
        "os_status_log",
        "select=os_id,data_mudanca&status_novo=eq.CdM"
      )
    ]);

    // Obras em revisão (na oficina): o checklist de manutenção é delas
    const obrasRevisao = ordens.filter(
      (o) =>
        o.status_atual !== "Fechada" &&
        o.status_atual !== "CdM" &&
        (o.tipo_intervencao || []).includes("Revisão")
    );

    const osIds = obrasRevisao.map((o) => o.id);
    let pendentes: {
      os_id: number;
      checklistId: number | null;
      nome: string;
      feitos: number;
      total: number;
    }[] = [];

    if (osIds.length) {
      const ids = osIds.join(",");
      const checklists = await query<{
        id: number;
        os_id: number;
        template_id: number;
      }>(
        "checklist_preenchidos",
        `select=id,os_id,template_id&os_id=in.(${ids})&substituido=eq.false`
      );
      const tplIds = [...new Set(checklists.map((c) => c.template_id))];
      const templates = tplIds.length
        ? await query<{ id: number; nome: string }>(
            "checklist_templates",
            `select=id,nome&id=in.(${tplIds.join(",")})`
          )
        : [];
      const nomeTpl = new Map(templates.map((t) => [t.id, t.nome]));

      const ckIds = checklists.map((c) => c.id);
      const itens = ckIds.length
        ? await queryTudo<{ checklist_id: number; executado: string | null; estado: string | null }>(
            "checklist_preenchidos_itens",
            `select=checklist_id,executado,estado&checklist_id=in.(${ckIds.join(",")})`
          )
        : [];

      pendentes = obrasRevisao.map((o) => {
        const ck = checklists.find((c) => c.os_id === o.id);
        if (!ck) {
          return { os_id: o.id, checklistId: null, nome: "-", feitos: 0, total: 0 };
        }
        const meus = itens.filter((i) => i.checklist_id === ck.id);
        const feitos = meus.filter((i) => i.executado || i.estado).length;
        return {
          os_id: o.id,
          checklistId: ck.id,
          nome: nomeTpl.get(ck.template_id) || "-",
          feitos,
          total: meus.length
        };
      });
    }

    // Colaboradores activos: só id/nome/código (para modais de responsáveis)
    const colaboradores = await query<ColaboradorLinha>(
      "collaborators",
      "select=id,name,code,setor&active=eq.true&order=name.asc"
    );

    return NextResponse.json({
      ok: true,
      categorias,
      grupos,
      equipamentos,
      ordens,
      logCdm,
      checklistsRevisao: pendentes,
      colaboradores
    });
  } catch (e) {
    return erroBase(e, "painel");
  }
}
