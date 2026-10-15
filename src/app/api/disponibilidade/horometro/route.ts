/**
 * /api/disponibilidade/horometro - Controlo do horómetro (HOURMETER CONTROL).
 *
 * GET ?ano=2026&mes=10
 *   -> máquinas do módulo (activas + as que têm leitura no ano) e as
 *      leituras do mês; para cada máquina traz também a leitura FINAL do
 *      mês anterior para preencher a inicial automaticamente (a regra do
 *      excel deles: o final de um mês é o inicial do seguinte).
 *
 * POST { equipment_id, ano, mes, leitura_inicial, leitura_final, observacao }
 *   -> grava a leitura (upsert, nunca duplica) e calcula as horas
 *      trabalhadas (final - inicial). O "lancado_por" fica com o nome de
 *      quem lançou (pode ser o colaborador na recolha, sem papel).
 */

import { NextResponse } from "next/server";
import { query, queryTudo, upsert } from "@/lib/supabase";
import { autorizadoDisp, eErro, erroBase } from "@/lib/guarda-api";
import { frotaDeGrupo } from "@/lib/disponibilidade";

export const dynamic = "force-dynamic";

type EquipLinha = { id: number; code: string; name: string | null; group_name: string | null; active: boolean };
type LeituraLinha = {
  id: number;
  equipment_id: number;
  leitura_inicial: number | string | null;
  leitura_final: number | string | null;
  horas_trabalhadas: number | string | null;
  lancado_por: string | null;
  lancado_em: string;
  observacao: string | null;
};

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

export async function GET(request: Request) {
  const auth = await autorizadoDisp("ver");
  if (eErro(auth)) return auth;

  const url = new URL(request.url);
  const agora = new Date();
  const ano = Number(url.searchParams.get("ano")) || agora.getFullYear();
  const mes = Number(url.searchParams.get("mes")) || agora.getMonth() + 1;
  if (mes < 1 || mes > 12) {
    return NextResponse.json({ ok: false, erro: "Mês inválido." }, { status: 400 });
  }

  try {
    const [equipamentos, leituras, mesAnterior] = await Promise.all([
      queryTudo<EquipLinha>("equipment", "select=id,code,name,group_name,active&order=code.asc"),
      query<LeituraLinha>(
        "disp_horometro",
        `select=*&ano=eq.${ano}&mes=eq.${mes}`
      ),
      query<{ equipment_id: number; leitura_final: number | string | null }>(
        "disp_horometro",
        `select=equipment_id,leitura_final&ano=eq.${mes === 1 ? ano - 1 : ano}&mes=eq.${mes === 1 ? 12 : mes - 1}&leitura_final=not.is.null`
      )
    ]);

    // máquinas: activas + inactivas com leitura neste ano (histórico importado)
    const idsComLeituraAno = new Set(leituras.map((l) => l.equipment_id));
    const eqs = equipamentos.filter((e) => e.active || idsComLeituraAno.has(e.id));
    const finalAnterior = new Map(mesAnterior.map((l) => [l.equipment_id, n(l.leitura_final)]));

    return NextResponse.json({
      ok: true,
      ano,
      mes,
      equipamentos: eqs.map((e) => ({
        id: e.id,
        code: e.code,
        nome: e.name,
        frota: frotaDeGrupo(e.group_name),
        active: e.active
      })),
      leituras,
      finalAnterior: Object.fromEntries(finalAnterior)
    });
  } catch (e) {
    return erroBase(e, "ler horómetro");
  }
}

export async function POST(request: Request) {
  const auth = await autorizadoDisp("editar");
  if (eErro(auth)) return auth;

  let corpo: {
    equipment_id?: number;
    ano?: number;
    mes?: number;
    leitura_inicial?: number | string | null;
    leitura_final?: number | string | null;
    observacao?: string | null;
  };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  const equipmentId = Number(corpo.equipment_id);
  const ano = Number(corpo.ano);
  const mes = Number(corpo.mes);
  const inicial = n(corpo.leitura_inicial);
  const final = n(corpo.leitura_final);
  if (!equipmentId || !ano || !mes || mes < 1 || mes > 12) {
    return NextResponse.json({ ok: false, erro: "Máquina, ano ou mês inválidos." }, { status: 400 });
  }
  if (final !== null && inicial !== null && final < inicial) {
    return NextResponse.json(
      {
        ok: false,
        erro:
          "A leitura final é menor que a inicial. Se o contador foi trocado ou reiniciou, indica-o na observação e confirma os valores."
      },
      { status: 400 }
    );
  }

  try {
    const linha = {
      equipment_id: equipmentId,
      ano,
      mes,
      leitura_inicial: inicial,
      leitura_final: final,
      horas_trabalhadas: final !== null && inicial !== null ? Math.round((final - inicial) * 100) / 100 : null,
      lancado_por: auth.utilizador.nome,
      observacao: corpo.observacao || null
    };
    const [gravada] = await upsert<LeituraLinha>("disp_horometro", [linha], "equipment_id,ano,mes");
    return NextResponse.json({ ok: true, leitura: gravada });
  } catch (e) {
    return erroBase(e, "gravar horómetro");
  }
}
