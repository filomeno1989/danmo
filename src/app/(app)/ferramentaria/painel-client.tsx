/**
 * /ferramentaria - Painel (cliente).
 *
 * Migração do dashboard.html do hub: KPIs clicáveis que levam à secção,
 * gráficos de barras CSS (mesma receita do HST e da Aquisição), tabela
 * das ferramentas na rua com atrasos a vermelho e últimas devoluções
 * com problema. Faltas de fontes (degradação da API) avisa num toast.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownUp,
  Hammer,
  PackageCheck,
  TriangleAlert,
  Wrench
} from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Etiqueta, pedir, Rodar } from "@/components/oficina/ui-bits";
import { Card, CardContent } from "@/components/ui/card";
import {
  corEstadoVoltar,
  devolucoesComProblema,
  estaAtrasada,
  fmtDias,
  fmtMTn,
  diasFora,
  statsPainel,
  type DanoVisao,
  type Ferramenta,
  type MovimentoVisao
} from "@/lib/ferramentaria";

type Dados = {
  ok: boolean;
  hoje: string;
  ferramentas: Ferramenta[];
  movimentos: MovimentoVisao[];
  danos: DanoVisao[];
  faltas: string[];
};

function Kpi({
  icone: Icone,
  label,
  valor,
  sub,
  cor,
  href
}: {
  icone: typeof Wrench;
  label: string;
  valor: React.ReactNode;
  sub?: string;
  cor: string;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="card-sombra transition-transform hover:-translate-y-0.5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-white ${cor}`}>
              <Icone className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
              <div className="truncate text-xl font-bold">{valor}</div>
              {sub && <div className="truncate text-[0.7rem] text-muted-foreground">{sub}</div>}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Barras({
  dados,
  corClasse
}: {
  dados: { label: string; count: number }[];
  corClasse?: string;
}) {
  if (!dados.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem dados suficientes.</p>;
  }
  const max = dados[0].count;
  return (
    <div>
      {dados.map((d) => (
        <div key={d.label} className="mb-2 flex items-center gap-2">
          <div className="w-44 truncate text-xs font-semibold text-muted-foreground" title={d.label}>
            {d.label}
          </div>
          <div className="h-3.5 flex-1 overflow-hidden rounded bg-muted">
            <div
              className={`h-full rounded ${corClasse || "bg-sky-500"}`}
              style={{ width: `${max > 0 ? (d.count / max) * 100 : 0}%` }}
            />
          </div>
          <div className="w-8 text-right text-xs font-bold">{d.count}</div>
        </div>
      ))}
    </div>
  );
}

export function PainelClient() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    pedir<Dados>("/api/ferramentaria/painel")
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        if (d.faltas.length > 0) {
          toast.warning(`Não foi possível carregar: ${d.faltas.join(", ")}. A mostrar o resto.`);
        }
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (!dados) return null;
    return statsPainel(dados.ferramentas, dados.movimentos, dados.danos, dados.hoje);
  }, [dados]);

  const problemas = useMemo(() => {
    if (!dados) return [];
    return devolucoesComProblema(dados.movimentos, 10);
  }, [dados]);

  if (falha) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {falha}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Painel Ferramentaria"
        subtitulo="Ferramentas na rua, atrasos e registo de danos"
      >
        <Link
          href="/ferramentaria/relatorios"
          className="border-input bg-background inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-semibold hover:bg-accent"
        >
          <ArrowDownUp className="size-4" aria-hidden />
          Relatórios
        </Link>
      </Cabeca>

      {/* KPIs */}
      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          icone={Wrench}
          label="Ferramentas fora agora"
          cor="bg-amber-500"
          href="/ferramentaria/emprestimos"
          valor={stats ? String(stats.fora.length) : <Rodar />}
        />
        <Kpi
          icone={TriangleAlert}
          label="Devoluções atrasadas"
          cor="bg-red-600"
          href="/ferramentaria/emprestimos"
          valor={stats ? String(stats.atrasadas) : <Rodar />}
        />
        <Kpi
          icone={Hammer}
          label="Ferramentas avariadas"
          cor="bg-red-700"
          href="/ferramentaria/danos"
          valor={stats ? String(stats.avariadas) : <Rodar />}
        />
        <Kpi
          icone={Hammer}
          label="Danos este mês"
          cor="bg-orange-500"
          href="/ferramentaria/danos"
          valor={stats ? String(stats.danosMes) : <Rodar />}
          sub={
            stats
              ? stats.custoDanosMes > 0
                ? `Custo: ${fmtMTn(stats.custoDanosMes)}`
                : "Sem custos registados"
              : undefined
          }
        />
        <Kpi
          icone={PackageCheck}
          label="Total disponível"
          cor="bg-emerald-600"
          href="/ferramentaria/inventario"
          valor={stats ? String(stats.disponiveis) : <Rodar />}
          sub={stats ? `de ${stats.totalFerramentas} no inventário` : undefined}
        />
      </section>

      {/* Gráficos */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="card-sombra">
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-bold">Top 5: mais emprestadas</h2>
            {stats ? (
              <Barras dados={stats.topEmprestadas} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">A processar...</p>
            )}
          </CardContent>
        </Card>
        <Card className="card-sombra">
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-bold">Top 5: colaboradores com mais danos</h2>
            {stats ? (
              <Barras dados={stats.topDanos} corClasse="bg-red-500" />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">A processar...</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Ferramentas fora */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Ferramentas fora agora</h2>
            <Link
              href="/ferramentaria/emprestimos"
              className="text-xs font-semibold text-primario hover:underline"
            >
              Ver empréstimos
            </Link>
          </div>
          {!stats ? (
            <p className="py-4 text-center text-sm text-muted-foreground">A carregar...</p>
          ) : stats.fora.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma ferramenta emprestada neste momento.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Código</th>
                    <th className="py-2 pr-3 font-medium">Ferramenta</th>
                    <th className="py-2 pr-3 font-medium">Quem levou</th>
                    <th className="py-2 pr-3 font-medium">Departamento</th>
                    <th className="py-2 pr-3 font-medium">Há quanto</th>
                    <th className="py-2 pr-3 font-medium">Prazo</th>
                    <th className="py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.fora.map((m) => {
                    const atrasada = estaAtrasada(m.prazo_devolucao, dados!.hoje);
                    const dias = diasFora(m.data_saida, dados!.hoje);
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-semibold">{m.code || "-"}</td>
                        <td className="py-2 pr-3">{m.nome || "-"}</td>
                        <td className="py-2 pr-3">{m.colaborador || "-"}</td>
                        <td className="py-2 pr-3">{m.departamento || "-"}</td>
                        <td className={`py-2 pr-3 ${atrasada ? "font-bold text-red-600 dark:text-red-400" : ""}`}>
                          {fmtDias(dias)}
                        </td>
                        <td className="py-2 pr-3">{m.prazo_devolucao || "-"}</td>
                        <td className="py-2">
                          <Etiqueta
                            cor={
                              atrasada
                                ? "bg-red-600 text-white"
                                : "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                            }
                          >
                            {atrasada ? "ATRASADA" : "NO PRAZO"}
                          </Etiqueta>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Últimas devoluções com problema */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-bold">Últimas devoluções com problema</h2>
          {problemas.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhuma devolução com problema registada recentemente.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Código</th>
                    <th className="py-2 pr-3 font-medium">Ferramenta</th>
                    <th className="py-2 pr-3 font-medium">Quem devolveu</th>
                    <th className="py-2 pr-3 font-medium">Estado ao voltar</th>
                    <th className="py-2 pr-3 font-medium">Recebido por</th>
                    <th className="py-2 font-medium">Devolução</th>
                  </tr>
                </thead>
                <tbody>
                  {problemas.map((m) => (
                    <tr key={m.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-semibold">{m.code || "-"}</td>
                      <td className="py-2 pr-3">{m.nome || "-"}</td>
                      <td className="py-2 pr-3">{m.colaborador || "-"}</td>
                      <td className="py-2 pr-3">
                        <Etiqueta cor={corEstadoVoltar(m.estado_ao_voltar)}>
                          {(m.estado_ao_voltar || "-").toUpperCase()}
                        </Etiqueta>
                      </td>
                      <td className="py-2 pr-3">{m.recebido_por || "-"}</td>
                      <td className="py-2">{(m.data_devolucao || "").slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
