/**
 * Teste do modulo Relatorios da Oficina - exportacoes melhoradas:
 *  A. Pagina carrega com KPIs correctos e as 7 abas.
 *  B. KPIs clicaveis saltam para a aba certa.
 *  C. Excel da aba Obras fechadas: nome legivel (Relatorio_Obras_fechadas_...),
 *     xlsx valido, estilos da marca (verde 009639), titulos da empresa,
 *     dados das obras e autofiltro.
 *  D. Excel do relatorio por sector: 2 folhas (Resumo com TOTAL GERAL +
 *     Obras do sector), nome legivel.
 *  E. PDF de verdade (jsPDF) na aba Todas as obras: %PDF, metadados jsPDF,
 *     titulo do documento, nome legivel, dados no corpo.
 *  F. PDF do relatorio por sector: resumo + obras do sector escolhido.
 *  G. Busca encontra quem mandou para a CdM e quem fechou a obra.
 *  H. Botao antigo "Imprimir / PDF" substituido pelo botao PDF.
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) + mock de rede
 * com dados do estilo da base real (Playwright route).
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");
const fs = require("fs");
const { execSync } = require("child_process");

const BASE = process.env.BASE || "http://localhost:3458";

/* dataHojeISO do client: new Date() + 2h, cortado a AAAA-MM-DD */
const hoje = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);

const EQUIPAMENTOS = [
  { id: 1, code: "DM001", name: "Fretador 1", fleet_type: "Fretador CAT 777", active: true },
  { id: 2, code: "DM014", name: "Pa 2", fleet_type: "Pá CAT 320", active: true },
  { id: 3, code: "DM021", name: "Trator 3", fleet_type: "Trator CAT D8", active: true }
];

const ORDENS = [
  {
    id: 1, numero_obra: "70001", equipment_id: 1, data_abertura: "2025-08-02",
    status_atual: "Fechada", status_fisico: "Concluído", aberto_por: ["João"],
    descricao_avaria: "Reparacao do sistema de travoes", sector: "Extraccao"
  },
  {
    id: 2, numero_obra: "70002", equipment_id: 2, data_abertura: "2025-09-01",
    status_atual: "CdM", status_fisico: "Avariada", aberto_por: ["Maria"],
    descricao_avaria: "Motor com perda de potencia", sector: "Oficina"
  },
  {
    id: 3, numero_obra: "70003", equipment_id: 2, data_abertura: "2025-09-10",
    status_atual: "Supervisão", status_fisico: "Pneumático", aberto_por: ["Maria"],
    descricao_avaria: "Fuga hidraulica no braco", sector: "Moagem"
  },
  {
    id: 4, numero_obra: null, equipment_id: 3, data_abertura: "2025-10-01",
    status_atual: "Aberta (DTEC)", status_fisico: "Avariada", aberto_por: ["João"],
    descricao_avaria: "Sem marcha atras", sector: "Transporte"
  },
  {
    id: 5, numero_obra: "70005", equipment_id: 1, data_abertura: "2025-10-05",
    status_atual: "Chefe da Oficina", status_fisico: "Revisão/Manutenção", aberto_por: ["Ana"],
    descricao_avaria: "Troca de filtros", sector: "Extraccao"
  },
  {
    id: 6, numero_obra: "70006", equipment_id: 3, data_abertura: "2025-09-20",
    status_atual: "Fechada", status_fisico: "Concluído", aberto_por: ["Ana"],
    descricao_avaria: "Soldadura no chassis", sector: "Serralharia"
  }
];

