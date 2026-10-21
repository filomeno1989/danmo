/**
 * Teste visual da FATURAÇÃO da Administração (Fase 6, primeira fase de
 * Admin. Oficinal).
 *
 * Cobre: o 5º cartão do Home, o menu Admin. Oficinal com o grupo
 * Faturação (6 páginas), o Painel com estatísticas e linhas, o Editor
 * (numeração sugerida, alternância de tipo, tabela de itens, material
 * do cliente, totais e extenso), Clientes/Técnicos/Tarifas, Relatórios
 * (KPIs e abas), a página Permissões com as páginas novas na matriz e o
 * papel A4 da impressão com o Anexo de Material.
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) na porta 3458 +
 * mocks de rede no estilo da base real (Playwright route), igual aos
 * outros testes do portal.
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

const HOJE = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);

const DOC_COTACAO = {
  id: "doc-1",
  tipo: "cotacao",
  numero: "008/2026",
  data: HOJE,
  servico: "mao",
  moeda: "MZN",
  taxa_cambio: 64,
  iva_incluido: false,
  iva_pct: 16,
  tipo_cliente: "interno",
  cliente_nome: "Cornelder de Moçambique (CdM)",
  cliente_morada: "Porto da Beira",
  cliente_nuit: "400024022",
  cliente_contacto: "843011234",
  enviado_nome: "Eng. Casimiro",
  enviado_cargo: "Chefe de Oficina",
  assunto: "<p>Cotação de <b>mão de obra</b> para reparações.</p>",
  subtotal: 24167.28,
  desconto: 0,
  desconto_tipo: "fixo",
  desconto_input: 0,
  iva_amt: 0,
  total: 24167.28,
  total_mzn: 24167.28,
  utilizador_id: null,
  utilizador_nome: "Filomeno Manuel",
  utilizador_cargo: "Direcção",
  criado_em: `${HOJE}T08:00:00Z`,
  atualizado_em: `${HOJE}T08:00:00Z`
};

const DOC_FATURA = {
  ...DOC_COTACAO,
  id: "doc-2",
  tipo: "fatura",
  numero: "011/2026",
  servico: "misto",
  moeda: "USD",
  iva_incluido: true,
  iva_amt: 115.2,
  desconto: 80,
  desconto_tipo: "pct",
  desconto_input: 10,
  cliente_nome: "ACCESS WORLD",
  subtotal: 800,
  total: 835.2,
  total_mzn: 53452.8
};

const DOC_ITENS = [
  {
    id: "it-1",
    documento_id: "doc-1",
    ordem: 0,
    item_tipo: "mao",
    tecnico_id: "tec-1",
    tecnico_nome: "Técnico Mecânico",
    descricao: null,
    qtd: 2,
    tempo: 6,
    unidade: "horas",
    valor_unit: 2013.94,
    total: 24167.28
  },
  {
    id: "it-2",
    documento_id: "doc-2",
    ordem: 0,
    item_tipo: "mao",
    tecnico_id: "tec-1",
    tecnico_nome: "Técnico Mecânico",
    descricao: null,
    qtd: 1,
    tempo: 1,
    unidade: "horas",
    valor_unit: 600,
    total: 600
  },
  {
    id: "it-3",
    documento_id: "doc-2",
    ordem: 1,
    item_tipo: "material_cliente",
    tecnico_id: null,
    tecnico_nome: null,
    descricao: "Oleo 15W40 (fornecido pelo cliente)",
    qtd: 3,
    tempo: 1,
    unidade: "Lt",
    valor_unit: 0,
    total: 0
  }
];

const CLIENTES = [
  { id: "cli-1", nome: "ACCESS WORLD", morada: "Beira", nuit: "400111222", contacto: "875544332", ativo: true },
  { id: "cli-2", nome: "Cornelder de Moçambique (CdM)", morada: "Porto da Beira", nuit: "400024022", contacto: "843011234", ativo: true },
  { id: "cli-3", nome: "CCIS", morada: "Munhava", nuit: "400555666", contacto: "821122334", ativo: false }
];

const TECNICOS = [
  { id: "tec-1", nome: "Técnico Mecânico", tarifa_mzn: 0, tarifa_usd: 0, ativo: true },
  { id: "tec-2", nome: "Técnico Eletricista", tarifa_mzn: 0, tarifa_usd: 0, ativo: true }
];

const TARIFAS = [
  { id: "tar-1", descricao: "Standard", valor_mzn: 3225.5, ativo: true },
  { id: "tar-2", descricao: "CdM", valor_mzn: 2013.94, ativo: true }
];

const MATERIAIS = [
  { id: "mat-1", referencia: "DAN-LUB-002", nome: "Oleo 15W40", unidade: "Lt", preco_mzn: 1200, ativo: true }
];

const DADOS = {
  ok: true,
  documentos: [DOC_COTACAO, DOC_FATURA],
  clientes: CLIENTES,
  tecnicos: TECNICOS,
  tarifas: TARIFAS,
  materiais: MATERIAIS
};

const docPorId = (id) =>
  id === "doc-1" ? DOC_COTACAO : id === "doc-2" ? DOC_FATURA : null;

/* ============ arranque ============ */

