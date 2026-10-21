/**
 * /api/stock/movimentos - Entradas e Saídas de material.
 *
 * GET: todos os movimentos + materiais + posições (o cliente filtra).
 * POST:
 *  - "criar": registo DIRECTO (decisão do Filomeno de 21/10). Nasce
 *    confirmado, com data_confirmacao igual à data do movimento.
 *  - "confirmar-pendente" / "rejeitar-pendente": limpeza dos pendentes
 *    antigos que já estavam na base (e porta aberta para o fluxo em
 *    2 passos, se um dia for contratado alguém para o armazém).
 *  - "apagar": só quando o histórico não fica a mentir (apagar uma
 *    entrada já consumida deixaria o stock negativo, por isso é
 *    bloqueado, igual à regra das saídas).
 *
 * Regra de ouro: o stock NUNCA fica negativo. Toda a validação acontece
 * no servidor, com a posição recalculada dos movimentos confirmados.
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, queryTudo, update } from "@/lib/supabase";
import { autorizadoStock, eErro, erroBase } from "@/lib/guarda-api";
import {
  calcularPosicoes,
  motivoBloqueioApagarEntrada,
  motivoBloqueioSaida
} from "@/lib/stock";
import type { Material, MovimentoStock } from "@/lib/stock";

function hojeISO(): string {
  const d = new Date(Date.now() + 2 * 3600 * 1000); // hora de Maputo
  return d.toISOString().slice(0, 10);
}

const arred2 = (n: number) => Math.round(n * 100) / 100;

export async function GET() {
  const auth = await autorizadoStock("ver");
  if (eErro(auth)) return auth;
  try {
    const [movimentos, materiais, colaboradores] = await Promise.all([
      queryTudo<MovimentoStock>("stock_movimentos", "select=*&order=criado_em.desc,id.desc"),
      queryTudo<Material>("materiais", "select=*&order=referencia.asc"),
      query<{ id: string; name: string; setor: string | null }>(
        "collaborators",
        "select=id,name,setor&active=eq.true&order=name.asc"
      )
    ]);
    return NextResponse.json({
      ok: true,
      movimentos,
      materiais,
      colaboradores,
      posicoes: calcularPosicoes(movimentos)
    });
  } catch (e) {
    return erroBase(e, "stock movimentos GET");
  }
}

type LinhaCriar = {
  tipo: "entrada" | "saida";
  material_id?: string;
  quantidade?: number | string;
  data_movimento?: string;
  preco_unitario?: number | string;
  fornecedor?: string;
  numero_po?: string;
  departamento?: string;
  comprador_nome?: string;
  recebedor_nome?: string;
  colaborador_nome?: string;
  finalidade?: string;
  numero_requisicao?: string;
  observacoes?: string;
};

type Corpo = {
  action: "criar" | "confirmar-pendente" | "rejeitar-pendente" | "apagar";
  id?: string;
  movimento?: LinhaCriar;
};

export async function POST(req: NextRequest) {
  const auth0 = await autorizadoStock("ver");
  if (eErro(auth0)) return auth0;

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  try {
    /* ---------- confirmar pendente antigo ---------- */
    if (corpo.action === "confirmar-pendente") {
      const auth = await autorizadoStock("editar");
      if (eErro(auth)) return auth;
      const id = corpo.id;
      if (!id) {
        return NextResponse.json({ ok: false, erro: "Movimento não indicado." }, { status: 400 });
      }
      const linhas = await query<MovimentoStock>("stock_movimentos", `select=*&id=eq.${id}&limit=1`);
      const m = linhas[0];
      if (!m) {
        return NextResponse.json({ ok: false, erro: "Movimento não encontrado." }, { status: 404 });
      }
      if (m.estado !== "pendente") {
        return NextResponse.json(
          { ok: false, erro: "Este movimento já está confirmado." },
          { status: 409 }
        );
      }
      const qtd = Number(m.quantidade) || 0;
      if (m.tipo === "saida") {
        const pos = await posicoesActuais();
        const bloqueio = motivoBloqueioSaida(qtd, pos[m.material_id] || 0);
        if (bloqueio) {
          return NextResponse.json({ ok: false, erro: bloqueio }, { status: 409 });
        }
      }
      await update("stock_movimentos", `id=eq.${id}`, {
        estado: "confirmado",
        data_confirmacao: hojeISO()
      });
      return NextResponse.json({ ok: true });
    }

    /* ---------- rejeitar pendente antigo ---------- */
    if (corpo.action === "rejeitar-pendente") {
      const auth = await autorizadoStock("apagar");
      if (eErro(auth)) return auth;
      if (!corpo.id) {
        return NextResponse.json({ ok: false, erro: "Movimento não indicado." }, { status: 400 });
      }
      const linhas = await query<MovimentoStock>(
        "stock_movimentos",
        `select=id,estado&id=eq.${corpo.id}&limit=1`
      );
      if (!linhas[0]) {
        return NextResponse.json({ ok: false, erro: "Movimento não encontrado." }, { status: 404 });
      }
      if (linhas[0].estado !== "pendente") {
        return NextResponse.json(
          { ok: false, erro: "Só um movimento pendente pode ser rejeitado." },
          { status: 409 }
        );
      }
      await del("stock_movimentos", corpo.id);
      return NextResponse.json({ ok: true });
    }

    /* ---------- apagar movimento ---------- */
    if (corpo.action === "apagar") {
      const auth = await autorizadoStock("apagar");
      if (eErro(auth)) return auth;
      if (!corpo.id) {
        return NextResponse.json({ ok: false, erro: "Movimento não indicado." }, { status: 400 });
      }
      const linhas = await query<MovimentoStock>(
        "stock_movimentos",
        `select=*&id=eq.${corpo.id}&limit=1`
      );
      const m = linhas[0];
      if (!m) {
        return NextResponse.json({ ok: false, erro: "Movimento não encontrado." }, { status: 404 });
      }
      if (m.tipo === "entrada" && m.estado === "confirmado") {
        const pos = await posicoesActuais();
        const bloqueio = motivoBloqueioApagarEntrada(m, pos);
        if (bloqueio) {
          return NextResponse.json({ ok: false, erro: bloqueio }, { status: 409 });
        }
      }
      await del("stock_movimentos", corpo.id);
      return NextResponse.json({ ok: true });
    }

    /* ---------- criar (registo directo) ---------- */
    const auth = await autorizadoStock("criar");
    if (eErro(auth)) return auth;
    const mv = corpo.movimento;
    if (!mv) {
      return NextResponse.json({ ok: false, erro: "Faltam os dados do movimento." }, { status: 400 });
    }
    const tipo = mv.tipo;
    if (tipo !== "entrada" && tipo !== "saida") {
      return NextResponse.json({ ok: false, erro: "Tipo inválido." }, { status: 400 });
    }
    if (!mv.material_id) {
      return NextResponse.json({ ok: false, erro: "Escolhe o material." }, { status: 400 });
    }
    const qtd = Number(mv.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      return NextResponse.json(
        { ok: false, erro: "Quantidade: escreve um número maior que 0." },
        { status: 400 }
      );
    }
    if (qtd > 1000000) {
      return NextResponse.json(
        { ok: false, erro: "Quantidade demasiado grande (máximo 1 000 000)." },
        { status: 400 }
      );
    }
    const data = (mv.data_movimento || "").slice(0, 10) || hojeISO();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json({ ok: false, erro: "Data inválida." }, { status: 400 });
    }
    if (data > hojeISO()) {
      return NextResponse.json(
        { ok: false, erro: "Não se registam movimentos com data futura." },
        { status: 400 }
      );
    }

    const mats = await query<Material & { id: string }>(
      "materiais",
      `select=id,referencia,nome,ativo&id=eq.${mv.material_id}&limit=1`
    );
    const material = mats[0];
    if (!material) {
      return NextResponse.json({ ok: false, erro: "Material não encontrado." }, { status: 404 });
    }
    if (!material.ativo) {
      return NextResponse.json(
        {
          ok: false,
          erro: `"${material.referencia} - ${material.nome}" está inactivo. Reactiva-o no catálogo para poder movimentar.`
        },
        { status: 409 }
      );
    }

    if (tipo === "saida") {
      // BLOQUEIO do stock negativo: quem levanta não pode levar o que
      // não existe. A posição é sempre recalculada aqui no servidor.
      const pos = await posicoesActuais();
      const bloqueio = motivoBloqueioSaida(qtd, pos[mv.material_id] || 0);
      if (bloqueio) {
        return NextResponse.json(
          {
            ok: false,
            erro: `${material.referencia} - ${material.nome}: ${bloqueio}`
          },
          { status: 409 }
        );
      }
    }

    const payload: Record<string, unknown> = {
      tipo,
      estado: "confirmado",
      material_id: mv.material_id,
      quantidade: arred2(qtd),
      data_movimento: data,
      data_confirmacao: data,
      observacoes: (mv.observacoes || "").trim() || null
    };
    if (tipo === "entrada") {
      const preco = Number(mv.preco_unitario);
      if (mv.preco_unitario !== undefined && mv.preco_unitario !== "" && (!Number.isFinite(preco) || preco < 0)) {
        return NextResponse.json(
          { ok: false, erro: "Preço unitário: escreve um número maior ou igual a 0." },
          { status: 400 }
        );
      }
      payload.preco_unitario = Number.isFinite(preco) && mv.preco_unitario !== "" ? arred2(preco) : null;
      payload.fornecedor = (mv.fornecedor || "").trim() || null;
      payload.numero_po = (mv.numero_po || "").trim() || null;
      payload.departamento = (mv.departamento || "").trim() || null;
      payload.comprador_nome = (mv.comprador_nome || "").trim() || null;
      payload.recebedor_nome = (mv.recebedor_nome || "").trim() || null;
    } else {
      if (!(mv.colaborador_nome || "").trim()) {
        return NextResponse.json(
          { ok: false, erro: "Indica quem levanta o material." },
          { status: 400 }
        );
      }
      payload.colaborador_nome = (mv.colaborador_nome || "").trim();
      payload.finalidade = (mv.finalidade || "").trim() || null;
      payload.numero_requisicao = (mv.numero_requisicao || "").trim() || null;
    }

    const criado = await insert<MovimentoStock>("stock_movimentos", payload);
    return NextResponse.json({ ok: true, id: criado[0]?.id });
  } catch (e) {
    return erroBase(e, `stock movimentos POST ${corpo.action}`);
  }
}

/** Posições confirmadas de todos os materiais (para os bloqueios). */
async function posicoesActuais(): Promise<Record<string, number>> {
  const movimentos = await queryTudo<MovimentoStock>(
    "stock_movimentos",
    "select=*&estado=eq.confirmado"
  );
  return calcularPosicoes(movimentos);
}
