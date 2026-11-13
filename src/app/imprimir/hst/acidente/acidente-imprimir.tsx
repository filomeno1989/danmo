"use client";

/**
 * Papel A4 do Relatório de Investigação de Acidente (cliente).
 *
 * Fiel ao acidente_print.html do hub (DAN_QSS_FR_018_REV01): cabeçalho
 * DANMO/MMM, secções 1-4, acções correctivas com atraso a vermelho, 3
 * assinaturas e rodapé com o MESQUITA. Os dados vêm da API
 * /api/hst/acidentes/[id] (o servidor já entrega o acidente VESTIDO:
 * nome e data resolvidos para as duas eras).
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pedir } from "@/components/oficina/ui-bits";
import {
  accaoAtrasada,
  fmtDataHst,
  type AccaoHST,
  type AcidenteVisao
} from "@/lib/hst";
import { BotaoImprimirHst } from "../botao-imprimir";

type Resposta = { ok: boolean; acidente: AcidenteVisao; acoes: AccaoHST[] };

export function AcidenteImprimir({ id }: { id: string }) {
  const [acc, setAcc] = useState<AcidenteVisao | null>(null);
  const [acoes, setAcoes] = useState<AccaoHST[]>([]);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    pedir<Resposta>(`/api/hst/acidentes/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!vivo) return;
        setAcc(r.acidente);
        setAcoes(r.acoes || []);
        document.title = `Relatório ${r.acidente?.numero || "antigo"} - HST`;
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [id]);

  if (falha) {
    return (
      <div className="p-10 text-center text-sm text-destructive">
        {falha}
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/hst/acidentes">Voltar aos Acidentes</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!acc) {
    return <div className="p-10 text-center text-sm text-muted-foreground">A carregar relatório...</div>;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const temCausa = acc.causa_raiz || acc.fator_humano || acc.fator_ambiental || acc.fator_equipamento;

  const campo = (rotulo: string, valor: string) => (
    <div className="flex gap-2">
      <span className="w-44 shrink-0 font-semibold text-slate-600">{rotulo}:</span>
      <span className="flex-1">{valor || "-"}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-black">
      <div className="mx-auto bg-white" style={{ maxWidth: "210mm", padding: "15mm" }} data-papel-acidente>
        <BotaoImprimirHst deVolta="/hst/acidentes" />

        <header className="flex items-start justify-between border-b-4 border-slate-900 pb-3" style={{ printColorAdjust: "exact" }}>
          <img src="/logos/DANMO.png" alt="DANMO" className="h-11" />
          <div className="text-center">
            <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Relatório de Investigação</p>
            <p className="text-sm font-bold">DANMO SERVICE SYSTEM, LDA</p>
            <p className="text-[0.65rem] text-slate-500">Porto da Beira, Moçambique</p>
          </div>
          <img src="/logos/MMM.png" alt="Made in Mozambique" className="h-9" />
        </header>

        <h1 className="mt-4 rounded border border-slate-300 bg-slate-100 py-2 text-center text-base font-black" data-papel-numero>
          {acc.numero || "Registo da era anterior ao hub"}
        </h1>

        <section className="mt-4">
          <h2 className="border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">1. Dados do Colaborador</h2>
          <div className="mt-2 space-y-1 text-[0.78rem]">
            {campo("Nome", acc.nomeDisplay)}
            {acc.eAntigo ? (
              <p className="text-[0.68rem] text-slate-500">
                Registo gravado pelo sistema anterior: os campos desta geração podem estar em branco.
              </p>
            ) : null}
          </div>
        </section>

        <section className="mt-4">
          <h2 className="border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">2. Dados do Evento</h2>
          <div className="mt-2 grid gap-1 text-[0.78rem] md:grid-cols-2">
            {campo("Data / hora", fmtDataHst(acc.dataDisplay, true))}
            {campo("Tipo", acc.tipo_ocorrencia || "")}
            {campo("Local / área", acc.area_risco_nome || "")}
            {campo("Tipo de lesão", acc.tipo_lesao || "")}
            {campo("Parte do corpo", acc.parte_corpo || "")}
            {campo("Dias afastamento", String(acc.dias_afastamento ?? 0))}
            {campo("Atestado médico", acc.gerou_atestado ? `Sim${acc.numero_atestado ? ` - ${acc.numero_atestado}` : ""}` : "Não")}
            {campo("Testemunhas", acc.testemunhas || "Não indicadas")}
            {acc.status ? campo("Status", acc.status) : null}
            {acc.epi_usado ? campo("EPI usado (registo antigo)", acc.epi_usado) : null}
            {acc.encaminhado_para ? campo("Encaminhado para (registo antigo)", acc.encaminhado_para) : null}
          </div>
        </section>

        <section className="mt-4">
          <h2 className="border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">3. Descrição do Evento</h2>
          <p className="mt-2 text-[0.78rem] leading-relaxed whitespace-pre-line">{acc.descricao || "-"}</p>
        </section>

        {temCausa ? (
          <section className="mt-4">
            <h2 className="border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">4. Análise de Causa Raiz</h2>
            <div className="mt-2 space-y-1 text-[0.78rem]">
              {acc.causa_raiz ? campo("Causa raiz", acc.causa_raiz) : null}
              {acc.fator_humano ? (
                <p className="rounded border-l-4 border-amber-500 bg-amber-50 px-3 py-1.5"><strong>Factor humano:</strong> {acc.fator_humano}</p>
              ) : null}
              {acc.fator_ambiental ? (
                <p className="rounded border-l-4 border-sky-500 bg-sky-50 px-3 py-1.5"><strong>Factor ambiental:</strong> {acc.fator_ambiental}</p>
              ) : null}
              {acc.fator_equipamento ? (
                <p className="rounded border-l-4 border-red-500 bg-red-50 px-3 py-1.5"><strong>Factor equipamento:</strong> {acc.fator_equipamento}</p>
              ) : null}
            </div>
          </section>
        ) : null}

        {acoes.length ? (
          <section className="mt-4">
            <h2 className="border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">5. Acções Correctivas</h2>
            <table className="mt-2 w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">#</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Acção</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Responsável</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Prazo</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {acoes.map((ac, i) => {
                  const atrasada = accaoAtrasada(ac, hoje);
                  return (
                    <tr key={ac.id}>
                      <td className="border border-slate-300 px-2 py-1">{i + 1}</td>
                      <td className="border border-slate-300 px-2 py-1">{ac.descricao_acao}</td>
                      <td className="border border-slate-300 px-2 py-1">{ac.responsavel}</td>
                      <td className="border border-slate-300 px-2 py-1">
                        {fmtDataHst(ac.prazo)}
                        {atrasada ? <strong className="ml-1 text-red-700">ATRASADA</strong> : null}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">{ac.status || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : null}

        <div className="mt-10 flex justify-between gap-6">
          {["Técnico HST", "Colaborador Acidentado", "Responsável da Área"].map((quem) => (
            <div key={quem} className="w-1/3 text-center">
              <div className="mt-10 border-t border-black pt-1 text-[0.72rem] font-semibold">{quem}</div>
            </div>
          ))}
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
