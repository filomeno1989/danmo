/**
 * /ferramentaria/relatorios (cliente).
 *
 * As 6 secções do hub: Movimentação Geral, Ferramentas Mais
 * Emprestadas, Colaboradores com Mais Movimentações, Mapa de Danos,
 * Ferramentas Na Rua e Estado do Inventário. O cálculo vive na lib
 * (statsRelatorio), o período filtra no servidor (movimentos ?de/?ate).
 */

"use client";

import { useState } from "react";
import { Download, FileText, LoaderCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, pedir } from "@/components/oficina/ui-bits";
import { Card, CardContent } from "@/components/ui/card";
import {
  csvMovimentos,
  diasFora,
  fmtDias,
  fmtMTn,
  hojeFerr,
  statsRelatorio,
  type DanoVisao,
  type Ferramenta,
  type MovimentoVisao,
  type RelatorioStats
} from "@/lib/ferramentaria";

function Kpi({ valor, label }: { valor: string; label: string }) {
  return (
    <div className="rounded-md border p-3 text-center">
      <p className="text-xl font-bold">{valor}</p>
      <p className="text-muted-foreground text-[0.7rem] font-semibold">{label}</p>
    </div>
  );
}

function LinhaVazia({ colunas }: { colunas: number }) {
  return (
    <tr>
      <td colSpan={colunas} className="text-muted-foreground py-6 text-center text-sm">
        Sem dados para este período.
      </td>
    </tr>
  );
}

