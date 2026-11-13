/**
 * /ferramentaria/danos (cliente).
 *
 * Avançar estado segue a fila oficial (reportado -> em reparo ->
 * reparado); inutilizar fecha e mata a ferramenta. Ambas com
 * confirmação e ambas decididas no servidor, que também sincroniza o
 * inventário (a reparação devolve a ferramenta a "bom").
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Ban, LoaderCircle } from "lucide-react";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Card, CardContent } from "@/components/ui/card";
import {
  corSeveridade,
  corStatusDano,
  fmtMTn,
  proximoStatusDano,
  SEVERIDADES,
  STATUS_DANO,
  type DanoVisao
} from "@/lib/ferramentaria";

export function DanosClient() {
  const [danos, setDanos] = useState<DanoVisao[] | null>(null);
  const [falha, setFalha] = useState("");

  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [severidade, setSeveridade] = useState("");
  const [status, setStatus] = useState("");
  const [aAvancar, setAAvancar] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    pedir<{ danos: DanoVisao[] }>("/api/ferramentaria/danos")
      .then((d) => {
        if (vivo) setDanos(d.danos);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const filtrados = useMemo(() => {
    if (!danos) return [];
    return danos.filter((d) => {
      const data = (d.created_at || "").slice(0, 10);
      if (de && data && data < de) return false;
      if (ate && data && data > ate) return false;
      if (severidade && (d.severidade || "").toLowerCase() !== severidade) return false;
      if (status && (d.status || "").toLowerCase() !== status) return false;
      return true;
    });
  }, [danos, de, ate, severidade, status]);

  const resumo = useMemo(() => {
    const custo = filtrados.reduce((s, d) => s + (Number(d.custo_reparacao) || 0), 0);
    const conta = new Map<string, number>();
    for (const d of filtrados) {
      const pessoa = d.colaborador || d.responsavel;
      if (!pessoa) continue;
      conta.set(pessoa, (conta.get(pessoa) || 0) + 1);
    }
    let pior = "-";
    let max = 0;
    for (const [pessoa, n] of conta.entries()) {
      if (n > max) {
        max = n;
        pior = `${pessoa} (${n}x)`;
      }
    }
    return { custo, pior };
  }, [filtrados]);

  async function avancar(d: DanoVisao) {
    const novo = proximoStatusDano(d.status);
    if (!novo) return;
    if (!window.confirm(`O estado será atualizado para: ${novo.toUpperCase()}. Continuar?`)) return;
    setAAvancar(d.id);
    try {
      await enviar(
        `/api/ferramentaria/danos?id=${encodeURIComponent(d.id)}`,
        { accao: "avancar" },
        "Estado actualizado.",
        "PATCH"
      );
      const ref = await pedir<{ danos: DanoVisao[] }>("/api/ferramentaria/danos");
      setDanos(ref.danos);
    } catch {
      // toast veio do enviar
    } finally {
      setAAvancar(null);
    }
  }

  async function inutilizar(d: DanoVisao) {
    if (
      !window.confirm(
        "Atenção: dar a ferramenta como INUTILIZADA e fechar este registo de dano? A ferramenta deixa de contar no inventário."
      )
    ) {
      return;
    }
    setAAvancar(d.id);
    try {
      await enviar(
        `/api/ferramentaria/danos?id=${encodeURIComponent(d.id)}`,
        { accao: "inutilizar" },
        "Registo marcado como inutilizado.",
        "PATCH"
      );
      const ref = await pedir<{ danos: DanoVisao[] }>("/api/ferramentaria/danos");
      setDanos(ref.danos);
    } catch {
      // toast veio do enviar
    } finally {
      setAAvancar(null);
    }
  }

  if (falha) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {falha}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo="Registo de Danos" subtitulo="Acompanhamento e gestão de danos nas ferramentas" />

      {/* Filtros */}
      <Card className="card-sombra">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4" data-filtros-danos>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-de">
              Período de
            </label>
            <input
              id="f-de"
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-ate">
              até
            </label>
            <input
              id="f-ate"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-sev">
              Severidade
            </label>
            <select
              id="f-sev"
              value={severidade}
              onChange={(e) => setSeveridade(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
            >
              <option value="">Todas</option>
              {SEVERIDADES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-status">
              Status
            </label>
            <select
              id="f-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
            >
              <option value="">Todos</option>
              {STATUS_DANO.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Lista de danos registados</h2>
            <span className="rounded-full bg-red-600/10 px-3 py-1 text-xs font-bold text-red-700 dark:text-red-300" data-count-danos>
              {filtrados.length}
            </span>
          </div>
          {!danos ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <LoaderCircle className="mr-1 inline size-4 animate-spin" /> A carregar registo de danos...
            </p>
          ) : filtrados.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum dano registado com os critérios seleccionados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Código</th>
                    <th className="py-2 pr-3 font-medium">Ferramenta</th>
                    <th className="py-2 pr-3 font-medium">Responsável</th>
                    <th className="py-2 pr-3 font-medium">Tipo de dano</th>
                    <th className="py-2 pr-3 font-medium">Severidade</th>
                    <th className="py-2 pr-3 font-medium">Custo</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Data</th>
                    <th className="py-2 font-medium">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((d) => {
                    const podeAvancar = d.status === "reportado" || d.status === "em reparo";
                    const podeInutilizar = d.status !== "inutilizado" && d.status !== "reparado";
                    return (
                      <tr key={d.id} className="border-b last:border-0" data-linha-dano={d.code || ""}>
                        <td className="py-2 pr-3 font-semibold">{d.code || "-"}</td>
                        <td className="py-2 pr-3">{d.nome || "-"}</td>
                        <td className="py-2 pr-3">{d.colaborador || d.responsavel || "-"}</td>
                        <td className="py-2 pr-3">{d.tipo_dano || d.estado_reportado || "-"}</td>
                        <td className="py-2 pr-3">
                          <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${corSeveridade(d.severidade)}`}>
                            {d.severidade || "-"}
                          </span>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {d.custo_reparacao ? fmtMTn(Number(d.custo_reparacao)) : "-"}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${corStatusDano(d.status)}`}>
                            {d.status || "-"}
                          </span>
                        </td>
                        <td className="py-2 pr-3">{(d.created_at || "").slice(0, 10)}</td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            {podeAvancar && (
                              <button
                                type="button"
                                onClick={() => avancar(d)}
                                disabled={aAvancar === d.id}
                                data-acao="avancar"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-primario hover:underline disabled:opacity-50"
                              >
                                {aAvancar === d.id ? (
                                  <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                                ) : (
                                  <ArrowRight className="size-3.5" aria-hidden />
                                )}
                                Avançar estado
                              </button>
                            )}
                            {podeInutilizar && (
                              <button
                                type="button"
                                onClick={() => inutilizar(d)}
                                disabled={aAvancar === d.id}
                                data-acao="inutilizar"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                              >
                                <Ban className="size-3.5" aria-hidden />
                                Inutilizar
                              </button>
                            )}
                            {!podeAvancar && !podeInutilizar && (
                              <span className="text-muted-foreground text-xs">Fechado</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Resumo */}
          {filtrados.length > 0 && (
            <div className="mt-5 grid gap-3 sm:grid-cols-3" data-resumo-danos>
              <div className="rounded-md border p-4 text-center">
                <p className="text-muted-foreground text-xs font-semibold">Total de incidentes</p>
                <p className="text-2xl font-bold">{filtrados.length}</p>
              </div>
              <div className="rounded-md border p-4 text-center">
                <p className="text-muted-foreground text-xs font-semibold">Custo total de reparação</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-300">{fmtMTn(resumo.custo)}</p>
              </div>
              <div className="rounded-md border p-4 text-center">
                <p className="text-muted-foreground text-xs font-semibold">Colaborador com mais danos</p>
                <p className="mt-2 text-sm font-bold">{resumo.pior}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
