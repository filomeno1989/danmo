/**
 * Testes das exportações e correcções de Equipamentos + ficha da Máquina
 * (varredura Checklists + Equipamentos, pedido do Filomeno).
 *
 *  A. Lista de equipamentos: busca passa a achar nome e modelo (sem acentos)
 *  B. Excel da lista: padrão da marca (títulos, verde, autofiltro, dados)
 *  C. PDF da lista: documento jsPDF de verdade
 *  D. Ficha da máquina: KPI "Dias desde a última obra" conta desde a MAIS
 *     RECENTE (bug: contava desde a primeira obra) e "-" sem obras
 *  E. Excel do histórico: 5 folhas (Resumo, Ordens, Intervenções, Peças, Técnicos)
 *  F. PDF do histórico: documento com o histórico completo
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) + mocks de rede
 * com dados do estilo da base real (Playwright route).
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");
const fs = require("fs");
const { execSync } = require("child_process");

const BASE = process.env.BASE || "http://localhost:3458";
const CAMINHO_EXCEL = "/home/z/my-project/scripts/tmp_equip_teste.xlsx";
const CAMINHO_PDF = "/home/z/my-project/scripts/tmp_equip_teste.pdf";
const CAMINHO_EXCEL_HIST = "/home/z/my-project/scripts/tmp_historico_teste.xlsx";
const CAMINHO_PDF_HIST = "/home/z/my-project/scripts/tmp_historico_teste.pdf";

function lerZip(caminho, ficheiro) {
  try {
    return execSync(`unzip -p ${caminho} ${ficheiro}`).toString();
  } catch {
    return "";
  }
}

function hojeISO() {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

const HOJE = hojeISO();
// Abertura a 15 dias de hoje (para o KPI dar exactamente 15)
const ABERTURA15 = new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10);

const EQUIPAMENTOS = [
  { id: 1, code: "45-30", name: "Escavadora Komatsu", fleet_type: "Escavadora", group_name: "Frota Pesada", model: "PC200-8", year_acquired: 2019, year_decommissioned: null, active: true },
  { id: 2, code: "12-01", name: "Empilhador Toyota", fleet_type: "Forklift", group_name: "Frota Leve", model: "8FD25", year_acquired: 2021, year_decommissioned: null, active: true },
  { id: 3, code: "77-10", name: "Pá Hidráulica", fleet_type: "Escavadora", group_name: "Frota Pesada", model: "SK210", year_acquired: 2015, year_decommissioned: 2024, active: false },
  { id: 4, code: "90-02", name: "Camioneta Nissan", fleet_type: "Camião", group_name: null, model: "NP300", year_acquired: 2020, year_decommissioned: null, active: true }
];
const CATEGORIAS = [
  { id: 1, nome: "Escavadora", ativo: true },
  { id: 2, nome: "Forklift", ativo: true },
  { id: 3, nome: "Camião", ativo: true }
];
const GRUPOS = [
  { id: 1, nome: "Frota Pesada", categoria_id: 1, ativo: true },
  { id: 2, nome: "Frota Leve", categoria_id: 2, ativo: true }
];
const MOCK_EQUIP = { ok: true, equipamentos: EQUIPAMENTOS, categorias: CATEGORIAS, grupos: GRUPOS };

const COLABORADORES = [{ id: 5, name: "Carlos", code: "21", setor: "Mecânica" }];

const MAQUINA_1 = {
  ok: true,
  equip: EQUIPAMENTOS[0],
  ordens: [
    { id: 11, numero_obra: "70011", equipment_id: 1, data_abertura: ABERTURA15, data_fecho: null, status_atual: "Aberta (DTEC)", status_fisico: "Avariada", sector: "Mecânica", descricao_avaria: "Motor a fumigar" },
    { id: 12, numero_obra: "70012", equipment_id: 1, data_abertura: "2024-01-10", data_fecho: "2024-01-20", status_atual: "Fechada", status_fisico: "Concluído", sector: "Elétrica", descricao_avaria: "Alternador queimado" }
  ],
  intervencoes: [
    { id: 21, os_id: 11, equipment_id: 1, shift_date: ABERTURA15, hours: 6, description: "Troca de injectores", tecnicos: [{ id: 5, name: "Carlos", code: "21" }] },
    { id: 22, os_id: 11, equipment_id: 1, shift_date: ABERTURA15, hours: 9.5, description: "Ajuste final e testes", tecnicos: [{ id: 5, name: "Carlos", code: "21" }] }
  ],
  pecas: [
    { id: 31, os_id: 11, peca: "Filtro de óleo", quantidade: 2, data: ABERTURA15 },
    { id: 32, os_id: 11, peca: "Filtro de óleo", quantidade: 1, data: ABERTURA15 }
  ],
  colaboradores: COLABORADORES
};

const MAQUINA_SEM_OBRAS = {
  ok: true,
  equip: { id: 9, code: "00-00", name: "Máquina nova", fleet_type: "Forklift", group_name: null, model: null, year_acquired: 2026, year_decommissioned: null, active: true },
  ordens: [],
  intervencoes: [],
  pecas: [],
  colaboradores: []
};

(async () => {
  const browser = await chromium.launch();
  const resultado = [];
  const ok = (nome, cond, detalhe = "") => {
    resultado.push(`${cond ? "PASSOU" : "FALHOU"} - ${nome}${detalhe ? ` (${detalhe})` : ""}`);
    if (!cond) process.exitCode = 1;
  };

  const contexto = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  // ===== A. Lista de equipamentos + busca por nome/modelo =====
  const pagina = await contexto.newPage();
  await pagina.route("**/api/oficina/equipamentos*", (rota) => {
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_EQUIP) });
  });
  await pagina.goto(`${BASE}/oficina/equipamentos`, { waitUntil: "networkidle" });
  let corpo = await pagina.textContent("body");
  ok("Equipamentos carrega com o mock", !corpo.includes("Sessão expirada") && corpo.includes("45-30") && corpo.includes("PC200-8"));

  async function contarComBusca(texto) {
    await pagina.fill("#eq-busca", texto);
    await pagina.waitForTimeout(250);
    return pagina.locator("table tbody tr").count();
  }
  const nBuscaCategoria = await contarComBusca("escav");
  ok("Busca \"escav\" acha 2 pela categoria", nBuscaCategoria === 2, String(nBuscaCategoria));
  const nBuscaNome = await contarComBusca("toyota");
  ok("Busca \"toyota\" acha 1 pelo nome", nBuscaNome === 1, String(nBuscaNome));
  const nBuscaModelo = await contarComBusca("8fd25");
  ok("Busca \"8fd25\" acha 1 pelo modelo (sem acentos)", nBuscaModelo === 1, String(nBuscaModelo));
  const nBuscaMaius = await contarComBusca("KOMATSU");
  ok("Busca \"KOMATSU\" acha 1 (ignora maiúsculas)", nBuscaMaius === 1, String(nBuscaMaius));
  await pagina.fill("#eq-busca", "");
  await pagina.waitForTimeout(200);

  // ===== B. Excel da lista =====
  const [descExcel] = await Promise.all([
    pagina.waitForEvent("download", { timeout: 30000 }),
    pagina.click('button:has-text("Excel")')
  ]);
  ok(
    "Nome do Excel legivel com a data",
    descExcel.suggestedFilename() === `Equipamentos_${HOJE}.xlsx`,
    descExcel.suggestedFilename()
  );
  await descExcel.saveAs(CAMINHO_EXCEL);
  const bufX = fs.readFileSync(CAMINHO_EXCEL);
  ok("Excel e um xlsx valido (zip PK)", bufX[0] === 0x50 && bufX[1] === 0x4b, `${bufX.length} bytes`);
  ok("Excel com conteudo real", bufX.length > 4000, `${bufX.length} bytes`);
  const estilosXml = lerZip(CAMINHO_EXCEL, "xl/styles.xml");
  ok("Excel com estilos da marca (verde 009639)", estilosXml.includes("009639"), "styles.xml");
  const folha1 = lerZip(CAMINHO_EXCEL, "xl/worksheets/sheet1.xml");
  ok("Excel com titulos da empresa (DANMO SERVICE SYSTEM, LDA)", folha1.includes("DANMO SERVICE SYSTEM, LDA"), "folha 1");
  ok("Excel com a etiqueta de filtros (todas as categorias)", folha1.includes("Categoria: todas"), "linha 3");
  ok("Excel com o equipamento 45-30", folha1.includes("45-30"), "dados");
  ok("Excel com o modelo PC200-8", folha1.includes("PC200-8"), "dados");
  ok("Excel com autofiltro na tabela", folha1.includes("<autoFilter ref="), "filtro");
  ok("Excel com coluna Estado (Activo)", folha1.includes("Activo"), "dados");

  // ===== C. PDF da lista =====
  const [descPdf] = await Promise.all([
    pagina.waitForEvent("download", { timeout: 30000 }),
    pagina.click('button:has-text("PDF")')
  ]);
  ok(
    "Nome do PDF legivel com a data",
    descPdf.suggestedFilename() === `Equipamentos_${HOJE}.pdf`,
    descPdf.suggestedFilename()
  );
  await descPdf.saveAs(CAMINHO_PDF);
  const bufP = fs.readFileSync(CAMINHO_PDF);
  ok("PDF e um PDF valido (%PDF)", bufP.slice(0, 4).toString() === "%PDF", `${bufP.length} bytes`);
  ok("PDF com conteudo real", bufP.length > 4000, `${bufP.length} bytes`);
  const metaPdf = bufP.toString("latin1");
  ok("PDF com titulo nas propriedades (Lista de Equipamentos)", metaPdf.includes("Lista de Equipamentos"), "metadados");
  await pagina.close();

  // ===== D. Ficha da máquina: KPI corrigido =====
  const paginaM = await contexto.newPage();
  await paginaM.route("**/api/oficina/maquina/1*", (rota) => {
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MAQUINA_1) });
  });
  await paginaM.goto(`${BASE}/oficina/maquina/1`, { waitUntil: "networkidle" });
  const corpoM = await paginaM.textContent("body");
  ok("Maquina carrega com o mock", corpoM.includes("Máquina 45-30") && corpoM.includes("70011"));
  const kpiDias = await paginaM.locator("div.rounded-xl", { hasText: "Dias desde a última obra" }).textContent();
  ok("KPI Dias desde a ultima obra = 15 (obra mais recente)", (kpiDias || "").includes("15"), (kpiDias || "").trim());
  const kpiHoras = await paginaM.locator("div.rounded-xl", { hasText: "Horas Totais" }).textContent();
  ok("KPI Horas totais = 15.5h", (kpiHoras || "").includes("15.5"), (kpiHoras || "").trim());

  // ===== E. Excel do histórico (5 folhas) =====
  const [descHistX] = await Promise.all([
    paginaM.waitForEvent("download", { timeout: 30000 }),
    paginaM.click('button:has-text("Excel")')
  ]);
  ok(
    "Nome do Excel do historico legivel",
    descHistX.suggestedFilename() === `Historico_Maquina_45-30_${HOJE}.xlsx`,
    descHistX.suggestedFilename()
  );
  await descHistX.saveAs(CAMINHO_EXCEL_HIST);
  const bufHX = fs.readFileSync(CAMINHO_EXCEL_HIST);
  ok("Excel historico e um xlsx valido", bufHX[0] === 0x50 && bufHX[1] === 0x4b, `${bufHX.length} bytes`);
  const folhasHist = [1, 2, 3, 4, 5].map((n) => lerZip(CAMINHO_EXCEL_HIST, `xl/worksheets/sheet${n}.xml`));
  ok("Excel historico com 5 folhas", folhasHist.every((f) => f.length > 0), folhasHist.map((f, i) => `s${i + 1}:${f.length}`).join(" "));
  ok("Folha Resumo com titulos da empresa", folhasHist[0].includes("DANMO SERVICE SYSTEM, LDA"), "sheet1");
  ok("Resumo com o KPI Horas totais", folhasHist[0].includes("Horas totais"), "sheet1");
  ok("Folha Ordens com a obra 70011", folhasHist[1].includes("70011"), "sheet2");
  ok("Ordens com o diagnostico (Motor a fumigar)", folhasHist[1].includes("Motor a fumigar"), "sheet2");
  ok("Folha Intervencoes com o tecnico Carlos", folhasHist[2].includes("Carlos"), "sheet3");
  ok("Intervencoes com horas gravadas (6 e 9.5)", folhasHist[2].includes("6") && folhasHist[2].includes("9.5"), "sheet3");
  ok("Folha Pecas com o Filtro de óleo", folhasHist[3].includes("Filtro de óleo"), "sheet4");
  ok("Folha Tecnicos com a soma de horas (15.5)", folhasHist[4].includes("15.5"), "sheet5");

  // ===== F. PDF do histórico =====
  const [descHistP] = await Promise.all([
    paginaM.waitForEvent("download", { timeout: 30000 }),
    paginaM.click('button:has-text("PDF")')
  ]);
  ok(
    "Nome do PDF do historico legivel",
    descHistP.suggestedFilename() === `Historico_Maquina_45-30_${HOJE}.pdf`,
    descHistP.suggestedFilename()
  );
  await descHistP.saveAs(CAMINHO_PDF_HIST);
  const bufHP = fs.readFileSync(CAMINHO_PDF_HIST);
  ok("PDF historico e um PDF valido (%PDF)", bufHP.slice(0, 4).toString() === "%PDF", `${bufHP.length} bytes`);
  ok("PDF historico com conteudo real", bufHP.length > 4000, `${bufHP.length} bytes`);
  const metaHist = bufHP.toString("latin1");
  ok("PDF historico com titulo nas propriedades", metaHist.includes("Histórico da Máquina 45-30"), "metadados");
  await paginaM.close();

  // ===== G. Máquina sem obras: KPI mostra "-" =====
  const paginaV = await contexto.newPage();
  await paginaV.route("**/api/oficina/maquina/9*", (rota) => {
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MAQUINA_SEM_OBRAS) });
  });
  await paginaV.goto(`${BASE}/oficina/maquina/9`, { waitUntil: "networkidle" });
  const kpiVazio = await paginaV.locator("div.rounded-xl", { hasText: "Dias desde a última obra" }).textContent();
  ok("Maquina sem obras: KPI mostra - (nao 0)", (kpiVazio || "").includes("-"), (kpiVazio || "").trim());
  await paginaV.close();

  fs.rmSync(CAMINHO_EXCEL, { force: true });
  fs.rmSync(CAMINHO_PDF, { force: true });
  fs.rmSync(CAMINHO_EXCEL_HIST, { force: true });
  fs.rmSync(CAMINHO_PDF_HIST, { force: true });

  await browser.close();
  console.log(resultado.join("\n"));
  console.log(process.exitCode ? `\nRESULTADO: FALHOU` : "\nRESULTADO: TUDO OK");
  process.exit(process.exitCode || 0);
})();
