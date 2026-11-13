/**
 * /hst/areas - Áreas de Risco (cliente).
 *
 * Cartões ordenados do risco mais grave para o mais leve (ordem do
 * juizo do painel: Crítico primeiro), com pesquisa sem acentos. O nível
 * de risco decide a cor da borda, como no hub.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Pencil, Plus, Save, Search } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  NIVEIS_RISCO,
  ORDEM_RISCO,
  problemaArea,
  semAcentos,
  type AreaRiscoHST
} from "@/lib/hst";

const BORDA_NIVEL: Record<string, string> = {
  Baixo: "border-l-emerald-600",
  Medio: "border-l-sky-500",
  Alto: "border-l-amber-500",
  Critico: "border-l-red-600"
};

const PILL_NIVEL: Record<string, string> = {
  Baixo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  Medio: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  Alto: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  Critico: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
};

export function AreasClient({ podeApagar }: { podeApagar: boolean }) {
  const [areas, setAreas] = useState<AreaRiscoHST[] | null>(null);
  const [falha, setFalha] = useState("");
  const [pesquisa, setPesquisa] = useState("");
  const [filtroNivel, setFiltroNivel] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("ativas");

  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<AreaRiscoHST | null>(null);
  const [form, setForm] = useState({ nome: "", nivel_risco: "Alto", descricao: "", medidas_controlo: "", ativo: true });
  const [aGravar, setAGravar] = useState(false);

  function carregar() {
    pedir<{ areas: AreaRiscoHST[] }>("/api/hst/areas")
      .then((d) => setAreas(d.areas))
      .catch((e: Error) => setFalha(e.message));
  }
  useEffect(() => {
    carregar();
  }, []);

  const lista = useMemo(() => {
    if (!areas) return [];
    const alvo = semAcentos(pesquisa);
    let base = areas;
    if (filtroEstado === "ativas") base = base.filter((a) => a.ativo !== false);
    if (alvo) base = base.filter((a) => semAcentos(a.nome).includes(alvo));
    if (filtroNivel) base = base.filter((a) => a.nivel_risco === filtroNivel);
    return [...base].sort((x, y) => (ORDEM_RISCO[x.nivel_risco] ?? 9) - (ORDEM_RISCO[y.nivel_risco] ?? 9));
  }, [areas, pesquisa, filtroNivel, filtroEstado]);

  const stats = useMemo(() => {
    const ativas = (areas || []).filter((a) => a.ativo !== false);
    return {
      ativas: ativas.length,
      criticas: ativas.filter((a) => a.nivel_risco === "Critico").length,
      altas: ativas.filter((a) => a.nivel_risco === "Alto").length
    };
  }, [areas]);

  function abrirNova() {
    setEditando(null);
    setForm({ nome: "", nivel_risco: "Alto", descricao: "", medidas_controlo: "", ativo: true });
    setModal(true);
  }

  function abrirEditar(a: AreaRiscoHST) {
    setEditando(a);
    setForm({
      nome: a.nome,
      nivel_risco: a.nivel_risco,
      descricao: a.descricao || "",
      medidas_controlo: a.medidas_controlo || "",
      ativo: a.ativo !== false
    });
    setModal(true);
  }

  async function gravar() {
    const problema = problemaArea(form);
    if (problema) {
      toast.warning(problema);
      return;
    }
    setAGravar(true);
    try {
      if (editando) {
        await enviar(`/api/hst/areas/${editando.id}`, form, "Área actualizada.", "PATCH");
      } else {
        await enviar("/api/hst/areas", form, "Área registada.");
      }
      setModal(false);
      carregar();
    } catch {
      /* toast já avisou */
    } finally {
      setAGravar(false);
    }
  }

  async function alternarActiva(a: AreaRiscoHST) {
    try {
      const activa = a.ativo !== false;
      await enviar(`/api/hst/areas/${a.id}`, { ativo: !activa }, undefined, "PATCH");
      toast.success(activa ? "Área desactivada." : "Área reactivada.");
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
      <Cabeca titulo="Áreas de Risco" subtitulo="Mapeamento de áreas e níveis de risco da operação">
        <Button onClick={abrirNova}>
          <Plus className="size-4" aria-hidden /> Nova Área
        </Button>
      </Cabeca>

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-3">
        <div className="card-sombra rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Áreas activas</div>
          <div className="text-xl font-bold">{areas ? stats.ativas : "..."}</div>
        </div>
        <div className="card-sombra rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Nível crítico</div>
          <div className="text-xl font-bold text-red-600">{areas ? stats.criticas : "..."}</div>
        </div>
        <div className="card-sombra rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Nível alto</div>
          <div className="text-xl font-bold text-amber-600">{areas ? stats.altas : "..."}</div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-8" placeholder="Pesquisar área..." value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)} aria-label="Pesquisar áreas" />
        </div>
        <select aria-label="Filtrar por nível" className="h-9 rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
          value={filtroNivel} onChange={(e) => setFiltroNivel(e.target.value)}>
          <option value="">Todos os níveis</option>
          {NIVEIS_RISCO.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
        <select aria-label="Filtrar por estado" className="h-9 rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
          value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="ativas">Apenas activas</option>
          <option value="todas">Incluir inactivas</option>
        </select>
      </div>

      {!areas ? (
        <p className="py-8 text-center text-sm text-muted-foreground">A carregar áreas...</p>
      ) : lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma área de risco registada.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {lista.map((a) => {
            const inactiva = a.ativo === false;
            return (
              <div
                key={a.id}
                className={`card-sombra rounded-lg border border-l-4 border-border bg-card p-4 ${BORDA_NIVEL[a.nivel_risco] || ""} ${inactiva ? "opacity-55" : ""}`}
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <span className="font-bold">{a.nome}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${PILL_NIVEL[a.nivel_risco] || ""}`}>
                    {a.nivel_risco}{inactiva ? " - Inactiva" : ""}
                  </span>
                </div>
                {a.descricao ? <p className="mb-2 text-sm text-muted-foreground">{a.descricao}</p> : null}
                {a.medidas_controlo ? (
                  <p className="mb-3 rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
                    <strong>Medidas de controlo:</strong> {a.medidas_controlo}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => abrirEditar(a)}>
                    <Pencil className="size-3.5" aria-hidden /> Editar
                  </Button>
                  <Button size="sm" variant={inactiva ? "default" : "destructive"} onClick={() => alternarActiva(a)}>
                    {inactiva ? "Reactivar" : "Desactivar"}
                  </Button>
                  {podeApagar && inactiva ? (
                    <Button
                      size="sm" variant="outline"
                      onClick={async () => {
                        if (!window.confirm(`Apagar a área ${a.nome}?`)) return;
                        try {
                          await enviar(`/api/hst/areas/${a.id}`, {}, "Área apagada.", "DELETE");
                          carregar();
                        } catch {
                          /* toast já avisou */
                        }
                      }}
                    >
                      Apagar
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        aberto={modal}
        fechar={() => setModal(false)}
        titulo={editando ? "Editar Área de Risco" : "Nova Área de Risco"}
        largura="max-w-md"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ar-nome">Nome da área *</label>
            <Input id="ar-nome" value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Ex.: Cais 3, Armazém de Combustíveis, Oficina..." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ar-nivel">Nível de risco *</label>
            <select id="ar-nivel" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
              value={form.nivel_risco} onChange={(e) => setForm((f) => ({ ...f, nivel_risco: e.target.value }))}>
              {NIVEIS_RISCO.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ar-desc">Descrição / perigos identificados</label>
            <textarea id="ar-desc" className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
              placeholder="Ex.: movimentação de contentores, tráfego de empilhadoras..." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ar-medidas">Medidas de controlo</label>
            <textarea id="ar-medidas" className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={form.medidas_controlo} onChange={(e) => setForm((f) => ({ ...f, medidas_controlo: e.target.value }))}
              placeholder="Ex.: uso obrigatório de colete reflector e capacete, sinalização..." />
          </div>
          {editando ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ativo} className="size-4"
                onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} />
              Área activa
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={gravar} disabled={aGravar}>
              {aGravar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Guardar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
