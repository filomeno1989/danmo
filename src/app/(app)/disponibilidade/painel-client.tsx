"use client";

/**
 * Painel da Disponibilidade - a vista de cima do módulo.
 *
 * Mostra, com os dados reais importados dos excels (2022-2026):
 * - KPIs do período (disponibilidade %, horas disponíveis/paradas,
 *   horómetro do mês) contra a meta;
 * - gráfico dos 12 meses do ano (barras) com a linha da meta;
 * - comparação de disponibilidade entre todos os anos da base;
 * - distribuição de horas por estado físico;
 * - quadro das 12 macro-frotas (mês e ano, contra a meta);
 * - as 6 máquinas com mais horas paradas no período.
 */

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Clock, Gauge, TrendingDown, TrendingUp } from "lucide-react";
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
type PainelDados = {
  ok: boolean;
  meta: number;
  resumoMensal: ResumoMes[];
  comparacaoAnos: ComparacaoAno[];
  estados: Record<string, number>;
  horometroMes: { trabalhadas: number; lancadas: number; totalMaquinas: number } | null;
  porFrota: FrotaLinha[];
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
  const [carregar, setCarregar] = useState(true);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    // Carregamento em cadeia de promessas (sem setState sincrono no efeito)
    let vivo = true;
    pedir<PainelDados>(
      `/api/disponibilidade/painel?ano=${ano}&mes=${mes}&frota=${encodeURIComponent(frota)}`
    )
      .then((d) => {
        if (vivo) setDados(d);
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
  }, [ano, mes, frota]);

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
          onChange={(e) => setAno(Number(e.target.value))}
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
          onChange={(e) => setMes(Number(e.target.value))}
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
          onChange={(e) => setFrota(e.target.value)}
        >
          <option value="todos">Todas as frotas</option>
          {FROTAS_PADRAO.map((f) => (
            <option key={f.label} value={f.label}>{f.label}</option>
          ))}
        </select>
      </Cabeca>

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}

      {carregar && !dados && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar a disponibilidade...
        </div>
      )}

      {dados && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi
              titulo={`Disponibilidade ${mes === 0 ? "do ano" : "do mês"}`}
              valor={`${dados.disponibilidade}%`}
              cor={dados.disponibilidade >= meta ? "text-sucesso" : "text-erro"}
              nota={`Meta ${meta}% · ${dados.disponibilidade >= meta ? "atingida" : `${Math.round((meta - dados.disponibilidade) * 10) / 10} p.p. em falta`}`}
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
              <span className="text-muted-foreground">
                ({mesesAnterior.pct}% em {MESES_PT[mes - 2]} → {mesActual.pct}% em {MESES_PT[mes - 1]})
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
                  return (
                    <div key={m.mes} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                      <span className="text-[0.62rem] font-semibold tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
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
                      <span className="text-[0.62rem] font-medium text-muted-foreground">
                        {MESES_PT[m.mes - 1].slice(0, 3)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
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

          {/* Quadro por frota + top paradas */}
          <div className="grid gap-3 lg:grid-cols-3">
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
            </div>

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
