/**
 * exportar.ts - Excel do Quadro de Pessoal (lista filtrada), no padrao
 * visual das exportacoes do portal: cabecalho verde DANMO, zebra e os
 * filtros activos no subtitulo.
 */

import {
  EMPRESA_LABEL,
  formatoData,
  inicioServico,
  tempoDeCasa,
  temposTransferido,
  type Colaborador,
  type ResumoQuadro
} from "@/lib/rh";

/** Data e hora da emissao: "15/10/2026 as 09:42". */
function emissao(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} as ${hh}:${mi}`;
}

/** Data de hoje em AAAA-MM-DD (Maputo). */
function dataHojeISO(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

const CABECALHOS = [
  "Código", "Nome", "Função", "Empresa", "Tipo", "Vínculo",
  "Empresa de origem", "Admissão no grupo", "Início de serviço",
  "Tempo de casa", "Tempo total no grupo", "Estado", "Área",
  "Mês de férias", "Nascimento", "B.I.", "INSS", "NUIT",
  "Contacto 1", "Contacto 2", "Email"
];

function textoFiltros(
  filtros: { texto: string; empresa: string; estado: string; tipo: string; vinculo: string }
): string {
  const partes: string[] = [];
  if (filtros.texto) partes.push(`pesquisa "${filtros.texto}"`);
  if (filtros.empresa === "porto") partes.push("Danmo Porto");
  if (filtros.empresa === "danmo") partes.push("Danmo (TCM)");
  if (filtros.empresa === "sem") partes.push("sem classificar");
  if (filtros.estado === "activos") partes.push("só activos");
  if (filtros.estado === "inactivos") partes.push("só inactivos");
  if (filtros.tipo === "efetivo") partes.push("só efetivos");
  if (filtros.tipo === "estagiario") partes.push("só estagiários");
  if (filtros.vinculo === "contratado") partes.push("contratados");
  if (filtros.vinculo === "transferido") partes.push("transferidos");
  return partes.length ? `Filtros: ${partes.join(", ")}` : "Sem filtros (quadro completo)";
}

export async function exportarQuadroExcel(
  lista: Colaborador[],
  resumo: ResumoQuadro,
  filtros: { texto: string; empresa: string; estado: string; tipo: string; vinculo: string }
): Promise<void> {
  const XLSXS = await import("xlsx-js-style");
  const wb = XLSXS.utils.book_new();
  const borda = { style: "thin" as const, color: { rgb: "B7C4BC" } };
  const bordas = { top: borda, bottom: borda, left: borda, right: borda };

  const linhas: (string | number)[][] = lista.map((c) => {
    const parcelas = temposTransferido(c);
    const estagiario = (c.tipo_colaborador || "") === "estagiario";
    return [
      c.code || "",
      c.name || "",
      c.categoria || "",
      EMPRESA_LABEL[c.empresa || ""] || "Sem classificar",
      estagiario ? "Estagiário" : "Efetivo",
      estagiario ? "Estágio" : (c.tipo_vinculo || "contratado") === "transferido" ? "Transferido" : "Contratado",
      c.empresa_origem || "",
      formatoData(c.data_admissao_grupo),
      formatoData(inicioServico(c)),
      tempoDeCasa(c),
      parcelas ? parcelas.total : "",
      c.active !== false ? "Activo" : "Inactivo",
      c.setor || c.department || "",
      c.mes_ferias || "",
      formatoData(c.data_nascimento),
      c.bi_numero || "",
      c.inss_numero || "",
      c.nuit_numero || "",
      c.contacto_1 || c.contacto || "",
      c.contacto_2 || "",
      c.email || ""
    ];
  });

  const topo: (string | number)[][] = [
    ["DANMO SERVICE SYSTEM, LDA"],
    ["Quadro de Pessoal"],
    [
      `${textoFiltros(filtros)} - ${resumo.activos} activos, ${resumo.inactivos} inactivos, ` +
        `${resumo.estagiarios} estagiários, ${resumo.estagiosATerminar} estágios a decidir`
    ],
    [`Emitido em ${emissao()} (Portal Interno Danmo)`],
    [],
    CABECALHOS
  ];
  const aoa = [...topo, ...linhas];
  const ws = XLSXS.utils.aoa_to_sheet(aoa);
  const nCol = CABECALHOS.length;
  const nLin = aoa.length;
  const larguras = [10, 30, 20, 14, 11, 12, 18, 14, 14, 12, 18, 10, 14, 12, 12, 16, 12, 12, 12, 12, 24];
  ws["!cols"] = larguras.map((wch) => ({ wch }));
  ws["!merges"] = [0, 1, 2, 3].map((l) => ({
    s: { r: l, c: 0 },
    e: { r: l, c: nCol - 1 }
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
        cel.s = {
          font: { name: "Calibri", sz: 10, color: { rgb: "1A1A1A" } },
          fill: { patternType: "solid", fgColor: { rgb: r % 2 === 0 ? "F4F9F6" : "FFFFFF" } },
          alignment: { vertical: "center", horizontal: "left", wrapText: false },
          border: bordas
        };
      }
    }
  }

  XLSXS.utils.book_append_sheet(wb, ws, "Quadro de Pessoal");
  XLSXS.writeFile(wb, `Quadro_de_Pessoal_${dataHojeISO()}.xlsx`);
}
