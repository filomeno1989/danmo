/**
 * /api/ferramentaria/emprestimos - Registar empréstimo (tool_movements).
 *
 * POST: valida com o juiz problemaEmprestimo, resolve o nome do
 *       ferramenteiro PELA BASE (o hub copiava do navegador) e
 *       REVALIDA a disponibilidade no momento de gravar (a verificação
 *       só do navegador deixava duas pessoas levar a mesma unidade).
 *       Sem unidades, responde 409 com a lista de quem tem a ferramenta
 *       (o ecrã abre o popup "Está com..."). Grava com estado_ao_sair
 *       real da ferramenta e, se for a última unidade a sair, marca
 *       estado=emprestado no inventário.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import {
  disponibilidadeDe,
  problemaEmprestimo,
  type Ferramenta,
  type Ferramenteiro,
  type Movimento
} from "@/lib/ferramentaria";

export async function POST(req: NextRequest) {
  const auth = await autorizado("ferramentaria.emprestimos", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      ferramentaCode?: string;
      colaborador?: string;
      departamento?: string;
      os_id?: string;
      equipamento_id?: string;
      prazo?: string;
      entreguePorId?: string;
      observacoes?: string;
    };

    const problema = problemaEmprestimo({
      ferramentaCode: corpo.ferramentaCode,
      colaborador: corpo.colaborador,
      departamento: corpo.departamento,
      prazo: corpo.prazo,
      entreguePorId: corpo.entreguePorId
    });
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const code = corpo.ferramentaCode!.trim();
    const todas = await queryTudo<Ferramenta>("tools", "select=*&active=eq.true");
    const ferramenta = todas.find((t) => (t.code || "").trim().toUpperCase() === code.toUpperCase());
    if (!ferramenta) {
      return NextResponse.json(
        { ok: false, erro: `Ferramenta com o código ${code} não existe ou está desactivada.` },
        { status: 404 }
      );
    }

    // Nome do ferramenteiro vem da BASE (fonte única), nunca do navegador.
    const staff = await queryTudo<Ferramenteiro>(
      "tool_staff",
      `select=id,nome&active=eq.true&id=eq.${encodeURIComponent(corpo.entreguePorId!.trim())}`
    );
    if (staff.length === 0) {
      return NextResponse.json(
        { ok: false, erro: "Ferramenteiro que entrega não encontrado ou desactivado." },
        { status: 400 }
      );
    }

    // Disponibilidade REVALIDADA agora (a base é que manda).
    const activos = await queryTudo<Movimento>(
      "tool_movements",
      `select=*&tool_id=eq.${encodeURIComponent(ferramenta.id)}&tipo=eq.emprestimo&data_devolucao=is.null&order=data_saida.asc`
    );
    const disp = disponibilidadeDe(ferramenta, activos);
    if (disp.disponivel <= 0) {
      return NextResponse.json(
        {
          ok: false,
          erro: `${ferramenta.code} - ${ferramenta.nome} não tem unidades disponíveis (${disp.emprestadas}/${disp.total} emprestadas).`,
          indisponivel: {
            code: ferramenta.code,
            nome: ferramenta.nome,
            total: disp.total,
            emprestadas: disp.emprestadas,
            com: disp.activos.map((m) => ({
              id: m.id,
              colaborador: m.colaborador || "Colaborador não identificado",
              departamento: m.departamento || "-",
              os_id: m.os_id,
              equipamento_id: m.equipamento_id,
              data_saida: m.data_saida
            }))
          }
        },
        { status: 409 }
      );
    }

    const [criado] = await insert<Movimento>("tool_movements", {
      tool_id: ferramenta.id,
      tipo: "emprestimo",
      colaborador: corpo.colaborador!.trim(),
      departamento: corpo.departamento!.trim(),
      os_id: corpo.os_id?.trim() || null,
      equipamento_id: corpo.equipamento_id?.trim() || null,
      estado_ao_sair: ferramenta.estado || "bom",
      entregue_por: staff[0].nome,
      data_saida: new Date().toISOString(),
      prazo_devolucao: corpo.prazo!.trim(),
      observacoes_saida: corpo.observacoes?.trim() || null
    });

    // Última unidade a sair: o inventário passa a "emprestado".
    // Com quantidade maior, o estado não é um bom indicador (não diz
    // "3 de 5 fora") e fica como está, igual ao hub.
    if (disp.disponivel <= 1) {
      await update<Ferramenta>(
        "tools",
        `id=eq.${encodeURIComponent(ferramenta.id)}`,
        { estado: "emprestado" }
      );
    }

    return NextResponse.json({ ok: true, emprestimo: criado });
  } catch (e) {
    return erroBase(e, "ferramentaria emprestimos POST");
  }
}
