"use client";

/**
 * PainelOficina - Visão Geral da Oficina (client).
 *
 * Mesma lógica do dashboard.html do hub: KPIs clicáveis (abrem listas),
 * Rastreio CdM, checklists pendentes, disponibilidade por frota com
 * percentagens, resumos de estados e obras sem número. Filtros de
 * período, categoria, grupo e sector.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  BarraPct,
  Cabeca,
  Etiqueta,
  EtiquetaEstado,
  EtiquetaFisico,
  Rodar
} from "@/components/oficina/ui-bits";
import {
  ESTADOS_FISICO,
  estadoDoEquip,
  eObraNaOficina,
  formatarData,
  diasDesde,
  truncar,
  type CategoriaEquip,
  type Equipamento,
  type GrupoEquip,
  type OrdemServico
} from "@/lib/oficina";

/** Cor do ponto de cada estado físico (igual ao dashboard do hub:
 * verde, vermelho, laranja, azul, âmbar, roxo, cinza, ciano). */
const COR_ESTADO: Record<string, string> = {
  "Avariada": "bg-red-500",
  "Acidentada": "bg-orange-500",
  "Pneumático": "bg-blue-500",
  "Revisão/Manutenção": "bg-amber-500",
  "Inspeção": "bg-purple-500",
  "Aguarda Acessório": "bg-slate-500",
  "Concluído": "bg-cyan-400"
};

type DadosPainel = {
  ok: boolean;
  categorias: CategoriaEquip[];
  grupos: GrupoEquip[];
  equipamentos: Equipamento[];
  ordens: OrdemServico[];
  logCdm: { os_id: number; data_mudanca: string }[];
  checklistsRevisao: {
    os_id: number;
    checklistId: number | null;
    nome: string;
    feitos: number;
    total: number;
  }[];
  colaboradores: { id: number; name: string; code?: string | null; setor?: string | null }[];
};

type ListaModal =
  | { tipo: "ordens"; titulo: string; ordens: OrdemServico[] }
  | { tipo: "equip"; titulo: string; equips: Equipamento[] }
  | null;

