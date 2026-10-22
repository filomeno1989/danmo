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
  CalendarClock,
  CircleSlash,
  Eye,
  LayoutGrid,
  List,
  LoaderCircle,
  Pencil,
  RefreshCw,
  Search,
  UserRound,
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
  alertasDocumentos,
  filtrarQuadro,
  formatoData,
  iniciais,
  inicioServico,
  resumoQuadro,
  tempoDeCasa,
  temposTransferido,
  textoAlertaDoc,
  type AlertaDoc,
  type Colaborador,
  type Filtros,
  type ValidadeDoc
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

const COR_SITUACAO_ALERTA: Record<AlertaDoc["situacao"], string> = {
  vencido: "bg-red-600/12 text-red-700 dark:text-red-300",
  urgente: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  proximo: "bg-amber-500/10 text-amber-700 dark:text-amber-200/90"
};

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

type ZoomFotoEstado = { id: number; nome: string; inicial: string } | null;

/**
 * Zoom da foto: abre logo com o que ja ha (a MINI da grelha, ou a foto
 * grande quando vem da ficha) e, quando so ha mini, busca a foto grande
 * por baixo para a trocar. Fecha com ESC (capture, para nao fechar a
 * ficha junto), clicando fora ou no X. Nao mexe no scroll do fundo:
 * quando abre sobre a ficha, quem trava o scroll e o Modal dela.
 */
