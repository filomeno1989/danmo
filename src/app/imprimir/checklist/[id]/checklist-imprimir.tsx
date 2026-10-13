"use client";

/**
 * ChecklistImprimir - Folha A4 do Checklist de Manutenção (client).
 * Mostra o template, as respostas dadas e as assinaturas (com imagem
 * do Storage quando existe, pelo código do colaborador).
 */

import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import { pedir } from "@/components/oficina/ui-bits";
import { formatarData, type ItemPreenchido, type ItemTemplate, type SecaoTemplate } from "@/lib/oficina";

type Dados = {
  ok: boolean;
  checklist: {
    numero_obra?: string | null;
    horas_equipamento?: number | null;
    data_revisao?: string | null;
    horas_trabalho?: number | null;
    folha_numero?: string | null;
    executante?: string | null;
    encarregado?: string | null;
    observacoes_gerais?: string | null;
  };
  template: { nome: string; ref_versao?: string | null; tipo: string } | null;
  secoes: SecaoTemplate[];
  itensTemplate: ItemTemplate[];
  itensResp: ItemPreenchido[];
  equip: { code: string } | null;
};

const URL_ASSINATURAS =
  "https://czgnbzxoeylicrqjvncd.supabase.co/storage/v1/object/public/assinaturas";

export function ChecklistImprimir({ checklistId }: { checklistId: number }) {
  const [dados, setDados] = useState<Dados | null>(null);

  useEffect(() => {
    if (!checklistId) return;
    pedir<Dados>(`/api/oficina/checklist/${checklistId}`)
      .then(setDados)
      .catch(() => setDados(null));
  }, [checklistId]);

  if (!dados || !dados.template) {
    return <p className="p-8 text-sm">A preparar a folha de impressão...</p>;
  }

  const { checklist, template, secoes, itensTemplate, itensResp, equip } = dados;
  const respostaDe = new Map(itensResp.map((r) => [r.template_item_id, r]));
  const tipoDiario = template.tipo === "diario";

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
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-4 border-b-2 border-neutral-900 pb-3">
          <div>
            <p className="text-lg font-black tracking-tight">Danmo Service System, Lda</p>
            <p className="text-[11px] text-neutral-600">Porto da Beira · Nuit: 400024022</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Documento Técnico</p>
            <p className="text-base font-bold">Checklist de Manutenção</p>
            <p className="text-[11px] text-neutral-600">{template.nome}</p>
            <p className="text-[11px] text-neutral-600">{template.ref_versao || ""}</p>
          </div>
        </div>

        {/* Dados */}
        <table className="mt-4 w-full border-collapse text-[11px]">
          <tbody>
            <tr>
              <TdRot>Máquina</TdRot>
              <TdVal>{equip?.code || "-"}</TdVal>
              <TdRot>Nº Obra</TdRot>
              <TdVal>{checklist.numero_obra || "-"}</TdVal>
            </tr>
            <tr>
              <TdRot>Horas Equip.</TdRot>
              <TdVal>{checklist.horas_equipamento != null ? `${checklist.horas_equipamento} h` : "-"}</TdVal>
              <TdRot>Data da Revisão</TdRot>
              <TdVal>{formatarData(checklist.data_revisao)}</TdVal>
            </tr>
            <tr>
              <TdRot>Horas de Trabalho</TdRot>
              <TdVal>{checklist.horas_trabalho ?? "-"}</TdVal>
              <TdRot>Folha Nº</TdRot>
              <TdVal>{checklist.folha_numero || "-"}</TdVal>
            </tr>
          </tbody>
        </table>

        {/* Legenda */}
        <p className="mt-2 text-[10px] text-neutral-500">
          Sim / Não - o item foi executado? · Bom / Danificado - estado encontrado
          {tipoDiario ? " (checklist diário: só o estado)" : ""}
        </p>

        {/* Secções */}
        {secoes.map((sec) => {
          const itens = itensTemplate.filter((it) => it.secao_id === sec.id);
          if (!itens.length) return null;
          return (
            <div key={sec.id} className="mt-4">
              <p className="mb-1 border-b border-neutral-400 pb-0.5 text-[11px] font-bold uppercase tracking-wide">
                {sec.nome_secao}
              </p>
              <table className="w-full border-collapse text-[10.5px]">
                <thead>
                  <tr>
                    <Th className="w-8">Nº</Th>
                    <Th>Descrição</Th>
                    {!tipoDiario && <Th className="w-14">Execut.</Th>}
                    <Th className="w-20">Estado</Th>
                    <Th>Observação</Th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((it) => {
                    const r = respostaDe.get(it.id);
                    return (
                      <tr key={it.id}>
                        <Tdc className="border text-center">{it.numero_item ?? ""}</Tdc>
                        <Tdc className="border">{it.descricao}</Tdc>
                        {!tipoDiario && (
                          <Tdc className="border text-center font-bold">
                            {r?.executado === "sim" ? "SIM" : r?.executado === "nao" ? "NÃO" : ""}
                          </Tdc>
                        )}
                        <Tdc className="border text-center font-bold">
                          {r?.estado === "bom" ? "BOM" : r?.estado === "danificado" ? "DANIF." : ""}
                        </Tdc>
                        <Tdc className="border">{r?.observacao || ""}</Tdc>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* Comentários */}
        {checklist.observacoes_gerais && (
          <div className="mt-4">
            <p className="mb-1 border-b border-neutral-300 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-neutral-700">
              Comentários
            </p>
            <p className="whitespace-pre-line">{checklist.observacoes_gerais}</p>
          </div>
        )}

        {/* Assinaturas */}
        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-[10.5px]">
          <div>
            <Assinatura codigo={codigoDe(checklist.executante, dados)} />
            <p className="mt-1 border-t border-neutral-400 pt-1 font-semibold">{checklist.executante || "Executante"}</p>
            <p className="text-neutral-500">Executante</p>
          </div>
          <div>
            <Assinatura codigo={codigoDe(checklist.encarregado, dados)} />
            <p className="mt-1 border-t border-neutral-400 pt-1 font-semibold">{checklist.encarregado || "Encarregado"}</p>
            <p className="text-neutral-500">Encarregado</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Encontra o código do colaborador pelo nome (para a imagem da assinatura). */
function codigoDe(nome: string | null | undefined, dados: Dados): string | null {
  if (!nome) return null;
  // A API devolve colaboradores só com id/name/code
  const mapa = new Map(
    ((dados as unknown as { colaboradores?: { name: string; code?: string | null }[] }).colaboradores || []).map(
      (c) => [c.name, c.code || null]
    )
  );
  return mapa.get(nome) || null;
}

function Assinatura({ codigo }: { codigo: string | null }) {
  if (!codigo) return <div className="h-11" />;
  return (
    <div className="flex h-11 items-end justify-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${URL_ASSINATURAS}/${encodeURIComponent(codigo)}.png`}
        alt="Assinatura"
        className="max-h-10 max-w-[90%] object-contain"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
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

function TdVal({ children }: { children: React.ReactNode }) {
  return <td className="border border-neutral-300 px-2 py-1">{children}</td>;
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={"border border-neutral-300 bg-neutral-100 px-2 py-1 text-left font-bold " + (className || "")}>
      {children}
    </th>
  );
}

function Tdc({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={"px-2 py-1 " + (className || "")}>{children}</td>;
}
