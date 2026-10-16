"use client";

/**
 * Resumo Semanal da Direcção - o ficheiro do Director, agora vivo no
 * portal (ele já não precisa de preencher totais à mão):
 * - Pend. início / Entradas / Saídas / Pend. fecho / Aguardam peças por
 *   frota, com o botão "Preencher das OS" a calcular tudo das ordens de
 *   serviço reais (e o Pend. fecho = início + entradas - saídas, igual ao
 *   ficheiro dele);
 * - disponibilidade real da semana (da grelha diária) contra a meta;
 * - Dificuldades da semana + Plano de melhorias (Responsável / Prazo /
 *   Estado: Por iniciar, Em curso, Concluído), com navegação por semana.
 */

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Save, Wand2 } from "lucide-react";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { cn } from "@/lib/utils";
import {
  MESES_PT,
  inicioSemanaISO,
  type MelhoriaLinha
} from "@/lib/disponibilidade";

type LinhaSemana = { pend_inicio: number; entradas: number; saidas: number; aguardam_pecas: number };
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
  geral: { dificuldades: string; melhorias: MelhoriaLinha[] };
};

const ESTADOS_MELHORIA = ["Por iniciar", "Em curso", "Concluído"] as const;

function periodoSemana(ano: number, semana: number): string {
  const ini = inicioSemanaISO(ano, semana);
  const fim = new Date(ini);
  fim.setUTCDate(fim.getUTCDate() + 6);
  const fmt = (d: Date) => `${d.getUTCDate()} ${MESES_PT[d.getUTCMonth()].slice(0, 3)}`;
  return `${fmt(ini)} - ${fmt(fim)}`;
}

export function SemanaClient({ podeEditar }: { podeEditar: boolean }) {
  const hoje = new Date();
  const [ano, setAno] = useState(hoje.getFullYear());
  const [semana, setSemana] = useState(
    (() => {
      const d = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()));
      const dia = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dia);
      const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      return Math.ceil(((d.getTime() - inicioAno.getTime()) / 86400000 + 1) / 7);
    })()
  );
  const [dados, setDados] = useState<SemanaDados | null>(null);
  const [carregar, setCarregar] = useState(true);
  const [falha, setFalha] = useState("");
  const [aGravar, setAGravar] = useState(false);

  // estado editável
  const [linhas, setLinhas] = useState<Record<string, LinhaSemana>>({});
  const [dificuldades, setDificuldades] = useState("");
  const [melhorias, setMelhorias] = useState<MelhoriaLinha[]>([]);

  const carregarDados = useCallback(() => {
    setCarregar(true);
    setFalha("");
    pedir<SemanaDados>(`/api/disponibilidade/semana?ano=${ano}&semana=${semana}`)
      .then((d) => {
        setDados(d);
        const l: Record<string, LinhaSemana> = {};
        for (const f of d.frotas) {
          l[f] = d.guardado[f] || { pend_inicio: 0, entradas: 0, saidas: 0, aguardam_pecas: 0 };
        }
        setLinhas(l);
        setDificuldades(d.geral.dificuldades || "");
        setMelhorias(d.geral.melhorias || []);
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
        for (const f of d.frotas) {
          l[f] = d.guardado[f] || { pend_inicio: 0, entradas: 0, saidas: 0, aguardam_pecas: 0 };
        }
        setLinhas(l);
        setDificuldades(d.geral.dificuldades || "");
        setMelhorias(d.geral.melhorias || []);
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
      await enviar(
        "/api/disponibilidade/semana",
        {
          ano,
          semana,
          linhas: dados?.frotas.map((f) => ({ frota: f, ...linhas[f] })) || [],
          dificuldades,
          melhorias
        },
        `Resumo da semana ${semana} gravado.`
      );
      carregarDados();
    } catch {
      /* o enviar já avisa */
    } finally {
      setAGravar(false);
    }
  }

  const totalFecho = dados
    ? dados.frotas.reduce((s, f) => {
        const l = linhas[f];
        return s + (l ? l.pend_inicio + l.entradas - l.saidas : 0);
      }, 0)
    : 0;
  const totalPecas = dados
    ? dados.frotas.reduce((s, f) => s + (linhas[f]?.aguardam_pecas || 0), 0)
    : 0;

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
        subtitulo="Movimento por frota, dificuldades e plano de melhorias da semana"
      >
        <button
          onClick={() => mudarSemana(-1)}
          className="inline-flex size-9 items-center justify-center rounded-md border border-input hover:bg-muted"
          aria-label="Semana anterior"
        >
          <ChevronLeft className="size-4" />
        </button>
        <span className="min-w-40 text-center text-sm font-semibold">
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
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}

      {carregar && !dados && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar o resumo...
        </div>
      )}

      {dados && (
        <>
          <div className="card-sombra overflow-hidden p-0">
            <div className="flex items-center justify-between gap-2 p-4 pb-2">
              <h2 className="text-sm font-semibold">01 · Movimento por tipo de máquina</h2>
              <span className="text-xs text-muted-foreground">
                Pend. fecho = início + entradas - saídas · {dados.intervalo.de} a {dados.intervalo.ate}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Frota</th>
                    <th className="px-2 py-2 text-right font-medium">Pend. início</th>
                    <th className="px-2 py-2 text-right font-medium">Entradas</th>
                    <th className="px-2 py-2 text-right font-medium">Saídas</th>
                    <th className="px-2 py-2 text-right font-medium">Pend. fecho</th>
                    <th className="px-2 py-2 text-right font-medium">Aguardam peças</th>
                    <th className="px-4 py-2 text-right font-medium">Disp. semana</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.frotas.map((f) => {
                    const l = linhas[f];
                    const fecho = l ? l.pend_inicio + l.entradas - l.saidas : 0;
                    const disp = dados.disponibilidade[f];
                    const calc = dados.osCalculado[f];
                    return (
                      <tr key={f} className="border-b last:border-0">
                        <td className="px-4 py-1.5 font-medium">{f}</td>
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
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right tabular-nums">{totalFecho}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{totalPecas}</td>
                    <td className="px-4 py-2" />
                  </tr>
                </tbody>
              </table>
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
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">03 · Plano de melhorias</h2>
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
