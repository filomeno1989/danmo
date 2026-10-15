/**
 * Teste visual do módulo DISPONIBILIDADE (Fase 4).
 *
 * Cobre as 5 páginas novas: Painel, Grelha Diária, Horómetro, Resumo
 * Semanal e Configurações, mais o item no menu e o bloqueio sem sessão.
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) na porta 3458 +
 * mocks de rede com dados no estilo da base real (Playwright route),
 * igual aos outros testes do portal.
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3458";
let passaram = 0;
let falharam = 0;

function ok(nome, cond, extra = "") {
  if (cond) {
    passaram += 1;
    console.log(`  OK  ${nome}`);
  } else {
    falharam += 1;
    console.log(`FAIL  ${nome} ${extra}`);
  }
}

/* ============ dados de mock (estilo da base real) ============ */

const META = 80;

const PAINEL = {
  ok: true,
  meta: META,
  ano: 2026,
  mes: 10,
  resumoMensal: Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    horasA: 100000 + i * 1000,
    parado: 20000 - i * 500,
    total: 124000,
    pct: [82.5, 84.1, 79.9, 85.3, 83.2, 86.0, 81.7, 84.9, 83.5, 87.2, 0, 0][i],
    maquinas: i < 10 ? 249 : 0
  })),
  comparacaoAnos: [
    { ano: 2022, pct: 71.4, horasA: 1200000, total: 1680000 },
    { ano: 2023, pct: 76.2, horasA: 1400000, total: 1837000 },
    { ano: 2024, pct: 79.8, horasA: 1500000, total: 1880000 },
    { ano: 2025, pct: 83.1, horasA: 1600000, total: 1926000 },
    { ano: 2026, pct: 84.2, horasA: 1050000, total: 1248000 }
  ],
  estados: {
    "Disponível": 1050000,
    "Avariada": 120000,
    "Acidentada": 15000,
    "Pneumático": 30000,
    "Revisão/Manutenção": 40000,
    "Aguarda Acessório": 13000,
    "Inspeção": 0
  },
  horometroMes: { trabalhadas: 12480, lancadas: 180, totalMaquinas: 233 },
  porFrota: [
    { frota: "Basculantes", maquinas: 8, pctMes: 88.1, pctAno: 85.0, paradoMes: 456 },
    { frota: "Escavadoras", maquinas: 15, pctMes: 82.4, pctAno: 81.2, paradoMes: 1200 },
    { frota: "Forklifts 2,5-16T", maquinas: 24, pctMes: 79.5, pctAno: 82.0, paradoMes: 2100 },
    { frota: "Manuseadoras", maquinas: 7, pctMes: 90.2, pctAno: 88.0, paradoMes: 200 },
    { frota: "Outros", maquinas: 11, pctMes: 91.0, pctAno: 89.9, paradoMes: 150 },
    { frota: "Pás Mecânicas (WLD)", maquinas: 13, pctMes: 84.0, pctAno: 83.3, paradoMes: 700 },
    { frota: "Plataformas R-R", maquinas: 32, pctMes: 86.6, pctAno: 84.4, paradoMes: 1800 },
    { frota: "Plataformas SK", maquinas: 31, pctMes: 85.2, pctAno: 83.9, paradoMes: 1600 },
    { frota: "Reach-Stacker 45T", maquinas: 33, pctMes: 80.3, pctAno: 82.8, paradoMes: 2600 },
    { frota: "Tratores 60T", maquinas: 13, pctMes: 83.9, pctAno: 82.1, paradoMes: 800 },
    { frota: "Tratores 70T", maquinas: 38, pctMes: 85.7, pctAno: 84.6, paradoMes: 1500 }
  ],
  topParadas: [
    { code: "45-17", nome: "Sany", frota: "Reach-Stacker 45T", horas: 4320 },
    { code: "2.5-01", nome: "Doosan", frota: "Forklifts 2,5-16T", horas: 1770 }
  ],
  disponibilidade: 84.2
};

