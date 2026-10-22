/**
 * /api/rh/quadro/documentos - Arquivo de documentos da ficha (scans).
 *
 * GET  ?colaborador_id=X : metadados dos anexos da ficha (sem o
 *      ficheiro, que so vem na rota /documentos/[id]/arquivo).
 * POST : anexar um scan (PDF ou foto comprimida no navegador). O
 *      servidor valida tipo, mime e tamanho OUTRA VEZ - o limite do
 *      navegador nunca e garantia.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, query } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { MAX_DOC_BYTES, TIPOS_DOCUMENTOS } from "@/lib/rh";

/** Data URL aceitavel: PDF ou imagem, em base64. */
const MIME_OK = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_DOC_BASE64 = 4_100_000; // 3 MB de ficheiro ~ 4 MB em base64

const REGEX_DATA_URL =
  /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/;

const DATA_OK = /^\d{4}-\d{2}-\d{2}$/;

type DocRow = {
  id: string;
  colaborador_id: number;
  tipo: string;
  titulo: string;
  validade: string | null;
  arquivo_nome: string;
  arquivo_tipo: string;
  arquivo_bytes: number;
  criado_em: string;
};

const CAMPOS_META =
  "id,colaborador_id,tipo,titulo,validade,arquivo_nome,arquivo_tipo,arquivo_bytes,criado_em";

const idColaboradorSeguro = (bruto: string | null) =>
  bruto && /^\d{1,10}$/.test(bruto) ? bruto : "";

export async function GET(req: NextRequest) {
  const auth = await autorizado("rh.quadro", "ver");
  if (eErro(auth)) return auth;
  const fichaId = idColaboradorSeguro(req.nextUrl.searchParams.get("colaborador_id"));
  if (!fichaId) {
    return NextResponse.json({ ok: false, erro: "Ficha inválida." }, { status: 400 });
  }
  try {
    const documentos = await query<DocRow>(
      "rh_colaborador_documentos",
      `select=${CAMPOS_META}&colaborador_id=eq.${fichaId}&order=criado_em.desc`
    );
    return NextResponse.json({ ok: true, documentos });
  } catch (e) {
    return erroBase(e, "rh documentos GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("rh.quadro", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      accao?: string;
      colaborador_id?: number;
      tipo?: string;
      titulo?: string;
      validade?: string | null;
      arquivo?: string;
      arquivo_nome?: string;
      arquivo_tipo?: string;
      arquivo_bytes?: number;
    };
    if (corpo.accao !== "anexar") {
      return NextResponse.json({ ok: false, erro: "Pedido desconhecido." }, { status: 400 });
    }
    const fichaId = Number(corpo.colaborador_id);
    if (!Number.isInteger(fichaId) || fichaId <= 0) {
      return NextResponse.json({ ok: false, erro: "Ficha inválida." }, { status: 400 });
    }
    const tipo = (corpo.tipo || "").trim();
    if (!TIPOS_DOCUMENTOS.includes(tipo)) {
      return NextResponse.json({ ok: false, erro: "Escolhe o tipo de documento." }, { status: 400 });
    }
    const validade = corpo.validade && DATA_OK.test(corpo.validade) ? corpo.validade : null;

    const m = REGEX_DATA_URL.exec(corpo.arquivo || "");
    if (!m) {
      return NextResponse.json(
        { ok: false, erro: "O ficheiro não chegou inteiro. Tenta anexar outra vez." },
        { status: 400 }
      );
    }
    const mime = m[1];
    if (!MIME_OK.includes(mime)) {
      return NextResponse.json(
        { ok: false, erro: "Só se anexam PDFs e fotos (JPG, PNG, WebP)." },
        { status: 400 }
      );
    }
    const bytesReais = Math.floor((m[2].length * 3) / 4);
    if (bytesReais > MAX_DOC_BYTES || (corpo.arquivo || "").length > MAX_DOC_BASE64) {
      return NextResponse.json(
        { ok: false, erro: "O ficheiro passou de 3 MB. Digitaliza em qualidade média ou tira uma foto." },
        { status: 413 }
      );
    }

    const nomeFicheiro = (corpo.arquivo_nome || "").trim().slice(0, 160) || tipo;
    const titulo = (corpo.titulo || "").trim().slice(0, 160) || nomeFicheiro;

    const criados = await insert<DocRow>("rh_colaborador_documentos", {
      colaborador_id: fichaId,
      tipo,
      titulo,
      validade,
      arquivo: corpo.arquivo,
      arquivo_nome: nomeFicheiro,
      arquivo_tipo: mime,
      arquivo_bytes: bytesReais
    });
    const doc = criados[0];
    return NextResponse.json({
      ok: true,
      documento: doc
        ? {
            id: doc.id,
            colaborador_id: doc.colaborador_id,
            tipo: doc.tipo,
            titulo: doc.titulo,
            validade: doc.validade,
            arquivo_nome: doc.arquivo_nome,
            arquivo_tipo: doc.arquivo_tipo,
            arquivo_bytes: doc.arquivo_bytes,
            criado_em: doc.criado_em
          }
        : null
    });
  } catch (e) {
    return erroBase(e, "rh documentos POST");
  }
}
