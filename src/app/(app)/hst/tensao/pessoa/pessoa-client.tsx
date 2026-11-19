/**
 * /hst/tensao/pessoa - Histórico do colaborador (cliente).
 *
 * Resumo, gráfico comparativo (linhas da sistólica e da diastólica na
 * mesma escala, com as linhas de corte 140/90 marcadas), tabela completa
 * e medições com EDITAR (o pedido do Filomeno: antes só dava apagar e
 * lançar de novo; agora a mesma linha é corrigida sem nascer uma nova).
 * Bloco de MEDICAÇÃO: o que a pessoa está a fazer, se a tomada é
 * regular, pausar/retomar e a estatística da tensão desde o início de
 * cada medicação, comparada com o período antes dela. CSV individual e
 * relatório A4 desta pessoa (o papelinho que vai ao posto de saúde).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, LoaderCircle, PauseCircle, PencilLine, PlayCircle, PlusCircle, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  classificarTensao,
  csvTensao,
  estatisticaMedicacao,
  fmtDataHst,
  pontosGraficoTensao,
  problemaValoresTensao,
  type ColaboradorHST,
  type MedicacaoTensaoHST,
  type MedicaoTensaoHST
} from "@/lib/hst";

const CORES_CLS: Record<string, string> = {
  normal: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  limitrofe: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  alta: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
};

export function PessoaClient({ colab, podeMexer, podeApagar }: { colab: string; podeMexer: boolean; podeApagar: boolean }) {
  const [medicoes, setMedicoes] = useState<MedicaoTensaoHST[] | null>(null);
  const [colabs, setColabs] = useState<ColaboradorHST[]>([]);
  const [medicacao, setMedicacao] = useState<MedicacaoTensaoHST[] | null>(null);
  const [falha, setFalha] = useState("");

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<MedicaoTensaoHST | null>(null);
  const [form, setForm] = useState({ data_medicao: agoraLocal(), sistolica: "", diastolica: "", frequencia_cardiaca: "", observacoes: "" });
  const [aGravar, setAGravar] = useState(false);

  const [modalMed, setModalMed] = useState(false);
  const [medEditando, setMedEditando] = useState<MedicacaoTensaoHST | null>(null);
  const [formMed, setFormMed] = useState({ medicamento: "", dosagem: "", desde: hojeISO(), regular: true, observacoes: "" });
  const [aMed, setAMed] = useState(false);

  function carregar() {
    pedir<{ medicoes: MedicaoTensaoHST[] }>("/api/hst/medicoes")
      .then((d) => setMedicoes((d.medicoes || []).filter((m) => m.colaborador_nome === colab)))
      .catch((e: Error) => setFalha(e.message));
    pedir<{ medicacao: MedicacaoTensaoHST[] }>(`/api/hst/medicacao?colab=${encodeURIComponent(colab)}`)
      .then((d) => setMedicacao(d.medicacao || []))
      .catch(() => setMedicacao([]));
  }
  useEffect(() => {
    carregar();
    pedir<{ colaboradores: ColaboradorHST[] }>("/api/hst/colaboradores")
      .then((d) => setColabs(d.colaboradores || []))
      .catch(() => {});
  }, [colab]);

  const lista = useMemo(
    () => [...(medicoes || [])].sort((a, b) => String(b.data_medicao).localeCompare(String(a.data_medicao))),
    [medicoes]
  );

  const resumo = useMemo(() => {
    if (!lista.length) return null;
    const ultima = lista[0];
    const hta = lista.filter((m) => classificarTensao(m.sistolica, m.diastolica).cls === "alta").length;
    return { total: lista.length, ultima, hta };
  }, [lista]);

  const ultimas20 = useMemo(() => lista.slice(0, 20).reverse(), [lista]);

  const grafico = useMemo(() => pontosGraficoTensao(ultimas20), [ultimas20]);

  const idDoColab = useMemo(
    () => colabs.find((c) => c.name === colab)?.id ?? null,
    [colabs, colab]
  );

  const medicacaoActiva = useMemo(() => (medicacao || []).filter((m) => m.activo), [medicacao]);

  const prev = useMemo(() => {
    const sys = Number(form.sistolica);
    const dia = Number(form.diastolica);
    if (!sys || !dia) return null;
    const problema = problemaValoresTensao(sys, dia, form.frequencia_cardiaca ? Number(form.frequencia_cardiaca) : null);
    if (problema) return { erro: problema };
    return { ...classificarTensao(sys, dia), sys, dia };
  }, [form.sistolica, form.diastolica, form.frequencia_cardiaca]);

  /** Agora local para o datetime-local (YYYY-MM-DDTHH:mm). */
  function agoraLocal(): string {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }

  /** Hoje local (YYYY-MM-DD). */
  function hojeISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function abrirNova() {
    setEditando(null);
    setForm({ data_medicao: agoraLocal(), sistolica: "", diastolica: "", frequencia_cardiaca: "", observacoes: "" });
    setModal(true);
  }

  function abrirEdicao(m: MedicaoTensaoHST) {
    setEditando(m);
    setForm({
      data_medicao: String(m.data_medicao || "").slice(0, 16) || agoraLocal(),
      sistolica: String(m.sistolica),
      diastolica: String(m.diastolica),
      frequencia_cardiaca: m.frequencia_cardiaca == null ? "" : String(m.frequencia_cardiaca),
      observacoes: m.observacoes || ""
    });
    setModal(true);
  }

  async function gravar() {
    const sys = Number(form.sistolica);
    const dia = Number(form.diastolica);
    const problema = problemaValoresTensao(sys, dia, form.frequencia_cardiaca ? Number(form.frequencia_cardiaca) : null);
    if (problema) {
      toast.warning(problema);
      return;
    }
    setAGravar(true);
    try {
      if (editando) {
        await enviar("/api/hst/medicoes", {
          id: editando.id,
          sistolica: sys,
          diastolica: dia,
          frequencia_cardiaca: form.frequencia_cardiaca ? Number(form.frequencia_cardiaca) : null,
          observacoes: form.observacoes,
          data_medicao: form.data_medicao
        }, "Medição actualizada.", "PATCH");
      } else {
        await enviar("/api/hst/medicoes", {
          colaborador_nome: colab,
          sistolica: sys,
          diastolica: dia,
          frequencia_cardiaca: form.frequencia_cardiaca ? Number(form.frequencia_cardiaca) : null,
          observacoes: form.observacoes,
          data_medicao: form.data_medicao
        }, "Medição registada.");
      }
      setModal(false);
      setEditando(null);
      setForm({ data_medicao: agoraLocal(), sistolica: "", diastolica: "", frequencia_cardiaca: "", observacoes: "" });
      carregar();
    } catch {
      /* toast já avisou */
    } finally {
      setAGravar(false);
    }
  }

  function descarregarCSV() {
    const csv = csvTensao(lista);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `tensao-${colab || "colaborador"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function apagarMedicao(m: MedicaoTensaoHST) {
    if (!window.confirm(`Apagar a medição ${m.sistolica}/${m.diastolica} de ${fmtDataHst(m.data_medicao)}?`)) return;
    try {
      await enviar(`/api/hst/medicoes?id=${m.id}`, {}, "Medição apagada.", "DELETE");
      carregar();
    } catch {
      /* toast já avisou */
    }
  }

  function abrirNovaMed() {
    setMedEditando(null);
    setFormMed({ medicamento: "", dosagem: "", desde: hojeISO(), regular: true, observacoes: "" });
    setModalMed(true);
  }

  function abrirEdicaoMed(m: MedicacaoTensaoHST) {
    setMedEditando(m);
    setFormMed({
      medicamento: m.medicamento || "",
      dosagem: m.dosagem || "",
      desde: String(m.desde || "").slice(0, 10) || hojeISO(),
      regular: m.regular === true,
      observacoes: m.observacoes || ""
    });
    setModalMed(true);
  }

  async function gravarMed() {
    if (!formMed.medicamento.trim()) {
      toast.warning("Indica o medicamento.");
      return;
    }
    setAMed(true);
    try {
      if (medEditando) {
        await enviar(`/api/hst/medicacao?id=${medEditando.id}`, formMed, "Medicação actualizada.", "PATCH");
      } else {
        await enviar("/api/hst/medicacao", {
          colaborador_id: idDoColab,
          colaborador_nome: colab,
          ...formMed
        }, "Medicação registada.");
      }
      setModalMed(false);
      setMedEditando(null);
      carregar();
    } catch {
      /* toast já avisou */
    } finally {
      setAMed(false);
    }
  }

  async function alternarMed(m: MedicacaoTensaoHST) {
    try {
      await enviar(
        `/api/hst/medicacao?id=${m.id}`,
        { activo: !m.activo },
        m.activo ? "Medicação pausada (fica no histórico)." : "Medicação retomada.",
        "PATCH"
      );
      carregar();
    } catch {
      /* toast já avisou */
    }
  }

  async function apagarMed(m: MedicacaoTensaoHST) {
    if (!window.confirm(`Apagar a medicação ${m.medicamento} (desde ${fmtDataHst(m.desde)})? Só para engano de escrita.`)) return;
    try {
      await enviar(`/api/hst/medicacao?id=${m.id}`, {}, "Medicação apagada.", "DELETE");
      carregar();
    } catch {
      /* toast já avisou */
    }
  }

  if (falha) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{falha}</div>;
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo={colab} subtitulo="Histórico completo de medições de tensão arterial">
        <Button variant="outline" onClick={descarregarCSV}>
          <Download className="size-4" aria-hidden /> CSV
        </Button>
        <Button variant="outline" asChild>
          <Link href={`/imprimir/hst/tensao?colab=${encodeURIComponent(colab)}`}>
            <Printer className="size-4" aria-hidden /> Relatório
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/hst/tensao">Voltar à lista</Link>
        </Button>
      </Cabeca>

      {/* Resumo */}
      <section aria-label="Resumo" className="grid gap-3 sm:grid-cols-4">
        <Card className="card-sombra">
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{resumo ? resumo.total : "-"}</div>
            <div className="text-xs text-muted-foreground">Total de medições</div>
          </CardContent>
        </Card>
        <Card className="card-sombra">
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${resumo ? (classificarTensao(resumo.ultima.sistolica, resumo.ultima.diastolica).cls === "alta" ? "text-red-600" : classificarTensao(resumo.ultima.sistolica, resumo.ultima.diastolica).cls === "limitrofe" ? "text-amber-600" : "text-emerald-600") : ""}`}>
              {resumo ? `${resumo.ultima.sistolica}/${resumo.ultima.diastolica}` : "-/-"}
            </div>
            <div className="text-xs text-muted-foreground">Última medição</div>
          </CardContent>
        </Card>
        <Card className="card-sombra">
          <CardContent className="p-4 text-center">
            <div className="text-lg font-bold">{resumo ? fmtDataHst(resumo.ultima.data_medicao) : "-"}</div>
            <div className="text-xs text-muted-foreground">Data da última</div>
          </CardContent>
        </Card>
        <Card className="card-sombra">
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${resumo && resumo.hta > 0 ? "text-red-600" : "text-emerald-600"}`}>
              {resumo ? resumo.hta : "-"}
            </div>
            <div className="text-xs text-muted-foreground">Medições com HTA</div>
          </CardContent>
        </Card>
      </section>

      {/* Medicação */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold">Medicação</h2>
            {podeMexer ? (
              <Button size="sm" variant="outline" onClick={abrirNovaMed}>
                <PlusCircle className="size-4" aria-hidden /> Nova medicação
              </Button>
            ) : null}
          </div>
          {medicacao === null ? (
            <p className="py-3 text-center text-sm text-muted-foreground">A carregar medicação...</p>
          ) : medicacao.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma medicação registada para {colab}.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Medicamento</th>
                    <th className="py-2 pr-3 font-medium">Dosagem</th>
                    <th className="py-2 pr-3 font-medium">Desde</th>
                    <th className="py-2 pr-3 font-medium">Tomada</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    {podeMexer ? <th className="py-2 font-medium" aria-label="Acções" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {medicacao.map((m) => (
                    <tr key={m.id} className="border-b last:border-0" data-linha-medicacao>
                      <td className="py-2 pr-3 font-bold">{m.medicamento}</td>
                      <td className="py-2 pr-3">{m.dosagem || "-"}</td>
                      <td className="py-2 pr-3">{fmtDataHst(m.desde || "", true)}</td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${m.regular ? CORES_CLS.normal : CORES_CLS.limitrofe}`}>
                          {m.regular ? "Regular" : "Irregular"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${m.activo ? CORES_CLS.normal : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                          {m.activo ? "Activa" : "Pausada"}
                        </span>
                      </td>
                      {podeMexer ? (
                        <td className="py-2">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => abrirEdicaoMed(m)} aria-label="Editar medicação">
                              <PencilLine className="size-3.5" aria-hidden />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => alternarMed(m)} aria-label={m.activo ? "Pausar medicação" : "Retomar medicação"}>
                              {m.activo ? <PauseCircle className="size-3.5" aria-hidden /> : <PlayCircle className="size-3.5" aria-hidden />}
                            </Button>
                            {podeApagar ? (
                              <Button size="sm" variant="outline" onClick={() => apagarMed(m)} aria-label="Apagar medicação">
                                <Trash2 className="size-3.5" aria-hidden />
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Estatística desde o início de cada medicação activa */}
          {medicacaoActiva.map((m) => {
            const est = estatisticaMedicacao(lista, String(m.desde || ""));
            return (
              <div key={m.id} className="mt-3 rounded-md bg-muted px-3 py-2 text-sm" data-estatistica-medicacao>
                <span className="font-bold">
                  {m.medicamento} desde {fmtDataHst(m.desde || "", true)}:
                </span>
                {!est ? (
                  <span className="ml-2 text-muted-foreground">sem medições desde o início (a estatística nasce com a 1.ª medição)</span>
                ) : (
                  <>
                    <span className="ml-2">
                      {est.desde.total} medição(ões) | média {est.desde.mediaSys}/{est.desde.mediaDia} | altas {est.desde.alta} de {est.desde.total} ({est.desde.pctAlta}%)
                    </span>
                    {est.antes.total > 0 ? (
                      <span className="ml-2 text-xs text-muted-foreground">
                        | antes: média {est.antes.mediaSys}/{est.antes.mediaDia}, altas {est.antes.alta} de {est.antes.total} ({est.antes.pctAlta}%) |{" "}
                        {est.desde.mediaSys < est.antes.mediaSys ? "tendência de melhoria" : est.desde.mediaSys === est.antes.mediaSys ? "igual ao período anterior" : "acima do período anterior"}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Evolução comparativa */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-1 text-sm font-bold">Evolução da tensão (comparativa, últimas 20 medições)</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Linha azul: sistólica. Linha âmbar: diastólica. Tracejado: corte de hipertensão (140/90). Pontos acima do tracejado são medições com HTA.
          </p>
          {ultimas20.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem medições.</p>
          ) : (
            <>
              <svg
                viewBox={`0 0 ${grafico.largura} ${grafico.altura}`}
                className="h-auto w-full"
                role="img"
                aria-label="Gráfico comparativo: sistólica contra diastólica nas últimas 20 medições"
                data-grafico-tensao
              >
                {grafico.yTicks.map((t) => (
                  <g key={t.v}>
                    <line x1={36} x2={grafico.largura - 12} y1={t.y} y2={t.y} className="stroke-foreground" strokeOpacity={0.12} strokeWidth={1} />
                    <text x={32} y={t.y + 3} textAnchor="end" fontSize={9} fill="currentColor" className="fill-muted-foreground">
                      {t.v}
                    </text>
                  </g>
                ))}
                <line x1={36} x2={grafico.largura - 12} y1={grafico.yLimiarSys} y2={grafico.yLimiarSys} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="5 4" />
                <text x={grafico.largura - 14} y={grafico.yLimiarSys - 4} textAnchor="end" fontSize={9} fill="#dc2626">
                  140 (HTA)
                </text>
                <line x1={36} x2={grafico.largura - 12} y1={grafico.yLimiarDia} y2={grafico.yLimiarDia} stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="5 4" />
                <text x={grafico.largura - 14} y={grafico.yLimiarDia - 4} textAnchor="end" fontSize={9} fill="#f59e0b">
                  90
                </text>
                <polyline
                  points={grafico.sys.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                <polyline
                  points={grafico.dia.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {grafico.sys.map((p) => (
                  <circle key={`s${p.iso}-${p.x}`} cx={p.x} cy={p.y} r={2.8} fill="#0284c7">
                    <title>{`${fmtDataHst(p.iso, true)}: ${p.v} sistólica`}</title>
                  </circle>
                ))}
                {grafico.dia.map((p) => (
                  <circle key={`d${p.iso}-${p.x}`} cx={p.x} cy={p.y} r={2.8} fill="#f59e0b">
                    <title>{`${fmtDataHst(p.iso, true)}: ${p.v} diastólica`}</title>
                  </circle>
                ))}
                {grafico.rotulos.map((r) => (
                  <text key={`r${r.x}-${r.texto}`} x={r.x} y={grafico.altura - 6} textAnchor="middle" fontSize={9} className="fill-muted-foreground">
                    {r.texto}
                  </text>
                ))}
              </svg>
              <div className="mt-2 text-xs text-muted-foreground" data-legenda-grafico>
                Primeira: {fmtDataHst(ultimas20[0].data_medicao)} - {ultimas20[0].sistolica}/{ultimas20[0].diastolica} |
                Última: {fmtDataHst(ultimas20[ultimas20.length - 1].data_medicao)} - {ultimas20[ultimas20.length - 1].sistolica}/{ultimas20[ultimas20.length - 1].diastolica}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-bold">Histórico completo</h2>
          {!medicoes ? (
            <p className="py-4 text-center text-sm text-muted-foreground">A carregar...</p>
          ) : lista.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem medições.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Data</th>
                    <th className="py-2 pr-3 font-medium">Sistólica</th>
                    <th className="py-2 pr-3 font-medium">Diastólica</th>
                    <th className="py-2 pr-3 font-medium">Tensão</th>
                    <th className="py-2 pr-3 font-medium">FC (bpm)</th>
                    <th className="py-2 pr-3 font-medium">Classificação</th>
                    <th className="py-2 pr-3 font-medium">Medido por</th>
                    <th className="py-2 pr-3 font-medium">Obs.</th>
                    {podeMexer || podeApagar ? <th className="py-2 font-medium" aria-label="Acções" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {lista.map((m) => {
                    const cla = classificarTensao(m.sistolica, m.diastolica);
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">{fmtDataHst(m.data_medicao, true)}</td>
                        <td className="py-2 pr-3 font-bold">{m.sistolica}</td>
                        <td className="py-2 pr-3 font-bold">{m.diastolica}</td>
                        <td className="py-2 pr-3 font-bold">{m.sistolica}/{m.diastolica}</td>
                        <td className="py-2 pr-3">{m.frequencia_cardiaca || "-"}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${CORES_CLS[cla.cls]}`}>
                            {cla.texto}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{m.medido_por || "-"}</td>
                        <td className="max-w-40 truncate py-2 pr-3" title={m.observacoes || ""}>{m.observacoes || "-"}</td>
                        {podeMexer || podeApagar ? (
                          <td className="py-2">
                            <div className="flex justify-end gap-1">
                              {podeMexer ? (
                                <Button size="sm" variant="outline" onClick={() => abrirEdicao(m)} aria-label="Editar medição">
                                  <PencilLine className="size-3.5" aria-hidden />
                                </Button>
                              ) : null}
                              {podeApagar ? (
                                <Button size="sm" variant="outline" onClick={() => apagarMedicao(m)} aria-label="Apagar medição">
                                  <Trash2 className="size-3.5" aria-hidden />
                                </Button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-center">
        <Button onClick={abrirNova}>Nova Medição para este Colaborador</Button>
      </div>

      <Modal aberto={modal} fechar={() => setModal(false)} titulo={editando ? `Editar Medição - ${colab}` : `Nova Medição - ${colab}`} largura="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="mc-data">Data e hora da medição</label>
            <Input id="mc-data" type="datetime-local" value={form.data_medicao}
              onChange={(e) => setForm((f) => ({ ...f, data_medicao: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold" htmlFor="mc-sis">Sistólica *</label>
              <Input id="mc-sis" type="number" min={60} max={260} value={form.sistolica}
                onChange={(e) => setForm((f) => ({ ...f, sistolica: e.target.value }))} placeholder="120" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold" htmlFor="mc-dia">Diastólica *</label>
              <Input id="mc-dia" type="number" min={40} max={160} value={form.diastolica}
                onChange={(e) => setForm((f) => ({ ...f, diastolica: e.target.value }))} placeholder="80" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold" htmlFor="mc-fc">FC (bpm)</label>
              <Input id="mc-fc" type="number" min={40} max={200} value={form.frequencia_cardiaca}
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
            <label className="mb-1 block text-xs font-semibold" htmlFor="mc-obs">Observações</label>
            <textarea id="mc-obs" className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={aGravar}>
              {aGravar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {editando ? "Gravar alterações" : "Registar"}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal aberto={modalMed} fechar={() => setModalMed(false)} titulo={medEditando ? "Editar Medicação" : "Nova Medicação"} largura="max-w-md">
        <div className="space-y-3">
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
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="md-obs">Observações</label>
            <textarea id="md-obs" className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={formMed.observacoes} onChange={(e) => setFormMed((f) => ({ ...f, observacoes: e.target.value }))}
              placeholder="Quem receitou, efeitos, esquecimentos..." />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalMed(false)}>Cancelar</Button>
            <Button onClick={gravarMed} disabled={aMed}>
              {aMed ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {medEditando ? "Gravar alterações" : "Registar"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
