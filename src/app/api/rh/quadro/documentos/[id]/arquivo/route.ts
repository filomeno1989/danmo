/**
 * /api/rh/quadro/documentos/[id]/arquivo - O ficheiro do anexo.
 *
 * GET: devolve o PDF/imagen com o mime certo, para ABRIR numa tab
 * nova (e imprimir de la) ou DESCARREGAR com ?descarregar=1. So ver.
 * O ficheiro vive na linha como data URL (base64), igual as fotos.
 */

import { NextResponse, NextRequest } from "next/server";
import { query } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";

type Contexto = { params: Promise<{ id: string }> };

const idSeguro = (bruto: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(bruto) ? bruto : "";

export async function GET(req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("rh.quadro", "ver");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  const docId = idSeguro(id);
  if (!docId) {
    return NextResponse.json({ ok: false, erro: "Documento inválido." }, { status: 400 });
  }
  try {
    const linhas = await query<{
      arquivo: string;
      arquivo_nome: string;
      arquivo_tipo: string;
    }>(
      "rh_colaborador_documentos",
      `select=arquivo,arquivo_nome,arquivo_tipo&id=eq.${docId}&limit=1`
    );
    const doc = linhas[0];
    if (!doc || !doc.arquivo) {
      return NextResponse.json({ ok: false, erro: "Documento não encontrado." }, { status: 404 });
    }
    const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(doc.arquivo);
    if (!m) {
      return NextResponse.json({ ok: false, erro: "Ficheiro corrompido." }, { status: 500 });
    }
    const bytes = new Uint8Array(Buffer.from(m[2], "base64"));
    const nome = (doc.arquivo_nome || "documento").replace(/["\\\r\n]/g, " ").slice(0, 160);
    const descarregar = req.nextUrl.searchParams.get("descarregar") === "1";
    const disposicao = `${descarregar ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(nome)}`;
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": doc.arquivo_tipo || m[1],
        "Content-Disposition": disposicao,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, no-store"
      }
    });
  } catch (e) {
    return erroBase(e, "rh documentos arquivo GET");
  }
}
