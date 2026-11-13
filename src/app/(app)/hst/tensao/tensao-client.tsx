/**
 * /hst/tensao - Medições de Tensão (cliente).
 *
 * Cartões por colaborador (última medição + total), filtro por nome e
 * por classificação, e o modal de nova medição com PRÉ-VISUALIZAÇÃO da
 * classificação enquanto se digita (a mesma função da lib corre no
 * navegador para avisar cedo e no servidor para gravar certo).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  classificarTensao,
  fmtDataHst,
  problemaValoresTensao,
  semAcentos,
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

export function TensaoClient() {
  const [medicoes, setMedicoes] = useState<MedicaoTensaoHST[] | null>(null);
  const [colabs, setColabs] = useState<ColaboradorHST[]>([]);
  const [falha, setFalha] = useState("");
  const [pesquisa, setPesquisa] = useState("");
  const [filtroCls, setFiltroCls] = useState("");

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ colaborador_nome: "", sistolica: "", diastolica: "", frequencia_cardiaca: "", observacoes: "" });
  const [aGravar, setAGravar] = useState(false);

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

  const cartoes = useMemo(() => {
    if (!medicoes) return [];
    // Última medição por colaborador + total de medições.
    const mapa: Record<string, { nome: string; ultima: MedicaoTensaoHST; total: number }> = {};
    for (const m of medicoes) {
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
  }, [medicoes, pesquisa, filtroCls]);

  // Pré-visualização da classificação enquanto se digita.
  const prev = useMemo(() => {
    const sys = Number(form.sistolica);
    const dia = Number(form.diastolica);
    if (!sys || !dia) return null;
    const problema = problemaValoresTensao(sys, dia, form.frequencia_cardiaca ? Number(form.frequencia_cardiaca) : null);
    if (problema) return { erro: problema };
    return { ...classificarTensao(sys, dia), sys, dia };
  }, [form.sistolica, form.diastolica, form.frequencia_cardiaca]);

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
        colaborador_nome: form.colaborador_nome,
        sistolica: sys,
        diastolica: dia,
        frequencia_cardiaca: form.frequencia_cardiaca ? Number(form.frequencia_cardiaca) : null,
        observacoes: form.observacoes
      }, "Medição registada.");
      setModal(false);
      setForm({ colaborador_nome: "", sistolica: "", diastolica: "", frequencia_cardiaca: "", observacoes: "" });
      carregar();
    } catch {
      /* toast já avisou */
    } finally {
      setAGravar(false);
    }
  }

  if (falha) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{falha}</div>;
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo="Medições de Tensão Arterial" subtitulo="Controlo de tensão de cada colaborador">
        <Button onClick={() => setModal(true)}>Nova Medição</Button>
      </Cabeca>

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
      </div>

      {!medicoes ? (
        <p className="py-8 text-center text-sm text-muted-foreground">A carregar medições...</p>
      ) : cartoes.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma medição registada.</p>
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
                      Última: {fmtDataHst(c.ultima.data_medicao, true)} | {c.total} medição(ões)
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
            <Input id="m-colab" list="lista-colabs-ten" value={form.colaborador_nome}
              onChange={(e) => setForm((f) => ({ ...f, colaborador_nome: e.target.value }))}
              placeholder="Nome do colaborador" />
            <datalist id="lista-colabs-ten">
              {colabs.map((c) => (
                <option key={c.id} value={c.name || ""} />
              ))}
            </datalist>
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
