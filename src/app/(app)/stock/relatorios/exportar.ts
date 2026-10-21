/**
 * exportar.ts - Exportações dos Relatórios do Stock.
 *
 * PDF (jsPDF + autoTable, A4 paisagem) e Excel (xlsx-js-style) com o
 * mesmo padrão da Faturação e dos Equipamentos: logotipo da marca,
 * cabeçalhos verdes, zebra e os filtros activos no subtítulo.
 */

/* ============ Helpers locais (mesmos dos Equipamentos) ============ */

/** Data e hora da emissão: "15/10/2026 às 09:42". */
function agoraEmissao(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} às ${hh}:${mi}`;
}

/** Data de hoje em AAAA-MM-DD. */
export function dataHojeISO(): string {
  const mapa = new Date(Date.now() + 2 * 3600 * 1000);
  return mapa.toISOString().slice(0, 10);
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

/* ============ PDF ============ */

/** Alinhamento por coluna no autoTable: { 4: { halign: "right" } }. */
export type ColunasPdf = Record<number, { halign?: "left" | "center" | "right" }>;

export async function exportarRelatorioPdf(
  titulo: string,
  filtros: string,
  cabecalhos: string[],
  linhas: (string | number)[][],
  colunasDireita: ColunasPdf = {}
): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const L = doc.internal.pageSize.getWidth();
  const A = doc.internal.pageSize.getHeight();
  const M = 14;
  const VERDE: [number, number, number] = [0, 150, 57];
  const etiqueta = filtros.length > 130 ? `${filtros.slice(0, 130).trim()}...` : filtros;

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
  const xTexto = M + (logo ? 28 : 53);
  doc.setTextColor(25, 25, 25);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(titulo, xTexto, 16.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(95, 95, 95);
  doc.text(`${etiqueta}   ·   Emitido em ${agoraEmissao()}`, xTexto, 22);
  doc.setProperties({ title: titulo });
  doc.setDrawColor(VERDE[0], VERDE[1], VERDE[2]);
  doc.setLineWidth(0.8);
  doc.line(M, 29.5, L - M, 29.5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(25, 25, 25);
  doc.text(`${titulo} (${linhas.length})`, M, 40);

  autoTable(doc, {
    startY: 42,
    margin: { left: M, right: M, top: 16, bottom: 12 },
    head: [cabecalhos],
    body: linhas.map((l) => l.map((v) => String(v))),
    styles: { fontSize: 8, cellPadding: 1.6, lineColor: [180, 190, 184], lineWidth: 0.1, textColor: [30, 30, 30] },
    headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontSize: 8, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [246, 250, 248] },
    columnStyles: colunasDireita
  });

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

  doc.save(`${titulo.replace(/ /g, "_")}_${dataHojeISO()}.pdf`);
}

/* ============ Excel ============ */

export async function exportarRelatorioExcel(
  titulo: string,
  folha: string,
  filtros: string,
  cabecalhos: string[],
  linhas: (string | number)[][],
  colunasDireita: number[] = []
): Promise<void> {
  const XLSXS = await import("xlsx-js-style");
  const wb = XLSXS.utils.book_new();
  const borda = { style: "thin" as const, color: { rgb: "B7C4BC" } };
  const bordas = { top: borda, bottom: borda, left: borda, right: borda };

  const aoa: (string | number)[][] = [
    ["DANMO SERVICE SYSTEM, LDA"],
    [titulo],
    [filtros],
    [`Emitido em ${agoraEmissao()} (Portal Interno Danmo)`],
    [],
    cabecalhos,
    ...linhas
  ];
  const ws = XLSXS.utils.aoa_to_sheet(aoa);
  const nCol = cabecalhos.length;
  const nLin = aoa.length;
  ws["!cols"] = cabecalhos.map(() => ({ wch: 16 }));
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
          alignment: { vertical: "center", horizontal: "left", wrapText: true },
          border: bordas
        };
        continue;
      }
      if (r > 5) {
        const eNum = colunasDireita.includes(c);
        if (eNum && typeof cel.v === "string" && cel.v !== "" && Number.isFinite(Number(cel.v))) {
          cel.v = Number(cel.v);
          cel.t = "n";
        }
        cel.s = {
          font: { name: "Calibri", sz: 10, color: { rgb: "1A1A1A" } },
          fill: { patternType: "solid", fgColor: { rgb: r % 2 === 0 ? "F4F9F6" : "FFFFFF" } },
          alignment: {
            vertical: "center",
            horizontal: eNum ? "right" : "left",
            wrapText: false
          },
          border: bordas
        };
      }
    }
  }
  XLSXS.utils.book_append_sheet(wb, ws, folha);
  XLSXS.writeFile(wb, `${titulo.replace(/ /g, "_")}_${dataHojeISO()}.xlsx`);
}
