/**
 * /api/rh/quadro/fotos - Fotos LEVES para a grelha do Quadro.
 *
 * A grelha quer ver a cara de cada um sem carregar a foto grande de
 * cada ficha. Esta rota devolve, num unico pedido, a MINI de cada
 * colaborador (a versao quadrada e leve gerada no navegador no
 * momento do upload). Quem ainda nao tem mini (fotos gravadas antes
 * de a mini existir) sai pela foto grande mesmo, que e melhor do que
 * o cartao ficar sem cara; gravar a foto outra vez na ficha cria a
 * mini. A foto grande para o ZOOM continua a sair da rota da ficha.
 *
 * Leitura com a mesma permissao da pagina (rh.quadro, ver).
 */

import { NextResponse } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import { fotosParaGrelha } from "@/lib/rh";

export async function GET() {
  const auth = await autorizado("rh.quadro", "ver");
  if (eErro(auth)) return auth;
  try {
    const [minis, grandes] = await Promise.all([
      queryTudo<{ colaborador_id: number; mini: string }>(
        "rh_colaborador_fotos",
        "select=colaborador_id,mini&mini=not.is.null"
      ),
      queryTudo<{ colaborador_id: number; foto: string }>(
        "rh_colaborador_fotos",
        "select=colaborador_id,foto&mini=is.null"
      )
    ]);
    return NextResponse.json({ ok: true, fotos: fotosParaGrelha(minis, grandes) });
  } catch (e) {
    return erroBase(e, "rh quadro fotos GET");
  }
}
