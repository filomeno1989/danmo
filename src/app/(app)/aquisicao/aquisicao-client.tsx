/**
 * /aquisicao - Painel de Pedidos de Aquisição (cliente).
 *
 * Migração do dashboard.html do hub, com melhorias:
 * - pesquisa rápida sem acentos que também acha pelo Nº formatado
 *   (002/2026) e pelos materiais das linhas;
 * - o fornecedor mais usado mostra a contagem no cartão;
 * - gráficos de barras no mesmo desenho do hub (rows CSS, sem lib nova);
 * - pedidos recentes com ligações directas para o papel e para editar.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  ClipboardList,
  FileBox,
  LoaderCircle,
  Pencil,
  Printer,
  Search,
  Trophy
} from "lucide-react";
import { Cabeca, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  alvoPesquisaPedido,
  fmtDataAq,
  numeroFmt,
  semAcentos,
  statsPainel,
  type FornecedorAq,
  type PedidoAquisicao
} from "@/lib/aquisicao";

type Dados = { ok: boolean; pedidos: PedidoAquisicao[]; designacoesPorPedido: Record<string, string[]> };

function Kpi({
  icone: Icone,
  label,
  valor,
  sub,
  cor
}: {
  icone: typeof FileBox;
  label: React.ReactNode;
  valor: React.ReactNode;
  sub?: string;
  cor: string;
}) {
  return (
    <Card className="card-sombra">
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-white ${cor}`}>
            <Icone className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
            <div className="truncate text-xl font-bold">{valor}</div>
            {sub ? <div className="truncate text-[0.68rem] text-muted-foreground">{sub}</div> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Barras({ dados }: { dados: { label: string; count: number }[] }) {
  const max = Math.max(...dados.map((d) => d.count), 1);
  if (!dados.length || max === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem dados suficientes.</p>;
  }
  return (
    <div className="space-y-2.5">
      {dados.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <div className="w-24 shrink-0 truncate text-xs font-semibold text-muted-foreground" title={d.label}>
            {d.label}
          </div>
          <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
            <div className="h-full rounded bg-emerald-600 transition-all duration-700" style={{ width: `${(d.count / max) * 100}%` }} />
          </div>
          <div className="w-8 text-right text-xs font-bold">{d.count}</div>
        </div>
      ))}
    </div>
  );
}

export function AquisicaoClient() {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [fornecedores, setFornecedores] = useState<FornecedorAq[]>([]);
  const [falha, setFalha] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<Dados>("/api/aquisicao/pedidos"),
      pedir<{ ok: boolean; fornecedores: FornecedorAq[] }>("/api/aquisicao/fornecedores")
    ])
      .then(([p, f]) => {
        if (!vivo) return;
        setDados(p);
        setFornecedores(f.fornecedores || []);
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
  }, []);

  const stats = useMemo(
    () => statsPainel(dados?.pedidos || [], fornecedores.filter((f) => f.ativo).length, new Date().toISOString().slice(0, 10)),
    [dados, fornecedores]
  );

  const resultados = useMemo(() => {
    const pedidos = dados?.pedidos || [];
    const q = semAcentos(busca.trim());
    if (!q) return [];
    return pedidos
      .filter((p) => alvoPesquisaPedido(p, (dados?.designacoesPorPedido || {})[p.id] || []).includes(q))
      .slice(0, 8);
  }, [dados, busca]);

  const recentes = useMemo(() => {
    const pedidos = [...(dados?.pedidos || [])];
    pedidos.sort((a, b) => {
      const ka = `${b.ano}-${String(b.numero).padStart(6, "0")}`;
      const ka2 = `${a.ano}-${String(a.numero).padStart(6, "0")}`;
      return ka.localeCompare(ka2);
    });
    return pedidos.slice(0, 8);
  }, [dados]);

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Pedidos de Aquisição"
        subtitulo="Pedidos de aquisição de material da Administração, por denominação (Cotação, Pro-forma ou Venda a Dinheiro)"
      >
        <Button asChild className="bg-emerald-700 hover:bg-emerald-800">
          <Link href="/aquisicao/novo">
            <ClipboardList className="size-4" aria-hidden /> Novo Pedido
          </Link>
        </Button>
      </Cabeca>

      {falha ? (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{falha}</CardContent>
        </Card>
      ) : null}

      {aCarregar ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar pedidos...
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icone={FileBox}
              cor="bg-emerald-700"
              label={<>Pedidos em {stats.ano}</>}
              valor={stats.totalAno}
            />
            <Kpi icone={ClipboardList} cor="bg-blue-600" label="Pedidos este mês" valor={stats.totalMes} />
            <Kpi icone={Building2} cor="bg-amber-600" label="Fornecedores activos" valor={stats.fornecedoresAtivos} />
            <Kpi
              icone={Trophy}
              cor="bg-emerald-700"
              label="Fornecedor mais usado"
              valor={stats.topFornecedor || "-"}
              sub={stats.topFornecedor ? `${stats.topFornecedorQtd} pedido(s) no total` : undefined}
            />
          </div>

          <Card className="card-sombra">
            <CardContent className="p-4">
              <h2 className="mb-1 text-base font-bold">Pesquisa Rápida</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Procura por nº do pedido, fornecedor, solicitante ou material
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input
                    className="pl-9"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Ex: 002/2026, Carlos Ferreira, detergente..."
                    aria-label="Pesquisa rápida"
                  />
                </div>
                <Button asChild variant="outline">
                  <Link href="/aquisicao/historico">Ver Histórico Completo</Link>
                </Button>
              </div>
              {busca.trim() ? (
                <div className="mt-3 divide-y">
                  {resultados.length === 0 ? (
                    <p className="py-3 text-center text-sm text-muted-foreground">Nenhum resultado.</p>
                  ) : (
                    resultados.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-2 py-2">
                        <span className="min-w-0 truncate text-sm">
                          <b>{numeroFmt(p.ano, p.numero)}</b> · {p.fornecedor_nome || "-"} · {fmtDataAq(p.data_pedido)}
                        </span>
                        <a
                          className="shrink-0 text-sm font-semibold text-blue-600 hover:text-emerald-700 dark:text-blue-400"
                          href={`/imprimir/aquisicao/${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver
                        </a>
                      </div>
                    ))
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="card-sombra">
              <CardContent className="p-4">
                <h2 className="mb-3 text-base font-bold">Pedidos por Mês · {stats.ano}</h2>
                <Barras dados={stats.porMes} />
              </CardContent>
            </Card>
            <Card className="card-sombra">
              <CardContent className="p-4">
                <h2 className="mb-3 text-base font-bold">Top 5 Fornecedores Mais Usados</h2>
                {stats.topCinco.length ? (
                  <Barras dados={stats.topCinco} />
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">Sem dados suficientes.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="card-sombra">
            <CardContent className="p-4">
              <h2 className="mb-3 text-base font-bold">Pedidos Recentes</h2>
              {recentes.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Ainda não há pedidos registados.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="py-2 pr-3">Nº Pedido</th>
                        <th className="py-2 pr-3">Data</th>
                        <th className="py-2 pr-3">Fornecedor</th>
                        <th className="py-2 pr-3">Solicitante</th>
                        <th className="py-2">Acções</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentes.map((p) => (
                        <tr key={p.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-bold">{numeroFmt(p.ano, p.numero)}</td>
                          <td className="py-2 pr-3">{fmtDataAq(p.data_pedido)}</td>
                          <td className="py-2 pr-3">{p.fornecedor_nome || "-"}</td>
                          <td className="py-2 pr-3">{p.solicitante || "-"}</td>
                          <td className="py-2">
                            <a
                              className="mr-3 inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-emerald-700 dark:text-blue-400"
                              href={`/imprimir/aquisicao/${p.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <Printer className="size-3.5" aria-hidden /> Ver
                            </a>
                            <button
                              className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-emerald-700 dark:text-blue-400"
                              onClick={() => router.push(`/aquisicao/novo?id=${p.id}`)}
                            >
                              <Pencil className="size-3.5" aria-hidden /> Editar
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
