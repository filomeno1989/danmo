/**
 * /api/rh/quadro - Quadro de Pessoal (Fichas de Colaboradores).
 *
 * GET: lista completa (sem fotos, que vivem na tabela a parte e so
 *      entram na ficha aberta).
 * POST: nova ficha. O servidor volta a validar TUDO (o mesmo juiz do
 *      formulario) e recusa codigo repetido: "EST 01" e "EST01" sao
 *      o mesmo codigo para este juiz, mesmo com espacos diferentes.
 */

import { NextResponse, NextRequest } from "next/server";
import { insert, query, queryTudo } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import {
  normalizarCodigo,
  payloadDaFicha,
  problemaDaFicha,
  type Colaborador,
  type DadosFicha
} from "@/lib/rh";

const CAMPOS_RH = [
  "code", "name", "categoria", "setor", "empresa", "tipo_colaborador",
  "tipo_vinculo", "empresa_origem", "data_admissao_danmo", "data_admissao_grupo",
  "estagio_instituicao", "estagio_orientador", "estagio_data_inicio", "estagio_data_fim",
  "active", "data_inativo", "data_nascimento", "naturalidade", "estado_civil",
  "endereco", "num_dependentes", "mes_ferias", "bi_numero", "bi_validade",
  "carta_conducao", "carta_conducao_validade", "inss_numero",
  "nuit_numero", "contacto_1", "contacto_2", "email", "grupo_sanguineo",
  "doenca_cronica", "altura_cm", "observacoes_gerais"
];

export async function GET() {
  const auth = await autorizado("rh.quadro", "ver");
  if (eErro(auth)) return auth;
  try {
    const colaboradores = await queryTudo<Colaborador>(
      "collaborators",
      "select=*&order=name.asc"
    );
    // Validades nos scans anexados (2a fonte dos alertas). Se a tabela
    // ainda nao existir (SQL do arquivo por colar), a lista abre na
    // mesma: os alertas ficam so com as datas da ficha.
    let docsValidades: { colaborador_id: number; tipo: string; validade: string }[] = [];
    try {
      docsValidades = await query(
        "rh_colaborador_documentos",
        "select=colaborador_id,tipo,validade&validade=not.is.null"
      );
    } catch {
      docsValidades = [];
    }
    return NextResponse.json({ ok: true, colaboradores, docsValidades });
  } catch (e) {
    return erroBase(e, "rh quadro GET");
  }
}

export async function POST(req: NextRequest) {
  const auth = await autorizado("rh.quadro", "mexer");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as { accao?: string; dados?: DadosFicha };
    if (corpo.accao !== "criar" || !corpo.dados) {
      return NextResponse.json({ ok: false, erro: "Pedido desconhecido." }, { status: 400 });
    }
    const problema = problemaDaFicha(corpo.dados);
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }

    const codigo = normalizarCodigo(corpo.dados.code);
    const existentes = await query<{ id: number; code: string | null }>(
      "collaborators",
      "select=id,code"
    );
    const quemTem = existentes.find((c) => normalizarCodigo(c.code) === codigo);
    if (quemTem) {
      return NextResponse.json(
        { ok: false, erro: `O codigo ${codigo} ja pertence a outra ficha.` },
        { status: 409 }
      );
    }

    const payload = payloadDaFicha(corpo.dados);
    const soRH: Record<string, unknown> = {};
    for (const campo of CAMPOS_RH) soRH[campo] = payload[campo];
    const criadas = await insert<Colaborador>("collaborators", soRH);
    return NextResponse.json({ ok: true, colaborador: criadas[0] });
  } catch (e) {
    return erroBase(e, "rh quadro POST");
  }
}
