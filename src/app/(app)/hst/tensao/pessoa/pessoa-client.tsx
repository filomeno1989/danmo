/**
 * /hst/tensao/pessoa - Histórico do colaborador (cliente).
 *
 * Resumo, evolução das últimas 20 medições (barras coloridas pela
 * classificação correcta), tabela completa e nova medição com data e
 * hora reais. CSV individual e relatório A4 desta pessoa (o papelinho
 * que vai ao posto de saúde). Com permissão de apagar, uma medição
 * errada sai da ficha (o hub não deixava apagar uma medição sozinha:
 * só a limpeza nuclear).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, LoaderCircle, Printer, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  classificarTensao,
  csvTensao,
  fmtDataHst,
  problemaValoresTensao,
  type MedicaoTensaoHST
} from "@/lib/hst";

const CORES_CLS: Record<string, string> = {
  normal: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  limitrofe: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  alta: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
};

const COR_BARRA: Record<string, string> = {
  normal: "bg-sky-500",
  limitrofe: "bg-amber-500",
  alta: "bg-red-600"
};

export function PessoaClient({ colab, podeApagar }: { colab: string; podeApagar: boolean }) {
  const [medicoes, setMedicoes] = useState<MedicaoTensaoHST[] | null>(null);
  const [falha, setFalha] = useState("");

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ data_medicao: agoraLocal(), sistolica: "", diastolica: "", frequencia_cardiaca: "", observacoes: "" });
  const [aGravar, setAGravar] = useState(false);

  function carregar() {
    pedir<{ medicoes: MedicaoTensaoHST[] }>("/api/hst/medicoes")
      .then((d) => setMedicoes((d.medicoes || []).filter((m) => m.colaborador_nome === colab)))
      .catch((e: Error) => setFalha(e.message));
  }
  useEffect(() => {
    carregar();
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

  const alturas = useMemo(() => {
    if (!ultimas20.length) return null;
    let maxSis = 120;
    let maxDia = 80;
    for (const m of ultimas20) {
      maxSis = Math.max(maxSis, m.sistolica);
      maxDia = Math.max(maxDia, m.diastolica);
    }
    return { maxSis, maxDia };
  }, [ultimas20]);

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
      await enviar("/api/hst/medicoes", {
        colaborador_nome: colab,
        sistolica: sys,
        diastolica: dia,
        frequencia_cardiaca: form.frequencia_cardiaca ? Number(form.frequencia_cardiaca) : null,
        observacoes: form.observacoes,
        data_medicao: form.data_medicao
      }, "Medição registada.");
      setModal(false);
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

      {/* Evolução */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-1 text-sm font-bold">Evolução da tensão (últimas 20 medições)</h2>
          <p className="mb-3 text-xs text-muted-foreground">Linha de cima: sistólica. Linha de baixo: diastólica (âmbar). Barras vermelhas = HTA.</p>
          {!alturas || ultimas20.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem medições.</p>
          ) : (
            <>
              <div className="flex items-end gap-1" aria-hidden>
                {ultimas20.map((m) => {
                  const cla = classificarTensao(m.sistolica, m.diastolica);
                  const h = Math.max(4, (m.sistolica / alturas.maxSis) * 56);
                  return <div key={`s${m.id}`} className={`min-w-1.5 flex-1 rounded-t ${COR_BARRA[cla.cls]}`} style={{ height: `${h}px` }} title={`${fmtDataHst(m.data_medicao)}: ${m.sistolica}/${m.diastolica}`} />;
                })}
              </div>
              <div className="mt-1 flex items-end gap-1" aria-hidden>
                {ultimas20.map((m) => {
                  const h = Math.max(4, (m.diastolica / alturas.maxDia) * 56);
                  return <div key={`d${m.id}`} className="min-w-1.5 flex-1 rounded-t bg-amber-500" style={{ height: `${h}px` }} title={`${fmtDataHst(m.data_medicao)}: diastólica ${m.diastolica}`} />;
                })}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
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
                    {podeApagar ? <th className="py-2 font-medium" aria-label="Acções" /> : null}
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
                        {podeApagar ? (
                          <td className="py-2">
                            <Button size="sm" variant="outline" onClick={() => apagarMedicao(m)} aria-label="Apagar medição">
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
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
        <Button onClick={() => setModal(true)}>Nova Medição para este Colaborador</Button>
      </div>

      <Modal aberto={modal} fechar={() => setModal(false)} titulo={`Nova Medição - ${colab}`} largura="max-w-md">
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
              Registar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
