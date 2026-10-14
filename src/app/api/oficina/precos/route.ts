/**
 * /api/oficina/precos - Tabela de Preços da Faturação CdM (catálogo).
 *
 * GET  -> lista completa dos preços (mão de obra e materiais).
 * POST -> "criar-preco"  (novo item no catálogo)
 *         "editar-preco" (corrige nome/unidade/valor - as obras já
 *                         fechadas NÃO mudam: cada fecho gravou os
 *                         seus valores no momento)
 *         "apagar-preco" (remove do catálogo)
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase, type AccaoOficina } from "@/lib/guarda-api";
import type { PrecoCatalogo } from "@/lib/oficina";

const TIPOS_OK = ["mao_obra", "material"];
const UNIDADES_OK = ["hora", "un", "kg", "lt"];

export async function GET() {
  const auth = await autorizado("ver");
  if (eErro(auth)) return auth;
  try {
    const precos = await query<PrecoCatalogo>(
      "oficina_precos",
      "select=*&order=tipo.asc,nome.asc"
    );
    return NextResponse.json({ ok: true, precos });
  } catch (e) {
    const msg = String((e as { message?: string })?.message || "");
    if (msg.includes("does not exist") || msg.includes("Could not find the table")) {
      return NextResponse.json(
        {
          ok: false,
          erro:
            "A Tabela de Preços ainda não existe na base. Corre o ficheiro sql/fase3c-precos-catalogo.sql no Supabase (SQL Editor)."
        },
        { status: 400 }
      );
    }
    return erroBase(e, "precos GET");
  }
}

type Corpo = {
  action: "criar-preco" | "editar-preco" | "apagar-preco";
  id?: number;
  tipo?: string;
  nome?: string;
  unidade?: string;
  valor?: number;
};

const ACCOES: Record<string, AccaoOficina> = {
  "criar-preco": "criar",
  "editar-preco": "editar",
  "apagar-preco": "apagar"
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

  const accao = ACCOES[corpo.action];
  if (!accao) {
    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  }
  const auth = await autorizado(accao);
  if (eErro(auth)) return auth;

  try {
    if (corpo.action === "apagar-preco") {
      if (!corpo.id) {
        return NextResponse.json({ ok: false, erro: "Preço não indicado." }, { status: 400 });
      }
      await del("oficina_precos", corpo.id);
      return NextResponse.json({ ok: true });
    }

    const nome = (corpo.nome || "").trim();
    const tipo = corpo.tipo || "";
    const unidade = corpo.unidade || "un";
    const valor = Number(corpo.valor);

    if (!nome) {
      return NextResponse.json({ ok: false, erro: "Escreve o nome do item." }, { status: 400 });
    }
    if (!TIPOS_OK.includes(tipo)) {
      return NextResponse.json(
        { ok: false, erro: "Escolhe o tipo: Mão de obra ou Material." },
        { status: 400 }
      );
    }
    if (!UNIDADES_OK.includes(unidade)) {
      return NextResponse.json(
        { ok: false, erro: "Unidade inválida (hora, unidade, kg ou litro)." },
        { status: 400 }
      );
    }
    if (!Number.isFinite(valor) || valor < 0) {
      return NextResponse.json(
        { ok: false, erro: "Escreve um valor válido (0 ou mais)." },
        { status: 400 }
      );
    }

    if (corpo.action === "criar-preco") {
      // Nome único dentro do tipo (protecção dupla: o índice também protege)
      const duplicado = await query<{ id: number }>(
        "oficina_precos",
        `select=id&tipo=eq.${tipo}&nome=ilike.${encodeURIComponent(nome)}&limit=1`
      );
      if (duplicado.length) {
        return NextResponse.json(
          { ok: false, erro: "Este item já existe na Tabela de Preços." },
          { status: 409 }
        );
      }
      const criado = await insert<PrecoCatalogo>("oficina_precos", {
        tipo,
        nome,
        unidade,
        valor
      });
      return NextResponse.json({ ok: true, id: criado[0].id });
    }

    // editar-preco
    if (!corpo.id) {
      return NextResponse.json({ ok: false, erro: "Preço não indicado." }, { status: 400 });
    }
    await update("oficina_precos", `id=eq.${corpo.id}`, {
      tipo,
      nome,
      unidade,
      valor,
      actualizado_em: new Date().toISOString()
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = String((e as { message?: string })?.message || "");
    if (msg.includes("idx_precos_tipo_nome") || msg.includes("duplicate key")) {
      return NextResponse.json(
        { ok: false, erro: "Este item já existe na Tabela de Preços." },
        { status: 409 }
      );
    }
    return erroBase(e, `precos POST ${corpo.action}`);
  }
}
