"use client";

/**
 * PedidoImprimir - Papel A5 PAISAGEM do Pedido de Aquisição (cliente).
 *
 * Mesmo desenho do imprimir.html do hub (Times New Roman, cabeçalho
 * verde DANMO/MMM fixo, caixa de referência verde, tabela de materiais
 * com cabeçalho #1f2d17, 3 assinaturas e rodapé com o código
 * DAN_ADO_FR_010_REV01_16.08.2021). A5 paisagem: @page size A5
 * landscape; a folha no ecrã tem 210mm de largura (a altura de A5
 * paisagem).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import {
  fmtDataAq,
  numeroFmt,
  textoReferencia,
  type ItemAquisicao,
  type PedidoAquisicao
} from "@/lib/aquisicao";
import { LOGO_DANMO, LOGO_MESQUITA, LOGO_MMM } from "../faturacao/logos";

type Resposta = { ok: boolean; pedido: PedidoAquisicao; itens: ItemAquisicao[] };

type Alturas = { cab: number; rod: number } | null;

/**
 * Tabela mágica de margens dinâmicas (o hub media com ajustarMargens
 * Impressao + beforeprint e folga de +20px; a Faturação do portal usa o
 * mesmo mecanismo por hook). Na impressão o cabeçalho e o rodapé ficam
 * FIXOS no papel e a tabela de layout repete um espaço com a ALTURA
 * DELES em todas as páginas; sem a medida, o espaço nasce com altura 0
 * e o cabeçalho/rodapé de fundo branco TAPAM o conteúdo.
 */
function useAlturasImpressao(activo: boolean) {
  const [alturas, setAlturas] = useState<Alturas>(null);
  const cabRef = useRef<HTMLDivElement | null>(null);
  const rodRef = useRef<HTMLDivElement | null>(null);

  const medir = useCallback(() => {
    if (cabRef.current && rodRef.current) {
      setAlturas({
        cab: cabRef.current.offsetHeight + 20,
        rod: rodRef.current.offsetHeight + 20
      });
    }
  }, []);

  useEffect(() => {
    if (!activo) return;
    medir();
    const t = setTimeout(medir, 200);
    window.addEventListener("beforeprint", medir);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeprint", medir);
    };
  }, [activo, medir]);

  return { alturas, cabRef, rodRef };
}