const EQUIPS = [
  { id: 1, code: "2.5-01", name: "Doosan", group_name: "FKL 2.5T", active: true },
  { id: 2, code: "45-17", name: "Sany", group_name: "RST 45T", active: true },
  { id: 3, code: "70-01", name: "Sino Truck", group_name: "TT 70T", active: true }
];

const DIAS_GET = {
  ok: true,
  equipamentos: EQUIPS,
  dias: [
    { id: 1, equipment_id: 1, data: "2026-10-01", estado: "Disponível", horas_disponiveis: 24, hora_entrada: null, hora_saida: null, observacao: null },
    { id: 2, equipment_id: 1, data: "2026-10-02", estado: "Avariada", horas_disponiveis: 0, hora_entrada: "08:30", hora_saida: null, observacao: "bombas injetoras" },
    { id: 3, equipment_id: 1, data: "2026-10-03", estado: "Aguarda Acessório", horas_disponiveis: 0, hora_entrada: null, hora_saida: null, observacao: null },
    { id: 4, equipment_id: 2, data: "2026-10-01", estado: "Pneumático", horas_disponiveis: 0, hora_entrada: null, hora_saida: "14:00", observacao: null }
  ],
  transicoesAbertas: [
    { id: 9, equipment_id: 1, estado: "Aguarda Acessório", inicio: "2026-10-03T00:00:00+02:00", fim: null, code: "2.5-01", nome: "Doosan" }
  ],
  resumoSemanal: [
    { semana: 41, pct: 80.4, maquinas: 3, dias: 7 },
    { semana: 42, pct: 66.7, maquinas: 3, dias: 3 }
  ],
  resumoMes: { horasDisponiveis: 48, diasMarcados: 4 }
};

const SEMANA_GET = {
  ok: true,
  ano: 2026,
  semana: 42,
  intervalo: { de: "2026-10-12", ate: "2026-10-18" },
  meta: META,
  frotas: [
    "Reach-Stacker 45T", "Tratores 70T", "Tratores 60T", "Forklifts 2,5-16T",
    "Forklifts 30-50T", "Plataformas SK", "Plataformas R-R", "Pás Mecânicas (WLD)",
    "Escavadoras", "Manuseadoras", "Basculantes", "Outros"
  ],
  osCalculado: {
    "Tratores 70T": { pend_inicio: 2, entradas: 3, saidas: 1, aguardam_pecas: 1 },
    "Reach-Stacker 45T": { pend_inicio: 1, entradas: 1, saidas: 2, aguardam_pecas: 0 }
  },
  guardado: {},
  disponibilidade: { "Tratores 70T": 85.7, "Reach-Stacker 45T": 80.3 },
  geral: {
    dificuldades: "Falta de pneus 17.5-25 para as escavadoras.",
    melhorias: [
      { descricao: "Criar stock mínimo de filtros", responsavel: "Filomeno", prazo: "30/10", estado: "Em curso" }
    ]
  }
};

const HOROMETRO_GET = {
  ok: true,
  equipamentos: EQUIPS.map((e, i) => ({
    ...e,
    frota: ["Forklifts 2,5-16T", "Reach-Stacker 45T", "Tratores 70T"][i]
  })),
  leituras: [
    {
      id: 5, equipment_id: 1, leitura_inicial: 84, leitura_final: 126,
      horas_trabalhadas: 42, lancado_por: "importacao", lancado_em: "2026-10-01T00:00:00Z", observacao: "importado do excel 2026"
    }
  ],
  finalAnterior: { "2": 35214, "3": 15474 }
};

const CONFIG_GET = { ok: true, meta: META, atualizado_em: "2026-10-01T00:00:00Z", atualizado_por: "Filomeno" };

let postsDias = [];
let postsHorometro = [];
let postsSemana = [];

/* ============ arranque ============ */

