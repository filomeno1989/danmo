"use client";

/**
 * FaturaImprimir - Papel A4 da Faturação (cliente).
 *
 * Mesma estrutura visual do print.html do hub (Times New Roman, cabeçalho
 * fixo com logos, tabela de itens, totais, extenso, assinatura e rodapé
 * com o código DAN_ADO_FR_030_REV02), agora com dados do portal e a
 * novidade do Anexo de Material do Cliente (modo=anexo): lista as linhas
 * marcadas "Do cliente" com valor zero, não faturadas.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import {
  dataExtenso,
  escaparHTML,
  fmtData,
  fmtNum,
  numPorExtenso,
  textoSemTags,
  type DocFaturacao,
  type ItemFaturacao,
  type TecnicoFat
} from "@/lib/faturacao";
import { LOGO_DANMO, LOGO_MESQUITA, LOGO_MMM } from "./logos";

type Resposta = { ok: boolean; documento: DocFaturacao; itens: ItemFaturacao[] };

type Alturas = { cab: number; rod: number } | null;

/**
 * Tabela mágica de margens dinâmicas (herdada do print.html do hub):
 * na impressão o cabeçalho e o rodapé ficam FIXOS no papel e a tabela
 * de layout repete um espaço com a ALTURA DELES em todas as páginas.
 * Sem a medida, o espaço nasce com altura 0 e o cabeçalho/rodapé de
 * fundo branco TAPAM o conteúdo: a folha sai cortada na impressora
 * mesmo estando inteira na pré-visualização do ecrã. Mede-se no
 * navegador (carga + 200ms + beforeprint) com folga de +15px, igual
 * ao hub (a página da OS imprime com +25px pelo mesmo mecanismo).
 */
