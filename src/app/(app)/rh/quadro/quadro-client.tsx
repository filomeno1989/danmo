"use client";

/**
 * QuadroClient - O Quadro de Pessoal inteiro numa pagina.
 *
 * Melhorias sobre a lista nominal do hub:
 * - Painel do topo com as contagens das DUAS listas (Danmo Porto e
 *   Danmo/TCM) e dos estagiarios, cada cartao carregavel como filtro;
 * - Aviso proprio para estagios a acabar (30 dias ou ja passados) com
 *   as duas decisoes a um clique: Promover a efetivo ou Nao permanece;
 * - Vista de cartoes com iniciais + vista de tabela, pesquisa sem
 *   acentos e filtros (empresa, estado, tipo, vinculo);
 * - Ficha completa com os tempos do transferido por parcela;
 * - Exportacao Excel da lista filtrada.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  CircleSlash,
  Eye,
  LayoutGrid,
  List,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
  UserRoundPlus,
  X
} from "lucide-react";
import { Cabeca, Etiqueta, pedir, enviar } from "@/components/oficina/ui-bits";
import { FichaDetalhe } from "./ficha-detalhe";
import { FichaForm } from "./ficha-form";
import { exportarQuadroExcel } from "./exportar";
import {
  EMPRESA_LABEL,
  empresaRotulo,
  estagioATerminar,
  estadoEstagio,
  filtrarQuadro,
  formatoData,
  iniciais,
  inicioServico,
  resumoQuadro,
  tempoDeCasa,
  temposTransferido,
  type Colaborador,
  type Filtros
} from "@/lib/rh";

type Props = {
  podeMexer: boolean;
  podeApagar: boolean;
};

const COR_EMPRESA: Record<string, string> = {
  porto: "bg-emerald-600/12 text-emerald-700 dark:text-emerald-300",
  danmo: "bg-sky-600/12 text-sky-700 dark:text-sky-300"
};

const CORES_AVATAR = [
  "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
  "bg-amber-500/20 text-amber-800 dark:text-amber-200",
  "bg-sky-600/15 text-sky-800 dark:text-sky-200",
  "bg-red-600/12 text-red-800 dark:text-red-200",
  "bg-neutral-900/10 text-neutral-800 dark:bg-white/10 dark:text-neutral-100"
];

function corAvatar(nome: string | null | undefined): string {
  let h = 0;
  for (const letra of nome || "x") h = (h * 31 + letra.charCodeAt(0)) % 997;
  return CORES_AVATAR[h % CORES_AVATAR.length];
}

function Kpi({
  rotulo,
  valor,
  cor,
  aoClicar,
  activo
}: {
  rotulo: string;
  valor: number;
  cor?: string;
  aoClicar?: () => void;
  activo?: boolean;
}) {
  const classes =
    "card-sombra p-4 text-left" +
    (aoClicar ? " cursor-pointer transition-colors hover:bg-accent/50" : "") +
    (activo ? " border border-primario/50" : "");
  const corpo = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      <div className={"mt-1 text-2xl font-bold tabular-nums " + (cor || "")}>{valor}</div>
    </>
  );
  return aoClicar ? (
    <button type="button" onClick={aoClicar} className={classes}>
      {corpo}
    </button>
  ) : (
    <div className={classes}>{corpo}</div>
  );
}

export function QuadroClient({ podeMexer, podeApagar }: Props) {
  const [lista, setLista] = useState<Colaborador[] | null>(null);
  const [falha, setFalha] = useState("");
  const [aCarregar, setACarregar] = useState(false);

  const [filtros, setFiltros] = useState<Filtros>({
    texto: "",
    empresa: "",
    estado: "",
    tipo: "",
    vinculo: ""
  });
  const [vista, setVista] = useState<"cartoes" | "tabela">("cartoes");

  const [detalheId, setDetalheId] = useState<number | null>(null);
  const [form, setForm] = useState<{ modo: "novo" | "editar"; ficha: Colaborador | null } | null>(null);
  const [aDecidir, setADecidir] = useState<number | null>(null);

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    pedir<{ ok: boolean; colaboradores: Colaborador[] }>("/api/rh/quadro")
      .then((d) => setLista(d.colaboradores || []))
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    let vivo = true;
    pedir<{ ok: boolean; colaboradores: Colaborador[] }>("/api/rh/quadro")
      .then((d) => {
        if (vivo) setLista(d.colaboradores || []);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // Foto da ficha aberta carrega dentro da FichaDetalhe (tabela a parte)

  const resumo = useMemo(() => resumoQuadro(lista || []), [lista]);

  const filtrada = useMemo(
    () =>
      [...filtrarQuadro(lista || [], filtros)].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "pt")
      ),
    [lista, filtros]
  );

  const estagiosCriticos = useMemo(
    () =>
      (lista || [])
        .filter((c) => estagioATerminar(c))
        .sort((a, b) => (a.estagio_data_fim || "").localeCompare(b.estagio_data_fim || "")),
    [lista]
  );

  const codigos = useMemo(() => (lista || []).map((c) => c.code || ""), [lista]);
  const fichaAberta = useMemo(
    () => (lista || []).find((c) => c.id === detalheId) || null,
    [lista, detalheId]
  );

  function mudarFiltro(campo: keyof Filtros, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }));
  }

  function limparFiltros() {
    setFiltros({ texto: "", empresa: "", estado: "", tipo: "", vinculo: "" });
  }

  async function decidirEstagio(id: number, decisao: "promover" | "nao_permaneceu") {
    const ficha = (lista || []).find((c) => c.id === id);
    if (!ficha) return;
    if (
      decisao === "nao_permaneceu" &&
      !window.confirm(`Confirmar que "${ficha.name}" termina o estágio e NÃO fica na empresa?`)
    ) {
      return;
    }
    setADecidir(id);
    try {
      const d = await enviar<{ ok: boolean; colaborador: Colaborador }>(
        `/api/rh/quadro/${id}`,
        { accao: decisao },
        decisao === "promover" ? "Promovido a efetivo." : "Estágio terminado: não permaneceu.",
        "PATCH"
      );
      setLista((atual) =>
        (atual || []).map((c) => (c.id === id ? d.colaborador : c))
      );
    } catch {
      /* o toast do enviar ja mostra a causa */
    } finally {
      setADecidir(null);
    }
  }

  function fichaGuardada(c: Colaborador) {
    setLista((atual) => {
      const base = atual || [];
      const outras = base.filter((x) => x.id !== c.id);
      return [...outras, c].sort((a, b) =>
        (a.name || "").localeCompare(b.name || "", "pt")
      );
    });
  }

  function fichaApagada(id: number) {
    setLista((atual) => (atual || []).filter((c) => c.id !== id));
    setDetalheId(null);
  }

  const filtrosActivos =
    filtros.texto || filtros.empresa || filtros.estado || filtros.tipo || filtros.vinculo;

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Quadro de Pessoal"
        subtitulo={
          lista
            ? `${resumo.activos} activos · ${resumo.inactivos} inactivos · ${resumo.estagiarios} estagiários · ${resumo.total} no total`
            : "A carregar..."
        }
      >
        <button
          onClick={carregar}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
        >
          {aCarregar ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Actualizar
        </button>
        {lista && lista.length > 0 && (
          <button
            onClick={() => exportarQuadroExcel(filtrada, resumo, filtros)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
          >
            <ArrowDownUp className="size-4" />
            Exportar Excel
          </button>
        )}
        {podeMexer && (
          <button
            onClick={() => setForm({ modo: "novo", ficha: null })}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte"
          >
            <UserRoundPlus className="size-4" />
            Novo Colaborador
          </button>
        )}
      </Cabeca>

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}

      {!lista && !falha && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" /> A carregar o quadro...
        </div>
      )}

      {lista && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi rotulo="Total activos" valor={resumo.activos} />
            <Kpi
              rotulo="Danmo Porto"
              valor={resumo.porto}
              cor="text-sucesso"
              aoClicar={() => mudarFiltro("empresa", filtros.empresa === "porto" ? "" : "porto")}
              activo={filtros.empresa === "porto"}
            />
            <Kpi
              rotulo="Danmo (TCM)"
              valor={resumo.danmo}
              aoClicar={() => mudarFiltro("empresa", filtros.empresa === "danmo" ? "" : "danmo")}
              activo={filtros.empresa === "danmo"}
            />
            <Kpi
              rotulo="Sem classificar"
              valor={resumo.semClassificar}
              cor={resumo.semClassificar ? "text-ambar-texto" : ""}
              aoClicar={() => mudarFiltro("empresa", filtros.empresa === "sem" ? "" : "sem")}
              activo={filtros.empresa === "sem"}
            />
            <Kpi
              rotulo="Estagiários"
              valor={resumo.estagiarios}
              aoClicar={() => mudarFiltro("tipo", filtros.tipo === "estagiario" ? "" : "estagiario")}
              activo={filtros.tipo === "estagiario"}
            />
            <Kpi
              rotulo="A terminar (30d)"
              valor={resumo.estagiosATerminar}
              cor={resumo.estagiosATerminar ? "text-erro" : ""}
            />
          </div>

          {estagiosCriticos.length > 0 && (
            <div className="card-sombra border border-ambar/40 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <CircleSlash className="size-4 text-ambar-texto" aria-hidden />
                Estágios a decidir ({estagiosCriticos.length})
              </div>
              <div className="divide-y">
                {estagiosCriticos.map((c) => {
                  const s = estadoEstagio(c);
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        Fim previsto: {formatoData(c.estagio_data_fim) || "-"}
                      </span>
                      {s?.situacao === "a_decorrer" && Number.isFinite(s.dias) && (
                        <Etiqueta cor="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          {s.dias === 0 ? "Termina hoje" : s.dias === 1 ? "Falta 1 dia" : `Faltam ${s.dias} dias`}
                        </Etiqueta>
                      )}
                      {s?.situacao === "terminado" && (
                        <Etiqueta cor="bg-red-600/12 text-red-700 dark:text-red-300">
                          Passou {s.diasAtraso} {s.diasAtraso === 1 ? "dia" : "dias"}
                        </Etiqueta>
                      )}
                      {podeMexer && (
                        <span className="ml-auto flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => decidirEstagio(c.id, "promover")}
                            disabled={aDecidir === c.id}
                            className="inline-flex h-8 items-center rounded-md bg-primario px-2.5 text-xs font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
                          >
                            Promover a efetivo
                          </button>
                          <button
                            type="button"
                            onClick={() => decidirEstagio(c.id, "nao_permaneceu")}
                            disabled={aDecidir === c.id}
                            className="inline-flex h-8 items-center rounded-md border border-erro/40 px-2.5 text-xs font-semibold text-erro hover:bg-erro-bg disabled:opacity-60"
                          >
                            Não permanece
                          </button>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card-sombra space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-56 flex-1">
                <Search
                  className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  value={filtros.texto}
                  onChange={(e) => mudarFiltro("texto", e.target.value)}
                  placeholder="Pesquisar por nome, código ou função..."
                  className="border-input bg-transparent dark:bg-input/30 flex h-9 w-full rounded-md border pr-3 pl-8 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />
              </div>
              <select
                value={filtros.empresa}
                onChange={(e) => mudarFiltro("empresa", e.target.value)}
                aria-label="Filtrar por empresa"
                className="border-input bg-background h-9 rounded-md border px-2.5 text-sm"
              >
                <option value="">Todas as empresas</option>
                <option value="porto">Danmo Porto</option>
                <option value="danmo">Danmo (TCM)</option>
                <option value="sem">Sem classificar</option>
              </select>
              <select
                value={filtros.estado}
                onChange={(e) => mudarFiltro("estado", e.target.value)}
                aria-label="Filtrar por estado"
                className="border-input bg-background h-9 rounded-md border px-2.5 text-sm"
              >
                <option value="">Activos e inactivos</option>
                <option value="activos">Só activos</option>
                <option value="inactivos">Só inactivos</option>
              </select>
              <select
                value={filtros.tipo}
                onChange={(e) => mudarFiltro("tipo", e.target.value)}
                aria-label="Filtrar por tipo"
                className="border-input bg-background h-9 rounded-md border px-2.5 text-sm"
              >
                <option value="">Efetivos e estagiários</option>
                <option value="efetivo">Só efetivos</option>
                <option value="estagiario">Só estagiários</option>
              </select>
              <select
                value={filtros.vinculo}
                onChange={(e) => mudarFiltro("vinculo", e.target.value)}
                aria-label="Filtrar por vínculo"
                className="border-input bg-background h-9 rounded-md border px-2.5 text-sm"
              >
                <option value="">Todos os vínculos</option>
                <option value="contratado">Contratados</option>
                <option value="transferido">Transferidos</option>
              </select>
              {filtrosActivos && (
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="inline-flex h-9 items-center gap-1 rounded-md border border-input px-2.5 text-xs font-semibold text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3.5" aria-hidden />
                  Limpar
                </button>
              )}
              <div className="ml-auto flex overflow-hidden rounded-md border border-input">
                <button
                  type="button"
                  onClick={() => setVista("cartoes")}
                  aria-pressed={vista === "cartoes"}
                  className={
                    "inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium " +
                    (vista === "cartoes" ? "bg-primario text-white" : "bg-background hover:bg-muted")
                  }
                >
                  <LayoutGrid className="size-4" aria-hidden />
                  Cartões
                </button>
                <button
                  type="button"
                  onClick={() => setVista("tabela")}
                  aria-pressed={vista === "tabela"}
                  className={
                    "inline-flex h-9 items-center gap-1.5 px-3 text-sm font-medium " +
                    (vista === "tabela" ? "bg-primario text-white" : "bg-background hover:bg-muted")
                  }
                >
                  <List className="size-4" aria-hidden />
                  Tabela
                </button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {filtrada.length} de {lista.length} fichas
            </p>

            {filtrada.length === 0 ? (
              <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum colaborador encontrado com estes filtros.
              </div>
            ) : vista === "cartoes" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtrada.map((c) => {
                  const s = estadoEstagio(c);
                  const parcelas = temposTransferido(c);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setDetalheId(c.id)}
                      className="rounded-xl border p-3.5 text-left transition-colors hover:border-primario/50 hover:bg-accent/40"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={
                            "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold " +
                            corAvatar(c.name)
                          }
                        >
                          {iniciais(c.name)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold leading-tight">{c.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {c.code} · {c.categoria || "-"}
                          </p>
                        </div>
                        {c.active === false && (
                          <Etiqueta cor="bg-muted text-muted-foreground">Inactivo</Etiqueta>
                        )}
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        <Etiqueta cor={COR_EMPRESA[c.empresa || ""] || "bg-muted text-muted-foreground"}>
                          {empresaRotulo(c)}
                        </Etiqueta>
                        {(c.tipo_colaborador || "") === "estagiario" ? (
                          <Etiqueta cor="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            {s?.situacao === "promovido"
                              ? "Promovido"
                              : s?.situacao === "nao_permaneceu"
                                ? "Não permaneceu"
                                : "Estagiário"}
                          </Etiqueta>
                        ) : (
                          (c.tipo_vinculo || "contratado") === "transferido" && (
                            <Etiqueta cor="bg-orange-600/10 text-orange-700 dark:text-orange-300">
                              Transferido
                            </Etiqueta>
                          )
                        )}
                      </div>
                      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          {formatoData(inicioServico(c)) || "Sem início"} · {tempoDeCasa(c)}
                        </span>
                        {s?.situacao === "a_decorrer" && Number.isFinite(s.dias) && (
                          <span className="font-semibold text-ambar-texto">
                            {s.dias <= 0 ? "Termina hoje" : `${s.dias}d`}
                          </span>
                        )}
                        {parcelas && (
                          <span className="font-semibold text-primario" title="Tempo total no grupo">
                            {parcelas.total.split(",").slice(0, 2).join(",")} no grupo
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-2 pr-3 font-semibold">Código</th>
                      <th className="py-2 pr-3 font-semibold">Nome</th>
                      <th className="py-2 pr-3 font-semibold">Função</th>
                      <th className="py-2 pr-3 font-semibold">Empresa</th>
                      <th className="py-2 pr-3 font-semibold">Tipo</th>
                      <th className="py-2 pr-3 font-semibold">Início</th>
                      <th className="py-2 pr-3 font-semibold">Tempo de casa</th>
                      <th className="py-2 pr-3 font-semibold">Estado</th>
                      <th className="py-2 font-semibold">Acções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrada.map((c) => {
                      const parcelas = temposTransferido(c);
                      return (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs font-semibold">{c.code}</td>
                          <td className="py-2 pr-3 font-semibold">{c.name}</td>
                          <td className="py-2 pr-3">{c.categoria || "-"}</td>
                          <td className="py-2 pr-3">
                            <Etiqueta cor={COR_EMPRESA[c.empresa || ""] || "bg-muted text-muted-foreground"}>
                              {empresaRotulo(c)}
                            </Etiqueta>
                          </td>
                          <td className="py-2 pr-3">
                            {(c.tipo_colaborador || "") === "estagiario" ? (
                              <Etiqueta cor="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                Estagiário
                              </Etiqueta>
                            ) : (
                              <span>Efetivo</span>
                            )}
                            {parcelas && (
                              <span className="block text-[0.68rem] text-primario">
                                + tempo no grupo
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap">{formatoData(inicioServico(c)) || "-"}</td>
                          <td className="py-2 pr-3 whitespace-nowrap">{tempoDeCasa(c)}</td>
                          <td className="py-2 pr-3">
                            {c.active !== false ? (
                              <Etiqueta cor="bg-emerald-600/12 text-emerald-700 dark:text-emerald-300">
                                Activo
                              </Etiqueta>
                            ) : (
                              <Etiqueta cor="bg-muted text-muted-foreground">Inactivo</Etiqueta>
                            )}
                          </td>
                          <td className="py-2">
                            <span className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => setDetalheId(c.id)}
                                aria-label={`Ver ficha de ${c.name}`}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <Eye className="size-4" aria-hidden />
                              </button>
                              {podeMexer && (
                                <button
                                  type="button"
                                  onClick={() => setForm({ modo: "editar", ficha: c })}
                                  aria-label={`Editar ficha de ${c.name}`}
                                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                  <Pencil className="size-4" aria-hidden />
                                </button>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {detalheId !== null && fichaAberta && (
        <FichaDetalhe
          ficha={fichaAberta}
          podeMexer={podeMexer}
          onEditar={() => {
            setDetalheId(null);
            setForm({ modo: "editar", ficha: fichaAberta });
          }}
          onFechar={() => setDetalheId(null)}
        />
      )}

      {form && (
        <FichaForm
          key={form.modo === "editar" ? `edit-${form.ficha?.id}` : "novo"}
          modo={form.modo}
          inicial={form.ficha}
          codigos={codigos}
          podeApagar={podeApagar}
          onGuardada={fichaGuardada}
          onApagada={() => fichaApagada(form.ficha?.id || 0)}
          onFechar={() => setForm(null)}
        />
      )}
    </div>
  );
}
