/**
 * /api/ferramentaria/devolucoes - Registar devolução (a peça mais
 * delicada do módulo).
 *
 * POST: o hub fazia aqui QUATRO operações do navegador (gravar linha de
 *       devolução, actualizar a linha de empréstimo, mudar o estado da
 *       ferramenta, criar dano) e qualquer falha a meio deixava dados a
 *       meio. Agora as 4 acontecem no SERVIDOR, nesta ordem:
 *       1. lê e confere o empréstimo (recusa devolução repetida);
 *       2. grava a linha tipo=devolucao (histórico);
 *       3. actualiza a linha do empréstimo (deixa de estar activo);
 *       4. devolve a última unidade a casa: com 0 empréstimos activos
 *          restantes, o inventário recebe o estado do juiz único
 *          estadoAposDevolucao (bom/avariado/inutilizado); com unidades
 *          ainda fora, o estado fica "emprestado" (o hub mudava mesmo
 *          assim e mostrava disponível com gente na rua);
 *       5. se o estado é desastre (torto/partido/avariado/perdido),
 *          cria o registo de dano (sujo/desgastado são conservação, não
 *          dano: o juiz único geraDano).
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import {
  estadoAposDevolucao,
  geraDano,
  problemaDevolucao,
  type Dano,
  type Ferramenteiro,
  type Movimento
} from "@/lib/ferramentaria";

export async function POST(req: NextRequest) {
  const auth = await autorizado("ferramentaria.emprestimos", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      movimentoId?: string;
      estadoVoltar?: string;
      recebidoPorId?: string;
      observacoes?: string;
    };

    if (!corpo.movimentoId?.trim()) {
      return NextResponse.json({ ok: false, erro: "Empréstimo não identificado." }, { status: 400 });
    }
    const problema = problemaDevolucao({
      estadoVoltar: corpo.estadoVoltar,
      recebidoPorId: corpo.recebidoPorId
    });
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const id = corpo.movimentoId.trim();
    const emprestimos = await queryTudo<Movimento>(
      "tool_movements",
      `select=*&id=eq.${encodeURIComponent(id)}&limit=1`
    );
    const mov = emprestimos[0];
    if (!mov) {
      return NextResponse.json({ ok: false, erro: "Empréstimo não encontrado." }, { status: 404 });
    }
    if (mov.tipo !== "emprestimo" || mov.data_devolucao) {
      return NextResponse.json(
        { ok: false, erro: "Este empréstimo já foi devolvido." },
        { status: 409 }
      );
    }

    const estadoVoltar = corpo.estadoVoltar!.trim().toLowerCase();
    const observacoes = corpo.observacoes?.trim() || null;
    const agora = new Date().toISOString();

    // Nome de quem recebe vem da BASE.
    const staff = await queryTudo<Ferramenteiro>(
      "tool_staff",
      `select=id,nome&id=eq.${encodeURIComponent(corpo.recebidoPorId!.trim())}&limit=1`
    );
    const recebidoPor = staff[0]?.nome || "";

    // 2. Linha de devolução para o histórico (mesmo modelo do hub: as
    //    devoluções vivem em tool_movements tipo=devolucao).
    await insert<Movimento>("tool_movements", {
      tool_id: mov.tool_id,
      tipo: "devolucao",
      colaborador: mov.colaborador,
      departamento: mov.departamento,
      os_id: mov.os_id,
      equipamento_id: mov.equipamento_id,
      estado_ao_voltar: estadoVoltar,
      recebido_por: recebidoPor,
      observacoes_devolucao: observacoes,
      data_saida: mov.data_saida,
      data_devolucao: agora,
      prazo_devolucao: mov.prazo_devolucao
    });

    // 3. A linha do empréstimo deixa de estar activa.
    await update<Movimento>(
      "tool_movements",
      `id=eq.${encodeURIComponent(id)}`,
      {
        data_devolucao: agora,
        estado_ao_voltar: estadoVoltar,
        recebido_por: recebidoPor,
        observacoes_devolucao: observacoes
      }
    );

    // 4. Inventário sincronizado: só quando a rua fica vazia.
    const restantes = await queryTudo<Movimento>(
      "tool_movements",
      `select=id&tool_id=eq.${encodeURIComponent(mov.tool_id)}&tipo=eq.emprestimo&data_devolucao=is.null`
    );
    let novoEstado: string | null = null;
    if (restantes.length === 0) {
      novoEstado = estadoAposDevolucao(estadoVoltar);
      await update(
        "tools",
        `id=eq.${encodeURIComponent(mov.tool_id)}`,
        { estado: novoEstado }
      );
    }

    // 5. Dano só para desastres (o hub tinha dois juízes contraditórios).
    let dano: Dano | null = null;
    if (geraDano(estadoVoltar)) {
      const [criado] = await insert<Dano>("tool_damage", {
        tool_id: mov.tool_id,
        movement_id: id,
        estado_reportado: estadoVoltar,
        status: "reportado",
        colaborador: mov.colaborador,
        observacoes: observacoes || `Devolucao com problema - ${estadoVoltar}`
      });
      dano = criado;
    }

    return NextResponse.json({ ok: true, novoEstado, dano });
  } catch (e) {
    return erroBase(e, "ferramentaria devolucoes POST");
  }
}