export function PedidoImprimir({ pedidoId }: { pedidoId: string }) {
  const [pedido, setPedido] = useState<PedidoAquisicao | null>(null);
  const [itens, setItens] = useState<ItemAquisicao[]>([]);
  const [falha, setFalha] = useState("");
  const { alturas, cabRef, rodRef } = useAlturasImpressao(!!pedido);

  useEffect(() => {
    pedir<Resposta>(`/api/aquisicao/pedidos/${pedidoId}`)
      .then((r) => {
        setPedido(r.pedido);
        setItens(r.itens || []);
      })
      .catch((e: Error) => setFalha(e.message));
  }, [pedidoId]);

  useEffect(() => {
    if (pedido) document.title = `Pedido de Aquisição ${numeroFmt(pedido.ano, pedido.numero)}`;
  }, [pedido]);

  if (falha) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-destructive">{falha}</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/aquisicao">Voltar</Link>
        </Button>
      </div>
    );
  }
  if (!pedido) {
    return <div className="p-10 text-center text-sm text-muted-foreground">A carregar pedido...</div>;
  }

  const numeroTxt = numeroFmt(pedido.ano, pedido.numero);

  return (
    <>
      <style>{cssPapel(alturas)}</style>
      <div className="preview-bar">
        <div className="preview-bar-left">
          <Link href="/aquisicao" className="btn-back">
            <ArrowLeft className="inline size-4" aria-hidden /> Voltar
          </Link>
          <span className="preview-title">
            Pedido Nº {numeroTxt} · {pedido.fornecedor_nome || "-"}
          </span>
        </div>
        <button className="btn-print" onClick={() => window.print()}>
          <Printer className="inline size-4" aria-hidden /> Imprimir / Guardar PDF
        </button>
      </div>

      <div className="folha-wrap">
        <div className="folha">
          {/* CABEÇALHO REAL (fixo na impressão, repete em cada página) */}
          <div className="cabecalho" ref={cabRef}>
            <div className="cab-esq">
              <img src={LOGO_DANMO} alt="Danmo" className="logo-cab" />
              <div>
                <div className="empresa-nome">Danmo Service System, Lda</div>
                <div className="empresa-sub">Porto da Beira · Nuit: 400024022</div>
              </div>
            </div>
            <div className="cab-centro">
              <div className="doc-tipo">Documento Administrativo</div>
              <div className="doc-titulo">Pedido de Aquisição de Material</div>
            </div>
            <div className="cab-dir">
              <div className="id-box">
                <div className="lbl">Pedido nº</div>
                <div className="val">{numeroTxt}</div>
              </div>
              <div className="id-box">
                <div className="lbl">Data</div>
                <div className="val val-data">{fmtDataAq(pedido.data_pedido)}</div>
              </div>
              <img src={LOGO_MMM} alt="Made in Mozambique" className="logo-mmm" />
            </div>
          </div>

          {/* TABELA DE LAYOUT: empurra o conteúdo para dar espaço ao
              cabeçalho/rodapé em TODAS as páginas impressas */}
          <table className="tabela-layout-impressao">
            <thead>
              <tr><td><div className="print-header-space" /></td></tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="conteudo">
                    <div className="pa-ref">{textoReferencia(pedido)}</div>

                    <table className="pa-tabela">
                      <thead>
                        <tr>
                          <th className="col-n">Nº</th>
                          <th>Designação</th>
                          <th className="col-qnt">Qtd.</th>
                          <th className="col-un">Un.</th>
                          <th>Aplicação</th>
                          <th>Observação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itens.map((it, idx) => (
                          <tr key={it.id || idx}>
                            <td className="col-n">{it.numero_ordem || idx + 1}</td>
                            <td>{it.designacao || ""}</td>
                            <td className="col-qnt">{it.quantidade}</td>
                            <td className="col-un">{it.unidade || ""}</td>
                            <td>{it.aplicacao || ""}</td>
                            <td>{it.observacao || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {pedido.observacao_geral ? (
                      <div className="pa-obs-geral">
                        <b>Observação Geral</b>
                        <span>{pedido.observacao_geral}</span>
                      </div>
                    ) : null}

                    <div className="assinaturas-wrap">
                      <div className="ass-box">
                        <div className="ass-linha">{pedido.solicitante || ""}</div>
                        <div className="ass-cargo">Solicitante</div>
                        <div className="ass-data">Data: ___/___/_____</div>
                      </div>
                      <div className="ass-box">
                        <div className="ass-linha"></div>
                        <div className="ass-cargo">Supervisor / Gestor</div>
                        <div className="ass-data">Data: ___/___/_____</div>
                      </div>
                      <div className="ass-box">
                        <div className="ass-linha"></div>
                        <div className="ass-cargo">Chefe das Oficinas</div>
                        <div className="ass-data">Data: ___/___/_____</div>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr><td><div className="print-footer-space" /></td></tr>
            </tfoot>
          </table>

          {/* RODAPÉ REAL (fixo na impressão, repete em cada página) */}
          <div className="rodape-legal" ref={rodRef}>
            <div className="rodape-texto">
              Código: DAN_ADO_FR_010_REV01_16.08.2021<br />
              Este documento é propriedade da DANMO. Não é permitida a sua reprodução sem autorização.<br />
              Depois de impresso este documento é considerado cópia não controlada.
            </div>
            <div className="rodape-logo">
              <img src={LOGO_MESQUITA} alt="Grupo Mesquita" className="logo-mesquita" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
 * CSS do papel (fiel ao imprimir.html do hub, A5 paisagem)
 * ------------------------------------------------------------------ */

const cssPapel = (alturas: Alturas) => `
body { background: #dcdcdc; }
.preview-bar { max-width: 860px; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.preview-bar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.btn-print { background: #10B981; color: #fff; border: none; padding: 10px 24px; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: bold; font-family: 'Times New Roman', serif; box-shadow: 0 2px 6px rgba(0,0,0,0.15); display: inline-flex; align-items: center; gap: 6px; }
.btn-print:hover { background: #059669; }
.btn-back { background: #fff; color: #10B981; border: 1px solid #10B981; padding: 9px 18px; border-radius: 8px; font-size: 14px; font-weight: bold; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; font-family: 'Times New Roman', serif; }
.btn-back:hover { color: #059669; border-color: #059669; }
.preview-title { font-size: 15px; font-weight: 700; color: #065f46; }

/* A5 paisagem: 210mm de largura. Altura livre no ecrã (auto), fixa em
   páginas na impressão */
.folha-wrap { max-width: 860px; margin: 0 auto 40px; }
.folha { width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 4px 30px rgba(0,0,0,0.3); padding: 7mm 10mm 10mm; font-family: 'Times New Roman', Times, serif; font-size: 10.5px; color: #1a1a1a; }

/* CABEÇALHO */
.cabecalho { display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px; border-bottom: 3px solid #10B981; margin-bottom: 8px; }
.cab-esq { display: flex; align-items: center; gap: 8px; }
.logo-cab { height: 34px; width: auto; object-fit: contain; }
.empresa-nome { font-size: 11px; font-weight: bold; letter-spacing: .3px; }
.empresa-sub { font-size: 7.5px; color: #555; line-height: 1.4; margin-top: 1px; }
.cab-centro { text-align: center; }
.doc-tipo { font-size: 7.5px; letter-spacing: 2px; text-transform: uppercase; color: #059669; font-weight: bold; margin-bottom: 2px; }
.doc-titulo { font-size: 15px; font-weight: bold; letter-spacing: .4px; }
.cab-dir { display: flex; align-items: center; gap: 10px; }
.id-box { text-align: right; }
.id-box .lbl { font-size: 7px; text-transform: uppercase; letter-spacing: .8px; color: #666; }
.id-box .val { font-size: 13px; font-weight: bold; }
.id-box .val-data { font-size: 11px; }
.logo-mmm { height: 30px; width: auto; object-fit: contain; }

/* REFERÊNCIA */
.pa-ref {
  font-size: 10.5px; font-weight: bold; text-align: center; margin-bottom: 8px;
  background: #eaf7f0; border: 1px solid #b7e4cd; border-radius: 5px; padding: 5px 8px;
  color: #065f46;
}

/* TABELA DE ITENS */
table.pa-tabela { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 8px; }
table.pa-tabela th {
  background: #1f2d17; color: #fff; font-weight: bold; font-size: 8.5px;
  text-transform: uppercase; letter-spacing: .4px; padding: 5px 6px; text-align: left;
  font-family: 'Times New Roman', serif; border-bottom: 2px solid #10B981;
}
table.pa-tabela td { padding: 4px 6px; border-bottom: 1px solid #e5e5e5; vertical-align: top; }
table.pa-tabela tbody tr:nth-child(even) { background: #f7faf5; }
table.pa-tabela th.col-n, table.pa-tabela td.col-n { width: 24px; text-align: center; }
table.pa-tabela th.col-qnt, table.pa-tabela td.col-qnt { width: 40px; text-align: center; }
table.pa-tabela th.col-un, table.pa-tabela td.col-un { width: 46px; text-align: center; }

.pa-obs-geral { font-size: 9.5px; margin-bottom: 8px; }
.pa-obs-geral b { color: #059669; text-transform: uppercase; font-size: 8px; letter-spacing: .5px; display: block; margin-bottom: 2px; }

/* ASSINATURAS · horizontal, ao estilo do print da oficina */
.assinaturas-wrap { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; margin-bottom: 4px; }
.ass-box { border: 1px solid #ccc; border-radius: 5px; padding: 8px; text-align: center; min-height: 50px; display: flex; flex-direction: column; justify-content: flex-end; }
.ass-linha { border-bottom: 1px solid #999; height: 24px; font-size: 10.5px; font-style: italic; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; color: #333; }
.ass-cargo { font-size: 8px; text-transform: uppercase; letter-spacing: .6px; color: #666; margin-top: 4px; }
.ass-data { font-size: 7.5px; color: #999; margin-top: 1px; }

/* RODAPÉ LEGAL */
.rodape-legal {
  display: flex; justify-content: space-between; align-items: flex-end;
  border-top: 1px solid #ccc; padding-top: 4px;
}
.rodape-texto { font-size: 6.5px; color: #777; line-height: 1.4; }
.logo-mesquita { height: 20px; width: auto; object-fit: contain; }

/* TABELA MÁGICA: repete o espaço do cabeçalho/rodapé em cada página impressa */
.tabela-layout-impressao { width: 100%; border-collapse: collapse; border: none; }
.tabela-layout-impressao td, .tabela-layout-impressao th { padding: 0; border: none; }

@media screen {
  .print-header-space, .print-footer-space { display: none; }
}

@media print {
  body { background: #fff; }
  .preview-bar { display: none !important; }
  .folha-wrap { margin: 0; }
  .folha { width: 100%; margin: 0; box-shadow: none; padding: 0; }

  @page { size: A5 landscape; margin: 0; }

  .cabecalho {
    position: fixed; top: 0; left: 0; right: 0;
    background: #fff; padding: 6mm 10mm 0; margin-bottom: 0; z-index: 1000;
  }
  .rodape-legal {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: #fff; padding: 0 10mm 5mm; margin-top: 0; z-index: 1000;
  }
  .conteudo { padding: 0 10mm; }

  /* Margens dinâmicas medidas no navegador (folga +20px igual ao hub);
     sem isto os espaços ficam com 0 e o cabeçalho/rodapé tapam o conteúdo. */
  .print-header-space { height: ${alturas ? alturas.cab : 120}px !important; }
  .print-footer-space { height: ${alturas ? alturas.rod : 80}px !important; }

  table.pa-tabela tbody tr, .assinaturas-wrap { page-break-inside: avoid; }
  table.pa-tabela thead { display: table-header-group; }
  /* O cabeçalho da tabela é verde-escuro com texto branco: com
     print-color-adjust exact o texto nunca imprime invisível em papel
     quando o navegador sai sem Background graphics (lição do toner). */
  table.pa-tabela th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;
