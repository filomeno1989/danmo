/**
 * /api/rh/aniversarios - As datas das DUAS listas da pagina Aniversarios.
 *
 * GET: os colaboradores com SO as colunas que as listas e os cartazes
 * precisam (datas de nascimento e de inicio de servico, nome, empresa).
 * Nada de contactos, bi ou saude: a pagina tem permissao PROPIA na
 * matriz (rh.aniversarios) e devolve menos do que a lista do Quadro.
 * Ver no Quadro OU na pagina nova.
 */

import { NextResponse } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";

type Linha = {
  id: number;
  name: string | null;
  empresa: string | null;
  active: boolean | null;
  data_nascimento: string | null;
  tipo_colaborador: string | null;
  estagio_data_inicio?: string | null;
  data_admissao_danmo: string | null;
  data_admissao: string | null;
};

const CAMPOS =
  "select=id,name,empresa,active,data_nascimento,tipo_colaborador,estagio_data_inicio,data_admissao_danmo,data_admissao&order=name.asc";
const CAMPOS_ANTIGOS =
  "select=id,name,empresa,active,data_nascimento,tipo_colaborador,data_admissao_danmo,data_admissao&order=name.asc";

export async function GET() {
  const auth = await autorizadoEmAlguma(["rh.quadro", "rh.aniversarios"]);
  if (eErro(auth)) return auth;
  try {
    let linhas: Linha[];
    try {
      linhas = await queryTudo<Linha>("collaborators", CAMPOS);
    } catch (e) {
      // colunas do estagio ainda sem SQL (instalacao antiga): repete
      if (e instanceof Error && /estagio_data_inicio/i.test(e.message)) {
        linhas = await queryTudo<Linha>("collaborators", CAMPOS_ANTIGOS);
      } else {
        throw e;
      }
    }
    return NextResponse.json({ ok: true, colaboradores: linhas });
  } catch (e) {
    return erroBase(e, "rh aniversarios GET");
  }
}
