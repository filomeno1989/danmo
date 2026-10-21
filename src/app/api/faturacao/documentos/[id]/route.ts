/**
 * /api/faturacao/documentos/[id] - Um documento da Faturação.
 *
 * GET: documento + linhas (editor e actualizações do painel).
 * PATCH: guardar alterações. Igual ao POST: o servidor recalcula tudo,
 *        limpa o HTML, recusa número repetido e MANTÉM o autor original
 *        (quem editou por último não passa a ser o "Elaborado por" -
 *        correcção de comportamento sobre o hub antigo).
 * DELETE: apagar documento e linhas. As linhas saem primeiro: sem elas
 *        o documento apagado deixava órfãos se algo falhasse a meio.
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, queryTudo, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import {
  validarDocEntrada,
  numeroDuplicado,
  type DocFaturacao,
  type ItemFaturacao,
  type TecnicoFat
} from "@/lib/faturacao";

type Contexto = { params: Promise<{ id: string }> };

const idSeguro = (bruto: string) => /^[a-zA-Z0-9_-]{1,40}$/.test(bruto) ? bruto : "";

export async function GET(_req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("faturacao.editor", "ver");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  const docId = idSeguro(id);
  if (!docId) return NextResponse.json({ ok: false, erro: "Documento inválido." }, { status: 400 });
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true, documento: null, itens: [] });
  }
  try {
    const docs = await query<DocFaturacao>("documentos", `select=*&id=eq.${docId}`);
    const doc = docs[0];
    if (!doc) return NextResponse.json({ ok: false, erro: "Documento não encontrado." }, { status: 404 });
    const itens = await queryTudo<ItemFaturacao>(
      "documento_itens",
      `select=*&documento_id=eq.${docId}&order=ordem.asc`
    );
    return NextResponse.json({ ok: true, documento: doc, itens });
  } catch (e) {
    return erroBase(e, "faturacao documento GET");
  }
}

export async function PATCH(req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("faturacao.editor", "mexer");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  const docId = idSeguro(id);
  if (!docId) return NextResponse.json({ ok: false, erro: "Documento inválido." }, { status: 400 });

  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true, id: docId });
  }

  try {
    const actuais = await query<DocFaturacao>("documentos", `select=*&id=eq.${docId}`);
    const actual = actuais[0];
    if (!actual) return NextResponse.json({ ok: false, erro: "Documento não encontrado." }, { status: 404 });

    const corpo = await req.json().catch(() => ({}));
    const tecnicos = await queryTudo<TecnicoFat>("tecnicos", "select=id,nome");
    const validacao = validarDocEntrada(corpo, tecnicos, { novo: false });
    if (!validacao.ok || !validacao.dados) {
      return NextResponse.json({ ok: false, erro: validacao.erro }, { status: 400 });
    }
    const dados = validacao.dados;

    const existentes = await queryTudo<{ id: string; tipo: string; numero: string }>(
      "documentos",
      "select=id,tipo,numero"
    );
    if (numeroDuplicado(dados.tipo, dados.numero, existentes, docId)) {
      return NextResponse.json(
        {
          ok: false,
          erro: `Já existe ${dados.tipo === "fatura" ? "uma fatura" : "uma cotação"} com o número ${dados.numero}. Corrige o número.`
        },
        { status: 409 }
      );
    }

    const docLimpo = {
      tipo: dados.tipo,
      numero: dados.numero,
      data: dados.data,
      servico: dados.servico,
      moeda: dados.moeda,
      taxa_cambio: dados.taxa_cambio,
      iva_incluido: dados.iva_incluido,
      iva_pct: dados.iva_pct,
      tipo_cliente: dados.tipo_cliente,
      cliente_nome: dados.cliente_nome,
      cliente_morada: dados.cliente_morada,
      cliente_nuit: dados.cliente_nuit,
      cliente_contacto: dados.cliente_contacto,
      enviado_nome: dados.enviado_nome,
      enviado_cargo: dados.enviado_cargo,
      assunto: dados.assunto,
      subtotal: dados.subtotal,
      desconto: dados.desconto,
      desconto_tipo: dados.desconto_tipo,
      desconto_input: dados.desconto_input,
      iva_amt: dados.iva_amt,
      total: dados.total,
      total_mzn: dados.total_mzn,
      atualizado_em: new Date().toISOString()
    };
    await update<DocFaturacao>("documentos", `id=eq.${docId}`, docLimpo);

    // Linhas: apagar as antigas (uma a uma, padrão do portal) e
    // reinserir com autor e totais decididos no servidor.
    const antigas = await query<{ id: string }>(
      "documento_itens",
      `select=id&documento_id=eq.${docId}`
    );
    for (const a of antigas) await del("documento_itens", a.id);
    if (dados.itens.length) {
      await insert(
        "documento_itens",
        dados.itens.map((it) => ({ ...it, documento_id: docId }))
      );
    }

    return NextResponse.json({ ok: true, id: docId, numero: dados.numero });
  } catch (e) {
    return erroBase(e, "faturacao documento PATCH");
  }
}

export async function DELETE(_req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("faturacao.editor", "apagar");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  const docId = idSeguro(id);
  if (!docId) return NextResponse.json({ ok: false, erro: "Documento inválido." }, { status: 400 });

  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true });
  }

  try {
    const antigas = await query<{ id: string }>(
      "documento_itens",
      `select=id&documento_id=eq.${docId}`
    );
    for (const a of antigas) await del("documento_itens", a.id);
    await del("documentos", docId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "faturacao documento DELETE");
  }
}
