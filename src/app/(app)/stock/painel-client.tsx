"use client";

/**
 * Painel do Stock: KPIs, alertas de mínimo, gráfico dos 6 meses e as
 * últimas entradas e saídas. Todos os números vêm do servidor
 * (/api/stock/painel), calculados dos movimentos confirmados.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { Cabeca, Etiqueta, Rodar, pedir } from "@/components/oficina/ui-bits";
import { COR_POSICAO, fmtMzn, fmtData, rotuloMaterial } from "@/lib/stock";
import type { Material, MovimentoStock } from "@/lib/stock";

type AlertaLinha = {
  id: string;
  referencia: string;
  nome: string;
  unidade: string;
  stock: number;
  minimo: number;
  estado: string;
};

type PainelDados = {
  ok: boolean;
  kpis: {
    materiais: number;
    entradasMes: number;
    saidasMes: number;
    alertas: number;
    esgotados: number;
    comprasMes: number;
  };
  serie: { chave: string; label: string; entradas: number; saidas: number; mzn: number }[];
  alertas: AlertaLinha[];
  ultimasEntradas: MovimentoStock[];
  ultimasSaidas: MovimentoStock[];
  materiais: Material[];
};

function Kpi({
  label,
  valor,
  cor,
  destaque
}: {
  label: string;
  valor: string | number;
  cor?: string;
  destaque?: boolean;
}) {
  return (
    <div className={`card-sombra p-4${destaque ? " border border-primario/40" : ""}`}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${cor || ""}`}>{valor}</div>
    </div>
  );
}

export function StockPainelClient({ podeCriar }: { podeCriar: boolean; podeEditar: boolean }) {
  const [dados, setDados] = useState<PainelDados | null>(null);
  const [falha, setFalha] = useState("");
  const [aCarregar, setACarregar] = useState(false);

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    pedir<PainelDados>("/api/stock/painel")
      .then(setDados)
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    // Primeira carga sem setState sincrono no efeito (regra react-hooks)
    let vivo = true;
    pedir<PainelDados>("/api/stock/painel")
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
  }, []);

  const mapaMat = new Map((dados?.materiais || []).map((m) => [m.id, m]));
  const maxBarra = Math.max(1, ...(dados?.serie || []).map((s) => Math.max(s.entradas, s.saidas)));

  return (
    <div className="space-y-4">
      <Cabeca
        titulo="Stock - Painel"
        subtitulo="Posição actual, alertas de mínimo e movimento dos últimos 6 meses"
      >
        <button
          onClick={carregar}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
        >
          {aCarregar ? <Rodar className="size-4" /> : <RefreshCw className="size-4" />}
          Actualizar
        </button>
        {podeCriar && (
          <Link
            href="/stock/entradas"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte"
          >
            Registar Entrada
            <ArrowRight className="size-4" />
          </Link>
        )}
      </Cabeca>

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}

      {!dados && !falha && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar o painel...
        </div>
      )}

      {dados && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Kpi label="Materiais" valor={dados.kpis.materiais} />
            <Kpi label="Entradas do mês" valor={dados.kpis.entradasMes} cor="text-sucesso" />
            <Kpi label="Saídas do mês" valor={dados.kpis.saidasMes} cor="text-erro" />
            <Kpi label="Alertas de mínimo" valor={dados.kpis.alertas} cor={dados.kpis.alertas ? "text-ambar-texto" : ""} />
            <Kpi label="Esgotados" valor={dados.kpis.esgotados} cor={dados.kpis.esgotados ? "text-erro" : ""} />
            <Kpi label="Compras do mês" valor={fmtMzn(dados.kpis.comprasMes)} />
          </div>

          {dados.alertas.length > 0 && (
            <div className="card-sombra p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle className="size-4 text-ambar-texto" />
                Alertas de stock mínimo ({dados.alertas.length})
              </div>
              <div className="divide-y">
                {dados.alertas.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Etiqueta cor={COR_POSICAO[a.estado as keyof typeof COR_POSICAO] || "bg-muted text-muted-foreground"}>
                      {a.estado}
                    </Etiqueta>
                    <span className="font-semibold">{a.referencia} - {a.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      Stock: {a.stock} {a.unidade} · Mínimo: {a.minimo} {a.unidade}
                    </span>
                    {podeCriar && (
                      <Link href="/stock/entradas" className="ml-auto text-xs font-semibold text-primario hover:underline">
                        + Registar Entrada
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card-sombra p-4">
            <div className="mb-4 text-sm font-semibold">Entradas e saídas dos últimos 6 meses</div>
            <div className="flex items-end gap-4 overflow-x-auto pb-2">
              {dados.serie.map((s) => (
                <div key={s.chave} className="flex min-w-14 flex-1 flex-col items-center gap-1">
                  <div className="flex h-40 w-full items-end justify-center gap-1.5">
                    <div
                      className="w-5 rounded-t bg-sucesso"
                      style={{ height: `${Math.max(2, (s.entradas / maxBarra) * 100)}%` }}
                      title={`${s.entradas} entradas`}
                    />
                    <div
                      className="w-5 rounded-t bg-erro"
                      style={{ height: `${Math.max(2, (s.saidas / maxBarra) * 100)}%` }}
                      title={`${s.saidas} saídas`}
                    />
                  </div>
                  <div className="text-xs font-medium tabular-nums text-muted-foreground">{s.label}</div>
                  <div className="text-[0.65rem] tabular-nums text-muted-foreground">
                    <span className="text-sucesso">+{s.entradas}</span> <span className="text-erro">-{s.saidas}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-sucesso" /> Entradas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block size-2.5 rounded-sm bg-erro" /> Saídas
              </span>
              <span className="ml-auto">
                Compras dos 6 meses: {fmtMzn(dados.serie.reduce((t, s) => t + s.mzn, 0))}
              </span>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="card-sombra p-4">
              <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                <span>Últimas entradas</span>
                <Link href="/stock/entradas" className="text-xs font-semibold text-primario hover:underline">
                  Ver todas
                </Link>
              </div>
              <div className="divide-y text-sm">
                {dados.ultimasEntradas.length === 0 && (
                  <div className="py-3 text-muted-foreground">Sem entradas confirmadas.</div>
                )}
                {dados.ultimasEntradas.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 py-1.5">
                    <span className="w-20 shrink-0 tabular-nums text-xs text-muted-foreground">{fmtData(m.data_movimento)}</span>
                    <span className="truncate">{rotuloMaterial(mapaMat.get(m.material_id))}</span>
                    <span className="ml-auto shrink-0 font-semibold tabular-nums text-sucesso">
                      +{Number(m.quantidade)} {mapaMat.get(m.material_id)?.unidade || ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card-sombra p-4">
              <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                <span>Últimas saídas</span>
                <Link href="/stock/saidas" className="text-xs font-semibold text-primario hover:underline">
                  Ver todas
                </Link>
              </div>
              <div className="divide-y text-sm">
                {dados.ultimasSaidas.length === 0 && (
                  <div className="py-3 text-muted-foreground">Sem saídas confirmadas.</div>
                )}
                {dados.ultimasSaidas.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 py-1.5">
                    <span className="w-20 shrink-0 tabular-nums text-xs text-muted-foreground">{fmtData(m.data_movimento)}</span>
                    <span className="truncate">{rotuloMaterial(mapaMat.get(m.material_id))}</span>
                    <span className="ml-auto shrink-0 font-semibold tabular-nums text-erro">
                      -{Number(m.quantidade)} {mapaMat.get(m.material_id)?.unidade || ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
