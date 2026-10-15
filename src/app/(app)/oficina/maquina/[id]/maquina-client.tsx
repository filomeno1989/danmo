"use client";

/**
 * MaquinaClient - Histórico completo de uma máquina (client).
 *
 * KPIs (obras, intervenções, horas, dias na oficina, peças), timeline
 * das obras, distribuição por estado físico, tabela de intervenções,
 * resumo de peças aplicadas, técnicos por horas e gráfico de horas por
 * mês (SVG simples, sem bibliotecas extra).
 *
 * Nota de estrutura: todos os cálculos e hooks ficam ANTES de qualquer
 * retorno condicional (regra dos hooks do React) e o "agora" é capturado
 * uma única vez, para não haver chamadas impuras durante o render.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileSpreadsheet, Printer, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Cabeca, EtiquetaFisico, Rodar } from "@/components/oficina/ui-bits";
import { formatarData, truncar } from "@/lib/oficina";
import {
  diasDesdeUltimaDe,
  exportarHistoricoExcel,
  exportarHistoricoPdf,
  resumoPecasDe,
  tecnicosDe,
  totalHorasDe,
  type DadosHistorico
} from "./exportar-historico";

export function MaquinaClient({ equipId }: { equipId: number }) {
  const [dados, setDados] = useState<DadosHistorico | null>(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [aExcel, setAExcel] = useState(false);
  const [aPdf, setAPdf] = useState(false);
  /** Momento "agora" capturado uma única vez (sem impureza no render). */
  const [agora] = useState(() => Date.now());

  useEffect(() => {
    let vivo = true;
    fetch(`/api/oficina/maquina/${equipId}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok || d?.ok === false) throw new Error(d?.erro || "Falha ao carregar");
        setDados(d);
        setErro("");
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Erro inesperado");
      })
      .finally(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [equipId]);

  /* ============ Dados desembalados (com valores seguros) ============ */
  const equip = dados?.equip || null;
  const ordens = useMemo(() => dados?.ordens || [], [dados]);
  const intervencoes = useMemo(() => dados?.intervencoes || [], [dados]);
  const pecas = useMemo(() => dados?.pecas || [], [dados]);
  const colaboradores = useMemo(() => dados?.colaboradores || [], [dados]);

  /* ============ Cálculos (sempre executados, antes dos returns) ============ */

  const totalHoras = totalHorasDe(intervencoes);
  const diasDesdeUltima = diasDesdeUltimaDe(ordens, agora);

  const distribFisico = useMemo(() => {
    const mapa = new Map<string, { qtd: number; dias: number }>();
    ordens.forEach((o) => {
      const est = o.status_fisico || "-";
      const dias = Math.floor(
        (new Date(o.data_fecho || agora).getTime() - new Date(o.data_abertura || agora).getTime()) / 86400000
      );
      const atual = mapa.get(est) || { qtd: 0, dias: 0 };
      mapa.set(est, { qtd: atual.qtd + 1, dias: atual.dias + Math.max(0, dias) });
    });
    return [...mapa.entries()].sort((a, b) => b[1].qtd - a[1].qtd);
  }, [ordens, agora]);

  const resumoPecas = useMemo(() => resumoPecasDe(pecas), [pecas]);

  const tecnicos = useMemo(
    () => tecnicosDe(intervencoes, colaboradores),
    [intervencoes, colaboradores]
  );

  const graficoHoras = useMemo(() => {
    const mapa = new Map<string, number>();
    intervencoes.forEach((r) => {
      if (!r.shift_date) return;
      const mes = String(r.shift_date).slice(0, 7);
      mapa.set(mes, (mapa.get(mes) || 0) + (parseFloat(String(r.hours)) || 0));
    });
    const meses = [...mapa.keys()].sort().slice(-12);
    return { meses, valores: meses.map((m) => Math.round((mapa.get(m) || 0) * 100) / 100) };
  }, [intervencoes]);

  /* ============ Exportações (PDF + Excel do histórico completo) ============ */

  async function exportarExcel() {
    if (!dados) return;
    setAExcel(true);
    try {
      await exportarHistoricoExcel(dados);
      toast.success("Excel do histórico exportado (5 folhas).");
    } catch {
      toast.error("Não foi possível gerar o Excel.");
    } finally {
      setAExcel(false);
    }
  }

  async function exportarPdf() {
    if (!dados) return;
    setAPdf(true);
    try {
      await exportarHistoricoPdf(dados);
      toast.success("PDF do histórico exportado.");
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setAPdf(false);
    }
  }

  /* ============ Estados de ecrã ============ */

  if (aCarregar) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Rodar /> A carregar o histórico da máquina...
      </div>
    );
  }
  if (erro || !dados || !equip) {
    return (
      <Card className="mx-auto max-w-md border-erro/40">
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-erro">{erro || "Máquina não encontrada."}</p>
          <Button asChild variant="outline">
            <Link href="/oficina/equipamentos">
              <ArrowLeft aria-hidden /> Voltar aos Equipamentos
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Cabeca
        titulo={`Máquina ${equip.code}`}
        subtitulo={`${equip.fleet_type || "-"} - ${equip.group_name || "-"} - Adquirida em ${equip.year_acquired || "-"}`}
      >
        <Button variant="outline" size="sm" onClick={exportarExcel} disabled={aExcel}>
          {aExcel ? <Rodar /> : <FileSpreadsheet aria-hidden />}
          Excel
        </Button>
        <Button variant="outline" size="sm" onClick={exportarPdf} disabled={aPdf}>
          {aPdf ? <Rodar /> : <Printer aria-hidden />}
          PDF
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href="/oficina/equipamentos">
            <ArrowLeft aria-hidden />
            Voltar
          </Link>
        </Button>
      </Cabeca>

      {erro && (
        <Card className="border-erro/40">
          <CardContent className="flex items-center gap-2 text-sm text-erro">
            <TriangleAlert className="size-4" aria-hidden />
            {erro}
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo="Obras" valor={String(ordens.length)} />
        <Kpi rotulo="Intervenções" valor={String(intervencoes.length)} />
        <Kpi rotulo="Horas Totais" valor={`${Math.round(totalHoras * 100) / 100}h`} />
        <Kpi rotulo="Dias desde a última obra" valor={diasDesdeUltima == null ? "-" : String(diasDesdeUltima)} />
        <Kpi rotulo="Peças Registadas" valor={String(pecas.length)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Timeline de obras */}
        <Card className="card-sombra">
          <CardContent className="space-y-3">
            <p className="font-semibold">Ordens de Serviço da Máquina</p>
            {ordens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma ordem de serviço registada.</p>
            ) : (
              <ul className="space-y-2">
                {ordens.map((o) => {
                  const dias = Math.floor(
                    (new Date(o.data_fecho || agora).getTime() -
                      new Date(o.data_abertura || agora).getTime()) /
                      86400000
                  );
                  return (
                    <li key={o.id} className="rounded-lg border px-3 py-2 text-sm">
                      <p className="font-semibold">
                        <Link
                          href={`/oficina/ordens/${o.id}`}
                          className="text-primario hover:underline dark:text-primario-forte"
                        >
                          {o.numero_obra || "S/Nº"}
                        </Link>{" "}
                        <EtiquetaFisico estado={o.status_fisico} />
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Abertura: {formatarData(o.data_abertura)} | Duração: {Math.max(0, dias)} dias | Sector:{" "}
                        {o.sector || "-"}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-ambar-texto dark:text-ambar">
                        {truncar(o.descricao_avaria, 90)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Distribuição física */}
          <Card className="card-sombra">
            <CardContent className="space-y-3">
              <p className="font-semibold">Distribuição por Estado Físico</p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                      {["Estado", "Obras", "Dias somados", "%"].map((c) => (
                        <th key={c} className="px-2 py-1.5 font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {distribFisico.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                          Nenhuma obra registada.
                        </td>
                      </tr>
                    ) : (
                      distribFisico.map(([est, info]) => (
                        <tr key={est} className="border-b last:border-0">
                          <td className="px-2 py-2">
                            <EtiquetaFisico estado={est} />
                          </td>
                          <td className="px-2 py-2 tabular-nums">{info.qtd}</td>
                          <td className="px-2 py-2 tabular-nums">{info.dias}</td>
                          <td className="px-2 py-2 tabular-nums">
                            {Math.round((info.qtd / (ordens.length || 1)) * 100)}%
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Gráfico de horas por mês */}
          <Card className="card-sombra">
            <CardContent className="space-y-3">
              <p className="font-semibold">Horas de Trabalho por Mês</p>
              {graficoHoras.meses.length === 0 ? (
                <p className="text-sm text-muted-foreground">Ainda sem intervenções para desenhar.</p>
              ) : (
                <GraficoLinha meses={graficoHoras.meses} valores={graficoHoras.valores} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Intervenções */}
      <Card className="card-sombra">
        <CardContent className="space-y-3">
          <p className="font-semibold">Intervenções</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                  {["Data", "Obra", "Descrição", "Técnicos", "Horas"].map((c) => (
                    <th key={c} className="px-2 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {intervencoes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                      Nenhuma intervenção registada.
                    </td>
                  </tr>
                ) : (
                  intervencoes.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-2 py-2">{formatarData(r.shift_date)}</td>
                      <td className="px-2 py-2">
                        <Link
                          href={`/oficina/ordens/${r.os_id}`}
                          className="font-semibold text-primario hover:underline dark:text-primario-forte"
                        >
                          {r.obra_numero || "S/Nº"}
                        </Link>
                      </td>
                      <td className="px-2 py-2">{truncar(r.description, 60)}</td>
                      <td className="px-2 py-2">
                        {(r.tecnicos || []).map((t) => t.name).join(", ") || "-"}
                      </td>
                      <td className="px-2 py-2 tabular-nums">{r.hours ?? "-"}h</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Peças */}
        <Card className="card-sombra">
          <CardContent className="space-y-3">
            <p className="font-semibold">Peças Aplicadas (resumo)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                    {["Peça", "Qtd Total", "Última vez"].map((c) => (
                      <th key={c} className="px-2 py-1.5 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resumoPecas.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-2 py-4 text-center text-muted-foreground">
                        Nenhuma peça registada.
                      </td>
                    </tr>
                  ) : (
                    resumoPecas.map(([peca, info]) => (
                      <tr key={peca} className="border-b last:border-0">
                        <td className="px-2 py-2">{peca}</td>
                        <td className="px-2 py-2 tabular-nums">{info.qtd}</td>
                        <td className="px-2 py-2">{info.ultima ? formatarData(info.ultima) : "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Técnicos */}
        <Card className="card-sombra">
          <CardContent className="space-y-3">
            <p className="font-semibold">Técnicos por Horas</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                    {["Técnico", "Código", "Sector", "Intervenções", "Horas"].map((c) => (
                      <th key={c} className="px-2 py-1.5 font-semibold">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tecnicos.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">
                        Nenhum técnico registado.
                      </td>
                    </tr>
                  ) : (
                    tecnicos.map((t) => (
                      <tr key={t.nome} className="border-b last:border-0">
                        <td className="px-2 py-2 font-medium">{t.nome}</td>
                        <td className="px-2 py-2">{t.code}</td>
                        <td className="px-2 py-2">{t.setor}</td>
                        <td className="px-2 py-2 tabular-nums">{t.n}</td>
                        <td className="px-2 py-2 tabular-nums">{Math.round(t.horas * 100) / 100}h</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <p className="text-[0.7rem] font-medium leading-tight text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
    </div>
  );
}

/** Gráfico de linhas simples em SVG (sem dependências). */
function GraficoLinha({ meses, valores }: { meses: string[]; valores: number[] }) {
  const largura = 560;
  const altura = 160;
  const pad = 28;
  const max = Math.max(1, ...valores);
  const passoX = valores.length > 1 ? (largura - pad * 2) / (valores.length - 1) : 0;
  const pontos = valores.map((v, i) => {
    const x = pad + i * passoX;
    const y = altura - pad - (v / max) * (altura - pad * 2);
    return { x, y, v };
  });
  const linha = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const area = `${linha} L${pontos[pontos.length - 1]?.x || pad},${altura - pad} L${pad},${altura - pad} Z`;

  return (
    <svg viewBox={`0 0 ${largura} ${altura}`} className="h-44 w-full" role="img" aria-label="Horas por mês">
      <line x1={pad} y1={altura - pad} x2={largura - pad} y2={altura - pad} stroke="currentColor" strokeOpacity="0.2" />
      <line x1={pad} y1={pad} x2={pad} y2={altura - pad} stroke="currentColor" strokeOpacity="0.2" />
      <path d={area} fill="var(--primario)" fillOpacity="0.12" />
      <path d={linha} fill="none" stroke="var(--primario)" strokeWidth="2" strokeLinejoin="round" />
      {pontos.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3" fill="var(--primario)" />
          <text x={p.x} y={p.y - 8} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.7">
            {p.v}
          </text>
          <text x={p.x} y={altura - 10} textAnchor="middle" fontSize="9" fill="currentColor" fillOpacity="0.7">
            {meses[i].slice(2)}
          </text>
        </g>
      ))}
    </svg>
  );
}
