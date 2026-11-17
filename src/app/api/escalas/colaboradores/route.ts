/**
 * /api/escalas/colaboradores - registo da gente da escala.
 *
 * GET    : todas (activas e inactivas), para o registo e os contactos.
 * POST   : nova pessoa (código único; se o código existir no Quadro de
 *          Pessoal, a pessoa da escala fica ligada ao colaborador).
 * PATCH  : edição de nome, contacto, categoria, área, grupo, ordem.
 * DELETE : ?id= (a gente da casa não se apaga: o DELETE fica para
 *          enganos de escrita; desactivar é o caminho normal).
 */

import { NextResponse } from "next/server";
import { query, del, insert, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import {
  eFaltaSQL,
  nomeDuplicadoEscalas,
  problemaColab
} from "@/lib/escalas";

export async function GET() {
  const auth = await autorizado("escalas.colaboradores", "ver");
  if (eErro(auth)) return auth;
  try {
    const lista = await query(
      "esc_colaboradores",
      "select=*&order=ordem.asc&order=nome.asc"
    );
    return NextResponse.json({ ok: true, colaboradores: lista });
  } catch (e) {
    if (eFaltaSQL(e)) {
      return NextResponse.json({ ok: true, sqlFalta: true, colaboradores: [] });
    }
    return erroBase(e, "escalas colaboradores GET");
  }
}

export async function POST(request: Request) {
  const auth = await autorizado("escalas.colaboradores", "mexer");
  if (eErro(auth)) return auth;
  try {
    const c = (await request.json()) as Record<string, string | number | null>;
    const problema = problemaColab(c);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }
    const codigo = String(c.codigo).trim();
    const nome = String(c.nome).trim();

    const existentes = await query<{ codigo: string; nome: string }>(
      "esc_colaboradores",
      "select=codigo,nome"
    );
    if (existentes.some((x) => x.codigo.toLowerCase() === codigo.toLowerCase())) {
      return NextResponse.json(
        { ok: false, erro: `O código ${codigo} já existe no registo.` },
        { status: 409 }
      );
    }
    if (nomeDuplicadoEscalas(nome, existentes.map((x) => x.nome))) {
      return NextResponse.json(
        { ok: false, erro: `Já existe uma pessoa com o nome "${nome}".` },
        { status: 409 }
      );
    }

    const criadas = await insert("esc_colaboradores", [
      {
        colaborador_id: await colaboradorDoQuadro(codigo),
        codigo,
        nome,
        contacto: String(c.contacto || "").replace(/\s/g, ""),
        categoria: String(c.categoria || "").trim(),
        area: String(c.area || "Outros"),
        grupo: c.grupo ? String(c.grupo).toUpperCase() : null,
        ordem: Number(c.ordem ?? 999),
        ativo: true
      }
    ]);
    return NextResponse.json({ ok: true, colaborador: criadas[0] });
  } catch (e) {
    return erroBase(e, "escalas colaboradores POST");
  }
}

export async function PATCH(request: Request) {
  const auth = await autorizado("escalas.colaboradores", "mexer");
  if (eErro(auth)) return auth;
  try {
    const c = (await request.json()) as Record<string, string | number | boolean | null> & {
      id?: string;
    };
    if (!c.id) {
      return NextResponse.json({ ok: false, erro: "Falta o id." }, { status: 400 });
    }
    if (c.codigo !== undefined || c.nome !== undefined) {
      const problema = problemaColab({
        codigo: c.codigo !== undefined ? String(c.codigo) : "DM0000",
        nome: c.nome !== undefined ? String(c.nome) : "Nome",
        contacto: c.contacto !== undefined ? String(c.contacto) : "",
        categoria: c.categoria !== undefined ? String(c.categoria) : "",
        area: c.area !== undefined ? String(c.area) : undefined,
        grupo: c.grupo !== undefined ? (c.grupo ? String(c.grupo) : null) : undefined,
        ordem: c.ordem !== undefined ? Number(c.ordem) : undefined
      });
      if (problema) {
        return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
      }
    }
    const dados: Record<string, unknown> = {};
    for (const campo of ["codigo", "nome", "contacto", "categoria", "area", "grupo", "ordem", "ativo"]) {
      if (c[campo] === undefined) continue;
      if (campo === "grupo") {
        dados[campo] = c.grupo ? String(c.grupo).toUpperCase() : null;
      } else if (campo === "ordem") {
        dados[campo] = Number(c.ordem);
      } else {
        dados[campo] = c[campo];
      }
    }
    if (dados.codigo || dados.nome) {
      const existentes = await query<{ id: string; codigo: string; nome: string }>(
        "esc_colaboradores",
        "select=id,codigo,nome"
      );
      const outro = existentes.find(
        (x) =>
          x.id !== c.id &&
          (dados.codigo !== undefined
            ? x.codigo.toLowerCase() === String(dados.codigo).toLowerCase()
            : nomeDuplicadoEscalas(String(dados.nome), [x.nome]))
      );
      if (outro) {
        return NextResponse.json(
          { ok: false, erro: `Código ou nome já usados por "${outro.nome}".` },
          { status: 409 }
        );
      }
    }
    if (dados.codigo) {
      const quadro = await colaboradorDoQuadro(String(dados.codigo));
      if (quadro) dados.colaborador_id = quadro;
    }
    const linhas = await update("esc_colaboradores", `id=eq.${c.id}`, dados);
    return NextResponse.json({ ok: true, colaborador: linhas[0] });
  } catch (e) {
    return erroBase(e, "escalas colaboradores PATCH");
  }
}

export async function DELETE(request: Request) {
  const auth = await autorizado("escalas.colaboradores", "apagar");
  if (eErro(auth)) return auth;
  try {
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!id) {
      return NextResponse.json({ ok: false, erro: "Falta o id." }, { status: 400 });
    }
    await del("esc_colaboradores", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "escalas colaboradores DELETE");
  }
}

/** id do colaborador no Quadro de Pessoal para um código DM (ou null). */
async function colaboradorDoQuadro(codigo: string): Promise<number | null> {
  if (!/^DM\d+/i.test(codigo)) return null;
  const linhas = await query<{ id: number }>(
    "collaborators",
    `select=id&code=eq.${encodeURIComponent(codigo)}&limit=1`
  );
  return linhas[0]?.id ?? null;
}
