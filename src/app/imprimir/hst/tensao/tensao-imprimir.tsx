"use client";

/**
 * Papel A4 do Controlo de Tensão Arterial (cliente).
 *
 * COLETIVO (sem colab): indicadores do período, resumo por pessoa
 * (mediações, última leitura, classificação, médias) e a lista completa
 * de medições do período, por ordem cronológica. INDIVIDUAL (com colab):
 * os mesmos números só desta pessoa e a lista completa. As contagens
 * correm com as funções puras da lib (resumoTensaoPeriodo,
 * medicoesNoPeriodo, resumoTensao) - o mesmo juiz das provas.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pedir } from "@/components/oficina/ui-bits";
import {
  classificarTensao,
  fmtDataHst,
  medicoesNoPeriodo,
  resumoTensaoPeriodo,
  type ColaboradorHST,
  type MedicaoTensaoHST
} from "@/lib/hst";
import { BotaoImprimirHst } from "../botao-imprimir";

type Props = { colab: string; de: string; ate: string };

export function TensaoImprimir({ colab, de, ate }: Props) {
  const [medicoes, setMedicoes] = useState<MedicaoTensaoHST[] | null>(null);
  const [colabs, setColabs] = useState<ColaboradorHST[]>([]);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<{ medicoes: MedicaoTensaoHST[] }>("/api/hst/medicoes"),
      pedir<{ colaboradores: ColaboradorHST[] }>("/api/hst/colaboradores")
    ])
      .then(([med, col]) => {
        if (!vivo) return;
        setMedicoes(med.medicoes || []);
        setColabs(col.colaboradores || []);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const dentro = useMemo(
    () => (medicoes ? medicoesNoPeriodo(medicoes, de, ate).filter((m) => !colab || m.colaborador_nome === colab) : []),
    [medicoes, de, ate, colab]
  );
  const resumo = useMemo(() => resumoTensaoPeriodo(dentro), [dentro]);

  const porPessoa = useMemo(() => {
    const mapa: Record<string, { nome: string; ultima: MedicaoTensaoHST; total: number; somaSys: number; somaDia: number; hta: number }> = {};
    for (const m of dentro) {
      const nome = m.colaborador_nome || "";
      if (!mapa[nome]) mapa[nome] = { nome, ultima: m, total: 0, somaSys: 0, somaDia: 0, hta: 0 };
      mapa[nome].total += 1;
      mapa[nome].somaSys += Number(m.sistolica) || 0;
      mapa[nome].somaDia += Number(m.diastolica) || 0;
      if (classificarTensao(Number(m.sistolica), Number(m.diastolica)).cls === "alta") {
        mapa[nome].hta += 1;
      }
      if (String(m.data_medicao) > String(mapa[nome].ultima.data_medicao)) {
        mapa[nome].ultima = m;
      }
    }
    return Object.values(mapa).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dentro]);

  const cronologica = useMemo(
    () => [...dentro].sort((a, b) => String(a.data_medicao).localeCompare(String(b.data_medicao))),
    [dentro]
  );

  const codigoDe = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const c of colabs) mapa[c.name || ""] = c.code || "";
    return mapa;
  }, [colabs]);

  if (falha) {
    return (
      <div className="p-10 text-center text-sm text-destructive">
        {falha}
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/hst/tensao">Voltar à Tensão Arterial</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!medicoes) {
    return <div className="p-10 text-center text-sm text-muted-foreground">A carregar medições...</div>;
  }

  const individual = Boolean(colab);
  const volta = individual ? `/hst/tensao/pessoa?colab=${encodeURIComponent(colab)}` : "/hst/tensao";
  const periodo = de || ate
    ? `Período: ${de ? fmtDataHst(de) : "início"} a ${ate ? fmtDataHst(ate) : "hoje"}`
    : "Período: todos os registos";

  const linha = (rotulo: string, valor: string, vermelho = false) => (
    <tr>
      <td className="border border-slate-300 px-2 py-1.5">{rotulo}</td>
      <td className={`border border-slate-300 px-2 py-1.5 text-right font-bold ${vermelho ? "text-red-700" : ""}`}>
        {valor}
      </td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-black">
      <div className="mx-auto bg-white" style={{ maxWidth: "210mm", padding: "15mm" }} data-papel-tensao>
        <BotaoImprimirHst deVolta={volta} />

        <header className="flex items-start justify-between border-b-4 border-slate-900 pb-3" style={{ printColorAdjust: "exact" }}>
          <img src="/logos/DANMO.png" alt="DANMO" className="h-11" />
          <div className="text-center">
            <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Relatório HST</p>
            <p className="text-sm font-bold">DANMO SERVICE SYSTEM, LDA</p>
            <p className="text-[0.65rem] text-slate-500">Porto da Beira, Moçambique</p>
          </div>
          <img src="/logos/MMM.png" alt="Made in Mozambique" className="h-9" />
        </header>

        <h1 className="mt-4 rounded border border-slate-300 bg-slate-100 py-2 text-center text-base font-black">
          {individual ? `Controlo de Tensão Arterial - ${colab}` : "Controlo de Tensão Arterial (Campanha)"}
        </h1>
        <p className="mt-1 text-center text-[0.72rem] text-slate-600">
          {periodo}
          {individual && codigoDe[colab] ? ` | Colaborador: ${codigoDe[colab]}` : ""}
        </p>

        <section className="mt-4">
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
            Indicadores do Período
          </h2>
          <table className="w-full border-collapse text-[0.78rem]" data-tensao-indicadores>
            <tbody>
              {linha("Medições registadas", String(resumo.total))}
              {!individual && linha("Pessoas medidas", String(resumo.pessoas))}
              {linha("Média da tensão", resumo.total ? `${resumo.mediaSys}/${resumo.mediaDia} mmHg` : "-")}
              {linha("Medições com tensão alta", `${resumo.medicoesHta} (${resumo.pctHta}%)`, resumo.medicoesHta > 0)}
              {linha("Dias com registo", String(resumo.diasComMedicao))}
            </tbody>
          </table>
        </section>

        {!individual && porPessoa.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
              Resumo por Colaborador
            </h2>
            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Código</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Medições</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Última leitura</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Última data</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Média</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Classificação</th>
                </tr>
              </thead>
              <tbody>
                {porPessoa.map((p) => {
                  const cla = classificarTensao(Number(p.ultima.sistolica), Number(p.ultima.diastolica));
                  return (
                    <tr key={p.nome}>
                      <td className="border border-slate-300 px-2 py-1">{p.nome}</td>
                      <td className="border border-slate-300 px-2 py-1">{codigoDe[p.nome] || "-"}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center">{p.total}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-bold">
                        {p.ultima.sistolica}/{p.ultima.diastolica}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">{fmtDataHst(p.ultima.data_medicao, true)}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center">
                        {Math.round(p.somaSys / p.total)}/{Math.round(p.somaDia / p.total)}
                      </td>
                      <td className={`border border-slate-300 px-2 py-1 ${cla.cls === "alta" ? "text-red-700 font-bold" : ""}`}>
                        {cla.texto}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {cronologica.length > 0 ? (
          <section className="mt-5">
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
              Medições do Período (por ordem de data)
            </h2>
            <table className="w-full border-collapse text-[0.72rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  {!individual && <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>}
                  <th className="border border-slate-900 px-2 py-1 text-left">Data</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Hora</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Sistólica</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Diastólica</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">FC</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Classificação</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Observações</th>
                </tr>
              </thead>
              <tbody>
                {cronologica.map((m) => {
                  const cla = classificarTensao(Number(m.sistolica), Number(m.diastolica));
                  const iso = String(m.data_medicao || "");
                  return (
                    <tr key={m.id}>
                      {!individual && <td className="border border-slate-300 px-2 py-1">{m.colaborador_nome}</td>}
                      <td className="border border-slate-300 px-2 py-1">{fmtDataHst(iso)}</td>
                      <td className="border border-slate-300 px-2 py-1">{iso.length >= 16 ? iso.slice(11, 16) : "-"}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-bold">{m.sistolica}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-bold">{m.diastolica}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center">{m.frequencia_cardiaca ?? "-"}</td>
                      <td className={`border border-slate-300 px-2 py-1 ${cla.cls === "alta" ? "text-red-700 font-bold" : ""}`}>
                        {cla.texto}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">{m.observacoes || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <section className="mt-5">
            <p className="border border-slate-300 bg-slate-50 px-3 py-4 text-center text-[0.78rem] text-slate-600">
              Sem medições no período escolhido.
            </p>
          </section>
        )}

        <section className="mt-6 grid grid-cols-2 gap-6 text-[0.7rem]">
          <div className="border-t border-slate-400 pt-1 text-center">O Técnico de HST</div>
          <div className="border-t border-slate-400 pt-1 text-center">Visto no Posto de Saúde</div>
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-slate-300 pt-2 text-[0.62rem] text-slate-500">
          <span>DANMO SERVICE SYSTEM, LDA</span>
          <span>Documento gerado em {fmtDataHst(new Date().toISOString(), true)}</span>
          <img src="/logos/MESQUITA.png" alt="Grupo Mesquita" className="h-5" />
        </footer>
      </div>
    </div>
  );
}
