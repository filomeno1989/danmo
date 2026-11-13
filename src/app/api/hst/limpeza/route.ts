/**
 * /api/hst/limpeza - Limpeza total dos dados HST (zona de perigo).
 *
 * O hub apagava LINHA A LINHA (6 tabelas x N pedidos cada, com uma
 * janela de falha em cada linha). Aqui é um delFiltro único por tabela,
 * na ordem inversa das dependências (acções antes de acidentes, entregas
 * antes de EPIs). Exige permissão de APAGAR nas Configurações e a
 * palavra de confirmação exacta vinda do ecrã de dupla confirmação.
 */

import { NextResponse, NextRequest } from "next/server";
import { delFiltro } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";

const ORDEM_LIMPEZA = [
  "hst_medicoes_tensao",
  "hst_acoes_corretivas",
  "hst_epi_entregas",
  "hst_acidentes",
  "hst_epis",
  "hst_areas_risco"
];

export async function POST(req: NextRequest) {
  const auth = await autorizado("hst.configuracoes", "apagar");
  if (eErro(auth)) return auth;
  try {
    const corpo = (await req.json()) as { confirmar?: string };
    if (corpo.confirmar !== "APAGAR") {
      return NextResponse.json(
        { ok: false, erro: "Confirmação em falta: escreve APAGAR para prosseguir." },
        { status: 400 }
      );
    }
    const tabelasLimpas: string[] = [];
    for (const tabela of ORDEM_LIMPEZA) {
      await delFiltro(tabela, "id=gt.0");
      tabelasLimpas.push(tabela);
    }
    return NextResponse.json({ ok: true, tabelas: tabelasLimpas });
  } catch (e) {
    return erroBase(e, "hst limpeza POST");
  }
}