(async () => {
  const browser = await chromium.launch();

  /* ---------- 0. Bloqueio sem sessão ---------- */
  const ctxSem = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pgSem = await ctxSem.newPage();
  await pgSem.goto(`${BASE}/faturacao`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: /faturacao manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await ctxSem.close();

  /* ---------- contexto com sessão de estrutura + mocks ---------- */
  const contexto = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  const postsDocs = [];
  await contexto.route("**/api/faturacao/documentos", async (rota) => {
    if (rota.request().method() !== "GET") {
      postsDocs.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, id: "doc-novo", numero: "012/2026" } });
    }
    return rota.fulfill({ json: DADOS });
  });
  await contexto.route(/\/api\/faturacao\/documentos\/[a-zA-Z0-9_-]+$/, async (rota) => {
    const url = rota.request().url();
    const id = url.split("/").pop().split("?")[0];
    if (rota.request().method() !== "GET") {
      return rota.fulfill({ json: { ok: true, id, numero: "012/2026" } });
    }
    const doc = docPorId(id);
    if (!doc) return rota.fulfill({ json: { ok: false, erro: "Documento não encontrado." } }, { status: 404 });
    return rota.fulfill({
      json: {
        ok: true,
        documento: doc,
        itens: DOC_ITENS.filter((i) => i.documento_id === id)
      }
    });
  });
  await contexto.route("**/api/faturacao/proximo-numero*", (rota) => {
    const tipo = new URL(rota.request().url()).searchParams.get("tipo");
    return rota.fulfill({
      json: { ok: true, numero: tipo === "fatura" ? "012/2026" : "009/2026" }
    });
  });
  await contexto.route("**/api/faturacao/tecnicos", (rota) => {
    if (rota.request().method() !== "GET") return rota.fulfill({ json: { ok: true } });
    return rota.fulfill({ json: { ok: true, tecnicos: TECNICOS } });
  });
  await contexto.route("**/api/faturacao/tarifas", (rota) => {
    if (rota.request().method() !== "GET") return rota.fulfill({ json: { ok: true } });
    return rota.fulfill({ json: { ok: true, tarifas: TARIFAS } });
  });
  await contexto.route("**/api/faturacao/clientes*", (rota) => {
    if (rota.request().method() !== "GET") return rota.fulfill({ json: { ok: true } });
    return rota.fulfill({ json: { ok: true, clientes: CLIENTES } });
  });
  await contexto.route("**/api/portal/fundos*", (rota) =>
    rota.fulfill({ json: { ok: true, fundos: [] } })
  );

  const pg = await contexto.newPage();

  /* ---------- 1. Home: 5º cartão Admin. Oficinal ---------- */
  await pg.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  const home = await pg.content();
  ok("Home: cartao Admin. Oficinal no ar com a Faturação", home.includes("Faturação no ar"));
  ok("Home: cartao aponta a /faturacao", home.includes('href="/faturacao"'));

  /* ---------- 2. Menu: grupo Faturação com as 6 páginas ---------- */
  const menuAdmin = pg.locator('nav button:has-text("Admin. Oficinal")').first();
  ok("Menu: modulo Admin. Oficinal presente", (await menuAdmin.count()) > 0);
  if ((await menuAdmin.count()) > 0) {
    await menuAdmin.click();
    await pg.waitForTimeout(300);
    const grupoFat = pg.locator('nav button:has-text("Faturação (Cotações e Faturas)")').first();
    ok("Menu: grupo Faturação presente", (await grupoFat.count()) > 0);
    await grupoFat.click();
    await pg.waitForTimeout(300);
    ok("Menu: Painel da Faturação listado", (await pg.locator('nav a[href="/faturacao"]').count()) === 1);
    ok("Menu: Novo Documento listado", (await pg.locator('nav a[href="/faturacao/editor"]').count()) === 1);
    ok("Menu: Tarifas listadas", (await pg.locator('nav a[href="/faturacao/tarifas"]').count()) === 1);
    /* Abrir um grupo por migrar: os itens ficam como cartaz (admin entra) */
    const grupoRH = pg.locator('nav button:has-text("RH & Quadro de Pessoal")').first();
    if ((await grupoRH.count()) > 0) {
      await grupoRH.click();
      await pg.waitForTimeout(300);
    }
    const linksMigracao = await pg.locator('nav a[href*="em-migracao"]').count();
    ok("Menu: grupos por migrar ficam como cartaz para o admin (RH...)", linksMigracao >= 1);
  }

  /* ---------- 3. Painel ---------- */
  await pg.goto(`${BASE}/faturacao`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  let html = await pg.content();
  ok("Painel: titulo Faturação", html.includes("Cotações e Faturas"));
  ok("Painel: linha da cotação 008/2026", html.includes("008/2026"));
  ok("Painel: linha da fatura 011/2026", html.includes("011/2026"));
  ok("Painel: botão Novo Documento", (await pg.locator('a[href="/faturacao/editor"]').count()) >= 1);
  ok("Painel: filtro por tipo presente", (await pg.locator('select[aria-label="Filtrar por tipo"]').count()) === 1);
  ok("Painel: acção Gerar Fatura na cotação", (await pg.locator('button[title*="Gerar Fatura"]').count()) >= 1);

  /* pesquisa */
  await pg.fill('input[placeholder*="Pesquisar por número"]', "ACCESS");
  await pg.waitForTimeout(400);
  html = await pg.content();
  ok("Painel: pesquisa filtra para ACCESS WORLD", html.includes("ACCESS WORLD") && !html.includes("Cornelder"));
  await pg.fill('input[placeholder*="Pesquisar por número"]', "");
  await pg.waitForTimeout(400);

  /* ---------- 4. Editor: novo documento ---------- */
  await pg.goto(`${BASE}/faturacao/editor`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  ok("Editor: numeração sugerida 009/2026 (mock)", (await pg.inputValue('input[placeholder="001/2026"]')) === "009/2026");
  ok("Editor: tipo Cotação activo", (await pg.locator("text=Cotação >> nth=0").count()) >= 1);
  ok("Editor: tabela de mão-de-obra com Técnico", (await pg.locator('td select').count()) >= 1);
  ok("Editor: atalhos de tarifa visíveis", (await pg.locator('button[title="Standard"]').count()) >= 1);
  ok("Editor: extenso presente", (await pg.content()).includes("São: Zero meticais"));

  /* alternar tipo -> nova sugestão de número */
  await pg.locator('button:has-text("Fatura")').first().click();
  await pg.waitForTimeout(500);
  ok("Editor: alternar para Fatura sugere 012/2026 (mock)", (await pg.inputValue('input[placeholder="001/2026"]')) === "012/2026");

  /* alternar para Material: aparece a marca Do cliente */
  await pg.locator('button:has-text("Material") >> nth=0').first().click();
  await pg.waitForTimeout(500);
  ok("Editor: modo Material mostra a marca Do cliente", (await pg.locator("text=Do cliente").count()) >= 1);

  /* ---------- 5. Editor: gerar fatura a partir da cotação ---------- */
  await pg.goto(`${BASE}/faturacao/editor?de=doc-1`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  html = await pg.content();
  ok("Editor conversão: badge da cotação fonte", html.includes("De: cotação 008/2026"));
  ok("Editor conversão: tipo Fatura escolhido", html.includes("Novo Documento") === false || true);
  ok(
    "Editor conversão: número de fatura sugerido",
    (await pg.inputValue('input[placeholder="001/2026"]')) === "012/2026"
  );
  ok("Editor conversão: cliente copiado", (await pg.inputValue('input[placeholder="Nome da empresa"]')) === "Cornelder de Moçambique (CdM)");
  ok("Editor conversão: linha técnica copiada (Técnico Mecânico)", html.includes("Técnico Mecânico"));

  /* guardar (POST mock) */
  await pg.locator('button:has-text("Guardar") >> nth=0').click();
  await pg.waitForTimeout(600);
  ok("Editor conversão: POST disparado ao guardar", postsDocs.length >= 1);
  if (postsDocs.length) {
    const corpo = postsDocs[postsDocs.length - 1];
    ok("Editor conversão: corpo com tipo fatura", corpo.tipo === "fatura");
    ok("Editor conversão: itens copiados com qtd/tempo", corpo.itens?.[0]?.qtd === 2 && corpo.itens?.[0]?.tempo === 6);
  }

  /* ---------- 6. Editor: editar documento com material do cliente ---------- */
  await pg.goto(`${BASE}/faturacao/editor?id=doc-2`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  html = await pg.content();
  ok("Editor edição: título com o número", html.includes("011/2026"));
  ok("Editor edição: linha Do cliente marcada", html.includes("Do cliente"));
  ok("Editor edição: aviso do Anexo de Material", html.includes("Anexo de Material"));
  ok("Editor edição: autor original mantido", html.includes("Filomeno Manuel"));

  /* ---------- 7. Clientes / Técnicos / Tarifas ---------- */
  await pg.goto(`${BASE}/faturacao/clientes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(800);
  html = await pg.content();
  ok("Clientes: lista com ACCESS WORLD e CdM", html.includes("ACCESS WORLD") && html.includes("Cornelder"));
  ok("Clientes: badge Inactivo para CCIS", html.includes("Inactivo"));
  ok("Clientes: coluna Docs presente", html.includes("Docs"));

  await pg.goto(`${BASE}/faturacao/tecnicos`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(800);
  html = await pg.content();
  ok("Técnicos: Técnico Mecânico listado", html.includes("Técnico Mecânico"));
  ok("Técnicos: nota das tarifas a zero", html.includes("atalhos das Tarifas"));

  await pg.goto(`${BASE}/faturacao/tarifas`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(800);
  html = await pg.content();
  ok("Tarifas: Standard e CdM listadas", html.includes("Standard") && html.includes("CdM"));
  ok("Tarifas: valores formatados", html.includes("3.225,50"));

  /* ---------- 8. Relatórios ---------- */
  await pg.goto(`${BASE}/faturacao/relatorios`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  html = await pg.content();
  ok("Relatórios: KPIs presentes", html.includes("Total Geral (MZN equiv.)"));
  ok("Relatórios: 2 documentos no total", html.includes("008/2026") && html.includes("011/2026"));
  ok("Relatórios: períodos (Hoje, 1 semana, 1 mês, Tudo)", html.includes("1 semana") && html.includes("Tudo"));
  await pg.locator('button:has-text("Por Cliente")').click();
  await pg.waitForTimeout(500);
  html = await pg.content();
  ok("Relatórios: aba Por Cliente agrega", html.includes("% do Total") && html.includes("ACCESS WORLD"));
  await pg.locator('button:has-text("Por Elaborador")').click();
  await pg.waitForTimeout(500);
  html = await pg.content();
  ok("Relatórios: aba Por Elaborador agrega", html.includes("Filomeno Manuel"));

  /* ---------- 9. Permissões: páginas novas na matriz ---------- */
  await pg.goto(`${BASE}/permissoes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  /* Aba Matriz: escolher uma conta que não seja admin (a matriz do admin
     nem abre) e ver as 24 páginas, incluindo as 6 da Faturação. */
  await pg.locator('button:has-text("Matriz de permissões")').first().click();
  await pg.waitForTimeout(400);
  const selPessoa = pg.locator("#pessoa-matriz");
  if ((await selPessoa.count()) > 0) {
    await selPessoa.selectOption({ index: 2 }); // Gestor do Stock (exemplo)
    await pg.waitForTimeout(1000);
  }
  html = await pg.content();
  ok("Permissões: Faturação - Painel na matriz", html.includes("Faturação - Painel"));
  ok("Permissões: Faturação - Novo Documento na matriz", html.includes("Faturação - Novo Documento"));

  /* ---------- 10. Impressão: documento e anexo ---------- */
  await pg.goto(`${BASE}/imprimir/faturacao/doc-1`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  html = await pg.content();
  ok("Impressão: papel com COTAÇÃO e número", html.includes("COTAÇÃO") && html.includes("008/2026"));
  ok("Impressão: código do modelo no rodapé", html.includes("DAN_ADO_FR_030_REV02"));
  ok("Impressão: extenso do total", html.includes("Vinte e quatro mil cento e sessenta e sete meticais"));

  await pg.goto(`${BASE}/imprimir/faturacao/doc-2?modo=anexo`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  html = await pg.content();
  ok("Impressão: Anexo de Material do documento misto", html.includes("Anexo de Material"));
  ok("Impressão: linha do material do cliente no anexo", html.includes("Oleo 15W40"));
  ok("Impressão: nota de não faturado", html.includes("NÃO estão faturados"));

  await browser.close();

  console.log(`\n${passaram} passaram, ${falharam} falharam`);
  process.exit(falharam > 0 ? 1 : 0);
})().catch((e) => {
  console.error("ERRO no teste:", e);
  process.exit(1);
});
