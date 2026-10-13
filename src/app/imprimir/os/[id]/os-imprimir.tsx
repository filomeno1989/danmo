"use client";

/**
 * OsImprimir - Folha A4 da Ordem de Reparação (client).
 * Reusa a API da ficha da obra; o layout é de papel (preto no branco).
 */

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { pedir } from "@/components/oficina/ui-bits";
import { formatarData, formatarDataHora, type LogEstado, type LogFisico } from "@/lib/oficina";

type DadosObra = {
  ok: boolean;
  os: {
    id: number;
    numero_obra?: string | null;
    data_abertura?: string | null;
    data_fecho?: string | null;
    status_atual: string;
    status_fisico?: string | null;
    descricao_avaria?: string | null;
    hora_equipamento?: number | null;
    unidade_medida?: string | null;
    sector?: string | null;
    nome_cliente?: string | null;
    aberto_por?: string[] | null;
    tipo_intervencao?: string[] | null;
    observacoes?: string | null;
  };
  equip: { code: string; fleet_type?: string | null; group_name?: string | null; model?: string | null } | null;
  timeline: LogEstado[];
  timelineFisico: LogFisico[];
  intervencoes: {
    id: number;
    shift_date?: string | null;
    time_start?: string | null;
    time_end?: string | null;
    hours?: number | null;
    description?: string | null;
    tecnicos?: { id: number; name: string }[];
  }[];
  pecas: {
    id: number;
    peca: string;
    data?: string | null;
    quantidade?: number | null;
    unidade?: string | null;
    colaborador?: string | null;
  }[];
};

