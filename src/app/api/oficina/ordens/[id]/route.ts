/**
 * /api/oficina/ordens/[id] - Detalhe e gestão de uma obra.
 *
 * GET: tudo o que a ficha da obra precisa, calculado no servidor:
 * obra, equipamento, histórico de estados e de estado físico,
 * intervenções (com técnicos ligados), peças, checklist digital
 * (activo + templates da categoria + trocas) e materiais.
 *
 * POST: acções de gestão, cada uma com a sua permissão:
 * editar-dados-base, editar-avaria, editar-tipo   (editar)
 * mudar-status, atualizar-fisico                  (editar)
 * registrar-intervencao, apagar-intervencao       (criar/apagar)
 * registrar-pecas, apagar-peca                    (criar/apagar)
 * iniciar-checklist, trocar-revisao               (criar)
 * editar-log-responsavel, apagar-log              (editar/apagar)
 */

import { NextResponse, NextRequest } from "next/server";
import { del, insert, query, queryTudo, update } from "@/lib/supabase";
import { autorizado, eErro, erroBase, type AccaoOficina } from "@/lib/guarda-api";
import {
  arredondarHoras,
  calcularHorasExcluindoAlmoco,
  dataHojeISO,
  type ChecklistPreenchido,
  type ColaboradorLinha,
  type Equipamento,
  type Intervencao,
  type ItemPreenchido,
  type LogEstado,
  type LogFisico,
  type MaterialFecho,
  type OrdemServico,
  type PecaOS,
  type SecaoTemplate,
  type TemplateChecklist,
  type TrocaRevisao
} from "@/lib/oficina";
import { casarMaterialFecho } from "@/lib/stock";

type Contexto = { params: Promise<{ id: string }> };

/* ============ GET: ficha completa ============ */

