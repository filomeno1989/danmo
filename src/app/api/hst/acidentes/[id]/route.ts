/**
 * /api/hst/acidentes/[id] - Um acidente (ler, editar/investigar, apagar).
 *
 * PATCH: a INVESTIGAÇÃO EDITÁVEL que o hub nunca teve (prometia
 *        "preencher após investigação" e não havia forma de editar).
 *        Aceita os campos do evento + a análise de causa raiz + o
 *        status. Mudar o colaborador re-resolve o id na base.
 * DELETE: apaga o acidente e as suas acções correctivas num único
 *        delFiltro cada (só com permissão de apagar).
 */

import { NextResponse, NextRequest } from "next/server";
import { delFiltro, query, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  problemaAcidente,
  vestirAcidente,
  type AccaoHST,
  type AcidenteHST,
  type ColaboradorHST,
  type DadosAcidente
} from "@/lib/hst";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await autorizadoEmAlguma(["hst", "hst.acidentes", "hst.relatorios"]);
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const [acidente] = await query<AcidenteHST>(
      "hst_acidentes",
      `select=*&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    if (!acidente) {
      return NextResponse.json({ ok: false, erro: "Acidente não encontrado." }, { status: 404 });
    }
    const acoes = await query<AccaoHST>(
      "hst_acoes_corretivas",
      `select=*&acidente_id=eq.${encodeURIComponent(id)}&order=created_at.asc`
    );
    let nome = acidente.colaborador_nome || "";
    if (!nome && acidente.collaborator_id) {
      const [c] = await query<ColaboradorHST>(
        "collaborators",
        `select=id,name&id=eq.${acidente.collaborator_id}&limit=1`
      );
      nome = c?.name || "";
    }
    return NextResponse.json({
      ok: true,
      acidente: vestirAcidente(acidente, acidente.collaborator_id
        ? { [acidente.collaborator_id]: nome }
        : {}),
      acoes
    });
  } catch (e) {
    return erroBase(e, "hst acidente GET");
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await autorizado("hst.acidentes", "mexer");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    const corpo = (await req.json()) as { dados?: Partial<DadosAcidente> };
    const d = corpo.dados || {};

    const [atual] = await query<AcidenteHST>(
      "hst_acidentes",
      `select=*&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    if (!atual) {
      return NextResponse.json({ ok: false, erro: "Acidente não encontrado." }, { status: 404 });
    }

    // O juiz vê a FUSÃO: o que vem no corpo substitui o que está gravado.
    // Assim a investigação (2o passo) pode mandar só os campos dela sem
    // perder o que já está gravado.
    const dados = {
      colaborador_nome: d.colaborador_nome ?? atual.colaborador_nome ?? "",
      data_hora: d.data_hora ?? atual.data_hora ?? "",
      tipo_ocorrencia: d.tipo_ocorrencia ?? atual.tipo_ocorrencia ?? "",
      tipo_lesao: d.tipo_lesao ?? atual.tipo_lesao ?? "",
      parte_corpo: d.parte_corpo ?? atual.parte_corpo ?? "",
      dias_afastamento: d.dias_afastamento ?? atual.dias_afastamento ?? 0,
      gerou_atestado: d.gerou_atestado ?? atual.gerou_atestado ?? false,
      numero_atestado: d.numero_atestado ?? atual.numero_atestado ?? "",
      testemunhas: d.testemunhas ?? atual.testemunhas ?? "",
      descricao: d.descricao ?? atual.descricao ?? "",
      status: d.status ?? atual.status ?? "Em Investigacao",
      numero_atestado_vazio: d.gerou_atestado === false
    };
    const problema = problemaAcidente(dados);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const mudancas: Record<string, unknown> = {};
    const texto = (v: string | undefined | null, base: string | null) =>
      v === undefined ? base : String(v).trim() || null;

    mudancas.status = String(dados.status || "Em Investigacao");
    mudancas.colaborador_nome = dados.colaborador_nome.trim();
    mudancas.data_hora = dados.data_hora.trim();
    mudancas.tipo_ocorrencia = dados.tipo_ocorrencia.trim();
    mudancas.tipo_lesao = texto(d.tipo_lesao, atual.tipo_lesao);
    mudancas.parte_corpo = texto(d.parte_corpo, atual.parte_corpo);
    mudancas.dias_afastamento = Math.max(0, Number(dados.dias_afastamento) || 0);
    mudancas.gerou_atestado = dados.gerou_atestado === true;
    mudancas.numero_atestado =
      dados.gerou_atestado === true ? texto(d.numero_atestado, atual.numero_atestado) : null;
    mudancas.testemunhas = texto(d.testemunhas, atual.testemunhas);
    mudancas.descricao = String(dados.descricao).trim();
    mudancas.causa_raiz = texto(d.causa_raiz, atual.causa_raiz);
    mudancas.fator_humano = texto(d.fator_humano, atual.fator_humano);
    mudancas.fator_ambiental = texto(d.fator_ambiental, atual.fator_ambiental);
    mudancas.fator_equipamento = texto(d.fator_equipamento, atual.fator_equipamento);

    // Colaborador mudou? Re-resolve o id pela base (fonte única de verdade).
    if (d.colaborador_nome !== undefined) {
      const [c] = await query<{ id: number }>(
        "collaborators",
        `select=id&name=eq.${encodeURIComponent(dados.colaborador_nome.trim())}&limit=1`
      );
      mudancas.colaborador_id = c?.id ?? null;
    }

    // Área de risco: id + nome resolvidos pela base.
    if (d.area_risco_id !== undefined) {
      const areaId = d.area_risco_id ? Number(d.area_risco_id) : null;
      mudancas.area_risco_id = areaId;
      if (areaId) {
        const [area] = await query<{ nome: string }>(
          "hst_areas_risco",
          `select=nome&id=eq.${areaId}&limit=1`
        );
        mudancas.area_risco_nome = area?.nome || null;
      } else {
        mudancas.area_risco_nome = null;
      }
    }

    const [editado] = await update<AcidenteHST>(
      "hst_acidentes",
      `id=eq.${encodeURIComponent(id)}`,
      mudancas
    );
    return NextResponse.json({ ok: true, acidente: editado });
  } catch (e) {
    return erroBase(e, "hst acidente PATCH");
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await autorizado("hst.acidentes", "apagar");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  try {
    await delFiltro("hst_acoes_corretivas", `acidente_id=eq.${encodeURIComponent(id)}`);
    await delFiltro("hst_acidentes", `id=eq.${encodeURIComponent(id)}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "hst acidente DELETE");
  }
}
