/**
 * /api/oficina/checklist-gestao - Gestão dos templates de checklist.
 *
 * GET: ?categoria=Nome&inativos=1&templateId=NN
 *      devolve as categorias de equipamento, os templates da categoria
 *      e, se um template for escolhido, o seu conteúdo completo
 *      (secções, itens e quantas vezes cada item já foi respondido).
 *
 * POST: criar-template, guardar-template, criar-secao, renomear-secao,
 * apagar-secao, guardar-item, adicionar-item, apagar-item.
 * Itens ou secções já respondidos NÃO podem ser apagados (o histórico
 * dos checklists preenchidos fica intacto): o servidor recusa e explica.
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase, type AccaoOficina } from "@/lib/guarda-api";
import type {
  CategoriaEquip,
  ItemTemplate,
  SecaoTemplate,
  TemplateChecklist
} from "@/lib/oficina";

export async function GET(req: NextRequest) {
  const auth = await autorizado("ver");
  if (eErro(auth)) return auth;

  const url = new URL(req.url);
  const categoria = url.searchParams.get("categoria") || "";
  const mostrarInativos = url.searchParams.get("inativos") === "1";
  const templateId = Number(url.searchParams.get("templateId") || 0);

  try {
    const categorias = await query<CategoriaEquip>(
      "categorias_equipamento",
      "select=*&ativo=eq.true&order=nome.asc"
    );

    let templates: TemplateChecklist[] = [];
    if (categoria) {
      templates = await query<TemplateChecklist>(
        "checklist_templates",
        `select=*&categoria_equipamento=eq.${encodeURIComponent(categoria)}&order=tipo.asc,intervalo_horas.asc`
      );
      if (!mostrarInativos) templates = templates.filter((t) => t.ativo);
    }

    let conteudo: {
      template: TemplateChecklist | null;
      secoes: SecaoTemplate[];
      itens: (ItemTemplate & { usos: number })[];
    } = { template: null, secoes: [], itens: [] };

    if (templateId) {
      const tplLista = await query<TemplateChecklist>(
        "checklist_templates",
        `select=*&id=eq.${templateId}`
      );
      if (tplLista[0]) {
        const secoes = await query<SecaoTemplate>(
          "checklist_template_secoes",
          `select=*&template_id=eq.${templateId}&order=ordem.asc`
        );
        const secaoIds = secoes.map((s) => s.id);
        const itensBrutos = secaoIds.length
          ? await query<ItemTemplate>(
              "checklist_template_itens",
              `select=*&secao_id=in.(${secaoIds.join(",")})&order=ordem.asc`
            )
          : [];

        // Quantas vezes cada item já foi respondido (protecção contra apagar histórico)
        const usos: Record<number, number> = {};
        const itemIds = itensBrutos.map((i) => i.id);
        if (itemIds.length) {
          const respondidos = await query<{ template_item_id: number }>(
            "checklist_preenchidos_itens",
            `select=template_item_id&template_item_id=in.(${itemIds.join(",")})`
          );
          respondidos.forEach((r) => {
            usos[r.template_item_id] = (usos[r.template_item_id] || 0) + 1;
          });
        }

        conteudo = {
          template: tplLista[0],
          secoes,
          itens: itensBrutos.map((i) => ({ ...i, usos: usos[i.id] || 0 }))
        };
      }
    }

    return NextResponse.json({ ok: true, categorias, templates, conteudo });
  } catch (e) {
    return erroBase(e, "checklist-gestao GET");
  }
}

type Corpo = {
  action: string;
  // template
  id?: number;
  categoria_equipamento?: string;
  nome?: string;
  tipo?: string;
  intervalo_horas?: number | null;
  intervalo_label?: string | null;
  ref_versao?: string | null;
  ativo?: boolean;
  // secções
  templateId?: number;
  nome_secao?: string;
  secaoId?: number;
  // itens
  itemId?: number;
  numero_item?: number | null;
  descricao?: string;
  ordem?: number;
  secaoIdNovoItem?: number;
};

const PERMISSOES: Record<string, AccaoOficina> = {
  "criar-template": "criar",
  "guardar-template": "editar",
  "criar-secao": "criar",
  "renomear-secao": "editar",
  "apagar-secao": "apagar",
  "guardar-item": "editar",
  "adicionar-item": "criar",
  "apagar-item": "apagar"
};

export async function POST(req: NextRequest) {
  const auth0 = await autorizado("ver");
  if (eErro(auth0)) return auth0;

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  const accao = PERMISSOES[corpo.action];
  if (!accao) {
    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  }
  const auth = await autorizado(accao);
  if (eErro(auth)) return auth;

  try {
    switch (corpo.action) {
      case "criar-template": {
        if (!corpo.categoria_equipamento || !corpo.nome?.trim()) {
          return NextResponse.json(
            { ok: false, erro: "Categoria e Nome são obrigatórios." },
            { status: 400 }
          );
        }
        const criado = await insert<TemplateChecklist>("checklist_templates", {
          categoria_equipamento: corpo.categoria_equipamento,
          nome: corpo.nome.trim(),
          tipo: corpo.tipo || "mecanica",
          intervalo_horas: corpo.intervalo_horas != null ? Number(corpo.intervalo_horas) : null,
          intervalo_label: (corpo.intervalo_label || "").trim() || null,
          ref_versao: (corpo.ref_versao || "Ref. 01").trim(),
          ativo: true
        });
        return NextResponse.json({ ok: true, id: criado[0].id });
      }

      case "guardar-template": {
        if (!corpo.id) {
          return NextResponse.json({ ok: false, erro: "Template não indicado." }, { status: 400 });
        }
        await update("checklist_templates", `id=eq.${corpo.id}`, {
          nome: (corpo.nome || "").trim(),
          ref_versao: (corpo.ref_versao || "").trim(),
          tipo: corpo.tipo || "mecanica",
          intervalo_horas: corpo.intervalo_horas != null ? Number(corpo.intervalo_horas) : null,
          intervalo_label: (corpo.intervalo_label || "").trim() || null,
          ativo: corpo.ativo !== false
        });
        return NextResponse.json({ ok: true });
      }

      case "criar-secao": {
        if (!corpo.templateId || !corpo.nome_secao?.trim()) {
          return NextResponse.json(
            { ok: false, erro: "Escreve o nome da nova secção." },
            { status: 400 }
          );
        }
        const existentes = await query<SecaoTemplate>(
          "checklist_template_secoes",
          `select=*&template_id=eq.${corpo.templateId}`
        );
        const proximaOrdem = existentes.length
          ? Math.max(...existentes.map((s) => s.ordem || 0)) + 1
          : 1;
        const criada = await insert<SecaoTemplate>("checklist_template_secoes", {
          template_id: corpo.templateId,
          nome_secao: corpo.nome_secao.trim(),
          ordem: proximaOrdem
        });
        return NextResponse.json({ ok: true, id: criada[0].id });
      }

      case "renomear-secao": {
        if (!corpo.secaoId || !corpo.nome_secao?.trim()) {
          return NextResponse.json(
            { ok: false, erro: "Escreve o novo nome da secção." },
            { status: 400 }
          );
        }
        await update("checklist_template_secoes", `id=eq.${corpo.secaoId}`, {
          nome_secao: corpo.nome_secao.trim()
        });
        return NextResponse.json({ ok: true });
      }

      case "apagar-secao": {
        if (!corpo.secaoId) {
          return NextResponse.json({ ok: false, erro: "Secção não indicada." }, { status: 400 });
        }
        const itens = await query<ItemTemplate>(
          "checklist_template_itens",
          `select=id&secao_id=eq.${corpo.secaoId}`
        );
        if (itens.length) {
          const respondidos = await query<{ template_item_id: number }>(
            "checklist_preenchidos_itens",
            `select=template_item_id&template_item_id=in.(${itens.map((i) => i.id).join(",")})`
          );
          if (respondidos.length) {
            return NextResponse.json(
              {
                ok: false,
                erro:
                  "Não é possível apagar: há itens desta secção já respondidos em checklists. Oculta os itens em vez de apagar."
              },
              { status: 409 }
            );
          }
        }
        await del("checklist_template_secoes", corpo.secaoId);
        return NextResponse.json({ ok: true });
      }

      case "guardar-item": {
        if (!corpo.itemId || !corpo.descricao?.trim()) {
          return NextResponse.json(
            { ok: false, erro: "A descrição não pode ficar vazia." },
            { status: 400 }
          );
        }
        await update("checklist_template_itens", `id=eq.${corpo.itemId}`, {
          numero_item: corpo.numero_item != null && corpo.numero_item !== ("" as unknown as number) ? Number(corpo.numero_item) : null,
          descricao: corpo.descricao.trim(),
          ordem: Number(corpo.ordem) || 0,
          ativo: corpo.ativo !== false
        });
        return NextResponse.json({ ok: true });
      }

      case "adicionar-item": {
        const secaoId = Number(corpo.secaoIdNovoItem || corpo.secaoId);
        if (!secaoId || !corpo.descricao?.trim()) {
          return NextResponse.json(
            { ok: false, erro: "Escreve a descrição do item." },
            { status: 400 }
          );
        }
        const existentes = await query<ItemTemplate>(
          "checklist_template_itens",
          `select=*&secao_id=eq.${secaoId}`
        );
        const proximaOrdem = existentes.length
          ? Math.max(...existentes.map((i) => i.ordem || 0)) + 1
          : 1;
        await insert("checklist_template_itens", {
          secao_id: secaoId,
          numero_item: corpo.numero_item != null ? Number(corpo.numero_item) : null,
          descricao: corpo.descricao.trim(),
          ordem: proximaOrdem,
          ativo: true
        });
        return NextResponse.json({ ok: true });
      }

      case "apagar-item": {
        if (!corpo.itemId) {
          return NextResponse.json({ ok: false, erro: "Item não indicado." }, { status: 400 });
        }
        const respondidos = await query<{ id: number }>(
          "checklist_preenchidos_itens",
          `select=id&template_item_id=eq.${corpo.itemId}`
        );
        if (respondidos.length) {
          return NextResponse.json(
            {
              ok: false,
              erro: `Este item já foi respondido em ${respondidos.length} checklist(s). Desmarca "Visível" em vez de apagar.`
            },
            { status: 409 }
          );
        }
        await del("checklist_template_itens", corpo.itemId);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
    }
  } catch (e) {
    return erroBase(e, `checklist-gestao POST ${corpo.action}`);
  }
}
