/**
 * /api/escalas/folgas - folgas guardadas que a gente acumula.
 *
 * GET    : lista completa + o registo (para escolher a pessoa).
 * POST   : nova folga guardada (valor aceita 0.5, origem e obs).
 * PATCH  : gozo (marca a data, pode já apontar Folga na escala),
 *          cancelar ou voltar a guardar.
 */

import { NextResponse } from "next/server";
import { del, insert, update, upsert } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { eCodigoValido, eFaltaSQL, hojeEsc, problemaFolga } from "@/lib/escalas";
import { carregarBase } from "@/lib/escalas-server";

function faltaSQL(e: unknown) {
  return NextResponse.json(
    {
      ok: false,
      erro: "As tabelas da Escala ainda não existem na base. Cola o sql/fase9-escalas.sql no Supabase."
    },
    { status: 503 }
  );
}

export async function GET() {
  const auth = await autorizado("escalas.folgas", "ver");
  if (eErro(auth)) return auth;
  try {
    const base = await carregarBase();
    if (base.sqlFalta) {
      return NextResponse.json({ ok: true, sqlFalta: true, folgas: [], colaboradores: [] });
    }
    return NextResponse.json({
      ok: true,
      hoje: hojeEsc(),
      folgas: base.folgas,
      colaboradores: base.colaboradores
    });
  } catch (e) {
    return erroBase(e, "escalas folgas GET");
  }
}

export async function POST(request: Request) {
  const auth = await autorizado("escalas.folgas", "mexer");
  if (eErro(auth)) return auth;
  try {
    const c = (await request.json()) as {
      colaborador_id?: string;
      valor?: number | string;
      data_origem?: string;
      obs?: string;
    };
    if (!c.colaborador_id) {
      return NextResponse.json({ ok: false, erro: "Escolhe a pessoa." }, { status: 400 });
    }
    const problema = problemaFolga(c);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }
    const criadas = await insert("esc_folgas", [
      {
        colaborador_id: c.colaborador_id,
        valor: Number(c.valor),
        data_origem: c.data_origem || null,
        estado: "guardada",
        obs: c.obs?.trim() || null,
        criado_por: auth.utilizador.nome
      }
    ]);
    return NextResponse.json({ ok: true, folga: criadas[0] });
  } catch (e) {
    if (eFaltaSQL(e)) return faltaSQL(e);
    return erroBase(e, "escalas folgas POST");
  }
}

export async function PATCH(request: Request) {
  const auth = await autorizado("escalas.folgas", "mexer");
  if (eErro(auth)) return auth;
  try {
    const c = (await request.json()) as {
      id?: string;
      acao?: string;
      data_gozo?: string;
      apontarEscala?: boolean;
    };
    if (!c.id || !c.acao) {
      return NextResponse.json({ ok: false, erro: "Falta o id ou a acção." }, { status: 400 });
    }
    const dataGozo = c.data_gozo || hojeEsc();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataGozo)) {
      return NextResponse.json({ ok: false, erro: "Data de gozo inválida." }, { status: 400 });
    }

    if (c.acao === "gozo") {
      const linhas = await update("esc_folgas", `id=eq.${c.id}`, {
        estado: "usada",
        data_gozo: dataGozo
      });
      const folga = linhas[0];
      if (folga && c.apontarEscala && eCodigoValido("Folga")) {
        await upsert(
          "esc_dias",
          [{ colaborador_id: folga.colaborador_id, data: dataGozo, codigo: "Folga" }],
          "colaborador_id,data"
        );
      }
      return NextResponse.json({ ok: true, folga });
    }
    if (c.acao === "cancelar") {
      const linhas = await update("esc_folgas", `id=eq.${c.id}`, {
        estado: "cancelada",
        data_gozo: null
      });
      return NextResponse.json({ ok: true, folga: linhas[0] });
    }
    if (c.acao === "voltar") {
      const linhas = await update("esc_folgas", `id=eq.${c.id}`, {
        estado: "guardada",
        data_gozo: null
      });
      return NextResponse.json({ ok: true, folga: linhas[0] });
    }
    if (c.acao === "apagar") {
      await del("esc_folgas", c.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  } catch (e) {
    if (eFaltaSQL(e)) return faltaSQL(e);
    return erroBase(e, "escalas folgas PATCH");
  }
}
