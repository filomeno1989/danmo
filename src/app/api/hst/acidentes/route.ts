/**
 * /api/hst/acidentes - Acidentes e Incidentes do Portal HST.
 *
 * GET: lista completa + acções correctivas + áreas activas + colaboradores
 *      activos (datalist). As linhas antigas (era danmo-hst, com
 *      collaborator_id e sem nome) chegam com o nome JÁ resolvido pela
 *      base: o ecrã nunca adivinha nada.
 * POST: cria acidente. O NÚMERO (DAN-HST-AAAA-NNN) é calculado AQUI no
 *      servidor (o hub calculava no navegador: duas gravações ao mesmo
 *      tempo nasciam com o mesmo número) e um duplicado no mesmo ano é
 *      recusado com 409. O nome do colaborador é confirmado contra a
 *      base e o colaborador_id fica gravado (o hub deixava a null).
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, query, queryTudo } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  problemaAcidente,
  vestirAcidente,
  type AccaoHST,
  type AcidenteHST,
  type AreaRiscoHST,
  type ColaboradorHST,
  type DadosAcidente
} from "@/lib/hst";

export async function GET() {
  const auth = await autorizadoEmAlguma(["hst", "hst.acidentes", "hst.relatorios"]);
  if (eErro(auth)) return auth;
  try {
    const [acidentes, acoes, areas, colabs] = await Promise.all([
      queryTudo<AcidenteHST>("hst_acidentes", "select=*&order=created_at.desc,id.desc"),
      queryTudo<AccaoHST>("hst_acoes_corretivas", "select=*&order=prazo.asc"),
      queryTudo<AreaRiscoHST>("hst_areas_risco", "select=*&order=nome.asc"),
      queryTudo<ColaboradorHST>(
        "collaborators",
        "select=id,name&order=name.asc"
      )
    ]);
    const nomesPorId: Record<number, string> = {};
    for (const c of colabs) {
      if (c.name) nomesPorId[c.id] = c.name;
    }
    return NextResponse.json({
      ok: true,
      acidentes: acidentes.map((a) => vestirAcidente(a, nomesPorId)),
      acoes,
      areas,
      colaboradores: colabs
    });
  } catch (e) {
    return erroBase(e, "hst acidentes GET");
  }
}

/** Resolve o nome para id na tabela collaborators (o hub nunca gravava o id). */
async function resolverColaborador(nome: string): Promise<number | null> {
  const limpo = nome.trim();
  if (!limpo) return null;
  const [c] = await query<{ id: number }>(
    "collaborators",
    `select=id&name=eq.${encodeURIComponent(limpo)}&limit=1`
  );
  return c?.id ?? null;
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("hst.acidentes", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as { dados?: Partial<DadosAcidente> };
    const d = corpo.dados || {};
    const problema = problemaAcidente(d);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const ano = Number(d.data_hora!.slice(0, 4));
    if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) {
      return NextResponse.json({ ok: false, erro: "Ano do evento inválido." }, { status: 400 });
    }

    // Número no SERVIDOR: último gravado no ano + 1 (regra do papel,
    // sem a corrida do navegador).
    const ultimos = await query<{ numero: string }>(
      "hst_acidentes",
      `select=numero&numero=like.DAN-HST-${ano}-*&order=numero.desc&limit=1`
    );
    const maiorGravado = (() => {
      for (const u of ultimos) {
        const seq = Number(String(u.numero || "").split("-").pop());
        if (Number.isFinite(seq)) return seq;
      }
      return 0;
    })();
    const seq = Math.max(maiorGravado + 1, 1);
    const numero = `DAN-HST-${ano}-${String(seq).padStart(3, "0")}`;

    const mesmos = await query<{ id: number }>(
      "hst_acidentes",
      `select=id&numero=eq.${encodeURIComponent(numero)}&limit=1`
    );
    if (mesmos.length) {
      return NextResponse.json(
        { ok: false, erro: `O nº ${numero} já existe. Grava de novo para o servidor sugerir o seguinte.` },
        { status: 409 }
      );
    }

    const nome = d.colaborador_nome!.trim();
    const colaboradorId = await resolverColaborador(nome);

    const areaId = d.area_risco_id ? Number(d.area_risco_id) : null;
    let areaNome: string | null = null;
    if (areaId) {
      const [area] = await query<{ nome: string }>(
        "hst_areas_risco",
        `select=nome&id=eq.${areaId}&limit=1`
      );
      areaNome = area?.nome || null;
    }

    const [criado] = await insert<AcidenteHST>("hst_acidentes", {
      numero,
      status: d.status || "Em Investigacao",
      colaborador_nome: nome,
      colaborador_id: colaboradorId,
      area_risco_id: areaId,
      area_risco_nome: areaNome,
      data_hora: d.data_hora!.trim(),
      tipo_ocorrencia: d.tipo_ocorrencia!.trim(),
      descricao: d.descricao!.trim(),
      tipo_lesao: d.tipo_lesao?.trim() || null,
      parte_corpo: d.parte_corpo?.trim() || null,
      dias_afastamento: Number.isFinite(Number(d.dias_afastamento))
        ? Math.max(0, Number(d.dias_afastamento))
        : 0,
      gerou_atestado: d.gerou_atestado === true,
      numero_atestado: d.gerou_atestado === true ? d.numero_atestado?.trim() || null : null,
      testemunhas: d.testemunhas?.trim() || null,
      causa_raiz: d.causa_raiz?.trim() || null,
      fator_humano: d.fator_humano?.trim() || null,
      fator_ambiental: d.fator_ambiental?.trim() || null,
      fator_equipamento: d.fator_equipamento?.trim() || null,
      registrado_por: auth.utilizador.nome
    });

    return NextResponse.json({ ok: true, acidente: criado });
  } catch (e) {
    return erroBase(e, "hst acidentes POST");
  }
}