function useAlturasImpressao(activo: boolean) {
  const [alturas, setAlturas] = useState<Alturas>(null);
  const cabRef = useRef<HTMLDivElement | null>(null);
  const rodRef = useRef<HTMLDivElement | null>(null);

  const medir = useCallback(() => {
    if (cabRef.current && rodRef.current) {
      setAlturas({
        cab: cabRef.current.offsetHeight + 15,
        rod: rodRef.current.offsetHeight + 15
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

export function FaturaImprimir({ docId, anexo }: { docId: string; anexo: boolean }) {
  const [doc, setDoc] = useState<DocFaturacao | null>(null);
  const [itens, setItens] = useState<ItemFaturacao[]>([]);
  const [falha, setFalha] = useState("");
  const { alturas, cabRef, rodRef } = useAlturasImpressao(!!doc);

  useEffect(() => {
    pedir<Resposta>(`/api/faturacao/documentos/${docId}`)
      .then((r) => {
        setDoc(r.documento);
        setItens(r.itens || []);
      })
      .catch((e: Error) => setFalha(e.message));
  }, [docId]);

  const tecnicosIds = useMemo(
    () => [...new Set(itens.map((i) => i.tecnico_id).filter(Boolean))] as string[],
    [itens]
  );

  useEffect(() => {
    if (!tecnicosIds.length) return;
    pedir<{ tecnicos: TecnicoFat[] }>("/api/faturacao/tecnicos")
      .then(() => {
        /* os nomes já vêm nas linhas (tecnico_nome); este pedido só
           garante os dados caso uma linha antiga não tenha cópia */
      })
      .catch(() => {});
  }, [tecnicosIds.length]);

  useEffect(() => {
    if (doc) document.title = `Danmo SS - ${doc.tipo === "fatura" ? "Fatura" : "Cotação"} ${doc.numero}`;
  }, [doc]);

  if (falha) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-destructive">{falha}</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/faturacao">Voltar</Link>
        </Button>
      </div>
    );
  }
  if (!doc) {
    return <div className="p-10 text-center text-sm text-muted-foreground">A carregar documento...</div>;
  }

  const tipoLabel = doc.tipo === "fatura" ? "FATURA" : "COTAÇÃO";
  const taxa = Number(doc.taxa_cambio) || 64;
  const totalMzn = doc.moeda === "USD" ? (Number(doc.total) || 0) * taxa : Number(doc.total) || 0;
  const itensDoDoc = itens.filter((i) => i.item_tipo !== "material_cliente");
  const itensCliente = itens.filter((i) => i.item_tipo === "material_cliente");

  if (anexo) {
    return <PapelAnexo doc={doc} itensCliente={itensCliente} />;
  }

  const isMao = doc.servico === "mao";
  const isMat = doc.servico === "material";

  const linhas = itensDoDoc.map((it, idx) => {
    const nome = it.tecnico_nome || "-";
    if (isMao) {
      return (
        <tr key={it.id || idx}>
          <td>{idx + 1}</td>
          <td>{escaparHTML(nome)}</td>
          <td className="r">{it.qtd}</td>
          <td className="r">{it.tempo}</td>
          <td className="r">{escaparHTML(it.unidade)}</td>
          <td className="r">{fmtNum(Number(it.valor_unit) || 0)}</td>
          <td className="r b">{fmtNum(Number(it.total) || 0)}</td>
        </tr>
      );
    }
    if (isMat) {
      return (
        <tr key={it.id || idx}>
          <td>{idx + 1}</td>
          <td>{escaparHTML(it.descricao || "-")}</td>
          <td className="r">{it.qtd}</td>
          <td className="r">{escaparHTML(it.unidade)}</td>
          <td className="r">{fmtNum(Number(it.valor_unit) || 0)}</td>
          <td className="r b">{fmtNum(Number(it.total) || 0)}</td>
        </tr>
      );
    }
    const tipoIt = it.item_tipo === "mao" ? "Mão-de-Obra" : "Material";
    const desc = it.item_tipo === "mao" ? nome : escaparHTML(it.descricao || "-");
    const tempo = it.item_tipo === "mao" ? `${it.tempo} ${escaparHTML(it.unidade)}` : escaparHTML(it.unidade);
    return (
      <tr key={it.id || idx}>
        <td>{idx + 1}</td>
        <td>{tipoIt}</td>
        <td>{desc}</td>
        <td className="r">{it.qtd}</td>
        <td className="r">{tempo}</td>
        <td className="r">{fmtNum(Number(it.valor_unit) || 0)}</td>
        <td className="r b">{fmtNum(Number(it.total) || 0)}</td>
      </tr>
    );
  });

  const desconto = Number(doc.desconto) || 0;

  return (
    <>
      <style>{cssPapel(alturas)}</style>
      <div className="preview-bar">
        <div className="preview-bar-left">
          <Link href="/faturacao" className="btn-back">
            <ArrowLeft className="inline size-4" aria-hidden /> Voltar
          </Link>
          <span className="preview-title">
            {tipoLabel} Nº {doc.numero} · {doc.cliente_nome}
          </span>
          {itensCliente.length > 0 && (
            <a className="btn-back" href={`/imprimir/faturacao/${doc.id}?modo=anexo`} target="_blank" rel="noreferrer">
              Anexo de Material ({itensCliente.length} linha{itensCliente.length > 1 ? "s" : ""})
            </a>
          )}
        </div>
        <button className="btn-print" onClick={() => window.print()}>
          <Printer className="inline size-4" aria-hidden /> Imprimir / Guardar PDF
        </button>
      </div>

      <div className="doc-wrap">
        <div className="doc-page">
          <div className="doc-header" ref={cabRef}>
            <div className="doc-header-inner">
              <img src={LOGO_DANMO} className="logo-danmo" alt="Danmo SS" />
              <img src={LOGO_MMM} className="logo-mmm" alt="Made in Mozambique" />
            </div>
            <div className="doc-title-bar">
              <div className="doc-type-label">{tipoLabel}</div>
              <div className="doc-number-date">
                <div className="doc-number">Nº {escaparHTML(doc.numero)}</div>
                <div className="doc-date">{fmtData(doc.data)}</div>
              </div>
            </div>
          </div>

          <table className="tabela-layout-impressao">
            <thead>
              <tr><td><div className="print-header-space" /></td></tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="doc-body">
                    <div className="doc-parties">
                      <div>
                        <div className="party-label">De</div>
                        <div className="party-name">Danmo Service System, Lda</div>
                        <div className="party-detail">
                          Porto da Beira, Sofala - Moçambique<br />
                          NUIT: 400024022<br />
                          Tel: +258 84 301 9615
                        </div>
                      </div>
                      <div>
                        <div className="party-label">Para</div>
                        <div className="party-name">{escaparHTML(doc.cliente_nome || "-")}</div>
                        <div className="party-detail">
                          {doc.cliente_morada ? <>{escaparHTML(doc.cliente_morada)}<br /></> : null}
                          {doc.cliente_nuit ? <>NUIT: {escaparHTML(doc.cliente_nuit)}<br /></> : null}
                          {doc.cliente_contacto ? <>Tel: {escaparHTML(doc.cliente_contacto)}<br /></> : null}
                          {doc.enviado_nome ? (
                            <>
                              <br />
                              Att: <strong>{escaparHTML(doc.enviado_nome)}</strong>
                              {doc.enviado_cargo ? ` - ${escaparHTML(doc.enviado_cargo)}` : ""}
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {doc.assunto && textoSemTags(doc.assunto) ? (
                      <div
                        className="doc-assunto"
                        dangerouslySetInnerHTML={{ __html: doc.assunto }}
                      />
                    ) : null}

                    <table className="items-table">
                      <thead>
                        {isMao ? (
                          <tr>
                            <th style={{ width: 30 }}>Nº</th>
                            <th>Técnico</th>
                            <th className="r" style={{ width: 44 }}>Qtd</th>
                            <th className="r" style={{ width: 60 }}>Tempo</th>
                            <th className="r" style={{ width: 65 }}>Unidade</th>
                            <th className="r" style={{ width: 115 }}>Val. Unit. ({doc.moeda})</th>
                            <th className="r" style={{ width: 120 }}>Total ({doc.moeda})</th>
                          </tr>
                        ) : isMat ? (
                          <tr>
                            <th style={{ width: 30 }}>Nº</th>
                            <th>Descrição</th>
                            <th className="r" style={{ width: 44 }}>Qtd</th>
                            <th className="r" style={{ width: 65 }}>Unidade</th>
                            <th className="r" style={{ width: 115 }}>Val. Unit. ({doc.moeda})</th>
                            <th className="r" style={{ width: 120 }}>Total ({doc.moeda})</th>
                          </tr>
                        ) : (
                          <tr>
                            <th style={{ width: 30 }}>Nº</th>
                            <th style={{ width: 68 }}>Tipo</th>
                            <th>Técnico / Descrição</th>
                            <th className="r" style={{ width: 44 }}>Qtd</th>
                            <th className="r" style={{ width: 60 }}>Tempo/Und</th>
                            <th className="r" style={{ width: 115 }}>Val. Unit. ({doc.moeda})</th>
                            <th className="r" style={{ width: 120 }}>Total ({doc.moeda})</th>
                          </tr>
                        )}
                      </thead>
                      <tbody>{linhas}</tbody>
                    </table>
                  </div>

                  {itensCliente.length > 0 && (
                    <div className="nota-cliente-area">
                      <div className="nota-cliente">
                        <strong>Material fornecido pelo cliente (não faturado):</strong>{" "}
                        {itensCliente.map((i) => `${i.descricao || "-"} (${i.qtd} ${i.unidade})`).join("; ")}.{" "}
                        Detalhe no Anexo de Material anexo a este documento.
                      </div>
                    </div>
                  )}

                  <div className="doc-totais-area">
                    <div className="doc-totais-wrap">
                      <div className="totais-block">
                        <div className="total-linha">
                          <span className="lbl">Subtotal</span>
                          <span className="val">{fmtNum(Number(doc.subtotal) || 0)} {doc.moeda}</span>
                        </div>
                        {desconto > 0 && (
                          <div className="total-linha desconto">
                            <span className="lbl">
                              {doc.desconto_tipo === "pct" ? `Desconto (${doc.desconto_input}%)` : "Desconto"}
                            </span>
                            <span className="val">- {fmtNum(desconto)} {doc.moeda}</span>
                          </div>
                        )}
                        {doc.iva_incluido ? (
                          <div className="total-linha">
                            <span className="lbl">IVA ({doc.iva_pct || 16}%)</span>
                            <span className="val">{fmtNum(Number(doc.iva_amt) || 0)} {doc.moeda}</span>
                          </div>
                        ) : (
                          <div className="total-linha nota-iva">
                            <span className="lbl">IVA</span>
                            <span className="val">Não incluído</span>
                          </div>
                        )}
                        <div className="total-linha final">
                          <span className="lbl">TOTAL {doc.moeda}</span>
                          <span className="val">{fmtNum(Number(doc.total) || 0)} {doc.moeda}</span>
                        </div>
                      </div>
                    </div>
                    {doc.moeda === "USD" && (
                      <div className="equiv-line">
                        ≈ {fmtNum(totalMzn)} MZN (taxa: 1 USD = {taxa} MZN)
                      </div>
                    )}
                  </div>

                  <div className="extenso-area">
                    <div className="extenso-block">{numPorExtenso(totalMzn)}</div>
                  </div>

                  <div className="assinatura-area">
                    <div className="assinatura-wrap">
                      <div className="assinatura-inner">
                        <div className="assinatura-data">{dataExtenso(doc.data)}</div>
                        <div className="assinatura-linha">
                          <div className="assinatura-nome">
                            {doc.utilizador_nome || "________________________________"}
                          </div>
                          <div className="assinatura-cargo">
                            {doc.utilizador_cargo ? `(${escaparHTML(doc.utilizador_cargo)})` : ""}
                          </div>
                        </div>
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

          <div className="doc-footer" ref={rodRef}>
            <div className="footer-codigo">
              <b>Código</b> DAN_ADO_FR_030_REV02_29.05.26<br />
              Este documento é propriedade da DANMO. Não é permitida sua reprodução sem autorização.<br />
              Depois de impresso este documento é considerado cópia não controlado
            </div>
            <img src={LOGO_MESQUITA} className="logo-mesquita" alt="Grupo Mesquita" />
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
 * Anexo de Material do Cliente
 * ------------------------------------------------------------------ */

function PapelAnexo({ doc, itensCliente }: { doc: DocFaturacao; itensCliente: ItemFaturacao[] }) {
  const { alturas, cabRef, rodRef } = useAlturasImpressao(true);
  return (
    <>
      <style>{cssPapel(alturas)}</style>
      <div className="preview-bar">
        <div className="preview-bar-left">
          <Link href="/faturacao" className="btn-back">
            <ArrowLeft className="inline size-4" aria-hidden /> Voltar
          </Link>
          <span className="preview-title">
            Anexo de Material · {doc.tipo === "fatura" ? "Fatura" : "Cotação"} Nº {doc.numero}
          </span>
        </div>
        <button className="btn-print" onClick={() => window.print()}>
          <Printer className="inline size-4" aria-hidden /> Imprimir / Guardar PDF
        </button>
      </div>

      <div className="doc-wrap">
        <div className="doc-page">
          <div className="doc-header" ref={cabRef}>
            <div className="doc-header-inner">
              <img src={LOGO_DANMO} className="logo-danmo" alt="Danmo SS" />
              <img src={LOGO_MMM} className="logo-mmm" alt="Made in Mozambique" />
            </div>
            <div className="doc-title-bar">
              <div className="doc-type-label">Anexo de Material</div>
              <div className="doc-number-date">
                <div className="doc-number">
                  {doc.tipo === "fatura" ? "Fatura" : "Cotação"} Nº {escaparHTML(doc.numero)}
                </div>
                <div className="doc-date">{fmtData(doc.data)}</div>
              </div>
            </div>
          </div>

          <table className="tabela-layout-impressao">
            <thead>
              <tr><td><div className="print-header-space" /></td></tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div className="doc-body">
                    <div className="doc-parties">
                      <div>
                        <div className="party-label">De</div>
                        <div className="party-name">Danmo Service System, Lda</div>
                        <div className="party-detail">
                          Porto da Beira, Sofala - Moçambique<br />
                          NUIT: 400024022<br />
                          Tel: +258 84 301 9615
                        </div>
                      </div>
                      <div>
                        <div className="party-label">Para</div>
                        <div className="party-name">{escaparHTML(doc.cliente_nome || "-")}</div>
                        <div className="party-detail">
                          {doc.cliente_morada ? <>{escaparHTML(doc.cliente_morada)}<br /></> : null}
                          {doc.cliente_nuit ? <>NUIT: {escaparHTML(doc.cliente_nuit)}<br /></> : null}
                        </div>
                      </div>
                    </div>

                    <div className="doc-assunto">
                      <strong>Material previsto para a reparação, fornecido pelo cliente.</strong>
                      <br />
                      Os itens abaixo NÃO estão faturados pela Danmo e não entram no total do
                      documento. Servem de controlo e acompanhamento da obra.
                    </div>

                    {itensCliente.length === 0 ? (
                      <p style={{ textAlign: "center", color: "#888", padding: "2rem 0" }}>
                        Este documento não tem material do cliente marcado.
                      </p>
                    ) : (
                      <table className="items-table">
                        <thead>
                          <tr>
                            <th style={{ width: 30 }}>Nº</th>
                            <th>Descrição do material</th>
                            <th className="r" style={{ width: 60 }}>Qtd</th>
                            <th className="r" style={{ width: 80 }}>Unidade</th>
                            <th className="r" style={{ width: 120 }}>Observações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {itensCliente.map((i, idx) => (
                            <tr key={i.id || idx}>
                              <td>{idx + 1}</td>
                              <td>{escaparHTML(i.descricao || "-")}</td>
                              <td className="r">{i.qtd}</td>
                              <td className="r">{escaparHTML(i.unidade)}</td>
                              <td className="r">Fornecido pelo cliente</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  <div className="assinatura-area">
                    <div className="assinatura-wrap">
                      <div className="assinatura-inner">
                        <div className="assinatura-data">{dataExtenso(doc.data)}</div>
                        <div className="assinatura-linha">
                          <div className="assinatura-nome">
                            {doc.utilizador_nome || "________________________________"}
                          </div>
                          <div className="assinatura-cargo">
                            {doc.utilizador_cargo ? `(${escaparHTML(doc.utilizador_cargo)})` : ""}
                          </div>
                        </div>
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

          <div className="doc-footer" ref={rodRef}>
            <div className="footer-codigo">
              <b>Código</b> DAN_ADO_FR_030_REV02_29.05.26 (Anexo)<br />
              Este documento é propriedade da DANMO. Não é permitida sua reprodução sem autorização.<br />
              Depois de impresso este documento é considerado cópia não controlado
            </div>
            <img src={LOGO_MESQUITA} className="logo-mesquita" alt="Grupo Mesquita" />
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------
 * CSS do papel (adaptado do print.html do hub)
 * ------------------------------------------------------------------ */

const cssPapel = (alturas: Alturas) => `
body { background: #1a1a2e; }
.preview-bar { max-width: 820px; margin: 0 auto 16px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.preview-bar-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.btn-print { background: #f59e0b; color: #0a1628; border: none; padding: 10px 24px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; display: inline-flex; align-items: center; gap: 6px; }
.btn-print:hover { background: #d97706; }
.btn-back { background: transparent; color: #94a3b8; border: 1px solid rgba(148,163,184,0.3); padding: 9px 18px; border-radius: 6px; font-size: 13px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
.btn-back:hover { color: #f59e0b; border-color: #f59e0b; }
.preview-title { font-size: 15px; font-weight: 700; color: #f59e0b; }

.doc-wrap { max-width: 820px; margin: 0 auto; background: white; border-radius: 4px; box-shadow: 0 8px 40px rgba(0,0,0,0.5); overflow: hidden; }
.doc-page { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #1a1a1a; box-sizing: border-box; }

.doc-header { padding: 12mm 18mm 4mm 18mm; }
.doc-header-inner { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4mm; }
.logo-danmo, .logo-mmm { height: 48px; width: auto; object-fit: contain; }
.doc-title-bar { display: flex; justify-content: space-between; align-items: center; border-top: 3px solid #0a1628; border-bottom: 1px solid #0a1628; padding: 5px 0; }
.doc-type-label { font-size: 17pt; font-weight: bold; color: #f59e0b; letter-spacing: 2px; text-transform: uppercase; }
.doc-number-date { text-align: right; }
.doc-number { font-size: 15pt; font-weight: bold; color: #0a1628; }
.doc-date { font-size: 9.5pt; color: #555; margin-top: 2px; }

.doc-body { padding: 5mm 18mm 0 18mm; }
.doc-parties { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; margin-bottom: 4mm; }
.party-label { font-size: 8pt; letter-spacing: 2px; text-transform: uppercase; color: #888; margin-bottom: 3px; }
.party-name { font-size: 11.5pt; font-weight: bold; color: #0a1628; margin-bottom: 3px; }
.party-detail { font-size: 9.5pt; color: #333; line-height: 1.6; }

.doc-assunto { background: #f8f8f8; border-left: 4px solid #f59e0b; padding: 7px 11px; margin-bottom: 4mm; font-size: 9.5pt; color: #222; line-height: 1.6; border-radius: 0 3px 3px 0; page-break-inside: avoid; break-inside: avoid; }
.doc-assunto strong { color: #0a1628; }
.doc-assunto p { margin: 0 0 4px 0; }
.doc-assunto ul, .doc-assunto ol { margin: 4px 0; padding-left: 22px; }
.doc-assunto li { margin: 2px 0; }
.doc-assunto u { text-underline-offset: 2px; }

.items-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
.items-table thead { display: table-header-group; }
.items-table th { background: #0a1628; color: white; padding: 6px 8px; text-align: left; font-size: 8.5pt; letter-spacing: 0.5px; text-transform: uppercase; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.items-table th.r { text-align: right; }
.items-table td { padding: 6px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
.items-table td.r { text-align: right; }
.items-table td.b { font-weight: bold; }
.items-table tr:nth-child(even) td { background: #f9fafb; }
.items-table tr { page-break-inside: avoid; break-inside: avoid; }

.nota-cliente-area { padding: 0 18mm; page-break-inside: avoid; break-inside: avoid; }
.nota-cliente { font-size: 9pt; color: #7c5a03; background: #fffbeb; border: 1px solid #f3e3bb; border-left: 4px solid #f59e0b; border-radius: 0 3px 3px 0; padding: 7px 11px; margin: 3mm 0; line-height: 1.5; }

.doc-totais-area { padding: 0 18mm; page-break-inside: avoid; break-inside: avoid; }
.doc-totais-wrap { display: flex; justify-content: flex-end; margin-top: 3mm; margin-bottom: 3mm; }
.totais-block { width: 270px; }
.total-linha { display: flex; justify-content: space-between; padding: 4px 0; font-size: 10pt; border-bottom: 1px solid #f0f0f0; }
.total-linha .lbl { color: #555; }
.total-linha .val { font-weight: bold; }
.total-linha.desconto .lbl, .total-linha.desconto .val { color: #c00; }
.total-linha.nota-iva .val { color: #b45309; font-style: italic; }
.total-linha.final { font-size: 13pt; font-weight: bold; color: #0a1628; border-top: 2px solid #0a1628; border-bottom: 2px solid #0a1628; padding: 5px 0; margin-top: 3px; }
.equiv-line { font-size: 8.5pt; color: #777; text-align: right; margin-top: 3px; font-style: italic; padding: 0 18mm; }

.extenso-area { padding: 0 18mm; page-break-inside: avoid; break-inside: avoid; }
.extenso-block { font-size: 9.5pt; font-style: italic; color: #444; padding: 6px 10px; background: #f8f8f8; border: 1px solid #e5e7eb; border-radius: 3px; margin-bottom: 4mm; line-height: 1.5; }

.assinatura-area { padding: 0 18mm; page-break-inside: avoid; break-inside: avoid; }
.assinatura-wrap { display: flex; justify-content: center; margin-top: 6mm; margin-bottom: 4mm; }
.assinatura-inner { text-align: center; width: 260px; }
.assinatura-data { font-size: 10pt; color: #333; margin-bottom: 10mm; }
.assinatura-linha { border-top: 1px solid #000; padding-top: 6px; }
.assinatura-nome { font-size: 11pt; font-weight: bold; color: #0a1628; }
.assinatura-cargo { font-size: 9.5pt; color: #555; margin-top: 2px; font-style: italic; }

.doc-footer { padding: 3mm 18mm 10mm 18mm; border-top: 1px solid #ddd; display: flex; justify-content: space-between; align-items: flex-end; margin-top: 6mm; }
.footer-codigo { font-size: 7pt; color: #555; line-height: 1.6; max-width: 310px; }
.footer-codigo b { color: #000; }
.logo-mesquita { height: 32px; width: auto; object-fit: contain; }

.tabela-layout-impressao { width: 100%; border-collapse: collapse; border: none; }
.tabela-layout-impressao > thead > tr > td,
.tabela-layout-impressao > tbody > tr > td,
.tabela-layout-impressao > tfoot > tr > td { padding: 0; border: none; }

@media screen { .print-header-space, .print-footer-space { display: none; } }

@media print {
  body { background: white !important; }
  .preview-bar { display: none !important; }
  .doc-wrap { box-shadow: none; border-radius: 0; max-width: 100%; }
  @page { margin: 0; size: A4; }
  .doc-header { position: fixed; top: 0; left: 0; right: 0; background: #fff; z-index: 1000; }
  .doc-footer { position: fixed; bottom: 0; left: 0; right: 0; background: #fff; z-index: 1000; margin-top: 0; }
  /* Margens dinâmicas medidas no navegador (tabela mágica do hub): sem
     isto os espaços ficam com 0 e o cabeçalho/rodapé tapam o conteúdo. */
  .print-header-space { height: ${alturas ? alturas.cab : 165}px !important; }
  .print-footer-space { height: ${alturas ? alturas.rod : 90}px !important; }
  .items-table tr { page-break-inside: avoid; break-inside: avoid; }
  .items-table thead { display: table-header-group; }
  .doc-assunto, .nota-cliente-area, .doc-totais-area, .extenso-area, .assinatura-area { page-break-inside: avoid; break-inside: avoid; }
  .items-table th, .doc-assunto { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
}
`;
