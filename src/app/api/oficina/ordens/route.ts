/**
 * /api/oficina/ordens - Ordens de Serviço da oficina.
 *
 * GET: equipamentos activos + todas as obras + colaboradores activos.
 *      (A lista chega completa; os filtros são do navegador, como no hub.)
 *
 * POST: duas acções, sempre com permissão verificada no servidor:
 * - "criar": nova obra (grava também o primeiro registo no histórico
 *   de estados e o estado físico inicial, como o hub faz);
 * - "apagar": apaga a obra e TUDO o que lhe pertence, por ordem
 *   (peças, logs, checklists, intervenções e relações) - no hub isto
 *   era um delete simples; aqui garantimos a limpeza completa.
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, queryTudo } from "@/lib/supabase";
import { autorizadoOficina, eErro, erroBase } from "@/lib/guarda-api";
import type {
  ColaboradorLinha,
  Equipamento,
  OrdemServico
} from "@/lib/oficina";

export async function GET() {
  const auth = await autorizadoOficina("oficina.ordens", "ver");
  if (eErro(auth)) return auth;

  try {
    const [equipamentos, ordens, colaboradores] = await Promise.all([
      query<Equipamento>("equipment", "select=*&active=eq.true&order=code.asc"),
      queryTudo<OrdemServico>("ordens_servico", "select=*"),
      query<ColaboradorLinha>(
        "collaborators",
        "select=id,name,code,setor&active=eq.true&order=name.asc"
      )
    ]);
    return NextResponse.json({ ok: true, equipamentos, ordens, colaboradores });
  } catch (e) {
    return erroBase(e, "ordens GET");
  }
}

type CorpoCriar = {
  action: "criar" | "apagar";
  numero_obra?: string | null;
  equipment_id?: number;
  sector?: string;
  hora_equipamento?: number | null;
  unidade_medida?: string;
  descricao_avaria?: string;
  tipo_intervencao?: string[] | null;
  data_abertura?: string;
  status_fisico?: string;
  aberto_por?: string[] | null;
  observacoes?: string | null;
  id?: number;
};

export async function POST(req: NextRequest) {
  const auth = await autorizadoOficina("oficina.ordens", "criar");
  if (eErro(auth)) return auth;
  const sessao = auth;

  let corpo: CorpoCriar;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  try {
    /* ============ CRIAR ============ */
    if (corpo.action === "criar") {
      if (!corpo.equipment_id) {
        return NextResponse.json({ ok: false, erro: "Escolhe o equipamento." }, { status: 400 });
      }
      if (!corpo.sector) {
        return NextResponse.json({ ok: false, erro: "Escolhe o sector." }, { status: 400 });
      }
      if (!corpo.descricao_avaria || !corpo.descricao_avaria.trim()) {
        return NextResponse.json({ ok: false, erro: "Descreve a avaria / motivo." }, { status: 400 });
      }
      if (!corpo.status_fisico) {
        return NextResponse.json({ ok: false, erro: "Escolhe o estado físico." }, { status: 400 });
      }
      if (!corpo.data_abertura) {
        return NextResponse.json({ ok: false, erro: "Escolhe a data de abertura." }, { status: 400 });
      }

      // Nº de obra único (o índice da base recusa duplicados; avisamos melhor)
      const numero = (corpo.numero_obra || "").trim() || null;
      if (numero) {
        const existe = await query<{ id: number }>(
          "ordens_servico",
          `select=id&numero_obra=eq.${encodeURIComponent(numero)}&limit=1`
        );
        if (existe.length) {
          return NextResponse.json(
            { ok: false, erro: "Este número de obra já existe. Confirma junto da CdM." },
            { status: 409 }
          );
        }
      }

      const abertoPor =
        Array.isArray(corpo.aberto_por) && corpo.aberto_por.length
          ? corpo.aberto_por
          : null;

      const novas = await insert<OrdemServico>("ordens_servico", {
        numero_obra: numero,
        equipment_id: corpo.equipment_id,
        sector: corpo.sector,
        hora_equipamento:
          corpo.hora_equipamento != null && !Number.isNaN(Number(corpo.hora_equipamento))
            ? Number(corpo.hora_equipamento)
            : null,
        unidade_medida: corpo.unidade_medida || "h",
        descricao_avaria: corpo.descricao_avaria.trim(),
        tipo_intervencao:
          Array.isArray(corpo.tipo_intervencao) && corpo.tipo_intervencao.length
            ? corpo.tipo_intervencao
            : null,
        data_abertura: corpo.data_abertura,
        status_fisico: corpo.status_fisico,
        status_atual: "Aberta (DTEC)",
        aberto_por: abertoPor,
        observacoes: (corpo.observacoes || "").trim() || null
      });
      const nova = novas[0];

      await insert("os_status_log", {
        os_id: nova.id,
        status_anterior: null,
        status_novo: "Aberta (DTEC)",
        responsavel: abertoPor ? abertoPor.join(", ") : null,
        observacao: "Obra criada"
      });
      await insert("os_status_fisico_log", {
        os_id: nova.id,
        status_fisico: corpo.status_fisico
      });

      return NextResponse.json({ ok: true, id: nova.id });
    }

    /* ============ APAGAR (permissão própria) ============ */
    if (corpo.action === "apagar") {
      if (!sessao || sessao.utilizador.nivel !== "admin") {
        // Igual ao hub: apagar obra é acção da administração (data-dh="apagar")
        const podeApagar = await import("@/lib/auth").then((m) =>
          m.pode(sessao, "oficina", "apagar")
        );
        if (!podeApagar) {
          return NextResponse.json(
            { ok: false, erro: "Não tens permissão para apagar obras." },
            { status: 403 }
          );
        }
      }
      const id = Number(corpo.id);
      if (!id) {
        return NextResponse.json({ ok: false, erro: "Obra não indicada." }, { status: 400 });
      }

      // 1. Peças da obra
      const pecas = await query<{ id: number }>("os_pecas", `select=id&os_id=eq.${id}`);
      for (const p of pecas) await del("os_pecas", p.id);

      // 2. Logs de estado e estado físico
      const logsEstado = await query<{ id: number }>("os_status_log", `select=id&os_id=eq.${id}`);
      for (const l of logsEstado) await del("os_status_log", l.id);
      const logsFisico = await query<{ id: number }>(
        "os_status_fisico_log",
        `select=id&os_id=eq.${id}`
      );
      for (const l of logsFisico) await del("os_status_fisico_log", l.id);

      // 3. Checklists (trocas, itens preenchidos e preenchidos)
      const trocas = await query<{ id: number }>("checklist_trocas", `select=id&os_id=eq.${id}`);
      for (const t of trocas) await del("checklist_trocas", t.id);
      const preenchidos = await query<{ id: number }>(
        "checklist_preenchidos",
        `select=id&os_id=eq.${id}`
      );
      for (const ck of preenchidos) {
        const itens = await query<{ id: number }>(
          "checklist_preenchidos_itens",
          `select=id&checklist_id=eq.${ck.id}`
        );
        for (const it of itens) await del("checklist_preenchidos_itens", it.id);
        await del("checklist_preenchidos", ck.id);
      }

      // 4. Intervenções e relações com técnicos
      const records = await query<{ id: number }>("records", `select=id&os_id=eq.${id}`);
      for (const r of records) {
        const relacoes = await query<{ id: number }>(
          "record_collaborators",
          `select=id&record_id=eq.${r.id}`
        );
        for (const rel of relacoes) await del("record_collaborators", rel.id);
        await del("records", r.id);
      }

      // 5. A própria obra
      await del("ordens_servico", id);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  } catch (e) {
    return erroBase(e, `ordens POST ${corpo.action || "?"}`);
  }
}
