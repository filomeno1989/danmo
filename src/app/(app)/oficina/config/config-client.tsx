"use client";

/**
 * ConfigClient - Categorias e Grupos de equipamento (client).
 *
 * Mesma lógica do config.html do hub: duas colunas com as listas e um
 * modal para criar/editar cada uma. O grupo liga-se a uma categoria.
 */

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import type { CategoriaEquip, GrupoEquip } from "@/lib/oficina";

type Dados = {
  ok: boolean;
  categorias: CategoriaEquip[];
  grupos: GrupoEquip[];
};

export function ConfigClient({
  podeCriar,
  podeEditar
}: {
  podeCriar: boolean;
  podeEditar: boolean;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(true);

  const [modalCat, setModalCat] = useState(false);
  const [modalGrupo, setModalGrupo] = useState(false);
  const [aGravar, setAGravar] = useState(false);

  const [catId, setCatId] = useState<number | null>(null);
  const [catNome, setCatNome] = useState("");
  const [catAtiva, setCatAtiva] = useState(true);

  const [grpId, setGrpId] = useState<number | null>(null);
  const [grpNome, setGrpNome] = useState("");
  const [grpCategoria, setGrpCategoria] = useState("");
  const [grpAtiva, setGrpAtiva] = useState(true);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro("");
    try {
      const d = await pedir<Dados>("/api/oficina/config");
      setDados(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/oficina/config", { cache: "no-store" })
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

  async function gravarCategoria(ev: React.FormEvent) {
    ev.preventDefault();
    if (aGravar) return;
    setAGravar(true);
    try {
      await enviar(
        "/api/oficina/config",
        {
          action: catId ? "editar-categoria" : "criar-categoria",
          id: catId || undefined,
          nome: catNome,
          ativo: catAtiva
        },
        "Categoria guardada."
      );
      setModalCat(false);
      await carregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravar(false);
    }
  }

  async function gravarGrupo(ev: React.FormEvent) {
    ev.preventDefault();
    if (aGravar) return;
    setAGravar(true);
    try {
      await enviar(
        "/api/oficina/config",
        {
          action: grpId ? "editar-grupo" : "criar-grupo",
          id: grpId || undefined,
          nome: grpNome,
          categoria_id: Number(grpCategoria),
          ativo: grpAtiva
        },
        "Grupo guardado."
      );
      setModalGrupo(false);
      await carregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravar(false);
    }
  }

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Configurações da Oficina"
        subtitulo="Categorias e grupos de equipamento: a base dos filtros do dashboard e dos checklists."
      >
        <Button variant="outline" size="sm" onClick={carregar} disabled={aCarregar}>
          {aCarregar ? <Rodar /> : <RotateCcw aria-hidden />}
          Actualizar
        </Button>
      </Cabeca>

      {erro && (
        <Card className="border-erro/40">
          <CardContent className="flex items-center gap-2 text-sm text-erro">
            <TriangleAlert className="size-4" aria-hidden />
            {erro}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Categorias */}
        <Card className="card-sombra">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">Categorias de Equipamento</p>
              {podeCriar && (
                <Button
                  size="sm"
                  onClick={() => {
                    setCatId(null);
                    setCatNome("");
                    setCatAtiva(true);
                    setModalCat(true);
                  }}
                >
                  <Plus aria-hidden /> Nova
                </Button>
              )}
            </div>
            {aCarregar ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Rodar /> A carregar...
                </span>
              </div>
            ) : (dados?.categorias || []).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sem categorias registadas.</p>
            ) : (
              <ul className="divide-y">
                {(dados?.categorias || []).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="text-sm">
                      {c.nome}{" "}
                      {!c.ativo && (
                        <Etiqueta cor="bg-muted text-muted-foreground">inactiva</Etiqueta>
                      )}
                    </span>
                    {podeEditar && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCatId(c.id);
                          setCatNome(c.nome);
                          setCatAtiva(Boolean(c.ativo));
                          setModalCat(true);
                        }}
                      >
                        <Pencil aria-hidden /> Editar
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Grupos */}
        <Card className="card-sombra">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">Grupos de Equipamento</p>
              {podeCriar && (
                <Button
                  size="sm"
                  onClick={() => {
                    setGrpId(null);
                    setGrpNome("");
                    setGrpCategoria("");
                    setGrpAtiva(true);
                    setModalGrupo(true);
                  }}
                >
                  <Plus aria-hidden /> Novo
                </Button>
              )}
            </div>
            {aCarregar ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2">
                  <Rodar /> A carregar...
                </span>
              </div>
            ) : (dados?.grupos || []).length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Sem grupos registados.</p>
            ) : (
              <ul className="divide-y">
                {(dados?.grupos || []).map((g) => {
                  const cat = (dados?.categorias || []).find((c) => c.id === g.categoria_id);
                  return (
                    <li key={g.id} className="flex items-center justify-between gap-2 py-2">
                      <span className="text-sm">
                        {g.nome} <span className="text-muted-foreground">- {cat ? cat.nome : "-"}</span>{" "}
                        {!g.ativo && <Etiqueta cor="bg-muted text-muted-foreground">inactivo</Etiqueta>}
                      </span>
                      {podeEditar && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setGrpId(g.id);
                            setGrpNome(g.nome);
                            setGrpCategoria(String(g.categoria_id));
                            setGrpAtiva(Boolean(g.ativo));
                            setModalGrupo(true);
                          }}
                        >
                          <Pencil aria-hidden /> Editar
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal categoria */}
      <Modal
        aberto={modalCat}
        fechar={() => setModalCat(false)}
        titulo={catId ? "Editar Categoria" : "Nova Categoria"}
      >
        <form onSubmit={gravarCategoria} className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Nome <span className="text-erro">*</span>
            </Label>
            <Input required value={catNome} onChange={(e) => setCatNome(e.target.value)} placeholder="Ex: Reachstacker" />
          </div>
          <div className="space-y-1.5">
            <Label>Activa</Label>
            <select
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={catAtiva ? "true" : "false"}
              onChange={(e) => setCatAtiva(e.target.value === "true")}
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalCat(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={aGravar}>
              {aGravar && <Rodar />}
              Guardar
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal grupo */}
      <Modal aberto={modalGrupo} fechar={() => setModalGrupo(false)} titulo={grpId ? "Editar Grupo" : "Novo Grupo"}>
        <form onSubmit={gravarGrupo} className="space-y-4">
          <div className="space-y-1.5">
            <Label>
              Categoria <span className="text-erro">*</span>
            </Label>
            <select
              required
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={grpCategoria}
              onChange={(e) => setGrpCategoria(e.target.value)}
            >
              <option value="">- Selecionar -</option>
              {(dados?.categorias || [])
                .filter((c) => c.ativo)
                .map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.nome}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>
              Nome do Grupo <span className="text-erro">*</span>
            </Label>
            <Input required value={grpNome} onChange={(e) => setGrpNome(e.target.value)} placeholder="Ex: RST 45T" />
          </div>
          <div className="space-y-1.5">
            <Label>Activo</Label>
            <select
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={grpAtiva ? "true" : "false"}
              onChange={(e) => setGrpAtiva(e.target.value === "true")}
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalGrupo(false)}>
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