export function RelatoriosClient() {
  const primeiroDia = `${hojeFerr().slice(0, 7)}-01`;
  const [de, setDe] = useState(primeiroDia);
  const [ate, setAte] = useState(hojeFerr());
  const [stats, setStats] = useState<RelatorioStats | null>(null);
  const [csvLinhas, setCsvLinhas] = useState<MovimentoVisao[]>([]);
  const [aProcessar, setAProcessar] = useState(false);

  async function gerar() {
    if (aProcessar) return;
    if (de > ate) {
      toast.error("A data inicial é depois da final.");
      return;
    }
    setAProcessar(true);
    try {
      const [mov, tools, danos] = await Promise.all([
        pedir<{ movimentos: MovimentoVisao[] }>(
          `/api/ferramentaria/movimentos?de=${de}&ate=${ate}`
        ),
        pedir<{ ferramentas: Ferramenta[] }>("/api/ferramentaria/ferramentas"),
        pedir<{ danos: DanoVisao[] }>("/api/ferramentaria/danos")
      ]);
      setStats(statsRelatorio(mov.movimentos, tools.ferramentas, danos.danos, de, ate));
      setCsvLinhas(mov.movimentos);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar o relatório.");
    } finally {
      setAProcessar(false);
    }
  }

  function descarregarCsv() {
    const csv = csvMovimentos(csvLinhas);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ferramentaria_movimentos_${de}_a_${ate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV descarregado.");
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo="Relatórios" subtitulo="Análise detalhada e métricas da ferramentaria">
        <a
          href={`/imprimir/ferramentaria/relatorio?de=${de}&ate=${ate}`}
          target="_blank"
          className="border-input bg-background inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold hover:bg-accent"
        >
          <FileText className="size-4" aria-hidden />
          Papel A4
        </a>
        <button
          type="button"
          onClick={descarregarCsv}
          disabled={!csvLinhas.length}
          className="border-input bg-background inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold hover:bg-accent disabled:opacity-50"
        >
          <Download className="size-4" aria-hidden />
          CSV
        </button>
      </Cabeca>

      {/* Filtros */}
      <Card className="card-sombra">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="r-de">
              De
            </label>
            <input
              id="r-de"
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="border-input bg-transparent dark:bg-input/30 h-9 rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="r-ate">
              Até
            </label>
            <input
              id="r-ate"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="border-input bg-transparent dark:bg-input/30 h-9 rounded-md border px-3 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={gerar}
            disabled={aProcessar}
            data-acao="gerar"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
          >
            {aProcessar ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden />
            ) : (
              <RefreshCw className="size-4" aria-hidden />
            )}
            Gerar Relatório
          </button>
        </CardContent>
      </Card>

      {!stats ? (
        <p className="text-muted-foreground py-10 text-center text-sm">
          Escolhe o período e gera o relatório.
        </p>
      ) : (
        <div className="space-y-4">
          {/* 1. Movimentação geral */}
          <Card className="card-sombra">
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-bold">Movimentação geral</h2>
              <div className="grid gap-3 sm:grid-cols-4" data-rel-movimentacao>
                <Kpi valor={String(stats.totalEmprestimos)} label="Total de empréstimos" />
                <Kpi valor={String(stats.totalDevolucoes)} label="Total de devoluções" />
                <Kpi valor={`${stats.taxaNoPrazo}%`} label="Taxa no prazo" />
                <Kpi valor={`${stats.taxaAtraso}%`} label="Taxa de atraso" />
              </div>
            </CardContent>
          </Card>

          {/* 2. Ferramentas mais emprestadas */}
          <Card className="card-sombra">
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-bold">Ferramentas mais emprestadas</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                      <th className="py-2 pr-3 font-medium">Código</th>
                      <th className="py-2 pr-3 font-medium">Nome</th>
                      <th className="py-2 pr-3 font-medium">Vezes emprestada</th>
                      <th className="py-2 font-medium">Último empréstimo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topFerramentas.length === 0 ? (
                      <LinhaVazia colunas={4} />
                    ) : (
                      stats.topFerramentas.map((t) => (
                        <tr key={t.code} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-semibold">{t.code}</td>
                          <td className="py-2 pr-3">{t.nome}</td>
                          <td className="py-2 pr-3">{t.count} vezes</td>
                          <td className="py-2">{(t.ultimo || "").slice(0, 10) || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 3. Colaboradores com mais movimentações */}
          <Card className="card-sombra">
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-bold">Colaboradores com mais movimentações</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                      <th className="py-2 pr-3 font-medium">Colaborador</th>
                      <th className="py-2 pr-3 font-medium">Departamento</th>
                      <th className="py-2 pr-3 font-medium">Empréstimos</th>
                      <th className="py-2 font-medium">Atrasos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topColaboradores.length === 0 ? (
                      <LinhaVazia colunas={4} />
                    ) : (
                      stats.topColaboradores.map((c) => (
                        <tr key={`${c.colaborador}-${c.departamento}`} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-semibold">{c.colaborador}</td>
                          <td className="py-2 pr-3">{c.departamento}</td>
                          <td className="py-2 pr-3">{c.total}</td>
                          <td className="py-2">
                            {c.atrasadas > 0 ? (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-600 px-2 py-0.5 text-[0.68rem] font-semibold text-white">
                                {c.atrasadas}
                              </span>
                            ) : (
                              <span className="inline-flex items-center whitespace-nowrap rounded-full bg-emerald-100 px-2 py-0.5 text-[0.68rem] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                                0
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 4. Mapa de danos */}
          <Card className="card-sombra">
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-bold">Mapa de danos</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <Kpi valor={String(stats.danos.total)} label="Total de incidentes" />
                <Kpi valor={fmtMTn(stats.danos.custoTotal)} label="Custo total" />
                <Kpi
                  valor={`${stats.danos.leves} / ${stats.danos.moderados} / ${stats.danos.graves}`}
                  label="Leves / Moderados / Graves"
                />
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                      <th className="py-2 pr-3 font-medium">Tipo de dano</th>
                      <th className="py-2 font-medium">Ocorrências</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.danos.porTipo.length === 0 ? (
                      <LinhaVazia colunas={2} />
                    ) : (
                      stats.danos.porTipo.map((t) => (
                        <tr key={t.tipo} className="border-b last:border-0">
                          <td className="py-2 pr-3">{t.tipo}</td>
                          <td className="py-2 font-bold">{t.count}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 5. Na rua (lista completa, não cortada pelo período) */}
          <Card className="card-sombra">
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-bold">Ferramentas na rua agora</h2>
              <p className="text-muted-foreground mb-3 text-xs">
                Lista completa das que ainda não voltaram, de qualquer data (a coluna "Tempo fora" é que conta a idade).
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                      <th className="py-2 pr-3 font-medium">Código</th>
                      <th className="py-2 pr-3 font-medium">Ferramenta</th>
                      <th className="py-2 pr-3 font-medium">Quem levou</th>
                      <th className="py-2 pr-3 font-medium">Departamento</th>
                      <th className="py-2 pr-3 font-medium">Data saída</th>
                      <th className="py-2 font-medium">Tempo fora</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.naRua.length === 0 ? (
                      <LinhaVazia colunas={6} />
                    ) : (
                      stats.naRua.map((m) => (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-semibold">{m.code || "-"}</td>
                          <td className="py-2 pr-3">{m.nome || "-"}</td>
                          <td className="py-2 pr-3">{m.colaborador || "-"}</td>
                          <td className="py-2 pr-3">{m.departamento || "-"}</td>
                          <td className="py-2 pr-3">{(m.data_saida || "").slice(0, 10)}</td>
                          <td className="py-2">{fmtDias(diasFora(m.data_saida, hojeFerr()))}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 6. Estado do inventário */}
          <Card className="card-sombra">
            <CardContent className="p-4">
              <h2 className="mb-3 text-sm font-bold">Estado atual do inventário</h2>
              <div className="flex flex-wrap gap-3" data-rel-inventario>
                {stats.inventario.map((i) => (
                  <div key={i.estado} className="rounded-md border px-4 py-2 text-center">
                    <span className="text-muted-foreground text-[0.7rem] font-bold uppercase">{i.estado}</span>
                    <p className="text-lg font-bold">{i.count}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
