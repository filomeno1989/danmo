/**
 * /api/ferramentaria/painel - Resumo executivo da Ferramentaria.
 *
 * GET: as 3 fontes do painel (ferramentas, movimentos, danos) com dados
 *      já resolvidos no servidor. Degradação honesta: se uma fonte
 *      falhar, as outras seguem e a resposta traz "faltas" com os nomes
 *      do que ficou para trás (o hub já fazia allSettled, mantivemos a
 *      ideia e o aviso).
 */

import { NextResponse } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import { hojeFerr, type DanoVisao, type Ferramenta, type MovimentoVisao } from "@/lib/ferramentaria";

const PAGINAS_PAINEL = [
  "ferramentaria",
  "ferramentaria.inventario",
  "ferramentaria.emprestimos",
  "ferramentaria.devolucoes",
  "ferramentaria.danos",
  "ferramentaria.ferramenteiros",
  "ferramentaria.relatorios",
  "ferramentaria.configuracoes"
];

export async function GET() {
  const auth = await autorizadoEmAlguma(PAGINAS_PAINEL);
  if (eErro(auth)) return auth;
  try {
    const faltas: string[] = [];

    const [resMov, resTools, resDanos] = await Promise.allSettled([
      queryTudo<MovimentoVisao>("tool_movements", "select=*&order=data_saida.desc"),
      queryTudo<Ferramenta>("tools", "select=*&order=code.asc"),
      queryTudo<DanoVisao>("tool_damage", "select=*&order=created_at.desc")
    ]);

    let movimentos: MovimentoVisao[] = [];
    if (resMov.status === "fulfilled") {
      movimentos = resMov.value;
    } else {
      faltas.push("movimentos");
      console.error("[ferramentaria painel] tool_movements:", resMov.reason);
    }

    let ferramentas: Ferramenta[] = [];
    if (resTools.status === "fulfilled") {
      ferramentas = resTools.value;
    } else {
      faltas.push("ferramentas");
      console.error("[ferramentaria painel] tools:", resTools.reason);
    }

    let danos: DanoVisao[] = [];
    if (resDanos.status === "fulfilled") {
      danos = resDanos.value;
    } else {
      faltas.push("danos");
      console.error("[ferramentaria painel] tool_damage:", resDanos.reason);
    }

    const mapaTools = new Map(ferramentas.map((t) => [t.id, t]));
    const movimentosVisao = movimentos.map((m) => {
      const t = mapaTools.get(m.tool_id);
      return { ...m, code: t?.code || null, nome: t?.nome || null };
    });
    const danosVisao = danos.map((d) => {
      const t = d.tool_id ? mapaTools.get(d.tool_id) : undefined;
      return { ...d, code: t?.code || null, nome: t?.nome || null };
    });

    return NextResponse.json({
      ok: true,
      hoje: hojeFerr(),
      ferramentas,
      movimentos: movimentosVisao,
      danos: danosVisao,
      faltas
    });
  } catch (e) {
    return erroBase(e, "ferramentaria painel GET");
  }
}