export async function GET(_req: NextRequest, ctx: Contexto) {
  const auth = await autorizado("ver");
  if (eErro(auth)) return auth;
  const { id: idBruto } = await ctx.params;
  const osId = Number(idBruto);
  if (!osId) {
    return NextResponse.json({ ok: false, erro: "Obra inválida." }, { status: 400 });
  }

  try {
    const osLista = await query<OrdemServico>("ordens_servico", `select=*&id=eq.${osId}`);
    const os = osLista[0];
    if (!os) {
      return NextResponse.json({ ok: false, erro: "Obra não encontrada." }, { status: 404 });
    }

    const eqLista = await query<Equipamento>("equipment", `select=*&id=eq.${os.equipment_id}`);
    const equip = eqLista[0] || null;

    const [colaboradores, materiais, materiaisSugeridos] = await Promise.all([
      query<ColaboradorLinha>(
        "collaborators",
        "select=id,name,code,setor&active=eq.true&order=name.asc"
      ),
      query<{ id: string; nome: string; referencia: string | null; unidade: string | null }>(
        "materiais",
        "select=id,nome,referencia,unidade&ativo=eq.true&order=nome.asc"
      ),
      query<{ nome: string }>("materiais_sugeridos", "select=nome&order=usos.desc&limit=200")
    ]);

    const [timeline, timelineFisico] = await Promise.all([
      query<LogEstado>("os_status_log", `select=*&os_id=eq.${osId}&order=data_mudanca.desc`),
      query<LogFisico>("os_status_fisico_log", `select=*&os_id=eq.${osId}&order=data_mudanca.desc`)
    ]);

    // Intervenções + técnicos ligados
    const records = await query<Intervencao>(
      "records",
      `select=*&os_id=eq.${osId}&order=shift_date.asc,time_start.asc`
    );
    const idsRecords = records.map((r) => r.id);
    const relacoes = idsRecords.length
      ? await query<{ record_id: number; collaborator_id: number }>(
          "record_collaborators",
          `select=record_id,collaborator_id&record_id=in.(${idsRecords.join(",")})`
        )
      : [];
    const intervencoes = records.map((r) => {
      const ids = relacoes.filter((rel) => rel.record_id === r.id).map((rel) => rel.collaborator_id);
      const tecnicos = ids
        .map((idCol) => colaboradores.find((c) => c.id === idCol))
        .filter(Boolean)
        .map((c) => ({ id: (c as ColaboradorLinha).id, name: (c as ColaboradorLinha).name, code: (c as ColaboradorLinha).code || null }));
      const setores = [...new Set(ids.map((idCol) => colaboradores.find((c) => c.id === idCol)?.setor).filter(Boolean))] as string[];
      return { ...r, tecnicos, setores };
    });

    const pecas = await query<PecaOS>("os_pecas", `select=*&os_id=eq.${osId}&order=criado_em.asc`);

    // Checklist digital (só faz sentido em obras de revisão)
    let checklists: {
      eObraRevisao: boolean;
      ativo: {
        id: number;
        templateId: number;
        nome: string;
        ref: string;
        feitos: number;
        total: number;
      } | null;
      templatesDaCategoria: { id: number; nome: string; label: string }[];
      trocas: TrocaRevisao[];
    } = { eObraRevisao: false, ativo: null, templatesDaCategoria: [], trocas: [] };

    const eObraRevisao = (os.tipo_intervencao || []).includes("Revisão");
    if (eObraRevisao) {
      const trocas = await query<TrocaRevisao>(
        "checklist_trocas",
        `select=*&os_id=eq.${osId}&order=criado_em.desc`
      );
      const existentes = await query<ChecklistPreenchido>(
        "checklist_preenchidos",
        `select=*&os_id=eq.${osId}&substituido=eq.false&order=criado_em.desc`
      );
      let ativo: null | { id: number; templateId: number; nome: string; ref: string; feitos: number; total: number } = null;
      if (existentes.length) {
        const ck = existentes[0];
        const tplLista = await query<TemplateChecklist>(
          "checklist_templates",
          `select=*&id=eq.${ck.template_id}`
        );
        const tpl = tplLista[0];
        const itens = await query<ItemPreenchido>(
          "checklist_preenchidos_itens",
          `select=*&checklist_id=eq.${ck.id}`
        );
        ativo = {
          id: ck.id,
          templateId: ck.template_id,
          nome: tpl?.nome || "-",
          ref: tpl?.ref_versao || "",
          feitos: itens.filter((i) => i.executado || i.estado).length,
          total: itens.length
        };
      }
      const templates = equip
        ? await query<TemplateChecklist>(
            "checklist_templates",
            `select=*&categoria_equipamento=eq.${encodeURIComponent(
              equip.fleet_type || ""
            )}&ativo=eq.true&order=intervalo_horas.asc`
          )
        : [];
      checklists = {
        eObraRevisao,
        ativo,
        templatesDaCategoria: templates.map((t) => ({
          id: t.id,
          nome: t.nome,
          label: t.intervalo_label || t.tipo
        })),
        trocas
      };
    }

    return NextResponse.json({
      ok: true,
      os,
      equip,
      colaboradores,
      materiais,
      materiaisSugeridos: materiaisSugeridos.map((m) => m.nome),
      timeline,
      timelineFisico,
      intervencoes,
      pecas,
      checklists
    });
  } catch (e) {
    return erroBase(e, "ordens/[id] GET");
  }
}

/* ============ POST: acções de gestão ============ */

type Corpo = {
  action: string;
  // dados base
  equipment_id?: number;
  data_abertura?: string;
  hora_equipamento?: number | null;
  unidade_medida?: string;
  // avaria / tipo
  descricao_avaria?: string;
  tipo_intervencao?: string[] | null;
  // estados
  status_atual?: string;
  responsavel?: string | null;
  status_fisico?: string;
  numero_obra?: string | null;
  // intervenção
  intervencao?: {
    id?: number;
    data: string;
    inicio: string;
    fim: string;
    descricao: string;
    status: string;
    tecnicos: number[];
  };
  // peças
  peca?: {
    id?: number;
    usarStock: boolean;
    data: string | null;
    colaborador: string | null;
    linhas: { nome?: string; materialId?: string; qtd: number; unidade: string }[];
  };
  // checklist
  templateId?: number;
  novoTemplateId?: number;
  motivoTroca?: string;
  // fecho com faturação CdM (quando o estado novo é "Fechada")
  fecho?: {
    data_fecho: string;
    horas_cdm: number;
    valor_hora: number;
    materiais: { material: string; quantidade: number; valor_unitario: number }[];
    observacao?: string | null;
  };
  // logs
  logId?: number;
  novoResponsavel?: string;
};

