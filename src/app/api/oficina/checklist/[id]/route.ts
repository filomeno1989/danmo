/**
 * /api/oficina/checklist/[id] - Preenchimento de um checklist de manutenção.
 *
 * GET: o checklist, o template (com secções e itens), as respostas já
 * dadas, a obra e a máquina relacionadas, e os colaboradores para os
 * campos Executante / Encarregado.
 *
 * POST:
 * - "responder-item": grava Sim/Não, Bom/Danificado e/ou observação de
 *   um item (cria a linha de resposta à primeira vez, como o hub);
 * - "guardar-cabecalho": dados gerais do preenchimento (data, horas,
 *   folha, executante, encarregado, comentários).
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, query, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { dataHojeISO, proximaDataAssinatura } from "@/lib/oficina";
import type {
  ChecklistPreenchido,
  ColaboradorLinha,
  Equipamento,
  ItemPreenchido,
  ItemTemplate,
  OrdemServico,
  SecaoTemplate,
  TemplateChecklist
} from "@/lib/oficina";

type Contexto = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("ver");
  if (eErro(auth)) return auth;
  const { id: idBruto } = await ctx.params;
  const ckId = Number(idBruto);
  if (!ckId) {
    return NextResponse.json({ ok: false, erro: "Checklist inválido." }, { status: 400 });
  }

  try {
    const lista = await query<ChecklistPreenchido>("checklist_preenchidos", `select=*&id=eq.${ckId}`);
    const checklist = lista[0];
    if (!checklist) {
      return NextResponse.json({ ok: false, erro: "Checklist não encontrado." }, { status: 404 });
    }

    const tplLista = await query<TemplateChecklist>(
      "checklist_templates",
      `select=*&id=eq.${checklist.template_id}`
    );
    const template = tplLista[0];

    // Os itens de template pertencem a SECÇÕES (a tabela
    // checklist_template_itens não tem coluna template_id - as secções
    // é que têm). Primeiro buscam-se as secções, depois os itens por
    // secao_id, igual ao hub original (checklist_preencher.html).
    const [secoes, itensResp, colaboradores] = await Promise.all([
      query<SecaoTemplate>(
        "checklist_template_secoes",
        `select=*&template_id=eq.${checklist.template_id}&order=ordem.asc`
      ),
      query<ItemPreenchido>("checklist_preenchidos_itens", `select=*&checklist_id=eq.${ckId}`),
      query<ColaboradorLinha>(
        "collaborators",
        "select=id,name,code&active=eq.true&order=name.asc"
      )
    ]);

    const secaoIds = secoes.map((s) => s.id);
    const itensTemplate = secaoIds.length
      ? await query<ItemTemplate>(
          "checklist_template_itens",
          `select=*&secao_id=in.(${secaoIds.join(",")})&order=ordem.asc`
        )
      : [];

    let os: OrdemServico | null = null;
    let equip: Equipamento | null = null;
    if (checklist.os_id) {
      const osL = await query<OrdemServico>(
        "ordens_servico",
        `select=*&id=eq.${checklist.os_id}`
      );
      os = osL[0] || null;
    }
    if (checklist.equipment_id) {
      const eqL = await query<Equipamento>(
        "equipment",
        `select=*&id=eq.${checklist.equipment_id}`
      );
      equip = eqL[0] || null;
    }

    return NextResponse.json({
      ok: true,
      checklist,
      template: template || null,
      secoes,
      itensTemplate,
      itensResp,
      os,
      equip,
      colaboradores
    });
  } catch (e) {
    return erroBase(e, "checklist/[id] GET");
  }
}

type Corpo = {
  action: "responder-item" | "guardar-cabecalho";
  templateItemId?: number;
  executado?: "sim" | "nao" | null;
  estado?: "bom" | "danificado" | null;
  observacao?: string | null;
  cabecalho?: {
    data_revisao: string | null;
    horas_trabalho: number | null;
    folha_numero: string | null;
    executante: string | null;
    encarregado: string | null;
    observacoes_gerais: string | null;
  };
};

export async function POST(req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("editar");
  if (eErro(auth)) return auth;
  const { id: idBruto } = await ctx.params;
  const ckId = Number(idBruto);
  if (!ckId) {
    return NextResponse.json({ ok: false, erro: "Checklist inválido." }, { status: 400 });
  }

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  try {
    const lista = await query<ChecklistPreenchido>("checklist_preenchidos", `select=*&id=eq.${ckId}`);
    if (!lista[0]) {
      return NextResponse.json({ ok: false, erro: "Checklist não encontrado." }, { status: 404 });
    }

    if (corpo.action === "responder-item") {
      const itemId = Number(corpo.templateItemId);
      if (!itemId) {
        return NextResponse.json({ ok: false, erro: "Item inválido." }, { status: 400 });
      }
      // Garante que existe a linha de resposta (cria à primeira vez)
      const existentes = await query<ItemPreenchido>(
        "checklist_preenchidos_itens",
        `select=*&checklist_id=eq.${ckId}&template_item_id=eq.${itemId}`
      );
      let linha = existentes[0];
      if (!linha) {
        const criados = await insert<ItemPreenchido>("checklist_preenchidos_itens", {
          checklist_id: ckId,
          template_item_id: itemId
        });
        linha = criados[0];
      }
      const upd: Record<string, unknown> = {};
      if (corpo.executado !== undefined) upd.executado = corpo.executado;
      if (corpo.estado !== undefined) upd.estado = corpo.estado;
      if (corpo.observacao !== undefined) {
        upd.observacao = (corpo.observacao || "").trim() || null;
      }
      if (Object.keys(upd).length) {
        const atualizadas = await update<ItemPreenchido>(
          "checklist_preenchidos_itens",
          `id=eq.${linha.id}`,
          upd
        );
        linha = atualizadas[0] || linha;
      }
      return NextResponse.json({ ok: true, item: linha });
    }

    if (corpo.action === "guardar-cabecalho") {
      const c = corpo.cabecalho;
      if (!c) {
        return NextResponse.json({ ok: false, erro: "Faltam os dados." }, { status: 400 });
      }
      await update("checklist_preenchidos", `id=eq.${ckId}`, {
        data_revisao: c.data_revisao || null,
        horas_trabalho:
          c.horas_trabalho != null && !Number.isNaN(Number(c.horas_trabalho))
            ? Number(c.horas_trabalho)
            : null,
        folha_numero: (c.folha_numero || "").trim() || null,
        executante: (c.executante || "").trim() || null,
        encarregado: (c.encarregado || "").trim() || null,
        observacoes_gerais: (c.observacoes_gerais || "").trim() || null
      });

      // Datas de assinatura (aparecem no impresso por baixo do nome):
      // gravadas num passo separado para o cabeçalho nunca falhar por
      // causa delas - se a base ainda não tiver as colunas, o resto
      // grava na mesma e o problema fica no log.
      try {
        const anterior = lista[0];
        const hoje = dataHojeISO();
        await update("checklist_preenchidos", `id=eq.${ckId}`, {
          executante_data: proximaDataAssinatura(
            c.executante,
            anterior.executante,
            anterior.executante_data,
            hoje
          ),
          encarregado_data: proximaDataAssinatura(
            c.encarregado,
            anterior.encarregado,
            anterior.encarregado_data,
            hoje
          )
        });
      } catch (eDatas) {
        console.error("checklist/[id]: datas de assinatura não gravadas:", eDatas);
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  } catch (e) {
    return erroBase(e, `checklist/[id] POST ${corpo.action}`);
  }
}
