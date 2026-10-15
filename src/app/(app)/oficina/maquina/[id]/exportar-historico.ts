/**
 * exportar-historico.ts - Exportações do histórico de uma máquina.
 *
 * PDF (jsPDF + autoTable, A4 paisagem) e Excel (xlsx-js-style) com o
 * mesmo padrão da Faturação e dos Relatórios: logotipo da marca,
 * cabeçalhos verdes, zebra, números gravados como NUMEROS.
 *
 * Também traz os cálculos partilhados (horas totais, dias desde a
 * última obra, resumo de peças e técnicos) para a página e as
 * exportações usarem UMA única fonte de verdade.
 */

import {
  dataHojeISO,
  formatarData,
  type ColaboradorLinha,
  type Equipamento,
  type Intervencao,
  type OrdemServico,
  type PecaOS
} from "@/lib/oficina";

export type DadosHistorico = {
  equip: Equipamento;
  ordens: OrdemServico[];
  intervencoes: (Intervencao & { obra_numero: string | null })[];
  pecas: (PecaOS & { obra_numero: string | null })[];
  colaboradores: { id: number; name: string; code?: string | null; setor?: string | null }[];
};

/* ============ Cálculos partilhados com a página ============ */

/** Soma das horas de todas as intervenções. */
export function totalHorasDe(
  intervencoes: { hours?: number | string | null }[]
): number {
  return intervencoes.reduce((s, r) => s + (parseFloat(String(r.hours)) || 0), 0);
}

/**
 * Dias desde a última obra (a API devolve as obras por data de
 * abertura DESC, logo a primeira da lista é a mais recente).
 * Devolve null quando a máquina nunca teve obra.
 */
export function diasDesdeUltimaDe(
  ordens: OrdemServico[],
  agora: number
): number | null {
  if (!ordens.length || !ordens[0].data_abertura) return null;
  const dias = Math.floor(
    (agora - new Date(ordens[0].data_abertura).getTime()) / 86400000
  );
  return Math.max(0, dias);
}

/** Resumo de peças: quantidade total e última vez por peça. */
export function resumoPecasDe(
  pecas: (PecaOS & { obra_numero?: string | null })[]
): [string, { qtd: number; ultima: string | null }][] {
  const mapa = new Map<string, { qtd: number; ultima: string | null }>();
  pecas.forEach((p) => {
    const atual = mapa.get(p.peca) || { qtd: 0, ultima: null };
    const novaQtd = atual.qtd + (p.quantidade || 1);
    const novaUltima =
      !atual.ultima || (p.data || "") > atual.ultima ? p.data || null : atual.ultima;
    mapa.set(p.peca, { qtd: novaQtd, ultima: novaUltima });
  });
  return [...mapa.entries()];
}

/** Técnicos com número de intervenções e horas somadas. */
export function tecnicosDe(
  intervencoes: (Intervencao & { obra_numero?: string | null })[],
  colaboradores: ColaboradorLinha[]
): { nome: string; code: string; setor: string; n: number; horas: number }[] {
  const mapa = new Map<
    number,
    { nome: string; code: string; setor: string; n: number; horas: number }
  >();
  intervencoes.forEach((r) => {
    (r.tecnicos || []).forEach((t) => {
      const atual = mapa.get(t.id) || {
        nome: t.name,
        code: t.code || "-",
        setor: colaboradores.find((c) => c.id === t.id)?.setor || "-",
        n: 0,
        horas: 0
      };
      atual.n += 1;
      atual.horas += parseFloat(String(r.hours)) || 0;
      mapa.set(t.id, atual);
    });
  });
  return [...mapa.values()].sort((a, b) => b.horas - a.horas);
}

/* ============ Helpers locais (mesmos dos Relatórios) ============ */

