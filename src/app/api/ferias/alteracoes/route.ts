/**
 * /api/ferias/alteracoes - Adiamentos e antecipações (com histórico).
 *
 * GET ?ano=AAAA: histórico do ano + folha e colaboradores (a página usa
 *      tudo: o formulário precisa de quem TEM mês marcado).
 * POST: registra a alteração. O servidor é quem manda:
 *      - juiz partilhado (problemaAlteracao) revalidado aqui;
 *      - aviso prévio medido sobre o início já gravado (ou 1.º dia do
 *        mês previsto); insuficiente? só grava com confirmação explícita;
 *      - a viragem do ano é possível: Dez -> Jan entra na folha do ano
 *        seguinte (Jan -> Dez na do ano anterior) - defeito do hub
 *        corrigido;
 *      - a linha movida perde os dados do RH (dias, início, envio): o
 *        mês mudou, os dias de direito têm de ser revalidados pelo RH.
 */

import { NextResponse, NextRequest } from "next/server";
import { delFiltro, insert, queryTudo, upsert } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import { pode } from "@/lib/auth";
import { dataHojeISO } from "@/lib/rh";
import {
  anoDoMesNovo,
  avaliarAviso,
  baseAviso,
  contaNoMes,
  FILTRO_EMPRESA_FERIAS,
  mesValido,
  planoNoAmbito,
  problemaAlteracao,
  setorDe,
  vivas,
  type AlteracaoFerias,
  type ColabFerias,
  type ConfigFerias,
  type LinhaPlano
} from "@/lib/ferias";

const CONFIG_POR_OMISSAO: ConfigFerias = {
  id: 1,
  limite_departamento: 2,
  permitir_excedente: true,
  dias_aviso_alteracao: 30,
  dias_antes_envio_rh: 10,
  mes_planeamento: 10
};

/* Só a gente da DANMO PORTO: é quem a Adm. Oficinal gere. */
async function colaboradoresActivos(): Promise<ColabFerias[]> {
  const rows = await queryTudo<ColabFerias & { active: boolean | null }>(
    "collaborators",
    `select=id,name,code,categoria,setor,active&order=name.asc&${FILTRO_EMPRESA_FERIAS}`
  );
  return rows
    .filter((c) => c.active !== false)
    .map(({ active: _active, ...c }) => c);
}

export async function GET(req: NextRequest) {
  const auth = await autorizadoEmAlguma([
    "ferias.alteracoes",
    "ferias.plano",
    "ferias.mes"
  ]);
  if (eErro(auth)) return auth;
  const anoQ = Number(new URL(req.url).searchParams.get("ano"));
  const hoje = dataHojeISO();
  const ano =
    Number.isInteger(anoQ) && anoQ >= 2000 && anoQ <= 2100
      ? anoQ
      : Number(hoje.slice(0, 4));
  try {
    const [alteracoes, planoBruto, colaboradores] = await Promise.all([
      queryTudo<AlteracaoFerias>(
        "ferias_alteracoes",
        `select=*&ano=eq.${ano}&order=criado_em.desc`
      ),
      queryTudo<LinhaPlano>("ferias_plano", `select=*&ano=eq.${ano}`),
      colaboradoresActivos()
    ]);
    return NextResponse.json({
      ok: true,
      ano,
      alteracoes,
      plano: planoNoAmbito(planoBruto, colaboradores),
      colaboradores
    });
  } catch (e) {
    return erroBase(e, "ferias alteracoes GET");
  }
}