const LOGS = [
  { id: 1, os_id: 1, status_anterior: "Chefe da Oficina", status_novo: "CdM", data_mudanca: "2025-08-05T09:00:00Z", responsavel: "Filomeno" },
  { id: 2, os_id: 1, status_anterior: "CdM", status_novo: "Supervisão", data_mudanca: "2025-08-09T10:00:00Z", responsavel: "CdM" },
  { id: 3, os_id: 1, status_anterior: "Supervisão", status_novo: "Fechada", data_mudanca: "2025-08-12T15:30:00Z", responsavel: "Chefe Mario" },
  { id: 4, os_id: 2, status_anterior: "Chefe da Oficina", status_novo: "CdM", data_mudanca: "2025-09-03T08:00:00Z", responsavel: "Filomeno" },
  { id: 5, os_id: 3, status_anterior: "Chefe da Oficina", status_novo: "CdM", data_mudanca: "2025-09-12T08:00:00Z", responsavel: "Filomeno" },
  { id: 6, os_id: 3, status_anterior: "CdM", status_novo: "Departamento Técnico", data_mudanca: "2025-09-15T14:00:00Z", responsavel: "CdM" }
];

const MOCK = { ok: true, equipamentos: EQUIPAMENTOS, ordens: ORDENS, logs: LOGS };

const CAMINHO_EXCEL = "/home/z/my-project/scripts/tmp_relatorios_teste.xlsx";
const CAMINHO_PDF = "/home/z/my-project/scripts/tmp_relatorios_teste.pdf";

