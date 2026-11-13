"use client";

/**
 * Papel A4 do Resumo Mensal HST (cliente).
 *
 * Indicadores do mês, lista de acidentes do mês e colaboradores com
 * HTA. As contagens correm com indicadoresResumoMensal da lib (o mesmo
 * juiz do painel e das provas); a classificação da tensão é a cascata
 * corrigida.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pedir } from "@/components/oficina/ui-bits";
import {
  fmtDataHst,
  indicadoresResumoMensal,
  MESES_HST,
  type AccaoHST,
  type AcidenteVisao,
  type AreaRiscoHST,
  type EntregaEpiHST,
  type MedicaoTensaoHST
} from "@/lib/hst";
import { BotaoImprimirHst } from "../botao-imprimir";

type ResumoDados = {
  acidentes: AcidenteVisao[];
  acoes: AccaoHST[];
  entregas: EntregaEpiHST[];
  medicoes: MedicaoTensaoHST[];
  areas: AreaRiscoHST[];
  resumo: ReturnType<typeof indicadoresResumoMensal>;
};

export function ResumoImprimir({ ano, mes }: { ano: number; mes: number }) {
  const [d, setD] = useState<ResumoDados | null>(null);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<{ acidentes: AcidenteVisao[]; acoes: AccaoHST[] }>("/api/hst/acidentes"),
      pedir<{ entregas: EntregaEpiHST[] }>("/api/hst/epis"),
      pedir<{ medicoes: MedicaoTensaoHST[] }>("/api/hst/medicoes"),
      pedir<{ areas: AreaRiscoHST[] }>("/api/hst/areas")
    ])
      .then(([acc, epi, med, are]) => {
        if (!vivo) return;
        const hoje = new Date().toISOString().slice(0, 10);
        const resumo = indicadoresResumoMensal(
          acc.acidentes, epi.entregas, med.medicoes, acc.acoes, are.areas, ano, mes, hoje
        );
        setD({ ...acc, ...epi, ...med, ...are, resumo });
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [ano, mes]);

  if (falha) {
    return (
      <div className="p-10 text-center text-sm text-destructive">
        {falha}
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/hst/relatorios">Voltar aos Relatórios</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!d) {
    return <div className="p-10 text-center text-sm text-muted-foreground">A carregar resumo...</div>;
  }

  const r = d.resumo;
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
      <div className="mx-auto bg-white" style={{ maxWidth: "210mm", padding: "15mm" }} data-papel-resumo>
        <BotaoImprimirHst deVolta="/hst/relatorios" />

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
          Resumo Mensal HST - {MESES_HST[mes - 1]} {ano}
        </h1>

        <section className="mt-4">
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">Indicadores do Mês</h2>
          <table className="w-full border-collapse text-[0.78rem]" data-resumo-indicadores>
            <tbody>
              {linha("Acidentes / Incidentes", String(r.acidentes.length))}
              {linha("Acidentes com Afastamento", String(r.comAfastamento))}
              {linha("Dias totais de afastamento", String(r.diasAfastamento))}
              {linha("Entregas de EPIs", String(r.entregas.length))}
              {linha("Medições de tensão arterial", String(r.medicoes.length))}
              {linha("Colaboradores com HTA", String(r.colabsHta.length), r.colabsHta.length > 0)}
              {linha("Acções correctivas pendentes", String(r.acoesPendentes))}
              {linha("Acções atrasadas", String(r.acoesAtrasadas), r.acoesAtrasadas > 0)}
              {linha("Áreas de risco activas", String(r.areasAtivas))}
            </tbody>
          </table>
        </section>

        {r.acidentes.length ? (
          <section className="mt-5">
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">Acidentes do Mês</h2>
            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">Número</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Data</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Tipo</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {r.acidentes.map((a) => (
                  <tr key={a.id}>
                    <td className="border border-slate-300 px-2 py-1 font-bold">{a.numero || "era antiga"}</td>
                    <td className="border border-slate-300 px-2 py-1">{fmtDataHst(a.dataDisplay, true)}</td>
                    <td className="border border-slate-300 px-2 py-1">{a.nomeDisplay}</td>
                    <td className="border border-slate-300 px-2 py-1">{a.tipo_ocorrencia}</td>
                    <td className="border border-slate-300 px-2 py-1">{a.status || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {r.colabsHta.length ? (
          <section className="mt-5">
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">Colaboradores com Hipertensão (HTA)</h2>
            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Última medição</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Tensão</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Classificação</th>
                </tr>
              </thead>
              <tbody>
                {r.colabsHta.map((m, i) => (
                  <tr key={`${m.nome}-${i}`}>
                    <td className="border border-slate-300 px-2 py-1">{m.nome}</td>
                    <td className="border border-slate-300 px-2 py-1">{fmtDataHst(m.data_medicao)}</td>
                    <td className="border border-slate-300 px-2 py-1 font-bold">{m.sistolica}/{m.diastolica}</td>
                    <td className="border border-slate-300 px-2 py-1 text-red-700">{m.classificacao.texto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        <footer className="mt-8 flex items-center justify-between border-t border-slate-300 pt-2 text-[0.62rem] text-slate-500">
          <span>DAN_QSS_FR_018_REV01</span>
          <span>Documento gerado em {fmtDataHst(new Date().toISOString(), true)}</span>
          <img src="/logos/MESQUITA.png" alt="Grupo Mesquita" className="h-5" />
        </footer>
      </div>
    </div>
  );
}
