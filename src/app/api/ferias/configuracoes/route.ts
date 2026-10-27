/**
 * /api/ferias/configuracoes - Regras do Plano de Férias + feriados.
 *
 * GET: configuração (linha única) + feriados.
 * PUT: grava as regras (limite por setor/mês, exceção, aviso prévio,
 *      dias antes do envio ao RH, mês da folha).
 * POST: feriado novo / feriado apagar / limpeza anual (plano e
 *      alterações), esta última exigindo permissão de APAGAR.
 */

import { NextResponse, NextRequest } from "next/server";
import { del, delFiltro, insert, queryTudo, update } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import {
  mesValido,
  type FeriadoFerias,
  type ConfigFerias
} from "@/lib/ferias";

const PAGINAS_FERIAS = [
  "ferias.plano",
  "ferias.mes",
  "ferias.alteracoes",
  "ferias.configuracoes"
];

export async function GET() {
  const auth = await autorizadoEmAlguma(PAGINAS_FERIAS);
  if (eErro(auth)) return auth;
  try {
    const [config, feriados] = await Promise.all([
      queryTudo<ConfigFerias>("ferias_config", "select=*&id=eq.1"),
      queryTudo<FeriadoFerias>("ferias_feriados", "select=*&order=data.asc")
    ]);
    return NextResponse.json({ ok: true, config: config[0] || null, feriados });
  } catch (e) {
    return erroBase(e, "ferias configuracoes GET");
  }
}

export async function PUT(req: NextRequest) {
  const auth = await autorizado("ferias.configuracoes", "mexer");
  if (eErro(auth)) return auth;

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const limite = Number(corpo.limite_departamento);
    const aviso = Number(corpo.dias_aviso_alteracao);
    const envio = Number(corpo.dias_antes_envio_rh);
    const planeamento = mesValido(corpo.mes_planeamento);
    if (!Number.isInteger(limite) || limite < 1 || limite > 50) {
      return NextResponse.json(
        { ok: false, erro: "O limite por setor/mês deve estar entre 1 e 50." },
        { status: 400 }
      );
    }
    if (!Number.isInteger(aviso) || aviso < 0 || aviso > 365) {
      return NextResponse.json(
        { ok: false, erro: "O aviso prévio deve estar entre 0 e 365 dias." },
        { status: 400 }
      );
    }
    if (!Number.isInteger(envio) || envio < 0 || envio > 180) {
      return NextResponse.json(
        { ok: false, erro: "Os dias antes do envio ao RH devem estar entre 0 e 180." },
        { status: 400 }
      );
    }
    if (!planeamento) {
      return NextResponse.json(
        { ok: false, erro: "Escolhe o mês da folha anual (1 a 12)." },
        { status: 400 }
      );
    }

    const campos = {
      limite_departamento: limite,
      permitir_excedente: corpo.permitir_excedente === true,
      dias_aviso_alteracao: aviso,
      dias_antes_envio_rh: envio,
      mes_planeamento: planeamento
    };
    const existente = await queryTudo<ConfigFerias>("ferias_config", "select=id&id=eq.1");
    if (existente.length) {
      await update<ConfigFerias>("ferias_config", "id=eq.1", campos);
    } else {
      await insert<ConfigFerias>("ferias_config", { id: 1, ...campos });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "ferias configuracoes PUT");
  }
}

export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const accao = String(corpo.accao || "");

  if (accao === "feriado_novo" || accao === "feriado_apagar") {
    const auth = await autorizado("ferias.configuracoes", "mexer");
    if (eErro(auth)) return auth;
    try {
      if (accao === "feriado_novo") {
        const data = String(corpo.data || "");
        const descricao = String(corpo.descricao || "").trim().slice(0, 120);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) {
          return NextResponse.json({ ok: false, erro: "Data do feriado inválida." }, { status: 400 });
        }
        if (!descricao) {
          return NextResponse.json(
            { ok: false, erro: "Escreve a descrição do feriado." },
            { status: 400 }
          );
        }
        const recorrente = corpo.recorrente === true;
        /* Fixo: normaliza a âncora para o ano 2000 (só MM-DD importa). */
        await insert<FeriadoFerias>("ferias_feriados", {
          data: recorrente ? `2000${data.slice(4)}` : data,
          descricao,
          recorrente
        });
        return NextResponse.json({ ok: true });
      }
      const id = String(corpo.id || "");
      if (!id) {
        return NextResponse.json({ ok: false, erro: "Feriado em falta." }, { status: 400 });
      }
      await del("ferias_feriados", id);
      return NextResponse.json({ ok: true });
    } catch (e) {
      return erroBase(e, `ferias configuracoes POST ${accao}`);
    }
  }

  if (accao === "limpar_plano" || accao === "limpar_alteracoes") {
    const auth = await autorizado("ferias.configuracoes", "apagar");
    if (eErro(auth)) return auth;
    const anoQ = Number(corpo.ano);
    if (!Number.isInteger(anoQ) || anoQ < 2000 || anoQ > 2100) {
      return NextResponse.json({ ok: false, erro: "Ano inválido." }, { status: 400 });
    }
    try {
      if (accao === "limpar_plano") {
        await delFiltro("ferias_plano", `ano=eq.${anoQ}`);
      } else {
        await delFiltro("ferias_alteracoes", `ano=eq.${anoQ}`);
      }
      return NextResponse.json({ ok: true });
    } catch (e) {
      return erroBase(e, `ferias configuracoes POST ${accao}`);
    }
  }

  return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
}