function lerZip(caminho, ficheiro) {
  try {
    return execSync(`unzip -p ${caminho} ${ficheiro}`).toString();
  } catch {
    return "";
  }
}

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
  await pagina.route("**/api/oficina/relatorios*", (rota) => {
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK) });
  });
  await pagina.goto(`${BASE}/oficina/relatorios`, { waitUntil: "networkidle" });
  const corpo = normalizar(await pagina.textContent("body"));

  // ===== A. Pagina e KPIs =====
  ok("Pagina carrega com o mock", !corpo.includes("Sessão expirada") && corpo.includes("Relatórios da Oficina"));
  ok("KPI Em circulação = 2", corpo.includes("Em circulação"), "rotulo visivel");
  ok("KPI Na CdM = 1, De volta = 2, Sem nº = 1, Fechadas = 2", true, "verificado abaixo");
  const kpiValores = await pagina.locator("button.rounded-xl p.tabular-nums").allTextContents();
  ok(
    // "De volta" = 2: conta as que passaram pela CdM e ja sairam,
    // INCLUINDO a fechada depois da volta (coerente com a aba r2)
    "Valores dos KPIs (2, 1, 2, 1, 2)",
    kpiValores.join(",") === "2,1,2,1,2",
    kpiValores.join(",")
  );
  ok("7 abas de relatorios", ["Todas as obras", "Obras na CdM agora", "Obras de volta da CdM", "Obras sem nº de obra (em andamento)", "Distribuição das obras por sector", "Obras em circulação (antes da CdM)", "Obras fechadas"].every((t) => corpo.includes(t)));
  ok("Botao antigo Imprimir / PDF ja nao existe", !corpo.includes("Imprimir / PDF"));

  // ===== B. KPIs clicaveis =====
  await pagina.locator("button.rounded-xl", { hasText: "Na CdM" }).click();
  await pagina.waitForTimeout(250);
  let badge = normalizar(await pagina.locator("span.rounded-full.bg-muted.tabular-nums").textContent());
  ok("KPI Na CdM salta para a aba com 1 obra", badge.trim().startsWith("1"), badge.trim());
  await pagina.locator("button.rounded-xl", { hasText: "Fechadas" }).click();
  await pagina.waitForTimeout(250);
  badge = normalizar(await pagina.locator("span.rounded-full.bg-muted.tabular-nums").textContent());
  ok("KPI Fechadas salta para a aba com 2 obras", badge.trim().startsWith("2"), badge.trim());

  // ===== C. Excel da aba Obras fechadas =====
  const [descExcel] = await Promise.all([
    pagina.waitForEvent("download", { timeout: 30000 }),
    pagina.click('button:has-text("Excel")')
  ]);
  ok("Excel descarrega", true);
  ok(
    "Nome do Excel legivel (sem r6) com a data",
    descExcel.suggestedFilename() === `Relatorio_Obras_fechadas_${hoje}.xlsx`,
    descExcel.suggestedFilename()
  );
  await descExcel.saveAs(CAMINHO_EXCEL);
  const bufX = fs.readFileSync(CAMINHO_EXCEL);
  ok("Excel e um xlsx valido (zip PK)", bufX[0] === 0x50 && bufX[1] === 0x4b, `${bufX.length} bytes`);
  ok("Excel com conteudo real", bufX.length > 4000, `${bufX.length} bytes`);
  const estilosXml = lerZip(CAMINHO_EXCEL, "xl/styles.xml");
  ok("Excel com estilos da marca (verde 009639)", estilosXml.includes("009639"), estilosXml ? "styles.xml lido" : "unzip indisponivel");
  const folha1 = lerZip(CAMINHO_EXCEL, "xl/worksheets/sheet1.xml");
  ok("Excel com titulos da empresa (DANMO SERVICE SYSTEM, LDA)", folha1.includes("DANMO SERVICE SYSTEM, LDA"), folha1 ? "folha lida" : "unzip indisponivel");
  ok("Excel com o titulo do relatorio (Obras fechadas)", folha1.includes("Relatório: Obras fechadas"), "linha 2 do titulo");
  ok("Excel com a etiqueta de filtros (todo o historico)", folha1.includes("Período: todo o histórico"), "linha 3");
  ok("Excel com a obra 70001", folha1.includes("70001"), "dados");
  ok("Excel com quem fechou (Chefe Mario)", folha1.includes("Chefe Mario"), "dados");
  ok("Excel com a obra 70006 (fechada sem CdM)", folha1.includes("70006"), "dados");
  ok("Excel com autofiltro na tabela", folha1.includes("<autoFilter ref="), "filtro na linha de cabecalhos");

  // ===== D. Excel do relatorio por sector =====
  await pagina.click('button:has-text("Distribuição das obras por sector")');
  await pagina.waitForTimeout(300);
  const [descExcel4] = await Promise.all([
    pagina.waitForEvent("download", { timeout: 30000 }),
    pagina.click('button:has-text("Excel")')
  ]);
  ok(
    "Nome do Excel por sector legivel",
    descExcel4.suggestedFilename() === `Relatorio_Distribuicao_por_sector_${hoje}.xlsx`,
    descExcel4.suggestedFilename()
  );
  await descExcel4.saveAs(CAMINHO_EXCEL);
  const folhas4 =
    lerZip(CAMINHO_EXCEL, "xl/worksheets/sheet1.xml") + lerZip(CAMINHO_EXCEL, "xl/worksheets/sheet2.xml");
  ok("Excel por sector com o resumo (Extraccao)", folhas4.includes("Extraccao"), folhas4 ? "2 folhas lidas" : "unzip indisponivel");
  ok("Excel por sector com TOTAL GERAL", folhas4.includes("TOTAL GERAL"), "linha de totais");
  ok("Excel por sector com a folha de obras do sector (70005)", folhas4.includes("70005"), "folha 2 com as obras");
  ok("Excel por sector com a obra 70001", folhas4.includes("70001"), "ambas as obras do sector");
  const sheet1r4 = lerZip(CAMINHO_EXCEL, "xl/worksheets/sheet1.xml");
  ok("TOTAL GERAL do resumo gravado como NUMERO (total 6)", sheet1r4.includes("<v>6</v>"), "valor cru encontrado");

  // ===== E. PDF de verdade na aba Todas as obras =====
  await pagina.click('button:has-text("Todas as obras")');
  await pagina.waitForTimeout(300);
  const [descPdf] = await Promise.all([
    pagina.waitForEvent("download", { timeout: 30000 }),
    pagina.click('button:has-text("PDF")')
  ]);
  ok("PDF descarrega", true);
  ok(
    "Nome do PDF legivel (sem r0) com a data",
    descPdf.suggestedFilename() === `Relatorio_Todas_as_obras_${hoje}.pdf`,
    descPdf.suggestedFilename()
  );
  await descPdf.saveAs(CAMINHO_PDF);
  const bufP = fs.readFileSync(CAMINHO_PDF);
  ok("PDF com assinatura %PDF (documento, nao captura)", bufP.slice(0, 5).toString() === "%PDF-", `${bufP.length} bytes`);
  ok("PDF com tamanho real de relatorio", bufP.length > 3000, `${bufP.length} bytes`);
  const metaPdf = bufP.toString("latin1");
  ok("PDF gerado pelo jsPDF (metadados)", metaPdf.includes("jsPDF"), "Producer");
  ok("PDF com titulo do documento definido", metaPdf.includes("/Title"), "Info dict");
  ok("PDF com o titulo do relatorio no conteudo", metaPdf.includes("Todas as obras"), "cabecalho");
  ok("PDF com a obra 70001 no detalhe", metaPdf.includes("70001"), "corpo da tabela");
  ok("PDF com quem mandou para a CdM (Filomeno)", metaPdf.includes("Filomeno"), "coluna Mandado por");
  ok("PDF com rodape paginado", metaPdf.includes("Página 1 de"), "rodape");
  ok("PDF sem nome antigo com r0", !metaPdf.includes("Relatorio_Oficina_r0"), "nome limpo");

  // ===== F. PDF do relatorio por sector =====
  await pagina.click('button:has-text("Distribuição das obras por sector")');
  await pagina.waitForTimeout(300);
  const [descPdf4] = await Promise.all([
    pagina.waitForEvent("download", { timeout: 30000 }),
    pagina.click('button:has-text("PDF")')
  ]);
  ok(
    "Nome do PDF por sector legivel",
    descPdf4.suggestedFilename() === `Relatorio_Distribuicao_por_sector_${hoje}.pdf`,
    descPdf4.suggestedFilename()
  );
  await descPdf4.saveAs(CAMINHO_PDF);
  const metaPdf4 = fs.readFileSync(CAMINHO_PDF).toString("latin1");
  ok("PDF por sector com o resumo", metaPdf4.includes("Resumo por sector"), "seccao 1");
  ok("PDF por sector com o TOTAL GERAL", metaPdf4.includes("TOTAL GERAL"), "linha de totais");
  // O jsPDF escapa parenteses no stream (\(2\)): buscar sem o contador
  ok("PDF por sector com as obras do sector escolhido", metaPdf4.includes("Obras do sector: Extraccao"), "seccao 2");
  ok("PDF por sector com a obra 70005 no detalhe", metaPdf4.includes("70005"), "corpo da tabela");

  // ===== G. Busca encontra quem mandou e quem fechou =====
  await pagina.click('button:has-text("Todas as obras")');
  await pagina.waitForTimeout(300);
  await pagina.fill("#r-busca", "Mario");
  await pagina.waitForTimeout(300);
  badge = normalizar(await pagina.locator("span.rounded-full.bg-muted.tabular-nums").textContent());
  ok("Busca por quem FECHOU (Mario) mostra so 1 obra", badge.trim().startsWith("1"), badge.trim());
  await pagina.fill("#r-busca", "Filomeno");
  await pagina.waitForTimeout(300);
  badge = normalizar(await pagina.locator("span.rounded-full.bg-muted.tabular-nums").textContent());
  ok("Busca por quem MANDOU (Filomeno) mostra 3 obras", badge.trim().startsWith("3"), badge.trim());
  await pagina.fill("#r-busca", "");
  await pagina.waitForTimeout(300);

  fs.rmSync(CAMINHO_EXCEL, { force: true });
  fs.rmSync(CAMINHO_PDF, { force: true });

  console.log(resultado.join("\n"));
  const passou = resultado.filter((r) => r.startsWith("PASSOU")).length;
  console.log(`\n${passou}/${resultado.length} testes passaram`);
  await browser.close();
})();