export async function POST(req: NextRequest, ctx: Contexto) {
  const auth0 = await autorizado("ver");
  if (eErro(auth0)) return auth0;
  const sessao = auth0;

  const { id: idBruto } = await ctx.params;
  const osId = Number(idBruto);
  if (!osId) {
    return NextResponse.json({ ok: false, erro: "Obra inválida." }, { status: 400 });
  }

  let corpo: Corpo;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Pedido inválido." }, { status: 400 });
  }

  // Permissão por acção
  const MAPA: Record<string, AccaoOficina> = {
    "editar-dados-base": "editar",
    "editar-avaria": "editar",
    "editar-tipo": "editar",
    "mudar-status": "editar",
    "atualizar-fisico": "editar",
    "registrar-intervencao": "criar",
    "apagar-intervencao": "apagar",
    "registrar-pecas": "criar",
    "apagar-peca": "apagar",
    "iniciar-checklist": "criar",
    "trocar-revisao": "criar",
    "editar-log-responsavel": "editar",
    "apagar-log": "apagar"
  };
  const accaoNecessaria = MAPA[corpo.action];
  if (!accaoNecessaria) {
    return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
  }
  const auth = await autorizado(accaoNecessaria);
  if (eErro(auth)) return auth;

  try {
    const lista = await query<OrdemServico>("ordens_servico", `select=*&id=eq.${osId}`);
    const os = lista[0];
    if (!os) {
      return NextResponse.json({ ok: false, erro: "Obra não encontrada." }, { status: 404 });
    }

    switch (corpo.action) {
      /* ---------- dados base ---------- */
      case "editar-dados-base": {
        if (!corpo.equipment_id || !corpo.data_abertura) {
          return NextResponse.json({ ok: false, erro: "Faltam dados da obra." }, { status: 400 });
        }
        await update("ordens_servico", `id=eq.${osId}`, {
          equipment_id: corpo.equipment_id,
          data_abertura: corpo.data_abertura,
          hora_equipamento:
            corpo.hora_equipamento != null && !Number.isNaN(Number(corpo.hora_equipamento))
              ? Number(corpo.hora_equipamento)
              : null,
          unidade_medida: corpo.unidade_medida || "h",
          atualizado_em: new Date().toISOString()
        });
        return NextResponse.json({ ok: true });
      }

      case "editar-avaria": {
        await update("ordens_servico", `id=eq.${osId}`, {
          descricao_avaria: (corpo.descricao_avaria || "").trim(),
          atualizado_em: new Date().toISOString()
        });
        return NextResponse.json({ ok: true });
      }

      case "editar-tipo": {
        const tipos = Array.isArray(corpo.tipo_intervencao) ? corpo.tipo_intervencao : [];
        await update("ordens_servico", `id=eq.${osId}`, {
          tipo_intervencao: tipos.length ? tipos : null,
          atualizado_em: new Date().toISOString()
        });
        return NextResponse.json({ ok: true });
      }

      /* ---------- estados ---------- */
      case "mudar-status": {
        const novo = corpo.status_atual || "";
        const responsavel = (corpo.responsavel || "").trim();
        if (!novo) {
          return NextResponse.json({ ok: false, erro: "Escolhe o novo estado." }, { status: 400 });
        }
        if (novo === os.status_atual) {
          return NextResponse.json({ ok: false, erro: "Este já é o estado actual." }, { status: 400 });
        }
        if (!responsavel) {
          return NextResponse.json(
            { ok: false, erro: "Escolhe o responsável da mudança." },
            { status: 400 }
          );
        }
        // Fecho com faturação CdM: grava ANTES de mudar o estado, para
        // nunca ficar obra fechada sem o registo de faturação (se o SQL
        // do módulo ainda não correu, avisa com instrução clara).
        if (novo === "Fechada" && corpo.fecho) {
          // Re-fecho bloqueado: uma obra não se fecha duas vezes (o 2º
          // fecho duplicaria a faturação CdM E as saídas de gás no
          // stock). Obras fechadas no tempo antigo, sem fecho gravado,
          // continuam a poder ser fechadas uma vez para ganhar o
          // registo de faturação.
          const fechoExistente = await query<{ id: number }>(
            "obras_fechadas_cdm",
            `select=id&os_id=eq.${osId}&limit=1`
          );
          if (fechoExistente.length) {
            return NextResponse.json(
              {
                ok: false,
                erro:
                  "Esta obra já tem fecho com faturação gravado. Não se fecha uma obra duas vezes."
              },
              { status: 409 }
            );
          }
          try {
            await gravarFechoCdM(osId, corpo.fecho, responsavel, os.numero_obra || null);
          } catch (e) {
            if (e instanceof ErroValidacao) {
              return NextResponse.json({ ok: false, erro: e.message }, { status: 400 });
            }
            const msg = String((e as { message?: string })?.message || "");
            if (
              msg.includes("does not exist") ||
              msg.includes("Could not find the table") ||
              msg.includes("schema cache")
            ) {
              return NextResponse.json(
                {
                  ok: false,
                  erro:
                    "O módulo de Faturação CdM ainda não está activo na base. Corre o ficheiro sql/fase3b-faturacao-cdm.sql no Supabase (SQL Editor) e tenta de novo."
                },
                { status: 400 }
              );
            }
            throw e;
          }
        }
        const upd: Record<string, unknown> = {
          status_atual: novo,
          atualizado_em: new Date().toISOString()
        };
        if (novo === "Fechada") upd.data_fecho = dataHojeISO();
        await update("ordens_servico", `id=eq.${osId}`, upd);
        await insert("os_status_log", {
          os_id: osId,
          status_anterior: os.status_atual,
          status_novo: novo,
          responsavel
        });
        return NextResponse.json({ ok: true });
      }

      case "atualizar-fisico": {
        const novo = corpo.status_fisico || "";
        if (!novo) {
          return NextResponse.json({ ok: false, erro: "Escolhe o estado físico." }, { status: 400 });
        }
        const upd: Record<string, unknown> = {
          status_fisico: novo,
          atualizado_em: new Date().toISOString()
        };
        const numero = (corpo.numero_obra || "").trim();
        if (numero) upd.numero_obra = numero;
        await update("ordens_servico", `id=eq.${osId}`, upd);
        if (novo !== os.status_fisico) {
          await insert("os_status_fisico_log", { os_id: osId, status_fisico: novo });
        }
        return NextResponse.json({ ok: true });
      }

      /* ---------- intervenções ---------- */
      case "registrar-intervencao": {
        const iv = corpo.intervencao;
        if (!iv || !iv.data || !iv.inicio || !iv.fim || !iv.descricao?.trim()) {
          return NextResponse.json(
            { ok: false, erro: "Preenche data, horas e descrição da intervenção." },
            { status: 400 }
          );
        }
        const horas = arredondarHoras(calcularHorasExcluindoAlmoco(iv.inicio, iv.fim));
        const payload = {
          equipment_id: os.equipment_id,
          os_id: osId,
          shift_date: iv.data,
          status: iv.status || "em_curso",
          time_start: iv.inicio,
          time_end: iv.fim,
          hours: horas,
          description: iv.descricao.trim(),
          continues: false
        };
        let recordId: number;
        if (iv.id) {
          await update("records", `id=eq.${iv.id}`, payload);
          recordId = iv.id;
          const antigas = await query<{ id: number }>(
            "record_collaborators",
            `select=id&record_id=eq.${recordId}`
          );
          for (const a of antigas) await del("record_collaborators", a.id);
        } else {
          const criados = await insert<{ id: number }>("records", payload);
          recordId = criados[0].id;
        }
        for (const idColab of iv.tecnicos || []) {
          await insert("record_collaborators", { record_id: recordId, collaborator_id: idColab });
        }
        return NextResponse.json({ ok: true, id: recordId });
      }

      case "apagar-intervencao": {
        const idInt = Number(corpo.intervencao && corpo.intervencao.id);
        if (!idInt) {
          return NextResponse.json({ ok: false, erro: "Intervenção não indicada." }, { status: 400 });
        }
        const relacoes = await query<{ id: number }>(
          "record_collaborators",
          `select=id&record_id=eq.${idInt}`
        );
        for (const r of relacoes) await del("record_collaborators", r.id);
        await del("records", idInt);
        return NextResponse.json({ ok: true });
      }

      /* ---------- peças ---------- */
      case "registrar-pecas": {
        const p = corpo.peca;
        if (!p || !p.linhas?.length) {
          return NextResponse.json({ ok: false, erro: "Nenhuma peça para guardar." }, { status: 400 });
        }
        const sugeridos = await query<{ id: number; nome: string; usos: number }>(
          "materiais_sugeridos",
          "select=id,nome,usos"
        );

        // LIGAÇÃO PEÇAS ↔ STOCK (Etapa D): cada linha com material do
        // catálogo tem UMA saída pendente no stock. Editar a peça
        // actualiza o MESMO movimento enquanto ele estiver pendente
        // (não cria órfãos na lista de pendentes); apagar a peça apaga
        // o pendente. Movimento já CONFIRMADO nunca é tocado nem
        // apagado aqui: o material saiu à mesma, o histórico não mente.
        const movPendenteDaPeca = async (idPeca: number): Promise<string | null> => {
          const antigas = await query<{ stock_movimento_id: string | null }>(
            "os_pecas",
            `select=stock_movimento_id&id=eq.${idPeca}&limit=1`
          );
          const movId = antigas[0]?.stock_movimento_id;
          if (!movId) return null;
          const movs = await query<{ id: string; estado: string }>(
            "stock_movimentos",
            `select=id,estado&id=eq.${movId}&limit=1`
          );
          return movs[0]?.estado === "pendente" ? movId : null;
        };
        const dataPeca = (p.data || dataHojeISO()).slice(0, 10);
        const dataMovPeca = dataPeca > dataHojeISO() ? dataHojeISO() : dataPeca;

        for (const linha of p.linhas) {
          const qtd = Number(linha.qtd);
          if (!Number.isFinite(qtd) || qtd <= 0) {
            return NextResponse.json(
              { ok: false, erro: "Quantidade da peça: escreve um número maior que 0." },
              { status: 400 }
            );
          }
          const qtdGravada = arred2(qtd);
          if (p.usarStock) {
            if (!linha.materialId) {
              return NextResponse.json(
                { ok: false, erro: "Escolhe um material do Stock em todas as linhas." },
                { status: 400 }
              );
            }
            const mat = await query<{
              id: string;
              nome: string;
              unidade: string | null;
              ativo: boolean;
            }>("materiais", `select=id,nome,unidade,ativo&id=eq.${linha.materialId}`);
            const material = mat[0];
            if (!material) {
              return NextResponse.json({ ok: false, erro: "Material não encontrado." }, { status: 404 });
            }
            if (material.ativo === false) {
              return NextResponse.json(
                {
                  ok: false,
                  erro: `"${material.nome}" está inactivo no Stock. Escolhe outro material ou reactiva-o.`
                },
                { status: 409 }
              );
            }

            let movId: string | null = null;
            if (p.id) movId = await movPendenteDaPeca(p.id);
            if (movId) {
              // Edição: o MESMO movimento pendente é actualizado.
              await update("stock_movimentos", `id=eq.${movId}`, {
                material_id: linha.materialId,
                quantidade: qtdGravada,
                data_movimento: dataMovPeca,
                colaborador_nome: p.colaborador || ""
              });
            } else {
              const mov = await insert<{ id: string }>("stock_movimentos", {
                tipo: "saida",
                estado: "pendente",
                material_id: linha.materialId,
                quantidade: qtdGravada,
                data_movimento: dataMovPeca,
                departamento: "Oficina",
                finalidade: `OS ${os.numero_obra || "S/Nº"}`,
                observacoes: `Avaria: ${os.descricao_avaria || "-"}`,
                colaborador_nome: p.colaborador || ""
              });
              movId = mov[0]?.id || null;
            }
            const payload = {
              os_id: osId,
              peca: material.nome,
              data: p.data,
              quantidade: qtdGravada,
              unidade: material.unidade || "Unidade",
              colaborador: p.colaborador,
              material_id: linha.materialId,
              stock_movimento_id: movId
            };
            if (p.id) await update("os_pecas", `id=eq.${p.id}`, payload);
            else await insert("os_pecas", payload);
          } else {
            // Trocou de material do Stock para peça livre: o pendente
            // antigo sai do stock (se ainda estiver pendente).
            if (p.id) {
              const movId = await movPendenteDaPeca(p.id);
              if (movId) await del("stock_movimentos", movId);
            }
            const nome = (linha.nome || "").trim();
            if (!nome) {
              return NextResponse.json(
                { ok: false, erro: "Preenche o nome da peça em todas as linhas." },
                { status: 400 }
              );
            }
            const payload = {
              os_id: osId,
              peca: nome,
              data: p.data,
              quantidade: qtdGravada,
              unidade: linha.unidade || "Unidade",
              colaborador: p.colaborador,
              material_id: null,
              stock_movimento_id: null
            };
            if (p.id) await update("os_pecas", `id=eq.${p.id}`, payload);
            else await insert("os_pecas", payload);

            // Lista de sugestões: sobe o contador ou cria novo (como o hub)
            const existe = sugeridos.find((s) => s.nome.toLowerCase() === nome.toLowerCase());
            if (existe) {
              await update("materiais_sugeridos", `id=eq.${existe.id}`, { usos: (existe.usos || 1) + 1 });
            } else {
              await insert("materiais_sugeridos", { nome, usos: 1 });
            }
          }
        }
        return NextResponse.json({ ok: true });
      }

      case "apagar-peca": {
        const idPeca = Number((corpo.peca as unknown as { id?: number })?.id);
        if (!idPeca) {
          return NextResponse.json({ ok: false, erro: "Peça não indicada." }, { status: 400 });
        }
        // O movimento pendente ligado sai do stock com a peça (sem
        // deixar pendente órfão na lista de confirmações). Se já foi
        // CONFIRMADO, fica: o material saiu à mesma, o histórico não
        // mente (pode-se apagar à mão nas Saídas, se for o caso).
        const antigas = await query<{ stock_movimento_id: string | null }>(
          "os_pecas",
          `select=stock_movimento_id&id=eq.${idPeca}&limit=1`
        );
        const movId = antigas[0]?.stock_movimento_id;
        if (movId) {
          const movs = await query<{ estado: string }>(
            "stock_movimentos",
            `select=estado&id=eq.${movId}&limit=1`
          );
          if (movs[0]?.estado === "pendente") await del("stock_movimentos", movId);
        }
        await del("os_pecas", idPeca);
        return NextResponse.json({ ok: true });
      }

      /* ---------- checklist digital ---------- */
      case "iniciar-checklist": {
        const templateId = Number(corpo.templateId);
        if (!templateId) {
          return NextResponse.json({ ok: false, erro: "Escolhe o checklist." }, { status: 400 });
        }
        const tplLista = await query<TemplateChecklist>(
          "checklist_templates",
          `select=*&id=eq.${templateId}`
        );
        if (!tplLista[0]) {
          return NextResponse.json({ ok: false, erro: "Checklist não encontrado." }, { status: 404 });
        }
        const novo = await insert<ChecklistPreenchido>("checklist_preenchidos", {
          os_id: osId,
          template_id: templateId,
          equipment_id: os.equipment_id,
          numero_obra: os.numero_obra || null,
          horas_equipamento: os.hora_equipamento || null,
          data_revisao: dataHojeISO()
        });
        const checklistId = novo[0].id;
        await copiarItensTemplate(checklistId, templateId);
        return NextResponse.json({ ok: true, checklistId });
      }

      case "trocar-revisao": {
        const novoTemplateId = Number(corpo.novoTemplateId);
        const motivo = (corpo.motivoTroca || "").trim();
        if (!novoTemplateId || !motivo) {
          return NextResponse.json(
            { ok: false, erro: "Escolhe a nova revisão e escreve o motivo." },
            { status: 400 }
          );
        }
        const activos = await query<ChecklistPreenchido>(
          "checklist_preenchidos",
          `select=*&os_id=eq.${osId}&substituido=eq.false&order=criado_em.desc`
        );
        if (!activos.length) {
          return NextResponse.json(
            { ok: false, erro: "Não há checklist activo para trocar." },
            { status: 400 }
          );
        }
        const atual = activos[0];
        const tplAnterior = await query<TemplateChecklist>(
          "checklist_templates",
          `select=*&id=eq.${atual.template_id}`
        );
        const tplNovo = await query<TemplateChecklist>(
          "checklist_templates",
          `select=*&id=eq.${novoTemplateId}`
        );

        await update("checklist_preenchidos", `id=eq.${atual.id}`, { substituido: true });
        const novo = await insert<ChecklistPreenchido>("checklist_preenchidos", {
          os_id: osId,
          template_id: novoTemplateId,
          equipment_id: os.equipment_id,
          numero_obra: os.numero_obra || null,
          horas_equipamento: os.hora_equipamento || null,
          data_revisao: dataHojeISO()
        });
        await copiarItensTemplate(novo[0].id, novoTemplateId);
        await insert("checklist_trocas", {
          os_id: osId,
          checklist_anterior_id: atual.id,
          checklist_novo_id: novo[0].id,
          template_anterior_nome: tplAnterior[0]?.nome || null,
          template_novo_nome: tplNovo[0]?.nome || null,
          motivo,
          responsavel: (corpo.responsavel || "").trim() || null
        });
        return NextResponse.json({ ok: true, checklistId: novo[0].id });
      }

      /* ---------- histórico de estados ---------- */
      case "editar-log-responsavel": {
        const logId = Number(corpo.logId);
        const nome = (corpo.novoResponsavel || "").trim();
        if (!logId || !nome) {
          return NextResponse.json(
            { ok: false, erro: "Indica o registo e o novo responsável." },
            { status: 400 }
          );
        }
        await update("os_status_log", `id=eq.${logId}`, { responsavel: nome });
        return NextResponse.json({ ok: true });
      }

      case "apagar-log": {
        const logId = Number(corpo.logId);
        if (!logId) {
          return NextResponse.json({ ok: false, erro: "Registo não indicado." }, { status: 400 });
        }
        await del("os_status_log", logId);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ ok: false, erro: "Acção desconhecida." }, { status: 400 });
    }
  } catch (e) {
    return erroBase(e, `ordens/[id] POST ${corpo.action}`);
  } finally {
    // sessao só é usada acima para validar; evita avisos de variável não usada
    void sessao;
  }
}

