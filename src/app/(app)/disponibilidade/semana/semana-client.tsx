"use client";

/**
 * Resumo Semanal da Direcção - o ficheiro do Director, agora vivo no
 * portal (ele já não precisa de preencher totais à mão):
 * - cartões do topo: Entradas, Saídas, Pendentes no fecho, Aguardam
 *   peças e Disponibilidade global da semana contra a meta;
 * - por frota: Pend. início / Entradas / Saídas / Pend. fecho /
 *   Aguardam peças, com a coluna Total de máquinas activas, a
 *   disponibilidade pela fórmula do ficheiro ((total - pend. fecho -
 *   aguardam peças) ÷ total) ao lado da nossa de horas reais da
 *   grelha, e o gráfico de barras com a linha da meta;
 * - botão "Preencher das OS" calcula tudo das ordens de serviço reais;
 * - botão "Importar backup" carrega o JSON exportado do ficheiro do
 *   Director e preenche a semana dele (frotas, avarias, dificuldades,
 *   melhorias), saltando para a semana certa;
 * - Dificuldades da semana, Avarias e serviços (frequentes e complexas
 *   por frota) e Plano de melhorias (Responsável / Prazo / Estado).
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Save, Upload, Wand2 } from "lucide-react";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { cn } from "@/lib/utils";
import {
  FROTAS_PADRAO,
  MESES_PT,
  inicioSemanaISO,
  type MelhoriaLinha
} from "@/lib/disponibilidade";

type LinhaSemana = { pend_inicio: number; entradas: number; saidas: number; aguardam_pecas: number };
type AvariaSemana = { frequentes: string; complexas: string };
type SemanaDados = {
  ok: boolean;
  ano: number;
  semana: number;
  intervalo: { de: string; ate: string };
  meta: number;
  frotas: string[];
  osCalculado: Record<string, LinhaSemana>;
  guardado: Record<string, LinhaSemana>;
  disponibilidade: Record<string, number>;
  disponibilidadeGlobal: number | null;
  totalFrota: Record<string, number>;
  avarias: Record<string, AvariaSemana>;
  geral: { dificuldades: string; melhorias: MelhoriaLinha[] };
};

type BackupFrota = {
  name?: string;
  total?: unknown;
  opening?: unknown;
  entries?: unknown;
  exits?: unknown;
  waiting?: unknown;
  frequentFailures?: unknown;
  complexFailures?: unknown;
};
type BackupDirector = {
  fleets?: BackupFrota[];
  actions?: { descricao?: unknown; description?: unknown; responsavel?: unknown; prazo?: unknown; estado?: unknown }[];
  start?: string;
  end?: string;
  difficulties?: string;
};

type ImportPendente = {
  ano: number;
  semana: number;
  linhas: Record<string, LinhaSemana>;
  avarias: Record<string, AvariaSemana>;
  abertas: Record<string, boolean>;
  dificuldades: string;
  melhorias: MelhoriaLinha[];
};

const ESTADOS_MELHORIA = ["Por iniciar", "Em curso", "Concluído"] as const;

function periodoSemana(ano: number, semana: number): string {
  const ini = inicioSemanaISO(ano, semana);
  const fim = new Date(ini);
  fim.setUTCDate(fim.getUTCDate() + 6);
  const fmt = (d: Date) => `${d.getUTCDate()} ${MESES_PT[d.getUTCMonth()].slice(0, 3)}`;
  return `${fmt(ini)} - ${fmt(fim)}`;
}

/** Semana ISO de uma data AAAA-MM-DD (a mesma conta do seletor). */
function semanaDeData(iso: string): { ano: number; semana: number } {
  const d = new Date(iso + "T00:00:00Z");
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    ano: d.getUTCFullYear(),
    semana: Math.ceil((d.getTime() - inicioAno.getTime() + 1) / 86400000 / 7)
  };
}

/** O ficheiro do Director usa outros travesses nos nomes (2,5-16T). */
function normalizarNome(s: string): string {
  return s
    .replace(/[\u2013\u2014]/g, "-")
    .normalize("NFC")
    .trim()
    .toLowerCase();
}

