/**
 * /api/stock/config - Configurações do Stock.
 *
 * GET: todas as listas (activas e inactivas, para poder alternar):
 *      fornecedores, departamentos, finalidades, categorias de material,
 *      responsáveis (compradores e receptores) e unidades de medida.
 * POST: criar / editar / alternar em qualquer lista.
 *
 * Nota histórica: a tabela departamentos usa "active" (em inglês) enquanto
 * todas as outras usam "ativo". O servidor trata a diferença aqui dentro,
 * para nenhum cliente ter de adivinhar.
 *
 * As unidades de medida vêm da tabela unidades_medida (sql/fase4-stock-
 * unidades.sql). Se a tabela ainda não existir, a resposta avisa com
 * unidadesOk=false e o portal usa as 8 unidades base do hub.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, query, update } from "@/lib/supabase";
import { autorizadoStock, eErro, erroBase } from "@/lib/guarda-api";
import { normalizar, UNIDADES_BASE } from "@/lib/stock";
import type {
  CategoriaMaterial,
  Departamento,
  Fornecedor,
  Finalidade,
  Responsavel,
  UnidadeMedida
} from "@/lib/stock";

type ListaConfig = {
  fornecedores: Fornecedor[];
  departamentos: Departamento[];
  finalidades: Finalidade[];
  categorias: CategoriaMaterial[];
  responsaveis: Responsavel[];
  unidades: UnidadeMedida[];
  unidadesOk: boolean;
};

export async function carregarUnidades(): Promise<{ unidades: UnidadeMedida[]; ok: boolean }> {
  try {
    const unidades = await query<UnidadeMedida>("unidades_medida", "order=nome.asc");
    return { unidades, ok: true };
  } catch {
    return { unidades: [], ok: false };
  }
}

export async function GET() {
  const auth = await autorizadoStock("stock.config", "ver");
  if (eErro(auth)) return auth;
  try {
    const [fornecedores, departamentos, finalidades, categorias, responsaveis, unidades] =
      await Promise.all([
        query<Fornecedor>("fornecedores", "order=nome.asc"),
        query<Departamento>("departamentos", "order=nome.asc"),
        query<Finalidade>("finalidades", "order=nome.asc"),
        query<CategoriaMaterial>("categorias_material", "order=nome.asc"),
        query<Responsavel>("responsaveis", "order=nome.asc"),
        carregarUnidades()
      ]);
    const dados: ListaConfig = {
      fornecedores,
      departamentos,
      finalidades,
      categorias,
      responsaveis,
      unidades: unidades.unidades,
      unidadesOk: unidades.ok
    };
    return NextResponse.json({ ok: true, ...dados });
  } catch (e) {
    return erroBase(e, "stock config GET");
  }
}

/* ============ POST: criar / editar / alternar ============ */

export type TipoConfig =
  | "fornecedor"
  | "departamento"
  | "finalidade"
  | "categoria"
  | "comprador"
  | "receptor"
  | "unidade";

const TABELA: Record<TipoConfig, string> = {
  fornecedor: "fornecedores",
  departamento: "departamentos",
  finalidade: "finalidades",
  categoria: "categorias_material",
  comprador: "responsaveis",
  receptor: "responsaveis",
  unidade: "unidades_medida"
};

type Corpo = {
  action: "criar" | "editar" | "alternar";
  tipo: TipoConfig;
  id?: string;
  nome?: string;
  contacto?: string;
};

