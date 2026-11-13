/**
 * /hst/tensao - Controlo de Tensão Arterial (cliente).
 *
 * A campanha do posto de saúde no portal: quem tem a última medição alta
 * fica na fila e mede TODOS os dias, com estado do dia (Medido / Não
 * medido, há quantos dias), indicadores do período, cartões por pessoa,
 * CSV e papel A4 (individual ou coletivo) para enviar ao posto. A nova
 * medição aceita data e hora reais (lançar de manhã ou recuperar o
 * papelinho do dia) e o colaborador escolhe-se pela pesquisa por nome
 * ou código (o mesmo campo da oficina).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Download, LoaderCircle, Printer, Save, Stethoscope } from "lucide-react";
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
  resumoTensaoPeriodo,
  semAcentos,
  type CampanhaPessoa,
  type ColaboradorHST,
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

export function TensaoClient() {
  const [medicoes, setMedicoes] = useState<MedicaoTensaoHST[] | null>(null);
  const [colabs, setColabs] = useState<ColaboradorHST[]>([]);
  const [falha, setFalha] = useState("");
  const [pesquisa, setPesquisa] = useState("");
  const [filtroCls, setFiltroCls] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VAZIO);
  const [aGravar, setAGravar] = useState(false);

  const hoje = useState(hojeISO)[0];

  function carregar() {
    pedir<{ medicoes: MedicaoTensaoHST[] }>("/api/hst/medicoes")
      .then((d) => setMedicoes(d.medicoes))
      .catch((e: Error) => setFalha(e.message));
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

  /* Campanha diária: sempre sobre TODAS as medições (a fila é de hoje). */
  const filaCampanha = useMemo(
    () => (medicoes ? campanhaTensao(medicoes, hoje) : []),
    [medicoes, hoje]
  );
  const medidosHoje = filaCampanha.filter((p) => p.estado === "medido_hoje").length;

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

  return (
    <div className="space-y-5">
      <Cabeca titulo="Controlo de Tensão Arterial" subtitulo="Campanha diária, indicadores e envio ao posto de saúde">
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

      {/* Campanha diária */}
      <section aria-label="Campanha diária" className="card-sombra rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Stethoscope className="size-4 text-red-600" aria-hidden />
            <h2 className="text-sm font-bold">Campanha diária: tensão alta</h2>
          </div>
          <div className="flex items-center gap-2">
            <span data-campanha-contador className="text-sm font-bold">
              Hoje: {medidosHoje} de {filaCampanha.length} medidos
            </span>
            <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${medidosHoje === filaCampanha.length && filaCampanha.length > 0 ? CORES_CLS.normal : CORES_CLS.alta}`}>
              {filaCampanha.length === 0 ? "Sem fila" : medidosHoje === filaCampanha.length ? "Dia completo" : "Falta medir"}
            </span>
          </div>
        </div>
        {filaCampanha.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">Nenhum colega com a última medição alta. A fila fica vazia até aparecer alguém com tensão alta.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {filaCampanha.map((p) => (
              <LinhaCampanha key={p.nome} pessoa={p} codigo={codigoDe[p.nome] || ""} onMedir={() => abrirModal(p.nome)} />
            ))}
          </ul>
        )}
      </section>

      {/* Indicadores do período */}
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Indicador rotulo="Medições no período" valor={String(resumo.total)} />
        <Indicador rotulo="Pessoas medidas" valor={String(resumo.pessoas)} />
        <Indicador rotulo="Média da tensão" valor={resumo.total ? `${resumo.mediaSys}/${resumo.mediaDia}` : "-"} />
        <Indicador rotulo="Medições com tensão alta" valor={`${resumo.medicoesHta} (${resumo.pctHta}%)`} vermelho={resumo.medicoesHta > 0} />
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
                    <div className="truncate font-bold">{c.nome}</div>
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
    </div>
  );
}

/* ============ Peças ============ */

function LinhaCampanha({ pessoa, codigo, onMedir }: { pessoa: CampanhaPessoa; codigo: string; onMedir: () => void }) {
  const medido = pessoa.estado === "medido_hoje";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2" data-campanha-linha>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold">{pessoa.nome}</span>
          {codigo ? <span className="shrink-0 text-xs font-semibold text-muted-foreground">{codigo}</span> : null}
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

function Indicador({ rotulo, valor, vermelho = false }: { rotulo: string; valor: string; vermelho?: boolean }) {
  return (
    <div className="card-sombra rounded-lg border border-border bg-card p-3 text-center">
      <div className={`text-lg font-bold ${vermelho ? "text-red-600" : ""}`}>{valor}</div>
      <div className="mt-0.5 text-xs text-muted-foreground">{rotulo}</div>
    </div>
  );
}
