/**
 * /api/hst/acoes - Acções correctivas dos acidentes (Portal HST).
 *
 * GET: lista completa (juiz do prazo corre no ecrã com a lib partilhada).
 * POST: cria acção ligada a um acidente (o hub fazia isto só no
 *       navegador; aqui passa pelo mesmo juiz de validação).
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import { problemaAccao, type AccaoHST } from "@/lib/hst";

export async function GET() {
  const auth = await autorizadoEmAlguma(["hst", "hst.acidentes", "hst.relatorios"]);
  if (eErro(auth)) return auth;
  try {
    const acoes = await queryTudo<AccaoHST>(
      "hst_acoes_corretivas",
      "select=*&order=prazo.asc,id.asc"
    );
    return NextResponse.json({ ok: true, acoes });
  } catch (e) {
    return erroBase(e, "hst acoes GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("hst.acidentes", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      acidente_id?: number;
      descricao_acao?: string;
      responsavel?: string;
      prazo?: string;
      observacoes?: string;
    };
    const problema = problemaAccao(corpo);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }
    if (!corpo.acidente_id) {
      return NextResponse.json({ ok: false, erro: "Acidente em falta." }, { status: 400 });
    }
    const [acidente] = await queryTudo<{ id: number }>(
      "hst_acidentes",
      `select=id&id=eq.${corpo.acidente_id}&limit=1`
    );
    if (!acidente) {
      return NextResponse.json({ ok: false, erro: "Acidente não encontrado." }, { status: 404 });
    }
    const [criada] = await insert<AccaoHST>("hst_acoes_corretivas", {
      acidente_id: corpo.acidente_id,
      descricao_acao: String(corpo.descricao_acao).trim(),
      responsavel: String(corpo.responsavel).trim(),
      prazo: String(corpo.prazo).slice(0, 10),
      observacoes: corpo.observacoes?.trim() || null,
      status: "Pendente"
    });
    return NextResponse.json({ ok: true, accao: criada });
  } catch (e) {
    return erroBase(e, "hst acoes POST");
  }
}
