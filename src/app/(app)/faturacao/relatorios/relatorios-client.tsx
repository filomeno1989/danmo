"use client";

/**
 * RelatoriosClient - Relatórios de Cotações e Faturas.
 *
 * Migração dos relatorios.html do hub (3 abas + filtros + KPIs), com o
 * mesmo discurso do Filomeno: data de referência manda, os botões de
 * período contam para trás a partir dela, e o clique numa linha das
 * abas agregadas foca os documentos dessa pessoa/cliente.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Etiqueta, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  fmtData,
  fmtNum,
  hojeISO,
  SERVICO_LABEL,
  textoSemTags,
  type ClienteFat,
  type DocFaturacao
} from "@/lib/faturacao";
import { exportarFaturacaoExcel } from "./exportar";

type Dados = { documentos: DocFaturacao[]; clientes: ClienteFat[] };

type Periodo = "hoje" | "semana" | "mes" | "tudo";
type Aba = "documentos" | "cliente" | "elaborado";
type Ordem = { chave: string; dir: "asc" | "desc" };

const rotuloPeriodo: Record<Periodo, string> = {
  hoje: "só este dia",
  semana: "1 semana",
  mes: "1 mês",
  tudo: "Tudo"
};

function dataLocal(s: string): Date {
  const p = String(s || "").split("-");
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function isoLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function RelatoriosClient() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [falha, setFalha] = useState("");

  const [dataRef, setDataRef] = useState(hojeISO());
  const [periodo, setPeriodo] = useState<Periodo>("tudo");
  const [fTipo, setFTipo] = useState("");
  const [fCliente, setFCliente] = useState("");
  const [fElaborado, setFElaborado] = useState("");
  const [fMoeda, setFMoeda] = useState("");
  const [busca, setBusca] = useState("");
  const [aba, setAba] = useState<Aba>("documentos");
  const [ordem, setOrdem] = useState<Ordem>({ chave: "data", dir: "desc" });
  const [foco, setFoco] = useState<{ campo: "cliente_nome" | "utilizador_nome"; valor: string } | null>(null);

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    pedir<Dados>("/api/faturacao/documentos")
      .then(setDados)
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    // Primeira carga sem setState sincrono no efeito (regra react-hooks)
    let vivo = true;
    pedir<Dados>("/api/faturacao/documentos")
      .then((d) => {
        if (vivo) setDados(d);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Período: conta para trás a partir da data pedida */
  const intervalo = useMemo<{ de: string | null; ate: string | null }>(() => {
    if (periodo === "tudo" || !dataRef) return { de: null, ate: null };
    const d = dataLocal(dataRef);
    let ini = d;
    if (periodo === "semana") ini = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
    if (periodo === "mes") ini = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate());
    return { de: isoLocal(ini), ate: isoLocal(d) };
  }, [periodo, dataRef]);

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const elaborados = useMemo(
    () =>
      [...new Set((dados?.documentos || []).map((d) => d.utilizador_nome || "").filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, "pt")),
    [dados]
  );

  const lista = useMemo(() => {
    let docs = dados?.documentos || [];
    if (intervalo.de) docs = docs.filter((d) => d.data >= intervalo.de! && d.data <= intervalo.ate!);
    if (fTipo) docs = docs.filter((d) => d.tipo === fTipo);
    if (fCliente) docs = docs.filter((d) => (d.cliente_nome || "") === fCliente);
    if (fElaborado) docs = docs.filter((d) => (d.utilizador_nome || "") === fElaborado);
    if (fMoeda) docs = docs.filter((d) => d.moeda === fMoeda);
    if (foco) docs = docs.filter((d) => (d[foco.campo] || "") === foco.valor);
    const q = norm(busca.trim());
    if (q) {
      docs = docs.filter((d) =>
        [d.numero, d.cliente_nome, textoSemTags(d.assunto || ""), d.utilizador_nome]
          .map((x) => norm(String(x || "")))
          .join(" ")
          .includes(q)
      );
    }
    return docs;
  }, [dados, intervalo, fTipo, fCliente, fElaborado, fMoeda, foco, busca]);

  const kpis = useMemo(() => {
    const totalMzn = lista.reduce((s, d) => s + (Number(d.total_mzn) || 0), 0);
    return {
      docs: lista.length,
      cot: lista.filter((d) => d.tipo === "cotacao").length,
      fat: lista.filter((d) => d.tipo === "fatura").length,
      mzn: totalMzn
    };
  }, [lista]);

  const ordenados = useMemo(() => {
    const dir = ordem.dir === "asc" ? 1 : -1;
    return [...lista].sort((a, b) => {
      const k = ordem.chave as keyof DocFaturacao;
      if (["total", "total_mzn", "subtotal"].includes(ordem.chave)) {
        return ((Number(a[k]) || 0) - (Number(b[k]) || 0)) * dir;
      }
      return String(a[k] || "").localeCompare(String(b[k] || ""), "pt") * dir;
    });
  }, [lista, ordem]);

  const agregado = useMemo(() => {
    const campo: "cliente_nome" | "utilizador_nome" = aba === "cliente" ? "cliente_nome" : "utilizador_nome";
    const mapa = new Map<string, { docs: number; cot: number; fat: number; mzn: number }>();
    for (const d of lista) {
      const chave = String(d[campo] || "-");
      const atual = mapa.get(chave) || { docs: 0, cot: 0, fat: 0, mzn: 0 };
      atual.docs += 1;
      if (d.tipo === "cotacao") atual.cot += 1;
      else atual.fat += 1;
      atual.mzn += Number(d.total_mzn) || 0;
      mapa.set(chave, atual);
    }
    const totalGeral = lista.reduce((s, d) => s + (Number(d.total_mzn) || 0), 0);
    return {
      campo,
      linhas: [...mapa.entries()]
        .map(([nome, v]) => ({ nome, ...v, pct: totalGeral > 0 ? (v.mzn / totalGeral) * 100 : 0 }))
        .sort((a, b) => b.mzn - a.mzn),
      totalGeral
    };
  }, [lista, aba]);

  const exportar = async () => {
    if (!lista.length) {
      toast.error("Sem dados para exportar com estes filtros.");
      return;
    }
    const descFiltros = [
      intervalo.de ? `Período ${fmtData(intervalo.de)} a ${fmtData(intervalo.ate || "")}` : "Sem limite de período",
      fTipo ? `Tipo: ${fTipo === "cotacao" ? "Cotações" : "Faturas"}` : null,
      fCliente ? `Cliente: ${fCliente}` : null,
      fElaborado ? `Elaborado: ${fElaborado}` : null,
      fMoeda ? `Moeda: ${fMoeda}` : null
    ]
      .filter(Boolean)
      .join(" | ");

    const docsLinhas = ordenados.map((d) => [
      d.numero,
      d.tipo === "fatura" ? "Fatura" : "Cotação",
      fmtData(d.data),
      d.cliente_nome || "",
      textoSemTags(d.assunto || "").slice(0, 120),
      SERVICO_LABEL[d.servico] || d.servico,
      d.moeda,
      Number(d.total.toFixed ? d.total.toFixed(2) : d.total),
      Number((d.total_mzn || 0).toFixed(2)),
      d.utilizador_nome || ""
    ]);
    const cliLinhas = agregado.linhas.map((l) => [
      l.nome,
      l.docs,
      l.cot,
      l.fat,
      Number(l.mzn.toFixed(2)),
      Number(l.pct.toFixed(1))
    ]);

    try {
      await exportarFaturacaoExcel(
        "Relatorio de Faturacao",
        descFiltros || "Sem filtros",
        [
          {
            nome: "Documentos",
            cabecalhos: ["Nº", "Tipo", "Data", "Cliente", "Assunto", "Serviço", "Moeda", "Total moeda", "Total MZN", "Elaborado por"],
            linhas: docsLinhas,
            colunasDireita: [7, 8]
          },
          {
            nome: "Por Cliente",
            cabecalhos: ["Cliente", "Documentos", "Cotações", "Faturas", "Total MZN", "% do Total"],
            linhas: cliLinhas,
            colunasDireita: [1, 2, 3, 4, 5]
          }
        ]
      );
      toast.success("Excel exportado.");
    } catch {
      toast.error("Falha ao gerar o Excel.");
    }
  };

  const clicarOrdenar = (chave: string) =>
    setOrdem((o) => (o.chave === chave ? { chave, dir: o.dir === "desc" ? "asc" : "desc" } : { chave, dir: "desc" }));

  const seta = (chave: string) => (ordem.chave === chave ? (ordem.dir === "desc" ? " ↓" : " ↑") : "");

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Faturação - Relatórios"
        subtitulo="Documentos, totais por cliente e por elaborador. Os filtros combinam entre si."
      >
        <Button variant="outline" onClick={exportar}>
          <Download className="size-4" aria-hidden /> Exportar Excel
        </Button>
      </Cabeca>

      {/* Filtros */}
      <Card className="card-sombra py-4">
        <CardContent className="space-y-3 px-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <p className="mb-1 text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground">
                Data de referência
              </p>
              <Input type="date" value={dataRef} onChange={(e) => setDataRef(e.target.value)} className="w-40" />
            </div>
            <div className="flex gap-1.5">
              {(Object.keys(rotuloPeriodo) as Periodo[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriodo(p)}
                  className={cn(
                    "rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors",
                    periodo === p
                      ? "border-ambar-texto bg-ambar-texto text-white dark:bg-amber-500 dark:text-black"
                      : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  {rotuloPeriodo[p]}
                </button>
              ))}
            </div>
            <p className="text-xs italic text-muted-foreground">
              {intervalo.de
                ? `Período: ${fmtData(intervalo.de)} a ${fmtData(intervalo.ate || "")}`
                : "Sem limite de período (tudo)."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={fTipo}
              onChange={(e) => setFTipo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Tipo"
            >
              <option value="">Todos os tipos</option>
              <option value="cotacao">Cotações</option>
              <option value="fatura">Faturas</option>
            </select>
            <select
              value={fCliente}
              onChange={(e) => setFCliente(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Cliente"
            >
              <option value="">Todos os clientes</option>
              {(dados?.clientes || []).map((c) => (
                <option key={c.id} value={c.nome}>{c.nome}</option>
              ))}
            </select>
            <select
              value={fElaborado}
              onChange={(e) => setFElaborado(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Elaborado por"
            >
              <option value="">Todos os elaboradores</option>
              {elaborados.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <select
              value={fMoeda}
              onChange={(e) => setFMoeda(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              aria-label="Moeda"
            >
              <option value="">Todas as moedas</option>
              <option value="MZN">MZN</option>
              <option value="USD">USD</option>
            </select>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nº, cliente, assunto..."
              className="min-w-[200px] flex-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* KPIs */}
      <section className="grid gap-3 sm:grid-cols-4">
        <Kpi valor={String(kpis.docs)} rotulo="Documentos" />
        <Kpi valor={String(kpis.cot)} rotulo="Cotações" />
        <Kpi valor={String(kpis.fat)} rotulo="Faturas" />
        <Kpi valor={fmtNum(kpis.mzn)} rotulo="Total Geral (MZN equiv.)" />
      </section>

      {/* Abas */}
      <div className="flex gap-1.5">
        {(
          [
            { k: "documentos", t: "Documentos" },
            { k: "cliente", t: "Por Cliente" },
            { k: "elaborado", t: "Por Elaborador" }
          ] as { k: Aba; t: string }[]
        ).map((x) => (
          <button
            key={x.k}
            type="button"
            onClick={() => {
              setAba(x.k);
              setFoco(null);
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors",
              aba === x.k ? "bg-ambar-texto text-white dark:bg-amber-500 dark:text-black" : "bg-muted text-muted-foreground hover:bg-muted/70"
            )}
          >
            {x.t}
          </button>
        ))}
      </div>

      <Card className="card-sombra py-4">
        <CardContent className="px-2 sm:px-4">
          {aCarregar ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar relatórios...
            </div>
          ) : falha ? (
            <div className="py-12 text-center text-sm text-destructive">{falha}</div>
          ) : aba === "documentos" ? (
            lista.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Nenhum documento com estes filtros.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                      <th className="cursor-pointer px-3 py-2" onClick={() => clicarOrdenar("numero")}>Nº{seta("numero")}</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="cursor-pointer px-3 py-2" onClick={() => clicarOrdenar("data")}>Data{seta("data")}</th>
                      <th className="cursor-pointer px-3 py-2" onClick={() => clicarOrdenar("cliente_nome")}>Cliente{seta("cliente_nome")}</th>
                      <th className="px-3 py-2">Assunto</th>
                      <th className="px-3 py-2">Serviço</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="cursor-pointer px-3 py-2 text-right" onClick={() => clicarOrdenar("total_mzn")}>Total MZN{seta("total_mzn")}</th>
                      <th className="px-3 py-2">Elaborado por</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ordenados.map((d) => (
                      <tr key={d.id} className="border-b border-border/60 hover:bg-muted/40">
                        <td className="px-3 py-2.5 font-mono font-bold text-ambar-texto dark:text-amber-400">{d.numero}</td>
                        <td className="px-3 py-2.5">
                          <Etiqueta cor={d.tipo === "fatura" ? "bg-blue-500/12 text-blue-600 dark:text-blue-300" : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"}>
                            {d.tipo === "fatura" ? "Fatura" : "Cotação"}
                          </Etiqueta>
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">{fmtData(d.data)}</td>
                        <td className="px-3 py-2.5 font-semibold">{d.cliente_nome || "-"}</td>
                        <td className="max-w-[220px] px-3 py-2.5">
                          <div className="truncate text-xs text-muted-foreground">{textoSemTags(d.assunto || "")}</div>
                        </td>
                        <td className="px-3 py-2.5 text-xs">{SERVICO_LABEL[d.servico] || d.servico}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtNum(d.total)} {d.moeda}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-xs">{fmtNum(d.total_mzn)}</td>
                        <td className="px-3 py-2.5 text-xs">{d.utilizador_nome || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="px-3 py-2" colSpan={7}>Total geral</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtNum(kpis.mzn)}</td>
                      <td className="px-3 py-2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )
          ) : (
            <>
              <p className="px-3 pb-2 text-xs text-muted-foreground">
                Clique numa linha para ver só os documentos {aba === "cliente" ? "desse cliente" : "dessa pessoa"}.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2">{aba === "cliente" ? "Cliente" : "Elaborado por"}</th>
                      <th className="px-3 py-2 text-right">Documentos</th>
                      <th className="px-3 py-2 text-right">Cotações</th>
                      <th className="px-3 py-2 text-right">Faturas</th>
                      <th className="px-3 py-2 text-right">Total MZN</th>
                      <th className="px-3 py-2 text-right">% do Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agregado.linhas.map((l) => (
                      <tr
                        key={l.nome}
                        onClick={() =>
                          setFoco(
                            foco?.valor === l.nome
                              ? null
                              : { campo: agregado.campo, valor: l.nome }
                          )
                        }
                        className={cn(
                          "cursor-pointer border-b border-border/60 hover:bg-muted/40",
                          foco?.valor === l.nome && "bg-ambar-claro/60"
                        )}
                      >
                        <td className="px-3 py-2.5 font-semibold">{l.nome}</td>
                        <td className="px-3 py-2.5 text-right">{l.docs}</td>
                        <td className="px-3 py-2.5 text-right">{l.cot}</td>
                        <td className="px-3 py-2.5 text-right">{l.fat}</td>
                        <td className="px-3 py-2.5 text-right font-mono">{fmtNum(l.mzn)}</td>
                        <td className="px-3 py-2.5 text-right">{l.pct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="px-3 py-2">Total geral</td>
                      <td className="px-3 py-2 text-right">{kpis.docs}</td>
                      <td className="px-3 py-2 text-right">{kpis.cot}</td>
                      <td className="px-3 py-2 text-right">{kpis.fat}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmtNum(kpis.mzn)}</td>
                      <td className="px-3 py-2 text-right">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ valor, rotulo }: { valor: string; rotulo: string }) {
  return (
    <Card className="card-sombra py-3">
      <CardContent className="px-4">
        <div className="text-xl font-bold">{valor}</div>
        <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
      </CardContent>
    </Card>
  );
}