export async function POST(req: NextRequest) {
  const sessao = await autorizado("ferias.alteracoes", "mexer");
  if (eErro(sessao)) return sessao;

  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const hoje = dataHojeISO();
    const anoQ = Number(corpo.ano);
    const ano =
      Number.isInteger(anoQ) && anoQ >= 2000 && anoQ <= 2100
        ? anoQ
        : Number(hoje.slice(0, 4));

    const [planoBruto, colaboradores] = await Promise.all([
      queryTudo<LinhaPlano>("ferias_plano", `select=*&ano=eq.${ano}`),
      colaboradoresActivos()
    ]);
    const plano = planoNoAmbito(planoBruto, colaboradores);
    const linhas = vivas(plano, colaboradores);

    const colabId = Number(corpo.colaborador_id);
    const colab = colaboradores.find((c) => c.id === colabId);
    if (!colab) {
      return NextResponse.json(
        { ok: false, erro: "Colaborador não encontrado (ou inactivo)." },
        { status: 404 }
      );
    }
    const origem = linhas.find((l) => l.collaborator_id === colabId);

    const tipo = String(corpo.tipo || "");
    const mesNovo = mesValido(corpo.mes_novo);
    const motivo = String(corpo.motivo || "").slice(0, 500);
    const inicioNovo = corpo.data_inicio_nova ? String(corpo.data_inicio_nova) : null;

    /* Juiz partilhado (mesma régua da página): campos e direção. */
    const problema = problemaAlteracao({
      tipo,
      mesAnterior: origem?.mes_previsto || null,
      mesNovo: mesNovo || 0,
      motivo,
      temMes: Boolean(origem?.mes_previsto)
    });
    if (problema) {
      return NextResponse.json({ ok: false, erro: problema }, { status: 400 });
    }
    if (inicioNovo && !/^\d{4}-\d{2}-\d{2}$/.test(inicioNovo)) {
      return NextResponse.json({ ok: false, erro: "Nova data de início inválida." }, { status: 400 });
    }

    /* Aviso prévio: mede-se contra o início já gravado (ou o 1.º dia do
       mês actual da folha). Insuficiente? só com confirmação explícita. */
    const cfg = await queryTudo<ConfigFerias>("ferias_config", "select=*&id=eq.1");
    const config = cfg[0] || CONFIG_POR_OMISSAO;
    const base = baseAviso(ano, origem!.mes_previsto!, origem!.data_inicio);
    const aviso = avaliarAviso(hoje, base, config.dias_aviso_alteracao);
    if (!aviso.ok && corpo.aceita_aviso !== true) {
      return NextResponse.json(
        {
          ok: false,
          precisaConfirmacao: true,
          erro: `Aviso prévio insuficiente: faltam ${aviso.dias} dias (o mínimo é ${config.dias_aviso_alteracao}). Registar na mesma?`
        },
        { status: 409 }
      );
    }

    const mesAnterior = origem!.mes_previsto!;
    const novoAno = anoDoMesNovo(ano, tipo, mesAnterior, mesNovo!);

    /* Limite no mês de destino, contando TODAS as folhas envolvidas
       (a própria linha sai da conta). Numa mudança de ano, o alvo pode
       já ter linha na outra folha: reutiliza-se ou recusa-se. */
    const alvoExiste =
      novoAno === ano
        ? origem!
        : (
            await queryTudo<LinhaPlano>(
              "ferias_plano",
              `select=*&ano=eq.${novoAno}&collaborator_id=eq.${colabId}`
            )
          )[0] || null;
    if (alvoExiste && novoAno !== ano && alvoExiste.mes_previsto) {
      return NextResponse.json(
        {
          ok: false,
          erro: `${colab.name} já tem mês marcado na folha de ${novoAno}. Tira-o de lá primeiro.`
        },
        { status: 409 }
      );
    }
    if (alvoExiste && novoAno === ano && alvoExiste.mes_previsto === mesNovo) {
      return NextResponse.json(
        { ok: false, erro: "O mês novo é o mesmo que está marcado." },
        { status: 400 }
      );
    }
    const configLimite = config;
    const jaLa = contaNoMes(
      vivas(
        plano.filter((l) => l.id !== origem!.id),
        colaboradores
      ),
      setorDe(colab),
      mesNovo!
    );
    if (jaLa >= configLimite.limite_departamento) {
      if (!configLimite.permitir_excedente) {
        return NextResponse.json(
          {
            ok: false,
            erro: `O setor "${setorDe(colab)}" já tem ${jaLa} nesse mês (limite ${configLimite.limite_departamento}).`
          },
          { status: 409 }
        );
      }
      if (corpo.aceita_excedente !== true) {
        return NextResponse.json(
          {
            ok: false,
            precisaConfirmacao: true,
            erro: `Aviso: o setor "${setorDe(colab)}" passa de ${configLimite.limite_departamento} nesse mês (${jaLa + 1} ao todo). Confirmar na mesma?`
          },
          { status: 409 }
        );
      }
    }

    /* Movimento: a linha de destino nasce limpa (dias do RH voltam a
       zero porque o mês mudou); a de origem, noutra folha, sai. */
    const camposDestino = {
      ano: novoAno,
      collaborator_id: colabId,
      mes_previsto: mesNovo,
      status: "Planeado",
      enviado_rh_em: null,
      enviado_rh_por: null,
      dias_rh: null,
      data_inicio: inicioNovo,
      data_fim: null,
      obs_rh: null
    };
    await upsert<LinhaPlano>("ferias_plano", camposDestino, "ano,collaborator_id");
    if (novoAno !== ano) {
      await delFiltro("ferias_plano", `ano=eq.${ano}&collaborator_id=eq.${colabId}`);
    }

    await insert<AlteracaoFerias>("ferias_alteracoes", {
      ano,
      collaborator_id: colabId,
      tipo,
      mes_anterior: mesAnterior,
      mes_novo: mesNovo,
      data_inicio_anterior: origem!.data_inicio,
      data_inicio_nova: inicioNovo,
      motivo,
      aviso_dias: aviso.dias,
      aviso_ok: aviso.ok,
      registado_por: sessao.utilizador.nome || "Administração Oficinal"
    });

    return NextResponse.json({ ok: true, novoAno });
  } catch (e) {
    return erroBase(e, "ferias alteracoes POST");
  }
}