/** Copia os itens de um template para um checklist recém-criado. */
async function copiarItensTemplate(checklistId: number, templateId: number) {
  const secoes = await query<SecaoTemplate>(
    "checklist_template_secoes",
    `select=id&template_id=eq.${templateId}`
  );
  const secaoIds = secoes.map((s) => s.id);
  if (!secaoIds.length) return;
  const itens = await query<{ id: number }>(
    "checklist_template_itens",
    `select=id&secao_id=in.(${secaoIds.join(",")})`
  );
  if (!itens.length) return;
  await insert(
    "checklist_preenchidos_itens",
    itens.map((it) => ({ checklist_id: checklistId, template_item_id: it.id }))
  );
}

/* ============ Fecho com faturação CdM ============ */

/** Erro que se pode mostrar ao utilizador tal e qual. */
class ErroValidacao extends Error {}

const arred2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Grava o fecho de uma obra na CdM: data de fecho, horas que a CdM
 * considerou, valor/hora (total = horas x valor) e os materiais usados
 * (Oxigênio, Gas Propano, Gas Acetileno, ...). Os totais são SEMPRE
 * recalculados aqui no servidor - nunca se confia nos que vêm do browser.
 *
 * ETAPA D: cada material do fecho casado com o catálogo do Stock cria
 * UMA saída PENDENTE (as confirmações passam pelo mesmo bloqueio de
 * stock negativo das outras saídas). As saídas são criadas ANTES do
 * fecho; se o fecho falhar, elas são apagadas (nada fica meio gravado
 * e repetir o fecho não duplica saídas).
 */