export function PainelOficina({
  nivel,
  podeCriar,
  podeApagar
}: {
  nivel: string;
  podeCriar: boolean;
  podeApagar: boolean;
}) {
  void nivel;
  void podeCriar;
  void podeApagar;
  const [dados, setDados] = useState<DadosPainel | null>(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(true);

  // filtros
  const [fDataIni, setFDataIni] = useState("");
  const [fDataFim, setFDataFim] = useState("");
  const [fCat, setFCat] = useState("");
  const [fGrupo, setFGrupo] = useState("");
  const [fSector, setFSector] = useState("");

  const [modal, setModal] = useState<ListaModal>(null);
  const [cartaoCdmAberto, setCartaoCdmAberto] = useState(true);
  const [cartaoCkAberto, setCartaoCkAberto] = useState(true);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro("");
    try {
      const r = await fetch("/api/oficina/painel", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || d?.ok === false) throw new Error(d?.erro || "Falha ao carregar");
      setDados(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setACarregar(false);
    }
  }, []);

  // Carga inicial em cadeia de promessas: nada de estados sincronos
  // dentro do efeito (regra do compilador React).
  useEffect(() => {
    let vivo = true;
    fetch("/api/oficina/painel", { cache: "no-store" })
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

  /* ============ Cálculos (iguais ao hub) ============ */

  const calc = useMemo(() => {
    if (!dados) return null;
    const { ordens, equipamentos, categorias, grupos, logCdm, checklistsRevisao } = dados;

    // Filtros
    const ordensFiltradas = ordens.filter((o) => {
      if (fDataIni && (o.data_abertura || "") < fDataIni) return false;
      if (fDataFim && (o.data_abertura || "") > fDataFim) return false;
      if (fSector && o.sector !== fSector) return false;
      return true;
    });
    const catNome = categorias.find((c) => String(c.id) === fCat)?.nome;
    const grupoNome = grupos.find((g) => String(g.id) === fGrupo)?.nome;
    const equipsFiltrados = equipamentos.filter((e) => {
      if (catNome && e.fleet_type !== catNome) return false;
      if (grupoNome && e.group_name !== grupoNome) return false;
      return true;
    });

    const naOficina = ordensFiltradas.filter(eObraNaOficina);
    const emCdm = ordensFiltradas.filter((o) => o.status_atual === "CdM");
    const fechadas = ordensFiltradas.filter((o) => o.status_atual === "Fechada");
    const semNr = naOficina.filter((o) => !o.numero_obra);

    const equipComOS = new Set(naOficina.map((o) => o.equipment_id));
    const disponiveis = equipsFiltrados.filter((e) => !equipComOS.has(e.id)).length;

    // Última entrada em CdM por obra
    const mapaCdm = new Map<number, string>();
    logCdm.forEach((l) => {
      const anterior = mapaCdm.get(l.os_id);
      if (!anterior || l.data_mudanca > anterior) mapaCdm.set(l.os_id, l.data_mudanca);
    });

    const totalEquip = equipsFiltrados.length;
    const contagemEstados: Record<string, number> = { Disponível: 0 };
    ESTADOS_FISICO.forEach((s) => (contagemEstados[s] = 0));
    equipsFiltrados.forEach((e) => {
      const est = estadoDoEquip(e.id, naOficina);
      contagemEstados[est] = (contagemEstados[est] || 0) + 1;
    });

    return {
      equipsFiltrados,
      naOficina,
      emCdm,
      fechadas,
      semNr,
      equipComOS,
      disponiveis,
      totalEquip,
      contagemEstados,
      mapaCdm,
      checklistsRevisao,
      categorias,
      grupos,
      ordens
    };
  }, [dados, fDataIni, fDataFim, fCat, fGrupo, fSector]);

  function abrirModalOrdens(titulo: string, lista: OrdemServico[]) {
    setModal({ tipo: "ordens", titulo, ordens: lista });
  }
  function abrirModalEquip(titulo: string, lista: Equipamento[]) {
    setModal({ tipo: "equip", titulo, equips: lista });
  }

  const mapaEquip = useMemo(
    () => new Map((dados?.equipamentos || []).map((e) => [e.id, e])),
    [dados]
  );

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Dashboard da Oficina"
        subtitulo="Disponibilidade da frota e estado das ordens de serviço. Clica nos indicadores para ver os detalhes."
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
            <Button variant="outline" size="sm" onClick={carregar} className="ml-auto">
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card className="card-sombra">
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1.5">
            <Label htmlFor="f-data-ini">Data início</Label>
            <Input id="f-data-ini" type="date" value={fDataIni} onChange={(e) => setFDataIni(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-data-fim">Data fim</Label>
            <Input id="f-data-fim" type="date" value={fDataFim} onChange={(e) => setFDataFim(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-cat">Categoria</Label>
            <select
              id="f-cat"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fCat}
              onChange={(e) => {
                setFCat(e.target.value);
                setFGrupo("");
              }}
            >
              <option value="">Todas</option>
              {(dados?.categorias || []).map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-grupo">Grupo</Label>
            <select
              id="f-grupo"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fGrupo}
              onChange={(e) => setFGrupo(e.target.value)}
            >
              <option value="">Todos</option>
              {(dados?.grupos || [])
                .filter((g) => !fCat || String(g.categoria_id) === fCat)
                .map((g) => (
                  <option key={g.id} value={String(g.id)}>
                    {g.nome}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="f-sector">Sector</Label>
            <select
              id="f-sector"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fSector}
              onChange={(e) => setFSector(e.target.value)}
            >
              <option value="">Todos</option>
              {["Elétrica", "Mecânica", "Serralharia", "Pneumática", "Lubrificação", "Piquete"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="flex-1"
              onClick={() => {
                setFDataIni("");
                setFDataFim("");
                setFCat("");
                setFGrupo("");
                setFSector("");
              }}
            >
              Limpar
            </Button>
          </div>
        </CardContent>
      </Card>

      {aCarregar || !calc ? (
        <Card className="card-sombra">
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Rodar /> A carregar dados da oficina...
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPIs topo */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <BotaoKpi rotulo="Obras em Andamento (Oficina)" valor={calc.naOficina.length} onClick={() => abrirModalOrdens("Obras em Andamento (Oficina)", calc.naOficina)} />
            <BotaoKpi rotulo="Ordens Sem Nº de Obra" valor={calc.semNr.length} destaque onClick={() => abrirModalOrdens("Obras sem Nº de Obra", calc.semNr)} />
            <BotaoKpi rotulo="Na CdM (Aguarda Devolução)" valor={calc.emCdm.length} onClick={() => abrirModalOrdens("Obras em CdM (Aguardam Devolução)", calc.emCdm)} />
            <BotaoKpi rotulo="Fechadas no Período" valor={calc.fechadas.length} onClick={() => abrirModalOrdens("Obras Fechadas no Período", calc.fechadas)} />
            <BotaoKpi
              rotulo="Checklists Pendentes"
              valor={calc.checklistsRevisao.filter((c) => c.feitos < c.total).length}
              onClick={() =>
                abrirModalOrdens(
                  "Obras com Checklist Pendente",
                  calc.naOficina.filter((o) => {
                    const c = calc.checklistsRevisao.find((x) => x.os_id === o.id);
                    return c && c.feitos < c.total;
                  })
                )
              }
            />
            <BotaoKpi rotulo="Total Equipamentos Activos" valor={calc.totalEquip} onClick={() => abrirModalEquip("Todos os Equipamentos Activos", calc.equipsFiltrados)} />
            <BotaoKpi rotulo="Disponíveis" valor={calc.disponiveis} onClick={() => abrirModalEquip("Equipamentos Disponíveis", calc.equipsFiltrados.filter((e) => !calc.equipComOS.has(e.id)))} />
            <BotaoKpi rotulo="Equipamentos na Oficina" valor={calc.totalEquip - calc.disponiveis} destaque onClick={() => abrirModalEquip("Equipamentos na Oficina", calc.equipsFiltrados.filter((e) => calc.equipComOS.has(e.id)))} />
          </div>

          {/* Rastreio CdM */}
          <Card className="card-sombra">
            <CardContent className="space-y-3">
              <button
                type="button"
                onClick={() => setCartaoCdmAberto((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <p className="font-semibold">Rastreio CdM - Envio, Devolução e Facturação</p>
                <span className="text-xs text-muted-foreground">{cartaoCdmAberto ? "recolher" : "expandir"}</span>
              </button>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <MiniKpi rotulo="Total Enviadas à CdM" valor={calc.mapaCdm.size} />
                <MiniKpi rotulo="Ainda na CdM" valor={calc.emCdm.length} />
                <MiniKpi rotulo="Retornaram e Fecharam ou em curso" valor={Math.max(0, calc.mapaCdm.size - calc.emCdm.length)} />
              </div>
              {cartaoCdmAberto && (
                <div className="overflow-x-auto">
                  <TabelaBase
                    colunas={["Nº Obra", "Equipamento", "Sector", "Enviada à CdM em", "Dias na CdM"]}
                    vazia="Nenhuma obra pendente na CdM."
                    linhas={calc.emCdm
                      .map((o) => ({ o, dataCdm: calc.mapaCdm.get(o.id) || o.atualizado_em || o.data_abertura }))
                      .sort((a, b) => (a.dataCdm || "").localeCompare(b.dataCdm || ""))
                      .map(({ o, dataCdm }) => {
                        const dias = diasDesde(dataCdm);
                        return (
                          <tr key={o.id} className="border-b last:border-0">
                            <Td>
                              <LinkObra id={o.id}>{o.numero_obra || "S/Nº"}</LinkObra>
                            </Td>
                            <Td>{mapaEquip.get(o.equipment_id)?.code || "-"}</Td>
                            <Td>{o.sector || "-"}</Td>
                            <Td>{formatarData(dataCdm)}</Td>
                            <Td>
                              <span className={dias > 30 ? "font-bold text-erro" : dias > 14 ? "font-bold text-ambar-texto dark:text-ambar" : ""}>
                                {dias} {dias === 1 ? "dia" : "dias"}
                              </span>
                            </Td>
                          </tr>
                        );
                      })}
                  />
                </div>
              )}
              <p className="text-xs leading-relaxed text-muted-foreground">
                &quot;Ainda na CdM&quot; são obras cujo estado actual continua &quot;CdM&quot;: a máquina já saiu da
                oficina mas ainda não foi facturada nem devolvida. Se este número não bater com o que a CdM
                reporta, há obras &quot;perdidas&quot; do lado deles.
              </p>
            </CardContent>
          </Card>

          {/* Checklists pendentes */}
          <Card className="card-sombra">
            <CardContent className="space-y-3">
              <button
                type="button"
                onClick={() => setCartaoCkAberto((v) => !v)}
                className="flex w-full items-center justify-between gap-2 text-left"
              >
                <p className="font-semibold">Checklists de Manutenção Pendentes</p>
                <span className="text-xs text-muted-foreground">{cartaoCkAberto ? "recolher" : "expandir"}</span>
              </button>
              {cartaoCkAberto && (
                <div className="overflow-x-auto">
                  <TabelaBase
                    colunas={["Nº Obra", "Equipamento", "Checklist", "Situação", "Progresso"]}
                    vazia="Todos os checklists em dia."
                    linhas={calc.checklistsRevisao
                      .filter((c) => c.feitos < c.total)
                      .map((c) => {
                        const o = calc.ordens.find((x) => x.id === c.os_id);
                        const urgente = !c.checklistId;
                        return (
                          <tr key={c.os_id} className="border-b last:border-0">
                            <Td>
                              <LinkObra id={c.os_id}>{o?.numero_obra || "S/Nº"}</LinkObra>
                            </Td>
                            <Td>{mapaEquip.get(o?.equipment_id || 0)?.code || "-"}</Td>
                            <Td>{c.nome}</Td>
                            <Td>
                              <Etiqueta cor={urgente ? "bg-erro-bg text-erro" : "bg-ambar-claro text-ambar-texto"}>
                                {urgente ? "Não iniciado" : "Incompleto"}
                              </Etiqueta>
                            </Td>
                            <Td>
                              {c.feitos}/{c.total}
                            </Td>
                          </tr>
                        );
                      })}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Legenda de estados físicos (clicável) - SEMPRE visível com
              os 8 estados, como no dashboard do hub: um estado sem
              máquinas mostra (0%) em vez de desaparecer. */}
          <div className="flex flex-wrap gap-2">
            <button
              key="disp"
              type="button"
              onClick={() =>
                abrirModalEquip(
                  "Equipamentos - Disponível",
                  calc.equipsFiltrados.filter((e) => estadoDoEquip(e.id, calc.naOficina) === "Disponível")
                )
              }
              className="flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent"
            >
              <span className="size-2.5 rounded-full bg-sucesso" />
              Disponível
              <span className="font-bold tabular-nums">({Math.round((calc.contagemEstados["Disponível"] || 0) / (calc.totalEquip || 1) * 100)}%)</span>
            </button>
            {ESTADOS_FISICO.map((est) => {
              const qtd = calc.contagemEstados[est] || 0;
              return (
                <button
                  key={est}
                  type="button"
                  onClick={() =>
                    abrirModalEquip(
                      `Equipamentos - ${est}`,
                      calc.equipsFiltrados.filter((e) => estadoDoEquip(e.id, calc.naOficina) === est)
                    )
                  }
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent ${qtd ? "" : "opacity-60"}`}
                >
                  <span className={`size-2.5 rounded-full ${COR_ESTADO[est] || "bg-muted-foreground"}`} />
                  {est}
                  <span className="font-bold tabular-nums">({Math.round(qtd / (calc.totalEquip || 1) * 100)}%)</span>
                </button>
              );
            })}
          </div>

          {/* Disponibilidade por frota */}
          <Card className="card-sombra">
            <CardContent className="space-y-5">
              <p className="font-semibold">Disponibilidade por Frota</p>
              {!calc.categorias.length && (
                <p className="text-sm text-muted-foreground">
                  Sem categorias registadas. Cria-as em Configurações.
                </p>
              )}
              {calc.categorias.map((cat) => {
                const equipCat = calc.equipsFiltrados.filter((e) => e.fleet_type === cat.nome);
                const gruposDaCat = calc.grupos.filter((g) => g.categoria_id === cat.id);
                const gruposMostrar = fGrupo ? gruposDaCat.filter((g) => String(g.id) === fGrupo) : gruposDaCat;
                const dispCat = equipCat.filter((e) => estadoDoEquip(e.id, calc.naOficina) === "Disponível").length;
                const pctCat = equipCat.length ? Math.round((dispCat / equipCat.length) * 100) : 0;
                return (
                  <div key={cat.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-bold uppercase tracking-wide text-ambar-texto dark:text-ambar">{cat.nome}</p>
                      <span className="text-xs text-muted-foreground">
                        {equipCat.length} equipamentos | {dispCat} disponíveis ({pctCat}%)
                      </span>
                    </div>
                    {equipCat.length > 0 && <TabelaEstados lista={equipCat} abertas={calc.naOficina} />}
                    {gruposMostrar.map((grupo) => {
                      const equipGrupo = equipCat.filter((e) => e.group_name === grupo.nome);
                      const dispG = equipGrupo.filter((e) => estadoDoEquip(e.id, calc.naOficina) === "Disponível").length;
                      return (
                        <div key={grupo.id} className="space-y-2 border-t pt-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{grupo.nome}</p>
                            <span className="text-xs text-muted-foreground">
                              {equipGrupo.length} equip. | {dispG} disp. ({equipGrupo.length ? Math.round((dispG / equipGrupo.length) * 100) : 0}%)
                            </span>
                          </div>
                          {equipGrupo.length > 0 && (
                            <>
                              <TabelaEstados lista={equipGrupo} abertas={calc.naOficina} />
                              <DetalheMaquinas lista={equipGrupo} abertas={calc.naOficina} />
                            </>
                          )}
                        </div>
                      );
                    })}
                    {gruposMostrar.length === 0 && equipCat.length > 0 && (
                      <DetalheMaquinas lista={equipCat} abertas={calc.naOficina} />
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Resumos */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="card-sombra">
              <CardContent className="space-y-3">
                <p className="font-semibold">Obras por Estado da Obra</p>
                <ResumoEstados
                  valores={["Aberta (DTEC)", "Supervisão", "Chefe da Oficina", "Departamento Técnico", "CdM", "Fechada"]}
                  total={calc.naOficina.length + calc.emCdm.length + calc.fechadas.length || 1}
                  contagem={(est) =>
                    calc.naOficina.concat(calc.emCdm, calc.fechadas).filter((o) => o.status_atual === est).length
                  }
                  etiqueta={(v) => <EtiquetaEstado estado={v} />}
                />
              </CardContent>
            </Card>
            <Card className="card-sombra">
              <CardContent className="space-y-3">
                <p className="font-semibold">Obras por Estado Físico</p>
                <ResumoEstados
                  valores={ESTADOS_FISICO}
                  total={calc.naOficina.length || 1}
                  contagem={(est) => calc.naOficina.filter((o) => o.status_fisico === est).length}
                  etiqueta={(v) => <EtiquetaFisico estado={v} />}
                />
              </CardContent>
            </Card>
          </div>

          {/* Obras sem número */}
          <Card className="card-sombra">
            <CardContent className="space-y-3">
              <p className="font-semibold">Ordens sem Nº de Obra (aguardam CdM)</p>
              <div className="overflow-x-auto">
                <TabelaBase
                  colunas={["Equipamento", "Categoria", "Grupo", "Sector", "Abertura", "Dias à espera", "Avaria"]}
                  vazia="Nenhuma obra sem número."
                  linhas={[...calc.semNr]
                    .sort((a, b) => (a.data_abertura || "").localeCompare(b.data_abertura || ""))
                    .map((o) => {
                      const eq = mapaEquip.get(o.equipment_id);
                      const dias = diasDesde(o.data_abertura);
                      return (
                        <tr key={o.id} className="border-b last:border-0">
                          <Td>
                            <LinkObra id={o.id}>{eq?.code || "-"}</LinkObra>
                          </Td>
                          <Td>{eq?.fleet_type || "-"}</Td>
                          <Td>{eq?.group_name || "-"}</Td>
                          <Td>{o.sector || "-"}</Td>
                          <Td>{formatarData(o.data_abertura)}</Td>
                          <Td>
                            <span className={dias > 14 ? "font-bold text-erro" : dias > 7 ? "font-bold text-ambar-texto dark:text-ambar" : ""}>
                              {dias} {dias === 1 ? "dia" : "dias"}
                            </span>
                          </Td>
                          <Td title={o.descricao_avaria || ""}>{truncar(o.descricao_avaria)}</Td>
                        </tr>
                      );
                    })}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Modais genéricos */}
      {modal?.tipo === "ordens" && (
        <Modal aberto fechar={() => setModal(null)} titulo={`${modal.titulo} (${modal.ordens.length})`} largura="max-w-3xl">
          <div className="overflow-x-auto">
            <TabelaBase
              colunas={["Nº Obra", "Equipamento", "Sector", "Abertura", "Estado Físico", "Estado Obra"]}
              vazia="Nenhuma obra encontrada."
              linhas={modal.ordens.map((o) => (
                <tr key={o.id} className="border-b last:border-0">
                  <Td>
                    <LinkObra id={o.id}>{o.numero_obra || "s/nº"}</LinkObra>
                  </Td>
                  <Td>{mapaEquip.get(o.equipment_id)?.code || "-"}</Td>
                  <Td>{o.sector || "-"}</Td>
                  <Td>{formatarData(o.data_abertura)}</Td>
                  <Td>
                    <EtiquetaFisico estado={o.status_fisico} />
                  </Td>
                  <Td>
                    <EtiquetaEstado estado={o.status_atual} />
                  </Td>
                </tr>
              ))}
            />
          </div>
        </Modal>
      )}

      {modal?.tipo === "equip" && (
        <Modal aberto fechar={() => setModal(null)} titulo={`${modal.titulo} (${modal.equips.length})`} largura="max-w-2xl">
          <div className="overflow-x-auto">
            <TabelaBase
              colunas={["Código", "Categoria", "Grupo", "Estado Físico", "Obra(s) Abertas"]}
              vazia="Nenhum equipamento encontrado."
              linhas={modal.equips.map((e) => {
                const est = estadoDoEquip(e.id, calc?.naOficina || []);
                const obras = (calc?.naOficina || []).filter((o) => o.equipment_id === e.id);
                return (
                  <tr key={e.id} className="border-b last:border-0">
                    <Td>{e.code}</Td>
                    <Td>{e.fleet_type || "-"}</Td>
                    <Td>{e.group_name || "-"}</Td>
                    <Td>
                      <EtiquetaFisico estado={est} />
                    </Td>
                    <Td>
                      {obras.length ? (
                        <span className="flex flex-wrap gap-1">
                          {obras.map((o) => (
                            <LinkObra key={o.id} id={o.id}>
                              {o.numero_obra || "S/Nº"}
                            </LinkObra>
                          ))}
                        </span>
                      ) : (
                        "-"
                      )}
                    </Td>
                  </tr>
                );
              })}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============ Peças internas ============ */

function BotaoKpi({
  rotulo,
  valor,
  onClick,
  destaque
}: {
  rotulo: string;
  valor: number;
  onClick: () => void;
  destaque?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md " +
        (destaque ? "border-erro/50" : "border-border")
      }
    >
      <p className="text-[0.7rem] font-medium leading-tight text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
    </button>
  );
}

function MiniKpi({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-xl border bg-muted/40 p-3">
      <p className="text-[0.7rem] font-medium text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{valor}</p>
    </div>
  );
}

function TabelaBase({
  colunas,
  linhas,
  vazia
}: {
  colunas: string[];
  linhas: React.ReactNode[];
  vazia: string;
}) {
  return (
    <table className="w-full min-w-[560px] text-left text-sm">
      <thead>
        <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          {colunas.map((c) => (
            <th key={c} className="px-2 py-2 font-semibold">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.length === 0 ? (
          <tr>
            <td colSpan={colunas.length} className="px-2 py-6 text-center text-muted-foreground">
              {vazia}
            </td>
          </tr>
        ) : (
          linhas
        )}
      </tbody>
    </table>
  );
}

function Td({
  children,
  className,
  title
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <td title={title} className={"px-2 py-2 align-middle " + (className || "")}>
      {children}
    </td>
  );
}

function LinkObra({ id, children }: { id: number; children: React.ReactNode }) {
  return (
    <Link
      href={`/oficina/ordens/${id}`}
      className="font-semibold text-primario hover:underline dark:text-primario-forte"
    >
      {children}
    </Link>
  );
}

/** Tabela estado x quantidade com barras (frota ou grupo). */
function TabelaEstados({
  lista,
  abertas
}: {
  lista: Equipamento[];
  abertas: OrdemServico[];
}) {
  const contagem: Record<string, number> = { Disponível: 0 };
  ESTADOS_FISICO.forEach((s) => (contagem[s] = 0));
  lista.forEach((e) => {
    const est = estadoDoEquip(e.id, abertas);
    contagem[est] = (contagem[est] || 0) + 1;
  });
  const total = lista.length || 1;
  const linhas = ["Disponível", ...ESTADOS_FISICO].filter((est) => (contagem[est] || 0) > 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead>
          <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-1.5 font-semibold">Estado</th>
            <th className="px-2 py-1.5 font-semibold">Qtd</th>
            <th className="px-2 py-1.5 font-semibold">Distribuição</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((est) => {
            const qtd = contagem[est] || 0;
            const pct = Math.round((qtd / total) * 100);
            return (
              <tr key={est} className="border-b last:border-0">
                <Td>
                  <EtiquetaFisico estado={est} />
                </Td>
                <Td className="tabular-nums">{qtd}</Td>
                <Td className="w-48">
                  <BarraPct pct={pct} />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Lista expansível de máquinas com estado e obras abertas. */
function DetalheMaquinas({
  lista,
  abertas
}: {
  lista: Equipamento[];
  abertas: OrdemServico[];
}) {
  const [aberto, setAberto] = useState(false);
  const ordenada = [...lista].sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  return (
    <div>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {aberto ? "Esconder" : "Ver"} detalhe por máquina ({lista.length})
      </button>
      {aberto && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[460px] text-left text-sm">
            <thead>
              <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                <th className="px-2 py-1.5 font-semibold">Código</th>
                <th className="px-2 py-1.5 font-semibold">Grupo</th>
                <th className="px-2 py-1.5 font-semibold">Estado</th>
                <th className="px-2 py-1.5 font-semibold">Obra(s) abertas</th>
              </tr>
            </thead>
            <tbody>
              {ordenada.map((e) => {
                const est = estadoDoEquip(e.id, abertas);
                const obras = abertas.filter((o) => o.equipment_id === e.id);
                return (
                  <tr key={e.id} className="border-b last:border-0">
                    <Td>
                      <Link
                        href={`/oficina/maquina/${e.id}`}
                        className="font-semibold text-primario hover:underline dark:text-primario-forte"
                        title="Ver histórico completo desta máquina"
                      >
                        {e.code}
                      </Link>
                    </Td>
                    <Td>{e.group_name || "-"}</Td>
                    <Td>
                      <EtiquetaFisico estado={est} />
                    </Td>
                    <Td>
                      {obras.length ? (
                        <span className="flex flex-wrap gap-1">
                          {obras.map((o) => (
                            <LinkObra key={o.id} id={o.id}>
                              {o.numero_obra || "S/Nº"}
                            </LinkObra>
                          ))}
                        </span>
                      ) : (
                        "-"
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Resumo estado x qtd com barra. */
function ResumoEstados({
  valores,
  total,
  contagem,
  etiqueta
}: {
  valores: string[];
  total: number;
  contagem: (est: string) => number;
  etiqueta: (v: string) => React.ReactNode;
}) {
  const linhas = valores.map((v) => ({ v, qtd: contagem(v) })).filter((l) => l.qtd > 0);
  if (!linhas.length) {
    return <p className="py-2 text-sm text-muted-foreground">Sem dados para mostrar.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[320px] text-left text-sm">
        <tbody>
          {linhas.map(({ v, qtd }) => (
            <tr key={v} className="border-b last:border-0">
              <Td>{etiqueta(v)}</Td>
              <Td className="tabular-nums">{qtd}</Td>
              <Td className="w-40">
                <BarraPct pct={Math.round((qtd / total) * 100)} />
              </Td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