function ZoomFoto({ zoom, onFechar }: { zoom: ZoomFotoEstado; onFechar: () => void }) {
  // O pai remonta este componente (key) a cada zoom novo: o estado nasce
  // do props e a busca da foto grande so mexe no estado dentro das
  // promises, nunca no corpo do efeito.
  const [grande, setGrande] = useState(zoom?.inicial || "");
  const [aBusca, setABusca] = useState(Boolean(zoom && !zoom.inicial));

  useEffect(() => {
    if (!zoom || zoom.inicial) return;
    let vivo = true;
    fetch(`/api/rh/quadro/${zoom.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { foto?: string }) => {
        if (vivo && d.foto) setGrande(d.foto);
      })
      .catch(() => {
        /* sem foto grande, o zoom fica com a mini */
      })
      .finally(() => {
        if (vivo) setABusca(false);
      });
    return () => {
      vivo = false;
    };
  }, [zoom]);

  useEffect(() => {
    if (!zoom) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onFechar();
      }
    };
    document.addEventListener("keydown", aoTeclar, true);
    return () => document.removeEventListener("keydown", aoTeclar, true);
  }, [zoom, onFechar]);

  if (!zoom) return null;
  const img = grande || zoom.inicial;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Foto de ${zoom.nome}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-4"
    >
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar foto"
        className="absolute top-4 right-4 z-10 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/25"
      >
        <X className="size-5" aria-hidden />
      </button>
      <div className="relative flex flex-col items-center gap-3">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={zoom.nome}
            className="max-h-[82vh] max-w-[92vw] rounded-xl object-contain shadow-2xl"
          />
        ) : (
          <span className="flex size-32 items-center justify-center rounded-xl bg-white/10 text-white/60">
            <UserRound className="size-16" aria-hidden />
          </span>
        )}
        {aBusca && (
          <span className="absolute right-3 bottom-3 rounded-full bg-black/60 p-2 text-white">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          </span>
        )}
        <p className="max-w-[92vw] truncate text-sm font-semibold text-white/90">{zoom.nome}</p>
      </div>
    </div>
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

  // Fotos LEVES da grelha (minis; sem mini, a foto grande mesmo)
  const [fotos, setFotos] = useState<Record<number, string>>({});
  const [zoom, setZoom] = useState<ZoomFotoEstado>(null);
  // Validades nos scans anexados: 2a fonte dos alertas de documentos
  const [docsValidades, setDocsValidades] = useState<ValidadeDoc[]>([]);

  const carregarFotos = useCallback(() => {
    pedir<{ ok: boolean; fotos: { id: number; img: string }[] }>("/api/rh/quadro/fotos")
      .then((d) => {
        const mapa: Record<number, string> = {};
        for (const f of d.fotos || []) mapa[f.id] = f.img;
        setFotos(mapa);
      })
      .catch(() => {
        /* sem fotos, os cartoes ficam com as iniciais */
      });
  }, []);

  const fecharZoom = useCallback(() => setZoom(null), []);

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    pedir<{ ok: boolean; colaboradores: Colaborador[]; docsValidades?: ValidadeDoc[] }>("/api/rh/quadro")
      .then((d) => {
        setLista(d.colaboradores || []);
        setDocsValidades(d.docsValidades || []);
      })
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
    carregarFotos();
  }, [carregarFotos]);

  useEffect(() => {
    let vivo = true;
    pedir<{ ok: boolean; colaboradores: Colaborador[]; docsValidades?: ValidadeDoc[] }>("/api/rh/quadro")
      .then((d) => {
        if (vivo) {
          setLista(d.colaboradores || []);
          setDocsValidades(d.docsValidades || []);
        }
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    carregarFotos();
    return () => {
      vivo = false;
    };
  }, [carregarFotos]);

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

  const alertas = useMemo(
    () => alertasDocumentos(lista || [], docsValidades),
    [lista, docsValidades]
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

          {alertas.length > 0 && (
            <div className="card-sombra border border-ambar/40 p-4" data-alertas-docs>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <CalendarClock className="size-4 text-ambar-texto" aria-hidden />
                Documentos a vencer ({alertas.length})
              </div>
              <div className="divide-y">
                {alertas.map((a) => (
                  <button
                    key={`${a.colaborador_id}-${a.documento}`}
                    type="button"
                    data-alerta-doc
                    onClick={() => setDetalheId(a.colaborador_id)}
                    className="flex w-full flex-wrap items-center gap-2 py-2 text-left text-sm transition-colors hover:bg-accent/40"
                  >
                    <span className="font-semibold">{a.nome}</span>
                    <Etiqueta cor="bg-neutral-900/8 text-neutral-700 dark:bg-white/10 dark:text-neutral-200">
                      {a.documento}
                    </Etiqueta>
                    <Etiqueta cor={COR_SITUACAO_ALERTA[a.situacao]}>
                      {textoAlertaDoc(a)}
                    </Etiqueta>
                    <span className="text-xs text-muted-foreground">{formatoData(a.validade)}</span>
                    <Etiqueta cor={COR_EMPRESA[a.empresa || ""] || "bg-muted text-muted-foreground"}>
                      {a.empresa ? EMPRESA_LABEL[a.empresa] : "Sem classificar"}
                    </Etiqueta>
                  </button>
                ))}
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
                  const foto = fotos[c.id];
                  return (
                    <div
                      key={c.id}
                      role="button"
                      tabIndex={0}
                      data-cartao
                      onClick={() => setDetalheId(c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetalheId(c.id);
                        }
                      }}
                      className="cursor-pointer rounded-xl border p-3.5 text-left transition-colors hover:border-primario/50 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-primario"
                    >
                      <div className="flex items-start gap-3">
                        {foto ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setZoom({ id: c.id, nome: c.name || "", inicial: "" });
                            }}
                            onKeyDown={(e) => e.stopPropagation()}
                            aria-label={`Ampliar foto de ${c.name}`}
                            className="shrink-0 rounded-xl border shadow-sm transition-transform hover:scale-[1.05] focus-visible:outline-2 focus-visible:outline-primario"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={foto} alt="" className="size-16 rounded-xl object-cover" />
                          </button>
                        ) : (
                          <span
                            className={
                              "flex size-16 shrink-0 items-center justify-center rounded-full text-lg font-bold " +
                              corAvatar(c.name)
                            }
                          >
                            {iniciais(c.name)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold leading-tight">{c.name}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            {c.code} · {c.categoria || "-"}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {formatoData(inicioServico(c)) || "Sem início"} · {tempoDeCasa(c)}
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
                        {s?.situacao === "a_decorrer" && Number.isFinite(s.dias) && (
                          <Etiqueta cor="bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            {s.dias <= 0 ? "Termina hoje" : `${s.dias}d`}
                          </Etiqueta>
                        )}
                        {parcelas && (
                          <Etiqueta cor="bg-primario/10 text-primario">
                            {parcelas.total.split(",").slice(0, 2).join(",")} no grupo
                          </Etiqueta>
                        )}
                      </div>
                    </div>
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
          onAmpliar={(id, nome, foto) => setZoom({ id, nome, inicial: foto })}
          onDocumentosMudaram={carregar}
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
          onFotoMudou={carregarFotos}
          onFechar={() => setForm(null)}
        />
      )}

      <ZoomFoto
        key={zoom ? `${zoom.id}-${zoom.inicial ? "ficha" : "grelha"}` : "fechado"}
        zoom={zoom}
        onFechar={fecharZoom}
      />
    </div>
  );
}
