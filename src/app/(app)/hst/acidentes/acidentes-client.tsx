/**
 * /hst/acidentes - Acidentes e Incidentes (cliente).
 *
 * Duas abas como no hub: Acidentes (lista, registar, investigar, apagar,
 * relatório A4) e Acções Correctivas (cartões com mudança de status).
 * Os juízes de validação são os mesmos da API (lib/hst.ts): o que o
 * navegador avisa cedo é exactamente o que o servidor recusa.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  LoaderCircle,
  Pencil,
  Plus,
  Printer,
  Save,
  Search,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { SelecionarColaborador } from "@/components/oficina/selecionar-colaborador";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  accaoAtrasada,
  fmtDataHst,
  problemaAccao,
  problemaAcidente,
  semAcentos,
  STATUS_ACCAO,
  STATUS_ACIDENTE,
  TIPOS_OCORRENCIA,
  type AccaoHST,
  type AcidenteVisao,
  type AreaRiscoHST,
  type ColaboradorHST,
  type DadosAcidente
} from "@/lib/hst";

type Dados = {
  ok: boolean;
  acidentes: AcidenteVisao[];
  acoes: AccaoHST[];
  areas: AreaRiscoHST[];
  colaboradores: ColaboradorHST[];
};

type FormAcidente = {
  colaborador_nome: string;
  data_hora: string;
  tipo_ocorrencia: string;
  area_risco_id: number | null;
  tipo_lesao: string;
  parte_corpo: string;
  dias_afastamento: number;
  gerou_atestado: boolean;
  numero_atestado: string;
  testemunhas: string;
  descricao: string;
  status: string;
  causa_raiz: string;
  fator_humano: string;
  fator_ambiental: string;
  fator_equipamento: string;
};

const Vazio: FormAcidente = {
  colaborador_nome: "",
  data_hora: "",
  tipo_ocorrencia: "",
  area_risco_id: null as number | null,
  tipo_lesao: "",
  parte_corpo: "",
  dias_afastamento: 0,
  gerou_atestado: false,
  numero_atestado: "",
  testemunhas: "",
  descricao: "",
  status: "Em Investigacao",
  causa_raiz: "",
  fator_humano: "",
  fator_ambiental: "",
  fator_equipamento: ""
};

function agoraLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const CORES_STATUS: Record<string, string> = {
  "Em Investigacao": "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  Investigado: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  Encerrado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
};

const CORES_TIPO: Record<string, string> = {
  "Acidente com Afastamento": "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300",
  "Acidente sem Afastamento": "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  Incidente: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  "Doenca Ocupacional": "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
};

const CORES_ACCAO: Record<string, string> = {
  Pendente: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  "Em Andamento": "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  Concluida: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
};

function Pill({ texto, cores }: { texto: string; cores: string }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold whitespace-nowrap ${cores}`}>
      {texto}
    </span>
  );
}

export function AcidentesClient({ podeApagar }: { podeApagar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState("");
  const [aba, setAba] = useState<"acc" | "acoes">("acc");

  const [pesquisa, setPesquisa] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroAccao, setFiltroAccao] = useState("");

  // Modais
  const [modalNovo, setModalNovo] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [detalhe, setDetalhe] = useState<AcidenteVisao | null>(null);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalAccao, setModalAccao] = useState(false);
  const [accaoAcidenteId, setAccaoAcidenteId] = useState<number | null>(null);
  const [accEmEdicao, setAccEmEdicao] = useState<AccaoHST | null>(null);
  const [form, setForm] = useState<FormAcidente>(Vazio);
  const [formAccao, setFormAccao] = useState({ descricao_acao: "", responsavel: "", prazo: "", observacoes: "" });

  function carregar() {
    pedir<Dados>("/api/hst/acidentes")
      .then(setDados)
      .catch((e: Error) => setFalha(e.message));
  }
  useEffect(() => {
    carregar();
  }, []);

  const lista = useMemo(() => {
    if (!dados) return [];
    const alvo = semAcentos(pesquisa);
    return dados.acidentes.filter((a) => {
      if (alvo && !semAcentos(`${a.numero || ""} ${a.nomeDisplay} ${a.descricao || ""}`).includes(alvo)) return false;
      if (filtroStatus && a.status !== filtroStatus) return false;
      if (filtroTipo && a.tipo_ocorrencia !== filtroTipo) return false;
      return true;
    });
  }, [dados, pesquisa, filtroStatus, filtroTipo]);

  const acoesLista = useMemo(() => {
    if (!dados) return [];
    const base = filtroAccao ? dados.acoes.filter((a) => a.status === filtroAccao) : dados.acoes;
    return [...base].sort((a, b) => String(a.prazo).localeCompare(String(b.prazo)));
  }, [dados, filtroAccao]);

  const acoesPorAcidente = useMemo(() => {
    const mapa: Record<number, AccaoHST[]> = {};
    for (const a of dados?.acoes || []) {
      (mapa[a.acidente_id] ||= []).push(a);
    }
    return mapa;
  }, [dados]);

  const hojeISO = new Date().toISOString().slice(0, 10);

  function set<K extends keyof FormAcidente>(campo: K, valor: FormAcidente[K]) {
    setForm((f: FormAcidente) => ({ ...f, [campo]: valor }));
  }

  function abrirNovo() {
    setForm({...Vazio, data_hora: agoraLocal() } as FormAcidente);
    setModalNovo(true);
  }

  function abrirEditar(a: AcidenteVisao) {
    setForm({
      colaborador_nome: a.colaborador_nome || "",
      data_hora: (a.dataDisplay || "").slice(0, 16),
      tipo_ocorrencia: a.tipo_ocorrencia || "",
      area_risco_id: a.area_risco_id ?? null,
      tipo_lesao: a.tipo_lesao || "",
      parte_corpo: a.parte_corpo || "",
      dias_afastamento: a.dias_afastamento ?? 0,
      gerou_atestado: a.gerou_atestado === true,
      numero_atestado: a.numero_atestado || "",
      testemunhas: a.testemunhas || "",
      descricao: a.descricao || "",
      status: a.status || "Em Investigacao",
      causa_raiz: a.causa_raiz || "",
      fator_humano: a.fator_humano || "",
      fator_ambiental: a.fator_ambiental || "",
      fator_equipamento: a.fator_equipamento || ""
    });
    setModalEditar(true);
  }

  async function gravar() {
    const problema = problemaAcidente(form as Partial<DadosAcidente>);
    if (problema) {
      toast.warning(problema);
      return;
    }
    setAGravar(true);
    try {
      if (modalEditar) {
        await enviar(`/api/hst/acidentes/${detalhe?.id}`, { dados: form }, "Investigação gravada.", "PATCH");
        setModalEditar(false);
      } else {
        const r = await enviar<{ ok: boolean; acidente?: AcidenteVisao }>(
          "/api/hst/acidentes",
          { dados: form }
        );
        toast.success(`Acidente ${r.acidente?.numero || ""} registado.`);
        setModalNovo(false);
      }
      setDetalhe(null);
      carregar();
    } catch {
      /* o toast do enviar já avisou */
    } finally {
      setAGravar(false);
    }
  }

  async function apagarAcidente(a: AcidenteVisao) {
    if (!window.confirm(`Apagar o acidente ${a.numero || "sem número"} e as suas acções correctivas?`)) return;
    try {
      await enviar(`/api/hst/acidentes/${a.id}`, {}, "Acidente apagado.", "DELETE");
      setDetalhe(null);
      carregar();
    } catch {
      /* toast já avisou */
    }
  }

  async function gravarAccao() {
    const problema = problemaAccao(formAccao);
    if (problema) {
      toast.warning(problema);
      return;
    }
    if (accEmEdicao) {
      try {
        await enviar(`/api/hst/acoes/${accEmEdicao.id}`, formAccao, "Acção correctiva gravada.", "PATCH");
        setModalAccao(false);
        setAccEmEdicao(null);
        carregar();
      } catch {
        /* toast já avisou */
      }
      return;
    }
    if (!accaoAcidenteId) {
      toast.warning("Selecciona o acidente da acção.");
      return;
    }
    try {
      await enviar("/api/hst/acoes", { ...formAccao, acidente_id: accaoAcidenteId }, "Acção correctiva adicionada.");
      setModalAccao(false);
      carregar();
    } catch {
      /* toast já avisou */
    }
  }

  async function mudarStatusAccao(a: AccaoHST, status: string) {
    try {
      await enviar(`/api/hst/acoes/${a.id}`, { status }, "Status actualizado.", "PATCH");
      carregar();
    } catch {
      /* toast já avisou */
    }
  }

  async function apagarAccao(a: AccaoHST) {
    if (!window.confirm("Apagar esta acção correctiva?")) return;
    try {
      await enviar(`/api/hst/acoes/${a.id}`, {}, "Acção apagada.", "DELETE");
      carregar();
    } catch {
      /* toast já avisou */
    }
  }

  if (falha) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{falha}</div>;
  }

  const camposComum = (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-colab">Colaborador *</label>
          <SelecionarColaborador
            id="fa-colab"
            colaboradores={dados?.colaboradores || []}
            value={form.colaborador_nome}
            onChange={(nome) => set("colaborador_nome", nome)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-data">Data / hora *</label>
          <Input
            id="fa-data"
            type="datetime-local"
            value={form.data_hora}
            onChange={(e) => set("data_hora", e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-tipo">Tipo de ocorrência *</label>
          <select
            id="fa-tipo"
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
            value={form.tipo_ocorrencia}
            onChange={(e) => set("tipo_ocorrencia", e.target.value)}
          >
            <option value="">Seleccionar...</option>
            {TIPOS_OCORRENCIA.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-area">Área de risco</label>
          <select
            id="fa-area"
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
            value={form.area_risco_id ?? ""}
            onChange={(e) => set("area_risco_id", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Nenhuma</option>
            {(dados?.areas || []).filter((x) => x.ativo !== false).map((x) => (
              <option key={x.id} value={x.id}>{x.nome} [{x.nivel_risco}]</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-lesao">Tipo de lesão</label>
          <Input id="fa-lesao" value={form.tipo_lesao} onChange={(e) => set("tipo_lesao", e.target.value)}
            placeholder="Corte, queimadura, queda..." />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-parte">Parte do corpo</label>
          <Input id="fa-parte" value={form.parte_corpo} onChange={(e) => set("parte_corpo", e.target.value)}
            placeholder="Mão direita, braço esquerdo..." />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-dias">Dias de afastamento</label>
          <Input id="fa-dias" type="number" min={0} value={form.dias_afastamento}
            onChange={(e) => set("dias_afastamento", Number(e.target.value) || 0)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-atestado">Gerou atestado?</label>
          <select
            id="fa-atestado"
            className="h-9 w-full rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
            value={form.gerou_atestado ? "sim" : "nao"}
            onChange={(e) => set("gerou_atestado", e.target.value === "sim")}
          >
            <option value="nao">Não</option>
            <option value="sim">Sim</option>
          </select>
        </div>
        {form.gerou_atestado ? (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold" htmlFor="fa-num-atestado">Número do atestado</label>
            <Input id="fa-num-atestado" value={form.numero_atestado}
              onChange={(e) => set("numero_atestado", e.target.value)} placeholder="Número do atestado médico" />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-testemunhas">Testemunhas</label>
          <Input id="fa-testemunhas" value={form.testemunhas} onChange={(e) => set("testemunhas", e.target.value)}
            placeholder="Nomes separados por vírgula" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-desc">Descrição *</label>
          <textarea
            id="fa-desc"
            className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            value={form.descricao}
            onChange={(e) => set("descricao", e.target.value)}
            placeholder="Descreve o que aconteceu..."
          />
        </div>
      </div>
      <hr className="my-4 border-border" />
      <p className="mb-2 text-xs font-semibold">Análise de causa raiz (investigação)</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-causa">Causa raiz</label>
          <textarea
            id="fa-causa"
            className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            value={form.causa_raiz}
            onChange={(e) => set("causa_raiz", e.target.value)}
            placeholder="Causa principal identificada..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-fh">Factor humano</label>
          <textarea
            id="fa-fh"
            className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            value={form.fator_humano}
            onChange={(e) => set("fator_humano", e.target.value)}
            placeholder="Ex.: falta de atenção, não usou EPI..."
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-fa">Factor ambiental</label>
          <textarea
            id="fa-fa"
            className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            value={form.fator_ambiental}
            onChange={(e) => set("fator_ambiental", e.target.value)}
            placeholder="Ex.: chão escorregadio, pouca iluminação..."
          />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-xs font-semibold" htmlFor="fa-fe">Factor equipamento</label>
          <textarea
            id="fa-fe"
            className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
            value={form.fator_equipamento}
            onChange={(e) => set("fator_equipamento", e.target.value)}
            placeholder="Ex.: ferramenta defeituosa, sem protecção..."
          />
        </div>
      </div>
    </>
  );

  return (
    <div className="space-y-5">
      <Cabeca titulo="Acidentes e Incidentes" subtitulo="Registo, investigação e acções correctivas">
        <Button onClick={abrirNovo}>
          <Plus className="size-4" aria-hidden /> Novo Acidente
        </Button>
      </Cabeca>

      {/* Abas */}
      <div className="flex gap-1 border-b-2 border-border">
        <button
          className={`px-5 py-2.5 text-sm font-semibold ${aba === "acc" ? "border-b-[3px] border-b-emerald-600 text-foreground" : "text-muted-foreground"}`}
          onClick={() => setAba("acc")}
        >
          Acidentes
        </button>
        <button
          className={`px-5 py-2.5 text-sm font-semibold ${aba === "acoes" ? "border-b-[3px] border-b-emerald-600 text-foreground" : "text-muted-foreground"}`}
          onClick={() => setAba("acoes")}
        >
          Acções Correctivas
        </button>
      </div>

      {aba === "acc" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-48">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                className="pl-8"
                placeholder="Pesquisar por número, colaborador..."
                value={pesquisa}
                onChange={(e) => setPesquisa(e.target.value)}
                aria-label="Pesquisar acidentes"
              />
            </div>
            <select
              aria-label="Filtrar por status"
              className="h-9 rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value)}
            >
              <option value="">Todos os status</option>
              {STATUS_ACIDENTE.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <select
              aria-label="Filtrar por tipo"
              className="h-9 rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
            >
              <option value="">Todos os tipos</option>
              {TIPOS_OCORRENCIA.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <Card className="card-sombra">
            <CardContent className="p-0">
              {!dados ? (
                <p className="py-8 text-center text-sm text-muted-foreground">A carregar acidentes...</p>
              ) : lista.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhum acidente registado.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="p-3 font-medium">Número</th>
                        <th className="p-3 font-medium">Data</th>
                        <th className="p-3 font-medium">Colaborador</th>
                        <th className="p-3 font-medium">Tipo</th>
                        <th className="p-3 font-medium">Status</th>
                        <th className="p-3 font-medium">Dias afast.</th>
                        <th className="p-3 font-medium">Acções</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map((a) => (
                        <tr
                          key={a.id}
                          className="cursor-pointer border-b transition-colors last:border-0 hover:bg-muted/60"
                          onClick={() => setDetalhe(a)}
                        >
                          <td className="p-3 font-bold">{a.numero || <span className="text-muted-foreground">era antiga</span>}</td>
                          <td className="p-3">{fmtDataHst(a.dataDisplay, true)}</td>
                          <td className="p-3">{a.nomeDisplay}</td>
                          <td className="p-3"><Pill texto={a.tipo_ocorrencia || "-"} cores={CORES_TIPO[a.tipo_ocorrencia || ""] || CORES_TIPO["Incidente"]} /></td>
                          <td className="p-3"><Pill texto={a.status || "-"} cores={CORES_STATUS[a.status || ""] || CORES_TIPO["Incidente"]} /></td>
                          <td className="p-3">{a.dias_afastamento ?? 0}</td>
                          <td className="p-3 text-sky-600 dark:text-sky-400">{(acoesPorAcidente[a.id] || []).length}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <select
              aria-label="Filtrar acções por status"
              className="h-9 rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
              value={filtroAccao}
              onChange={(e) => setFiltroAccao(e.target.value)}
            >
              <option value="">Todas</option>
              {STATUS_ACCAO.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => { setAccEmEdicao(null); setAccaoAcidenteId(null); setFormAccao({ descricao_acao: "", responsavel: "", prazo: "", observacoes: "" }); setModalAccao(true); }}>
              <Plus className="size-4" aria-hidden /> Nova Acção
            </Button>
          </div>
          {!dados ? (
            <p className="py-8 text-center text-sm text-muted-foreground">A carregar...</p>
          ) : acoesLista.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma acção correctiva registada.</p>
          ) : (
            <div className="space-y-2">
              {acoesLista.map((a) => {
                const atrasada = accaoAtrasada(a, hojeISO);
                const acc = dados.acidentes.find((x) => x.id === a.acidente_id);
                return (
                  <Card key={a.id} className={`card-sombra ${atrasada ? "border-red-500" : ""}`}>
                    <CardContent className="flex flex-wrap items-start gap-3 p-3">
                      <Pill texto={a.status || "-"} cores={CORES_ACCAO[a.status || ""] || CORES_TIPO["Incidente"]} />
                      <div className="min-w-48 flex-1">
                        <strong className="block">{a.descricao_acao}</strong>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Acidente: {acc?.numero || "-"} | Responsável: {a.responsavel} | Prazo: {fmtDataHst(a.prazo)}
                          {atrasada ? <span className="ml-1 font-bold text-red-600">ATRASADA</span> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`Mudar status da acção ${a.id}`}
                          className="h-8 rounded-md border bg-transparent px-2 text-xs dark:bg-input/30"
                          value={a.status || "Pendente"}
                          onChange={(e) => mudarStatusAccao(a, e.target.value)}
                        >
                          {STATUS_ACCAO.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                        <Button
                          size="sm" variant="outline"
                          onClick={() => { setAccEmEdicao(a); setFormAccao({ descricao_acao: a.descricao_acao, responsavel: a.responsavel, prazo: String(a.prazo || "").slice(0, 10), observacoes: a.observacoes || "" }); setModalAccao(true); }}
                        >
                          <Pencil className="size-3.5" aria-hidden /> Editar
                        </Button>
                        {podeApagar ? (
                          <Button size="sm" variant="outline" onClick={() => apagarAccao(a)}>
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modal: novo acidente */}
      <Modal aberto={modalNovo} fechar={() => setModalNovo(false)} titulo="Registar Acidente / Incidente" largura="max-w-2xl">
        <div className="space-y-4">
          {camposComum}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalNovo(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={aGravar}>
              {aGravar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Registar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: detalhe */}
      <Modal aberto={!!detalhe && !modalEditar} fechar={() => setDetalhe(null)} titulo={`${detalhe?.numero || "Registo antigo"} - ${detalhe?.nomeDisplay || ""}`} largura="max-w-2xl">
        {detalhe ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><strong>Data/hora:</strong> {fmtDataHst(detalhe.dataDisplay, true)}</div>
              <div><strong>Tipo:</strong> <Pill texto={detalhe.tipo_ocorrencia || "-"} cores={CORES_TIPO[detalhe.tipo_ocorrencia || ""] || CORES_TIPO["Incidente"]} /></div>
              <div><strong>Status:</strong> <Pill texto={detalhe.status || "-"} cores={CORES_STATUS[detalhe.status || ""] || CORES_TIPO["Incidente"]} /></div>
              <div><strong>Área:</strong> {detalhe.area_risco_nome || "-"}</div>
              <div><strong>Lesão:</strong> {detalhe.tipo_lesao || "-"}</div>
              <div><strong>Parte do corpo:</strong> {detalhe.parte_corpo || "-"}</div>
              <div><strong>Dias afastamento:</strong> {detalhe.dias_afastamento ?? 0}</div>
              <div><strong>Atestado:</strong> {detalhe.gerou_atestado ? `Sim - ${detalhe.numero_atestado || ""}` : "Não"}</div>
              {detalhe.eAntigo ? (
                <div className="col-span-2 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Registo da era anterior ao hub (gravado com outro sistema). Nome e data resolvidos pela base;
                  os campos desta geração podem ser preenchidos com Editar / Investigar.
                </div>
              ) : null}
            </div>
            <div>
              <strong className="text-sm">Descrição:</strong>
              <p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">{detalhe.descricao || "-"}</p>
            </div>
            {detalhe.testemunhas ? (
              <p className="text-sm"><strong>Testemunhas:</strong> {detalhe.testemunhas}</p>
            ) : null}
            {detalhe.causa_raiz || detalhe.fator_humano || detalhe.fator_ambiental || detalhe.fator_equipamento ? (
              <div className="space-y-2 border-t border-border pt-3">
                <strong className="text-sm">Análise de causa raiz</strong>
                {detalhe.causa_raiz ? <p className="text-sm"><strong>Causa:</strong> {detalhe.causa_raiz}</p> : null}
                {detalhe.fator_humano ? (
                  <p className="rounded border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm dark:bg-amber-950/40"><strong>Factor humano:</strong> {detalhe.fator_humano}</p>
                ) : null}
                {detalhe.fator_ambiental ? (
                  <p className="rounded border-l-4 border-sky-500 bg-sky-50 px-3 py-2 text-sm dark:bg-sky-950/40"><strong>Factor ambiental:</strong> {detalhe.fator_ambiental}</p>
                ) : null}
                {detalhe.fator_equipamento ? (
                  <p className="rounded border-l-4 border-red-500 bg-red-50 px-3 py-2 text-sm dark:bg-red-950/40"><strong>Factor equipamento:</strong> {detalhe.fator_equipamento}</p>
                ) : null}
              </div>
            ) : null}
            <div className="border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between">
                <strong className="text-sm">Acções correctivas ({(acoesPorAcidente[detalhe.id] || []).length})</strong>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setAccEmEdicao(null); setAccaoAcidenteId(detalhe.id); setFormAccao({ descricao_acao: "", responsavel: "", prazo: "", observacoes: "" }); setModalAccao(true); }}>
                    <Plus className="size-3.5" aria-hidden /> Adicionar
                  </Button>
                </div>
              </div>
              {(acoesPorAcidente[detalhe.id] || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma acção para este acidente.</p>
              ) : (
                <div className="space-y-2">
                  {acoesPorAcidente[detalhe.id].map((ac) => {
                    const atrasada = accaoAtrasada(ac, hojeISO);
                    return (
                      <div key={ac.id} className={`flex items-start gap-3 rounded border p-2.5 text-sm ${atrasada ? "border-red-500" : "border-border"}`}>
                        <Pill texto={ac.status || "-"} cores={CORES_ACCAO[ac.status || ""] || CORES_TIPO["Incidente"]} />
                        <div className="min-w-0 flex-1">
                          <strong className="block">{ac.descricao_acao}</strong>
                          <div className="text-xs text-muted-foreground">
                            Responsável: {ac.responsavel} | Prazo: {fmtDataHst(ac.prazo)}
                            {atrasada ? <span className="ml-1 font-bold text-red-600">ATRASADA</span> : null}
                          </div>
                        </div>
                        <select
                          aria-label={`Mudar status da acção ${ac.id}`}
                          className="h-8 rounded-md border bg-transparent px-2 text-xs dark:bg-input/30"
                          value={ac.status || "Pendente"}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => mudarStatusAccao(ac, e.target.value)}
                        >
                          {STATUS_ACCAO.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
              {podeApagar ? (
                <Button variant="destructive" onClick={() => apagarAcidente(detalhe)}>
                  <Trash2 className="size-4" aria-hidden /> Apagar
                </Button>
              ) : null}
              <Button variant="outline" asChild>
                <a href={`/imprimir/hst/acidente?id=${detalhe.id}`} target="_blank" rel="noopener noreferrer">
                  <Printer className="size-4" aria-hidden /> Relatório
                </a>
              </Button>
              <Button onClick={() => abrirEditar(detalhe)}>
                <Pencil className="size-4" aria-hidden /> Editar / Investigar
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Modal: editar / investigar */}
      <Modal aberto={modalEditar} fechar={() => setModalEditar(false)} titulo="Investigar / Editar Acidente" largura="max-w-2xl">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="fa-status">Status do acidente</label>
            <select
              id="fa-status"
              className="h-9 w-full rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {STATUS_ACIDENTE.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {camposComum}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalEditar(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={aGravar}>
              {aGravar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Gravar alterações
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: acção correctiva */}
      <Modal aberto={modalAccao} fechar={() => { setModalAccao(false); setAccEmEdicao(null); }} titulo={accEmEdicao ? "Editar Acção Correctiva" : "Nova Acção Correctiva"} largura="max-w-md">
        <div className="space-y-3">
          {!accEmEdicao ? (
            <div>
              <label className="mb-1 block text-xs font-semibold" htmlFor="ac-acc">Acidente *</label>
              <select
                id="ac-acc"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
                value={accaoAcidenteId ?? ""}
                onChange={(e) => setAccaoAcidenteId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Seleccionar...</option>
                {(dados?.acidentes || []).map((a) => (
                  <option key={a.id} value={a.id}>{a.numero || "Registo antigo"} - {a.nomeDisplay}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ac-desc">Acção *</label>
            <textarea
              id="ac-desc"
              className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={formAccao.descricao_acao}
              onChange={(e) => setFormAccao((f) => ({ ...f, descricao_acao: e.target.value }))}
              placeholder="O que deve ser feito..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ac-resp">Responsável *</label>
            <SelecionarColaborador
              id="ac-resp"
              colaboradores={dados?.colaboradores || []}
              value={formAccao.responsavel}
              onChange={(nome) => setFormAccao((f) => ({ ...f, responsavel: nome }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ac-prazo">Prazo *</label>
            <Input id="ac-prazo" type="date" value={formAccao.prazo}
              onChange={(e) => setFormAccao((f) => ({ ...f, prazo: e.target.value }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ac-obs">Observações</label>
            <textarea
              id="ac-obs"
              className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={formAccao.observacoes}
              onChange={(e) => setFormAccao((f) => ({ ...f, observacoes: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setModalAccao(false); setAccEmEdicao(null); }}>Cancelar</Button>
            <Button onClick={gravarAccao}>
              <Save className="size-4" aria-hidden /> Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
