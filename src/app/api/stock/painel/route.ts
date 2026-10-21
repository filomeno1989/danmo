/**
 * /api/stock/painel - Números do Painel do Stock.
 *
 * Tudo calculado no SERVIDOR a partir dos movimentos confirmados:
 * - KPIs: materiais activos, entradas/saídas do mês, alertas de mínimo,
 *   esgotados e compras do mês em MZN;
 * - série dos últimos 6 meses para o gráfico entradas/saídas;
 * - lista completa dos alertas (o antigo KPI escondia quem era);
 * - últimas 6 entradas e 6 saídas.
 *
 * Diferenças sobre o hub (registo directo): os KPIs de pendentes saem;
 * no lugar deles entra "Compras do mês (MZN)", que é o número que a
 * administração pergunta.
 */

import { NextResponse } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizadoStock, eErro, erroBase } from "@/lib/guarda-api";
import {
  calcularPosicoes,
  estadoPosicao,
  serieSeisMeses,
  MESES_PT
} from "@/lib/stock";
import type { Material, MovimentoStock } from "@/lib/stock";

function hojeISO(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function GET() {
  const auth = await autorizadoStock("ver");
  if (eErro(auth)) return auth;
  try {
    const [movimentos, materiais] = await Promise.all([
      queryTudo<MovimentoStock>("stock_movimentos", "select=*&order=criado_em.desc"),
      queryTudo<Material>("materiais", "select=*&order=referencia.asc")
    ]);

    const activos = materiais.filter((m) => m.ativo !== false);
    const posicoes = calcularPosicoes(movimentos);
    const hoje = hojeISO();
    const mes = hoje.slice(0, 7);

    const confirmados = movimentos.filter((m) => m.estado === "confirmado");
    const entradasMes = confirmados.filter(
      (m) => m.tipo === "entrada" && m.data_movimento.slice(0, 7) === mes
    );
    const saidasMes = confirmados.filter(
      (m) => m.tipo === "saida" && m.data_movimento.slice(0, 7) === mes
    );

    const alertas = activos
      .map((m) => ({
        id: m.id,
        referencia: m.referencia,
        nome: m.nome,
        unidade: m.unidade,
        stock: posicoes[m.id] || 0,
        minimo: Number(m.stock_minimo) || 0,
        estado: estadoPosicao(posicoes[m.id] || 0, m.stock_minimo)
      }))
      .filter((a) => a.estado !== "OK");

    const serie = serieSeisMeses(confirmados, new Date(), MESES_PT);

    const ultimasEntradas = confirmados
      .filter((m) => m.tipo === "entrada")
      .sort((a, b) =>
        (b.data_movimento || "").localeCompare(a.data_movimento || "") ||
        (b.criado_em || "").localeCompare(a.criado_em || "")
      )
      .slice(0, 6);
    const ultimasSaidas = confirmados
      .filter((m) => m.tipo === "saida")
      .sort((a, b) =>
        (b.data_movimento || "").localeCompare(a.data_movimento || "") ||
        (b.criado_em || "").localeCompare(a.criado_em || "")
      )
      .slice(0, 6);

    return NextResponse.json({
      ok: true,
      kpis: {
        materiais: activos.length,
        entradasMes: entradasMes.length,
        saidasMes: saidasMes.length,
        alertas: alertas.length,
        esgotados: alertas.filter((a) => a.estado === "Esgotado").length,
        comprasMes: entradasMes.reduce(
          (s, m) => s + (Number(m.preco_unitario) || 0) * (Number(m.quantidade) || 0),
          0
        )
      },
      serie,
      alertas,
      ultimasEntradas,
      ultimasSaidas,
      materiais
    });
  } catch (e) {
    return erroBase(e, "stock painel GET");
  }
}
