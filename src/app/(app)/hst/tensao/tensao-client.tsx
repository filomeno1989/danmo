/**
 * /hst/tensao - Controlo de Tensão Arterial (cliente).
 *
 * A campanha do posto de saúde no portal. Duas formas de trabalhar:
 *
 * CAMPANHA NUMERADA ABERTA (Fase 11): o técnico ABRE a campanha
 * (Campanha 01, 02... nunca reusa número), escolhe o pessoal que entra
 * no controle e o painel passa a contar SOBRE a campanha: "X de N com a
 * última medição alta (P% da campanha)", quem já mediu hoje, quem nunca
 * mediu e quem já está em controle, com o dia da campanha à vista e a
 * medicação de cada membro na linha. Ao ARQUIVAR, a campanha fica no
 * histórico com o relatório sempre disponível. CSV e papel A4 SÓ DA
 * CAMPANHA, além do geral. Quem não está na campanha mede normalmente
 * para controle pessoal (continua tudo nos cartões e no histórico).
 *
 * SEM CAMPANHA: a fila de sempre, com quem tem a última medição alta
 * (indica que devia medir todos os dias) e o estado do dia.
 *
 * Em ambos: indicadores do período com a parte alta EXPLÍCITA (X de Y
 * medições) e o selo "Com medicação" de quem está a tomar medicamento.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, CalendarDays, Download, LoaderCircle, Printer, Save, Stethoscope, Users } from "lucide-react";
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
  diasDeCampanha,
  fmtDataHst,
  medicoesNoPeriodo,
  problemaValoresTensao,
  proximoNumeroCampanha,
  resumoCampanha,
  resumoTensaoPeriodo,
  rotuloCampanha,
  semAcentos,
  type CampanhaPessoa,
  type CampanhaHST,
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

const FORM_MED_VAZIO = { medicamento: "", dosagem: "", desde: hojeISO(), regular: true };

/** Uma linha pronta da lista de membros da campanha (os 3 grupos). */
type LinhaMembro = {
  nome: string;
  grupo: "alta" | "novo" | "controlo";
  estado: string;
  detalhe: string;
  medicacao: string;
  medir: boolean;
};

