/**
 * /api/stock/relatorios - Os 3 relatórios do Stock.
 *
 * GET ?rel=inventario|movimentos|compras&...
 *
 * 1. inventario  (sem datas): todos os materiais activos com stock,
 *    mínimo, estado e localização; filtros de categoria e estado.
 * 2. movimentos  (de, ate): movimentos confirmados do período, com
 *    filtros de tipo e material + totais de quantidade.
 * 3. compras     (de, ate): entradas confirmadas do período, com
 *    fornecedor opcional; agrupamento por fornecedor e gasto total.
 *
 * Tudo calculado no servidor: os relatórios exportados para Excel e PDF
 * mostram exactamente os números que aqui saem.
 */

import { NextResponse, NextRequest } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizadoStock, eErro, erroBase } from "@/lib/guarda-api";
import { calcularPosicoes, estadoPosicao, normalizar } from "@/lib/stock";
import type { Material, MovimentoStock } from "@/lib/stock";

const arred2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: NextRequest) {
  const auth = await autorizadoStock("stock.relatorios", "ver");
  if (eErro(auth)) return auth;

  const url = new URL(req.url);
  const rel = url.searchParams.get("rel") || "inventario";
  const de = (url.searchParams.get("de") || "").slice(0, 10);
  const ate = (url.searchParams.get("ate") || "").slice(0, 10);
  const tipo = url.searchParams.get("tipo") || "";
  const materialId = url.searchParams.get("material") || "";
  const fornecedor = url.searchParams.get("fornecedor") || "";
  const categoria = url.searchParams.get("categoria") || "";
  const estadoFiltro = url.searchParams.get("estado") || "";

  try {
    const [movimentos, materiais] = await Promise.all([
      queryTudo<MovimentoStock>("stock_movimentos", "select=*&estado=eq.confirmado"),
      queryTudo<Material>("materiais", "select=*&order=referencia.asc")
    ]);
    const mapaMat = new Map(materiais.map((m) => [m.id, m]));

    /* ---------- 1. Inventário actual ---------- */
    if (rel === "inventario") {
      const posicoes = calcularPosicoes(movimentos);
      let lista = materiais.filter((m) => m.ativo !== false);
      if (categoria) lista = lista.filter((m) => m.categoria === categoria);
      const linhas = lista.map((m) => {
        const stock = posicoes[m.id] || 0;
        return {
          id: m.id,
          referencia: m.referencia,
          nome: m.nome,
          categoria: m.categoria || null,
          unidade: m.unidade,
          localizacao: m.localizacao || null,
          minimo: Number(m.stock_minimo) || 0,
          stock,
          estado: estadoPosicao(stock, m.stock_minimo)
        };
      });
      const filtrada = estadoFiltro ? linhas.filter((l) => l.estado === estadoFiltro) : linhas;
      const kpis = {
        total: linhas.length,
        ok: linhas.filter((l) => l.estado === "OK").length,
        baixo: linhas.filter((l) => l.estado === "Stock Baixo").length,
        esgotado: linhas.filter((l) => l.estado === "Esgotado").length
      };
      return NextResponse.json({ ok: true, linhas: filtrada, kpis, materiais });
    }

    /* ---------- 2. Movimentos por período ---------- */
    if (rel === "movimentos") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
        return NextResponse.json(
          { ok: false, erro: "Escolhe as datas do período (De e Até)." },
          { status: 400 }
        );
      }
      let lista = movimentos.filter(
        (m) => m.data_movimento >= de && m.data_movimento <= ate
      );
      if (tipo) lista = lista.filter((m) => m.tipo === tipo);
      if (materialId) lista = lista.filter((m) => m.material_id === materialId);
      lista.sort((a, b) =>
        (b.data_movimento || "").localeCompare(a.data_movimento || "") ||
        (b.criado_em || "").localeCompare(a.criado_em || "")
      );
      const entradas = lista.filter((m) => m.tipo === "entrada");
      const saidas = lista.filter((m) => m.tipo === "saida");
      return NextResponse.json({
        ok: true,
        linhas: lista,
        kpis: {
          totalEntradas: entradas.length,
          totalSaidas: saidas.length,
          qtdEntradas: arred2(entradas.reduce((s, m) => s + (Number(m.quantidade) || 0), 0)),
          qtdSaidas: arred2(saidas.reduce((s, m) => s + (Number(m.quantidade) || 0), 0))
        },
        materiais
      });
    }

    /* ---------- 3. Resumo de compras ---------- */
    if (rel === "compras") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) {
        return NextResponse.json(
          { ok: false, erro: "Escolhe as datas do período (De e Até)." },
          { status: 400 }
        );
      }
      let compras = movimentos.filter(
        (m) => m.tipo === "entrada" && m.data_movimento >= de && m.data_movimento <= ate
      );
      if (fornecedor) {
        const alvo = normalizar(fornecedor);
        compras = compras.filter((m) => normalizar(m.fornecedor) === alvo);
      }
      compras.sort((a, b) =>
        (b.data_movimento || "").localeCompare(a.data_movimento || "") ||
        (b.criado_em || "").localeCompare(a.criado_em || "")
      );
      const totalGasto = arred2(
        compras.reduce(
          (s, m) => s + (Number(m.preco_unitario) || 0) * (Number(m.quantidade) || 0),
          0
        )
      );
      const mapaForn = new Map<string, { count: number; total: number }>();
      for (const m of compras) {
        const f = m.fornecedor || "Sem fornecedor";
        if (!mapaForn.has(f)) mapaForn.set(f, { count: 0, total: 0 });
        const l = mapaForn.get(f)!;
        l.count += 1;
        l.total = arred2(l.total + (Number(m.preco_unitario) || 0) * (Number(m.quantidade) || 0));
      }
      const porFornecedor = [...mapaForn.entries()]
        .map(([fornecedor, v]) => ({ fornecedor, ...v }))
        .sort((a, b) => b.total - a.total);
      return NextResponse.json({
        ok: true,
        linhas: compras,
        porFornecedor,
        kpis: { total: compras.length, totalGasto },
        materiais
      });
    }

    return NextResponse.json({ ok: false, erro: "Relatório desconhecido." }, { status: 400 });
  } catch (e) {
    return erroBase(e, `stock relatorios GET ${rel}`);
  }
}
