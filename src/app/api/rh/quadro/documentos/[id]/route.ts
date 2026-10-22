/**
 * /api/rh/quadro/documentos/[id] - Um anexo do arquivo de documentos.
 *
 * DELETE: apagar o anexo (o ficheiro morre com a linha; so mexer,
 * igual ao que vale para gravar). Apagar o SCAN nao muda as datas
 * que a ficha guarda - essas so saem quando se edita a ficha.
 */

import { NextResponse, NextRequest } from "next/server";
import { delFiltro } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";

type Contexto = { params: Promise<{ id: string }> };

const idSeguro = (bruto: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bruto) ? bruto : "";

export async function DELETE(_req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("rh.quadro", "mexer");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  const docId = idSeguro(id);
  if (!docId) {
    return NextResponse.json({ ok: false, erro: "Documento inválido." }, { status: 400 });
  }
  try {
    await delFiltro("rh_colaborador_documentos", `id=eq.${docId}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "rh documentos DELETE");
  }
}
