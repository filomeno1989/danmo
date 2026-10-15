/**
 * Teste da Faturacao CdM - exportacoes de relatorio + grafico mensal:
 *  A. Grafico "Faturacao mensal" no fim do modulo: 3 barras (mock com 3 meses),
 *     ordem cronologica antigo -> recente, altura proporcional ao total,
 *     valores compactos visiveis e total do periodo no cartao.
 *  B. Excel: download dispara, nome novo sem CdM, ficheiro e um xlsx (zip)
 *     valido, estilos da marca (verde 009639), titulo "Obras fechadas entregues
 *     a facturação" e coluna Diagnóstico na folha Detalhe.
 *  C. PDF: download dispara, nome novo sem CdM, assinatura %PDF, tamanho real
 *     (documento gerado pelo jsPDF, nao captura de ecra), titulo do documento
 *     e texto "Obras fechadas entregues" no conteudo.
 *  D. Filtro mensal: o grafico acompanha o filtro (so a barra do mes escolhido).
 *  E. Diagnostico: visivel no detalhe da obra na pagina (com e sem texto).
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) + mock de rede
 * com dados do estilo da base real (Playwright route).
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://localhost:3458";

const LINHAS = [
  {
    id: 1,
    numero_obra: "70001",
    equip_code: "DM001",
    sector: "Extraccao",
    data_abertura: "2025-02-03",
    data_fecho: "2025-02-10",
    dias_ate_fecho: 7,
    dias_apos_trabalho: 2,
    horas_cdm: 8,
    horas_nossas: 7.5,
    diferenca_horas: 0.5,
    valor_hora: 1500,
    total_mao_obra: 12000,
    total_material: 3500,
    total_geral: 15500,
    materiais: [
      { id: 11, material: "Oxigênio", quantidade: 2, valor_unitario: 1250, total: 2500 },
      { id: 12, material: "Gas Propano", quantidade: 10, valor_unitario: 100, total: 1000 }
    ],
    diagnostico: "Falha no sistema de marcha, ruido no motor",
    responsavel: "Filomeno",
    observacao: null
  },
  {
    id: 2,
    numero_obra: "70002",
    equip_code: "DM014",
    sector: "Oficina",
    data_abertura: "2025-02-12",
    data_fecho: "2025-02-20",
    dias_ate_fecho: 8,
    dias_apos_trabalho: 1,
    horas_cdm: 10,
    horas_nossas: 10,
    diferenca_horas: 0,
    valor_hora: 1600,
    total_mao_obra: 16000,
    total_material: 4800,
    total_geral: 20800,
    materiais: [{ id: 21, material: "Gas Acetileno", quantidade: 4, valor_unitario: 1200, total: 4800 }],
    responsavel: "Filomeno",
    observacao: "Substituicao de cilindro"
  },
  {
    id: 3,
    numero_obra: "70003",
    equip_code: "DM007",
    sector: "Moagem",
    data_abertura: "2025-03-01",
    data_fecho: "2025-03-05",
    dias_ate_fecho: 4,
    dias_apos_trabalho: 0,
    horas_cdm: 14,
    horas_nossas: 13,
    diferenca_horas: 1,
    valor_hora: 2000,
    total_mao_obra: 28000,
    total_material: 5600,
    total_geral: 33600,
    materiais: [],
    responsavel: "Equipa B",
    observacao: null
  },
  {
    id: 4,
    numero_obra: "70004",
    equip_code: "DM021",
    sector: "Transporte",
    data_abertura: "2025-04-02",
    data_fecho: "2025-04-12",
    dias_ate_fecho: 10,
    dias_apos_trabalho: 3,
    horas_cdm: 39,
    horas_nossas: 36,
    diferenca_horas: 3,
    valor_hora: 2000,
    total_mao_obra: 78000,
    total_material: 12000,
    total_geral: 90000,
    materiais: [{ id: 41, material: "Oxigênio", quantidade: 6, valor_unitario: 2000, total: 12000 }],
    diagnostico: "Reparacao completa do sistema hidraulico, fugas na bomba",
    responsavel: "Filomeno",
    observacao: "Reparacao completa"
  }
];

const MOCK = {
  ok: true,
  linhas: LINHAS,
  porMes: [],
  totais: { obras: 4, horas_cdm: 0, horas_nossas: 0, total_mao_obra: 0, total_material: 0, total_geral: 0 }
};

const CAMINHO_EXCEL = "/home/z/my-project/scripts/tmp_faturacao_teste.xlsx";
const CAMINHO_PDF = "/home/z/my-project/scripts/tmp_faturacao_teste.pdf";

(async () => {
  const browser = await chromium.launch();
  const resultado = [];
  const ok = (nome, cond, detalhe = "") => {
    resultado.push(`${cond ? "PASSOU" : "FALHOU"} - ${nome}${detalhe ? ` (${detalhe})` : ""}`);
    if (!cond) process.exitCode = 1;
  };

  const contexto = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  const pagina = await contexto.newPage();
  const normalizar = (t) => t.replace(/[\u00A0\u202F]/g, " ");
  await pagina.route("**/api/oficina/faturacao*", (rota) => {
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK) });
  });
  await pagina.route("**/api/oficina/precos*", (rota) => {
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, precos: [] }) });
  });
  await pagina.goto(`${BASE}/oficina/faturacao`, { waitUntil: "networkidle" });
  const corpo = normalizar(await pagina.textContent("body"));

  // ===== A. Pagina e valores =====
  ok("Pagina carrega com o mock", !corpo.includes("Sessão expirada") && corpo.includes("Faturação CdM"));
  ok("Total geral do periodo no KPI (159 900,00 MT)", corpo.includes("159 900,00 MT"));
  ok("Resumo por mes com 3 meses", corpo.includes("Fev 2025") && corpo.includes("Mar 2025") && corpo.includes("Abr 2025"));

  // ===== B. Grafico mensal =====
  ok("Cartao Faturação mensal no fim do modulo", corpo.includes("Faturação mensal") && corpo.includes("Total do período"));
  const barraFev = pagina.locator('div[title^="Fev 2025"]');
  const barraMar = pagina.locator('div[title^="Mar 2025"]');
  const barraAbr = pagina.locator('div[title^="Abr 2025"]');
  ok(
    "Grafico com 3 barras (uma por mes)",
    (await barraFev.count()) === 1 && (await barraMar.count()) === 1 && (await barraAbr.count()) === 1,
    `fev=${await barraFev.count()} mar=${await barraMar.count()} abr=${await barraAbr.count()}`
  );
  const xFev = (await barraFev.boundingBox()).x;
  const xMar = (await barraMar.boundingBox()).x;
  const xAbr = (await barraAbr.boundingBox()).x;
  ok("Ordem cronologica (mes antigo a esquerda)", xFev < xMar && xMar < xAbr, `${xFev.toFixed(0)} < ${xMar.toFixed(0)} < ${xAbr.toFixed(0)}`);
  const hFev = (await barraFev.locator("div.rounded-t").boundingBox()).height;
  const hAbr = (await barraAbr.locator("div.rounded-t").boundingBox()).height;
  ok("Barra de Abr maior que a de Fev (proporcional aos totais)", hAbr > hFev * 2, `hFev=${hFev.toFixed(0)}px hAbr=${hAbr.toFixed(0)}px`);
  const valorAbr = (await barraAbr.locator("span").first().textContent()).trim();
  ok("Valor compacto visivel na barra de Abr (90 mil)", /^90/.test(valorAbr), valorAbr);
  const eixo = await pagina.locator("div.w-14 span.leading-none").allTextContents();
  ok("Eixo Y com 5 niveis", eixo.length === 5, eixo.join(" | "));

  // ===== C. Excel formatado =====
  const [descExcel] = await Promise.all([
    pagina.waitForEvent("download", { timeout: 30000 }),
    pagina.click('button:has-text("Excel")')
  ]);
  ok("Excel descarrega", true);
  ok(
    "Nome do Excel novo (sem CdM) com o periodo",
    descExcel.suggestedFilename() === "Obras_Fechadas_Facturacao_todo_o_periodo.xlsx",
    descExcel.suggestedFilename()
  );
  await descExcel.saveAs(CAMINHO_EXCEL);
  const bufX = fs.readFileSync(CAMINHO_EXCEL);
  ok("Excel e um xlsx valido (zip PK)", bufX[0] === 0x50 && bufX[1] === 0x4b, `${bufX.length} bytes`);
  ok("Excel com conteudo real", bufX.length > 4000, `${bufX.length} bytes`);
  let estilosXml = "";
  try {
    estilosXml = require("child_process").execSync(`unzip -p ${CAMINHO_EXCEL} xl/styles.xml`).toString();
  } catch {
    // unzip indisponivel no ambiente
  }
  ok("Excel com estilos da marca (verde 009639)", estilosXml.includes("009639"), estilosXml ? "styles.xml lido" : "unzip indisponivel");
  ok("Excel com formatos de numero MT", estilosXml.includes("#,##0.00") || estilosXml.includes("numFmtId"), estilosXml ? "styles.xml lido" : "unzip indisponivel");
  // O xlsx-js-style grava as strings inline nas folhas (nao ha sharedStrings.xml)
  let folhas = "";
  for (const f of ["xl/worksheets/sheet1.xml", "xl/worksheets/sheet2.xml"]) {
    try {
      folhas += require("child_process").execSync(`unzip -p ${CAMINHO_EXCEL} ${f}`).toString();
    } catch {
      // unzip indisponivel no ambiente
    }
  }
  ok("Excel com titulo novo (Obras fechadas entregues a facturação)", folhas.includes("Obras fechadas entregues à facturação"), folhas ? "folhas lidas" : "unzip indisponivel");
  ok("Excel com coluna Diagnóstico", folhas.includes("Diagnóstico"), folhas ? "folhas lidas" : "unzip indisponivel");
  ok("Excel com o diagnostico da obra no detalhe", folhas.includes("Falha no sistema de marcha"), folhas ? "folhas lidas" : "unzip indisponivel");
  ok("Excel sem a descricao antiga com CdM", !folhas.includes("Relatório de Faturação CdM"), folhas ? "folhas lidas" : "unzip indisponivel");
  let folha1 = "";
  try {
    folha1 = require("child_process").execSync(`unzip -p ${CAMINHO_EXCEL} xl/worksheets/sheet1.xml`).toString();
  } catch {
    // unzip indisponivel
  }
  ok("Total geral gravado como NUMERO (somavel no Excel)", folha1.includes("<v>159900</v>"), folha1 ? "valor cru encontrado" : "sem folha");

  // ===== D. PDF de verdade =====
  const [descPdf] = await Promise.all([
    pagina.waitForEvent("download", { timeout: 30000 }),
    pagina.click('button:has-text("PDF")')
  ]);
  ok("PDF descarrega", true);
  ok(
    "Nome do PDF novo (sem CdM) com o periodo",
    descPdf.suggestedFilename() === "Obras_Fechadas_Facturacao_todo_o_periodo.pdf",
    descPdf.suggestedFilename()
  );
  await descPdf.saveAs(CAMINHO_PDF);
  const bufP = fs.readFileSync(CAMINHO_PDF);
  ok("PDF com assinatura %PDF (documento, nao captura)", bufP.slice(0, 5).toString() === "%PDF-", `${bufP.length} bytes`);
  ok("PDF com tamanho real de relatorio", bufP.length > 3000, `${bufP.length} bytes`);
  const metaPdf = bufP.toString("latin1");
  ok("PDF gerado pelo jsPDF (metadados)", metaPdf.includes("jsPDF"), "Producer");
  ok("PDF com titulo do documento definido", metaPdf.includes("/Title"), "Info dict");
  ok("PDF com o titulo novo no conteudo", metaPdf.includes("Obras fechadas entregues"), "texto do cabecalho");
  ok("PDF com o diagnostico da obra no detalhe", metaPdf.includes("Falha no sistema de marcha"), "sub-linha do detalhe");
  ok("PDF sem a descricao antiga com CdM", !metaPdf.includes("Relatório de Faturação CdM"), "cabecalho limpo");

  // ===== E. Diagnostico no detalhe da pagina =====
  await pagina.locator('button[aria-label="Ver detalhes"]').first().click();
  await pagina.waitForTimeout(200);
  let corpo2 = normalizar(await pagina.textContent("body"));
  ok(
    "Detalhe da obra mostra o Diagnóstico",
    corpo2.includes("Diagnóstico / Avaria / Motivo de entrada") && corpo2.includes("Falha no sistema de marcha"),
    "linha 70001"
  );
  await pagina.locator('button[aria-label="Fechar detalhes"]').first().click();
  await pagina.waitForTimeout(200);
  await pagina.locator('button[aria-label="Ver detalhes"]').nth(2).click();
  await pagina.waitForTimeout(200);
  corpo2 = normalizar(await pagina.textContent("body"));
  ok(
    "Obra sem diagnóstico mostra mensagem",
    corpo2.includes("A obra não tem diagnóstico preenchido."),
    "linha 70003"
  );
  await pagina.locator('button[aria-label="Fechar detalhes"]').first().click();
  await pagina.waitForTimeout(200);

  // ===== F. Filtro mensal: grafico acompanha =====
  await pagina.locator("select").first().selectOption("2");
  await pagina.waitForTimeout(400);
  const fevDepois = await pagina.locator('div[title^="Fev 2025"]').count();
  const marDepois = await pagina.locator('div[title^="Mar 2025"]').count();
  ok("Filtro Fevereiro: grafico mostra so a barra de Fev", fevDepois === 1 && marDepois === 0, `fev=${fevDepois} mar=${marDepois}`);
  const corpo3 = normalizar(await pagina.textContent("body"));
  ok("Etiqueta do periodo acompanha o filtro", corpo3.includes("Fev (todos os anos)"));
  ok("KPI do periodo filtrado (36 300,00 MT)", corpo3.includes("36 300,00 MT"));

  fs.rmSync(CAMINHO_EXCEL, { force: true });
  fs.rmSync(CAMINHO_PDF, { force: true });

  console.log(resultado.join("\n"));
  const passou = resultado.filter((r) => r.startsWith("PASSOU")).length;
  console.log(`\n${passou}/${resultado.length} testes passaram`);
  await browser.close();
})();
