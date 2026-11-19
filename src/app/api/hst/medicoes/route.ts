/**
 * /api/hst/medicoes - Medições de tensão arterial (Portal HST).
 *
 * GET: medições completas (para as fichas e os relatórios). As medidas
 *      novas chegam com a classificação calculada no SERVIDOR com a
 *      cascata correcta (o hub calculava no navegador com um "||" que
 *      trocava graus: 150/70 aparecia "Limítrofe" em vez de HTA Grau 1).
 * POST: cria medição. Valores validados (60-260 / 40-160 / diastólica <
 *      sistólica). A tabela hst_medicoes_tensao NÃO tem coluna
 *      colaborador_id (comprovado na base real, bug 71ccfe8: o POST
 *      morria com "Could not find the 'colaborador_id' column"), por
 *      isso gravamos só o nome; a ligação ao colaborador da sessão é
 *      feita na leitura, pelo nome, sem SQL novo.
 * PATCH: edita uma medição (o pedido do Filomeno: antes só dava apagar
 *      e lançar de novo). A classificação é recalculada no SERVIDOR e a
 *      medição NUNCA nasce nova: é a mesma linha, mesmo id, mesmo
 *      "medido por" de quem mediu.
 * DELETE: apaga uma medição errada (o hub não deixava apagar nada:
 *       só a limpeza nuclear de todas as tabelas).
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, queryTudo, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  classificarTensao,
  problemaValoresTensao,
  type MedicaoTensaoHST
} from "@/lib/hst";

export async function GET() {
  const auth = await autorizadoEmAlguma(["hst", "hst.tensao", "hst.relatorios"]);
  if (eErro(auth)) return auth;
  try {
    const medicoes = await queryTudo<MedicaoTensaoHST>(
      "hst_medicoes_tensao",
      "select=*&order=data_medicao.desc,id.desc"
    );
    return NextResponse.json({ ok: true, medicoes });
  } catch (e) {
    return erroBase(e, "hst medicoes GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("hst.tensao", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      colaborador_nome?: string;
      sistolica?: number;
      diastolica?: number;
      frequencia_cardiaca?: number | null;
      observacoes?: string;
      data_medicao?: string; // datetime-local; ausente = agora (default da base)
    };
    const sys = Number(corpo.sistolica);
    const dia = Number(corpo.diastolica);
    const fc =
      corpo.frequencia_cardiaca != null
        ? Number(corpo.frequencia_cardiaca)
        : null;
    if (!corpo.colaborador_nome?.trim()) {
      return NextResponse.json({ ok: false, erro: "Indica o colaborador." }, { status: 400 });
    }
    const problema = problemaValoresTensao(sys, dia, fc);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const nome = corpo.colaborador_nome.trim();

    const dados: Record<string, unknown> = {
      colaborador_nome: nome,
      sistolica: sys,
      diastolica: dia,
      frequencia_cardiaca: fc,
      classificacao: classificarTensao(sys, dia).texto,
      medido_por: auth.utilizador.nome,
      observacoes: corpo.observacoes?.trim() || null
    };
    if (
      corpo.data_medicao &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(corpo.data_medicao)
    ) {
      dados.data_medicao = corpo.data_medicao;
    }

    const [criada] = await insert<MedicaoTensaoHST>("hst_medicoes_tensao", dados);
    return NextResponse.json({ ok: true, medicao: criada });
  } catch (e) {
    return erroBase(e, "hst medicoes POST");
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autorizado("hst.tensao", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      id?: number | string;
      sistolica?: number;
      diastolica?: number;
      frequencia_cardiaca?: number | null;
      observacoes?: string;
      data_medicao?: string;
    };
    if (!corpo.id) {
      return NextResponse.json({ ok: false, erro: "Id da medição em falta." }, { status: 400 });
    }
    const sys = Number(corpo.sistolica);
    const dia = Number(corpo.diastolica);
    const fc =
      corpo.frequencia_cardiaca != null
        ? Number(corpo.frequencia_cardiaca)
        : null;
    const problema = problemaValoresTensao(sys, dia, fc);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }
    const dados: Record<string, unknown> = {
      sistolica: sys,
      diastolica: dia,
      frequencia_cardiaca: fc,
      classificacao: classificarTensao(sys, dia).texto,
      observacoes: corpo.observacoes?.trim() || null
    };
    if (
      corpo.data_medicao &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(corpo.data_medicao)
    ) {
      dados.data_medicao = corpo.data_medicao;
    }
    const [editada] = await update<MedicaoTensaoHST>(
      "hst_medicoes_tensao",
      `id=eq.${corpo.id}`,
      dados
    );
    return NextResponse.json({ ok: true, medicao: editada });
  } catch (e) {
    return erroBase(e, "hst medicoes PATCH");
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await autorizado("hst.tensao", "apagar");
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Id da medição em falta." }, { status: 400 });
    }
    await del("hst_medicoes_tensao", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "hst medicoes DELETE");
  }
}
