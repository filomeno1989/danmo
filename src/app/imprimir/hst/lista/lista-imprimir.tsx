"use client";

/**
 * Papel A4 das listagens HST (cliente).
 *
 * Acidentes (período), entregas de EPIs (período) e tensão arterial
 * (última medição por colaborador, do grau mais alto para o mais leve,
 * com a classificação corrigida pela lib).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pedir } from "@/components/oficina/ui-bits";
import {
  classificarTensao,
  fmtDataHst,
  type AcidenteVisao,
  type EntregaEpiHST,
  type MedicaoTensaoHST
} from "@/lib/hst";
import { BotaoImprimirHst } from "../botao-imprimir";

const TITULOS: Record<string, string> = {
  acidentes: "Relatório de Acidentes e Incidentes",
  epis: "Relatório de Entregas de EPIs",
  tensao: "Relatório de Tensão Arterial - Colaboradores"
};

export function ListaImprimir({ tipo, de, ate }: { tipo: string; de: string; ate: string }) {
  const [acc, setAcc] = useState<AcidenteVisao[] | null>(null);
  const [entregas, setEntregas] = useState<EntregaEpiHST[] | null>(null);
  const [medicoes, setMedicoes] = useState<MedicaoTensaoHST[] | null>(null);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<{ acidentes: AcidenteVisao[] }>("/api/hst/acidentes"),
      pedir<{ entregas: EntregaEpiHST[] }>("/api/hst/epis"),
      pedir<{ medicoes: MedicaoTensaoHST[] }>("/api/hst/medicoes")
    ])
      .then(([a, e, m]) => {
        if (!vivo) return;
        setAcc(a.acidentes);
        setEntregas(e.entregas);
        setMedicoes(m.medicoes);
      })
      .catch((e2: Error) => {
        if (vivo) setFalha(e2.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const dentro = (iso: string | null | undefined) => {
    const dia = String(iso || "").slice(0, 10);
    if (!dia) return false;
    if (de && dia < de) return false;
    if (ate && dia > ate) return false;
    return true;
  };
  const periodoTexto = de || ate
    ? `Período: ${de ? fmtDataHst(de) : "início"} a ${ate ? fmtDataHst(ate) : "hoje"}`
    : "Período: todos os registos";

  const listaAcc = useMemo(() => (acc || []).filter((a) => dentro(a.dataDisplay)), [acc, de, ate]);
  const listaEnt = useMemo(() => (entregas || []).filter((e) => dentro(e.data_entrega)), [entregas, de, ate]);

  const listaTen = useMemo(() => {
    // Última medição por colaborador (dentro do período), do pior grau para o melhor.
    const ultima: Record<string, MedicaoTensaoHST> = {};
    for (const m of medicoes || []) {
      if (!dentro(m.data_medicao)) continue;
      const nome = m.colaborador_nome || "";
      if (!ultima[nome] || String(m.data_medicao) > String(ultima[nome].data_medicao)) {
        ultima[nome] = m;
      }
    }
    const ordem: Record<string, number> = { alta: 0, limitrofe: 1, normal: 2 };
    return Object.values(ultima).sort(
      (a, b) =>
        (ordem[classificarTensao(a.sistolica, a.diastolica).cls] ?? 3) -
        (ordem[classificarTensao(b.sistolica, b.diastolica).cls] ?? 3)
    );
  }, [medicoes, de, ate]);

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

  const aCarregar = !acc && !entregas && !medicoes;
  if (aCarregar) {
    return <div className="p-10 text-center text-sm text-muted-foreground">A carregar listagem...</div>;
  }

  const total = tipo === "acidentes" ? listaAcc.length : tipo === "epis" ? listaEnt.length : listaTen.length;

  return (
    <div className="min-h-screen bg-slate-100 text-black">
      <div className="mx-auto bg-white" style={{ maxWidth: "210mm", padding: "15mm" }} data-papel-lista>
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
          {TITULOS[tipo]}
        </h1>
        <p className="mt-2 text-center text-[0.72rem] text-slate-600">
          {periodoTexto} | Total: {total} registo(s)
        </p>

        <div className="mt-4" data-lista-corpo>
          {total === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Nenhum registo no período.</p>
          ) : tipo === "acidentes" ? (
            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">#</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Número</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Data</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Tipo</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Status</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Dias afast.</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Atestado</th>
                </tr>
              </thead>
              <tbody>
                {listaAcc.map((a, i) => (
                  <tr key={a.id}>
                    <td className="border border-slate-300 px-2 py-1">{i + 1}</td>
                    <td className="border border-slate-300 px-2 py-1 font-bold">{a.numero || "era antiga"}</td>
                    <td className="border border-slate-300 px-2 py-1">{fmtDataHst(a.dataDisplay, true)}</td>
                    <td className="border border-slate-300 px-2 py-1">{a.nomeDisplay}</td>
                    <td className="border border-slate-300 px-2 py-1">{a.tipo_ocorrencia}</td>
                    <td className="border border-slate-300 px-2 py-1">{a.status || "-"}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center">{a.dias_afastamento ?? 0}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center">{a.gerou_atestado ? "Sim" : "Não"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : tipo === "epis" ? (
            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">#</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Data</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">EPI</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Qtd</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Observações</th>
                </tr>
              </thead>
              <tbody>
                {listaEnt.map((e, i) => (
                  <tr key={e.id}>
                    <td className="border border-slate-300 px-2 py-1">{i + 1}</td>
                    <td className="border border-slate-300 px-2 py-1">{fmtDataHst(e.data_entrega)}</td>
                    <td className="border border-slate-300 px-2 py-1">{e.colaborador_nome}</td>
                    <td className="border border-slate-300 px-2 py-1">{e.epi_nome}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center">{e.quantidade || 1}</td>
                    <td className="border border-slate-300 px-2 py-1">{e.observacoes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">#</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Data</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Tensão</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">FC</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Classificação</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Medido por</th>
                </tr>
              </thead>
              <tbody>
                {listaTen.map((m, i) => {
                  const c = classificarTensao(m.sistolica, m.diastolica);
                  const cor = c.cls === "alta" ? "text-red-700 font-bold" : c.cls === "limitrofe" ? "text-amber-600 font-bold" : "";
                  return (
                    <tr key={m.id}>
                      <td className="border border-slate-300 px-2 py-1">{i + 1}</td>
                      <td className="border border-slate-300 px-2 py-1">{m.colaborador_nome}</td>
                      <td className="border border-slate-300 px-2 py-1">{fmtDataHst(m.data_medicao)}</td>
                      <td className={`border border-slate-300 px-2 py-1 text-center ${cor}`}>{m.sistolica}/{m.diastolica}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center">{m.frequencia_cardiaca || "-"}</td>
                      <td className={`border border-slate-300 px-2 py-1 ${cor}`}>{c.texto}</td>
                      <td className="border border-slate-300 px-2 py-1">{m.medido_por || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="mt-8 flex items-center justify-between border-t border-slate-300 pt-2 text-[0.62rem] text-slate-500">
          <span>DAN_QSS_FR_018_REV01</span>
          <span>Documento gerado em {fmtDataHst(new Date().toISOString(), true)}</span>
          <img src="/logos/MESQUITA.png" alt="Grupo Mesquita" className="h-5" />
        </footer>
      </div>
    </div>
  );
}
