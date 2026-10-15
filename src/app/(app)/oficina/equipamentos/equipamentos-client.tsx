"use client";

/**
 * EquipamentosClient - Lista de equipamentos com filtros, criação e
 * edição (código, nome, categoria, grupo, modelo, anos e estado).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  FileSpreadsheet,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  TriangleAlert
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import type { CategoriaEquip, Equipamento, GrupoEquip } from "@/lib/oficina";
import { exportarEquipamentosExcel, exportarEquipamentosPdf } from "./exportar-lista";

type Dados = {
  ok: boolean;
  equipamentos: Equipamento[];
  categorias: CategoriaEquip[];
  grupos: GrupoEquip[];
};

export function EquipamentosClient({
  podeCriar,
  podeEditar
}: {
  podeCriar: boolean;
  podeEditar: boolean;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [aExcel, setAExcel] = useState(false);
  const [aPdf, setAPdf] = useState(false);

  const [fCategoria, setFCategoria] = useState("");
  const [fAtivo, setFAtivo] = useState("");
  const [fBusca, setFBusca] = useState("");

  // modal
  const [modal, setModal] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    fleet_type: "",
    group_name: "",
    model: "",
    year_acquired: "",
    year_decommissioned: "",
    active: true
  });

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro("");
    try {
      const d = await pedir<Dados>("/api/oficina/equipamentos");
      setDados(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/oficina/equipamentos", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok || d?.ok === false) throw new Error(d?.erro || "Falha ao carregar");
        setDados(d);
        setErro("");
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Erro inesperado");
      })
      .finally(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  /** lower-case sem acentos: "Pneumatico" encontra "Pneumático" (igual
   *  à pesquisa do SelecionarEquipamento). */
  function normalizar(s: string): string {
    return s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  const lista = useMemo(() => {
    if (!dados) return [];
    const busca = normalizar(fBusca.trim());
    let l = [...dados.equipamentos];
    if (fCategoria) l = l.filter((e) => e.fleet_type === fCategoria);
    if (fAtivo) l = l.filter((e) => String(e.active) === fAtivo);
    if (busca) {
      // Acha pelo código, pelo nome, pelo modelo ou pela categoria
      // (antes só achava pelo código exacto).
      l = l.filter((e) =>
        normalizar(`${e.code} ${e.name || ""} ${e.model || ""} ${e.fleet_type || ""}`).includes(busca)
      );
    }
    return l;
  }, [dados, fCategoria, fAtivo, fBusca]);

  const gruposFiltrados = useMemo(
    () =>
      (dados?.grupos || []).filter((g) => {
        const cat = dados?.categorias.find((c) => c.id === g.categoria_id);
        return cat && cat.nome === form.fleet_type;
      }),
    [dados, form.fleet_type]
  );

  /** Etiqueta dos filtros activos (subtítulo das exportações). */
  function etiquetaFiltros(): string {
    const partes: string[] = [];
    partes.push(`Categoria: ${fCategoria || "todas"}`);
    partes.push(`Estado: ${fAtivo === "true" ? "activos" : fAtivo === "false" ? "inactivos" : "todos"}`);
    if (fBusca.trim()) partes.push(`Pesquisa: "${fBusca.trim()}"`);
    return partes.join("  ·  ");
  }

  async function exportarExcel() {
    if (!lista.length) {
      toast.error("Não há equipamentos para exportar com estes filtros.");
      return;
    }
    setAExcel(true);
    try {
      await exportarEquipamentosExcel(lista, etiquetaFiltros());
      toast.success(`Excel exportado: ${lista.length} equipamentos.`);
    } catch {
      toast.error("Não foi possível gerar o Excel.");
    } finally {
      setAExcel(false);
    }
  }

  async function exportarPdf() {
    if (!lista.length) {
      toast.error("Não há equipamentos para exportar com estes filtros.");
      return;
    }
    setAPdf(true);
    try {
      await exportarEquipamentosPdf(lista, etiquetaFiltros());
      toast.success(`PDF exportado: ${lista.length} equipamentos.`);
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setAPdf(false);
    }
  }

  function abrirNovo() {
    setEditId(null);
    setForm({
      code: "",
      name: "",
      fleet_type: dados?.categorias[0]?.nome || "",
      group_name: "",
      model: "",
      year_acquired: "",
      year_decommissioned: "",
      active: true
    });
    setModal(true);
  }

  function abrirEdicao(e: Equipamento) {
    setEditId(e.id);
    setForm({
      code: e.code || "",
      name: e.name || "",
      fleet_type: e.fleet_type || "",
      group_name: e.group_name || "",
      model: e.model || "",
      year_acquired: e.year_acquired != null ? String(e.year_acquired) : "",
      year_decommissioned: e.year_decommissioned != null ? String(e.year_decommissioned) : "",
      active: Boolean(e.active)
    });
    setModal(true);
  }

  async function gravar(ev: React.FormEvent) {
    ev.preventDefault();
    if (aGravar) return;
    setAGravar(true);
    try {
      await enviar(
        "/api/oficina/equipamentos",
        {
          action: editId ? "editar" : "criar",
          id: editId || undefined,
          code: form.code,
          name: form.name,
          fleet_type: form.fleet_type,
          group_name: form.group_name,
          model: form.model,
          year_acquired: form.year_acquired ? Number(form.year_acquired) : null,
          year_decommissioned: form.year_decommissioned ? Number(form.year_decommissioned) : null,
          active: form.active
        },
        "Equipamento guardado."
      );
      setModal(false);
      await carregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravar(false);
    }
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo="Equipamentos" subtitulo="Máquinas da frota Danmo. Clica no código para ver o histórico completo.">
        <Button variant="outline" size="sm" onClick={carregar} disabled={aCarregar}>
          {aCarregar ? <Rodar /> : <RotateCcw aria-hidden />}
          Actualizar
        </Button>
        <Button variant="outline" size="sm" onClick={exportarExcel} disabled={aExcel}>
          {aExcel ? <Rodar /> : <FileSpreadsheet aria-hidden />}
          Excel
        </Button>
        <Button variant="outline" size="sm" onClick={exportarPdf} disabled={aPdf}>
          {aPdf ? <Rodar /> : <Printer aria-hidden />}
          PDF
        </Button>
        {podeCriar && (
          <Button size="sm" onClick={abrirNovo}>
            <Plus aria-hidden />
            Novo Equipamento
          </Button>
        )}
      </Cabeca>

      {erro && (
        <Card className="border-erro/40">
          <CardContent className="flex items-center gap-2 text-sm text-erro">
            <TriangleAlert className="size-4" aria-hidden />
            {erro}
          </CardContent>
        </Card>
      )}

      <Card className="card-sombra">
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="eq-cat">Categoria</Label>
            <select
              id="eq-cat"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fCategoria}
              onChange={(e) => setFCategoria(e.target.value)}
            >
              <option value="">Todas</option>
              {(dados?.categorias || []).map((c) => (
                <option key={c.id} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-ativo">Estado</Label>
            <select
              id="eq-ativo"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fAtivo}
              onChange={(e) => setFAtivo(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="true">Activos</option>
              <option value="false">Inactivos</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eq-busca">Buscar</Label>
            <Input
              id="eq-busca"
              value={fBusca}
              onChange={(e) => setFBusca(e.target.value)}
              placeholder="Código, nome ou modelo (ex: 45-30)"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="card-sombra">
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                  {["Código", "Categoria", "Grupo", "Modelo", "Ano Aq.", "Estado", "Acções"].map((c) => (
                    <th key={c} className="px-2 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aCarregar ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-8 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Rodar /> A carregar equipamentos...
                      </span>
                    </td>
                  </tr>
                ) : lista.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-2 py-8 text-center text-muted-foreground">
                      Nenhum equipamento encontrado.
                    </td>
                  </tr>
                ) : (
                  lista.map((e) => (
                    <tr key={e.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
                      <td className="px-2 py-2">
                        <Link
                          href={`/oficina/maquina/${e.id}`}
                          className="font-semibold text-primario hover:underline dark:text-primario-forte"
                          title="Ver histórico completo"
                        >
                          {e.code}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{e.fleet_type || "-"}</td>
                      <td className="px-2 py-2">{e.group_name || "-"}</td>
                      <td className="px-2 py-2">{e.model || "-"}</td>
                      <td className="px-2 py-2 tabular-nums">{e.year_acquired || "-"}</td>
                      <td className="px-2 py-2">
                        <Etiqueta cor={e.active ? "bg-sucesso-bg text-sucesso" : "bg-muted text-muted-foreground"}>
                          {e.active ? "Activo" : "Inactivo"}
                        </Etiqueta>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="size-8 p-0" title="Histórico" asChild>
                            <Link href={`/oficina/maquina/${e.id}`}>
                              <BarChart3 className="size-4" aria-hidden />
                            </Link>
                          </Button>
                          {podeEditar && (
                            <Button size="sm" variant="ghost" className="size-8 p-0" title="Editar" onClick={() => abrirEdicao(e)}>
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal
        aberto={modal}
        fechar={() => setModal(false)}
        titulo={editId ? "Editar Equipamento" : "Novo Equipamento"}
      >
        <form onSubmit={gravar} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Código <span className="text-erro">*</span>
              </Label>
              <Input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="Ex: 45-30"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>
                Categoria <span className="text-erro">*</span>
              </Label>
              <select
                required
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={form.fleet_type}
                onChange={(e) => setForm({ ...form, fleet_type: e.target.value, group_name: "" })}
              >
                {(dados?.categorias || []).map((c) => (
                  <option key={c.id} value={c.nome}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Grupo</Label>
              <select
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={form.group_name}
                onChange={(e) => setForm({ ...form, group_name: e.target.value })}
              >
                <option value="">- Sem grupo -</option>
                {gruposFiltrados.map((g) => (
                  <option key={g.id} value={g.nome}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Ano de Aquisição</Label>
              <Input
                type="number"
                min="1980"
                max="2100"
                value={form.year_acquired}
                onChange={(e) => setForm({ ...form, year_acquired: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Ano de Abate (se aplicável)</Label>
              <Input
                type="number"
                min="1980"
                max="2100"
                value={form.year_decommissioned}
                onChange={(e) => setForm({ ...form, year_decommissioned: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Activo</Label>
              <select
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={form.active ? "true" : "false"}
                onChange={(e) => setForm({ ...form, active: e.target.value === "true" })}
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={aGravar}>
              {aGravar && <Rodar />}
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
