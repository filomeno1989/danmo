"use client";

/**
 * Painel da Disponibilidade - a vista de cima do módulo.
 *
 * Mostra, com os dados reais importados dos excels (2022-2026):
 * - KPIs do período (disponibilidade %, horas disponíveis/paradas,
 *   horómetro do mês) contra a meta;
 * - gráfico dos 12 meses do ano (barras) com a linha da meta, o mês
 *   escolhido destacado e a percentagem VISÍVEL em cada barra (antes
 *   só aparecia ao passar o rato, e ninguém via nada);
 * - comparação de disponibilidade entre todos os anos da base;
 * - distribuição de horas por estado físico;
 * - quadro das 12 macro-frotas (mês e ano, contra a meta) OU, quando
 *   uma frota é escolhida, a lista das máquinas dessa frota com a
 *   percentagem de cada uma (drill-down pedido pelo Filomeno);
 * - as 6 máquinas com mais horas paradas no período.
 *
 * Correcções do feedback de Outubro/2026:
 * - o ano escolhido sem dados (ex.: 2026, cujo excel ainda está a
 *   trabalhar) agora mostra um AVISO claro com atalhos para os anos
 *   com dados - antes ficava só a linha da meta sem explicação;
 * - qualquer recarregamento mostra "A actualizar..." e, se falhar,
 *   o erro aparece GRANDE com botão Tentar de novo - antes o erro era
 *   uma faixa discreta e o gráfico antigo ficava parado no ecrã,
 *   parecendo que "não muda nada";
 * - p.p. passou a levar a explicação (pontos percentuais) no ecrã.
 */

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Clock, Gauge, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Cabeca, Etiqueta, Rodar, pedir } from "@/components/oficina/ui-bits";
import { cn } from "@/lib/utils";
import {
  COR_ESTADO_DIA,
  ESTADOS_DIA,
  FROTAS_PADRAO,
  MESES_PT
} from "@/lib/disponibilidade";

type ResumoMes = { mes: number; horasA: number; parado: number; total: number; pct: number; maquinas: number };
type ComparacaoAno = { ano: number; pct: number; horasA: number; total: number };
type FrotaLinha = { frota: string; maquinas: number; pctMes: number | null; pctAno: number; paradoMes: number };
type MaquinaPainel = {
  id: number;
  code: string;
  nome: string;
  pctMes: number | null;
  pctAno: number | null;
  horasMesA: number;
  paradoMes: number;
};
type PainelDados = {
  ok: boolean;
  meta: number;
  resumoMensal: ResumoMes[];
  comparacaoAnos: ComparacaoAno[];
  estados: Record<string, number>;
  horometroMes: { trabalhadas: number; lancadas: number; totalMaquinas: number } | null;
  porFrota: FrotaLinha[];
  maquinas: MaquinaPainel[] | null;
  topParadas: { code: string; nome: string; frota: string; horas: number }[];
  disponibilidade: number;
};

function corMeta(pct: number, meta: number): string {
  return pct >= meta ? "bg-sucesso" : pct >= meta - 10 ? "bg-ambar-texto" : "bg-erro";
}

