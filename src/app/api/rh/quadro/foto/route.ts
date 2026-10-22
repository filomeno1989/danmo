/**
 * /api/rh/quadro/foto - A FOTO GRANDE de UM colaborador, so ela.
 *
 * O estudio de cartazes (pagina Aniversarios & Cartazes) precisa da
 * foto nitida de quem vai para o cartaz, mas nao precisa da ficha
 * inteira: esta rota devolve SO a foto (data URL) de quem e pedido,
 * com a permissao de ver do Quadro OU da pagina nova. Leve a toa:
 * um pedido por pessoa, so quando abre o estudio.
 */

import { NextResponse, NextRequest } from "next/server";
import { query } from "@/lib/supabase";
import { autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";

const idSeguro = (bruto: string | null) =>
  bruto && /^\d{1,10}$/.test(bruto) ? bruto : "";

export async function GET(req: NextRequest) {
  const auth = await autorizadoEmAlguma(["rh.quadro", "rh.aniversarios"]);
  if (eErro(auth)) return auth;
  const fichaId = idSeguro(req.nextUrl.searchParams.get("id"));
  if (!fichaId) {
    return NextResponse.json({ ok: false, erro: "Colaborador inválido." }, { status: 400 });
  }
  try {
    const linhas = await query<{ foto: string }>(
      "rh_colaborador_fotos",
      `select=foto&colaborador_id=eq.${fichaId}&limit=1`
    );
    return NextResponse.json({ ok: true, foto: linhas[0]?.foto || "" });
  } catch (e) {
    return erroBase(e, "rh quadro foto GET");
  }
}
