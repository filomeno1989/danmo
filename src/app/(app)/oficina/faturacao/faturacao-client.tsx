"use client";

/**
 * FaturacaoClient - Obras fechadas que vão a facturação da CdM.
 *
 * KPIs gerais, resumo mês a mês (obras, horas CdM vs nosso pessoal,
 * material e total) e a lista detalhada com materiais, diferenças e
 * dias até ao fecho. Permite corrigir (editar) e remover um fecho.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Pencil, Plus, Printer, RotateCcw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Cabeca, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import {
  MATERIAIS_FECHO,
  UNIDADES_PRECO,
  dataHojeISO,
  formatarData,
  type LinhaFaturacao,
  type MaterialFecho,
  type PrecoCatalogo,
  type ResumoMes
} from "@/lib/oficina";

type Totais = {
  obras: number;
  horas_cdm: number;
  horas_nossas: number;
  total_mao_obra: number;
  total_material: number;
  total_geral: number;
};

type Dados = {
  ok: boolean;
  linhas: LinhaFaturacao[];
  porMes: ResumoMes[];
  totais: Totais;
};

const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-");
  const idx = Number(m) - 1;
  return `${MESES_PT[idx] || m} ${a}`;
}

/** Mostra um valor em Meticais: "1 234,56 MT" */
function fmtMt(n: number): string {
  return (
    new Intl.NumberFormat("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n || 0) + " MT"
  );
}

const arred2 = (n: number) => Math.round(n * 100) / 100;

export function FaturacaoClient({
  podeEditar,
  podeApagar
}: {
  nomeUtilizador: string;
  podeEditar: boolean;
  podeApagar: boolean;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState("");
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState("");
  const [fBusca, setFBusca] = useState("");
  const [expandida, setExpandida] = useState<number | null>(null);
  // Tabela de Preços (para a edição do fecho assumir os valores registados)
  const [precos, setPrecos] = useState<PrecoCatalogo[]>([]);

  // Edição de fecho
  const [fechoEdit, setFechoEdit] = useState<LinhaFaturacao | null>(null);
  const [editData, setEditData] = useState("");
  const [editHoras, setEditHoras] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editMats, setEditMats] = useState([
    { material: "", quantidade: "", valor_unitario: "", livre: false }
  ]);
  const [editObs, setEditObs] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [aExcel, setAExcel] = useState(false);
  const [aPdf, setAPdf] = useState(false);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro("");
    try {
      const d = await pedir<Dados>("/api/oficina/faturacao");
      setDados(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    // Primeiro carregamento em cadeia de promessas (sem setState síncrono)
    let vivo = true;
    fetch("/api/oficina/faturacao", { cache: "no-store" })
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
  }, []);

  const anos = useMemo(
    () =>
      [...new Set((dados?.linhas || []).map((l) => l.data_fecho.slice(0, 4)))]
        .sort()
        .reverse(),
    [dados]
  );

  const linhas = useMemo(() => {
    let lista = dados?.linhas || [];
    if (ano) lista = lista.filter((l) => l.data_fecho.slice(0, 4) === ano);
    if (mes) lista = lista.filter((l) => Number(l.data_fecho.slice(5, 7)) === Number(mes));
    const busca = fBusca.trim().toLowerCase();
    if (busca) {
      lista = lista.filter(
        (l) =>
          (l.numero_obra || "").toLowerCase().includes(busca) ||
          (l.equip_code || "").toLowerCase().includes(busca)
      );
    }
    return lista;
  }, [dados, ano, mes, fBusca]);

  const etiquetaPeriodo = useMemo(() => {
    if (!ano && !mes) return "Todo o período";
    if (!mes) return `Ano ${ano}`;
    const nomeMes = MESES_PT[Number(mes) - 1] || `mês ${mes}`;
    return ano ? `${nomeMes} de ${ano}` : `${nomeMes} (todos os anos)`;
  }, [ano, mes]);

  const sufixoPeriodo = ano && mes ? `${ano}-${mes.padStart(2, "0")}` : ano ? ano : mes ? `mes_${mes.padStart(2, "0")}` : "todo_o_periodo";

  const temFiltros = Boolean(ano || mes || fBusca.trim());

  const totais = useMemo<Totais>(() => {
    return {
      obras: linhas.length,
      horas_cdm: arred2(linhas.reduce((s, l) => s + l.horas_cdm, 0)),
      horas_nossas: arred2(linhas.reduce((s, l) => s + l.horas_nossas, 0)),
      total_mao_obra: arred2(linhas.reduce((s, l) => s + l.total_mao_obra, 0)),
      total_material: arred2(linhas.reduce((s, l) => s + l.total_material, 0)),
      total_geral: arred2(linhas.reduce((s, l) => s + l.total_geral, 0))
    };
  }, [linhas]);

  const porMes = useMemo<ResumoMes[]>(() => {
    const mapa = new Map<string, ResumoMes>();
    linhas.forEach((l) => {
      const mes = l.data_fecho.slice(0, 7);
      const atual =
        mapa.get(mes) ||
        { mes, obras: 0, horas_cdm: 0, horas_nossas: 0, total_material: 0, total_geral: 0 };
      atual.obras += 1;
      atual.horas_cdm = arred2(atual.horas_cdm + l.horas_cdm);
      atual.horas_nossas = arred2(atual.horas_nossas + l.horas_nossas);
      atual.total_material = arred2(atual.total_material + l.total_material);
      atual.total_geral = arred2(atual.total_geral + l.total_geral);
      mapa.set(mes, atual);
    });
    return [...mapa.values()].sort((a, b) => (a.mes < b.mes ? 1 : -1));
  }, [linhas]);

  function abrirEdicao(l: LinhaFaturacao) {
    setFechoEdit(l);
    setEditData(l.data_fecho.slice(0, 10));
    setEditHoras(String(l.horas_cdm));
    setEditValor(String(l.valor_hora));
    setEditObs(l.observacao || "");
    // Busca a Tabela de Preços para a lista de materiais vir com valores
    (async () => {
      let ps: PrecoCatalogo[] = [];
      try {
        const d = await pedir<{ ok: boolean; precos: PrecoCatalogo[] }>("/api/oficina/precos");
        ps = d.precos || [];
        setPrecos(ps);
      } catch {
        setPrecos([]);
      }
      const matsCatalogo = ps.filter((p) => p.tipo === "material");
      setEditMats(
        l.materiais.length
          ? l.materiais.map((m) => ({
              material: m.material,
              quantidade: String(m.quantidade),
              valor_unitario: String(m.valor_unitario),
              livre: !matsCatalogo.some((p) => p.nome === m.material)
            }))
          : [{ material: "", quantidade: "", valor_unitario: "", livre: false }]
      );
    })();
  }

  async function guardarEdicao() {
    if (!fechoEdit || aGravar) return;
    const horas = Number(editHoras);
    const valor = Number(editValor);
    if (editHoras === "" || !Number.isFinite(horas) || horas < 0) {
      toast.error("Escreve as horas que a CdM considerou.");
      return;
    }
    if (editValor === "" || !Number.isFinite(valor) || valor < 0) {
      toast.error("Escreve o valor por hora.");
      return;
    }
    const mats = editMats
      .map((m) => ({
        material: m.material.trim(),
        quantidade: Number(m.quantidade) || 0,
        valor_unitario: Number(m.valor_unitario) || 0
      }))
      .filter((m) => m.material && m.quantidade > 0);
    setAGravar(true);
    try {
      await enviar(
        "/api/oficina/faturacao",
        {
          action: "editar-fecho",
          id: fechoEdit.id,
          fecho: {
            data_fecho: editData,
            horas_cdm: horas,
            valor_hora: valor,
            materiais: mats,
            observacao: editObs.trim() || null
          }
        },
        "Fecho actualizado."
      );
      setFechoEdit(null);
      await carregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravar(false);
    }
  }

  async function apagarFecho(l: LinhaFaturacao) {
    if (!podeApagar) return;
    const ok = window.confirm(
      `Apagar o registo de faturação da obra ${l.numero_obra || "S/Nº"}? A obra continua fechada, mas sai do módulo de Faturação.`
    );
    if (!ok) return;
    try {
      await enviar("/api/oficina/faturacao", { action: "apagar-fecho", id: l.id }, "Registo apagado.");
      await carregar();
    } catch {
      // aviso já mostrado
    }
  }

  const editTotalMao = (Number(editHoras) || 0) * (Number(editValor) || 0);
  const editTotalMat = editMats.reduce(
    (s, m) => s + (Number(m.quantidade) || 0) * (Number(m.valor_unitario) || 0),
    0
  );

  /* ============ Exportações (Excel e PDF) ============ */

  async function exportarExcel() {
    if (!linhas.length) {
      toast.error("Não há fechos para exportar com este filtro.");
      return;
    }
    setAExcel(true);
    try {
      const XLSXS = await import("xlsx-js-style");
      const wb = XLSXS.utils.book_new();
      const emissao = agoraEmissao();
      const borda = { style: "thin" as const, color: { rgb: "B7C4BC" } };
      const bordas = { top: borda, bottom: borda, left: borda, right: borda };

      /** Folha de relatório formatada: títulos da empresa, cabeçalho verde,
       *  zebra nos dados, formatos de número e linha TOTAL destacada. */
      function montarFolha(
        nome: string,
        cabecalhos: string[],
        dadosAoa: (string | number)[][],
        larguras: number[],
        colsMoeda: number[],
        colsHoras: number[],
        colsWrap: number[],
        linhaTotal?: (string | number)[],
        comFiltro?: boolean
      ) {
        const aoa: (string | number)[][] = [
          ["DANMO SERVICE SYSTEM, LDA"],
          ["Obras fechadas entregues à facturação"],
          [`Período: ${etiquetaPeriodo}`],
          [`Emitido em ${emissao} (Portal Interno Danmo)`],
          [],
          cabecalhos,
          ...dadosAoa
        ];
        if (linhaTotal) aoa.push(linhaTotal);
        const ws = XLSXS.utils.aoa_to_sheet(aoa);
        const nCol = cabecalhos.length;
        const nLin = aoa.length;
        ws["!cols"] = larguras.map((w) => ({ wch: w }));
        ws["!merges"] = [0, 1, 2, 3].map((l) => ({ s: { r: l, c: 0 }, e: { r: l, c: nCol - 1 } }));
        if (comFiltro) {
          ws["!autofilter"] = {
            ref: XLSXS.utils.encode_range({
              s: { r: 5, c: 0 },
              e: { r: nLin - (linhaTotal ? 2 : 1), c: nCol - 1 }
            })
          };
        }
        for (let r = 0; r < nLin; r++) {
          for (let c = 0; c < nCol; c++) {
            const cel = ws[XLSXS.utils.encode_cell({ r, c })];
            if (!cel) continue;
            if (r === 0) {
              cel.s = { font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "009639" } } };
              continue;
            }
            if (r === 1) {
              cel.s = { font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "1A1A1A" } } };
              continue;
            }
            if (r === 2 || r === 3) {
              cel.s = { font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "555555" } } };
              continue;
            }
            if (r === 5) {
              cel.s = {
                font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
                fill: { patternType: "solid", fgColor: { rgb: "009639" } },
                alignment: {
                  vertical: "center",
                  horizontal: colsMoeda.includes(c) || colsHoras.includes(c) ? "right" : "left",
                  wrapText: true
                },
                border: bordas
              };
              continue;
            }
            if (r > 5) {
              const eTotal = Boolean(linhaTotal) && r === nLin - 1;
              const eMoeda = colsMoeda.includes(c);
              const eHoras = colsHoras.includes(c);
              if (typeof cel.v === "string" && (eMoeda || eHoras)) {
                const n = Number(cel.v);
                if (Number.isFinite(n)) {
                  cel.v = n;
                  cel.t = "n";
                }
              }
              cel.s = {
                font: {
                  name: "Calibri",
                  sz: 10,
                  bold: eTotal,
                  color: { rgb: eTotal ? "005A28" : "1A1A1A" }
                },
                fill: {
                  patternType: "solid",
                  fgColor: { rgb: eTotal ? "E6F4EC" : r % 2 === 0 ? "F4F9F6" : "FFFFFF" }
                },
                alignment: {
                  vertical: "center",
                  horizontal: eMoeda || eHoras ? "right" : "left",
                  wrapText: colsWrap.includes(c)
                },
                border: bordas,
                ...(eMoeda ? { numFmt: "#,##0.00" } : {}),
                ...(eHoras ? { numFmt: "#,##0.0" } : {})
              };
            }
          }
        }
        XLSXS.utils.book_append_sheet(wb, ws, nome);
      }

      // Folha 1: resumo por mês, com linha TOTAL no fim
      montarFolha(
        "Resumo por mês",
        ["Mês", "Obras", "Horas CdM", "Horas nossas", "Diferença (h)", "Material (MT)", "Total geral (MT)"],
        porMes.map((m) => [
          etiquetaMes(m.mes),
          m.obras,
          m.horas_cdm,
          m.horas_nossas,
          arred2(m.horas_cdm - m.horas_nossas),
          m.total_material,
          m.total_geral
        ]),
        [12, 8, 11, 12, 12, 15, 17],
        [5, 6],
        [2, 3, 4],
        [],
        [
          "TOTAL",
          totais.obras,
          totais.horas_cdm,
          totais.horas_nossas,
          arred2(totais.horas_cdm - totais.horas_nossas),
          totais.total_material,
          totais.total_geral
        ]
      );

      // Folha 2: detalhe de cada obra fechada, com TOTAL no fim e filtro na tabela
      montarFolha(
        "Detalhe das obras",
        [
          "Nº Obra",
          "Máquina",
          "Sector",
          "Abertura",
          "Fecho",
          "Dias até fecho",
          "Dias pós-trab.",
          "Horas CdM",
          "Horas nossas",
          "Dif. (h)",
          "Valor/hora (MT)",
          "Mão de obra (MT)",
          "Material (MT)",
          "Total geral (MT)",
          "Diagnóstico",
          "Materiais",
          "Responsável",
          "Observação"
        ],
        linhas.map((l) => [
          l.numero_obra || "S/Nº",
          l.equip_code || "-",
          l.sector || "-",
          l.data_abertura ? formatarData(l.data_abertura) : "-",
          formatarData(l.data_fecho),
          l.dias_ate_fecho,
          l.dias_apos_trabalho,
          l.horas_cdm,
          l.horas_nossas,
          l.diferenca_horas,
          l.valor_hora,
          l.total_mao_obra,
          l.total_material,
          l.total_geral,
          l.diagnostico || "",
          l.materiais
            .map((m) => `${m.material}: ${m.quantidade} x ${m.valor_unitario} = ${m.total} MT`)
            .join(" | ") || "-",
          l.responsavel || "-",
          l.observacao || ""
        ]),
        [10, 10, 10, 11, 11, 9, 9, 9, 9, 8, 10, 13, 13, 14, 32, 36, 16, 26],
        [10, 11, 12, 13],
        [7, 8, 9],
        [14, 15, 17],
        [
          `TOTAL (${linhas.length} obras)`,
          "",
          "",
          "",
          "",
          "",
          "",
          totais.horas_cdm,
          totais.horas_nossas,
          arred2(totais.horas_cdm - totais.horas_nossas),
          "",
          totais.total_mao_obra,
          totais.total_material,
          totais.total_geral,
          "",
          "",
          "",
          ""
        ],
        true
      );

      XLSXS.writeFile(wb, `Obras_Fechadas_Facturacao_${sufixoPeriodo}.xlsx`);
      toast.success(
        `Excel exportado: relatório formatado com ${linhas.length} obras (${etiquetaPeriodo}).`
      );
    } catch {
      toast.error("Não foi possível gerar o Excel.");
    } finally {
      setAExcel(false);
    }
  }

  async function exportarPdf() {
    if (!linhas.length) {
      toast.error("Não há fechos para exportar com este filtro.");
      return;
    }
    setAPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      type DocComTabela = import("jspdf").jsPDF & { lastAutoTable: { finalY: number } };
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const L = doc.internal.pageSize.getWidth();
      const A = doc.internal.pageSize.getHeight();
      const M = 14;
      const VERDE: [number, number, number] = [0, 150, 57];

      /* Cabeçalho do documento com o logotipo da marca (public/logos/DANMO.png).
       * Se o logotipo não carregar, mantém a caixa verde como reserva. */
      const logo = await carregarLogo("/logos/DANMO.png");
      if (logo) {
        // DANMO.png é 142x83 px -> proporção 1,71; desenha com 13 mm de altura
        doc.addImage(logo, "PNG", M, 8.5, 22.2, 13);
      } else {
        doc.setFillColor(VERDE[0], VERDE[1], VERDE[2]);
        doc.roundedRect(M, 10, 46, 13, 1.5, 1.5, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text("DANMO", M + 23, 18.2, { align: "center" });
      }
      const xTexto = M + (logo ? 28 : 53);
      doc.setTextColor(25, 25, 25);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Obras fechadas entregues à facturação", xTexto, 16.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(95, 95, 95);
      doc.text(`Período: ${etiquetaPeriodo}   ·   Emitido em ${agoraEmissao()}`, xTexto, 22);
      doc.setProperties({ title: `Obras fechadas entregues à facturação - ${etiquetaPeriodo}` });
      doc.setDrawColor(VERDE[0], VERDE[1], VERDE[2]);
      doc.setLineWidth(0.8);
      doc.line(M, 29.5, L - M, 29.5);

      /* KPIs do período */
      const kpis: { t: string; v: string; sub: string; verde: boolean }[] = [
        { t: "OBRAS FECHADAS", v: String(totais.obras), sub: etiquetaPeriodo, verde: false },
        {
          t: "MÃO DE OBRA",
          v: fmtMt(totais.total_mao_obra),
          sub: `${fmtNum(totais.horas_cdm)} h consideradas pela CdM`,
          verde: false
        },
        {
          t: "MATERIAL",
          v: fmtMt(totais.total_material),
          sub: `${fmtNum(totais.horas_nossas)} h do nosso pessoal`,
          verde: false
        },
        { t: "TOTAL GERAL", v: fmtMt(totais.total_geral), sub: "Mão de obra + material", verde: true }
      ];
      const kw = (L - 2 * M - 3 * 4) / 4;
      kpis.forEach((k, i) => {
        const x = M + i * (kw + 4);
        doc.setFillColor(k.verde ? 230 : 248, k.verde ? 244 : 249, k.verde ? 236 : 250);
        doc.setDrawColor(k.verde ? 0 : 203, k.verde ? 150 : 208, k.verde ? 57 : 214);
        doc.roundedRect(x, 33, kw, 17, 1.5, 1.5, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(110, 110, 110);
        doc.text(k.t, x + 3, 38);
        doc.setFontSize(11);
        doc.setTextColor(k.verde ? 0 : 25, k.verde ? 120 : 25, k.verde ? 60 : 25);
        doc.text(k.v, x + 3, 44);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(125, 125, 125);
        doc.text(k.sub, x + 3, 47.6);
      });

      /* Secção 1: resumo por mês */
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(25, 25, 25);
      doc.text("Resumo por mês", M, 58);

      autoTable(doc, {
        startY: 60,
        margin: { left: M, right: M },
        head: [["Mês", "Obras", "Horas CdM", "Horas nossas", "Diferença (h)", "Material (MT)", "Total geral (MT)"]],
        body: porMes.map((m) => [
          etiquetaMes(m.mes),
          String(m.obras),
          `${fmtNum(m.horas_cdm)} h`,
          `${fmtNum(m.horas_nossas)} h`,
          `${fmtNum(m.horas_cdm - m.horas_nossas)} h`,
          fmtMt(m.total_material),
          fmtMt(m.total_geral)
        ]),
        foot: [
          [
            "TOTAL",
            String(totais.obras),
            `${fmtNum(totais.horas_cdm)} h`,
            `${fmtNum(totais.horas_nossas)} h`,
            `${fmtNum(totais.horas_cdm - totais.horas_nossas)} h`,
            fmtMt(totais.total_material),
            fmtMt(totais.total_geral)
          ]
        ],
        styles: {
          fontSize: 8.5,
          cellPadding: 1.8,
          lineColor: [180, 190, 184],
          lineWidth: 0.1,
          textColor: [30, 30, 30]
        },
        headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontStyle: "bold" },
        footStyles: { fillColor: [230, 244, 236], textColor: [0, 90, 40], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [246, 250, 248] },
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right", fontStyle: "bold" }
        }
      });

      /* Secção 2: detalhe das obras */
      const fimResumo = (doc as DocComTabela).lastAutoTable.finalY;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(25, 25, 25);
      doc.text(`Detalhe das obras (${linhas.length})`, M, fimResumo + 8);

      autoTable(doc, {
        startY: fimResumo + 10,
        margin: { left: M, right: M, top: 16, bottom: 12 },
        head: [
          [
            "Nº Obra",
            "Máquina",
            "Fecho",
            "Dias até fecho",
            "Dias pós-trab.",
            "H. CdM",
            "H. nossas",
            "Dif. (h)",
            "Mão de obra (MT)",
            "Material (MT)",
            "Total geral (MT)"
          ]
        ],
        body: linhas.map((l) => {
          const diag = (l.diagnostico || "").trim().replace(/\s+/g, " ");
          const diagCurto = diag.length > 130 ? `${diag.slice(0, 130).trim()}...` : diag;
          return [
            (l.numero_obra || "S/Nº") +
              (diagCurto ? `\nDiag.: ${diagCurto}` : "") +
              (l.materiais.length
                ? `\n${l.materiais.map((m) => `${m.material} ${m.quantidade} x ${fmtNum(m.valor_unitario)}`).join("; ")}`
                : ""),
            l.equip_code || "-",
            formatarData(l.data_fecho),
            String(l.dias_ate_fecho),
            String(l.dias_apos_trabalho),
            `${fmtNum(l.horas_cdm)} h`,
            `${fmtNum(l.horas_nossas)} h`,
            `${fmtNum(l.diferenca_horas)} h`,
            fmtNum(l.total_mao_obra),
            fmtNum(l.total_material),
            fmtNum(l.total_geral)
          ];
        }),
        foot: [
          [
            `TOTAL GERAL (${linhas.length} obras)`,
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            fmtNum(totais.total_mao_obra),
            fmtNum(totais.total_material),
            fmtNum(totais.total_geral)
          ]
        ],
        styles: {
          fontSize: 7.5,
          cellPadding: 1.6,
          lineColor: [180, 190, 184],
          lineWidth: 0.1,
          textColor: [30, 30, 30]
        },
        headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontSize: 7.5, fontStyle: "bold" },
        footStyles: {
          fillColor: [230, 244, 236],
          textColor: [0, 90, 40],
          fontSize: 7.5,
          fontStyle: "bold",
          halign: "right"
        },
        alternateRowStyles: { fillColor: [246, 250, 248] },
        columnStyles: {
          0: { cellWidth: 42 },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right" },
          6: { halign: "right" },
          7: { halign: "right" },
          8: { halign: "right" },
          9: { halign: "right" },
          10: { halign: "right", fontStyle: "bold" }
        },
        didParseCell: (d) => {
          if (
            d.section === "body" &&
            d.column.index === 0 &&
            typeof d.cell.raw === "string" &&
            d.cell.raw.includes("\n")
          ) {
            d.cell.styles.fontSize = 6.3;
            d.cell.styles.textColor = [95, 95, 95];
          }
        }
      });

      /* Rodapé em todas as páginas */
      const nPag = doc.getNumberOfPages();
      for (let p = 1; p <= nPag; p++) {
        doc.setPage(p);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(125, 125, 125);
        doc.text(
          "Dias até fecho: abertura -> fecho CdM. Dias pós-trabalho: última intervenção -> fecho. Diferença: horas CdM menos horas do nosso pessoal.",
          M,
          A - 8
        );
        doc.text(
          `Danmo Service System, Lda - Portal Interno - Página ${p} de ${nPag}`,
          L - M,
          A - 8,
          { align: "right" }
        );
      }

      doc.save(`Obras_Fechadas_Facturacao_${sufixoPeriodo}.pdf`);
      toast.success(`PDF exportado: relatório de ${linhas.length} obras (${etiquetaPeriodo}).`);
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setAPdf(false);
    }
  }

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Faturação CdM"
        subtitulo="Obras fechadas que vão a facturação: tempos, materiais e totais."
      >
        <Button variant="outline" size="sm" onClick={carregar} disabled={aCarregar}>
          {aCarregar ? <Rodar /> : <RotateCcw aria-hidden />}
          Actualizar
        </Button>
        <Button variant="outline" size="sm" onClick={exportarExcel} disabled={!linhas.length || aExcel}>
          {aExcel ? <Rodar /> : <Download aria-hidden />} Excel
        </Button>
        <Button variant="outline" size="sm" onClick={exportarPdf} disabled={!linhas.length || aPdf}>
          {aPdf ? <Rodar /> : <Printer aria-hidden />} PDF
        </Button>
      </Cabeca>

      {erro && (
        <Card className="border-erro/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-erro">
            {erro}
            <Button variant="outline" size="sm" onClick={carregar} className="ml-auto">
              <RotateCcw aria-hidden /> Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI titulo="Obras fechadas" valor={String(totais.obras)} nota={etiquetaPeriodo} />
        <KPI titulo="Mão de obra" valor={fmtMt(totais.total_mao_obra)} nota={`${totais.horas_cdm} h (CdM)`} />
        <KPI titulo="Material" valor={fmtMt(totais.total_material)} nota={`${totais.horas_nossas} h do nosso pessoal`} />
        <KPI titulo="TOTAL GERAL" valor={fmtMt(totais.total_geral)} nota="Mão de obra + material" destaque />
      </div>

      {/* Resumo por mês */}
      <Card className="card-sombra">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-semibold">Resumo por mês</p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  aria-label="Buscar por obra ou máquina"
                  className="h-8 w-56 pl-8"
                  placeholder="Nº de obra ou máquina..."
                  value={fBusca}
                  onChange={(e) => setFBusca(e.target.value)}
                />
              </div>
              <Label className="text-xs">Mês</Label>
              <select
                className="border-input bg-transparent h-8 rounded-md border px-2 text-sm outline-none dark:bg-input/30"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              >
                <option value="">Todos</option>
                {MESES_PT.map((nome, i) => (
                  <option key={nome} value={String(i + 1)}>
                    {nome}
                  </option>
                ))}
              </select>
              <Label className="text-xs">Ano</Label>
              <select
                className="border-input bg-transparent h-8 rounded-md border px-2 text-sm outline-none dark:bg-input/30"
                value={ano}
                onChange={(e) => setAno(e.target.value)}
              >
                <option value="">Todos</option>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {porMes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                    <th className="py-2 pr-3">Mês</th>
                    <th className="py-2 pr-3">Obras</th>
                    <th className="py-2 pr-3">Horas CdM</th>
                    <th className="py-2 pr-3">Horas nossas</th>
                    <th className="py-2 pr-3">Diferença</th>
                    <th className="py-2 pr-3">Material</th>
                    <th className="py-2 text-right">Total geral</th>
                  </tr>
                </thead>
                <tbody>
                  {porMes.map((m) => (
                    <tr key={m.mes} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{etiquetaMes(m.mes)}</td>
                      <td className="py-2 pr-3">{m.obras}</td>
                      <td className="py-2 pr-3">{m.horas_cdm} h</td>
                      <td className="py-2 pr-3">{m.horas_nossas} h</td>
                      <td className={"py-2 pr-3 " + (m.horas_cdm - m.horas_nossas > 0 ? "text-erro" : "text-sucesso")}>
                        {arred2(m.horas_cdm - m.horas_nossas)} h
                      </td>
                      <td className="py-2 pr-3">{fmtMt(m.total_material)}</td>
                      <td className="py-2 text-right font-semibold">{fmtMt(m.total_geral)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {aCarregar
                ? "A carregar..."
                : temFiltros
                  ? "Nenhuma obra com os filtros escolhidos."
                  : "Ainda não há obras fechadas registadas."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Lista detalhada */}
      <Card className="card-sombra">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Obras fechadas ({linhas.length})</p>
            <p className="text-muted-foreground text-xs max-w-xl">
              <b>Dias até fecho</b> = dias desde a abertura da obra até ao fecho pela CdM.
              <b> Dias pós-trabalho</b> = dias desde a última intervenção do nosso pessoal até ao
              fecho (quanto tempo a obra ficou à espera de ser fechada).
            </p>
          </div>
          {linhas.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                    <th className="py-2 pr-2"></th>
                    <th className="py-2 pr-2">Nº Obra</th>
                    <th className="py-2 pr-2">Máquina</th>
                    <th className="py-2 pr-2">Fecho</th>
                    <th
                      className="py-2 pr-2 text-right"
                      title="Dias desde a abertura da obra até ao fecho pela CdM"
                    >
                      Dias até fecho
                    </th>
                    <th
                      className="py-2 pr-2 text-right"
                      title="Dias desde a última intervenção do nosso pessoal até ao fecho"
                    >
                      Dias pós-trab.
                    </th>
                    <th className="py-2 pr-2 text-right">H. CdM</th>
                    <th className="py-2 pr-2 text-right">H. nossas</th>
                    <th className="py-2 pr-2 text-right">Dif.</th>
                    <th className="py-2 pr-2 text-right">Total</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <FechoLinha
                      key={l.id}
                      linha={l}
                      aberta={expandida === l.id}
                      alternar={() => setExpandida(expandida === l.id ? null : l.id)}
                      podeEditar={podeEditar}
                      podeApagar={podeApagar}
                      onEditar={() => abrirEdicao(l)}
                      onApagar={() => apagarFecho(l)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {aCarregar
                ? "A carregar..."
                : temFiltros
                  ? "Nenhuma obra com os filtros escolhidos."
                  : "Quando fechares uma obra com o formulário de Faturação, ela aparece aqui."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Modal de edição do fecho */}
      <Modal
        aberto={!!fechoEdit}
        fechar={() => setFechoEdit(null)}
        titulo={`Corrigir fecho - Obra ${fechoEdit?.numero_obra || "S/Nº"}`}
        subtitulo="Os totais são recalculados automaticamente."
        largura="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Data de Fecho</Label>
              <Input type="date" value={editData} onChange={(e) => setEditData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Horas da CdM *</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={editHoras}
                onChange={(e) => setEditHoras(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor por hora (MT) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editValor}
                onChange={(e) => setEditValor(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-accent/40 flex items-center justify-between rounded-md px-3 py-2 text-sm">
            <span className="font-medium">Total de mão de obra</span>
            <span className="font-semibold">{fmtMt(editTotalMao)}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Materiais</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditMats((atual) => [
                    ...atual,
                    { material: "", quantidade: "", valor_unitario: "", livre: false }
                  ])
                }
              >
                <Plus aria-hidden /> Adicionar material
              </Button>
            </div>
            {editMats.map((m, i) => {
              const totalLinha = (Number(m.quantidade) || 0) * (Number(m.valor_unitario) || 0);
              const matsCatalogo = precos.filter((p) => p.tipo === "material");
              return (
                <div key={i} className="grid grid-cols-[1fr_5rem_6.5rem_6rem_2rem] items-end gap-2">
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Material</Label>}
                    {!m.livre && matsCatalogo.length > 0 ? (
                      <select
                        className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                        value={matsCatalogo.some((p) => p.nome === m.material) ? m.material : ""}
                        onChange={(e) => {
                          if (e.target.value === "__livre__") {
                            setEditMats((atual) =>
                              atual.map((x, j) =>
                                j === i ? { ...x, material: "", livre: true } : x
                              )
                            );
                            return;
                          }
                          const p = matsCatalogo.find((x) => x.nome === e.target.value);
                          setEditMats((atual) =>
                            atual.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    material: p?.nome || "",
                                    valor_unitario: p ? String(p.valor) : x.valor_unitario
                                  }
                                : x
                            )
                          );
                        }}
                      >
                        <option value="">- Selecionar material -</option>
                        {matsCatalogo.map((p) => (
                          <option key={p.id} value={p.nome}>
                            {p.nome} - {fmtMt(p.valor)}/{UNIDADES_PRECO[p.unidade] || p.unidade}
                          </option>
                        ))}
                        <option value="__livre__">Outro material (escrever)...</option>
                      </select>
                    ) : (
                      <Input
                        list="lista-gases-edit"
                        value={m.material}
                        onChange={(e) =>
                          setEditMats((atual) =>
                            atual.map((x, j) => (j === i ? { ...x, material: e.target.value } : x))
                          )
                        }
                        placeholder="Ex: Oxigênio"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Qtd</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={m.quantidade}
                      onChange={(e) =>
                        setEditMats((atual) =>
                          atual.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x))
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Valor/un. (MT)</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={m.valor_unitario}
                      onChange={(e) =>
                        setEditMats((atual) =>
                          atual.map((x, j) =>
                            j === i ? { ...x, valor_unitario: e.target.value } : x
                          )
                        )
                      }
                    />
                  </div>
                  <div className="pb-2 text-right text-xs font-semibold">
                    {totalLinha ? fmtMt(totalLinha) : ""}
                  </div>
                  <div className="pb-1">
                    {editMats.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-erro"
                        aria-label="Remover material"
                        onClick={() => setEditMats((atual) => atual.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <datalist id="lista-gases-edit">
              {MATERIAIS_FECHO.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Input value={editObs} onChange={(e) => setEditObs(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-md border-2 border-[var(--primario)] px-3 py-2.5">
            <span className="font-semibold">TOTAL GERAL</span>
            <span className="text-lg font-bold">{fmtMt(editTotalMao + editTotalMat)}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFechoEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarEdicao} disabled={aGravar}>
              {aGravar && <Rodar />}
              Guardar Correcções
            </Button>
          </div>
        </div>
      </Modal>

      {/* Gráfico: faturações mensais do período filtrado, no fim do módulo */}
      <GraficoMensal porMes={porMes} etiquetaPeriodo={etiquetaPeriodo} totalGeral={totais.total_geral} />
    </div>
  );
}

/* ---- KPI ---- */
function KPI({
  titulo,
  valor,
  nota,
  destaque
}: {
  titulo: string;
  valor: string;
  nota?: string;
  destaque?: boolean;
}) {
  return (
    <Card className={"card-sombra " + (destaque ? "border-[var(--primario)] border-2" : "")}>
      <CardContent className="space-y-1 p-4">
        <p className="text-muted-foreground text-xs font-semibold uppercase">{titulo}</p>
        <p className={"text-xl font-bold " + (destaque ? "text-[var(--primario)]" : "")}>{valor}</p>
        {nota && <p className="text-muted-foreground text-xs">{nota}</p>}
      </CardContent>
    </Card>
  );
}

/* ---- Linha da tabela (com materiais expandíveis) ---- */
function FechoLinha({
  linha,
  aberta,
  alternar,
  podeEditar,
  podeApagar,
  onEditar,
  onApagar
}: {
  linha: LinhaFaturacao;
  aberta: boolean;
  alternar: () => void;
  podeEditar: boolean;
  podeApagar: boolean;
  onEditar: () => void;
  onApagar: () => void;
}) {
  const dif = linha.diferenca_horas;
  return (
    <>
      <tr className="border-b hover:bg-accent/30">
        <td className="py-2 pr-2">
          <button
            type="button"
            onClick={alternar}
            aria-label={aberta ? "Fechar detalhes" : "Ver detalhes"}
            className="rounded p-1 hover:bg-accent"
          >
            {aberta ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
          </button>
        </td>
        <td className="py-2 pr-2 font-medium">
          {linha.os_id ? (
            <a
              href={`/oficina/ordens/${linha.os_id}`}
              title="Abrir a obra nas Ordens de Serviço"
              className="text-primario hover:underline dark:text-primario-forte"
            >
              {linha.numero_obra || "S/Nº"}
            </a>
          ) : (
            (linha.numero_obra || "S/Nº")
          )}
        </td>
        <td className="py-2 pr-2">
          {linha.equipment_id ? (
            <a
              href={`/oficina/maquina/${linha.equipment_id}`}
              title="Abrir o histórico da máquina"
              className="text-info hover:underline"
            >
              {linha.equip_code || "-"}
            </a>
          ) : (
            (linha.equip_code || "-")
          )}
        </td>
        <td className="py-2 pr-2">{formatarData(linha.data_fecho)}</td>
        <td className="py-2 pr-2 text-right">{linha.dias_ate_fecho}</td>
        <td className="py-2 pr-2 text-right">{linha.dias_apos_trabalho}</td>
        <td className="py-2 pr-2 text-right">{linha.horas_cdm} h</td>
        <td className="py-2 pr-2 text-right">{linha.horas_nossas} h</td>
        <td className={"py-2 pr-2 text-right " + (dif > 0 ? "text-erro" : dif < 0 ? "text-sucesso" : "")}>
          {dif} h
        </td>
        <td className="py-2 pr-2 text-right font-semibold">{fmtMt(linha.total_geral)}</td>
        <td className="py-2">
          <span className="flex justify-end gap-1">
            {podeEditar && (
              <Button variant="ghost" size="icon" className="size-8" aria-label="Editar fecho" onClick={onEditar}>
                <Pencil className="size-4" aria-hidden />
              </Button>
            )}
            {podeApagar && (
              <Button variant="ghost" size="icon" className="size-8 text-erro" aria-label="Apagar fecho" onClick={onApagar}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </span>
        </td>
      </tr>
      {aberta && (
        <tr className="bg-accent/20">
          <td colSpan={11} className="px-4 py-3">
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase">Diagnóstico / Avaria / Motivo de entrada</p>
                <p className="text-sm">
                  {linha.diagnostico || "A obra não tem diagnóstico preenchido."}
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase">Materiais aplicados</p>
                {linha.materiais.length ? (
                  <ul className="space-y-1 text-sm">
                    {linha.materiais.map((m: MaterialFecho) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span>
                          {m.material} - {m.quantidade} x {fmtMt(m.valor_unitario)}
                        </span>
                        <span className="font-semibold">{fmtMt(m.total)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">Sem materiais.</p>
                )}
                <p className="text-muted-foreground text-xs">
                  Mão de obra: {fmtMt(linha.total_mao_obra)} ({linha.horas_cdm} h x {fmtMt(linha.valor_hora)}/h) +
                  material: {fmtMt(linha.total_material)}
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase">Detalhes</p>
                <p className="text-sm">
                  Responsável do fecho: <span className="font-medium">{linha.responsavel || "-"}</span>
                </p>
                <p className="text-sm">
                  Última intervenção:{" "}
                  <span className="font-medium">
                    {linha.data_ultima_intervencao ? formatarData(linha.data_ultima_intervencao) : "-"}
                  </span>
                </p>
                <p className="text-sm">
                  Abertura da obra:{" "}
                  <span className="font-medium">
                    {linha.data_abertura ? formatarData(linha.data_abertura) : "-"}
                  </span>
                </p>
                {linha.observacao && <p className="text-sm">Obs.: {linha.observacao}</p>}
              </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/* ---- Helpers dos relatórios ---- */

/** Lê o logotipo da marca e devolve um data URL PNG (para o jsPDF).
 *  Devolve "" se não conseguir carregar (o PDF segue com a caixa verde). */
function carregarLogo(caminho: string): Promise<string> {
  return new Promise((resolvida) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement("canvas");
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          const ctx = cv.getContext("2d");
          if (!ctx) return resolvida("");
          ctx.drawImage(img, 0, 0);
          resolvida(cv.toDataURL("image/png"));
        } catch {
          resolvida("");
        }
      };
      img.onerror = () => resolvida("");
      img.src = caminho;
    } catch {
      resolvida("");
    }
  });
}

/** Data e hora da emissão: "15/10/2026 às 09:42". */
function agoraEmissao(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} às ${hh}:${mi}`;
}

/** Número pt-PT com 2 decimais (sem o sufixo MT). */
function fmtNum(n: number): string {
  return new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(n || 0);
}

/** Número compacto para o eixo e as barras: "1,2 M". */
function fmtCompacto(n: number): string {
  return new Intl.NumberFormat("pt-PT", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(n || 0);
}

/* ---- Gráfico de faturações mensais (barras) ---- */
function GraficoMensal({
  porMes,
  etiquetaPeriodo,
  totalGeral
}: {
  porMes: ResumoMes[];
  etiquetaPeriodo: string;
  totalGeral: number;
}) {
  // Ordem cronológica: mês mais antigo à esquerda
  const dadosGrafico = useMemo(() => [...porMes].reverse(), [porMes]);
  const maximo = useMemo(() => Math.max(1, ...dadosGrafico.map((m) => m.total_geral)), [dadosGrafico]);
  const niveis = [1, 0.75, 0.5, 0.25, 0];

  return (
    <Card className="card-sombra">
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">Faturação mensal</p>
          <p className="text-muted-foreground text-xs">
            Total do período: <span className="font-semibold text-[var(--primario)]">{fmtMt(totalGeral)}</span> · {etiquetaPeriodo}
          </p>
        </div>
        {dadosGrafico.length ? (
          <div className="flex gap-2">
            <div className="flex h-56 w-14 shrink-0 flex-col justify-between pb-6 pr-1 text-right text-[10px] tabular-nums text-muted-foreground">
              {niveis.map((n) => (
                <span key={n} className="leading-none">
                  {fmtCompacto(maximo * n)}
                </span>
              ))}
            </div>
            <div className="relative h-56 flex-1">
              <div className="absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="border-t border-border/50" />
                ))}
              </div>
              <div className="absolute inset-x-0 top-0 bottom-6 flex items-end gap-2 overflow-x-auto pb-1">
                {dadosGrafico.map((m) => {
                  const pct = Math.max(1.5, (m.total_geral / maximo) * 80);
                  return (
                    <div
                      key={m.mes}
                      className="flex h-full min-w-[42px] flex-1 flex-col"
                      title={`${etiquetaMes(m.mes)}: ${m.obras} obras, ${fmtNum(m.horas_cdm)} h CdM, material ${fmtMt(m.total_material)}, total ${fmtMt(m.total_geral)}`}
                    >
                      <div className="flex flex-1 flex-col items-stretch justify-end">
                        <span className="mb-0.5 text-center text-[10px] font-semibold text-[var(--primario)]">
                          {fmtCompacto(m.total_geral)}
                        </span>
                        <div
                          className="w-full rounded-t bg-[var(--primario)] transition-opacity hover:opacity-75"
                          style={{ height: `${pct}%` }}
                        />
                      </div>
                      <span className="mt-1 truncate text-center text-[10px] text-muted-foreground">
                        {etiquetaMes(m.mes)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Ainda não há faturação para mostrar.</p>
        )}
      </CardContent>
    </Card>
  );
}
