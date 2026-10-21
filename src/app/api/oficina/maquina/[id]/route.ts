/**
 * /api/oficina/maquina/[id] - Histórico completo de uma máquina.
 *
 * GET: equipamento, todas as obras da máquina, intervenções (com
 * técnicos), peças (com total aplicado por peça) e colaboradores.
 * O navegador monta os KPIs, a timeline e o gráfico de horas por mês.
 */

import { NextResponse, NextRequest } from "next/server";
import { query, queryTudo } from "@/lib/supabase";
import { autorizadoOficina, eErro, erroBase } from "@/lib/guarda-api";
import type {
  ColaboradorLinha,
  Equipamento,
  Intervencao,
  OrdemServico,
  PecaOS
} from "@/lib/oficina";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Contexto) {
  const auth = await autorizadoOficina("oficina.equipamentos", "ver");
  if (eErro(auth)) return auth;
  const { id: idBruto } = await ctx.params;
  const equipId = Number(idBruto);
  if (!equipId) {
    return NextResponse.json({ ok: false, erro: "Máquina inválida." }, { status: 400 });
  }

  try {
    const eqLista = await query<Equipamento>("equipment", `select=*&id=eq.${equipId}`);
    const equip = eqLista[0];
    if (!equip) {
      return NextResponse.json({ ok: false, erro: "Máquina não encontrada." }, { status: 404 });
    }

    const ordens = await queryTudo<OrdemServico>(
      "ordens_servico",
      `select=*&equipment_id=eq.${equipId}&order=data_abertura.desc`
    );

    const colaboradores = await query<ColaboradorLinha>(
      "collaborators",
      "select=id,name,code,setor&active=eq.true&order=name.asc"
    );

    // Intervenções das obras desta máquina (sem carregar a tabela toda)
    const osIds = ordens.map((o) => o.id);
    let intervencoes: (Intervencao & { obra_numero: string | null })[] = [];
    let pecas: (PecaOS & { obra_numero: string | null })[] = [];

    if (osIds.length) {
      const ids = osIds.join(",");
      const mapaObra = new Map(ordens.map((o) => [o.id, o.numero_obra || null]));

      const records = await queryTudo<Intervencao>(
        "records",
        `select=*&os_id=in.(${ids})&order=shift_date.desc`
      );
      const idsRecords = records.map((r) => r.id);
      const relacoes = idsRecords.length
        ? await query<{ record_id: number; collaborator_id: number }>(
            "record_collaborators",
            `select=record_id,collaborator_id&record_id=in.(${idsRecords.join(",")})`
          )
        : [];

      intervencoes = records.map((r) => {
        const idsCol = relacoes.filter((rel) => rel.record_id === r.id).map((rel) => rel.collaborator_id);
        const tecnicos = idsCol
          .map((idCol) => colaboradores.find((c) => c.id === idCol))
          .filter(Boolean)
          .map((c) => ({
            id: (c as ColaboradorLinha).id,
            name: (c as ColaboradorLinha).name,
            code: (c as ColaboradorLinha).code || null
          }));
        return { ...r, tecnicos, obra_numero: mapaObra.get(r.os_id) ?? null };
      });

      const pecasBrutas = await queryTudo<PecaOS>(
        "os_pecas",
        `select=*&os_id=in.(${ids})&order=criado_em.asc`
      );
      pecas = pecasBrutas.map((p) => ({
        ...p,
        obra_numero: mapaObra.get(p.os_id) ?? null
      }));
    }

    return NextResponse.json({
      ok: true,
      equip,
      ordens,
      intervencoes,
      pecas,
      colaboradores
    });
  } catch (e) {
    return erroBase(e, "maquina/[id] GET");
  }
}