export async function POST(req: NextRequest) {
  const auth0 = await autorizadoStock("stock.config", "ver");
  if (eErro(auth0)) return auth0;

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  const accao = corpo.action === "criar" ? "criar" : "editar";
  const auth = await autorizadoStock("stock.config", accao);
  if (eErro(auth)) return auth;

  const tipo = corpo.tipo;
  if (!tipo || !TABELA[tipo]) {
    return NextResponse.json({ ok: false, erro: "Lista desconhecida." }, { status: 400 });
  }
  const tabela = TABELA[tipo];
  const campoActivo = tipo === "departamento" ? "active" : "ativo";

  try {
    /* ---- alternar activo/inactivo ---- */
    if (corpo.action === "alternar") {
      if (!corpo.id) {
        return NextResponse.json({ ok: false, erro: "Registo não indicado." }, { status: 400 });
      }
      const linhas = await query<Record<string, unknown>>(
        tabela,
        `select=*&id=eq.${corpo.id}&limit=1`
      );
      const atual = linhas[0];
      if (!atual) {
        return NextResponse.json({ ok: false, erro: "Registo não encontrado." }, { status: 404 });
      }
      const novo = atual[campoActivo] === false;
      await update(tabela, `id=eq.${corpo.id}`, { [campoActivo]: novo });
      return NextResponse.json({ ok: true, activo: novo });
    }

    /* ---- criar / editar ---- */
    const nome = (corpo.nome || "").trim();
    if (!nome) {
      return NextResponse.json({ ok: false, erro: "Escreve o nome." }, { status: 400 });
    }
    if (nome.length > 80) {
      return NextResponse.json(
        { ok: false, erro: "Nome demasiado longo (máximo 80 caracteres)." },
        { status: 400 }
      );
    }

    // Duplicados dentro da mesma lista (sem acentos, sem maiúsculas).
    // Nos responsáveis a comparação é dentro da mesma função, para um
    // comprador e um receptor poderem chamar-se igual.
    const todos = await query<Record<string, unknown>>(tabela, "select=*&order=nome.asc");
    const duplicado = todos.some((l) => {
      if (corpo.action === "editar" && corpo.id && String(l.id) === String(corpo.id)) return false;
      if (tipo === "comprador" && l.funcao !== "comprador" && l.funcao !== "ambos") return false;
      if (tipo === "receptor" && l.funcao !== "receptor" && l.funcao !== "ambos") return false;
      return normalizar(String(l.nome || "")) === normalizar(nome);
    });
    if (duplicado) {
      return NextResponse.json(
        { ok: false, erro: `Já existe "${nome}" nesta lista.` },
        { status: 409 }
      );
    }

    if (corpo.action === "editar") {
      if (!corpo.id) {
        return NextResponse.json({ ok: false, erro: "Registo não indicado." }, { status: 400 });
      }
      const patch: Record<string, unknown> = { nome };
      if (tipo === "fornecedor") patch.contacto = (corpo.contacto || "").trim() || null;
      await update(tabela, `id=eq.${corpo.id}`, patch);
      return NextResponse.json({ ok: true });
    }

    const novo: Record<string, unknown> = { nome, [campoActivo]: true };
    if (tipo === "fornecedor") novo.contacto = (corpo.contacto || "").trim() || null;
    if (tipo === "comprador") novo.funcao = "comprador";
    if (tipo === "receptor") novo.funcao = "receptor";
    try {
      await insert(tabela, novo);
    } catch (e) {
      const msg = String((e as { message?: string })?.message || "");
      if (tabela === "unidades_medida" && (msg.includes("does not exist") || msg.includes("Could not find the table"))) {
        return NextResponse.json(
          {
            ok: false,
            erro:
              "A tabela das unidades ainda não existe na base. Corre o ficheiro sql/fase4-stock-unidades.sql no Supabase (SQL Editor)."
          },
          { status: 400 }
        );
      }
      throw e;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, `stock config POST ${corpo.action} ${tipo}`);
  }
}

/** Unidades válidas (activas) para validar o formulário de materiais. */
export async function unidadesValidas(): Promise<string[]> {
  const { unidades, ok } = await carregarUnidades();
  if (!ok || !unidades.length) return UNIDADES_BASE;
  const activas = unidades.filter((u) => u.ativo !== false).map((u) => u.nome);
  return activas.length ? activas : UNIDADES_BASE;
}