const num = (v: unknown): number => Math.max(0, Math.trunc(Number(v) || 0));

export function SemanaClient({ podeEditar }: { podeEditar: boolean }) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [semana, setSemana] = useState(
    (() => {
      const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
      const dia = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dia);
      const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil(((d.getTime() - inicioAno.getTime()) + 1) / 86400000 / 7);
    })()
  );
  const [dados, setDados] = useState<SemanaDados | null>(null);
  const [carregar, setCarregar] = useState(true);
  const [falha, setFalha] = useState("");
  const [aGravar, setAGravar] = useState(false);

  // estado editável
  const [linhas, setLinhas] = useState<Record<string, LinhaSemana>>({});
  const [avariasEdit, setAvariasEdit] = useState<Record<string, AvariaSemana>>({});
  const [abertas, setAbertas] = useState<Record<string, boolean>>({});
  const [dificuldades, setDificuldades] = useState("");
  const [melhorias, setMelhorias] = useState<MelhoriaLinha[]>([]);

  const ficheiroRef = useRef<HTMLInputElement>(null);
  const importPendente = useRef<ImportPendente | null>(null);

  function aplicarImportado() {
    const imp = importPendente.current;
    if (!imp) return;
    setLinhas(imp.linhas);
    setAvariasEdit(imp.avarias);
    setAbertas(imp.abertas);
    setDificuldades(imp.dificuldades);
    if (imp.melhorias.length) setMelhorias(imp.melhorias);
    importPendente.current = null;
  }

  const carregarDados = useCallback(() => {
    setCarregar(true);
    setFalha("");
    pedir<SemanaDados>(`/api/disponibilidade/semana?ano=${ano}&semana=${semana}`)
      .then((d) => {
        setDados(d);
        const l: Record<string, LinhaSemana> = {};
        const av: Record<string, AvariaSemana> = {};
        const ab: Record<string, boolean> = {};
        for (const f of d.frotas) {
          l[f] = d.guardado[f] || { pend_inicio: 0, entradas: 0, saidas: 0, aguardam_pecas: 0 };
          const a = d.avarias?.[f];
          av[f] = { frequentes: a?.frequentes || "", complexas: a?.complexas || "" };
          if (a && (a.frequentes || a.complexas)) ab[f] = true;
        }
        setLinhas(l);
        setAvariasEdit(av);
        setAbertas(ab);
        setDificuldades(d.geral.dificuldades || "");
        setMelhorias(d.geral.melhorias || []);
        if (importPendente.current && importPendente.current.ano === ano && importPendente.current.semana === semana) {
          aplicarImportado();
        }
      })
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setCarregar(false));
  }, [ano, semana]);

  useEffect(() => {
    // Carregamento em cadeia de promessas (sem setState sincrono no efeito)
    let vivo = true;
    pedir<SemanaDados>(`/api/disponibilidade/semana?ano=${ano}&semana=${semana}`)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        const l: Record<string, LinhaSemana> = {};
        const av: Record<string, AvariaSemana> = {};
        const ab: Record<string, boolean> = {};
        for (const f of d.frotas) {
          l[f] = d.guardado[f] || { pend_inicio: 0, entradas: 0, saidas: 0, aguardam_pecas: 0 };
          const a = d.avarias?.[f];
          av[f] = { frequentes: a?.frequentes || "", complexas: a?.complexas || "" };
          if (a && (a.frequentes || a.complexas)) ab[f] = true;
        }
        setLinhas(l);
        setAvariasEdit(av);
        setAbertas(ab);
        setDificuldades(d.geral.dificuldades || "");
        setMelhorias(d.geral.melhorias || []);
        if (importPendente.current && importPendente.current.ano === ano && importPendente.current.semana === semana) {
          aplicarImportado();
        }
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      })
      .finally(() => {
        if (vivo) setCarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [ano, semana]);

  function preencherDasOs() {
    if (!dados) return;
    const l: Record<string, LinhaSemana> = { ...linhas };
    for (const f of dados.frotas) {
      const calc = dados.osCalculado[f];
      if (calc) l[f] = { ...calc };
    }
    setLinhas(l);
  }

  async function gravar() {
    setAGravar(true);
    try {
      const r = await enviar<{ ok: boolean; aviso?: string }>(
        "/api/disponibilidade/semana",
        {
          ano,
          semana,
          linhas: dados?.frotas.map((f) => ({ frota: f, ...linhas[f] })) || [],
          avarias: dados?.frotas.map((f) => ({ frota: f, ...(avariasEdit[f] || { frequentes: "", complexas: "" }) })) || [],
          dificuldades,
          melhorias
        },
        `Resumo da semana ${semana} gravado.`
      );
      carregarDados();
      if (r?.aviso) setFalha(r.aviso);
      else setFalha("");
    } catch {
      /* o enviar já avisa */
    } finally {
      setAGravar(false);
    }
  }

  async function importarBackup(e: ChangeEvent<HTMLInputElement>) {
    const ficheiro = e.target.files?.[0];
    e.target.value = "";
    if (!ficheiro) return;
    try {
      const d = JSON.parse(await ficheiro.text()) as BackupDirector;
      const ini = String(d.start || "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) throw new Error("O backup não traz a data de início da semana (start).");
      const alvo = semanaDeData(ini);
      const linhasN: Record<string, LinhaSemana> = { ...linhas };
      const avN: Record<string, AvariaSemana> = { ...avariasEdit };
      const abN: Record<string, boolean> = {};
      let achadas = 0;
      for (const fr of Array.isArray(d.fleets) ? d.fleets : []) {
        const nome = normalizarNome(String(fr.name || ""));
        const frota = FROTAS_PADRAO.find((x) => normalizarNome(x.label) === nome);
        if (!frota) continue;
        achadas += 1;
        linhasN[frota.label] = {
          pend_inicio: num(fr.opening),
          entradas: num(fr.entries),
          saidas: num(fr.exits),
          aguardam_pecas: num(fr.waiting)
        };
        const frequentes = String(fr.frequentFailures || "").trim();
        const complexas = String(fr.complexFailures || "").trim();
        avN[frota.label] = { frequentes, complexas };
        if (frequentes || complexas) abN[frota.label] = true;
      }
      if (!achadas) throw new Error("Nenhuma frota do backup corresponde às frotas do portal.");
      const estadoValido = (v: unknown): MelhoriaLinha["estado"] =>
        (ESTADOS_MELHORIA as readonly string[]).includes(String(v)) ? (String(v) as MelhoriaLinha["estado"]) : "Por iniciar";
      const melhN: MelhoriaLinha[] = (Array.isArray(d.actions) ? d.actions : [])
        .map((x) => ({
          descricao: String(x?.descricao || x?.description || "").trim().slice(0, 500),
          responsavel: String(x?.responsavel || "").trim().slice(0, 120),
          prazo: String(x?.prazo || "").trim().slice(0, 40),
          estado: estadoValido(x?.estado)
        }))
        .filter((m) => m.descricao);
      importPendente.current = {
        ano: alvo.ano,
        semana: alvo.semana,
        linhas: linhasN,
        avarias: avN,
        abertas: abN,
        dificuldades: String(d.difficulties || "").trim(),
        melhorias: melhN
      };
      if (alvo.ano === ano && alvo.semana === semana) {
        aplicarImportado();
      } else {
        setAno(alvo.ano);
        setSemana(alvo.semana);
      }
    } catch (err) {
      setFalha(err instanceof Error ? err.message : "Não foi possível ler o backup.");
    }
  }

  const soma = (campo: keyof LinhaSemana) =>
    dados ? dados.frotas.reduce((s, f) => s + (linhas[f]?.[campo] || 0), 0) : 0;
  const totalFecho = dados
    ? dados.frotas.reduce((s, f) => {
        const l = linhas[f];
        return s + (l ? l.pend_inicio + l.entradas - l.saidas : 0);
      }, 0)
    : 0;
  const totalPecas = soma("aguardam_pecas");
  const totalMaquinas = dados ? dados.frotas.reduce((s, f) => s + (dados.totalFrota?.[f] || 0), 0) : 0;

  const mudarSemana = (delta: number) => {
    let s = semana + delta;
    let a = ano;
    if (s < 1) {
      a -= 1;
      s = 52;
    } else if (s > 53) {
      a += 1;
      s = 1;
    }
    setAno(a);
    setSemana(s);
  };

  return (
    <div className="space-y-4">
      <Cabeca
        titulo="Resumo Semanal da Direcção"
        subtitulo="Movimento por frota, avarias, dificuldades e plano de melhorias da semana"
      >
        <button
          onClick={() => mudarSemana(-1)}
          className="inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-muted"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-40 text-center text-sm font-semibold" data-testid="semana-actual">
          Semana {semana} · {ano}
          <span className="block text-xs font-normal text-muted-foreground">{periodoSemana(ano, semana)}</span>
        </span>
        <button
          onClick={() => mudarSemana(1)}
          className="inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-muted"
          aria-label="Semana seguinte"
        >
          <ChevronRight className="size-4" />
        </button>
        {podeEditar && (
          <>
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-input px-3 text-sm font-semibold hover:bg-muted">
              <Upload className="size-4" /> Importar backup
              <input
                ref={ficheiroRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={importarBackup}
              />
            </label>
            <button
              onClick={preencherDasOs}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm font-semibold hover:bg-muted"
            >
              <Wand2 className="size-4" /> Preencher das OS
            </button>
            <button
              onClick={gravar}
              disabled={aGravar}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
            >
              {aGravar ? <Rodar /> : <Save className="size-4" />} Gravar semana
            </button>
          </>
        )}
      </Cabeca>

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro" role="alert">
          {falha}
        </div>
      )}

      {carregar && !dados && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar o resumo...
        </div>
      )}

      {dados && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {[
              { label: "Entradas", valor: String(soma("entradas")), cor: "" },
              { label: "Saídas", valor: String(soma("saidas")), cor: "" },
              { label: "Pendentes no fecho", valor: String(totalFecho), cor: "" },
              { label: "Aguardam peças", valor: String(totalPecas), cor: "" },
              {
                label: "Disponibilidade global",
                valor:
                  dados.disponibilidadeGlobal === null
                    ? "sem dados"
                    : `${dados.disponibilidadeGlobal}%`,
                cor:
                  dados.disponibilidadeGlobal === null
                    ? ""
                    : dados.disponibilidadeGlobal >= dados.meta
                      ? "text-sucesso"
                      : "text-erro"
              }
            ].map((c) => (
              <div key={c.label} className="card-sombra p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <p className={cn("mt-1 text-2xl font-bold tabular-nums", c.cor)}>{c.valor}</p>
              </div>
            ))}
          </div>

          <div className="card-sombra overflow-hidden p-0">
            <div className="flex items-center justify-between gap-2 p-4 pb-2">
              <h2 className="text-sm font-semibold">01 · Movimento por tipo de máquina</h2>
              <span className="text-xs text-muted-foreground">
                Pend. fecho = início + entradas - saídas · {dados.intervalo.de} a {dados.intervalo.ate}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Frota</th>
                    <th className="px-2 py-2 text-right font-medium">Total</th>
                    <th className="px-2 py-2 text-right font-medium">Pend. início</th>
                    <th className="px-2 py-2 text-right font-medium">Entradas</th>
                    <th className="px-2 py-2 text-right font-medium">Saídas</th>
                    <th className="px-2 py-2 text-right font-medium">Pend. fecho</th>
                    <th className="px-2 py-2 text-right font-medium">Aguardam peças</th>
                    <th className="px-2 py-2 text-right font-medium">Disp. fórmula</th>
                    <th className="px-4 py-2 text-right font-medium">Disp. horas</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.frotas.map((f) => {
                    const l = linhas[f];
                    const fecho = l ? l.pend_inicio + l.entradas - l.saidas : 0;
                    const total = dados.totalFrota?.[f] || 0;
                    const pctFormula =
                      total > 0 ? Math.max(0, Math.round(((total - fecho - (l?.aguardam_pecas || 0)) / total) * 100)) : null;
                    const disp = dados.disponibilidade[f];
                    const calc = dados.osCalculado[f];
                    return (
                      <tr key={f} className="border-b last:border-0">
                        <td className="px-4 py-1.5 font-medium">{f}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{total}</td>
                        {(["pend_inicio", "entradas", "saidas"] as const).map((campo) => (
                          <td key={campo} className="px-2 py-1.5 text-right">
                            {podeEditar ? (
                              <input
                                type="number"
                                min={0}
                                className="h-8 w-16 rounded-md border border-input bg-background px-1.5 text-right text-sm tabular-nums"
                                value={l[campo]}
                                onChange={(e) =>
                                  setLinhas({ ...linhas, [f]: { ...l, [campo]: Math.max(0, Number(e.target.value) || 0) } })
                                }
                              />
                            ) : (
                              <span className="tabular-nums">{l[campo]}</span>
                            )}
                            {calc && calc[campo] !== l[campo] && (
                              <span className="ml-1 text-[0.65rem] text-muted-foreground" title="calculado das OS">
                                ({calc[campo]})
                              </span>
                            )}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fecho}</td>
                        <td className="px-2 py-1.5 text-right">
                          {podeEditar ? (
                            <input
                              type="number"
                              min={0}
                              className="h-8 w-16 rounded-md border border-input bg-background px-1.5 text-right text-sm tabular-nums"
                              value={l.aguardam_pecas}
                              onChange={(e) =>
                                setLinhas({
                                  ...linhas,
                                  [f]: { ...l, aguardam_pecas: Math.max(0, Number(e.target.value) || 0) }
                                })
                              }
                            />
                          ) : (
                            <span className="tabular-nums">{l.aguardam_pecas}</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                          {pctFormula === null ? (
                            <span className="text-xs font-normal text-muted-foreground">-</span>
                          ) : (
                            <span className={pctFormula >= dados.meta ? "text-sucesso" : "text-erro"}>{pctFormula}%</span>
                          )}
                        </td>
                        <td className="px-4 py-1.5 text-right">
                          {disp === undefined ? (
                            <span className="text-xs text-muted-foreground">sem dados</span>
                          ) : (
                            <Etiqueta cor={disp >= dados.meta ? "bg-sucesso-bg text-sucesso" : "bg-erro-bg text-erro"}>
                              {disp}%
                            </Etiqueta>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-muted/40 font-semibold">
                    <td className="px-4 py-2">TOTAL</td>
                    <td className="px-2 py-2 text-right tabular-nums">{totalMaquinas}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{soma("pend_inicio")}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{soma("entradas")}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{soma("saidas")}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{totalFecho}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{totalPecas}</td>
                    <td className="px-2 py-2" />
                    <td className="px-4 py-2" />
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="card-sombra p-4">
            <h2 className="text-sm font-semibold">Disponibilidade da semana por frota</h2>
            <div className="relative mt-3">
              <div
                className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-sucesso/70"
                style={{ bottom: `${dados.meta}%` }}
              />
              <div className="flex h-44 items-stretch gap-1 sm:gap-2">
                {dados.frotas.map((f) => {
                  const pct = dados.disponibilidade[f];
                  const tem = pct !== undefined;
                  return (
                    <div
                      key={f}
                      className="relative flex-1"
                      title={tem ? `${f}: ${pct}% da semana (meta ${dados.meta}%)` : `${f}: sem registos na semana`}
                    >
                      {tem && (
                        <span
                          className="absolute inset-x-0 text-center text-[0.58rem] font-semibold tabular-nums"
                          style={{ bottom: `calc(${Math.min(pct, 97)}% + 2px)` }}
                        >
                          {pct}%
                        </span>
                      )}
                      {tem && (
                        <div
                          className={cn("absolute inset-x-0 bottom-0 rounded-t-sm", pct >= dados.meta ? "bg-sucesso" : "bg-erro")}
                          style={{ height: `${Math.min(pct, 100)}%` }}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-1 flex gap-1 sm:gap-2">
                {dados.frotas.map((f) => (
                  <span key={f} className="flex-1 truncate text-center text-[0.55rem] text-muted-foreground" title={f}>
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="card-sombra p-4">
            <h2 className="text-sm font-semibold">02 · Dificuldades da semana</h2>
            <textarea
              rows={4}
              disabled={!podeEditar}
              value={dificuldades}
              onChange={(e) => setDificuldades(e.target.value)}
              placeholder="As dificuldades desta semana (falta de peças, atrasos de fornecedores, máquinas acidentadas...)"
              className="mt-2 w-full rounded-md border border-input bg-background p-2 text-sm"
            />
          </div>

          <div className="card-sombra p-4">
            <h2 className="text-sm font-semibold">03 · Avarias e serviços</h2>
            <div className="mt-2 space-y-1.5">
              {dados.frotas.map((f) => {
                const av = avariasEdit[f] || { frequentes: "", complexas: "" };
                const temConteudo = Boolean(av.frequentes || av.complexas);
                const aberta = Boolean(abertas[f]);
                return (
                  <div key={f} className="rounded-md border">
                    <button
                      type="button"
                      onClick={() => setAbertas({ ...abertas, [f]: !aberta })}
                      aria-expanded={aberta}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
                    >
                      {aberta ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
                      <span>{f}</span>
                      {temConteudo && <span className="ml-auto size-2 shrink-0 rounded-full bg-primario" />}
                    </button>
                    {aberta && (
                      <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Frequentes</p>
                          <textarea
                            rows={6}
                            disabled={!podeEditar}
                            value={av.frequentes}
                            onChange={(e) =>
                              setAvariasEdit({ ...avariasEdit, [f]: { ...av, frequentes: e.target.value } })
                            }
                            className="w-full rounded-md border border-input bg-background p-2 text-sm"
                          />
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complexas</p>
                          <textarea
                            rows={6}
                            disabled={!podeEditar}
                            value={av.complexas}
                            onChange={(e) =>
                              setAvariasEdit({ ...avariasEdit, [f]: { ...av, complexas: e.target.value } })
                            }
                            className="w-full rounded-md border border-input bg-background p-2 text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="card-sombra p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">04 · Plano de melhorias</h2>
              {podeEditar && (
                <button
                  onClick={() =>
                    setMelhorias([...melhorias, { descricao: "", responsavel: "", prazo: "", estado: "Por iniciar" }])
                  }
                  className="h-8 rounded-md border border-input px-2.5 text-xs font-semibold hover:bg-muted"
                >
                  + Adicionar
                </button>
              )}
            </div>
            {melhorias.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Sem melhorias registadas nesta semana.
              </p>
            ) : (
              <div className="mt-2 space-y-2">
                {melhorias.map((m, i) => (
                  <div
                    key={i}
                    className={cn(
                      "grid gap-2 rounded-md border p-2 sm:grid-cols-[1fr_10rem_8rem_9rem_auto]",
                      m.estado === "Concluído" && "opacity-70"
                    )}
                  >
                    <input
                      type="text"
                      disabled={!podeEditar}
                      value={m.descricao}
                      placeholder="Descrição da melhoria"
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      onChange={(e) =>
                        setMelhorias(melhorias.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))
                      }
                    />
                    <input
                      type="text"
                      disabled={!podeEditar}
                      value={m.responsavel}
                      placeholder="Responsável"
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      onChange={(e) =>
                        setMelhorias(melhorias.map((x, j) => (j === i ? { ...x, responsavel: e.target.value } : x)))
                      }
                    />
                    <input
                      type="text"
                      disabled={!podeEditar}
                      value={m.prazo}
                      placeholder="Prazo"
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      onChange={(e) => setMelhorias(melhorias.map((x, j) => (j === i ? { ...x, prazo: e.target.value } : x)))}
                    />
                    <select
                      disabled={!podeEditar}
                      value={m.estado}
                      className="h-9 rounded-md border border-input bg-background px-1.5 text-sm"
                      onChange={(e) =>
                        setMelhorias(
                          melhorias.map((x, j) =>
                            j === i ? { ...x, estado: e.target.value as MelhoriaLinha["estado"] } : x
                          )
                        )
                      }
                    >
                      {ESTADOS_MELHORIA.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    {podeEditar && (
                      <button
                        onClick={() => setMelhorias(melhorias.filter((_, j) => j !== i))}
                        className="h-9 rounded-md border border-input px-2 text-xs text-erro hover:bg-erro-bg"
                        aria-label="Remover melhoria"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