export function OsImprimir({ osId }: { osId: number }) {
  const [dados, setDados] = useState<DadosObra | null>(null);

  useEffect(() => {
    if (!osId) return;
    pedir<DadosObra>(`/api/oficina/ordens/${osId}`)
      .then(setDados)
      .catch(() => setDados(null));
  }, [osId]);

  if (!dados) {
    return <p className="p-8 text-sm">A preparar a folha de impressão...</p>;
  }

  const { os, equip } = dados;
  const totalHoras = dados.intervencoes.reduce((s, r) => s + (r.hours || 0), 0);

  return (
    <div className="min-h-screen bg-neutral-200 py-6 print:bg-white print:py-0">
      <style jsx global>{`
        @media print {
          .btn-bar {
            display: none !important;
          }
          body {
            background: white !important;
          }
          @page {
            size: A4;
            margin: 12mm;
          }
        }
      `}</style>

      <div className="btn-bar mx-auto mb-4 flex max-w-[210mm] justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
        >
          <Printer className="size-4" aria-hidden />
          Imprimir / Guardar PDF
        </button>
      </div>

      <div className="mx-auto max-w-[210mm] bg-white p-10 text-[12px] leading-snug text-neutral-900 shadow-lg print:max-w-none print:p-0 print:shadow-none">
        {/* Cabeçalho da empresa */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-neutral-900 pb-3">
          <div>
            <p className="text-lg font-black tracking-tight">Danmo Service System, Lda</p>
            <p className="text-[11px] text-neutral-600">Porto da Beira · Nuit: 400024022</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Documento Técnico</p>
            <p className="text-base font-bold">Ordem de Reparação</p>
            <p className="text-[11px] text-neutral-600">Nº {os.numero_obra || "S/Nº"}</p>
            <p className="text-[11px] text-neutral-600">Emitida em {formatarData(new Date().toISOString())}</p>
          </div>
        </div>

        {/* Identificação */}
        <table className="mt-4 w-full border-collapse text-[11px]">
          <tbody>
            <tr>
              <TdRot>Cliente</TdRot>
              <TdVal>{os.nome_cliente || "CdM"}</TdVal>
              <TdRot>Máquina</TdRot>
              <TdVal>{equip?.code || "-"}</TdVal>
            </tr>
            <tr>
              <TdRot>Tipo / Categoria</TdRot>
              <TdVal>{equip?.fleet_type || "-"}</TdVal>
              <TdRot>Grupo</TdRot>
              <TdVal>{equip?.group_name || "-"}</TdVal>
            </tr>
            <tr>
              <TdRot>Sector</TdRot>
              <TdVal>{os.sector || "-"}</TdVal>
              <TdRot>Contador</TdRot>
              <TdVal>
                {os.hora_equipamento != null ? `${os.hora_equipamento} ${os.unidade_medida || "h"}` : "-"}
              </TdVal>
            </tr>
            <tr>
              <TdRot>Abertura</TdRot>
              <TdVal>{formatarData(os.data_abertura)}</TdVal>
              <TdRot>Fecho</TdRot>
              <TdVal>{os.data_fecho ? formatarData(os.data_fecho) : "-"}</TdVal>
            </tr>
            <tr>
              <TdRot>Estado da Obra</TdRot>
              <TdVal>{os.status_atual}</TdVal>
              <TdRot>Estado Físico</TdRot>
              <TdVal>{os.status_fisico || "-"}</TdVal>
            </tr>
            <tr>
              <TdRot>Aberto por</TdRot>
              <TdVal colSpan={3}>{(os.aberto_por || []).join(", ") || "-"}</TdVal>
            </tr>
          </tbody>
        </table>

        {/* Avaria */}
        <Secao titulo="Avaria / Motivo de Entrada">
          <p className="whitespace-pre-line">{os.descricao_avaria || "-"}</p>
          {(os.tipo_intervencao || []).length > 0 && (
            <p className="mt-1 text-[11px] text-neutral-600">
              Tipos: {os.tipo_intervencao!.join(", ")}
            </p>
          )}
        </Secao>

        {/* Mão de obra */}
        <Secao titulo="Descrição da Mão de Obra">
          {dados.intervencoes.length === 0 ? (
            <p className="text-neutral-500">Sem intervenções registadas.</p>
          ) : (
            <table className="w-full border-collapse text-[10.5px]">
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Início</Th>
                  <Th>Fim</Th>
                  <Th>Horas</Th>
                  <Th>Técnicos</Th>
                  <Th>Descrição</Th>
                </tr>
              </thead>
              <tbody>
                {dados.intervencoes.map((r) => (
                  <tr key={r.id}>
                    <Tdc className="border">{formatarData(r.shift_date)}</Tdc>
                    <Tdc className="border">{(r.time_start || "").slice(0, 5)}</Tdc>
                    <Tdc className="border">{(r.time_end || "").slice(0, 5)}</Tdc>
                    <Tdc className="border text-center">{r.hours ?? 0}h</Tdc>
                    <Tdc className="border">{(r.tecnicos || []).map((t) => t.name).join(", ")}</Tdc>
                    <Tdc className="border whitespace-pre-line">{r.description || "-"}</Tdc>
                  </tr>
                ))}
                <tr>
                  <Tdc className="border text-right font-bold" colSpan={3}>
                    Total
                  </Tdc>
                  <Tdc className="border text-center font-bold">{Math.round(totalHoras * 100) / 100}h</Tdc>
                  <Tdc className="border" colSpan={2} />
                </tr>
              </tbody>
            </table>
          )}
        </Secao>

        {/* Peças */}
        <Secao titulo="Peças Aplicadas">
          {dados.pecas.length === 0 ? (
            <p className="text-neutral-500">Sem peças registadas.</p>
          ) : (
            <table className="w-full border-collapse text-[10.5px]">
              <thead>
                <tr>
                  <Th>Peça / Material</Th>
                  <Th>Data</Th>
                  <Th>Qtd</Th>
                  <Th>Unidade</Th>
                  <Th>Colaborador</Th>
                </tr>
              </thead>
              <tbody>
                {dados.pecas.map((p) => (
                  <tr key={p.id}>
                    <Tdc className="border">{p.peca}</Tdc>
                    <Tdc className="border">{formatarData(p.data)}</Tdc>
                    <Tdc className="border text-center">{p.quantidade || 1}</Tdc>
                    <Tdc className="border">{p.unidade || "Unidade"}</Tdc>
                    <Tdc className="border">{p.colaborador || "-"}</Tdc>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Secao>

        {/* Histórico */}
        <Secao titulo="Histórico da Obra">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">Estado da Obra</p>
              <ul className="space-y-0.5 text-[10.5px]">
                {dados.timeline.map((ev) => (
                  <li key={ev.id}>
                    {ev.status_anterior ? `${ev.status_anterior} → ` : ""}
                    <strong>{ev.status_novo}</strong>
                    {ev.responsavel ? ` - ${ev.responsavel}` : ""} ({formatarDataHora(ev.data_mudanca)})
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">Estado Físico</p>
              <ul className="space-y-0.5 text-[10.5px]">
                {dados.timelineFisico.map((ev) => (
                  <li key={ev.id}>
                    <strong>{ev.status_fisico}</strong> ({formatarDataHora(ev.data_mudanca)})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Secao>

        {/* Assinaturas */}
        <div className="mt-8 grid grid-cols-3 gap-8 text-center text-[10.5px]">
          <div>
            <div className="h-10 border-b border-neutral-400" />
            <p className="mt-1">Executado por</p>
          </div>
          <div>
            <div className="h-10 border-b border-neutral-400" />
            <p className="mt-1">Chefe da Oficina</p>
          </div>
          <div>
            <div className="h-10 border-b border-neutral-400" />
            <p className="mt-1">Cliente / CdM</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <p className="mb-1 border-b border-neutral-300 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-neutral-700">
        {titulo}
      </p>
      {children}
    </div>
  );
}

function TdRot({ children }: { children: React.ReactNode }) {
  return (
    <td className="w-32 border border-neutral-300 bg-neutral-100 px-2 py-1 font-semibold text-neutral-600">
      {children}
    </td>
  );
}

function TdVal({ children, colSpan }: { children: React.ReactNode; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className="border border-neutral-300 px-2 py-1">
      {children}
    </td>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="border border-neutral-300 bg-neutral-100 px-2 py-1 text-left font-bold">{children}</th>
  );
}

function Tdc({
  children,
  className,
  colSpan
}: {
  children?: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={"px-2 py-1 " + (className || "")}>
      {children}
    </td>
  );
}
