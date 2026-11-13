/**
 * /api/ferramentaria/os - Lookup do Nº da Obra / OS (formulário de
 * empréstimo). Escrever o número da OS traz o equipamento sozinho.
 *
 * GET ?numero=70104: procura em ordens_servico e resolve o equipamento
 * em equipment (code + name). Resolvido no SERVIDOR (o hub procurava da
 * página; o texto do equipamento nasce "CODE - nome").
 * OS não reconhecida devolve equipamento: null e o ecrã deixa escrever
 * à mão, igual ao hub.
 */

import { NextResponse, NextRequest } from "next/server";
import { queryTudo } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";

type Ordem = {
  id: number | string;
  numero_obra: string | null;
  equipment_id: number | string | null;
};

type Equipamento = {
  id: number | string;
  code: string | null;
  name: string | null;
};

export async function GET(req: NextRequest) {
  const auth = await autorizado("ferramentaria.emprestimos", "ver");
  if (eErro(auth)) return auth;
  try {
    const { searchParams } = new URL(req.url);
    const numero = (searchParams.get("numero") || "").trim();
    if (!numero) {
      return NextResponse.json({ ok: false, erro: "Indica o número da OS." }, { status: 400 });
    }

    const ordens = await queryTudo<Ordem>(
      "ordens_servico",
      `select=id,numero_obra,equipment_id&numero_obra=eq.${encodeURIComponent(numero)}&limit=1`
    );
    const ordem = ordens[0];
    if (!ordem || !ordem.equipment_id) {
      return NextResponse.json({ ok: true, os: numero, equipamento: null });
    }

    const equipamentos = await queryTudo<Equipamento>(
      "equipment",
      `select=id,code,name&id=eq.${encodeURIComponent(String(ordem.equipment_id))}&limit=1`
    );
    const equip = equipamentos[0];
    return NextResponse.json({
      ok: true,
      os: numero,
      equipamento: equip ? `${equip.code || ""} - ${equip.name || ""}`.trim() : null
    });
  } catch (e) {
    return erroBase(e, "ferramentaria os GET");
  }
}