async function gravarFechoCdM(
  osId: number,
  fecho: NonNullable<Corpo["fecho"]>,
  responsavel: string,
  numeroObra: string | null
) {
  const dataFecho = (fecho.data_fecho || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataFecho)) {
    throw new ErroValidacao("Data de fecho inválida.");
  }
  const horas = Number(fecho.horas_cdm);
  if (!Number.isFinite(horas) || horas < 0) {
    throw new ErroValidacao("Horas consideradas pela CdM: escreve um número maior ou igual a 0.");
  }
  const valor = Number(fecho.valor_hora);
  if (!Number.isFinite(valor) || valor < 0) {
    throw new ErroValidacao("Valor por hora: escreve um número maior ou igual a 0.");
  }

  const totalMao = arred2(horas * valor);
  const matsLimpos = (fecho.materiais || [])
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
  const totalMat = arred2(
    matsLimpos.reduce((s, m) => s + m.quantidade * m.valor_unitario, 0)
  );

  /* ---- saídas de gás/material no stock (Etapa D) ---- */
  const dataMov = dataFecho > dataHojeISO() ? dataHojeISO() : dataFecho;
  const catalogo = await query<{ id: string; nome: string; ativo: boolean }>(
    "materiais",
    "select=id,nome,ativo&ativo=eq.true&order=nome.asc"
  );
  const saidasGases = matsLimpos
    .map((m) => {
      const mat = casarMaterialFecho(m.material, catalogo);
      if (!mat) return null; // nome sem material no catálogo: só faturação
      return {
        tipo: "saida",
        estado: "pendente",
        material_id: mat.id,
        quantidade: arred2(m.quantidade),
        data_movimento: dataMov,
        departamento: "Oficina",
        finalidade: `OS ${numeroObra || "S/Nº"} (Fecho CdM)`,
        observacoes: `Material do fecho CdM casado de: "${m.material}"`,
        colaborador_nome: responsavel || "Fecho CdM"
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null);
  let idsSaidas: { id: string }[] = [];
  if (saidasGases.length) {
    idsSaidas = await insert<{ id: string }>("stock_movimentos", saidasGases);
  }

  try {
    const criado = await insert<{ id: number }>("obras_fechadas_cdm", {
      os_id: osId,
      data_fecho: dataFecho,
      horas_cdm: horas,
      valor_hora: valor,
      total_mao_obra: totalMao,
      total_material: totalMat,
      total_geral: arred2(totalMao + totalMat),
      responsavel: responsavel || null,
      observacao: (fecho.observacao || "").trim() || null
    });
    const fechoId = criado[0]?.id;
    if (!fechoId) throw new Error("obras_fechadas_cdm sem id de retorno");

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
  } catch (e) {
    // Compensação: o fecho não gravou, as saídas de gás recém-criadas
    // saem do stock - a base nunca fica meio gravada.
    for (const s of idsSaidas) {
      try {
        await del("stock_movimentos", s.id);
      } catch {
        // melhor esforço: o log abaixo mostra o problema na mesma
      }
    }
    throw e;
  }
}
