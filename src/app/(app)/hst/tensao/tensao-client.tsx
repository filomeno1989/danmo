/**
 * /hst/tensao - Controlo de Tensão Arterial (cliente).
 *
 * A campanha do posto de saúde no portal. Duas formas de trabalhar:
 *
 * CAMPANHA DE CONTROLE ABERTA (Fase 10): o técnico escolhe o pessoal
 * que entra no controle e o painel passa a contar SOBRE a campanha:
 * "X de N com a última medição alta (P% da campanha)", quem já mediu
 * hoje, quem nunca mediu e quem já está em controle. Quem não está na
 * campanha mede normalmente para controle pessoal (continua tudo nos
 * cartões e no histórico).
 *
 * SEM CAMPANHA: a fila de sempre, com quem tem a última medição alta
 * (indica que devia medir todos os dias) e o estado do dia.
 *
 * Em ambos: indicadores do período com a parte alta EXPLÍCITA (X de Y
 * medições), CSV e papel A4 (individual ou coletivo) para o posto, e o
 * selo "Com medicação" de quem está a tomar medicamento.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Download, LoaderCircle, Printer, Save, Stethoscope, Users } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { SelecionarColaborador } from "@/components/oficina/selecionar-colaborador";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  campanhaTensao,
  classificarTensao,
  csvTensao,
  fmtDataHst,
  medicoesNoPeriodo,
  problemaValoresTensao,
  resumoCampanha,
  resumoTensaoPeriodo,
  semAcentos,
  type CampanhaPessoa,
  type ColaboradorHST,
  type LinhaCampanhaHST,
  type MedicacaoTensaoHST,
  type MedicaoTensaoHST
} from "@/lib/hst";

const CORES_CLS: Record<string, string> = {
  normal: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  limitrofe: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  alta: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
};

const CORES_VALOR: Record<string, string> = {
  normal: "text-emerald-600",
  limitrofe: "text-amber-600",
  alta: "text-red-600"
};

const SELO_MEDICACAO =
  "rounded-full bg-violet-100 px-2 py-0.5 text-[0.68rem] font-bold text-violet-800 dark:bg-violet-950/60 dark:text-violet-300";

/** Hoje local (YYYY-MM-DD), calculado uma vez por abertura do ecrã. */
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Agora local para o datetime-local (YYYY-MM-DDTHH:mm). */
function agoraLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

const FORM_VAZIO = {
  colaborador_nome: "",
  data_medicao: "",
  sistolica: "",
  diastolica: "",
  frequencia_cardiaca: "",
  observacoes: ""
};

/** Uma linha pronta da lista de membros da campanha (os 3 grupos). */
type LinhaMembro = {
  nome: string;
  grupo: "alta" | "novo" | "controlo";
  estado: string;
  detalhe: string;
  medir: boolean;
};

