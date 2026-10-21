/**
 * /api/oficina/faturacao - Módulo "Faturação CdM" (obras fechadas).
 *
 * GET  ?ano=AAAA  -> lista dos fechos (com obra, máquina, materiais,
 *                    tempo nosso vs tempo da CdM, diferenças e dias),
 *                    resumo mês a mês e totais gerais.
 * POST            -> "editar-fecho"  (corrige valores; recalcula totais)
 *                    "apagar-fecho"  (remove o registo de faturação)
 *
 * Os totais são SEMPRE recalculados aqui no servidor. As horas do nosso
 * pessoal vêm da tabela records (intervenções da obra).
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, update } from "@/lib/supabase";
import { autorizadoOficina, eErro, erroBase, type AccaoOficina } from "@/lib/guarda-api";
import type {
  Equipamento,
  LinhaFaturacao,
  MaterialFecho,
  OrdemServico,
  ResumoMes
} from "@/lib/oficina";

const arred2 = (n: number) => Math.round(n * 100) / 100;

/** Dias entre duas datas "YYYY-MM-DD" (0 se faltar alguma). */
function diasEntre(de?: string | null, ate?: string | null): number {
  if (!de || !ate) return 0;
  const a = new Date(de.slice(0, 10) + "T00:00:00");
  const b = new Date(ate.slice(0, 10) + "T00:00:00");
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

type FechoBase = {
  id: number;
  os_id: number;
  data_fecho: string;
  horas_cdm: number;
  valor_hora: number;
  total_mao_obra: number;
  total_material: number;
  total_geral: number;
  responsavel?: string | null;
  observacao?: string | null;
  criado_em?: string;
};

type RecLinha = { os_id: number; hours: number | null; shift_date: string | null };

export async function GET(req: NextRequest) {
  const auth = await autorizadoOficina("oficina.faturacao", "ver");
  if (eErro(auth)) return auth;

  const url = new URL(req.url);
  const ano = Number(url.searchParams.get("ano") || 0);

  try {
    let fechos: FechoBase[];
    try {
      fechos = await query<FechoBase>(
        "obras_fechadas_cdm",
        "select=*&order=data_fecho.desc,id.desc"
      );
    } catch (e) {
      const msg = String((e as { message?: string })?.message || "");
      if (msg.includes("does not exist") || msg.includes("Could not find the table")) {
        return NextResponse.json(
          {
            ok: false,
            erro:
              "As tabelas da Faturação CdM ainda não existem na base. Corre o ficheiro sql/fase3b-faturacao-cdm.sql no Supabase (SQL Editor)."
          },
          { status: 400 }
        );
      }
      throw e;
    }

    if (ano) fechos = fechos.filter((f) => f.data_fecho.slice(0, 4) === String(ano));

    const osIds = [...new Set(fechos.map((f) => f.os_id))];
    const fechoIds = fechos.map((f) => f.id);

    // Obra, máquina, materiais e o nosso tempo (intervenções)
    const [obras, eqs, materiais, recs] = await Promise.all([
      osIds.length
        ? query<OrdemServico>(
            "ordens_servico",
            `select=id,numero_obra,equipment_id,sector,data_abertura,status_atual,descricao_avaria&id=in.(${osIds.join(",")})`
          )
        : Promise.resolve([] as OrdemServico[]),
      osIds.length
        ? query<Equipamento>("equipment", "select=id,code&order=code.asc")
        : Promise.resolve([] as Equipamento[]),
      fechoIds.length
        ? query<MaterialFecho>(
            "obras_fechadas_cdm_material",
            `select=*&fecho_id=in.(${fechoIds.join(",")})&order=id.asc`
          )
        : Promise.resolve([] as MaterialFecho[]),
      osIds.length
        ? query<RecLinha>(
            "records",
            `select=os_id,hours,shift_date&os_id=in.(${osIds.join(",")})`
          )
        : Promise.resolve([] as RecLinha[])
    ]);

    const mapaObra = new Map(obras.map((o) => [o.id, o]));
    const mapaEq = new Map(eqs.map((e) => [e.id, e]));

    // Tempo do nosso pessoal: soma das horas das intervenções por obra
    const horasPorOs = new Map<number, number>();
    const ultimaPorOs = new Map<number, string>();
    recs.forEach((r) => {
      if (r.os_id == null) return;
      const h = Number(r.hours) || 0;
      horasPorOs.set(r.os_id, (horasPorOs.get(r.os_id) || 0) + h);
      const d = (r.shift_date || "").slice(0, 10);
      if (d && d > (ultimaPorOs.get(r.os_id) || "")) ultimaPorOs.set(r.os_id, d);
    });

    const linhas: LinhaFaturacao[] = fechos.map((f) => {
      const obra = mapaObra.get(f.os_id);
      const equip = obra?.equipment_id ? mapaEq.get(obra.equipment_id) : undefined;
      const horasNossas = arred2(horasPorOs.get(f.os_id) || 0);
      const ultima = ultimaPorOs.get(f.os_id) || null;
      const mats = materiais.filter((m) => m.fecho_id === f.id);
      return {
        ...f,
        materiais: mats,
        numero_obra: obra?.numero_obra || null,
        equipment_id: obra?.equipment_id || null,
        equip_code: equip?.code || null,
        sector: obra?.sector || null,
        data_abertura: obra?.data_abertura || null,
        diagnostico: obra?.descricao_avaria || null,
        horas_nossas: horasNossas,
        data_ultima_intervencao: ultima,
        dias_ate_fecho: diasEntre(obra?.data_abertura, f.data_fecho),
        dias_apos_trabalho: ultima ? diasEntre(ultima, f.data_fecho) : 0,
        diferenca_horas: arred2(f.horas_cdm - horasNossas)
      };
    });

    // Resumo mês a mês (pela data de fecho)
    const mapaMes = new Map<string, ResumoMes>();
    linhas.forEach((l) => {
      const mes = l.data_fecho.slice(0, 7);
      const atual =
        mapaMes.get(mes) ||
        { mes, obras: 0, horas_cdm: 0, horas_nossas: 0, total_material: 0, total_geral: 0 };
      atual.obras += 1;
      atual.horas_cdm = arred2(atual.horas_cdm + l.horas_cdm);
      atual.horas_nossas = arred2(atual.horas_nossas + l.horas_nossas);
      atual.total_material = arred2(atual.total_material + l.total_material);
      atual.total_geral = arred2(atual.total_geral + l.total_geral);
      mapaMes.set(mes, atual);
    });
    const porMes = [...mapaMes.values()].sort((a, b) => (a.mes < b.mes ? 1 : -1));

    const totais = {
      obras: linhas.length,
      horas_cdm: arred2(linhas.reduce((s, l) => s + l.horas_cdm, 0)),
      horas_nossas: arred2(linhas.reduce((s, l) => s + l.horas_nossas, 0)),
      total_mao_obra: arred2(linhas.reduce((s, l) => s + l.total_mao_obra, 0)),
      total_material: arred2(linhas.reduce((s, l) => s + l.total_material, 0)),
      total_geral: arred2(linhas.reduce((s, l) => s + l.total_geral, 0))
    };

    return NextResponse.json({ ok: true, linhas, porMes, totais });
  } catch (e) {
    return erroBase(e, "faturacao GET");
  }
}

/* ============ POST: editar / apagar fecho ============ */

type Corpo = {
  action: "editar-fecho" | "apagar-fecho";
  id?: number;
  fecho?: {
    data_fecho: string;
    horas_cdm: number;
    valor_hora: number;
    materiais: { material: string; quantidade: number; valor_unitario: number }[];
    observacao?: string | null;
  };
};

const PERMISSOES: Record<string, AccaoOficina> = {
  "editar-fecho": "editar",
  "apagar-fecho": "apagar"
};

export async function POST(req: NextRequest) {
  const auth0 = await autorizadoOficina("oficina.faturacao", "ver");
  if (eErro(auth0)) return auth0;

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  const accao = PERMISSOES[corpo.action];
  if (!accao) {
    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  }
  const auth = await autorizadoOficina("oficina.faturacao", accao);
  if (eErro(auth)) return auth;

  const fechoId = Number(corpo.id);
  if (!fechoId) {
    return NextResponse.json({ ok: false, erro: "Fecho não indicado." }, { status: 400 });
  }

  try {
    if (corpo.action === "editar-fecho") {
      const f = corpo.fecho;
      if (!f) {
        return NextResponse.json({ ok: false, erro: "Faltam os dados do fecho." }, { status: 400 });
      }
      const dataFecho = (f.data_fecho || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dataFecho)) {
        return NextResponse.json({ ok: false, erro: "Data de fecho inválida." }, { status: 400 });
      }
      const horas = Number(f.horas_cdm);
      const valor = Number(f.valor_hora);
      if (!Number.isFinite(horas) || horas < 0) {
        return NextResponse.json({ ok: false, erro: "Horas da CdM inválidas." }, { status: 400 });
      }
      if (!Number.isFinite(valor) || valor < 0) {
        return NextResponse.json({ ok: false, erro: "Valor por hora inválido." }, { status: 400 });
      }
      const matsLimpos = (f.materiais || [])
        .map((m) => ({
          material: (m.material || "").trim(),
          quantidade: Number(m.quantidade),
          valor_unitario: Number(m.valor_unitario)
        }))
        .filter(
          (m) =>
            m.material &&
            Number.isFinite(m.quantidade) &&
            m.quantidade > 0 &&
            Number.isFinite(m.valor_unitario) &&
            m.valor_unitario >= 0
        );
      const totalMao = arred2(horas * valor);
      const totalMat = arred2(
        matsLimpos.reduce((s, m) => s + m.quantidade * m.valor_unitario, 0)
      );

      await update("obras_fechadas_cdm", `id=eq.${fechoId}`, {
        data_fecho: dataFecho,
        horas_cdm: horas,
        valor_hora: valor,
        total_mao_obra: totalMao,
        total_material: totalMat,
        total_geral: arred2(totalMao + totalMat),
        observacao: (f.observacao || "").trim() || null
      });
      // Materiais: substitui todos (busca os ids e apaga um a um;
      // depois insere a lista nova)
      const antigos = await query<{ id: number }>(
        "obras_fechadas_cdm_material",
        `select=id&fecho_id=eq.${fechoId}`
      );
      for (const m of antigos) {
        await del("obras_fechadas_cdm_material", m.id);
      }
      if (matsLimpos.length) {
        await insert(
          "obras_fechadas_cdm_material",
          matsLimpos.map((m) => ({
            fecho_id: fechoId,
            material: m.material,
            quantidade: m.quantidade,
            valor_unitario: m.valor_unitario,
            total: arred2(m.quantidade * m.valor_unitario)
          }))
        );
      }
      return NextResponse.json({ ok: true });
    }

    if (corpo.action === "apagar-fecho") {
      // A tabela de materiais apaga-se em cascata (on delete cascade no SQL)
      await del("obras_fechadas_cdm", fechoId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  } catch (e) {
    return erroBase(e, `faturacao POST ${corpo.action}`);
  }
}
