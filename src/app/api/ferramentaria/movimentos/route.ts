/**
 * /api/ferramentaria/movimentos - Linhas de tool_movements com a
 * ferramenta JÁ resolvida (code/nome) no servidor.
 *
 * GET (filtros opcionais):
 *   ?tool_id=UUID   histórico de uma ferramenta (modal do Inventário)
 *   ?tipo=emprestimo|devolucao
 *   ?de=AAAA-MM-DD  janela por data_saida (relatórios)
 *   ?ate=AAAA-MM-DD
 *
 * Serve Empréstimos (activos), Devoluções (histórico), Relatórios,
 * Painel (alternativa ao painel quando só os movimentos faltam) e o
 * Histórico do Inventário: o navegador nunca calcula o nome.
 */

import { NextResponse, NextRequest } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import { type Ferramenta, type MovimentoVisao } from "@/lib/ferramentaria";

const PAGINAS_MOVIMENTOS = [
  "ferramentaria",
  "ferramentaria.inventario",
  "ferramentaria.emprestimos",
  "ferramentaria.devolucoes",
  "ferramentaria.danos",
  "ferramentaria.relatorios"
];

export async function GET(req: NextRequest) {
  const auth = await autorizadoEmAlguma(PAGINAS_MOVIMENTOS);
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const partes: string[] = ["select=*"];

    const toolId = (searchParams.get("tool_id") || "").trim();
    if (toolId) partes.push(`tool_id=eq.${encodeURIComponent(toolId)}`);

    const tipo = (searchParams.get("tipo") || "").trim();
    if (tipo === "emprestimo" || tipo === "devolucao") partes.push(`tipo=eq.${tipo}`);

    const de = (searchParams.get("de") || "").trim();
    const ate = (searchParams.get("ate") || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(de)) partes.push(`data_saida=gte.${de}T00:00:00`);
    if (/^\d{4}-\d{2}-\d{2}$/.test(ate)) partes.push(`data_saida=lte.${ate}T23:59:59`);

    partes.push("order=data_saida.desc,id.desc");
    const linhas = await queryTudo<MovimentoVisao>("tool_movements", partes.join("&"));

    // Resolve code/nome das ferramentas tocadas (uma leitura só).
    const ids = [...new Set(linhas.map((m) => m.tool_id).filter(Boolean))];
    let ferramentas: Ferramenta[] = [];
    if (ids.length > 0) {
      ferramentas = await queryTudo<Ferramenta>(
        "tools",
        `select=id,code,nome&id=in.(${ids.map(encodeURIComponent).join(",")})`
      );
    }
    const mapa = new Map(ferramentas.map((t) => [t.id, t]));
    const visao = linhas.map((m) => {
      const t = mapa.get(m.tool_id);
      return { ...m, code: t?.code || null, nome: t?.nome || null };
    });

    return NextResponse.json({ ok: true, movimentos: visao });
  } catch (e) {
    return erroBase(e, "ferramentaria movimentos GET");
  }
}
