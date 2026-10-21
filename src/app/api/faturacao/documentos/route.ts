/**
 * /api/faturacao/documentos - Cotações e Faturas da Administração.
 *
 * GET: documentos + clientes + técnicos + tarifas + materiais (o
 *      catálogo de materiais é o MESMO do Stock; o editor usa-o para
 *      preencher descrição, unidade e preço). O navegador só filtra e
 *      desenha: nada de contas importantes do lado do cliente.
 * POST: criar documento. Toda a validação acontece AQUI no servidor
 *      (correcção do bug real do hub antigo, que aceitava números
 *      duplicados e totais inventados pelo navegador):
 *      - totais recalculados de zero a partir das linhas;
 *      - HTML da descrição limpo no servidor;
 *      - número repetido no mesmo tipo é RECUSADO (a fatura 002/26
 *        duplicada no histórico nasceu exactamente deste buraco);
 *      - "Elaborado por" vem da SESSÃO, não do formulário.
 *
 * Numeração (decisão do Filomeno): 001/2026, por tipo, reinicia a cada
 * ano. Documentos novos exigem o ano com 4 dígitos.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, queryTudo } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  validarDocEntrada,
  numeroDuplicado,
  hojeISO,
  type DocFaturacao,
  type ClienteFat,
  type TecnicoFat,
  type TarifaFat
} from "@/lib/faturacao";

type MaterialFat = {
  id: string;
  referencia: string | null;
  nome: string;
  unidade: string | null;
  preco_mzn: number | null;
  ativo: boolean;
};

const PAGINAS_VER = ["faturacao", "faturacao.editor", "faturacao.relatorios"];

/* ------------------------------------------------------------------
 * Modo estrutura (desenvolvimento sem base): dados fictícios
 * ------------------------------------------------------------------ */

function dadosEstrutura() {
  const documentos: DocFaturacao[] = [
    {
      id: "est-doc-1",
      tipo: "cotacao",
      numero: "008/2026",
      data: hojeISO(),
      servico: "mao",
      moeda: "MZN",
      taxa_cambio: 64,
      iva_incluido: false,
      iva_pct: 16,
      tipo_cliente: "interno",
      cliente_nome: "Cornelder de Moçambique (CdM)",
      cliente_morada: "Porto da Beira",
      cliente_nuit: "400024022",
      cliente_contacto: "843011234",
      enviado_nome: "Eng. Casimiro",
      enviado_cargo: "Chefe de Oficina",
      assunto: "<p>Cotação de mão de obra para reparações diversas.</p>",
      subtotal: 24167.28,
      desconto: 0,
      desconto_tipo: "fixo",
      desconto_input: 0,
      iva_amt: 0,
      total: 24167.28,
      total_mzn: 24167.28,
      utilizador_id: null,
      utilizador_nome: "Modo Estrutura",
      utilizador_cargo: "Teste",
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    },
    {
      id: "est-doc-2",
      tipo: "fatura",
      numero: "011/2026",
      data: hojeISO(),
      servico: "misto",
      moeda: "USD",
      taxa_cambio: 64,
      iva_incluido: true,
      iva_pct: 16,
      tipo_cliente: "externo",
      cliente_nome: "ACCESS WORLD",
      cliente_morada: "Beira",
      cliente_nuit: "400111222",
      cliente_contacto: "875544332",
      enviado_nome: "Ms. Silva",
      enviado_cargo: "Operations",
      assunto: "<p>Fatura de reparação com material.</p>",
      subtotal: 800,
      desconto: 80,
      desconto_tipo: "pct",
      desconto_input: 10,
      iva_amt: 115.2,
      total: 835.2,
      total_mzn: 53452.8,
      utilizador_id: null,
      utilizador_nome: "Modo Estrutura",
      utilizador_cargo: "Teste",
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString()
    }
  ];
  const clientes: ClienteFat[] = [
    { id: "est-cli-1", nome: "Cornelder de Moçambique (CdM)", morada: "Porto da Beira", nuit: "400024022", contacto: "843011234", ativo: true },
    { id: "est-cli-2", nome: "ACCESS WORLD", morada: "Beira", nuit: "400111222", contacto: "875544332", ativo: true },
    { id: "est-cli-3", nome: "CCIS", morada: "Munhava", nuit: "400555666", contacto: "821122334", ativo: false }
  ];
  const tecnicos: TecnicoFat[] = [
    { id: "est-tec-1", nome: "Técnico Mecânico", tarifa_mzn: 0, tarifa_usd: 0, ativo: true },
    { id: "est-tec-2", nome: "Técnico Eletricista", tarifa_mzn: 0, tarifa_usd: 0, ativo: true }
  ];
  const tarifas: TarifaFat[] = [
    { id: "est-tar-1", descricao: "Standard", valor_mzn: 3225.5, ativo: true },
    { id: "est-tar-2", descricao: "CdM", valor_mzn: 2013.94, ativo: true }
  ];
  const materiais: MaterialFat[] = [
    { id: "est-mat-1", referencia: "DAN-LUB-002", nome: "Oleo 15W40", unidade: "Lt", preco_mzn: null, ativo: true },
    { id: "est-mat-2", referencia: "DAN-BAT-001", nome: "Bateria Raylite", unidade: "Un", preco_mzn: null, ativo: true }
  ];
  return { documentos, clientes, tecnicos, tarifas, materiais };
}