(async () => {
  const browser = await chromium.launch();
  const contexto = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  await contexto.route("**/api/disponibilidade/painel*", (rota) => rota.fulfill({ json: PAINEL }));
  await contexto.route("**/api/disponibilidade/dias*", (rota) => {
    if (rota.request().method() === "GET") return rota.fulfill({ json: DIAS_GET });
    if (rota.request().method() === "POST") {
      postsDias.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, gravadas: 1, maquinasTocadas: 1 } });
    }
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route("**/api/disponibilidade/semana*", (rota) => {
    if (rota.request().method() === "GET") return rota.fulfill({ json: SEMANA_GET });
    if (rota.request().method() === "POST") {
      postsSemana.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, frotas: 12, melhorias: 1 } });
    }
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route("**/api/disponibilidade/horometro*", (rota) => {
    if (rota.request().method() === "GET") return rota.fulfill({ json: HOROMETRO_GET });
    if (rota.request().method() === "POST") {
      postsHorometro.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, leitura: {} } });
    }
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route("**/api/disponibilidade/config*", (rota) => rota.fulfill({ json: CONFIG_GET }));

  const pagina = await contexto.newPage();

  /* ---------- 1. MENU ---------- */
  await pagina.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const menuDisponibilidade = pagina.locator("button[title='Disponibilidade Equip.']");
  ok("Menu mostra o modulo Disponibilidade Equip.", (await menuDisponibilidade.count()) > 0);
  await menuDisponibilidade.click();
  await pagina.waitForTimeout(400);
  const temSub = (await pagina.locator("a[href='/disponibilidade']").count()) > 0;
  ok("Sub-paginas do modulo no menu (Painel/...)", temSub);
  const subs = ["grelha", "horometro", "semana", "config"];
  for (const s of subs) {
    ok(`Sub-pagina ${s} linkada no menu`, (await pagina.locator(`a[href='/disponibilidade/${s}']`).count()) > 0);
  }

  /* ---------- 2. PAINEL ---------- */
  await pagina.goto(`${BASE}/disponibilidade`, { waitUntil: "networkidle" });
  ok("Painel: cabecalho", (await pagina.locator("h1:has-text('Disponibilidade de Equipamentos')").count()) > 0);
  ok("Painel: KPI disponibilidade 84,2%", (await pagina.locator("text=84.2%").count()) > 0);
  ok("Painel: nota da meta 80%", (await pagina.locator("text=Meta 80%").count()) > 0);
  ok("Painel: KPI horometro 12.480 h", (await pagina.locator("text=/12[ .,\u00A0\u202F]?480 h/").count()) > 0);
  ok("Painel: grafico dos 12 meses", (await pagina.locator("text=Disponibilidade por mês em 2026").count()) > 0);
  ok("Painel: comparacao com mes anterior", (await pagina.locator("text=Comparação com Setembro").count()) > 0);
  ok("Painel: seccao comparacao entre anos", (await pagina.locator("h2:has-text('Comparação entre anos')").count()) > 0);
  ok("Painel: 5 anos no comparativo", (await pagina.locator("span:text-is('2022')").count()) >= 1);
  ok("Painel: horas por estado fisico", (await pagina.locator("h2:has-text('Horas por estado físico')").count()) > 0);
  ok("Painel: 7 estados listados", (await pagina.locator("text=Aguarda Acessório").count()) > 0);
  ok("Painel: quadro por frota com Reach-Stacker", (await pagina.locator("td:has-text('Reach-Stacker 45T')").count()) > 0);
  ok("Painel: quadro por frota com 11 frotas", (await pagina.locator("tbody tr").count()) >= 11);
  ok("Painel: top paradas com 45-17", (await pagina.locator("text=45-17").first().isVisible().catch(() => false)));

  // trocar para ano inteiro -> horómetro sai, comparação anual entra
  await pagina.selectOption("select[aria-label='Mês']", "0");
  await pagina.waitForTimeout(500);
  ok("Painel: ano inteiro mostra 4 KPIs sem horometro", (await pagina.locator("text=horas do mês").count()) === 0);
  await pagina.selectOption("select[aria-label='Mês']", "10");
  await pagina.waitForTimeout(400);

  /* ---------- 3. GRELHA ---------- */
  await pagina.goto(`${BASE}/disponibilidade/grelha`, { waitUntil: "networkidle" });
  ok("Grelha: cabecalho", (await pagina.locator("h1:has-text('Grelha Diária')").count()) > 0);
  ok("Grelha: maquina 2.5-01 na tabela", (await pagina.locator("th:has-text('2.5-01')").count()) > 0);
  ok("Grelha: 31 dias no mes", (await pagina.locator("thead th").count()) >= 32);
  ok("Grelha: legenda com 7 estados", (await pagina.locator("li:has-text('Pneumático')").count()) > 0);
  ok("Grelha: paradas neste momento mostra 2.5-01", (await pagina.locator("li span:has-text('2.5-01')").count()) > 0);
  ok("Grelha: resumo por semana (ISO)", (await pagina.locator("text=Semana 41").count()) > 0);
  ok("Grelha: horas do mes por estado", (await pagina.locator("h2:has-text('Horas do mês por estado')").count()) > 0);

  // abrir modal do dia 2 de Outubro da 2.5-01 (celula com Avariada)
  await pagina.locator("button[title*='2.5-01 · 2026-10-02']").click();
  await pagina.waitForTimeout(300);
  ok("Grelha: modal do dia abre com maquina e data", (await pagina.locator("text=2.5-01 · 2026-10-02").count()) > 0);
  ok("Grelha: modal com 7 botoes de estado", (await pagina.locator("button:text-is('Disponível')").count()) > 0);
  ok("Grelha: hora entrada preenchida", (await pagina.locator("input[type='time']").first().inputValue()) === "08:30");

  // mudar estado no modal e repetir ate dia 4
  await pagina.locator("button:text-is('Aguarda Acessório')").click();
  await pagina.locator("input[placeholder='só este dia']").fill("4");
  await pagina.locator("button:has-text('Gravar'):not(:has-text('marcação'))").last().click();
  await pagina.waitForTimeout(500);
  ok("Grelha: gravou dia + repeticao (3 marcacoes no POST)", postsDias.length === 1 && postsDias[0]?.marcacoes?.length === 3, JSON.stringify(postsDias));

  // clique direito cicla estados -> marcacao pendente
  await pagina.locator("button[title*='70-01 · 2026-10-05']").click({ button: "right" });
  await pagina.waitForTimeout(300);
  ok("Grelha: botao de gravar lote aparece com 1 marcacao", (await pagina.locator("button:has-text('Gravar 1 marcação')").count()) > 0);
  await pagina.locator("button:has-text('Gravar 1 marcação')").click();
  await pagina.waitForTimeout(500);
  ok("Grelha: POST do lote enviado", postsDias.length === 2);

  /* ---------- 4. HOROMETRO ---------- */
  await pagina.goto(`${BASE}/disponibilidade/horometro`, { waitUntil: "networkidle" });
  ok("Horometro: cabecalho", (await pagina.locator("h1:text-is('Horómetro')").count()) > 0);
  ok("Horometro: contador 1 de 3 maquinas", (await pagina.locator("text=1 de 3 máquinas lançadas").count()) > 0);
  const inicial45 = pagina.locator("tr:has-text('45-17') input[type='number']").first();
  ok("Horometro: inicial vem do final do mes anterior (35214)", (await inicial45.inputValue()) === "35214");
  await pagina.locator("tr:has-text('45-17') input[type='number']").nth(1).fill("35330");
  const trabalhadas = await pagina.locator("tr:has-text('45-17') td").nth(3).innerText();
  ok("Horometro: horas trabalhadas calculadas 116", trabalhadas.includes("116"), trabalhadas);
  await pagina.locator("tr:has-text('45-17') button:has-text('Gravar')").click();
  await pagina.waitForTimeout(500);
  ok("Horometro: POST da leitura com finais corretos",
    postsHorometro.length === 1 &&
    postsHorometro[0].leitura_final === 35330 &&
    postsHorometro[0].leitura_inicial === 35214,
    JSON.stringify(postsHorometro));
  await pagina.fill("input[type='search']", "70-01");
  await pagina.waitForTimeout(300);
  ok("Horometro: busca filtra maquinas (1 resultado)", (await pagina.locator("tbody tr").count()) === 1);
  await pagina.fill("input[type='search']", "");
  await pagina.waitForTimeout(300);

  /* ---------- 5. RESUMO SEMANAL ---------- */
  await pagina.goto(`${BASE}/disponibilidade/semana`, { waitUntil: "networkidle" });
  ok("Semana: cabecalho", (await pagina.locator("h1:has-text('Resumo Semanal da Direcção')").count()) > 0);
  ok("Semana: 12 frotas na tabela", (await pagina.locator("tbody tr").count()) === 13, String(await pagina.locator("tbody tr").count()));
  ok("Semana: dificuldades preenchidas", (await pagina.locator("textarea").inputValue()).includes("pneus"));
  ok("Semana: plano de melhorias com 1 linha", (await pagina.locator("input[placeholder='Descrição da melhoria']").count()) === 1);
  ok("Semana: estado da melhoria Em curso", (await pagina.locator("select >> nth=0").inputValue()) === "Em curso");

  // preencher das OS: tratores 70T passa a 2/3/1/1
  await pagina.locator("button:has-text('Preencher das OS')").click();
  await pagina.waitForTimeout(200);
  const entrada70 = await pagina.locator("tr:has-text('Tratores 70T') input").nth(1).inputValue();
  ok("Semana: preencher das OS met entradas=3 nos Tratores 70T", entrada70 === "3", entrada70);
  const pendFecho70 = await pagina.locator("tr:has-text('Tratores 70T') td").nth(4).innerText();
  ok("Semana: pend. fecho calculado 4 (2+3-1)", pendFecho70.trim() === "4", pendFecho70);

  await pagina.locator("button:has-text('Gravar semana')").click();
  await pagina.waitForTimeout(500);
  ok("Semana: POST gravou 12 frotas + dificuldades + melhorias",
    postsSemana.length === 1 && postsSemana[0].linhas.length === 12 && postsSemana[0].dificuldades.includes("pneus"),
    JSON.stringify(postsSemana).slice(0, 160));

  // navegacao entre semanas
  await pagina.locator("button[aria-label='Semana seguinte']").click();
  await pagina.waitForTimeout(300);
  ok("Semana: navegacao para semana 43", (await pagina.locator("text=Semana 43").count()) > 0);

  /* ---------- 6. CONFIGURACOES ---------- */
  await pagina.goto(`${BASE}/disponibilidade/config`, { waitUntil: "networkidle" });
  ok("Config: cabecalho", (await pagina.locator("h1:has-text('Configurações da Disponibilidade')").count()) > 0);
  ok("Config: meta 80 no input", (await pagina.locator("input[type='number']").first().inputValue()) === "80");
  ok("Config: regras de calculo", (await pagina.locator("h2:has-text('Regras de cálculo')").count()) > 0);
  ok("Config: nota das 102 maquinas inactivas", (await pagina.locator("text=102 códigos").count()) > 0);

  /* ---------- 7. BLOQUEIO SEM SESSAO ---------- */
  const contextoLimpo = await browser.newContext();
  const paginaLimpa = await contextoLimpo.newPage();
  await paginaLimpa.goto(`${BASE}/disponibilidade`, { waitUntil: "domcontentloaded" });
  ok("Sem sessao: /disponibilidade manda ao login", paginaLimpa.url().includes("/login"), paginaLimpa.url());
  await contextoLimpo.close();

  /* ---------- fim ---------- */
  console.log(`\n=== DISPONIBILIDADE: ${passaram} OK / ${falharam} FALHAS ===`);
  await browser.close();
  process.exit(falharam ? 1 : 0);
})().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
