/**
 * /api/ferramentaria/danos - Gestão dos danos (tabela tool_damage).
 *
 * GET: todos os danos com a ferramenta resolvida.
 * PATCH (?id=): { accao: "avancar" | "inutilizar" }.
 *   - avancar: reportado -> em reparo -> reparado (grava resolved_at ao
 *     chegar a reparado). NOVIDADE sincronizada: quando o dano fecha
 *     reparado e a ferramenta ainda está "avariado", volta a "bom" (o
 *     hub deixava a ferramenta avariada para sempre, reparação invisível).
 *   - inutilizar: fecha o dano (resolved_at) e marca a ferramenta
 *     "inutilizado" (o hub não tocava nela).
 */

import { NextResponse, NextRequest } from "next/server";
import { queryTudo, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  proximoStatusDano,
  type DanoVisao,
  type Ferramenta
} from "@/lib/ferramentaria";

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "ferramentaria",
    "ferramentaria.danos",
    "ferramentaria.relatorios"
  ]);
  if (eErro(auth)) return auth;
  try {
    const [danos, ferramentas] = await Promise.all([
      queryTudo<DanoVisao>("tool_damage", "select=*&order=created_at.desc"),
      queryTudo<Ferramenta>("tools", "select=id,code,nome&order=code.asc")
    ]);
    const mapa = new Map(ferramentas.map((t) => [t.id, t]));
    const visao = danos.map((d) => {
      const t = d.tool_id ? mapa.get(d.tool_id) : undefined;
      return { ...d, code: t?.code || null, nome: t?.nome || null };
    });
    return NextResponse.json({ ok: true, danos: visao });
  } catch (e) {
    return erroBase(e, "ferramentaria danos GET");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("ferramentaria.danos", "mexer");
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Id do dano em falta." }, { status: 400 });
    }
    const corpo = (await req.json()) as { accao?: string };

    const linhas = await queryTudo<DanoVisao>(
      "tool_damage",
      `select=*&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    const dano = linhas[0];
    if (!dano) {
      return NextResponse.json({ ok: false, erro: "Dano não encontrado." }, { status: 404 });
    }

    if (corpo.accao === "avancar") {
      const novo = proximoStatusDano(dano.status);
      if (!novo) {
        return NextResponse.json(
          { ok: false, erro: "Este dano já está fechado." },
          { status: 409 }
        );
      }
      const dados: Record<string, unknown> = { status: novo };
      if (novo === "reparado") dados.resolved_at = new Date().toISOString();
      await update("tool_damage", `id=eq.${encodeURIComponent(id)}`, dados);

      // A reparação volta a contar no inventário.
      if (novo === "reparado" && dano.tool_id) {
        const tools = await queryTudo<Ferramenta>(
          "tools",
          `select=id,estado&id=eq.${encodeURIComponent(dano.tool_id)}&limit=1`
        );
        if (tools[0] && (tools[0].estado || "").toLowerCase() === "avariado") {
          await update("tools", `id=eq.${encodeURIComponent(dano.tool_id)}`, { estado: "bom" });
        }
      }
      return NextResponse.json({ ok: true, status: novo });
    }

    if (corpo.accao === "inutilizar") {
      await update("tool_damage", `id=eq.${encodeURIComponent(id)}`, {
        status: "inutilizado",
        resolved_at: new Date().toISOString()
      });
      if (dano.tool_id) {
        await update(
          "tools",
          `id=eq.${encodeURIComponent(dano.tool_id)}`,
          { estado: "inutilizado" }
        );
      }
      return NextResponse.json({ ok: true, status: "inutilizado" });
    }

    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  } catch (e) {
    return erroBase(e, "ferramentaria danos PATCH");
  }
}