export function TensaoClient() {
  const [medicoes, setMedicoes] = useState<MedicaoTensaoHST[] | null>(null);
  const [colabs, setColabs] = useState<ColaboradorHST[]>([]);
  const [membros, setMembros] = useState<LinhaCampanhaHST[]>([]);
  const [medicacao, setMedicacao] = useState<MedicacaoTensaoHST[]>([]);
  const [falha, setFalha] = useState("");
  const [pesquisa, setPesquisa] = useState("");
  const [filtroCls, setFiltroCls] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [aGravar, setAGravar] = useState(false);

  const [modalCampanha, setModalCampanha] = useState(false);
  const [novoMembro, setNovoMembro] = useState("");
  const [aMembro, setAMembro] = useState(false);

  const hoje = useState(hojeISO)[0];

  function carregar() {
    pedir<{ medicoes: MedicaoTensaoHST[] }>("/api/hst/medicoes")
      .then((d) => setMedicoes(d.medicoes))
      .catch((e: Error) => setFalha(e.message));
    pedir<{ membros: LinhaCampanhaHST[] }>("/api/hst/campanha")
      .then((d) => setMembros(d.membros || []))
      .catch(() => setMembros([]));
    pedir<{ medicacao: MedicacaoTensaoHST[] }>("/api/hst/medicacao")
      .then((d) => setMedicacao(d.medicacao || []))
      .catch(() => setMedicacao([]));
  }
  useEffect(() => {
    carregar();
    pedir<{ colaboradores: ColaboradorHST[] }>("/api/hst/colaboradores")
      .then((d) => setColabs(d.colaboradores || []))
      .catch(() => {});
  }, []);

  const codigoDe = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const c of colabs) mapa[c.name || ""] = c.code || "";
    return mapa;
  }, [colabs]);

  const idDe = useMemo(() => {
    const mapa: Record<string, number | null> = {};
    for (const c of colabs) mapa[c.name || ""] = c.id;
    return mapa;
  }, [colabs]);

  /** Pessoas da campanha com medicação activa (selo na linha). */
  const medicacaoActiva = useMemo(() => {
    const nomes = new Set(
      medicacao.filter((m) => m.activo).map((m) => m.colaborador_nome || "")
    );
    return nomes;
  }, [medicacao]);

  /* Campanha aberta: o resumo conta SOBRE o pessoal escolhido. */
  const campanha = useMemo(
    () => resumoCampanha(membros, medicoes || [], hoje),
    [membros, medicoes, hoje]
  );
  const campanhaAberta = membros.length > 0;

  /* Sem campanha: a fila de sempre sobre TODAS as medições. */
  const filaCampanha = useMemo(
    () => (medicoes && !campanhaAberta ? campanhaTensao(medicoes, hoje) : []),
    [medicoes, hoje, campanhaAberta]
  );
  const medidosHojeFila = filaCampanha.filter((p) => p.estado === "medido_hoje").length;

  /* Linhas prontas dos membros: alta (fila), nunca medido, em controle. */
  const linhasMembros = useMemo<LinhaMembro[]>(() => {
    if (!medicoes) return [];
    const mediuHoje = (nome: string) =>
      medicoes.some(
        (m) => m.colaborador_nome === nome && String(m.data_medicao || "").slice(0, 10) === hoje
      );
    const dias = (iso: string) => {
      const d = String(iso || "").slice(0, 10);
      if (!d || d >= hoje) return 0;
      return Math.round((new Date(hoje).getTime() - new Date(d).getTime()) / 86400000);
    };
    const lista: LinhaMembro[] = [];
    for (const p of campanha.fila) {
      const feito = mediuHoje(p.nome);
      lista.push({
        nome: p.nome,
        grupo: "alta",
        estado: feito ? "Medido hoje" : `Não medido há ${p.diasSemMedir} dia(s)`,
        detalhe: `Última: ${p.ultima.sistolica}/${p.ultima.diastolica} em ${fmtDataHst(p.ultima.data_medicao, true)} | ${p.classificacao.texto}`,
        medir: !feito
      });
    }
    for (const nome of campanha.semMedicao) {
      lista.push({
        nome,
        grupo: "novo",
        estado: "Ainda sem medição na campanha",
        detalhe: "Não tem medição nenhuma no portal",
        medir: true
      });
    }
    for (const m of campanha.emControlo) {
      const feito = mediuHoje(m.nome);
      lista.push({
        nome: m.nome,
        grupo: "controlo",
        estado: feito ? "Medido hoje" : `Medido há ${dias(m.ultima.data_medicao || "")} dia(s)`,
        detalhe: `Em controle: última ${m.ultima.sistolica}/${m.ultima.diastolica} em ${fmtDataHst(m.ultima.data_medicao, true)} | ${m.classificacao.texto}`,
        medir: !feito
      });
    }
    return lista;
  }, [campanha, medicoes, hoje]);

  /* Período: filtra indicadores, cartões e exportações. */
  const noPeriodo = useMemo(
    () => (medicoes ? medicoesNoPeriodo(medicoes, de, ate) : []),
    [medicoes, de, ate]
  );
  const resumo = useMemo(() => resumoTensaoPeriodo(noPeriodo), [noPeriodo]);
  const resumoHoje = useMemo(
    () => resumoTensaoPeriodo(medicoesNoPeriodo(medicoes || [], hoje, hoje)),
    [medicoes, hoje]
  );

  const cartoes = useMemo(() => {
    const mapa: Record<string, { nome: string; ultima: MedicaoTensaoHST; total: number }> = {};
    for (const m of noPeriodo) {
      const nome = m.colaborador_nome || "";
      if (!mapa[nome]) {
        mapa[nome] = { nome, ultima: m, total: 0 };
      }
      mapa[nome].total += 1;
      if (String(m.data_medicao) > String(mapa[nome].ultima.data_medicao)) {
        mapa[nome].ultima = m;
      }
    }
    let lista = Object.values(mapa).sort((a, b) =>
      String(b.ultima.data_medicao).localeCompare(String(a.ultima.data_medicao))
    );
    const alvo = semAcentos(pesquisa);
    if (alvo) lista = lista.filter((c) => semAcentos(c.nome).includes(alvo));
    if (filtroCls) {
      lista = lista.filter(
        (c) => classificarTensao(c.ultima.sistolica, c.ultima.diastolica).cls === filtroCls
      );
    }
    return lista;
  }, [noPeriodo, pesquisa, filtroCls]);

  // Pré-visualização da classificação enquanto se digita.
  const prev = useMemo(() => {
    const sys = Number(form.sistolica);
    const dia = Number(form.diastolica);
    if (!sys || !dia) return null;
    const problema = problemaValoresTensao(sys, dia, form.frequencia_cardiaca ? Number(form.frequencia_cardiaca) : null);
    if (problema) return { erro: problema };
    return { ...classificarTensao(sys, dia), sys, dia };
  }, [form.sistolica, form.diastolica, form.frequencia_cardiaca]);

  function abrirModal(nome = "", medicaoAgora = true) {
    setForm({ ...FORM_VAZIO, colaborador_nome: nome, data_medicao: medicaoAgora ? agoraLocal() : "" });
    setModal(true);
  }

  async function gravar() {
    const sys = Number(form.sistolica);
    const dia = Number(form.diastolica);
    if (!form.colaborador_nome.trim()) {
      toast.warning("Indica o colaborador.");
      return;
    }
    const problema = problemaValoresTensao(sys, dia, form.frequencia_cardiaca ? Number(form.frequencia_cardiaca) : null);
    if (problema) {
      toast.warning(problema);
      return;
    }
    setAGravar(true);
    try {
      await enviar("/api/hst/medicoes", {
        colaborador_nome: form.colaborador_nome.trim(),
        sistolica: sys,
        diastolica: dia,
        frequencia_cardiaca: form.frequencia_cardiaca ? Number(form.frequencia_cardiaca) : null,
        observacoes: form.observacoes,
        data_medicao: form.data_medicao
      }, "Medição registada.");
      setModal(false);
      setForm(FORM_VAZIO);
      carregar();
    } catch {
      /* toast já avisou */
    } finally {
      setAGravar(false);
    }
  }

  async function entrarCampanha() {
    if (!novoMembro.trim()) {
      toast.warning("Escolhe o colaborador que entra na campanha.");
      return;
    }
    setAMembro(true);
    try {
      await enviar("/api/hst/campanha", {
        colaborador_id: idDe[novoMembro] ?? null,
        colaborador_nome: novoMembro.trim()
      }, "Colaborador entrou na campanha.");
      setNovoMembro("");
      carregar();
    } catch {
      /* toast já avisou */
    } finally {
      setAMembro(false);
    }
  }

  async function tirarDaCampanha(m: LinhaCampanhaHST) {
    if (!window.confirm(`Tirar ${m.colaborador_nome} da campanha? Fica no histórico, nada é apagado.`)) return;
    try {
      await enviar(`/api/hst/campanha?id=${m.id}`, {}, "Colaborador saiu da campanha.", "DELETE");
      carregar();
    } catch {
      /* toast já avisou */
    }
  }

  function descarregarCSV() {
    const csv = csvTensao(noPeriodo);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tensao-arterial${de ? `-${de}` : ""}${ate ? `-${ate}` : ""}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const linkPapel = `/imprimir/hst/tensao${de || ate ? `?de=${de}&ate=${ate}` : ""}`;

  if (falha) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{falha}</div>;
  }

  const estadoDia = campanhaAberta
    ? campanha.medidosHoje === campanha.total && campanha.total > 0
    : medidosHojeFila === filaCampanha.length && filaCampanha.length > 0;
  const totalDia = campanhaAberta ? campanha.total : filaCampanha.length;
  const feitosDia = campanhaAberta ? campanha.medidosHoje : medidosHojeFila;

  return (
    <div className="space-y-5">
      <Cabeca titulo="Controlo de Tensão Arterial" subtitulo="Campanha de controle, indicadores e envio ao posto de saúde">
        <Button variant="outline" onClick={() => setModalCampanha(true)}>
          <Users className="size-4" aria-hidden /> Gerir campanha
        </Button>
        <Button variant="outline" onClick={descarregarCSV}>
          <Download className="size-4" aria-hidden /> CSV
        </Button>
        <Button variant="outline" asChild>
          <Link href={linkPapel}>
            <Printer className="size-4" aria-hidden /> Relatório
          </Link>
        </Button>
        <Button onClick={() => abrirModal()}>Nova Medição</Button>
      </Cabeca>

      {/* Campanha de controle (aberta) ou fila simples (sem campanha) */}
      <section aria-label="Campanha diária" className="card-sombra rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Stethoscope className="size-4 text-red-600" aria-hidden />
            <h2 className="text-sm font-bold">
              {campanhaAberta ? "Campanha de controle: tensão alta" : "Campanha diária: tensão alta"}
            </h2>
            {campanhaAberta ? (
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[0.72rem] font-bold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300" data-campanha-tamanho>
                {campanha.total} na campanha
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <span data-campanha-contador className="text-sm font-bold">
              Hoje: {feitosDia} de {totalDia} medidos
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${estadoDia && totalDia > 0 ? CORES_CLS.normal : CORES_CLS.alta}`}>
              {totalDia === 0 ? "Sem fila" : estadoDia ? "Dia completo" : "Falta medir"}
            </span>
          </div>
        </div>

        {campanhaAberta ? (
          <>
            {/* A percentagem EXPLÍCITA: sobre o pessoal da campanha */}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm" data-campanha-resumo>
              <span className="font-bold">
                Última medição alta: {campanha.comHta} de {campanha.total} ({campanha.pctHta}% da campanha)
              </span>
              <span className="text-xs text-muted-foreground">
                em controle: {campanha.emControlo.length} | ainda sem medição: {campanha.semMedicao.length} | quem não está na campanha mede normalmente para controle pessoal
              </span>
            </div>
            {linhasMembros.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Campanha sem membros. Usa Gerir campanha para escolher o pessoal do controle.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {linhasMembros.map((l) => (
                  <LinhaMembro
                    key={`${l.grupo}-${l.nome}`}
                    linha={l}
                    codigo={codigoDe[l.nome] || ""}
                    comMedicacao={medicacaoActiva.has(l.nome)}
                    onMedir={() => abrirModal(l.nome)}
                  />
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              Sem campanha aberta: a fila junta TODOS os que têm a última medição alta. Abre a campanha em Gerir campanha para escolher o pessoal do controle e a percentagem passar a contar sobre eles.
            </p>
            {filaCampanha.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum colega com a última medição alta. A fila fica vazia até aparecer alguém com tensão alta.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {filaCampanha.map((p) => (
                  <LinhaCampanha key={p.nome} pessoa={p} codigo={codigoDe[p.nome] || ""} comMedicacao={medicacaoActiva.has(p.nome)} onMedir={() => abrirModal(p.nome)} />
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      {/* Indicadores do período */}
      <section
        aria-label="Indicadores"
        className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${campanhaAberta ? "xl:grid-cols-7" : "xl:grid-cols-6"}`}
      >
        <Indicador rotulo="Medições no período" valor={String(resumo.total)} />
        <Indicador rotulo="Pessoas medidas" valor={String(resumo.pessoas)} />
        <Indicador rotulo="Média da tensão" valor={resumo.total ? `${resumo.mediaSys}/${resumo.mediaDia}` : "-"} />
        <Indicador
          rotulo="Tensão alta no período (das medições)"
          valor={`${resumo.medicoesHta} de ${resumo.total} (${resumo.pctHta}%)`}
          vermelho={resumo.medicoesHta > 0}
        />
        {campanhaAberta ? (
          <Indicador
            rotulo="Última medição alta na campanha (pessoas)"
            valor={`${campanha.comHta} de ${campanha.total} (${campanha.pctHta}% da campanha)`}
            vermelho={campanha.comHta > 0}
          />
        ) : null}
        <Indicador rotulo="Dias com registo" valor={String(resumo.diasComMedicao)} />
        <Indicador rotulo="Medições de hoje" valor={String(resumoHoje.total)} />
      </section>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Input placeholder="Pesquisar colaborador..." value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)} aria-label="Pesquisar colaboradores" />
        </div>
        <select aria-label="Filtrar por classificação" className="h-9 rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
          value={filtroCls} onChange={(e) => setFiltroCls(e.target.value)}>
          <option value="">Todas as classificações</option>
          <option value="normal">Normal / Ótima</option>
          <option value="limitrofe">Limítrofe</option>
          <option value="alta">HTA (Alta)</option>
        </select>
        <div className="flex items-center gap-1">
          <CalendarDays className="size-4 opacity-60" aria-hidden />
          <Input type="date" aria-label="Data inicial" value={de} onChange={(e) => setDe(e.target.value)}
            className="w-36" />
          <span className="text-sm text-muted-foreground">a</span>
          <Input type="date" aria-label="Data final" value={ate} onChange={(e) => setAte(e.target.value)}
            className="w-36" />
        </div>
        {(de || ate) && (
          <Button variant="ghost" size="sm" onClick={() => { setDe(""); setAte(""); }}>
            Limpar datas
          </Button>
        )}
      </div>

      {/* Cartões por pessoa */}
      {!medicoes ? (
        <p className="py-8 text-center text-sm text-muted-foreground">A carregar medições...</p>
      ) : cartoes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma medição no período escolhido.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cartoes.map((c) => {
            const cla = classificarTensao(c.ultima.sistolica, c.ultima.diastolica);
            return (
              <Link
                key={c.nome}
                href={`/hst/tensao/pessoa?colab=${encodeURIComponent(c.nome)}`}
                className="card-sombra block rounded-lg border border-border bg-card p-4 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-bold">{c.nome}</span>
                      {medicacaoActiva.has(c.nome) ? (
                        <span className={SELO_MEDICACAO}>Com medicação</span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Última: {fmtDataHst(c.ultima.data_medicao, true)} | {c.total} medição(ões) no período
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-xl font-bold ${CORES_VALOR[cla.cls]}`}>
                      {c.ultima.sistolica}/{c.ultima.diastolica}
                    </div>
                    <span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${CORES_CLS[cla.cls]}`}>
                      {cla.texto}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Modal aberto={modal} fechar={() => setModal(false)} titulo="Nova Medição de Tensão" largura="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="m-colab">Colaborador *</label>
            <SelecionarColaborador
              id="m-colab"
              colaboradores={colabs}
              value={form.colaborador_nome}
              onChange={(nome) => setForm((f) => ({ ...f, colaborador_nome: nome }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="m-data">Data e hora da medição</label>
            <Input id="m-data" type="datetime-local" value={form.data_medicao}
              onChange={(e) => setForm((f) => ({ ...f, data_medicao: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold" htmlFor="m-sis">Sistólica *</label>
              <Input id="m-sis" type="number" min={60} max={260} value={form.sistolica}
                onChange={(e) => setForm((f) => ({ ...f, sistolica: e.target.value }))} placeholder="120" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold" htmlFor="m-dia">Diastólica *</label>
              <Input id="m-dia" type="number" min={40} max={160} value={form.diastolica}
                onChange={(e) => setForm((f) => ({ ...f, diastolica: e.target.value }))} placeholder="80" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold" htmlFor="m-fc">FC (bpm)</label>
              <Input id="m-fc" type="number" min={40} max={200} value={form.frequencia_cardiaca}
                onChange={(e) => setForm((f) => ({ ...f, frequencia_cardiaca: e.target.value }))} placeholder="72" />
            </div>
          </div>
          {prev ? (
            <div className="rounded-md bg-muted px-3 py-3 text-center">
              {"erro" in prev ? (
                <span className="text-sm font-semibold text-red-600">{prev.erro}</span>
              ) : (
                <>
                  <span className="text-2xl font-bold">{prev.sys}/{prev.dia}</span>
                  <span className={`ml-3 inline-block rounded-full px-3 py-1 text-xs font-bold ${CORES_CLS[prev.cls]}`}>
                    {prev.texto}
                  </span>
                </>
              )}
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="m-obs">Observações</label>
            <textarea id="m-obs" className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))}
              placeholder="Sintomas, queixas do colaborador..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={aGravar}>
              {aGravar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Registar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Gerir a campanha de controle */}
      <Modal aberto={modalCampanha} fechar={() => setModalCampanha(false)} titulo="Campanha de controle da tensão" largura="max-w-lg">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            O pessoal escolhido entra no controle (mede com acompanhamento e entra na percentagem da campanha). Quem não entra mede normalmente. Tirar alguém NÃO apaga nada: fica no histórico com a data de saída.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="camp-colab">Entrar na campanha</label>
            <div className="flex gap-2">
              <div className="flex-1">
                <SelecionarColaborador
                  id="camp-colab"
                  colaboradores={colabs}
                  value={novoMembro}
                  onChange={setNovoMembro}
                />
              </div>
              <Button onClick={entrarCampanha} disabled={aMembro}>
                {aMembro ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Users className="size-4" aria-hidden />}
                Entrar
              </Button>
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Pessoal na campanha ({membros.length})
            </h3>
            {membros.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-sm text-muted-foreground">
                Campanha fechada. Escolhe acima quem deve entrar no controle.
              </p>
            ) : (
              <ul className="space-y-2">
                {membros.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2" data-membro-campanha>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold">{m.colaborador_nome}</span>
                        {codigoDe[m.colaborador_nome] ? (
                          <span className="shrink-0 text-xs font-semibold text-muted-foreground">{codigoDe[m.colaborador_nome]}</span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Na campanha desde {fmtDataHst(m.inicio || "", true)}{m.criado_por ? ` | por ${m.criado_por}` : ""}
                      </div>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => tirarDaCampanha(m)} aria-label={`Tirar ${m.colaborador_nome} da campanha`}>
                      Tirar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ============ Peças ============ */

function LinhaCampanha({ pessoa, codigo, comMedicacao, onMedir }: { pessoa: CampanhaPessoa; codigo: string; comMedicacao: boolean; onMedir: () => void }) {
  const medido = pessoa.estado === "medido_hoje";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2" data-campanha-linha>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold">{pessoa.nome}</span>
          {codigo ? <span className="shrink-0 text-xs font-semibold text-muted-foreground">{codigo}</span> : null}
          {comMedicacao ? <span className={SELO_MEDICACAO}>Com medicação</span> : null}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Última: {pessoa.ultima.sistolica}/{pessoa.ultima.diastolica} em {fmtDataHst(pessoa.ultima.data_medicao, true)} | {pessoa.classificacao.texto}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${medido ? CORES_CLS.normal : CORES_CLS.alta}`} data-estado-campanha>
          {medido ? "Medido hoje" : `Não medido há ${pessoa.diasSemMedir} dia(s)`}
        </span>
        {!medido && (
          <Button size="sm" variant="outline" onClick={onMedir}>
            Medir
          </Button>
        )}
      </div>
    </li>
  );
}

function LinhaMembro({ linha, codigo, comMedicacao, onMedir }: { linha: LinhaMembro; codigo: string; comMedicacao: boolean; onMedir: () => void }) {
  const corBorda =
    linha.grupo === "alta"
      ? "border-red-300 dark:border-red-900/60"
      : linha.grupo === "novo"
        ? "border-amber-300 dark:border-amber-900/60"
        : "border-emerald-300 dark:border-emerald-900/60";
  const corEstado =
    linha.grupo === "controlo" && !linha.medir
      ? CORES_CLS.normal
      : linha.grupo === "controlo"
        ? CORES_CLS.limitrofe
        : linha.grupo === "novo"
          ? CORES_CLS.limitrofe
          : linha.medir
            ? CORES_CLS.alta
            : CORES_CLS.normal;
  return (
    <li className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 ${corBorda}`} data-campanha-linha>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold">{linha.nome}</span>
          {codigo ? <span className="shrink-0 text-xs font-semibold text-muted-foreground">{codigo}</span> : null}
          {comMedicacao ? <span className={SELO_MEDICACAO}>Com medicação</span> : null}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{linha.detalhe}</div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${corEstado}`} data-estado-campanha>
          {linha.estado}
        </span>
        {linha.medir && (
          <Button size="sm" variant="outline" onClick={onMedir}>
            Medir
          </Button>
        )}
      </div>
    </li>
  );
}

function Indicador({ rotulo, valor, vermelho = false }: { rotulo: string; valor: string; vermelho?: boolean }) {
  return (
    <div className="card-sombra rounded-lg border border-border bg-card p-3 text-center">
      <div className={`text-lg font-bold ${vermelho ? "text-red-600" : ""}`}>{valor}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{rotulo}</div>
    </div>
  );
}
