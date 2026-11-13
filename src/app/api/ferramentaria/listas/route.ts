/**
 * /api/ferramentaria/listas - Tudo o que os formulários do módulo
 * precisam numa só chamada (o hub fazia 5 pedidos separados):
 *   ferramenteiros activos (entrega/recepção),
 *   categorias activas (inventário),
 *   departamentos activos (empréstimo),
 *   colaboradores activos (campos de pessoa com pesquisa por nome ou
 *     código, padrão aprovado pelo Filomeno),
 *   ferramentas activas leves (autocomplete do empréstimo).
 */

import { NextResponse } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import type { Categoria, ColaboradorFerr, Departamento, Ferramenteiro } from "@/lib/ferramentaria";

type FerramentaLeve = {
  id: string;
  code: string;
  nome: string;
  estado: string | null;
  quantidade: number | null;
};

export async function GET() {
  const auth = await autorizadoEmAlguma([
    "ferramentaria",
    "ferramentaria.inventario",
    "ferramentaria.emprestimos",
    "ferramentaria.devolucoes",
    "ferramentaria.ferramenteiros",
    "ferramentaria.configuracoes"
  ]);
  if (eErro(auth)) return auth;
  try {
    const [staff, categorias, departamentos, colaboradores, ferramentas] = await Promise.all([
      queryTudo<Ferramenteiro>("tool_staff", "select=id,nome,codigo&active=eq.true&order=nome.asc"),
      queryTudo<Categoria>("tool_categories", "select=id,nome&active=eq.true&order=nome.asc"),
      queryTudo<Departamento>("departamentos", "select=id,nome&active=eq.true&order=nome.asc"),
      queryTudo<ColaboradorFerr>("collaborators", "select=id,name,code&active=eq.true&order=name.asc"),
      queryTudo<FerramentaLeve>(
        "tools",
        "select=id,code,nome,estado,quantidade&active=eq.true&order=code.asc"
      )
    ]);
    return NextResponse.json({
      ok: true,
      ferramenteiros: staff,
      categorias,
      departamentos,
      colaboradores,
      ferramentas
    });
  } catch (e) {
    return erroBase(e, "ferramentaria listas GET");
  }
}
