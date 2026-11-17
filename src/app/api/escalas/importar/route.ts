/**
 * /api/escalas/importar - entrada do Excel para a base (Fase 9).
 *
 * O navegador lê o ESCALA MENSAL com o parser da lib (escalas-import)
 * e manda os dados aqui em duas fases, uma por tipo:
 * - tipo "registo": as pessoas (upsert por código, ligando ao Quadro de
 *   Pessoal pelo código DM) e as folgas guardadas trazidas do saldo
 *   "Anterior" (uma vez só: se já existirem folgas "Saldo trazido"
 *   dessa pessoa, não duplica);
 * - tipo "mes": as células de um mês (upsert colaborador+data), para
 *   mandar mês a mês sem estourar o limite do pedido.
 */

import { NextResponse } from "next/server";
import { insert, query, upsert } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { eCodigoValido, eFaltaSQL } from "@/lib/escalas";

type ColabEntrada = {
  codigo: string;
  nome: string;
  contacto: string;
  categoria: string;
  area: string;
  grupo: string | null;
  colaborador_id: number | null;
  ordem: number;
};

type FolgaEntrada = { codigo: string; valor: number; obs: string };

type CelulaEntrada = { codigo: string; data: string; codigo_escala: string };

export async function POST(request: Request) {
  const auth = await autorizado("escalas.configuracoes", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await request.json()) as {
      tipo?: string;
      colaboradores?: ColabEntrada[];
      folgas?: FolgaEntrada[];
      celulas?: CelulaEntrada[];
    };

    if (corpo.tipo === "registo") {
      return await importarRegisto(
        corpo.colaboradores || [],
        corpo.folgas || [],
        auth.utilizador.nome
      );
    }
    if (corpo.tipo === "mes") {
      return await importarMes(corpo.celulas || []);
    }
    return NextResponse.json({ ok: false, erro: "Tipo de importação desconhecido." }, { status: 400 });
  } catch (e) {
    if (eFaltaSQL(e)) {
      return NextResponse.json(
        {
          ok: false,
          erro: "As tabelas da Escala ainda não existem na base. Cola o sql/fase9-escalas.sql no Supabase e volta a importar."
        },
        { status: 503 }
      );
    }
    return erroBase(e, "escalas importar POST");
  }
}

async function importarRegisto(colaboradores: ColabEntrada[], folgas: FolgaEntrada[], criadoPor: string) {
  const bridge = new Map(
    (await query<{ id: number; code: string | null }>("collaborators", "select=id,code"))
      .filter((l) => l.code)
      .map((l) => [l.id, (l.code as string).toUpperCase()])
  );

  const linhas = colaboradores.map((c) => ({
    colaborador_id: c.colaborador_id ?? (c.codigo ? (buscaPorCodigo(bridge, c.codigo) ?? null) : null),
    codigo: c.codigo,
    nome: c.nome,
    contacto: (c.contacto || "").replace(/\s/g, ""),
    categoria: c.categoria || "",
    area: c.area || "Outros",
    grupo: c.grupo ? String(c.grupo).toUpperCase() : null,
    ordem: Number(c.ordem) || 999,
    ativo: true
  }));
  let pessoas = 0;
  for (let i = 0; i < linhas.length; i += 400) {
    const lote = linhas.slice(i, i + 400);
    await upsert("esc_colaboradores", lote, "codigo");
    pessoas += lote.length;
  }

  // código -> id depois do upsert (para as folgas)
  const registo = await query<{ id: string; codigo: string }>(
    "esc_colaboradores",
    "select=id,codigo"
  );
  const idPorCodigo = new Map(registo.map((r) => [r.codigo.toUpperCase(), r.id]));

  const jaTrazidas = new Set(
    (
      await query<{ colaborador_id: string }>(
        "esc_folgas",
        "select=colaborador_id&obs=ilike.Saldo%20trazido*"
      )
    ).map((f) => f.colaborador_id)
  );

  const folgasNovas = folgas
    .map((f) => {
      const id = idPorCodigo.get(f.codigo.toUpperCase());
      if (!id) return null;
      if (jaTrazidas.has(id)) return null;
      return {
        colaborador_id: id,
        valor: Number(f.valor) || 0,
        estado: "guardada",
        obs: f.obs || "Saldo trazido do Excel",
        criado_por: criadoPor
      };
    })
    .filter((f): f is NonNullable<typeof f> => f !== null && f.valor > 0);

  let folgasCriadas = 0;
  for (let i = 0; i < folgasNovas.length; i += 400) {
    const lote = folgasNovas.slice(i, i + 400);
    if (!lote.length) break;
    await insert("esc_folgas", lote);
    folgasCriadas += lote.length;
  }

  return NextResponse.json({ ok: true, pessoas, folgas: folgasCriadas });
}

async function importarMes(celulas: CelulaEntrada[]) {
  const registo = await query<{ id: string; codigo: string }>(
    "esc_colaboradores",
    "select=id,codigo"
  );
  const idPorCodigo = new Map(registo.map((r) => [r.codigo.toUpperCase(), r.id]));

  const linhas: { colaborador_id: string; data: string; codigo: string }[] = [];
  let semPessoa = 0;
  let semCodigo = 0;
  for (const cel of celulas) {
    if (!eCodigoValido(cel.codigo_escala)) {
      semCodigo += 1;
      continue;
    }
    const id = idPorCodigo.get(cel.codigo.toUpperCase());
    if (!id) {
      semPessoa += 1;
      continue;
    }
    linhas.push({ colaborador_id: id, data: cel.data, codigo: cel.codigo_escala });
  }

  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += 800) {
    const lote = linhas.slice(i, i + 800);
    await upsert("esc_dias", lote, "colaborador_id,data");
    gravadas += lote.length;
  }
  return NextResponse.json({
    ok: true,
    gravadas,
    semPessoa,
    semCodigo
  });
}

function buscaPorCodigo(bridge: Map<number, string>, codigo: string): number | null {
  for (const [id, code] of bridge) {
    if (code === codigo.toUpperCase()) return id;
  }
  return null;
}
