/**
 * /api/rh/quadro/[id] - Uma ficha do Quadro de Pessoal.
 *
 * GET: ficha completa + foto (tabela a parte, so aqui).
 * PATCH: duas coisas, conforme o pedido:
 *   - { accao: "editar", dados }  -> grava a ficha (mesmo juiz do POST);
 *   - { accao: "promover" }       -> fim de estagio com permanencia:
 *       a ficha passa a efetivo, o resultado fica registado e a data
 *       de admissao passa a ser a do inicio do estagio (o tempo de
 *       estagio conta para o tempo de casa).
 *   - { accao: "nao_permaneceu" } -> fim de estagio sem permanencia:
 *       ficha inactiva na data indicada (ou hoje) e resultado ficado.
 * DELETE: apagar a ficha (e a foto, por cascata).
 *
 * A foto entra por accao propria: { accao: "foto", foto: dataURL }
 * grava, { accao: "foto", foto: "" } apaga. So mexer.
 */

import { NextResponse, NextRequest } from "next/server";
import { del, query, update, upsert } from "@/lib/supabase";
import { autorizado, eErro, erroBase } from "@/lib/guarda-api";
import {
  dataHojeISO,
  normalizarCodigo,
  payloadDaFicha,
  problemaDaFicha,
  type Colaborador,
  type DadosFicha
} from "@/lib/rh";

type Contexto = { params: Promise<{ id: string }> };

const idSeguro = (bruto: string) => (/^\d{1,10}$/.test(bruto) ? bruto : "");
const MAX_FOTO_BASE64 = 700_000;

const CAMPOS_RH = [
  "code", "name", "categoria", "setor", "empresa", "tipo_colaborador",
  "tipo_vinculo", "empresa_origem", "data_admissao_danmo", "data_admissao_grupo",
  "estagio_instituicao", "estagio_orientador", "estagio_data_inicio", "estagio_data_fim",
  "active", "data_inativo", "data_nascimento", "naturalidade", "estado_civil",
  "endereco", "num_dependentes", "mes_ferias", "bi_numero", "inss_numero",
  "nuit_numero", "contacto_1", "contacto_2", "email", "grupo_sanguineo",
  "doenca_cronica", "altura_cm", "observacoes_gerais"
];

export async function GET(_req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("rh.quadro", "ver");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  const fichaId = idSeguro(id);
  if (!fichaId) return NextResponse.json({ ok: false, erro: "Ficha inválida." }, { status: 400 });
  try {
    const linhas = await query<Colaborador>("collaborators", `select=*&id=eq.${fichaId}`);
    if (!linhas[0]) {
      return NextResponse.json({ ok: false, erro: "Ficha não encontrada." }, { status: 404 });
    }
    const fotos = await query<{ foto: string }>(
      "rh_colaborador_fotos",
      `select=foto&colaborador_id=eq.${fichaId}&limit=1`
    );
    return NextResponse.json({ ok: true, colaborador: linhas[0], foto: fotos[0]?.foto || "" });
  } catch (e) {
    return erroBase(e, "rh quadro [id] GET");
  }
}

export async function PATCH(req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("rh.quadro", "mexer");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  const fichaId = idSeguro(id);
  if (!fichaId) return NextResponse.json({ ok: false, erro: "Ficha inválida." }, { status: 400 });
  try {
    const corpo = (await req.json()) as {
      accao?: string;
      dados?: DadosFicha;
      data_fim?: string;
      foto?: string;
    };

    if (corpo.accao === "foto") {
      if (typeof corpo.foto !== "string") {
        return NextResponse.json({ ok: false, erro: "Foto inválida." }, { status: 400 });
      }
      if (corpo.foto === "") {
        await del("rh_colaborador_fotos", fichaId);
        return NextResponse.json({ ok: true, foto: "" });
      }
      if (corpo.foto.length > MAX_FOTO_BASE64) {
        return NextResponse.json(
          { ok: false, erro: "A foto ficou grande demais depois de comprimida. Tenta outra." },
          { status: 413 }
        );
      }
      await upsert("rh_colaborador_fotos", { colaborador_id: Number(fichaId), foto: corpo.foto }, "colaborador_id");
      return NextResponse.json({ ok: true, foto: corpo.foto });
    }

    if (corpo.accao === "promover" || corpo.accao === "nao_permaneceu") {
      const actuais = await query<Colaborador>("collaborators", `select=*&id=eq.${fichaId}`);
      const ficha = actuais[0];
      if (!ficha) return NextResponse.json({ ok: false, erro: "Ficha não encontrada." }, { status: 404 });
      if ((ficha.tipo_colaborador || "") !== "estagiario") {
        return NextResponse.json(
          { ok: false, erro: "Esta acção só vale para estagiários." },
          { status: 400 }
        );
      }
      if (corpo.accao === "promover") {
        const mudancas: Record<string, unknown> = {
          tipo_colaborador: "efetivo",
          tipo_vinculo: "contratado",
          estagio_resultado: "promovido",
          data_admissao_danmo: ficha.data_admissao_danmo || ficha.estagio_data_inicio || dataHojeISO()
        };
        const novas = await update<Colaborador>("collaborators", `id=eq.${fichaId}`, mudancas);
        return NextResponse.json({ ok: true, colaborador: novas[0] });
      }
      const dataFim = /^\d{4}-\d{2}-\d{2}$/.test(corpo.data_fim || "") ? corpo.data_fim! : dataHojeISO();
      const mudancas: Record<string, unknown> = {
        active: false,
        data_inativo: dataFim,
        estagio_resultado: "nao_permaneceu"
      };
      const novas = await update<Colaborador>("collaborators", `id=eq.${fichaId}`, mudancas);
      return NextResponse.json({ ok: true, colaborador: novas[0] });
    }

    if (corpo.accao !== "editar" || !corpo.dados) {
      return NextResponse.json({ ok: false, erro: "Pedido desconhecido." }, { status: 400 });
    }

    const problema = problemaDaFicha(corpo.dados);
    if (problema) return NextResponse.json({ ok: false, erro: problema }, { status: 400 });

    const codigo = normalizarCodigo(corpo.dados.code);
    const existentes = await query<{ id: number; code: string | null }>(
      "collaborators",
      "select=id,code"
    );
    const duplicado = existentes.some(
      (c) => normalizarCodigo(c.code) === codigo && String(c.id) !== fichaId
    );
    if (duplicado) {
      return NextResponse.json(
        { ok: false, erro: `O codigo ${codigo} ja pertence a outra ficha.` },
        { status: 409 }
      );
    }

    const payload = payloadDaFicha(corpo.dados);
    const soRH: Record<string, unknown> = {};
    for (const campo of CAMPOS_RH) soRH[campo] = payload[campo];
    const novas = await update<Colaborador>("collaborators", `id=eq.${fichaId}`, soRH);
    if (!novas[0]) return NextResponse.json({ ok: false, erro: "Ficha não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true, colaborador: novas[0] });
  } catch (e) {
    return erroBase(e, "rh quadro [id] PATCH");
  }
}

export async function DELETE(_req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("rh.quadro", "apagar");
  if (eErro(auth)) return auth;
  const { id } = await ctx.params;
  const fichaId = idSeguro(id);
  if (!fichaId) return NextResponse.json({ ok: false, erro: "Ficha inválida." }, { status: 400 });
  try {
    await del("collaborators", fichaId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return erroBase(e, "rh quadro [id] DELETE");
  }
}
