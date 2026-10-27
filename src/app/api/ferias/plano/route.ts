/**
 * /api/ferias/plano - Folha anual do Plano de Férias (Admin. Oficinal).
 *
 * GET ?ano=AAAA: tudo de que as páginas precisam para um ano (plano,
 *      colaboradores activos, configuração, feriados e alterações).
 * POST: acções de escrita. O LIMITE por setor/mês é validado AQUI no
 *      servidor (a folha não pode mentir por causa de um navegador velho)
 *      e, quando a configuração permite excedente, o aviso sobe no corpo
 *      da resposta para o cliente pedir confirmação.
 */

import { NextResponse, NextRequest } from "next/server";
import { delFiltro, insert, queryTudo, update, upsert } from "@/lib/supabase";
import { autorizado, autorizadoEmAlguma, eErro, erroBase } from "@/lib/guarda-api";
import { pode, type Sessao } from "@/lib/auth";
import { dataHojeISO } from "@/lib/rh";
import {
  contaNoMes,
  FILTRO_EMPRESA_FERIAS,
  fimDe,
  mesValido,
  planoNoAmbito,
  setorDe,
  vivas,
  type AlteracaoFerias,
  type ColabFerias,
  type ConfigFerias,
  type FeriadoFerias,
  type LinhaPlano
} from "@/lib/ferias";

const PAGINAS_FERIAS = [
  "ferias.plano",
  "ferias.mes",
  "ferias.alteracoes",
  "ferias.configuracoes"
];

const CONFIG_POR_OMISSAO: ConfigFerias = {
  id: 1,
  limite_departamento: 2,
  permitir_excedente: true,
  dias_aviso_alteracao: 30,
  dias_antes_envio_rh: 10,
  mes_planeamento: 10
};

/* Só a gente da DANMO PORTO: é quem a Adm. Oficinal gere (o TCM e os
   sem classificar ficam fora das folhas). */
async function colaboradoresActivos(): Promise<ColabFerias[]> {
  const rows = await queryTudo<ColabFerias & { active: boolean | null }>(
    "collaborators",
    `select=id,name,code,categoria,setor,active&order=name.asc&${FILTRO_EMPRESA_FERIAS}`
  );
  return rows
    .filter((c) => c.active !== false)
    .map(({ active: _active, ...c }) => c);
}

async function configDoPortal(): Promise<ConfigFerias> {
  const cfg = await queryTudo<ConfigFerias>("ferias_config", "select=*&id=eq.1");
  return cfg[0] || CONFIG_POR_OMISSAO;
}

/** Mexer na folha: serve ao Plano Anual e à Folha do Mês. */
function podeMexerFolha(sessao: Sessao): boolean {
  return pode(sessao, "ferias.plano", "mexer") || pode(sessao, "ferias.mes", "mexer");
}

/* ============ GET ============ */

export async function GET(req: NextRequest) {
  const auth = await autorizadoEmAlguma(PAGINAS_FERIAS);
  if (eErro(auth)) return auth;
  const anoQ = Number(new URL(req.url).searchParams.get("ano"));
  const ano =
    Number.isInteger(anoQ) && anoQ >= 2000 && anoQ <= 2100
      ? anoQ
      : Number(dataHojeISO().slice(0, 4));
  try {
    const [planoBruto, colaboradores, config, feriados, alteracoes] = await Promise.all([
      queryTudo<LinhaPlano>("ferias_plano", `select=*&ano=eq.${ano}`),
      colaboradoresActivos(),
      configDoPortal(),
      queryTudo<FeriadoFerias>("ferias_feriados", "select=*"),
      queryTudo<AlteracaoFerias>(
        "ferias_alteracoes",
        `select=*&ano=eq.${ano}&order=criado_em.desc`
      )
    ]);
    return NextResponse.json({
      ok: true,
      ano,
      plano: planoNoAmbito(planoBruto, colaboradores),
      colaboradores,
      config,
      feriados,
      alteracoes
    });
  } catch (e) {
    return erroBase(e, "ferias plano GET");
  }
}

/* ============ POST (acções) ============ */

