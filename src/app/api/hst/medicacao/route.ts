/**
 * /api/hst/medicacao - A MEDICACAO de quem está no controle da tensão.
 *
 * Regista o medicamento que a pessoa está a fazer (nome, dosagem, data
 * de início, se a tomada é regular). A ficha da pessoa mostra a
 * estatística da tensão desde o início de cada medicação, comparada com
 * o período antes dela, calculada das medições que já constam.
 *
 * GET: lista (com ?colab=Nome devolve só essa pessoa).
 * POST: nova medicação.
 * PATCH ?id: edita campos ou pausa/retoma (activo=false NÃO apaga nada:
 *            o histórico da medicação fica na base).
 * DELETE ?id: só para engano de escrita, com permissão de apagar.
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, queryTudo, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import type { MedicacaoTensaoHST } from "@/lib/hst";

export async function GET(req: NextRequest) {
  const auth = await autorizadoEmAlguma(["hst", "hst.tensao", "hst.relatorios"]);
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const colab = (searchParams.get("colab") || "").trim();
    const filtro = colab
      ? `select=*&colaborador_nome=eq.${encodeURIComponent(colab)}&order=activo.desc,desde.desc,id.desc`
      : "select=*&order=activo.desc,desde.desc,id.desc";
    const medicacao = await queryTudo<MedicacaoTensaoHST>(
      "hst_tensao_medicacao",
      filtro
    );
    return NextResponse.json({ ok: true, medicacao });
  } catch (e) {
    return erroBase(e, "hst medicacao GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("hst.tensao", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      colaborador_id?: number | null;
      colaborador_nome?: string;
      medicamento?: string;
      dosagem?: string;
      desde?: string;
      regular?: boolean;
      observacoes?: string;
    };
    const nome = corpo.colaborador_nome?.trim();
    const medicamento = corpo.medicamento?.trim();
    if (!nome) {
      return NextResponse.json({ ok: false, erro: "Indica o colaborador." }, { status: 400 });
    }
    if (!medicamento) {
      return NextResponse.json({ ok: false, erro: "Indica o medicamento." }, { status: 400 });
    }
    if (!corpo.desde || !/^\d{4}-\d{2}-\d{2}$/.test(corpo.desde)) {
      return NextResponse.json({ ok: false, erro: "Indica a data de início da medicação." }, { status: 400 });
    }
    const [linha] = await insert<MedicacaoTensaoHST>("hst_tensao_medicacao", {
      colaborador_id: corpo.colaborador_id ?? null,
      colaborador_nome: nome,
      medicamento,
      dosagem: corpo.dosagem?.trim() || null,
      desde: corpo.desde,
      regular: corpo.regular !== false,
      observacoes: corpo.observacoes?.trim() || null,
      criado_por: auth.utilizador.nome
    });
    return NextResponse.json({ ok: true, medicacao: linha });
  } catch (e) {
    return erroBase(e, "hst medicacao POST");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("hst.tensao", "mexer");
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Id da medicação em falta." }, { status: 400 });
    }
    const corpo = (await req.json()) as {
      medicamento?: string;
      dosagem?: string;
      desde?: string;
      regular?: boolean;
      activo?: boolean;
      observacoes?: string;
    };
    const dados: Record<string, unknown> = {};
    if (corpo.medicamento?.trim()) dados.medicamento = corpo.medicamento.trim();
    if (corpo.dosagem !== undefined) dados.dosagem = corpo.dosagem?.trim() || null;
    if (corpo.desde && /^\d{4}-\d{2}-\d{2}$/.test(corpo.desde)) dados.desde = corpo.desde;
    if (corpo.regular !== undefined) dados.regular = corpo.regular === true;
    if (corpo.activo !== undefined) dados.activo = corpo.activo === true;
    if (corpo.observacoes !== undefined) dados.observacoes = corpo.observacoes?.trim() || null;
    if (Object.keys(dados).length === 0) {
      return NextResponse.json({ ok: false, erro: "Nada para alterar." }, { status: 400 });
    }
    const [linha] = await update<MedicacaoTensaoHST>(
      "hst_tensao_medicacao",
      `id=eq.${id}`,
      dados
    );
    return NextResponse.json({ ok: true, medicacao: linha });
  } catch (e) {
    return erroBase(e, "hst medicacao PATCH");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autorizado("hst.tensao", "apagar");
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Id da medicação em falta." }, { status: 400 });
    }
    await del("hst_tensao_medicacao", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "hst medicacao DELETE");
  }
}