/** Data e hora da emissão: "15/10/2026 às 09:42". */
function agoraEmissao(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} às ${hh}:${mi}`;
}

/** Lê o logotipo da marca e devolve um data URL PNG ("" se falhar). */
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

/** Nome de ficheiro seguro (códigos de máquina podem ter "/"). */
function slugCode(code: string): string {
  return (code || "maquina").replace(/[^\w.-]+/g, "-");
}

/** KPIs do histórico (usados no PDF). */
function kpisDe(d: DadosHistorico, agora: number) {
  const dias = diasDesdeUltimaDe(d.ordens, agora);
  return {
    obras: d.ordens.length,
    intervencoes: d.intervencoes.length,
    horas: Math.round(totalHorasDe(d.intervencoes) * 100) / 100,
    dias: dias,
    pecas: resumoPecasDe(d.pecas).length
  };
}

/* ============ PDF ============ */

export async function exportarHistoricoPdf(d: DadosHistorico): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  type DocComTabela = import("jspdf").jsPDF & { lastAutoTable: { finalY: number } };
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const L = doc.internal.pageSize.getWidth();
  const A = doc.internal.pageSize.getHeight();
  const M = 14;
  const VERDE: [number, number, number] = [0, 150, 57];
  const agora = Date.now();
  const kpis = kpisDe(d, agora);

  // Cabeçalho com o logotipo (caixa verde como reserva)
  const logo = await carregarLogo("/logos/DANMO.png");
  if (logo) {
    doc.addImage(logo, "PNG", M, 8.5, 22.2, 13);
  } else {
    doc.setFillColor(VERDE[0], VERDE[1], VERDE[2]);
    doc.roundedRect(M, 10, 46, 13, 1.5, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("DANMO", M + 23, 18.2, { align: "center" });
  }
  const subEquip = [
    d.equip.fleet_type || "-",
    d.equip.group_name || "-",
    `Adquirida em ${d.equip.year_acquired ?? "-"}`
  ].join("  ·  ");
  const xTexto = M + (logo ? 28 : 53);
  doc.setTextColor(25, 25, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(`Histórico da Máquina ${d.equip.code}`, xTexto, 16.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(95, 95, 95);
  doc.text(`${subEquip}   ·   Emitido em ${agoraEmissao()}`, xTexto, 22);
  doc.setProperties({ title: `Histórico da Máquina ${d.equip.code}` });
  doc.setDrawColor(VERDE[0], VERDE[1], VERDE[2]);
  doc.setLineWidth(0.8);
  doc.line(M, 29.5, L - M, 29.5);

  // KPIs
  const kpisPdf: { t: string; v: string }[] = [
    { t: "OBRAS", v: String(kpis.obras) },
    { t: "INTERVENÇÕES", v: String(kpis.intervencoes) },
    { t: "HORAS TOTAIS", v: `${kpis.horas}h` },
    { t: "DIAS DESDE A ÚLTIMA OBRA", v: kpis.dias == null ? "-" : String(kpis.dias) },
    { t: "PEÇAS REGISTADAS", v: String(kpis.pecas) }
  ];
  const kw = (L - 2 * M - 4 * 4) / 5;
  kpisPdf.forEach((k, i) => {
    const x = M + i * (kw + 4);
    doc.setFillColor(248, 249, 250);
    doc.setDrawColor(203, 208, 214);
    doc.roundedRect(x, 33, kw, 15, 1.5, 1.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(110, 110, 110);
    doc.text(k.t, x + 3, 38);
    doc.setFontSize(12);
    doc.setTextColor(25, 25, 25);
    doc.text(k.v, x + 3, 44.5);
  });

  const estiloTabela = {
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [180, 190, 184] as [number, number, number], lineWidth: 0.1, textColor: [30, 30, 30] as [number, number, number] },
    headStyles: { fillColor: VERDE, textColor: [255, 255, 255] as [number, number, number], fontSize: 8, fontStyle: "bold" as const },
    alternateRowStyles: { fillColor: [246, 250, 248] as [number, number, number] }
  };
  function tituloSecao(texto: string, y: number) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(25, 25, 25);
    doc.text(texto, M, y);
  }

  // 1. Ordens de Serviço
  tituloSecao(`Ordens de Serviço (${d.ordens.length})`, 56);
  autoTable(doc, {
    startY: 58,
    margin: { left: M, right: M, top: 18, bottom: 12 },
    head: [["Obra", "Estado físico", "Abertura", "Duração (dias)", "Sector", "Diagnóstico"]],
    body:
      d.ordens.length === 0
        ? [["-", "-", "-", "-", "-", "Nenhuma obra registada."]]
        : d.ordens.map((o) => {
            const dias = Math.floor(
              (new Date(o.data_fecho || agora).getTime() -
                new Date(o.data_abertura || agora).getTime()) /
                86400000
            );
            const avaria = o.descricao_avaria || "-";
            return [
              o.numero_obra || "S/Nº",
              o.status_fisico || "-",
              formatarData(o.data_abertura),
              String(Math.max(0, dias)),
              o.sector || "-",
              avaria.length > 70 ? `${avaria.slice(0, 70)}...` : avaria
            ];
          }),
    ...estiloTabela,
    columnStyles: { 3: { halign: "right" } }
  });

  // 2. Intervenções
  let y = (doc as DocComTabela).lastAutoTable.finalY + 8;
  tituloSecao(`Intervenções (${d.intervencoes.length})`, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: M, right: M, top: 18, bottom: 12 },
    head: [["Data", "Obra", "Descrição", "Técnicos", "Horas"]],
    body:
      d.intervencoes.length === 0
        ? [["-", "-", "Nenhuma intervenção registada.", "-", "-"]]
        : d.intervencoes.map((r) => {
            const desc = r.description || "-";
            return [
              formatarData(r.shift_date),
              r.obra_numero || "S/Nº",
              desc.length > 60 ? `${desc.slice(0, 60)}...` : desc,
              (r.tecnicos || []).map((t) => t.name).join(", ") || "-",
              String(r.hours ?? "-")
            ];
          }),
    ...estiloTabela,
    columnStyles: { 4: { halign: "right" } }
  });

  // 3. Peças (resumo)
  const resumoPecas = resumoPecasDe(d.pecas);
  y = (doc as DocComTabela).lastAutoTable.finalY + 8;
  tituloSecao(`Peças aplicadas, resumo (${resumoPecas.length})`, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: M, right: M, top: 18, bottom: 12 },
    head: [["Peça", "Qtd total", "Última vez"]],
    body:
      resumoPecas.length === 0
        ? [["-", "-", "Nenhuma peça registada."]]
        : resumoPecas.map(([peca, info]) => [
            peca,
            String(info.qtd),
            info.ultima ? formatarData(info.ultima) : "-"
          ]),
    ...estiloTabela,
    columnStyles: { 1: { halign: "right" } }
  });

  // 4. Técnicos por horas
  const tecnicos = tecnicosDe(d.intervencoes, d.colaboradores);
  y = (doc as DocComTabela).lastAutoTable.finalY + 8;
  tituloSecao(`Técnicos por horas (${tecnicos.length})`, y);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: M, right: M, top: 18, bottom: 12 },
    head: [["Técnico", "Código", "Sector", "Intervenções", "Horas"]],
    body:
      tecnicos.length === 0
        ? [["-", "-", "-", "-", "-"]]
        : tecnicos.map((t) => [
            t.nome,
            t.code,
            t.setor,
            String(t.n),
            String(Math.round(t.horas * 100) / 100)
          ]),
    ...estiloTabela,
    columnStyles: { 3: { halign: "right" }, 4: { halign: "right" } }
  });

  // Rodapé em todas as páginas
  const nPag = doc.getNumberOfPages();
  for (let p = 1; p <= nPag; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(125, 125, 125);
    doc.text(
      `Danmo Service System, Lda - Portal Interno - Página ${p} de ${nPag}`,
      L - M,
      A - 8,
      { align: "right" }
    );
  }

  doc.save(`Historico_Maquina_${slugCode(d.equip.code)}_${dataHojeISO()}.pdf`);
}

/* ============ Excel ============ */

export async function exportarHistoricoExcel(d: DadosHistorico): Promise<void> {
  const XLSXS = await import("xlsx-js-style");
  const wb = XLSXS.utils.book_new();
  const agora = Date.now();
  const borda = { style: "thin" as const, color: { rgb: "B7C4BC" } };
  const bordas = { top: borda, bottom: borda, left: borda, right: borda };

  /** Folha formatada com o padrão da marca (igual aos Relatórios). */
  function montarFolha(
    nome: string,
    cabecalhos: string[],
    dadosAoa: (string | number)[][],
    larguras: number[],
    colsNum: number[],
    colsWrap: number[]
  ) {
    const aoa: (string | number)[][] = [
      ["DANMO SERVICE SYSTEM, LDA"],
      [`Histórico da Máquina ${d.equip.code}`],
      [
        `${d.equip.fleet_type || "-"}  ·  ${d.equip.group_name || "-"}  ·  Adquirida em ${
          d.equip.year_acquired ?? "-"
        }`
      ],
      [`Emitido em ${agoraEmissao()} (Portal Interno Danmo)`],
      [],
      cabecalhos,
      ...dadosAoa
    ];
    const ws = XLSXS.utils.aoa_to_sheet(aoa);
    const nCol = cabecalhos.length;
    const nLin = aoa.length;
    ws["!cols"] = larguras.map((w) => ({ wch: w }));
    ws["!merges"] = [0, 1, 2, 3].map((l) => ({
      s: { r: l, c: 0 },
      e: { r: l, c: Math.max(0, nCol - 1) }
    }));
    ws["!autofilter"] = {
      ref: XLSXS.utils.encode_range({ s: { r: 5, c: 0 }, e: { r: nLin - 1, c: nCol - 1 } })
    };
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
              horizontal: colsNum.includes(c) ? "right" : "left",
              wrapText: true
            },
            border: bordas
          };
          continue;
        }
        if (r > 5) {
          const eNum = colsNum.includes(c);
          if (eNum && typeof cel.v === "number") {
            // números já gravados como números
          } else if (eNum && typeof cel.v === "string" && cel.v !== "" && Number.isFinite(Number(cel.v))) {
            cel.v = Number(cel.v);
            cel.t = "n";
          }
          cel.s = {
            font: { name: "Calibri", sz: 10, color: { rgb: "1A1A1A" } },
            fill: { patternType: "solid", fgColor: { rgb: r % 2 === 0 ? "F4F9F6" : "FFFFFF" } },
            alignment: {
              vertical: "center",
              horizontal: eNum ? "right" : "left",
              wrapText: colsWrap.includes(c)
            },
            border: bordas
          };
        }
      }
    }
    XLSXS.utils.book_append_sheet(wb, ws, nome);
  }

  // Folha 1: Resumo (equipamento + KPIs)
  const kpis = kpisDe(d, agora);
  montarFolha(
    "Resumo",
    ["Campo", "Valor"],
    [
      ["Máquina", d.equip.code],
      ["Nome", d.equip.name || "-"],
      ["Categoria", d.equip.fleet_type || "-"],
      ["Grupo", d.equip.group_name || "-"],
      ["Modelo", d.equip.model || "-"],
      ["Ano de aquisição", d.equip.year_acquired ?? "-"],
      ["Ano de abate", d.equip.year_decommissioned ?? "-"],
      ["Estado", d.equip.active ? "Activo" : "Inactivo"],
      ["Obras", kpis.obras],
      ["Intervenções", kpis.intervencoes],
      ["Horas totais", kpis.horas],
      ["Dias desde a última obra", kpis.dias == null ? "-" : kpis.dias],
      ["Peças registadas (diferentes)", kpis.pecas]
    ],
    [30, 26],
    [1],
    []
  );

  // Folha 2: Ordens de Serviço
  montarFolha(
    "Ordens de Serviço",
    ["Obra", "Estado físico", "Abertura", "Duração (dias)", "Sector", "Diagnóstico"],
    d.ordens.length === 0
      ? [["-", "-", "-", "-", "-", "Nenhuma obra registada."]]
      : d.ordens.map((o) => {
          const dias = Math.floor(
            (new Date(o.data_fecho || agora).getTime() -
              new Date(o.data_abertura || agora).getTime()) /
              86400000
          );
          return [
            o.numero_obra || "S/Nº",
            o.status_fisico || "-",
            formatarData(o.data_abertura),
            Math.max(0, dias),
            o.sector || "-",
            o.descricao_avaria || "-"
          ];
        }),
    [12, 18, 12, 14, 16, 50],
    [3],
    [5]
  );

  // Folha 3: Intervenções
  montarFolha(
    "Intervenções",
    ["Data", "Obra", "Descrição", "Técnicos", "Horas"],
    d.intervencoes.length === 0
      ? [["-", "-", "Nenhuma intervenção registada.", "-", "-"]]
      : d.intervencoes.map((r) => [
          formatarData(r.shift_date),
          r.obra_numero || "S/Nº",
          r.description || "-",
          (r.tecnicos || []).map((t) => t.name).join(", ") || "-",
          r.hours != null ? Math.round(parseFloat(String(r.hours)) * 100) / 100 : "-"
        ]),
    [12, 12, 45, 30, 9],
    [4],
    [2]
  );

  // Folha 4: Peças (resumo)
  montarFolha(
    "Peças",
    ["Peça", "Qtd total", "Última vez"],
    resumoPecasDe(d.pecas).map(([peca, info]) => [
      peca,
      info.qtd,
      info.ultima ? formatarData(info.ultima) : "-"
    ]),
    [40, 12, 14],
    [1],
    []
  );

  // Folha 5: Técnicos
  montarFolha(
    "Técnicos",
    ["Técnico", "Código", "Sector", "Intervenções", "Horas"],
    tecnicosDe(d.intervencoes, d.colaboradores).map((t) => [
      t.nome,
      t.code,
      t.setor,
      t.n,
      Math.round(t.horas * 100) / 100
    ]),
    [28, 10, 18, 14, 10],
    [3, 4],
    []
  );

  XLSXS.writeFile(wb, `Historico_Maquina_${slugCode(d.equip.code)}_${dataHojeISO()}.xlsx`);
}
