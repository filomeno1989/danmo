"use client";

/**
 * ChecklistImprimir - Folha A4 do Checklist de Manutenção (client).
 *
 * PORTO FIEL do impresso original do hub (oficina/checklist_print.html):
 * cabeçalho com o logo CORNELDER, azul #0d5ca8, linha de título com a
 * categoria e o tipo de revisão, caixa de campos, caixa de intervalo,
 * TABELA ÚNICA com cabeçalho de grupo (Sim/Não/Bom/Danificado) e
 * marcas ✓, comentários e assinaturas com imagem do Storage.
 */

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { pedir } from "@/components/oficina/ui-bits";
import {
  type ItemPreenchido,
  type ItemTemplate,
  type SecaoTemplate,
  type TemplateChecklist
} from "@/lib/oficina";

type Dados = {
  ok: boolean;
  checklist: {
    numero_obra?: string | null;
    horas_equipamento?: number | null;
    data_revisao?: string | null;
    horas_trabalho?: number | null;
    folha_numero?: string | null;
    executante?: string | null;
    executante_data?: string | null;
    encarregado?: string | null;
    encarregado_data?: string | null;
    observacoes_gerais?: string | null;
  };
  template: TemplateChecklist | null;
  secoes: SecaoTemplate[];
  itensTemplate: ItemTemplate[];
  itensResp: ItemPreenchido[];
  equip: { code: string } | null;
  colaboradores: { id: number; name: string; code?: string | null }[];
};

const URL_ASSINATURAS =
  "https://czgnbzxoeylicrqjvncd.supabase.co/storage/v1/object/public/assinaturas";

/** Data DD/MM/AAAA como o original deste impresso (traço quando vazio). */
function fData(s?: string | null): string {
  if (!s) return "-";
  const [a, m, d] = String(s).slice(0, 10).split("-");
  if (!a || !m || !d) return String(s);
  return `${d}/${m}/${a}`;
}

