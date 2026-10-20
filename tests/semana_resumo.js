/**
 * Teste do Resumo Semanal alinhado com o ficheiro do Director:
 *
 * A. CARTOES do topo (Entradas, Saidas, Pendentes no fecho, Aguardam
 *    pecas, Disponibilidade global) com os totais certos;
 * B. TABELA: coluna Total de maquinas, Pend. fecho, Disp. formula
 *    ((total - pend. fecho - aguardam pecas) / total) ao lado da Disp.
 *    de horas reais, e linha TOTAL com somas;
 * C. GRAFICO: 12 barras por frota com a linha da meta;
 * D. AVARIAS (seccao 03): frotas com conteudo abertas por defeito,
 *    textos frequentes/complexas editaveis, expandir ao clique;
 * E. IMPORTAR BACKUP: carrega o JSON do Director (com nomes usando
 *    outros travessoes), salta para a semana certa e preenche frotas,
 *    avarias, dificuldades e melhorias;
 * F. GRAVAR: POST leva linhas + avarias; aviso da tabela em falta
 *    aparece na faixa de aviso.
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) + mock de rede.
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3458";

const FROTAS = [
  "Reach-Stacker 45T", "Tratores 70T", "Tratores 60T", "Forklifts 2,5-16T",
  "Forklifts 30-50T", "Plataformas SK", "Plataformas R-R", "Pás Mecânicas (WLD)",
  "Escavadoras", "Manuseadoras", "Basculantes", "Outros"
];

// movimento guardado (como na semana 42 do Director)
const GUARDADO = {
  "Reach-Stacker 45T": { pend_inicio: 7, entradas: 32, saidas: 33, aguardam_pecas: 7 },
  "Tratores 70T": { pend_inicio: 4, entradas: 25, saidas: 22, aguardam_pecas: 12 },
  "Tratores 60T": { pend_inicio: 2, entradas: 8, saidas: 6, aguardam_pecas: 4 },
  "Forklifts 2,5-16T": { pend_inicio: 3, entradas: 1, saidas: 3, aguardam_pecas: 7 },
  "Forklifts 30-50T": { pend_inicio: 0, entradas: 1, saidas: 1, aguardam_pecas: 7 },
  "Plataformas SK": { pend_inicio: 2, entradas: 2, saidas: 4, aguardam_pecas: 0 },
  "Plataformas R-R": { pend_inicio: 0, entradas: 4, saidas: 2, aguardam_pecas: 8 },
  "Pás Mecânicas (WLD)": { pend_inicio: 4, entradas: 7, saidas: 4, aguardam_pecas: 4 },
  "Escavadoras": { pend_inicio: 2, entradas: 2, saidas: 3, aguardam_pecas: 4 },
  "Manuseadoras": { pend_inicio: 0, entradas: 2, saidas: 1, aguardam_pecas: 2 },
  "Basculantes": { pend_inicio: 1, entradas: 2, saidas: 3, aguardam_pecas: 3 },
  "Outros": { pend_inicio: 0, entradas: 0, saidas: 0, aguardam_pecas: 1 }
};
const DISP = {
  "Reach-Stacker 45T": 72, "Tratores 70T": 65, "Tratores 60T": 81,
  "Forklifts 2,5-16T": 77, "Forklifts 30-50T": 58, "Plataformas SK": 84,
  "Plataformas R-R": 90, "Pás Mecânicas (WLD)": 69, "Escavadoras": 74,
  "Manuseadoras": 88, "Basculantes": 79, "Outros": 95
};
const TOTAL_FROTA = {
  "Reach-Stacker 45T": 31, "Tratores 70T": 38, "Tratores 60T": 13,
  "Forklifts 2,5-16T": 21, "Forklifts 30-50T": 9, "Plataformas SK": 32,
  "Plataformas R-R": 34, "Pás Mecânicas (WLD)": 13, "Escavadoras": 13,
  "Manuseadoras": 7, "Basculantes": 8, "Outros": 8
};

const SEMANA_GET = {
  ok: true,
  ano: 2026,
  semana: 42,
  intervalo: { de: "2026-10-12", ate: "2026-10-18" },
  meta: 80,
  frotas: FROTAS,
  osCalculado: {},
  guardado: GUARDADO,
  disponibilidade: DISP,
  disponibilidadeGlobal: 71,
  totalFrota: TOTAL_FROTA,
  avarias: {
    "Reach-Stacker 45T": {
      frequentes: "NORMAL:\nFalha no sistema de engate (45-28)\nVazamento de óleo hidráulico (45-21 / 45-30)",
      complexas: "NORMAL:\nSubstituição de \"Unhas\" de engate (45-28)"
    },
    "Pás Mecânicas (WLD)": {
      frequentes: "NORMAL\nSubstituição de cavilhas da lança (24-01)",
      complexas: ""
    }
  },
  geral: { dificuldades: "Falta de peças, diagnósticos por concluir (avarias complexas)", melhorias: [] }
};

const BACKUP = {
  fleets: [
    {
      name: "Forklifts 2,5–16T",
      total: 21, opening: "3", entries: "9", exits: "2", waiting: "5",
      frequentFailures: "NORMAL:\nReparação do alternador (05-05)"
    },
    {
      name: "Pás Mecânicas (WLD)",
      total: 13, opening: "4", entries: "7", exits: "4", waiting: "4",
      frequentFailures: "NORMAL\nSubstituição de cavilhas da lança (24-01)",
      complexFailures: "NORMAL:\nBaixa pressão do óleo da caixa de transmissão (17-06)"
    }
  ],
  actions: [{ descricao: "Melhorar o armazém de peças", responsavel: "Filomeno", prazo: "30/11" }],
  start: "2026-11-04",
  end: "2026-11-10",
  difficulties: "Sem peças no piquete da semana 45"
};

(async () => {
  const browser = await chromium.launch();
  const resultado = [];
  const ok = (nome, cond, detalhe = "") => {
    resultado.push(`${cond ? "PASSOU" : "FALHOU"} - ${nome}${detalhe ? ` (${detalhe})` : ""}`);
    if (!cond) process.exitCode = 1;
  };

  const contexto = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);
  const pagina = await contexto.newPage();

  let corpoPost = null;
  let respostasPost = 0;
  await pagina.route("**/api/disponibilidade/semana*", (rota) => {
    if (rota.request().method() === "POST") {
      corpoPost = rota.request().postDataJSON();
      respostasPost += 1;
      const aviso = respostasPost >= 2 ? "Semana gravada, mas as avarias não: falta a tabela disp_semana_avarias (colar o SQL fase4-semanal-avarias.sql no Supabase)." : undefined;
      rota.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, frotas: 12, melhorias: 1, avarias: 12, ...(aviso ? { aviso } : {}) })
      });
      return;
    }
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(SEMANA_GET) });
  });

  await pagina.goto(`${BASE}/disponibilidade/semana`, { waitUntil: "networkidle" });

  /* ============ A. CARTOES ============ */
  const somaEntradas = FROTAS.reduce((s, f) => s + GUARDADO[f].entradas, 0); // 86
  const somaSaidas = FROTAS.reduce((s, f) => s + GUARDADO[f].saidas, 0); // 82
  const somaFecho = FROTAS.reduce((s, f) => {
    const g = GUARDADO[f];
    return s + g.pend_inicio + g.entradas - g.saidas;
  }, 0); // 29
  const somaPecas = FROTAS.reduce((s, f) => s + GUARDADO[f].aguardam_pecas, 0); // 59

  const cartao = async (nome) => {
    const c = pagina.locator("div.card-sombra.p-4", { hasText: nome }).first();
    return (await c.locator("p").nth(1).textContent())?.trim();
  };
  ok("Cartao Entradas soma as frotas", (await cartao("Entradas")) === String(somaEntradas), await cartao("Entradas"));
  ok("Cartao Saidas soma as frotas", (await cartao("Saídas")) === String(somaSaidas), await cartao("Saídas"));
  ok("Cartao Pendentes no fecho", (await cartao("Pendentes no fecho")) === String(somaFecho), await cartao("Pendentes no fecho"));
  ok("Cartao Aguardam pecas", (await cartao("Aguardam peças")) === String(somaPecas), await cartao("Aguardam peças"));
  ok("Cartao Disponibilidade global 71%", (await cartao("Disponibilidade global")) === "71%", await cartao("Disponibilidade global"));

  /* ============ B. TABELA ============ */
  const linhaRst = pagina.locator("tbody tr", { hasText: "Reach-Stacker 45T" }).first();
  const celulas = linhaRst.locator("td");
  ok("Coluna Total de maquinas (31)", (await celulas.nth(1).textContent())?.trim() === "31", await celulas.nth(1).textContent());
  ok("Pend. fecho calculado (6)", (await celulas.nth(5).textContent())?.trim() === "6", await celulas.nth(5).textContent());
  const celFormula = await celulas.nth(7).textContent();
  ok("Disp. formula (31-6-7)/31 = 58%", celFormula?.trim() === "58%", celFormula);
  ok("Disp. horas em badge (72%)", (await celulas.nth(8).textContent())?.includes("72%"), await celulas.nth(8).textContent());

  const cabecalhos = await pagina.locator("thead th").allTextContents();
  ok("Cabecalho tem Total", cabecalhos.some((t) => t.trim() === "Total"), cabecalhos.join("|"));
  ok("Cabecalho tem Disp. formula", cabecalhos.some((t) => t.includes("Disp. fórmula")), cabecalhos.join("|"));
  ok("Cabecalho tem Disp. horas", cabecalhos.some((t) => t.includes("Disp. horas")), cabecalhos.join("|"));

  const linhaTotal = pagina.locator("tbody tr", { hasText: "TOTAL" }).first();
  const totalCel = await linhaTotal.locator("td").allTextContents();
  ok("Linha TOTAL com 227 maquinas", totalCel[1]?.trim() === "227", totalCel.join("|"));
  ok("Linha TOTAL com entradas 86", totalCel[3]?.trim() === String(somaEntradas), totalCel.join("|"));
  ok("Linha TOTAL com pend. fecho 29", totalCel[5]?.trim() === String(somaFecho), totalCel.join("|"));

  /* ============ C. GRAFICO ============ */
  const colunasGrafico = pagina.locator("div[title$='da semana (meta 80%)']");
  ok("Grafico com 12 barras por frota", (await colunasGrafico.count()) === 12, String(await colunasGrafico.count()));
  const barraVerde = pagina.locator("div[title='Reach-Stacker 45T: 72% da semana (meta 80%)'] div.bg-erro");
  ok("Barra abaixo da meta pinta de vermelho", (await barraVerde.count()) === 1);
  const barraVerdeOk = pagina.locator("div[title='Plataformas SK: 84% da semana (meta 80%)'] div.bg-sucesso");
  ok("Barra acima da meta pinta de verde", (await barraVerdeOk.count()) === 1);

  /* ============ D. AVARIAS ============ */
  const secaoAvarias = pagina.locator("div.card-sombra", { hasText: "03 · Avarias e serviços" }).first();
  ok("Secao 03 Avarias existe", (await secaoAvarias.count()) === 1);
  const textoFreq = secaoAvarias.locator("textarea").first();
  ok("Frota com conteudo abre com as avarias frequentes", (await textoFreq.inputValue()).includes("Falha no sistema de engate (45-28)"));
  const linhaOutros = secaoAvarias.locator("div.rounded-md.border", { hasText: "Outros" }).first();
  ok("Frota sem conteudo fica fechada", (await linhaOutros.locator("textarea").count()) === 0);
  await secaoAvarias.locator("button", { hasText: "Manuseadoras" }).first().click();
  const linhaMh = secaoAvarias.locator("div.rounded-md.border", { hasText: "Manuseadoras" }).first();
  ok("Expandir frota abre as 2 caixas", (await linhaMh.locator("textarea").count()) === 2);

  /* ============ E. IMPORTAR BACKUP ============ */
  await pagina.setInputFiles(
    "input[type='file']",
    { name: "backup.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(BACKUP)) }
  );
  await pagina.waitForTimeout(600);
  const cabecalhoSemana = await pagina.locator("[data-testid='semana-actual']").textContent();
  ok("Import salta para a semana do backup (45)", cabecalhoSemana?.includes("Semana 45") && cabecalhoSemana?.includes("2026"), cabecalhoSemana?.trim());
  const linhaFkl = pagina.locator("tbody tr", { hasText: "Forklifts 2,5-16T" }).first();
  const entradasFkl = await linhaFkl.locator("input").nth(1).inputValue();
  ok("Import preenche Entradas da frota com travessao diferente", entradasFkl === "9", entradasFkl);
  const dificuldadesImport = await pagina.locator("textarea").first().inputValue();
  ok("Import preenche as dificuldades", dificuldadesImport === "Sem peças no piquete da semana 45", dificuldadesImport);
  const secaoAvarias2 = pagina.locator("div.card-sombra", { hasText: "03 · Avarias e serviços" }).first();
  const textoPly = secaoAvarias2.locator("div.rounded-md.border", { hasText: "Pás Mecânicas (WLD)" }).first();
  const complexasPly = textoPly.locator("textarea").nth(1);
  ok("Import preenche avarias complexas", (await complexasPly.inputValue()).includes("Baixa pressão do óleo"), await complexasPly.inputValue());
  const melhorias = pagina.locator("input[placeholder='Descrição da melhoria']");
  ok("Import cria linha no plano de melhorias", (await melhorias.count()) === 1 && (await melhorias.first().inputValue()) === "Melhorar o armazém de peças");

  /* ============ F. GRAVAR ============ */
  await pagina.locator("button", { hasText: "Gravar semana" }).first().click();
  await pagina.waitForTimeout(500);
  ok("POST leva 12 linhas", Array.isArray(corpoPost?.linhas) && corpoPost.linhas.length === 12, String(corpoPost?.linhas?.length));
  ok("POST leva 12 avarias", Array.isArray(corpoPost?.avarias) && corpoPost.avarias.length === 12, String(corpoPost?.avarias?.length));
  const avRst = corpoPost?.avarias?.find((a) => a.frota === "Forklifts 2,5-16T");
  ok("POST leva o texto das avarias", avRst?.frequentes?.includes("Reparação do alternador (05-05)"), avRst?.frequentes);
  ok("POST leva ano e semana do import", corpoPost?.ano === 2026 && corpoPost?.semana === 45, `${corpoPost?.ano}-${corpoPost?.semana}`);

  await pagina.locator("button", { hasText: "Gravar semana" }).first().click();
  await pagina.waitForTimeout(500);
  const faixa = pagina.locator("div[role='alert']", { hasText: "disp_semana_avarias" });
  ok("Aviso da tabela em falta aparece na faixa", (await faixa.count()) >= 1, (await faixa.first().textContent().catch(() => ""))?.slice(0, 90));

  await browser.close();
  console.log(resultado.join("\n"));
  const falhas = resultado.filter((r) => r.startsWith("FALHOU")).length;
  console.log(`\nRESUMO SEMANAL: ${resultado.length - falhas}/${resultado.length} testes passaram`);
})().catch((e) => {
  console.error("ERRO FATAL:", e.message);
  process.exit(1);
});
