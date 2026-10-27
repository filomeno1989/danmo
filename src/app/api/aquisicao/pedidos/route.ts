/**
 * /api/aquisicao/pedidos - Pedidos de Aquisição (Admin. Oficinal).
 *
 * GET: lista completa + designações dos itens por pedido (alimento da
 *      pesquisa por material do histórico, como o hub fazia).
 * POST: cria pedido. O NÚMERO é calculado AQUI no servidor (o hub
 *       calculava no navegador: duas gravações em concorrência nasciam
 *       com o mesmo número). O servidor também RECUSA número repetido
 *       no mesmo ano (409) - a trava que a Faturação ganhou depois da
 *       fatura 002/26 duplicada.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, query, queryTudo, update } from "@/lib/supabase";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  itensParaGravar,
  problemaDoPedido,
  proximoNumero,
  type DadosPedido,
  type ItemAquisicao,
  type PedidoAquisicao
} from "@/lib/aquisicao";

const PAGINAS_AQ = ["aquisicao", "aquisicao.novo", "aquisicao.historico", "aquisicao.configuracoes"];

export async function GET() {
  const auth = await autorizadoEmAlguma(PAGINAS_AQ);
  if (eErro(auth)) return auth;
  try {
    const pedidos = await queryTudo<PedidoAquisicao>(
      "aquisicao_pedidos",
      "select=*&order=ano.desc,numero.desc"
    );
    const itens = await queryTudo<{ pedido_id: string; designacao: string; aplicacao: string }>(
      "aquisicao_itens",
      "select=pedido_id,designacao,aplicacao"
    );
    const porPedido: Record<string, string[]> = {};
    const aplicacoes = new Set<string>();
    for (const it of itens) {
      if (it.designacao) (porPedido[it.pedido_id] ||= []).push(it.designacao);
      if (it.aplicacao?.trim()) aplicacoes.add(it.aplicacao.trim());
    }
    return NextResponse.json({
      ok: true,
      pedidos,
      designacoesPorPedido: porPedido,
      /* datalist do campo Aplicação no editor: aprende com o que a
         equipa já escreveu (hub carregava aquisicao_itens directamente). */
      aplicacoes: [...aplicacoes].sort((a, b) => a.localeCompare(b))
    });
  } catch (e) {
    return erroBase(e, "aquisicao pedidos GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizadoEmAlguma(["aquisicao.novo"]);
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as {
      accao?: string;
      dados?: Partial<DadosPedido>;
      itens?: Partial<ItemAquisicao>[];
    };
    if (corpo.accao !== "criar" || !corpo.dados) {
      return NextResponse.json({ ok: false, erro: "Pedido desconhecido." }, { status: 400 });
    }
    const itens = itensParaGravar(corpo.itens || []);
    const problema = problemaDoPedido(corpo.dados, itens);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const ano = Number(corpo.dados.data_pedido!.slice(0, 4));

    /* O nome do fornecedor vem SEMPRE da base (fonte única de verdade):
       o navegador manda o id; o servidor confirma que existe e usa o
       nome gravado - o papel e as listas nunca herdam um nome torto. */
    const [fornecedor] = await query<{ nome: string; ativo: boolean }>(
      "aquisicao_fornecedores",
      `select=nome,ativo&id=eq.${encodeURIComponent(corpo.dados.fornecedor_id!)}&limit=1`
    );
    if (!fornecedor) {
      return NextResponse.json({ ok: false, erro: "Fornecedor não encontrado na base." }, { status: 400 });
    }

    // Número no SERVIDOR: o maior entre o contador configurado e o
    // último gravado no ano (a mesma regra do hub, sem a corrida).
    const [contador] = await query<{ proximo_numero: number }>(
      "aquisicao_contadores",
      `select=proximo_numero&ano=eq.${ano}&limit=1`
    );
    const existentes = await query<{ numero: number }>(
      "aquisicao_pedidos",
      `select=numero&ano=eq.${ano}&order=numero.desc&limit=1`
    );
    const numero = proximoNumero(ano, contador?.proximo_numero, existentes[0]?.numero);

    const mesmos = await query<{ id: string }>(
      "aquisicao_pedidos",
      `select=id&ano=eq.${ano}&numero=eq.${numero}&limit=1`
    );
    if (mesmos.length) {
      return NextResponse.json(
        { ok: false, erro: `O nº ${numero}/${ano} já existe. Grava de novo para o servidor sugerir o seguinte.` },
        { status: 409 }
      );
    }

    const dados = {
      ano,
      numero,
      data_pedido: corpo.dados.data_pedido,
      tipo_documento: String(corpo.dados.tipo_documento).trim(),
      numero_cotacao_proforma: String(corpo.dados.numero_cotacao_proforma).trim(),
      fornecedor_id: corpo.dados.fornecedor_id,
      fornecedor_nome: fornecedor.nome,
      solicitante: String(corpo.dados.solicitante).trim(),
      solicitante_codigo: corpo.dados.solicitante_codigo || null,
      observacao_geral: String(corpo.dados.observacao_geral || "").trim()
    };

    const [pedido] = await insert<PedidoAquisicao>("aquisicao_pedidos", dados);
    if (itens.length) {
      await insert("aquisicao_itens", itens.map((i) => ({ ...i, pedido_id: pedido.id })));
    }

    // Contador fica sempre à frente do que foi gravado.
    const proximo = numero + 1;
    const [contadorExiste] = await query<{ id: string }>(
      "aquisicao_contadores",
      `select=id&ano=eq.${ano}&limit=1`
    );
    if (contadorExiste) {
      await update("aquisicao_contadores", `id=eq.${contadorExiste.id}`, { proximo_numero: proximo });
    } else {
      await insert("aquisicao_contadores", [{ ano, proximo_numero: proximo }]);
    }

    return NextResponse.json({ ok: true, pedido });
  } catch (e) {
    return erroBase(e, "aquisicao pedidos POST");
  }
}
