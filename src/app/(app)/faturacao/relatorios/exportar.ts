/**
 * exportar.ts - Excel dos Relatórios da Faturação (3 folhas: Documentos,
 * Por Cliente, Por Elaborado), no padrão visual das exportações do
 * portal (cabeçalho verde DANMO, zebra, filtros no subtítulo).
 */

/** Data e hora da emissão: "15/10/2026 às 09:42". */
function emissao(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} às ${hh}:${mi}`;
}

/** Data de hoje em AAAA-MM-DD (Maputo). */
export function dataHojeISO(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

export type Folha = {
  nome: string;
  cabecalhos: string[];
  linhas: (string | number)[][];
  colunasDireita: number[];
};

export async function exportarFaturacaoExcel(
  titulo: string,
  filtros: string,
  folhas: Folha[]
): Promise<void> {
  const XLSXS = await import("xlsx-js-style");
  const wb = XLSXS.utils.book_new();
  const borda = { style: "thin" as const, color: { rgb: "B7C4BC" } };
  const bordas = { top: borda, bottom: borda, left: borda, right: borda };

  for (const folha of folhas) {
    const nCol = folha.cabecalhos.length;
    const topo: (string | number)[][] = [
      ["DANMO SERVICE SYSTEM, LDA"],
      [titulo],
      [filtros],
      [`Emitido em ${emissao()} (Portal Interno Danmo)`],
      [],
      folha.cabecalhos
    ];
    const aoa = [...topo, ...folha.linhas];
    const ws = XLSXS.utils.aoa_to_sheet(aoa);
    ws["!cols"] = folha.cabecalhos.map(() => ({ wch: 16 }));
    ws["!merges"] = [0, 1, 2, 3].map((l) => ({
      s: { r: l, c: 0 },
      e: { r: l, c: Math.max(0, nCol - 1) }
    }));
    ws["!autofilter"] = {
      ref: XLSXS.utils.encode_range({ s: { r: 5, c: 0 }, e: { r: aoa.length - 1, c: nCol - 1 } })
    };
    for (let r = 0; r < aoa.length; r++) {
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
          const eNum = folha.colunasDireita.includes(c);
          if (eNum && typeof cel.v === "string" && cel.v !== "" && Number.isFinite(Number(cel.v))) {
            cel.v = Number(cel.v);
            cel.t = "n";
          }
          cel.s = {
            font: { name: "Calibri", sz: 10, color: { rgb: "1A1A1A" } },
            fill: { patternType: "solid", fgColor: { rgb: r % 2 === 0 ? "F4F9F6" : "FFFFFF" } },
            alignment: { vertical: "center", horizontal: eNum ? "right" : "left", wrapText: false },
            border: bordas
          };
        }
      }
    }
    XLSXS.utils.book_append_sheet(wb, ws, folha.nome);
  }
  XLSXS.writeFile(wb, `${titulo.replace(/[^a-zA-Z0-9]+/g, "_")}_${dataHojeISO()}.xlsx`);
}