export function ChecklistImprimir({ checklistId }: { checklistId: number }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);

  useEffect(() => {
    if (!checklistId) return;
    pedir<Dados>(`/api/oficina/checklist/${checklistId}`)
      .then(setDados)
      .catch((e: Error) => setFalhou(e.message || "Checklist não encontrado."));
  }, [checklistId]);

  if (falhou) {
    return (
      <div className="p-8 text-sm">
        <p className="mb-2 font-bold">Não foi possível abrir o impresso.</p>
        <p className="mb-4 text-neutral-600">{falhou}</p>
        <Link href="/oficina/ordens" className="underline">
          Voltar às Ordens de Serviço
        </Link>
      </div>
    );
  }

  if (!dados || !dados.template) {
    return <p className="p-8 text-sm">A preparar a folha de impressão...</p>;
  }

  const { checklist, template, secoes, itensTemplate, itensResp, colaboradores } = dados;

  const isDiario = template.tipo === "diario";
  const tituloTipo =
    template.tipo === "eletrica"
      ? "REVISÃO - Eléctrica"
      : template.tipo === "mecanica"
        ? "REVISÃO - Mecânica"
        : "CHECK LIST DIARIO";

  const mapaResp = new Map(itensResp.map((r) => [r.template_item_id, r]));

  /** Encontra o código do colaborador pelo nome (imagem da assinatura). */
  function codigoDe(nome?: string | null): string | null {
    if (!nome) return null;
    return colaboradores.find((c) => c.name === nome)?.code || null;
  }

  const cabecalhoGrupo = isDiario ? (
    <>
      <th className="grupo-vazio" rowSpan={2}>
        Item
      </th>
      <th className="grupo-vazio" rowSpan={2}>
        Descrição do trabalho
      </th>
      <th className="grupo-header" colSpan={2}>
        Estado
      </th>
    </>
  ) : (
    <>
      <th className="grupo-vazio" rowSpan={2}>
        Item
      </th>
      <th className="grupo-vazio" rowSpan={2}>
        Descrição do trabalho
      </th>
      <th className="grupo-header" colSpan={2}>
        Executado
      </th>
      <th className="grupo-header" colSpan={2}>
        Estado
      </th>
      <th className="grupo-vazio" rowSpan={2}>
        Observações
      </th>
    </>
  );

  const cabecalhoColunas = isDiario ? (
    <>
      <th>Bom</th>
      <th>Danificado</th>
    </>
  ) : (
    <>
      <th>Sim</th>
      <th>Não</th>
      <th>Bom</th>
      <th>Danificado</th>
    </>
  );

  return (
    <div className="folha-fundo">
      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .folha-fundo {
          font-family: Arial, Calibri, sans-serif;
          font-size: 10.5px;
          background: #dcdcdc;
          color: #1a1a1a;
          min-height: 100vh;
        }
        .btn-bar { display: flex; justify-content: center; margin: 16px auto; }
        .btn-print {
          padding: 10px 30px; background: #0d5ca8; color: #fff; border: none;
          border-radius: 8px; font-size: 14px; font-weight: bold; cursor: pointer;
          font-family: Arial, sans-serif; box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        .folha {
          width: 210mm; margin: 0 auto 40px; background: #fff;
          box-shadow: 0 4px 30px rgba(0,0,0,0.3); padding: 12mm 14mm;
        }
        .ck-cabecalho {
          display: flex; align-items: center; justify-content: space-between;
          padding-bottom: 10px; border-bottom: 2px solid #0d5ca8; margin-bottom: 12px;
        }
        .ck-cabecalho img { height: 44px; }
        .ck-cab-titulo { text-align: center; }
        .ck-doc-tipo { font-size: 9px; letter-spacing: 1.5px; text-transform: uppercase; color: #0d5ca8; font-weight: bold; }
        .ck-doc-nome { font-size: 15px; font-weight: bold; margin-top: 2px; }
        .ck-ref { font-size: 9px; text-align: right; color: #555; font-weight: bold; }
        .ck-titles-linha { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 11px; }
        .ck-titles-linha .esq { font-weight: bold; }
        .ck-titles-linha .dir { color: #555; }
        .ck-fields { border: 1px solid #ccc; border-radius: 4px; margin-bottom: 10px; overflow: hidden; }
        .ck-fields div {
          display: flex; justify-content: space-between; padding: 5px 10px;
          border-bottom: 1px solid #eee; font-size: 10.5px;
        }
        .ck-fields div:last-child { border-bottom: none; }
        .ck-fields span:first-child { color: #666; }
        .ck-fields span:last-child { font-weight: bold; }
        .ck-intervalo {
          text-align: center; font-weight: bold; font-size: 11px; margin-bottom: 10px;
          border: 1px solid #0d5ca8; padding: 5px; background: #eaf2fb; color: #0d5ca8; border-radius: 4px;
        }
        table.ck-table { width: 100%; border-collapse: collapse; font-size: 9px; margin-bottom: 12px; }
        table.ck-table th {
          border: 1px solid #999; background: #0d5ca8; color: #fff; padding: 4px;
          font-size: 8px; text-transform: uppercase; font-family: Arial, sans-serif;
        }
        table.ck-table th.grupo-header { background: #094a8a; font-size: 7.5px; letter-spacing: .5px; }
        table.ck-table th.grupo-vazio { background: #0d5ca8; }
        table.ck-table td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
        .ck-secao-row td { background: #eaf2fb; font-weight: bold; font-size: 9.5px; color: #0d5ca8; }
        .ck-check { text-align: center; width: 32px; font-weight: bold; }
        .ck-comentarios {
          border: 1px solid #ccc; border-radius: 4px; padding: 8px 10px; font-size: 10px;
          min-height: 44px; margin-bottom: 14px;
        }
        .ck-comentarios .lbl { font-size: 8px; text-transform: uppercase; letter-spacing: 1px; color: #666; font-weight: bold; margin-bottom: 3px; }
        .ck-assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 20px; }
        .ck-ass-box { border-top: 1px solid #999; padding-top: 10px; font-size: 10px; min-height: 70px; }
        .ck-ass-box .assinatura-slot { height: 44px; display: flex; align-items: flex-end; justify-content: center; margin-bottom: 6px; }
        .ck-ass-box .assinatura-slot img { max-height: 42px; max-width: 90%; object-fit: contain; }
        .ck-ass-box .cargo { font-weight: bold; text-align: center; }
        .ck-ass-box .info { color: #555; margin-top: 2px; text-align: center; }
        @media print {
          .folha-fundo { background: #fff; }
          .btn-bar { display: none !important; }
          .folha { width: 100%; margin: 0; box-shadow: none; }
          @page { size: A4; margin: 10mm; }
          table.ck-table tr { page-break-inside: avoid; }
        }
      `}</style>

      <div className="btn-bar">
        <button type="button" className="btn-print" onClick={() => window.print()}>
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      <div className="folha">
        <div className="ck-cabecalho">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logos/CORNELDER.png" alt="Cornelder de Moçambique" />
          <div className="ck-cab-titulo">
            <div className="ck-doc-tipo">Documento de Manutenção</div>
            <div className="ck-doc-nome">{template.nome}</div>
          </div>
          <div className="ck-ref">{template.ref_versao || ""}</div>
        </div>

        <div className="ck-titles-linha">
          <div className="esq">{`${template.categoria_equipamento} - ${tituloTipo}`}</div>
          <div className="dir">Gabinete técnico</div>
        </div>

        <div className="ck-fields">
          <div>
            <span>Número da obra</span>
            <span>{checklist.numero_obra || "-"}</span>
          </div>
          <div>
            <span>Horas do equipamento</span>
            <span>{checklist.horas_equipamento != null ? `${checklist.horas_equipamento} h` : "-"}</span>
          </div>
          <div>
            <span>Data de revisão</span>
            <span>{fData(checklist.data_revisao)}</span>
          </div>
          <div>
            <span>Horas de trabalho</span>
            <span>{checklist.horas_trabalho != null ? `${checklist.horas_trabalho} h` : "-"}</span>
          </div>
          <div>
            <span>Folha número</span>
            <span>{checklist.folha_numero || "-"}</span>
          </div>
        </div>

        {!isDiario && template.intervalo_label && (
          <div className="ck-intervalo">{template.intervalo_label}</div>
        )}

        <table className="ck-table">
          <thead>
            <tr>{cabecalhoGrupo}</tr>
            <tr>{cabecalhoColunas}</tr>
          </thead>
          <tbody>
            {secoes.map((sec) => {
              const itens = itensTemplate.filter((it) => it.secao_id === sec.id);
              return (
                <Fragment key={sec.id}>
                  <tr className="ck-secao-row">
                    <td colSpan={isDiario ? 4 : 7}>{sec.nome_secao}</td>
                  </tr>
                  {itens.map((it) => {
                    const r = mapaResp.get(it.id);
                    return (
                      <tr key={it.id}>
                        <td className="ck-check">{it.numero_item ?? ""}</td>
                        <td>{it.descricao}</td>
                        {isDiario ? (
                          <>
                            <td className="ck-check">{r?.estado === "bom" ? "✓" : ""}</td>
                            <td className="ck-check">{r?.estado === "danificado" ? "✓" : ""}</td>
                          </>
                        ) : (
                          <>
                            <td className="ck-check">{r?.executado === "sim" ? "✓" : ""}</td>
                            <td className="ck-check">{r?.executado === "nao" ? "✓" : ""}</td>
                            <td className="ck-check">{r?.estado === "bom" ? "✓" : ""}</td>
                            <td className="ck-check">{r?.estado === "danificado" ? "✓" : ""}</td>
                            <td style={{ fontSize: "8.5px" }}>{r?.observacao || ""}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        <div className="ck-comentarios">
          <div className="lbl">Informações Complementares</div>
          <div>{checklist.observacoes_gerais || "-"}</div>
        </div>

        <div className="ck-assinaturas">
          <div className="ck-ass-box">
            <div className="assinatura-slot">
              <AssinaturaSlot codigo={codigoDe(checklist.executante)} />
            </div>
            <div className="cargo">Executante</div>
            <div className="info">
              {checklist.executante
                ? `${checklist.executante} - ${checklist.executante_data ? fData(checklist.executante_data) : "___/___/___"}`
                : "-"}
            </div>
          </div>
          <div className="ck-ass-box">
            <div className="assinatura-slot">
              <AssinaturaSlot codigo={codigoDe(checklist.encarregado)} />
            </div>
            <div className="cargo">Encarregado</div>
            <div className="info">
              {checklist.encarregado
                ? `${checklist.encarregado} - ${checklist.encarregado_data ? fData(checklist.encarregado_data) : "___/___/___"}`
                : "-"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Slot de assinatura como no hub: só mostra a imagem se existir no
 * Storage (bucket assinaturas, nome = código do colaborador); senão
 * fica o espaço em branco para assinar à mão.
 */
function AssinaturaSlot({ codigo }: { codigo: string | null }) {
  const [carregou, setCarregou] = useState(false);
  if (!codigo) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${URL_ASSINATURAS}/${encodeURIComponent(codigo)}.png`}
      alt="Assinatura"
      onLoad={() => setCarregou(true)}
      onError={() => setCarregou(false)}
      style={{ display: carregou ? undefined : "none" }}
    />
  );
}