function Kpi({
  titulo, valor, nota, cor, icone
}: {
  titulo: string; valor: string; nota?: string; cor?: string; icone?: React.ReactNode;
}) {
  return (
    <div className="card-sombra flex flex-col gap-1 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</span>
        <span className="text-muted-foreground">{icone}</span>
      </div>
      <span className={cn("text-2xl font-bold tabular-nums", cor)}>{valor}</span>
      {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
    </div>
  );
}

export function PainelDisponibilidade({ podeEditar }: { podeEditar: boolean }) {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [frota, setFrota] = useState("todos");
  const [dados, setDados] = useState<PainelDados | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [falha, setFalha] = useState("");
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    // Carregamento em cadeia de promessas (sem setState sincrono no efeito)
    let vivo = true;
    pedir<PainelDados>(
      `/api/disponibilidade/painel?ano=${ano}&mes=${mes}&frota=${encodeURIComponent(frota)}`
    )
      .then((d) => {
        if (vivo) {
          setDados(d);
          setFalha("");
        }
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      })
      .finally(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [ano, mes, frota, tentativa]);

  // Os selects (e os atalhos do aviso) marcam a recarga no PRÓPRIO evento,
  // assim o efeito nunca faz setState sincrono.
  const escolherAno = (a: number) => { setAno(a); setACarregar(true); };
  const escolherMes = (m: number) => { setMes(m); setACarregar(true); };
  const escolherFrota = (f: string) => { setFrota(f); setACarregar(true); };
  const tentarDeNovo = () => { setFalha(""); setACarregar(true); setTentativa((t) => t + 1); };

  const meta = dados?.meta ?? 80;
  const maxEscala = useMemo(() => {
    if (!dados) return 100;
    const maior = Math.max(100, ...dados.resumoMensal.map((m) => m.pct));
    return Math.ceil(maior / 10) * 10;
  }, [dados]);

  const mesesAnterior = mes > 1 ? dados?.resumoMensal[mes - 2] : undefined;
  const mesActual = mes > 0 ? dados?.resumoMensal[mes - 1] : undefined;
  const diferenca =
    mesActual && mesesAnterior && mesesAnterior.maquinas > 0
      ? Math.round((mesActual.pct - mesesAnterior.pct) * 10) / 10
      : null;

  const totalEstados = dados ? Object.values(dados.estados).reduce((s, v) => s + v, 0) : 0;
  const anoSemDados = dados ? dados.resumoMensal.every((m) => m.maquinas === 0) : false;
  const anosComDados = dados ? dados.comparacaoAnos.filter((c) => c.total > 0) : [];
  const maquinasNoAno = dados ? Math.max(0, ...dados.resumoMensal.map((m) => m.maquinas)) : 0;

  return (
    <div className="space-y-4">
      <Cabeca
        titulo="Disponibilidade de Equipamentos"
        subtitulo="Horas disponíveis, estados físicos e horómetro - dados reais de 2022 a 2026 (excels AVAILABILITY OF MACHINES)"
      >
        <select
          aria-label="Ano"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={ano}
          onChange={(e) => escolherAno(Number(e.target.value))}
        >
          {(dados?.comparacaoAnos.length
            ? [...new Set([...dados.comparacaoAnos.map((c) => c.ano), agora.getFullYear()])]
            : [agora.getFullYear()]
          ).map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          aria-label="Mês"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={mes}
          onChange={(e) => escolherMes(Number(e.target.value))}
        >
          <option value={0}>Ano inteiro</option>
          {MESES_PT.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          aria-label="Frota"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={frota}
          onChange={(e) => escolherFrota(e.target.value)}
        >
          <option value="todos">Todas as frotas</option>
          {FROTAS_PADRAO.map((f) => (
            <option key={f.label} value={f.label}>{f.label}</option>
          ))}
        </select>
      </Cabeca>

      {falha && (
        <div className="card-sombra flex flex-wrap items-center justify-between gap-3 border border-erro/40 bg-erro-bg p-4 text-sm text-erro">
          <span>
            <b>Falha ao carregar a disponibilidade:</b> {falha}
            {dados && <span className="ml-1 text-erro/80">(os números no ecrã são da consulta anterior)</span>}
          </span>
          <button
            onClick={tentarDeNovo}
            className="rounded-md bg-erro px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {aCarregar && dados && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className="size-3.5 animate-spin" /> A actualizar os dados do período...
        </div>
      )}

      {carregamentoInicial(aCarregar, dados) && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar a disponibilidade...
        </div>
      )}

      {dados && (
        <>
          {anoSemDados && (
            <div className="card-sombra border border-ambar/50 bg-ambar-claro/40 p-4 text-sm">
              <p className="font-semibold text-ambar-texto">
                O ano {ano} ainda não tem dados importados - por isso o gráfico mostra só a linha da meta.
              </p>
              <p className="mt-1 text-muted-foreground">
                Os excels AVAILABILITY OF MACHINES já no sistema vão de 2022 a 2025. Os estados de {ano} entram
                pela Grelha Diária (ou pela importação do excel de {ano} quando estiver fechado). Toque num ano
                com dados para ver o histórico real:
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {anosComDados.map((c) => (
                  <button
                    key={c.ano}
                    onClick={() => escolherAno(c.ano)}
                    className={cn(
                      "rounded-full border border-ambar/60 px-3 py-1 text-xs font-semibold transition-colors hover:bg-ambar/20",
                      c.ano === ano && "bg-ambar/30"
                    )}
                  >
                    {c.ano} · {c.pct}%
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              titulo={`Disponibilidade ${mes === 0 ? "do ano" : "do mês"}`}
              valor={`${dados.disponibilidade}%`}
              cor={dados.disponibilidade >= meta ? "text-sucesso" : "text-erro"}
              nota={`Meta ${meta}% · ${dados.disponibilidade >= meta ? "atingida" : `faltam ${Math.round((meta - dados.disponibilidade) * 10) / 10} p.p. (pontos percentuais)`}`}
              icone={<Gauge className="size-4" />}
            />
            <Kpi
              titulo="Horas disponíveis"
              valor={`${(mesActual ? mesActual.horasA : dados.resumoMensal.reduce((s, m) => s + m.horasA, 0)).toLocaleString("pt-PT")} h`}
              nota={mesActual ? `de ${(mesActual.total / 24).toFixed(0)} dias-máquina no mês` : "soma dos 12 meses"}
              icone={<Clock className="size-4" />}
            />
            <Kpi
              titulo="Horas paradas"
              valor={`${(mesActual ? mesActual.parado : dados.resumoMensal.reduce((s, m) => s + m.parado, 0)).toLocaleString("pt-PT")} h`}
              nota="avaria + acidente + pneumático + revisão + peça"
              icone={<TrendingDown className="size-4" />}
            />
            {dados.horometroMes ? (
              <Kpi
                titulo="Horómetro do mês"
                valor={`${dados.horometroMes.trabalhadas.toLocaleString("pt-PT")} h`}
                nota={`lançado por ${dados.horometroMes.lancadas} de ${dados.horometroMes.totalMaquinas} máquinas`}
                icone={<Gauge className="size-4" />}
              />
            ) : (
              <Kpi
                titulo="Comparação anual"
                valor={`${dados.comparacaoAnos.length} anos`}
                nota="histórico importado dos excels"
                icone={<CalendarDays className="size-4" />}
              />
            )}
          </div>

          {diferenca !== null && mesActual && mesesAnterior && mesesAnterior.maquinas > 0 && (
            <div className="card-sombra flex flex-wrap items-center gap-2 p-3 text-sm">
              <span>Comparação com {MESES_PT[mes - 2]}:</span>
              {diferenca >= 0 ? (
                <Etiqueta cor="bg-sucesso-bg text-sucesso">
                  <TrendingUp className="mr-1 inline size-3" />+{diferenca} p.p.
                </Etiqueta>
              ) : (
                <Etiqueta cor="bg-erro-bg text-erro">
                  <TrendingDown className="mr-1 inline size-3" />{diferenca} p.p.
                </Etiqueta>
              )}
              <span
                className="text-muted-foreground"
                title="p.p. = pontos percentuais: a diferença directa entre duas percentagens (80% para 85% são +5 p.p., mas 80% para 85% também são +6,25% em termos relativos)"
              >
                ({mesesAnterior.pct}% em {MESES_PT[mes - 2]} → {mesActual.pct}% em {MESES_PT[mes - 1]}) · p.p. = pontos percentuais
              </span>
            </div>
          )}

          {/* Gráfico dos 12 meses */}
          <div className="card-sombra space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="size-4" /> Disponibilidade por mês em {ano}
              </h2>
              <span className="text-xs text-muted-foreground">linha verde = meta {meta}%</span>
            </div>
            <div className="relative">
              <div
                className="absolute inset-x-0 border-t-2 border-dashed border-sucesso/70"
                style={{ bottom: `${(meta / maxEscala) * 100}%` }}
                aria-hidden
              />
              <div className="flex h-48 items-end gap-1.5 sm:gap-3">
                {dados.resumoMensal.map((m) => {
                  const altura = (m.pct / maxEscala) * 100;
                  const temDados = m.maquinas > 0;
                  const destacado = mes !== 0 && m.mes === mes;
                  return (
                    <div
                      key={m.mes}
                      className={cn(
                        "group flex min-w-0 flex-1 flex-col items-center justify-end gap-1 rounded-md",
                        destacado && "bg-primario/10 ring-1 ring-primario/40"
                      )}
                    >
                      <span
                        className={cn(
                          "whitespace-nowrap text-[0.6rem] font-semibold tabular-nums sm:text-[0.68rem]",
                          destacado ? "text-primario" : "text-muted-foreground"
                        )}
                      >
                        {temDados ? `${m.pct}%` : ""}
                      </span>
                      <div
                        className={cn(
                          "w-full rounded-t-md transition-colors",
                          !temDados ? "bg-muted" : corMeta(m.pct, meta)
                        )}
                        style={{ height: `${temDados ? Math.max(2, altura) : 2}%` }}
                        title={`${MESES_PT[m.mes - 1]}: ${m.pct}% (${m.horasA.toLocaleString("pt-PT")} h disp. de ${(m.total / 24).toFixed(0)} dias-máquina)`}
                      />
                      <span
                        className={cn(
                          "text-[0.62rem]",
                          destacado ? "font-bold text-primario" : "font-medium text-muted-foreground"
                        )}
                      >
                        {MESES_PT[m.mes - 1].slice(0, 3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {maquinasNoAno > 0 ? (
              <p className="text-xs text-muted-foreground">
                {maquinasNoAno} máquinas com registo no ano · a percentagem de cada barra está escrita por cima
                dela {mes !== 0 && "· o mês escolhido fica com fundo verde"}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Sem registos de horas em {ano} - os estados do dia a dia entram na Grelha Diária.
              </p>
            )}
          </div>

          {/* Comparação entre anos + estados */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="card-sombra space-y-3 p-4">
              <h2 className="text-sm font-semibold">Comparação entre anos</h2>
              <div className="space-y-2">
                {dados.comparacaoAnos.map((c) => (
                  <div key={c.ano} className="flex items-center gap-3">
                    <span className="w-10 shrink-0 text-sm font-semibold tabular-nums">{c.ano}</span>
                    <div className="h-4 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", corMeta(c.pct, meta))}
                        style={{ width: `${Math.min(100, c.pct)}%` }}
                      />
                    </div>
                    <span
                      className={cn(
                        "w-14 shrink-0 text-right text-sm font-semibold tabular-nums",
                        c.pct >= meta ? "text-sucesso" : "text-erro"
                      )}
                    >
                      {c.pct}%
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Percentagem média de horas disponíveis sobre o total de horas de cada ano.
              </p>
            </div>

            <div className="card-sombra space-y-3 p-4">
              <h2 className="text-sm font-semibold">
                Horas por estado físico {mes === 0 ? `em ${ano}` : `em ${MESES_PT[mes - 1]}`}
              </h2>
              <div className="space-y-2">
                {ESTADOS_DIA.map((estado) => {
                  const horas = dados.estados[estado] || 0;
                  const pct = totalEstados ? (horas / totalEstados) * 100 : 0;
                  return (
                    <div key={estado} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 truncate text-xs font-medium">{estado}</span>
                      <div className="h-3 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", COR_ESTADO_DIA[estado] || "bg-muted")}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {Math.round(horas).toLocaleString("pt-PT")} h
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Quadro por frota OU máquinas da frota escolhida + top paradas */}
          <div className="grid gap-3 lg:grid-cols-3">
            {frota !== "todos" && dados.maquinas ? (
              <div className="card-sombra overflow-hidden p-0 lg:col-span-2">
                <div className="flex items-center justify-between gap-2 p-4 pb-2">
                  <h2 className="text-sm font-semibold">
                    Máquinas da frota {frota} ({ano})
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {dados.maquinas.length} máquinas activas · meta {meta}%
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Máquina</th>
                        <th className="px-2 py-2 text-right font-medium">{mes === 0 ? "Ano" : "Mês"}</th>
                        <th className="px-2 py-2 text-right font-medium">Ano</th>
                        <th className="px-2 py-2 text-right font-medium">Horas disp.</th>
                        <th className="px-4 py-2 text-right font-medium">Paradas no {mes === 0 ? "ano" : "mês"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.maquinas.map((mq) => {
                        const pctPeriodo = mes === 0 ? mq.pctAno : mq.pctMes;
                        return (
                          <tr key={mq.id} className="border-b last:border-0">
                            <td className="px-4 py-2">
                              <span className="font-semibold">{mq.code}</span>{" "}
                              <span className="text-muted-foreground">{mq.nome}</span>
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <div className="hidden h-3 w-20 overflow-hidden rounded-full bg-muted sm:block">
                                  {pctPeriodo !== null && (
                                    <div
                                      className={cn("h-full rounded-full", corMeta(pctPeriodo, meta))}
                                      style={{ width: `${Math.min(100, pctPeriodo)}%` }}
                                    />
                                  )}
                                </div>
                                {pctPeriodo === null ? (
                                  <span className="text-muted-foreground">-</span>
                                ) : (
                                  <span className={cn("w-12 text-right font-semibold tabular-nums", pctPeriodo >= meta ? "text-sucesso" : "text-erro")}>
                                    {pctPeriodo}%
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              {mq.pctAno === null ? (
                                <span className="text-muted-foreground">-</span>
                              ) : (
                                <span className={mq.pctAno >= meta ? "text-sucesso" : "text-erro"}>{mq.pctAno}%</span>
                              )}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                              {mq.horasMesA.toLocaleString("pt-PT")} h
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                              {mq.paradoMes.toLocaleString("pt-PT")} h
                            </td>
                          </tr>
                        );
                      })}
                      {dados.maquinas.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                            Esta frota não tem máquinas activas na base.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="border-t p-3 text-xs text-muted-foreground">
                  Ordenada da máquina com menor disponibilidade no período para a melhor. Toque na frota
                  &quot;Todas as frotas&quot; para voltar ao quadro das 12 frotas.
                </p>
              </div>
            ) : (
              <div className="card-sombra overflow-hidden p-0 lg:col-span-2">
                <div className="flex items-center justify-between gap-2 p-4 pb-2">
                  <h2 className="text-sm font-semibold">Quadro por frota ({ano})</h2>
                  <span className="text-xs text-muted-foreground">meta {meta}%</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-2 font-medium">Frota</th>
                        <th className="px-2 py-2 text-right font-medium">Máq.</th>
                        <th className="px-2 py-2 text-right font-medium">{mes === 0 ? "Ano" : "Mês"}</th>
                        <th className="px-2 py-2 text-right font-medium">Ano</th>
                        <th className="px-4 py-2 text-right font-medium">Paradas no mês</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dados.porFrota.map((f) => (
                        <tr key={f.frota} className="border-b last:border-0">
                          <td className="px-4 py-2 font-medium">{f.frota}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{f.maquinas}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            {f.pctMes === null ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              <span className={f.pctMes >= meta ? "text-sucesso" : "text-erro"}>{f.pctMes}%</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            <span className={f.pctAno >= meta ? "text-sucesso" : "text-erro"}>{f.pctAno}%</span>
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                            {f.paradoMes.toLocaleString("pt-PT")} h
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="border-t p-3 text-xs text-muted-foreground">
                  Escolhe uma frota no seletor de cima (ex.: Reach-Stacker 45T) para ver a disponibilidade de
                  cada máquina dentro dela.
                </p>
              </div>
            )}

            <div className="card-sombra p-4">
              <h2 className="text-sm font-semibold">
                Mais horas paradas {mes === 0 ? `em ${ano}` : `em ${MESES_PT[mes - 1]}`}
              </h2>
              <ul className="mt-3 space-y-2">
                {dados.topParadas.length === 0 && (
                  <li className="text-sm text-muted-foreground">Sem horas paradas no período.</li>
                )}
                {dados.topParadas.map((p) => (
                  <li key={p.code} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold">{p.code}</span>{" "}
                      <span className="text-muted-foreground">{p.nome}</span>
                      <span className="block text-xs text-muted-foreground">{p.frota}</span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums text-erro">
                      {p.horas.toLocaleString("pt-PT")} h
                    </span>
                  </li>
                ))}
              </ul>
              {podeEditar && (
                <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                  Marca os estados no dia a dia em <b>Grelha Diária</b> e lança as horas do contador em{" "}
                  <b>Horómetro</b>.
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Só mostra o loader grande na primeira carga (sem dados ainda). */
function carregamentoInicial(aCarregar: boolean, dados: PainelDados | null): boolean {
  return aCarregar && !dados;
}
