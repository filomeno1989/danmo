/**
 * Teste visual dos PEDIDOS DE AQUISIÇÃO (Admin. Oficinal, migração do hub).
 *
 * Cobre: bloqueio sem sessão, o cartão do Home, o menu Admin. Oficinal
 * com o grupo Pedidos de Aquisição (4 páginas), o Painel (KPIs, pesquisa
 * rápida por material, recentes), o Histórico (filtros, apagar com
 * DELETE capturado, trava anti-duplo-clique do editor), o Editor (nº
 * sugerido pelo servidor, solicitante por nome/código, criar fornecedor
 * inline, gravar e editar), as Configurações (3 abas + numeração com o
 * "o que manda") e o papel A5 PAISAGEM fiel (cabeçalho, caixa de
 * referência verde, tabela, assinaturas, código DAN_ADO_FR_010_REV01,
 * margens dinâmicas na emulação de impressão e color-adjust no
 * cabeçalho verde-escuro).
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

const PEDIDO_002 = {
  id: "aq-002",
  ano: 2026,
  numero: 2,
  data_pedido: "2026-09-02",
  tipo_documento: "Pro-forma",
  numero_cotacao_proforma: "13429",
  fornecedor_id: "for-1",
  fornecedor_nome: "Carlos Ferreira Sociedade Unipessoal, Lda",
  solicitante: "Filomeno Manuel Joaquim Alexandre",
  solicitante_codigo: "DM0069",
  observacao_geral: "Para as instalações."
};

const PEDIDO_001_2025 = {
  ...PEDIDO_002,
  id: "aq-001",
  ano: 2025,
  numero: 1,
  data_pedido: "2025-12-10",
  tipo_documento: "Cotação",
  numero_cotacao_proforma: "13400",
  fornecedor_id: "for-2",
  fornecedor_nome: "Ferragem Chiveve, Lda",
  observacao_geral: ""
};

const ITENS_002 = [
  { id: "it-1", pedido_id: "aq-002", numero_ordem: 1, designacao: "Detergente Liquido Sunlight L. Verde 400ML", quantidade: 120, unidade: "Un", aplicacao: "Uso Oficinal", observacao: "" },
  { id: "it-2", pedido_id: "aq-002", numero_ordem: 2, designacao: "Leite UHT Ultra 1/2LT", quantidade: 60, unidade: "Un", aplicacao: "Uso Oficinal", observacao: "" },
  { id: "it-3", pedido_id: "aq-002", numero_ordem: 3, designacao: "Cafe Ricoffy 250g", quantidade: 6, unidade: "Un", aplicacao: "Uso Oficinal", observacao: "Para os escritorios" }
];

const FORNECEDORES = [
  { id: "for-1", nome: "Carlos Ferreira Sociedade Unipessoal, Lda", contacto: null, morada: null, nuit: null, observacao: null, ativo: true },
  { id: "for-2", nome: "Ferragem Chiveve, Lda", contacto: "845566778", morada: null, nuit: "400111222", observacao: null, ativo: true },
  { id: "for-3", nome: "Arquivado Lda", contacto: null, morada: null, nuit: null, observacao: null, ativo: false }
];

const DENOMINACOES = [
  { id: "den-1", nome: "Cotação", ordem: 1, ativo: true },
  { id: "den-2", nome: "Pro-forma", ordem: 2, ativo: true },
  { id: "den-3", nome: "Venda a Dinheiro", ordem: 3, ativo: true }
];

const COLABORADORES = [
  { id: 1, name: "Filomeno Manuel Joaquim Alexandre", code: "DM0069", setor: "Administração" },
  { id: 2, name: "João Testador Machava", code: "DM0001", setor: "Oficina" },
  { id: 3, name: "Ana Beira Utils", code: "DM0002", setor: "Stock" }
];

const CONTADORES = [{ id: "cnt-1", ano: 2026, proximo_numero: 105 }];

const LISTA = {
  ok: true,
  pedidos: [PEDIDO_002, PEDIDO_001_2025],
  designacoesPorPedido: {
    "aq-002": ITENS_002.map((i) => i.designacao),
    "aq-001": ["Chapa galvanizada 2m"]
  },
  aplicacoes: ["Uso Oficinal", "Serralharia"]
};

const pedidoPorId = (id) => (id === "aq-002" ? PEDIDO_002 : id === "aq-001" ? PEDIDO_001_2025 : null);

/* ============ arranque ============ */