export function TensaoClient() {
  const [medicoes, setMedicoes] = useState<MedicaoTensaoHST[] | null>(null);
  const [colabs, setColabs] = useState<ColaboradorHST[]>([]);
  const [campanha, setCampanha] = useState<CampanhaHST | null>(null);
  const [membros, setMembros] = useState<LinhaCampanhaHST[]>([]);
  const [arquivadas, setArquivadas] = useState<CampanhaHST[]>([]);
  const [semCampanha, setSemCampanha] = useState(0);
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

  const [modalMed, setModalMed] = useState(false);
  const [medAlvo, setMedAlvo] = useState("");
  const [formMed, setFormMed] = useState(FORM_MED_VAZIO);
  const [aMed, setAMed] = useState(false);

  const hoje = useState(hojeISO)[0];

  function carregar() {
    pedir<{ medicoes: MedicaoTensaoHST[] }>("/api/hst/medicoes")
      .then((d) => setMedicoes(d.medicoes))
      .catch((e: Error) => setFalha(e.message));
    pedir<{ medicacao: MedicacaoTensaoHST[] }>("/api/hst/medicacao")
      .then((d) => setMedicacao(d.medicacao || []))
      .catch(() => setMedicacao([]));
    carregarCampanha();
  }
  function carregarCampanha() {
    pedir<{ campanha: CampanhaHST | null; membros: LinhaCampanhaHST[]; arquivadas: CampanhaHST[]; semCampanha: number }>("/api/hst/campanha")
      .then((d) => {
        setCampanha(d.campanha || null);
        setMembros(d.membros || []);
        setArquivadas(d.arquivadas || []);
        setSemCampanha(d.semCampanha || 0);
      })
      .catch(() => {
        setCampanha(null);
        setMembros([]);
        setArquivadas([]);
        setSemCampanha(0);
      });
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

  /** Medicação activa por pessoa, pronta para mostrar na linha. */
  const medDe = useMemo(() => {
    const mapa: Record<string, string[]> = {};
    for (const m of medicacao) {
      if (!m.activo) continue;
      const nome = m.colaborador_nome || "";
      if (!nome) continue;
      const txt = m.dosagem ? `${m.medicamento} (${m.dosagem})` : m.medicamento;
      (mapa[nome] = mapa[nome] || []).push(txt);
    }
    return mapa;
  }, [medicacao]);

  const campanhaAberta = Boolean(campanha && campanha.estado === "aberta");
  const rotulo = campanha ? rotuloCampanha(campanha.numero) : "";
  const diaCampanha = campanhaAberta ? diasDeCampanha(campanha?.inicio, hoje) : 0;

  /* Campanha aberta: o resumo conta SOBRE o pessoal escolhido. */
  const campanhaResumo = useMemo(
    () => resumoCampanha(membros, medicoes || [], hoje),
    [membros, medicoes, hoje]
  );

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
    for (const p of campanhaResumo.fila) {
      const feito = mediuHoje(p.nome);
      lista.push({
        nome: p.nome,
        grupo: "alta",
        estado: feito ? "Medido hoje" : `Não medido há ${p.diasSemMedir} dia(s)`,
        detalhe: `Última: ${p.ultima.sistolica}/${p.ultima.diastolica} em ${fmtDataHst(p.ultima.data_medicao, true)} | ${p.classificacao.texto}`,
        medicacao: (medDe[p.nome] || []).join(", "),
        medir: !feito
      });
    }
    for (const nome of campanhaResumo.semMedicao) {
      lista.push({
        nome,
        grupo: "novo",
        estado: "Ainda sem medição na campanha",
        detalhe: "Não tem medição nenhuma no portal",
        medicacao: (medDe[nome] || []).join(", "),
        medir: true
      });
    }
    for (const m of campanhaResumo.emControlo) {
      const feito = mediuHoje(m.nome);
      lista.push({
        nome: m.nome,
        grupo: "controlo",
        estado: feito ? "Medido hoje" : `Medido há ${dias(m.ultima.data_medicao || "")} dia(s)`,
        detalhe: `Em controle: última ${m.ultima.sistolica}/${m.ultima.diastolica} em ${fmtDataHst(m.ultima.data_medicao, true)} | ${m.classificacao.texto}`,
        medicacao: (medDe[m.nome] || []).join(", "),
        medir: !feito
      });
    }
    return lista;
  }, [campanhaResumo, medicoes, hoje, medDe]);

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

  /* Só da campanha: as medições do pessoal escolhido no período. */
  const nomesMembros = useMemo(
    () => new Set(membros.map((m) => m.colaborador_nome || "").filter(Boolean)),
    [membros]
  );
  const noPeriodoCampanha = useMemo(
    () => noPeriodo.filter((m) => nomesMembros.has(m.colaborador_nome || "")),
    [noPeriodo, nomesMembros]
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

  async function abrirCampanha() {
    const proximo = proximoNumeroCampanha(arquivadas[0]?.numero);
    if (!window.confirm(`Abrir ${rotuloCampanha(proximo)}? O pessoal que já está em controle entra nela automaticamente.`)) return;
    setAMembro(true);
    try {
      await enviar("/api/hst/campanha", { acao: "abrir" }, `${rotuloCampanha(proximo)} aberta.`);
      setModalCampanha(false);
      carregarCampanha();
    } catch {
      /* toast já avisou */
    } finally {
      setAMembro(false);
    }
  }

  async function arquivarCampanha() {
    if (!campanha) return;
    if (!window.confirm(`Arquivar ${rotulo}? O pessoal sai da fila (fica no histórico) e o relatório continua disponível a qualquer momento.`)) return;
    setAMembro(true);
    try {
      await enviar("/api/hst/campanha", { acao: "arquivar" }, `${rotulo} arquivada.`);
      setModalCampanha(false);
      carregarCampanha();
    } catch {
      /* toast já avisou */
    } finally {
      setAMembro(false);
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
        acao: "entrar",
        colaborador_id: idDe[novoMembro] ?? null,
        colaborador_nome: novoMembro.trim()
      }, "Colaborador entrou na campanha.");
      setNovoMembro("");
      carregarCampanha();
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
      carregarCampanha();
    } catch {
      /* toast já avisou */
    }
  }

  function abrirMedDe(nome: string) {
    setMedAlvo(nome);
    setFormMed({ ...FORM_MED_VAZIO, desde: hoje });
    setModalMed(true);
  }

  async function gravarMed() {
    if (!formMed.medicamento.trim()) {
      toast.warning("Indica o medicamento.");
      return;
    }
    setAMed(true);
    try {
      await enviar("/api/hst/medicacao", {
        colaborador_id: idDe[medAlvo] ?? null,
        colaborador_nome: medAlvo,
        ...formMed
      }, "Medicação registada.");
      setModalMed(false);
      setMedAlvo("");
      carregar();
    } catch {
      /* toast já avisou */
    } finally {
      setAMed(false);
    }
  }

  function descarregarCSV(lista: MedicaoTensaoHST[], nome: string) {
    const csv = csvTensao(lista);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  const nomeCsv = () =>
    `tensao-arterial${de ? `-${de}` : ""}${ate ? `-${ate}` : ""}.csv`;
  const nomeCsvCampanha = () =>
    `campanha-${String(campanha?.numero ?? 0).padStart(2, "0")}-tensao${de ? `-${de}` : ""}${ate ? `-${ate}` : ""}.csv`;

  const linkPapel = `/imprimir/hst/tensao${de || ate ? `?de=${de}&ate=${ate}` : ""}`;

  if (falha) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{falha}</div>;
  }

  const estadoDia = campanhaAberta
    ? campanhaResumo.medidosHoje === campanhaResumo.total && campanhaResumo.total > 0
    : medidosHojeFila === filaCampanha.length && filaCampanha.length > 0;
  const totalDia = campanhaAberta ? campanhaResumo.total : filaCampanha.length;
  const feitosDia = campanhaAberta ? campanhaResumo.medidosHoje : medidosHojeFila;
  const proximaCampanha = proximoNumeroCampanha(arquivadas[0]?.numero);

  return (
    <div className="space-y-5">
      <Cabeca titulo="Controlo de Tensão Arterial" subtitulo="Campanha de controle, indicadores e envio ao posto de saúde">
        <Button variant="outline" onClick={() => setModalCampanha(true)}>
          <Users className="size-4" aria-hidden /> Gerir campanha
        </Button>
        <Button variant="outline" onClick={() => descarregarCSV(noPeriodo, nomeCsv())}>
          <Download className="size-4" aria-hidden /> CSV
        </Button>
        <Button variant="outline" asChild>
          <Link href={linkPapel}>
            <Printer className="size-4" aria-hidden /> Relatório
          </Link>
        </Button>
        {campanhaAberta ? (
          <>
            <Button variant="outline" onClick={() => descarregarCSV(noPeriodoCampanha, nomeCsvCampanha())} aria-label="CSV da campanha">
              <Download className="size-4" aria-hidden /> CSV da campanha
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/imprimir/hst/tensao?campanha=${campanha?.id || ""}`}>
                <Printer className="size-4" aria-hidden /> Relatório da campanha
              </Link>
            </Button>
          </>
        ) : null}
        <Button onClick={() => abrirModal()}>Nova Medição</Button>
      </Cabeca>

      {/* Campanha numerada (aberta) ou fila simples (sem campanha) */}
      <section aria-label="Campanha diária" className="card-sombra rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Stethoscope className="size-4 text-red-600" aria-hidden />
            <h2 className="text-sm font-bold">
              {campanhaAberta ? `${rotulo} de controle: tensão alta` : "Campanha diária: tensão alta"}
            </h2>
            {campanhaAberta ? (
              <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[0.72rem] font-bold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300" data-campanha-tamanho>
                {campanhaResumo.total} na campanha
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
                Última medição alta: {campanhaResumo.comHta} de {campanhaResumo.total} ({campanhaResumo.pctHta}% da campanha)
              </span>
              <span className="text-xs text-muted-foreground">
                em controle: {campanhaResumo.emControlo.length} | ainda sem medição: {campanhaResumo.semMedicao.length} | quem não está na campanha mede normalmente para controle pessoal
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground" data-campanha-periodo>
              {rotulo} aberta em {fmtDataHst(campanha?.inicio || "", true)} | dia {diaCampanha} da campanha
            </p>
            {linhasMembros.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Campanha sem membros. Usa Gerir campanha para escolher o pessoal do controle.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {linhasMembros.map((l) => (
                  <LinhaMembro
                    key={`${l.grupo}-${l.nome}`}
                    linha={l}
                    codigo={codigoDe[l.nome] || ""}
                    onMedir={() => abrirModal(l.nome)}
                  />
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              Sem campanha aberta: a fila junta TODOS os que têm a última medição alta. Abre a campanha em Gerir campanha para escolher o pessoal do controle, ter a percentagem sobre eles e poder arquivar com relatório depois.
            </p>
            {semCampanha > 0 ? (
              <p className="mt-1 text-xs font-semibold text-amber-600" data-sem-campanha>
                Já há {semCampanha} pessoa(s) em controle da fase anterior sem número de campanha: ao abrir {rotuloCampanha(proximaCampanha)} entram automaticamente.
              </p>
            ) : null}
            {filaCampanha.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhum colega com a última medição alta. A fila fica vazia até aparecer alguém com tensão alta.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {filaCampanha.map((p) => (
                  <LinhaCampanha key={p.nome} pessoa={p} codigo={codigoDe[p.nome] || ""} medicacao={(medDe[p.nome] || []).join(", ")} onMedir={() => abrirModal(p.nome)} />
                ))}
              </ul>
            )}
          </>
        )}

        {/* Campanhas arquivadas: consulta e relatório a qualquer momento */}
        {arquivadas.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3" data-campanhas-arquivadas>
            <Archive className="size-4 text-muted-foreground" aria-hidden />
            <span className="text-xs font-semibold text-muted-foreground">Arquivadas:</span>
            {arquivadas.map((c) => (
              <Link
                key={c.id}
                href={`/imprimir/hst/tensao?campanha=${c.id}`}
                className="rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold hover:bg-muted"
                title="Abrir o relatório desta campanha"
              >
                {rotuloCampanha(c.numero)}: {fmtDataHst(c.inicio || "", true)} a {fmtDataHst(c.fim || "", true)} | relatório
              </Link>
            ))}
          </div>
        ) : null}
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
            rotulo={`Última medição alta na ${rotulo} (pessoas)`}
            valor={`${campanhaResumo.comHta} de ${campanhaResumo.total} (${campanhaResumo.pctHta}% da campanha)`}
            vermelho={campanhaResumo.comHta > 0}
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
            const medTxt = (medDe[c.nome] || []).join(", ");
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
                      {medTxt ? (
                        <span className={SELO_MEDICACAO} title={medTxt}>Com medicação</span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Última: {fmtDataHst(c.ultima.data_medicao, true)} | {c.total} medição(ões) no período
                    </div>
                    {medTxt ? <div className="mt-0.5 truncate text-xs text-violet-600">{medTxt}</div> : null}
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

      {/* Gerir a campanha numerada: abrir, entrar, medicação, arquivar */}
      <Modal aberto={modalCampanha} fechar={() => setModalCampanha(false)} titulo="Campanha de controle da tensão" largura="max-w-lg">
        <div className="space-y-3">
          {campanhaAberta ? (
            <div className="rounded-md bg-muted px-3 py-2 text-sm" data-campanha-gestao>
              <span className="font-bold">{rotulo} aberta</span> desde {fmtDataHst(campanha?.inicio || "", true)} (dia {diaCampanha}) com {membros.length} pessoa(s). Ao ARQUIVAR, a campanha fica no histórico com relatório disponível a qualquer momento e a próxima abre com o número seguinte. Tirar alguém NÃO apaga nada: fica no histórico com a data de saída.
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              A campanha numerada junta o pessoal escolhido para o controle (mede com acompanhamento e entra na percentagem da campanha). Arquivar NÃO apaga nada: fica no histórico com o relatório. Tirar alguém NÃO apaga nada: fica no histórico com a data de saída.
            </p>
          )}

          {campanhaAberta ? (
            <>
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
                    Escolhe acima quem deve entrar no controle.
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
                            Na campanha desde {fmtDataHst(m.inicio || "", true)}
                          </div>
                          <div className="mt-0.5 text-xs">
                            {(medDe[m.colaborador_nome] || []).length > 0 ? (
                              <span className="text-violet-600">Medicação: {(medDe[m.colaborador_nome] || []).join(", ")}</span>
                            ) : (
                              <span className="text-muted-foreground">Sem medicação registada</span>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant="outline" onClick={() => abrirMedDe(m.colaborador_nome)} aria-label={`Medicação de ${m.colaborador_nome}`}>
                            Medicação
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => tirarDaCampanha(m)} aria-label={`Tirar ${m.colaborador_nome} da campanha`}>
                            Tirar
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={arquivarCampanha} disabled={aMembro} data-arquivar>
                  <Archive className="size-4" aria-hidden /> Arquivar campanha
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-start gap-2">
              <Button onClick={abrirCampanha} disabled={aMembro} data-abrir-campanha>
                {aMembro ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Users className="size-4" aria-hidden />}
                Abrir {rotuloCampanha(proximaCampanha)}
              </Button>
              <p className="text-xs text-muted-foreground">
                {semCampanha > 0
                  ? `O pessoal já em controle (${semCampanha} pessoa(s)) entra automaticamente nesta campanha.`
                  : "Depois de abrir, escolhe aqui o pessoal que entra no controle."}
              </p>
            </div>
          )}
        </div>
      </Modal>

      {/* Medicação de um membro, registada aqui mesmo */}
      <Modal aberto={modalMed} fechar={() => setModalMed(false)} titulo={`Medicação - ${medAlvo}`} largura="max-w-md">
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Nova medicação para {medAlvo}. A ficha da pessoa mostra a estatística desde o início e a comparação com o período anterior.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="md-nome">Medicamento *</label>
            <Input id="md-nome" value={formMed.medicamento}
              onChange={(e) => setFormMed((f) => ({ ...f, medicamento: e.target.value }))} placeholder="Ex.: Losartan 50 mg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold" htmlFor="md-dos">Dosagem</label>
              <Input id="md-dos" value={formMed.dosagem}
                onChange={(e) => setFormMed((f) => ({ ...f, dosagem: e.target.value }))} placeholder="1 comprimido / dia" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold" htmlFor="md-desde">Início *</label>
              <Input id="md-desde" type="date" value={formMed.desde}
                onChange={(e) => setFormMed((f) => ({ ...f, desde: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={formMed.regular}
              onChange={(e) => setFormMed((f) => ({ ...f, regular: e.target.checked }))}
              aria-label="Tomada regular"
            />
            Tomada regular (todos os dias, como orientado)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalMed(false)}>Cancelar</Button>
            <Button onClick={gravarMed} disabled={aMed}>
              {aMed ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Registar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ============ Peças ============ */

function LinhaCampanha({ pessoa, codigo, medicacao, onMedir }: { pessoa: CampanhaPessoa; codigo: string; medicacao: string; onMedir: () => void }) {
  const medido = pessoa.estado === "medido_hoje";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2" data-campanha-linha>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold">{pessoa.nome}</span>
          {codigo ? <span className="shrink-0 text-xs font-semibold text-muted-foreground">{codigo}</span> : null}
          {medicacao ? <span className={SELO_MEDICACAO} title={medicacao}>Com medicação</span> : null}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          Última: {pessoa.ultima.sistolica}/{pessoa.ultima.diastolica} em {fmtDataHst(pessoa.ultima.data_medicao, true)} | {pessoa.classificacao.texto}
        </div>
        {medicacao ? <div className="mt-0.5 text-xs text-violet-600">Medicação: {medicacao}</div> : null}
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

function LinhaMembro({ linha, codigo, onMedir }: { linha: LinhaMembro; codigo: string; onMedir: () => void }) {
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
          {linha.medicacao ? <span className={SELO_MEDICACAO} title={linha.medicacao}>Com medicação</span> : null}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">{linha.detalhe}</div>
        {linha.medicacao ? <div className="mt-0.5 text-xs text-violet-600">Medicação: {linha.medicacao}</div> : null}
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
