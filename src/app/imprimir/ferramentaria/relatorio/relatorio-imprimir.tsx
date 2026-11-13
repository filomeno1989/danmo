"use client";

/**
 * Papel A4 do Relatório de Movimentação da Ferramentaria (cliente).
 * O cálculo vem da lib (statsRelatorio): o papel mostra o mesmo juiz
 * do ecrã e das provas.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pedir } from "@/components/oficina/ui-bits";
import {
  diasFora,
  fmtDias,
  fmtMTn,
  hojeFerr,
  statsRelatorio,
  type DanoVisao,
  type Ferramenta,
  type MovimentoVisao
} from "@/lib/ferramentaria";
import { BotaoImprimirFerr } from "../botao-imprimir";

type Props = { de: string; ate: string };

/** YYYY-MM-DD -> DD/MM/YYYY (papel, sem fuso). */
function fmtData(iso: string): string {
  if (!iso || iso.length < 10) return iso || "-";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

export function RelatorioImprimir({ de, ate }: Props) {
  const [movimentos, setMovimentos] = useState<MovimentoVisao[] | null>(null);
  const [ferramentas, setFerramentas] = useState<Ferramenta[] | null>(null);
  const [danos, setDanos] = useState<DanoVisao[] | null>(null);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<{ movimentos: MovimentoVisao[] }>(`/api/ferramentaria/movimentos${de ? `?de=${de}` : ""}${ate ? `${de ? "&" : "?"}ate=${ate}` : ""}`),
      pedir<{ ferramentas: Ferramenta[] }>("/api/ferramentaria/ferramentas"),
      pedir<{ danos: DanoVisao[] }>("/api/ferramentaria/danos")
    ])
      .then(([m, f, d]) => {
        if (!vivo) return;
        setMovimentos(m.movimentos || []);
        setFerramentas(f.ferramentas || []);
        setDanos(d.danos || []);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [de, ate]);

  const stats = useMemo(() => {
    if (!movimentos || !ferramentas || !danos) return null;
    const hoje = hojeFerr();
    const de2 = de || "0000-01-01";
    const ate2 = ate || "9999-12-31";
    return statsRelatorio(movimentos, ferramentas, danos, de2, ate2);
  }, [movimentos, ferramentas, danos, de, ate]);

  if (falha) {
    return (
      <div className="p-10 text-center text-sm text-destructive">
        {falha}
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/ferramentaria/relatorios">Voltar aos Relatórios</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (!stats) {
    return <div className="p-10 text-center text-sm text-muted-foreground">A processar dados do relatório...</div>;
  }

  const hoje = hojeFerr();
  const volta = "/ferramentaria/relatorios";

  return (
    <div className="min-h-screen bg-slate-100 text-black">
      <div className="mx-auto bg-white" style={{ maxWidth: "210mm", padding: "15mm" }} data-papel-ferramentaria>
        <BotaoImprimirFerr deVolta={volta} />

        <header className="flex items-start justify-between border-b-4 border-slate-900 pb-3" style={{ printColorAdjust: "exact" }}>
          <img src="/logos/DANMO.png" alt="DANMO" className="h-11" />
          <div className="text-center">
            <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Relatório Ferramentaria</p>
            <p className="text-sm font-bold">DANMO SERVICE SYSTEM, LDA</p>
            <p className="text-[0.65rem] text-slate-500">Porto da Beira, Moçambique</p>
          </div>
          <img src="/logos/MMM.png" alt="Made in Mozambique" className="h-9" />
        </header>

        <h1 className="mt-4 rounded border border-slate-300 bg-slate-100 py-2 text-center text-base font-black">
          Relatório de Movimentação da Ferramentaria
        </h1>
        <p className="mt-1 text-center text-[0.72rem] text-slate-600">
          Período: {de ? fmtData(de) : "início"} a {ate ? fmtData(ate) : "hoje"}
        </p>

        {/* 1. Movimentação geral */}
        <section className="mt-4">
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
            Movimentação Geral
          </h2>
          <table className="w-full border-collapse text-[0.78rem]" data-papel-indicadores>
            <tbody>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5">Total de empréstimos no período</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-bold">{stats.totalEmprestimos}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5">Devoluções no período</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-bold">{stats.totalDevolucoes}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5">Taxa de devolução no prazo</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-bold">{stats.taxaNoPrazo}%</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5">Taxa de atraso</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-red-700">{stats.taxaAtraso}%</td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 2. Ferramentas mais emprestadas */}
        {stats.topFerramentas.length > 0 && (
          <section className="mt-4">
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
              Ferramentas Mais Emprestadas
            </h2>
            <table className="w-full border-collapse text-[0.72rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">Código</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Ferramenta</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Vezes</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Último empréstimo</th>
                </tr>
              </thead>
              <tbody>
                {stats.topFerramentas.map((t) => (
                  <tr key={t.code}>
                    <td className="border border-slate-300 px-2 py-1 font-semibold">{t.code}</td>
                    <td className="border border-slate-300 px-2 py-1">{t.nome}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-bold">{t.count}</td>
                    <td className="border border-slate-300 px-2 py-1">{t.ultimo ? fmtData(t.ultimo.slice(0, 10)) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 3. Colaboradores com mais movimentações */}
        {stats.topColaboradores.length > 0 && (
          <section className="mt-4">
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
              Colaboradores com Mais Movimentações
            </h2>
            <table className="w-full border-collapse text-[0.72rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Departamento</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Empréstimos</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Atrasos</th>
                </tr>
              </thead>
              <tbody>
                {stats.topColaboradores.map((c) => (
                  <tr key={`${c.colaborador}-${c.departamento}`}>
                    <td className="border border-slate-300 px-2 py-1">{c.colaborador}</td>
                    <td className="border border-slate-300 px-2 py-1">{c.departamento}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-bold">{c.total}</td>
                    <td className={`border border-slate-300 px-2 py-1 text-center ${c.atrasadas > 0 ? "font-bold text-red-700" : ""}`}>
                      {c.atrasadas}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* 4. Mapa de danos */}
        <section className="mt-4">
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
            Mapa de Danos
          </h2>
          <table className="w-full border-collapse text-[0.78rem]">
            <tbody>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5">Incidentes no período</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-bold">{stats.danos.total}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5">Custo total de reparação</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-bold text-red-700">
                  {fmtMTn(stats.danos.custoTotal)}
                </td>
              </tr>
              <tr>
                <td className="border border-slate-300 px-2 py-1.5">Severidade (leves / moderados / graves)</td>
                <td className="border border-slate-300 px-2 py-1.5 text-right font-bold">
                  {stats.danos.leves} / {stats.danos.moderados} / {stats.danos.graves}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* 5. Na rua agora */}
        <section className="mt-4">
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
            Ferramentas Na Rua Agora ({stats.naRua.length})
          </h2>
          {stats.naRua.length === 0 ? (
            <p className="border border-slate-300 bg-slate-50 px-3 py-3 text-center text-[0.78rem] text-slate-600">
              Todas as ferramentas emprestadas já foram devolvidas.
            </p>
          ) : (
            <table className="w-full border-collapse text-[0.72rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">Código</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Ferramenta</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Quem levou</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Departamento</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Saída</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Tempo fora</th>
                </tr>
              </thead>
              <tbody>
                {stats.naRua.map((m) => (
                  <tr key={m.id}>
                    <td className="border border-slate-300 px-2 py-1 font-semibold">{m.code || "-"}</td>
                    <td className="border border-slate-300 px-2 py-1">{m.nome || "-"}</td>
                    <td className="border border-slate-300 px-2 py-1">{m.colaborador || "-"}</td>
                    <td className="border border-slate-300 px-2 py-1">{m.departamento || "-"}</td>
                    <td className="border border-slate-300 px-2 py-1">{m.data_saida ? fmtData(m.data_saida.slice(0, 10)) : "-"}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center">
                      {fmtDias(diasFora(m.data_saida, hoje))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* 6. Estado do inventário */}
        <section className="mt-4">
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
            Estado Atual do Inventário
          </h2>
          <table className="w-full border-collapse text-[0.72rem]">
            <thead>
              <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                <th className="border border-slate-900 px-2 py-1 text-left">Estado</th>
                <th className="border border-slate-900 px-2 py-1 text-center">Ferramentas</th>
              </tr>
            </thead>
            <tbody>
              {stats.inventario.map((i) => (
                <tr key={i.estado}>
                  <td className="border border-slate-300 px-2 py-1 uppercase">{i.estado}</td>
                  <td className="border border-slate-300 px-2 py-1 text-center font-bold">{i.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="mt-6 grid grid-cols-2 gap-6 text-[0.7rem]">
          <div className="border-t border-slate-400 pt-1 text-center">O Ferramenteiro Chefe</div>
          <div className="border-t border-slate-400 pt-1 text-center">Visto Direcção</div>
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-slate-300 pt-2 text-[0.62rem] text-slate-500">
          <span>DANMO SERVICE SYSTEM, LDA</span>
          <span>Documento gerado em {fmtData(hoje)}</span>
          <img src="/logos/MESQUITA.png" alt="Grupo Mesquita" className="h-5" />
        </footer>
      </div>
    </div>
  );
}