export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const accao = String(corpo.accao || "");

  const guardas: Record<string, { pagina: string; accao: string }> = {
    marcar: { pagina: "ferias.plano", accao: "mexer" },
    desmarcar: { pagina: "ferias.plano", accao: "mexer" },
    gravar: { pagina: "ferias.plano", accao: "mexer" },
    marcar_enviado: { pagina: "ferias.mes", accao: "mexer" },
    carregar_todos: { pagina: "ferias.plano", accao: "mexer" },
    duplicar_ano: { pagina: "ferias.plano", accao: "mexer" }
  };
  const guarda = guardas[accao];
  if (!guarda) {
    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  }

  const sessao = await autorizado(guarda.pagina, guarda.accao);
  if (eErro(sessao)) return sessao;
  const mudaFolha = podeMexerFolha(sessao);
  if (!mudaFolha) {
    return NextResponse.json(
      { ok: false, erro: "Não tens permissão para mexer na folha de férias." },
      { status: 403 }
    );
  }

  try {
    const hoje = dataHojeISO();
    const anoQ = Number(corpo.ano);
    const ano =
      Number.isInteger(anoQ) && anoQ >= 2000 && anoQ <= 2100
        ? anoQ
        : Number(hoje.slice(0, 4));

    /* Estado actual do ano: uma leitura para todas as acções (o juiz do
       limite precisa das linhas e dos setores de qualquer maneira). */
    const colaboradores = await colaboradoresActivos();
    const plano = planoNoAmbito(
      await queryTudo<LinhaPlano>("ferias_plano", `select=*&ano=eq.${ano}`),
      colaboradores
    );
    const linhas = vivas(plano, colaboradores);

    if (accao === "marcar" || accao === "gravar") {
      const colabId = Number(corpo.colaborador_id);
      const colab = colaboradores.find((c) => c.id === colabId);
      if (!colab) {
        return NextResponse.json(
          { ok: false, erro: "Colaborador não encontrado (ou inactivo)." },
          { status: 404 }
        );
      }
      const linha = linhas.find((l) => l.collaborator_id === colabId);

      let mes: number | null;
      let dias: number | null = null;
      let inicio: string | null = null;
      let obs: string | null = null;
      let enviadoEm: string | null = null;
      let enviadoPor: string | null = null;

      if (accao === "marcar") {
        mes = mesValido(corpo.mes);
        if (!mes) {
          return NextResponse.json({ ok: false, erro: "Mês inválido." }, { status: 400 });
        }
        if (linha?.mes_previsto) {
          return NextResponse.json(
            { ok: false, erro: `${colab.name} já tem férias marcadas neste ano.` },
            { status: 409 }
          );
        }
      } else {
        /* gravar: o mês pode manter-se, mudar ou sair (null). Os campos
           do RH vêm quando é o lançamento da resposta (Folha do Mês). */
        mes = corpo.mes === null ? null : mesValido(corpo.mes);
        if (corpo.mes !== null && !mes) {
          return NextResponse.json({ ok: false, erro: "Mês inválido." }, { status: 400 });
        }
        dias =
          corpo.dias_rh === null || corpo.dias_rh === undefined || corpo.dias_rh === ""
            ? null
            : Number(corpo.dias_rh);
        if (dias !== null && (!(dias > 0) || dias > 366)) {
          return NextResponse.json(
            { ok: false, erro: "Os dias de direito devem estar entre 1 e 366." },
            { status: 400 }
          );
        }
        inicio = corpo.data_inicio ? String(corpo.data_inicio) : null;
        if (inicio && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
          return NextResponse.json({ ok: false, erro: "Data de início inválida." }, { status: 400 });
        }
        obs = corpo.obs_rh ? String(corpo.obs_rh).slice(0, 500) : null;
        enviadoEm = linha?.enviado_rh_em || null;
        enviadoPor = linha?.enviado_rh_por || null;
      }

      /* Limite por setor/mês: só se o mês está a ficar marcado ou a
         MUDAR de mês (a própria linha não se conta a si mesma). */
      if (mes && (!linha || linha.mes_previsto !== mes)) {
        const config = await configDoPortal();
        const jaLa = contaNoMes(linhas.filter((l) => l.id !== linha?.id), setorDe(colab), mes);
        if (jaLa >= config.limite_departamento) {
          if (!config.permitir_excedente) {
            return NextResponse.json(
              {
                ok: false,
                erro: `O setor "${setorDe(colab)}" já tem ${jaLa} no mês escolhido (limite ${config.limite_departamento}). Ajusta a configuração se quiseres permitir excedente.`
              },
              { status: 409 }
            );
          }
          if (corpo.aceita_excedente !== true) {
            return NextResponse.json(
              {
                ok: false,
                precisaConfirmacao: true,
                erro: `Aviso: o setor "${setorDe(colab)}" passa de ${config.limite_departamento} no mês escolhido (${jaLa + 1} ao todo). Confirmar na mesma?`
              },
              { status: 409 }
            );
          }
        }
      }

      const fim = inicio && dias ? fimDe(inicio, dias) : null;
      const status =
        dias && inicio
          ? "Confirmado"
          : enviadoEm || linha?.enviado_rh_em
            ? "Aguarda RH"
            : "Planeado";

      const campos = {
        ano,
        collaborator_id: colabId,
        mes_previsto: mes,
        status,
        enviado_rh_em: enviadoEm,
        enviado_rh_por: enviadoPor,
        dias_rh: dias,
        data_inicio: inicio,
        data_fim: fim,
        obs_rh: obs
      };

      if (mes === null && linha) {
        /* Sem mês, sem sentido: a linha sai (o histórico fica à parte). */
        await delFiltro("ferias_plano", `ano=eq.${ano}&collaborator_id=eq.${colabId}`);
        return NextResponse.json({ ok: true, linha: null });
      }

      const gravado = await upsert<LinhaPlano>(
        "ferias_plano",
        campos,
        "ano,collaborator_id"
      );
      return NextResponse.json({ ok: true, linha: gravado[0] || null });
    }

    if (accao === "desmarcar") {
      const colabId = Number(corpo.colaborador_id);
      if (!colabId) {
        return NextResponse.json({ ok: false, erro: "Colaborador em falta." }, { status: 400 });
      }
      await delFiltro("ferias_plano", `ano=eq.${ano}&collaborator_id=eq.${colabId}`);
      return NextResponse.json({ ok: true });
    }

    if (accao === "marcar_enviado") {
      const mes = mesValido(corpo.mes);
      if (!mes) {
        return NextResponse.json({ ok: false, erro: "Mês inválido." }, { status: 400 });
      }
      const autor = sessao.utilizador.nome || "Administração Oficinal";
      const alvo = linhas.filter((l) => l.mes_previsto === mes && !l.enviado_rh_em);
      if (!alvo.length) {
        return NextResponse.json(
          { ok: false, erro: "Não há linhas novas a enviar neste mês (já foram todas?)." },
          { status: 409 }
        );
      }
      for (const l of alvo) {
        await update<LinhaPlano>("ferias_plano", `id=eq.${l.id}`, {
          enviado_rh_em: hoje,
          enviado_rh_por: autor,
          status: l.dias_rh && l.data_inicio ? "Confirmado" : "Aguarda RH"
        });
      }
      return NextResponse.json({ ok: true, enviadas: alvo.length });
    }

    if (accao === "carregar_todos") {
      const comLinha = new Set(plano.map((l) => l.collaborator_id));
      const novos = colaboradores
        .filter((c) => !comLinha.has(c.id))
        .map((c) => ({ ano, collaborator_id: c.id, status: "Planeado" }));
      if (novos.length) {
        await insert<LinhaPlano>("ferias_plano", novos);
      }
      return NextResponse.json({ ok: true, criadas: novos.length });
    }

    /* duplicar_ano: copia SÓ o mês previsto (os dias de direito são da
       folha de cada ano; nunca se arrastam). */
    const de = Number(corpo.de);
    if (!Number.isInteger(de) || de < 2000 || de >= ano) {
      return NextResponse.json(
        { ok: false, erro: "Ano de origem inválido (tem de ser anterior)." },
        { status: 400 }
      );
    }
    const origem = planoNoAmbito(
      await queryTudo<LinhaPlano>("ferias_plano", `select=*&ano=eq.${de}`),
      colaboradores
    );
    const comLinha = new Set(plano.map((l) => l.collaborator_id));
    const copias = origem
      .filter((l) => l.mes_previsto && !comLinha.has(l.collaborator_id))
      .map((l) => ({
        ano,
        collaborator_id: l.collaborator_id,
        mes_previsto: l.mes_previsto,
        status: "Planeado"
      }));
    if (copias.length) {
      await insert<LinhaPlano>("ferias_plano", copias);
    }
    return NextResponse.json({ ok: true, copiadas: copias.length });
  } catch (e) {
    return erroBase(e, `ferias plano POST ${accao}`);
  }
}