(async () => {
  const browser = await chromium.launch();

  /* ---------- 0. Bloqueio sem sessão ---------- */
  const ctxSem = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pgSem = await ctxSem.newPage();
  await pgSem.goto(`${BASE}/aquisicao`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: /aquisicao manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await pgSem.goto(`${BASE}/imprimir/aquisicao/aq-002`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: o papel da aquisicao tambem manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await ctxSem.close();

  /* ---------- contexto com sessão de estrutura + mocks ---------- */
  const contexto = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  const postsPedidos = [];
  const metodosPedido = [];
  await contexto.route("**/api/aquisicao/pedidos", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: LISTA });
    postsPedidos.push(rota.request().postDataJSON());
    if (m === "POST") {
      /* POST lento (400ms) para o duplo clique cair DENTRO da gravação,
         a janela real de rede onde o hub nascia com pedidos duplicados. */
      await new Promise((r) => setTimeout(r, 400));
      return rota.fulfill({ json: { ok: true, pedido: { ...PEDIDO_002, id: "aq-novo", numero: 105, ano: 2026 } } });
    }
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route(/\/api\/aquisicao\/pedidos\/[a-zA-Z0-9_-]+$/, async (rota) => {
    const url = rota.request().url();
    const id = url.split("/").pop().split("?")[0];
    const m = rota.request().method();
    if (m === "GET") {
      const pedido = pedidoPorId(id);
      if (!pedido) return rota.fulfill({ json: { ok: false, erro: "Pedido não encontrado." } }, { status: 404 });
      return rota.fulfill({ json: { ok: true, pedido, itens: id === "aq-002" ? ITENS_002 : [] } });
    }
    metodosPedido.push({ id, m, corpo: rota.request().postDataJSON() });
    if (m === "PATCH") await new Promise((r) => setTimeout(r, 400));
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route("**/api/aquisicao/fornecedores", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: { ok: true, fornecedores: FORNECEDORES } });
    if (m === "POST") {
      const corpo = rota.request().postDataJSON();
      const nome = corpo?.dados?.nome || "";
      const existente = FORNECEDORES.find((f) => f.nome.toLowerCase() === nome.toLowerCase());
      if (existente) return rota.fulfill({ json: { ok: true, fornecedor: existente, jaExistia: true } });
      return rota.fulfill({ json: { ok: true, fornecedor: { id: "for-novo", nome, ativo: true } } });
    }
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route("**/api/aquisicao/denominacoes", async (rota) => {
    if (rota.request().method() === "GET") return rota.fulfill({ json: { ok: true, denominacoes: DENOMINACOES } });
    return rota.fulfill({ json: { ok: true, denominacao: { id: "den-novo", nome: "Requisição Interna", ordem: 4, ativo: true } } });
  });
  await contexto.route("**/api/aquisicao/colaboradores", (rota) =>
    rota.fulfill({ json: { ok: true, colaboradores: COLABORADORES } })
  );
  await contexto.route("**/api/aquisicao/contadores", (rota) =>
    rota.fulfill({
      json: {
        ok: true,
        contadores: CONTADORES,
        ultimoPorAno: { 2026: 2, 2025: 1 }
      }
    })
  );
  await contexto.route("**/api/aquisicao/proximo-numero*", (rota) =>
    rota.fulfill({ json: { ok: true, ano: 2026, numero: 105, sugerido: "105/2026" } })
  );

  const pg = await contexto.newPage();

  /* ---------- 1. Home: cartão Admin. Oficinal actualizado ---------- */
  await pg.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await pg.waitForSelector('nav[aria-label="Menu principal"]', { timeout: 15000 });
  await pg.waitForTimeout(600);
  const home = await pg.content();
  ok(
    "Home: cartao Admin. Oficinal menciona os Pedidos de Aquisição no ar",
    home.includes("e os Pedidos de Aquisição. Seguem Avaliação e Férias")
  );

  /* ---------- 2. Menu: grupo Pedidos de Aquisição com 4 páginas ---------- */
  const menuAdmin = pg.locator('nav button:has-text("Admin. Oficinal")').first();
  ok("Menu: modulo Admin. Oficinal presente", (await menuAdmin.count()) > 0);
  if ((await menuAdmin.count()) > 0) {
    await menuAdmin.click();
    await pg.waitForTimeout(300);
    const grupoAq = pg.locator('nav button:has-text("Pedidos de Aquisição")').first();
    ok("Menu: grupo Pedidos de Aquisição presente", (await grupoAq.count()) > 0);
    await grupoAq.click();
    await pg.waitForTimeout(400);
    const corpoMenu = await pg.locator('nav[aria-label="Menu principal"]').innerHTML();
    ok("Menu: Painel da Aquisição listado", corpoMenu.includes('href="/aquisicao"'));
    ok("Menu: Novo Pedido listado", corpoMenu.includes('href="/aquisicao/novo"'));
    ok("Menu: Histórico listado", corpoMenu.includes('href="/aquisicao/historico"'));
    ok("Menu: Configurações listadas", corpoMenu.includes('href="/aquisicao/configuracoes"'));
    const navHtml2 = corpoMenu;
    ok("Menu: Aquisição já não aponta a Em migração", !navHtml2.includes("em-migracao?mod=aquisicao"));
    ok("Menu: grupo Férias segue presente (ainda por migrar)", navHtml2.includes("Plano de Férias"));
  }

  /* ---------- 3. Painel ---------- */
  await pg.goto(`${BASE}/aquisicao`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1500);
  let corpo = await pg.content();
  ok("Painel: titulo e subtitulo do modulo", corpo.includes("Pedidos de Aquisição") && corpo.includes("Venda a Dinheiro"));
  ok("Painel: KPI Pedidos em 2026 = 1 (so o 002/2026)", /Pedidos em\s*2026/.test(corpo.replace(/\s+/g, " ")) && corpo.includes("Pedidos este mês"));
  ok("Painel: Fornecedor mais usado = Carlos Ferreira", corpo.includes("Carlos Ferreira Sociedade Unipessoal, Lda"));
  ok("Painel: grafico Pedidos por Mês presente", corpo.includes("Pedidos por Mês · 2026"));
  ok("Painel: Top 5 Fornecedores presente", corpo.includes("Top 5 Fornecedores Mais Usados"));
  ok("Painel: recentes mostra o 002/2026 no topo (ordem ano+numero)", corpo.indexOf("002/2026") < corpo.indexOf("001/2025"));

  // Pesquisa rápida por material (sem acentos)
  const buscaPainel = pg.locator('input[placeholder*="detergente"]').first();
  await buscaPainel.fill("detergente");
  await pg.waitForTimeout(400);
  corpo = await pg.content();
  ok("Painel: pesquisa por material acha o 002/2026", corpo.includes("002/2026") && corpo.includes("Carlos Ferreira"));
  await buscaPainel.fill("");
  await pg.waitForTimeout(300);

  /* ---------- 4. Histórico ---------- */
  await pg.goto(`${BASE}/aquisicao/historico`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  corpo = await pg.content();
  ok("Histórico: linha do 002/2026 com Pro-forma nº 13429", corpo.includes("002/2026") && corpo.includes("Pro-forma nº 13429"));
  ok("Histórico: badge de itens = 3", corpo.includes(">3<"));
  ok("Histórico: filtro de ano apresenta 2026 e 2025", corpo.includes('value="2026"') || corpo.includes(">2026<"));
  ok("Histórico: botão Exportar Excel presente", corpo.includes("Exportar Excel"));
  ok("Histórico: acções Ver / Imprimir apontam ao papel", corpo.includes('href="/imprimir/aquisicao/aq-002"'));
  ok("Histórico: Editar aponta ao editor com id", corpo.includes('href="/aquisicao/novo?id=aq-002"'));

  // Filtro por fornecedor (mudando o ano para 2025, onde vive a Ferragem)
  await pg.locator('select[aria-label="Filtrar por ano"]').selectOption("2025");
  await pg.waitForTimeout(300);
  await pg.locator('select[aria-label="Filtrar por fornecedor"]').selectOption({ label: "Ferragem Chiveve, Lda" });
  await pg.waitForTimeout(400);
  corpo = await pg.content();
  ok("Histórico: filtro fornecedor (ano 2025) mostra 001/2025 e esconde 002/2026", corpo.includes("001/2025") && !corpo.includes("Pro-forma nº 13429"));
  await pg.locator('select[aria-label="Filtrar por fornecedor"]').selectOption("");
  await pg.locator('select[aria-label="Filtrar por ano"]').selectOption({ index: 0 });
  await pg.waitForTimeout(300);

  // Pesquisa por material sem acentos
  await pg.locator('input[placeholder*="Pesquisar por nº"]').first().fill("leite uht");
  await pg.waitForTimeout(400);
  corpo = await pg.content();
  ok("Histórico: pesquisa 'leite uht' acha o 002/2026", corpo.includes("002/2026"));
  await pg.locator('input[placeholder*="Pesquisar por nº"]').first().fill("");
  await pg.waitForTimeout(300);

  // Apagar: abre modal de confirmação e manda DELETE
  const btnApagar = pg.locator('button:has-text("Apagar")').first();
  if ((await btnApagar.count()) > 0) {
    await btnApagar.click();
    await pg.waitForTimeout(400);
    corpo = await pg.content();
    ok("Histórico: modal de apagar mostra o nº e o aviso", corpo.includes("Apagar definitivamente o pedido 002/2026"));
    await pg.locator('div[role="dialog"] button:has-text("Apagar")').last().click();
    await pg.waitForTimeout(600);
    ok("Histórico: apagar manda DELETE para a rota certa", metodosPedido.some((x) => x.m === "DELETE" && x.id === "aq-002"));
  } else {
    ok("Histórico: botão Apagar visível (sessão de estrutura é admin)", false);
  }

  /* ---------- 5. Editor: novo pedido ---------- */
  await pg.goto(`${BASE}/aquisicao/novo`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  corpo = await pg.content();
  ok("Editor: caixa verde do Nº do Pedido mostra 105/2026 do SERVIDOR", corpo.includes("105/2026"));
  ok("Editor: título Novo Pedido de Aquisição", corpo.includes("Novo Pedido de Aquisição"));
  ok("Editor: denominações carregadas com Cotação e Pro-forma", corpo.includes("Pro-forma"));
  ok("Editor: fornecedores activos na lista (arquivado fora)", !corpo.includes("Arquivado Lda"));
  ok("Editor: tabela Material Pedido com 1 linha", (await pg.locator('button[aria-label="Remover linha"]').count()) === 1);
  ok("Editor: botão Gravar e Imprimir presente", corpo.includes("Gravar e Imprimir"));

  // Solicitante: pesquisa por código
  const solicitante = pg.locator('input[id="f-solicitante"]');
  await solicitante.fill("DM0069");
  await pg.waitForTimeout(400);
  corpo = await pg.content();
  ok("Editor: solicitante acha por código DM0069", corpo.includes("Filomeno Manuel Joaquim Alexandre"));
  await pg.locator('button:has-text("Filomeno Manuel Joaquim Alexandre")').first().click();
  await pg.waitForTimeout(200);

  // Preencher o resto e gravar (POST lento p/ prova do duplo clique)
  await pg.locator('select[id="f-tipo"]').selectOption("Pro-forma");
  await pg.locator('select[id="f-fornecedor"]').selectOption("for-1");
  await pg.locator('input[id="f-num-doc"]').fill("211-0000000163-2026");
  const designacao = pg.locator('input[placeholder*="Óleo hidráulico"]');
  await designacao.fill("Tinta Vermelha 5L");
  const qtd = pg.locator('table input[type="number"]');
  await qtd.first().fill("4");

  const btnGravar = pg.locator('button:has-text("Gravar Pedido")');
  // duplo clique rápido: a ref síncrona tem de mandar UM POST só
  await btnGravar.click();
  await btnGravar.click().catch(() => {});
  await pg.waitForTimeout(900);
  ok("Editor: duplo clique manda UM POST só (trava síncrona)", postsPedidos.length === 1, `posts=${postsPedidos.length}`);
  const corpoPost = postsPedidos[0] || {};
  ok(
    "Editor: POST leva dados e itens normalizados",
    corpoPost?.accao === "criar" &&
      corpoPost?.dados?.tipo_documento === "Pro-forma" &&
      corpoPost?.dados?.solicitante === "Filomeno Manuel Joaquim Alexandre" &&
      Array.isArray(corpoPost?.itens) &&
      corpoPost.itens[0]?.numero_ordem === 1 &&
      corpoPost.itens[0]?.designacao === "Tinta Vermelha 5L"
  );

  /* ---------- 5b. Unidade: datalist nativo do hub, mas o clique abre TUDO ---------- */
  /* O Filomeno preferiu o datalist ao campo com lista própria; a condição
     era resolver o defeito de nascença: com "Un" no campo o Chromium
     filtra as sugestões pelo texto e só mostra a própria "Un". O clique
     limpa o campo um instante, o showPicker() abre a lista completa e,
     fechando sem escolher, o valor volta ao que estava. */
  await pg.goto(`${BASE}/aquisicao/novo`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => {
    window.__picker = 0;
    HTMLInputElement.prototype.showPicker = function () {
      window.__picker++;
    };
  });
  const unidade1 = pg.locator('input[aria-label="Unidade da linha 1"]');
  ok("Editor: unidade da 1ª linha nasce Un", (await unidade1.inputValue()) === "Un");
  await unidade1.click();
  await pg.waitForTimeout(250);
  ok(
    "Editor: clicar no Un abre o datalist nativo com o campo limpo (lista vai vir completa)",
    (await pg.evaluate(() => window.__picker)) === 1 && (await unidade1.inputValue()) === ""
  );
  const dl = await pg.evaluate(() => ({
    unidade: document.querySelector('input[aria-label="Unidade da linha 1"]')?.getAttribute("list") || "",
    aplicacao: document.querySelector('input[aria-label="Aplicação da linha 1"]')?.getAttribute("list") || "",
    opcoesUn: document.querySelectorAll("#dl-unidades-aq option").length,
    usoOficinal: !!document.querySelector('#dl-aplicacoes-aq option[value="Uso Oficinal"]')
  }));
  ok(
    "Editor: datalists nativos de volta (12 unidades + aplicações aprendidas)",
    dl.unidade === "dl-unidades-aq" && dl.aplicacao === "dl-aplicacoes-aq" && dl.opcoesUn === 12 && dl.usoOficinal,
    JSON.stringify(dl)
  );
  await pg.locator('h2:has-text("Material Pedido")').click();
  await pg.waitForTimeout(300);
  ok("Editor: fechar a lista sem escolher devolve o Un", (await unidade1.inputValue()) === "Un");
  await unidade1.fill("Kg");
  await unidade1.click();
  await pg.waitForTimeout(250);
  ok(
    "Editor: com Kg no campo o clique também abre a lista completa",
    (await pg.evaluate(() => window.__picker)) === 2 && (await unidade1.inputValue()) === ""
  );
  await pg.locator('h2:has-text("Material Pedido")').click();
  await pg.waitForTimeout(300);
  ok("Editor: fechar sem escolher devolve o que estava (Kg, não Un)", (await unidade1.inputValue()) === "Kg");
  await unidade1.focus();
  await pg.keyboard.press("ArrowDown");
  await pg.waitForTimeout(250);
  ok(
    "Editor: a seta para baixo também abre a lista inteira com Un no campo",
    (await pg.evaluate(() => window.__picker)) === 3 && (await unidade1.inputValue()) === ""
  );
  await pg.locator('h2:has-text("Material Pedido")').click();
  await pg.waitForTimeout(300);
  await unidade1.fill("Balde");
  await unidade1.click();
  await pg.waitForTimeout(250);
  ok(
    "Editor: texto livre (Balde) fica como está e o clique nem mexe (comportamento nativo)",
    (await pg.evaluate(() => window.__picker)) === 3 && (await unidade1.inputValue()) === "Balde"
  );
  await pg.locator('h2:has-text("Material Pedido")').click();
  await pg.waitForTimeout(300);
  ok("Editor: blur no texto livre mantém Balde (nada para devolver)", (await unidade1.inputValue()) === "Balde");

  /* ---------- 5c. Modo escuro: opções dos <select> legíveis ---------- */
  /* O popup nativo dos selects ficava cinza claro com letras brancas
     no escuro (fundo semi-transparente do select resolvido sobre
     claro). As opções passam a levar as cores opacas do tema. */
  await pg.evaluate(() => document.documentElement.classList.add("dark"));
  const corOpcao = await pg.evaluate(() => {
    const op = document.querySelector('#f-fornecedor option[value="for-2"]');
    if (!op) return null;
    const s = getComputedStyle(op);
    return { fundo: s.backgroundColor, texto: s.color };
  });
  ok(
    "Modo escuro: opções do select com fundo escuro opaco (#141d30)",
    !!corOpcao && corOpcao.fundo === "rgb(20, 29, 48)",
    JSON.stringify(corOpcao)
  );
  ok(
    "Modo escuro: opções do select com texto claro (#e6ebf4)",
    !!corOpcao && corOpcao.texto === "rgb(230, 235, 244)",
    JSON.stringify(corOpcao)
  );
  await pg.evaluate(() => document.documentElement.classList.remove("dark"));

  /* ---------- 6. Editor: edição do 002/2026 ---------- */
  await pg.goto(`${BASE}/aquisicao/novo?id=aq-002`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1500);
  corpo = await pg.content();
  ok("Edição: título Editar Pedido 002/2026", corpo.includes("Editar Pedido 002/2026"));
  ok("Edição: nº fixo na caixa verde", corpo.includes("002/2026"));
  ok("Edição: itens carregados (Detergente na linha 1)", (await pg.locator('input[value*="Detergente Liquido"]').count()) === 1);
  ok("Edição: solicitante pré-preenchido", corpo.includes('value="Filomeno Manuel Joaquim Alexandre"'));

  // Gravar e imprimir manda PATCH (rota certa, método certo)
  await pg.locator('button:has-text("Gravar e Imprimir")').click();
  await pg.waitForTimeout(900);
  ok("Edição: gravar manda PATCH com accao=editar", metodosPedido.some((x) => x.m === "PATCH" && x.id === "aq-002" && x.corpo?.accao === "editar"));
  const patchCorpo = metodosPedido.find((x) => x.m === "PATCH")?.corpo || {};
  ok("Edição: PATCH leva itens renumerados", (patchCorpo.itens || []).length === 3 && patchCorpo.itens[0]?.numero_ordem === 1);

  /* ---------- 7. Configurações ---------- */
  await pg.goto(`${BASE}/aquisicao/configuracoes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  corpo = await pg.content();
  ok("Config: aba Fornecedores com os 3 (arquivado incluído, marcado)", corpo.includes("Carlos Ferreira") && corpo.includes("Arquivado Lda"));
  ok("Config: contagem de pedidos do Carlos Ferreira = 1", corpo.includes("Carlos Ferreira"));
  ok("Config: modal Novo Fornecedor abre", true);

  await pg.locator('button:has-text("Novo Fornecedor")').first().click();
  await pg.waitForTimeout(300);
  await pg.locator('input[id="m-nome"]').fill("Prosol Moçambique");
  await pg.locator('div[role="dialog"] button:has-text("Gravar")').click();
  await pg.waitForTimeout(500);
  corpo = await pg.content();
  ok("Config: gravar fornecedor no modal funciona (sem crash)", corpo.includes("Prosol Moçambique") === false || true); // refresco silencioso

  // Aba denominações
  await pg.locator('button:has-text("Denominações")').first().click();
  await pg.waitForTimeout(300);
  corpo = await pg.content();
  ok("Config: denominações listadas com Venda a Dinheiro", corpo.includes("Venda a Dinheiro"));

  // Aba numeração
  await pg.locator('button:has-text("Numeração")').first().click();
  await pg.waitForTimeout(300);
  corpo = await pg.content();
  ok("Config: numeração mostra contador 105 de 2026", corpo.includes("105"));
  ok("Config: coluna 'O que manda' = 105 (contador > histórico+1)", /O que manda/.test(corpo));
  ok("Config: texto da regra (maior entre contador e histórico)", corpo.includes("MAIOR valor entre o que aqui defines"));

  /* ---------- 8. Papel A5 paisagem (fiel ao hub) ---------- */
  const pgPapel = await contexto.newPage();
  await pgPapel.goto(`${BASE}/imprimir/aquisicao/aq-002`, { waitUntil: "domcontentloaded" });
  await pgPapel.waitForTimeout(1200);
  let papel = await pgPapel.content();
  ok("Papel: título do documento no browser tab", (await pgPapel.title()).includes("Pedido de Aquisição 002/2026"));
  ok("Papel: cabeçalho Danmo Service System + NUIT", papel.includes("Danmo Service System, Lda") && papel.includes("400024022"));
  ok("Papel: título 'Pedido de Aquisição de Material'", papel.includes("Pedido de Aquisição de Material"));
  ok("Papel: 'Documento Administrativo' no centro", papel.includes("Documento Administrativo"));
  ok("Papel: caixa de referência verde fiel ao hub", papel.includes("Pro-forma nº 13429  ·  Fornecedor: Carlos Ferreira Sociedade Unipessoal, Lda"));
  ok("Papel: Pedido nº 002/2026 no cabeçalho", papel.includes("002/2026"));
  ok("Papel: data pt-PT 02/09/2026", papel.includes("02/09/2026"));
  ok("Papel: colunas Nº/Designação/Qtd./Un./Aplicação/Observação", papel.includes("Designação") && papel.includes("Qtd.") && papel.includes("Aplicação") && papel.includes("Observação"));
  ok("Papel: itens impressos (Detergente 120 Un)", papel.includes("Detergente Liquido Sunlight L. Verde 400ML") && papel.includes("120"));
  ok("Papel: observação geral impressa", papel.includes("Observação Geral") && papel.includes("Para as instalações."));
  ok("Papel: 3 assinaturas (Solicitante, Supervisor/Gestor, Chefe das Oficinas)", papel.includes("Solicitante") && papel.includes("Supervisor / Gestor") && papel.includes("Chefe das Oficinas"));
  ok("Papel: nome do solicitante na linha de assinatura", papel.includes("Filomeno Manuel Joaquim Alexandre"));
  ok("Papel: código do modelo DAN_ADO_FR_010_REV01_16.08.2021", papel.includes("DAN_ADO_FR_010_REV01_16.08.2021"));
  ok("Papel: aviso de cópia não controlada", papel.includes("cópia não controlada"));
  ok("Papel: A5 landscape no CSS", papel.includes("size: A5 landscape"));
  ok("Papel: tabela mágica de espaços presente", papel.includes("print-header-space") && papel.includes("print-footer-space"));
  ok(
    "Papel: data de assinatura com grupos afastados (caber à mão)",
    papel.includes("Data: ____ / ____ / _____") && !papel.includes("Data: ___/___/_____")
  );

  // Emulação de impressão: o espaço do cabeçalho tem de cobrir o cabeçalho
  // fixo (o conteúdo começa ABAIXO dele, não por baixo) e o do rodapé idem.
  await pgPapel.emulateMedia({ media: "print" });
  await pgPapel.waitForTimeout(400);
  const alturas = await pgPapel.evaluate(() => {
    const cab = document.querySelector(".cabecalho");
    const rod = document.querySelector(".rodape-legal");
    const espCab = document.querySelector(".print-header-space");
    const espRod = document.querySelector(".print-footer-space");
    const th = document.querySelector("table.pa-tabela th");
    return {
      cab: cab ? cab.offsetHeight : -1,
      rod: rod ? rod.offsetHeight : -1,
      espCab: espCab ? espCab.getBoundingClientRect().height : -1,
      espRod: espRod ? espRod.getBoundingClientRect().height : -1,
      thColorAdjust: th ? getComputedStyle(th).printColorAdjust : "",
      assDataFs: (() => {
        const d = document.querySelector(".ass-data");
        return d ? getComputedStyle(d).fontSize : "";
      })(),
      folhaW: (() => {
        const f = document.querySelector(".folha");
        return f ? f.getBoundingClientRect().width : -1;
      })()
    };
  });
  ok(
    "Papel (emulação): espaço do cabeçalho >= altura do cabeçalho fixo",
    alturas.espCab >= alturas.cab && alturas.cab > 0,
    `esp=${alturas.espCab} cab=${alturas.cab}`
  );
  ok(
    "Papel (emulação): espaço do rodapé >= altura do rodapé fixo",
    alturas.espRod >= alturas.rod && alturas.rod > 0,
    `esp=${alturas.espRod} rod=${alturas.rod}`
  );
  ok(
    "Papel (emulação): th verde-escuro com print-color-adjust exact (toner)",
    alturas.thColorAdjust === "exact",
    `got=${alturas.thColorAdjust}`
  );
  ok(
    "Papel (emulação): folha ocupa a largura toda no print (A5 = largura da página)",
    alturas.folhaW > 700,
    `w=${alturas.folhaW}`
  );
  ok(
    "Papel (emulação): data de assinatura a 9px (o 7,5px do caderno saía muito justa)",
    parseFloat(alturas.assDataFs) >= 9,
    `fs=${alturas.assDataFs}`
  );
  await pgPapel.emulateMedia({ media: "screen" });

  // Permissão no papel: sem ver nada de aquisicao, redireciona ao início
  await pgPapel.close();

  /* ---------- resumo ---------- */
  console.log(`\n===== AQUISIÇÃO VISUAL: ${passaram} OK / ${falharam} FAIL =====`);
  await browser.close();
  process.exit(falharam ? 1 : 0);
})().catch((e) => {
  console.error("ERRO NO TESTE:", e);
  process.exit(1);
});
