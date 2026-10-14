"use client";

/**
 * ConfigClient - Categorias, Grupos e Tabela de Preços da Oficina (client).
 *
 * Categorias e grupos: mesma lógica do config.html do hub (duas colunas
 * com as listas e um modal para criar/editar cada uma).
 * Tabela de Preços: catálogo que a Faturação CdM usa no fecho das obras
 * (mão de obra por hora e materiais por unidade/kg/litro). Editar um
 * preço NÃO altera as obras já fechadas: cada fecho gravou os seus
 * valores no momento.
 */

import { useCallback, useEffect, useState } from "react";
import { Pencil, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import {
  MATERIAIS_FECHO,
  TIPOS_PRECO,
  UNIDADES_PRECO,
  type CategoriaEquip,
  type GrupoEquip,
  type PrecoCatalogo
} from "@/lib/oficina";

function fmtMt(n: number): string {
  return (
    new Intl.NumberFormat("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n || 0) + " MT"
  );
}

type Dados = {
  ok: boolean;
  categorias: CategoriaEquip[];
  grupos: GrupoEquip[];
};

export function ConfigClient({
  podeCriar,
  podeEditar,
  podeApagar
}: {
  podeCriar: boolean;
  podeEditar: boolean;
  podeApagar: boolean;
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

  /* ---- Tabela de Preços ---- */
  const [precos, setPrecos] = useState<PrecoCatalogo[]>([]);
  const [erroPrecos, setErroPrecos] = useState("");
  const [modalPreco, setModalPreco] = useState(false);
  const [precoId, setPrecoId] = useState<number | null>(null);
  const [precoTipo, setPrecoTipo] = useState("material");
  const [precoNome, setPrecoNome] = useState("");
  const [precoUnidade, setPrecoUnidade] = useState("un");
  const [precoValor, setPrecoValor] = useState("");
  const [aGravarPreco, setAGravarPreco] = useState(false);

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

  const carregarPrecos = useCallback(async () => {
    setErroPrecos("");
    try {
      const d = await pedir<{ ok: boolean; precos: PrecoCatalogo[] }>("/api/oficina/precos");
      setPrecos(d.precos || []);
    } catch (e) {
      setPrecos([]);
      setErroPrecos(e instanceof Error ? e.message : "Erro ao carregar a Tabela de Preços");
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
    // A Tabela de Preços carrega à parte (se ainda não existir na base,
    // o cartão mostra a mensagem e o resto da página continua normal)
    fetch("/api/oficina/precos", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (r.ok && d?.ok) {
          setPrecos(d.precos || []);
          setErroPrecos("");
        } else {
          setPrecos([]);
          setErroPrecos(d?.erro || "Erro ao carregar a Tabela de Preços");
        }
      })
      .catch(() => {
        if (vivo) setErroPrecos("Erro ao carregar a Tabela de Preços");
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

  /* ---- Tabela de Preços: gravar / apagar ---- */

  function abrirNovoPreco(tipo: "mao_obra" | "material") {
    setPrecoId(null);
    setPrecoTipo(tipo);
    setPrecoNome("");
    setPrecoUnidade(tipo === "mao_obra" ? "hora" : "kg");
    setPrecoValor("");
    setModalPreco(true);
  }

  function abrirEdicaoPreco(p: PrecoCatalogo) {
    setPrecoId(p.id);
    setPrecoTipo(p.tipo);
    setPrecoNome(p.nome);
    setPrecoUnidade(p.unidade);
    setPrecoValor(String(p.valor));
    setModalPreco(true);
  }

  async function gravarPreco(ev: React.FormEvent) {
    ev.preventDefault();
    if (aGravarPreco) return;
    const valor = Number(precoValor);
    if (!precoNome.trim()) {
      toast.error("Escreve o nome do item.");
      return;
    }
    if (precoValor === "" || !Number.isFinite(valor) || valor < 0) {
      toast.error("Escreve um valor válido (0 ou mais).");
      return;
    }
    setAGravarPreco(true);
    try {
      await enviar(
        "/api/oficina/precos",
        {
          action: precoId ? "editar-preco" : "criar-preco",
          id: precoId || undefined,
          tipo: precoTipo,
          nome: precoNome,
          unidade: precoUnidade,
          valor
        },
        precoId
          ? "Preço actualizado. As obras já fechadas mantêm os valores com que foram fechadas."
          : "Preço adicionado à Tabela de Preços."
      );
      setModalPreco(false);
      await carregarPrecos();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravarPreco(false);
    }
  }

  async function apagarPreco(p: PrecoCatalogo) {
    if (!podeApagar) return;
    const ok = window.confirm(
      `Apagar "${p.nome}" da Tabela de Preços? As obras já fechadas mantêm os valores com que foram fechadas.`
    );
    if (!ok) return;
    try {
      await enviar("/api/oficina/precos", { action: "apagar-preco", id: p.id }, "Preço removido.");
      await carregarPrecos();
    } catch {
      // aviso já mostrado
    }
  }

  const precosMaoObra = precos.filter((p) => p.tipo === "mao_obra");
  const precosMaterial = precos.filter((p) => p.tipo === "material");

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

      {/* Tabela de Preços (Faturação CdM) */}
      <Card className="card-sombra">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">Tabela de Preços (Faturação CdM)</p>
              <p className="text-muted-foreground text-xs">
                Valores unitários que o fecho da obra assume automaticamente. Se a CdM mudar um
                preço, edita aqui: as obras já fechadas mantêm os valores com que foram fechadas.
              </p>
            </div>
            {podeCriar && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => abrirNovoPreco("mao_obra")}>
                  <Plus aria-hidden /> Mão de obra
                </Button>
                <Button size="sm" onClick={() => abrirNovoPreco("material")}>
                  <Plus aria-hidden /> Material
                </Button>
              </div>
            )}
          </div>

          {erroPrecos && (
            <p className="flex items-center gap-2 text-sm text-erro">
              <TriangleAlert className="size-4 shrink-0" aria-hidden />
              {erroPrecos}
            </p>
          )}

          {!erroPrecos && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-semibold uppercase">
                  Mão de obra (valor por hora)
                </p>
                {precosMaoObra.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Nada registado. Ex: "Mão de Obra CdM" - 850 MT / hora.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {precosMaoObra.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="text-sm">
                          {p.nome}{" "}
                          <span className="text-muted-foreground">
                            ({UNIDADES_PRECO[p.unidade] || p.unidade})
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-sm font-semibold">{fmtMt(p.valor)}</span>
                          {podeEditar && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              aria-label={`Editar ${p.nome}`}
                              onClick={() => abrirEdicaoPreco(p)}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                          )}
                          {podeApagar && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-erro"
                              aria-label={`Apagar ${p.nome}`}
                              onClick={() => apagarPreco(p)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-muted-foreground text-xs font-semibold uppercase">
                  Materiais (valor por unidade / kg / litro)
                </p>
                {precosMaterial.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    Nada registado. Ex: "Oxigênio" - 120 MT / kg.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {precosMaterial.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="text-sm">
                          {p.nome}{" "}
                          <span className="text-muted-foreground">
                            ({UNIDADES_PRECO[p.unidade] || p.unidade})
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-sm font-semibold">{fmtMt(p.valor)}</span>
                          {podeEditar && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8"
                              aria-label={`Editar ${p.nome}`}
                              onClick={() => abrirEdicaoPreco(p)}
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                          )}
                          {podeApagar && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-8 text-erro"
                              aria-label={`Apagar ${p.nome}`}
                              onClick={() => apagarPreco(p)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

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

      {/* Modal preço (criar / editar) */}
      <Modal
        aberto={modalPreco}
        fechar={() => setModalPreco(false)}
        titulo={
          precoId
            ? "Editar Preço"
            : `Novo Preço - ${precoTipo === "mao_obra" ? "Mão de obra" : "Material"}`
        }
        subtitulo={
          precoId
            ? "As obras já fechadas mantêm os valores com que foram fechadas."
            : undefined
        }
      >
        <form onSubmit={gravarPreco} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>
                Tipo <span className="text-erro">*</span>
              </Label>
              <select
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={precoTipo}
                onChange={(e) => {
                  const t = e.target.value;
                  setPrecoTipo(t);
                  if (!precoId) setPrecoUnidade(t === "mao_obra" ? "hora" : "kg");
                }}
              >
                <option value="mao_obra">{TIPOS_PRECO.mao_obra}</option>
                <option value="material">{TIPOS_PRECO.material}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Nome <span className="text-erro">*</span>
              </Label>
              <Input
                required
                value={precoNome}
                onChange={(e) => setPrecoNome(e.target.value)}
                placeholder={precoTipo === "mao_obra" ? "Ex: Mão de Obra CdM" : "Ex: Oxigênio"}
                list={precoTipo === "material" ? "sugestoes-materiais-preco" : undefined}
              />
              {precoTipo === "material" && (
                <datalist id="sugestoes-materiais-preco">
                  {MATERIAIS_FECHO.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              )}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <select
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={precoUnidade}
                onChange={(e) => setPrecoUnidade(e.target.value)}
              >
                {precoTipo === "mao_obra" ? (
                  <option value="hora">hora</option>
                ) : (
                  <>
                    <option value="kg">kg</option>
                    <option value="lt">litro</option>
                    <option value="un">unidade</option>
                  </>
                )}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>
                Valor (MT) <span className="text-erro">*</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                required
                value={precoValor}
                onChange={(e) => setPrecoValor(e.target.value)}
                placeholder="Ex: 850"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModalPreco(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={aGravarPreco}>
              {aGravarPreco && <Rodar />}
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
