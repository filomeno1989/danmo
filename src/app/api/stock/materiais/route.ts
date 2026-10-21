/**
 * /api/stock/materiais - Catálogo de materiais.
 *
 * GET: todos os materiais (activos e inactivos) + categorias activas +
 *      posições de stock confirmadas. A posição é calculada AQUI no
 *      servidor (entradas confirmadas menos saídas confirmadas): o
 *      navegador nunca inventa números.
 * POST: "criar", "editar" e "desactivar" (a referência é única e a
 *      unidade tem de estar na lista configurada).
 *
 * Melhorias sobre o hub antigo:
 * - referência duplicada é recusada no servidor (padrão Equipamentos);
 * - busca sem acentos é feita no cliente com normalizar();
 * - os inactivos voltam a ser visíveis (toggle Inactivas) para poderem
 *   ser reactivados: no hub desapareciam para sempre.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, query, queryTudo, update } from "@/lib/supabase";
import { autorizadoStock, eErro, erroBase } from "@/lib/guarda-api";
import { calcularPosicoes } from "@/lib/stock";
import type { Material, MovimentoStock } from "@/lib/stock";
import { unidadesValidas } from "@/app/api/stock/config/route";

export async function GET() {
  const auth = await autorizadoStock("ver");
  if (eErro(auth)) return auth;
  try {
    const [materiais, movimentos, categorias, unidades] = await Promise.all([
      queryTudo<Material>("materiais", "select=*&order=referencia.asc"),
      queryTudo<MovimentoStock>("stock_movimentos", "select=*&estado=eq.confirmado"),
      query<{ id: string; nome: string; ativo: boolean }>(
        "categorias_material",
        "select=*&ativo=eq.true&order=nome.asc"
      ),
      unidadesValidas()
    ]);
    return NextResponse.json({
      ok: true,
      materiais,
      categorias,
      unidades,
      posicoes: calcularPosicoes(movimentos)
    });
  } catch (e) {
    return erroBase(e, "stock materiais GET");
  }
}

type Corpo = {
  action: "criar" | "editar" | "desactivar";
  id?: string;
  referencia?: string;
  nome?: string;
  categoria?: string;
  unidade?: string;
  stock_minimo?: number | string;
  localizacao?: string;
  preco_mzn?: number | string;
};

const arred2 = (n: number) => Math.round(n * 100) / 100;

export async function POST(req: NextRequest) {
  const auth0 = await autorizadoStock("ver");
  if (eErro(auth0)) return auth0;

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  if (corpo.action === "desactivar") {
    const auth = await autorizadoStock("editar");
    if (eErro(auth)) return auth;
    if (!corpo.id) {
      return NextResponse.json({ ok: false, erro: "Material não indicado." }, { status: 400 });
    }
    try {
      await update("materiais", `id=eq.${corpo.id}`, { ativo: false });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return erroBase(e, "stock materiais desactivar");
    }
  }

  const auth = await autorizadoStock(corpo.action === "criar" ? "criar" : "editar");
  if (eErro(auth)) return auth;

  try {
    const referencia = (corpo.referencia || "").trim();
    const nome = (corpo.nome || "").trim();
    const unidade = (corpo.unidade || "").trim();
    if (!referencia || !nome || !unidade) {
      return NextResponse.json(
        { ok: false, erro: "Referência, Nome e Unidade são obrigatórios." },
        { status: 400 }
      );
    }
    if (referencia.length > 40 || nome.length > 120) {
      return NextResponse.json(
        { ok: false, erro: "Referência (máx. 40) ou nome (máx. 120) demasiado longos." },
        { status: 400 }
      );
    }
    const unidades = await unidadesValidas();
    if (!unidades.some((u) => u.toLowerCase() === unidade.toLowerCase())) {
      return NextResponse.json(
        { ok: false, erro: `Unidade "${unidade}" não está na lista. Escolhe uma das configuradas.` },
        { status: 400 }
      );
    }
    const minimo = Number(corpo.stock_minimo);
    if (corpo.stock_minimo !== undefined && corpo.stock_minimo !== "" && (!Number.isFinite(minimo) || minimo < 0)) {
      return NextResponse.json(
        { ok: false, erro: "Stock mínimo: escreve um número maior ou igual a 0." },
        { status: 400 }
      );
    }
    const preco = Number(corpo.preco_mzn);
    if (corpo.preco_mzn !== undefined && corpo.preco_mzn !== "" && (!Number.isFinite(preco) || preco < 0)) {
      return NextResponse.json(
        { ok: false, erro: "Preço unitário: escreve um número maior ou igual a 0." },
        { status: 400 }
      );
    }

    // Referência única: duas referências iguais (mesmo com maiúsculas
    // diferentes) tornam o armazém ambíguo. O % e o _ escapam: são
    // caracteres curinga do LIKE e uma referência "MAT_1" nunca pode
    // casar com "MATX1".
    const padraoRef = encodeURIComponent(
      referencia.replace(/[\\%_]/g, (c) => `\\${c}`)
    );
    const iguais = await query<Material & { id: string }>(
      "materiais",
      `select=id,referencia&referencia=ilike.${padraoRef}${
        corpo.action === "editar" && corpo.id ? `&id=neq.${corpo.id}` : ""
      }&limit=1`
    );
    if (iguais.length) {
      return NextResponse.json(
        {
          ok: false,
          erro: `Já existe um material com a referência ${iguais[0].referencia}. Escolhe outra.`
        },
        { status: 409 }
      );
    }

    const payload = {
      referencia,
      nome,
      categoria: (corpo.categoria || "").trim() || null,
      unidade,
      stock_minimo: Number.isFinite(minimo) && corpo.stock_minimo !== "" ? arred2(minimo) : 0,
      localizacao: (corpo.localizacao || "").trim() || null,
      preco_mzn: Number.isFinite(preco) && corpo.preco_mzn !== "" ? arred2(preco) : null
    };

    if (corpo.action === "criar") {
      const criado = await insert<Material & { id: string }>("materiais", {
        ...payload,
        ativo: true
      });
      return NextResponse.json({ ok: true, id: criado[0]?.id });
    }

    if (!corpo.id) {
      return NextResponse.json({ ok: false, erro: "Material não indicado." }, { status: 400 });
    }
    // EDITAR não toca no ativo: editar um material inactivo não pode
    // reactivá-lo em silêncio (quem decide é o toggle Mostrar inactivas).
    await update("materiais", `id=eq.${corpo.id}`, payload);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, `stock materiais POST ${corpo.action}`);
  }
}