/* ------------------------------------------------------------------
 * GET
 * ------------------------------------------------------------------ */

export async function GET() {
  const auth = await autorizadoEmAlguma(PAGINAS_VER);
  if (eErro(auth)) return auth;
  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, ...dadosEstrutura(), estrutura: true });
  }
  try {
    const [documentos, clientes, tecnicos, tarifas, materiais] = await Promise.all([
      queryTudo<DocFaturacao>("documentos", "select=*&order=criado_em.desc,id.desc"),
      queryTudo<ClienteFat>("clientes", "select=*&order=nome.asc"),
      queryTudo<TecnicoFat>("tecnicos", "select=*&order=nome.asc"),
      queryTudo<TarifaFat>("tarifas", "select=*&order=valor_mzn.desc"),
      queryTudo<MaterialFat>(
        "materiais",
        "select=id,referencia,nome,unidade,preco_mzn,ativo&ativo=eq.true&order=referencia.asc"
      )
    ]);
    return NextResponse.json({ ok: true, documentos, clientes, tecnicos, tarifas, materiais });
  } catch (e) {
    return erroBase(e, "faturacao documentos GET");
  }
}

/* ------------------------------------------------------------------
 * POST (criar)
 * ------------------------------------------------------------------ */

export async function POST(req: NextRequest) {
  const auth = await autorizado("faturacao.editor", "mexer");
  if (eErro(auth)) return auth;

  if (process.env.NODE_ENV !== "production" && !process.env.SUPABASE_URL) {
    return NextResponse.json({ ok: true, estrutura: true, id: "est-doc-novo" });
  }

  try {
    const corpo = await req.json().catch(() => ({}));
    const tecnicos = await queryTudo<TecnicoFat>("tecnicos", "select=id,nome");
    const validacao = validarDocEntrada(corpo, tecnicos, { novo: true });
    if (!validacao.ok || !validacao.dados) {
      return NextResponse.json({ ok: false, erro: validacao.erro }, { status: 400 });
    }
    const dados = validacao.dados;

    const existentes = await queryTudo<{ id: string; tipo: string; numero: string }>(
      "documentos",
      "select=id,tipo,numero"
    );
    if (numeroDuplicado(dados.tipo, dados.numero, existentes)) {
      return NextResponse.json(
        {
          ok: false,
          erro: `Já existe ${dados.tipo === "fatura" ? "uma fatura" : "uma cotação"} com o número ${dados.numero}. Corrige o número.`
        },
        { status: 409 }
      );
    }

    const agora = new Date().toISOString();
    const docLimpo = {
      tipo: dados.tipo,
      numero: dados.numero,
      data: dados.data,
      servico: dados.servico,
      moeda: dados.moeda,
      taxa_cambio: dados.taxa_cambio,
      iva_incluido: dados.iva_incluido,
      iva_pct: dados.iva_pct,
      tipo_cliente: dados.tipo_cliente,
      cliente_nome: dados.cliente_nome,
      cliente_morada: dados.cliente_morada,
      cliente_nuit: dados.cliente_nuit,
      cliente_contacto: dados.cliente_contacto,
      enviado_nome: dados.enviado_nome,
      enviado_cargo: dados.enviado_cargo,
      assunto: dados.assunto,
      subtotal: dados.subtotal,
      desconto: dados.desconto,
      desconto_tipo: dados.desconto_tipo,
      desconto_input: dados.desconto_input,
      iva_amt: dados.iva_amt,
      total: dados.total,
      total_mzn: dados.total_mzn,
      utilizador_id: String(auth.utilizador.id ?? "") || null,
      utilizador_nome: auth.utilizador.nome,
      utilizador_cargo: auth.utilizador.cargo || "",
      criado_em: agora,
      atualizado_em: agora
    };
    const criados = await insert<DocFaturacao>("documentos", docLimpo);
    const doc = criados[0];

    if (dados.itens.length) {
      await insert(
        "documento_itens",
        dados.itens.map((it) => ({ ...it, documento_id: doc.id }))
      );
    }

    return NextResponse.json({ ok: true, id: doc.id, numero: doc.numero });
  } catch (e) {
    return erroBase(e, "faturacao documentos POST");
  }
}
