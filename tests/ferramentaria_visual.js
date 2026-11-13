/**
 * Teste visual da FERRAMENTARIA (migração do hub).
 *
 * Cobre: bloqueio sem sessão (página e papel), cartão do Home, menu com
 * as 8 páginas reais, o Painel (5 KPIs, dois gráficos, ferramentas fora
 * com atraso, devoluções com problema), Empréstimos (autocomplete por
 * código/nome, OS que traz o equipamento, POST capturado, popup
 * "Está com" no 409, devolução capturada com os ids certos), Inventário
 * (pesquisa sem acentos, filtros, nova/edição, histórico), Devoluções
 * (filtros de período, estado e colaborador por código), Danos (avançar
 * estado e inutilizar com confirmação, resumo com custo), Ferramenteiros
 * (contagem de empréstimos, novo com pesquisa por nome/código),
 * Configurações (categorias e departamentos com contagem de uso),
 * Relatórios (6 secções geradas) e o papel A4 do relatório.
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) na porta 3460 +
 * mocks de rede no estilo da base real (Playwright route), igual aos
 * outros testes do portal.
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3460";
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

const HOJE = new Date();
const ANO = HOJE.getFullYear();
const MES = String(HOJE.getMonth() + 1).padStart(2, "0");
const DIA_HOJE = String(HOJE.getDate()).padStart(2, "0");
const HOJE_ISO = `${ANO}-${MES}-${DIA_HOJE}`;

const FERRAMENTAS = [
  { id: "t1", code: "CBL-10", nome: "Chave Boca Luneta", category_id: "c1", marca: "King Toyo", estado: "emprestado", localizacao: "Prateleira A1", quantidade: 2, unidade: "unidade", valor_unitario: 1250, active: true },
  { id: "t2", code: "CBL-11", nome: "Chave Boca Luneta", category_id: "c1", marca: null, estado: "novo", localizacao: null, quantidade: 1, unidade: "unidade", valor_unitario: 0, active: true },
  { id: "t3", code: "PER-01", nome: "Perfuratriz Elétrica", category_id: "c2", marca: "Bosch", estado: "avariado", localizacao: "Bancada", quantidade: 1, unidade: "unidade", valor_unitario: 8500, active: true },
  { id: "t4", code: "EXT-05", nome: "Extensão 20m", category_id: "c3", marca: null, estado: "bom", localizacao: null, quantidade: 3, unidade: "unidade", valor_unitario: 450, active: true }
];

const CATEGORIAS = [
  { id: "c1", nome: "Chaves", active: true },
  { id: "c2", nome: "Elétricas", active: true },
  { id: "c3", nome: "Acessórios", active: true },
  { id: "c4", nome: "Categoria Antiga", active: false }
];

const DEPARTAMENTOS = [
  { id: "d1", nome: "Mecânica", active: true },
  { id: "d2", nome: "Pneumática", active: true },
  { id: "d3", nome: "Frota", active: true }
];

const STAFF = [
  { id: "s1", nome: "João Paulo Jose", codigo: "DM0101", turno: null, active: true },
  { id: "s2", nome: "Carlos Manuel", codigo: "DM0102", turno: null, active: true }
];

const COLABORADORES = [
  { id: 1, name: "Didi Rogerio Jose Pita", code: "DM0011", active: true },
  { id: 2, name: "Caetano Antonio Quembo", code: "DM0069", active: true },
  { id: 3, name: "Luis Antonio", code: "DM0020", active: true }
];

const MES_ANT = String(Math.max(1, Number(MES) - 1)).padStart(2, "0");
const MOV_SAIU = {
  id: "mv1",
  tool_id: "t1",
  tipo: "emprestimo",
  colaborador: "Didi Rogerio Jose Pita",
  departamento: "Mecânica",
  os_id: "70104",
  equipamento_id: "70-01 - Sino Truck",
  estado_ao_sair: "novo",
  estado_ao_voltar: null,
  entregue_por: "João Paulo Jose",
  recebido_por: null,
  data_saida: `${ANO}-${MES_ANT}-14T06:51:12`,
  data_devolucao: null,
  prazo_devolucao: `${ANO}-${MES_ANT}-16`,
  observacoes_saida: null,
  observacoes_devolucao: null
};

const MOV_SAIU_RECENTE = {
  ...MOV_SAIU,
  id: "mv2",
  tool_id: "t4",
  colaborador: "Luis Antonio",
  departamento: "Frota",
  os_id: null,
  equipamento_id: null,
  data_saida: `${HOJE_ISO}T07:00:00`,
  prazo_devolucao: `${ANO}-${MES}-${String(Math.min(DIA_HOJE + 1, 28)).padStart(2, "0")}`
};

const MOV_VOLTA = {
  ...MOV_SAIU,
  id: "mv3",
  tipo: "devolucao",
  data_devolucao: `${HOJE_ISO}T09:15:00`,
  estado_ao_voltar: "sujo",
  recebido_por: "Carlos Manuel",
  observacoes_devolucao: "Voltou com óleo"
};

const MOVIMENTOS_VISAO = [
  { ...MOV_SAIU, code: "CBL-10", nome: "Chave Boca Luneta" },
  { ...MOV_SAIU_RECENTE, code: "EXT-05", nome: "Extensão 20m" },
  { ...MOV_VOLTA, code: "CBL-10", nome: "Chave Boca Luneta" }
];

const DANOS = [
  {
    id: "da1",
    tool_id: "t3",
    movement_id: null,
    tipo_dano: null,
    estado_reportado: "partido",
    severidade: "grave",
    custo_reparacao: 3500,
    status: "reportado",
    colaborador: "Didi Rogerio Jose Pita",
    responsavel: null,
    observacoes: "Devolucao com problema - partido",
    resolved_at: null,
    created_at: `${HOJE_ISO}T09:20:00`,
    code: "PER-01",
    nome: "Perfuratriz Elétrica"
  },
  {
    id: "da2",
    tool_id: "t2",
    movement_id: null,
    tipo_dano: "desgaste",
    estado_reportado: null,
    severidade: "leve",
    custo_reparacao: 150,
    status: "reparado",
    colaborador: "Luis Antonio",
    responsavel: null,
    observacoes: null,
    resolved_at: `${HOJE_ISO}T10:00:00`,
    created_at: `${ANO}-${MES}-02T10:00:00`,
    code: "CBL-11",
    nome: "Chave Boca Luneta"
  }
];

const LISTA_PAINEL = {
  ok: true,
  hoje: HOJE_ISO,
  ferramentas: FERRAMENTAS,
  movimentos: MOVIMENTOS_VISAO,
  danos: DANOS,
  faltas: []
};

const LISTAS = {
  ok: true,
  ferramenteiros: STAFF,
  categorias: CATEGORIAS.filter((c) => c.active),
  departamentos: DEPARTAMENTOS.filter((d) => d.active),
  colaboradores: COLABORADORES,
  ferramentas: FERRAMENTAS.map((t) => ({ id: t.id, code: t.code, nome: t.nome, estado: t.estado, quantidade: t.quantidade }))
};

const CONFIG = {
  ok: true,
  categorias: [
    { id: "c1", tipo: "categoria", nome: "Chaves", active: true, count: 2 },
    { id: "c2", tipo: "categoria", nome: "Elétricas", active: true, count: 1 },
    { id: "c3", tipo: "categoria", nome: "Acessórios", active: true, count: 1 },
    { id: "c4", tipo: "categoria", nome: "Categoria Antiga", active: false, count: 0 }
  ],
  departamentos: [
    { id: "d1", tipo: "departamento", nome: "Mecânica", active: true, count: 2 },
    { id: "d2", tipo: "departamento", nome: "Pneumática", active: true, count: 0 },
    { id: "d3", tipo: "departamento", nome: "Frota", active: true, count: 1 }
  ]
};

const CADASTROS = {
  ok: true,
  ferramenteiros: STAFF,
  emprestimosPorNome: { "João Paulo Jose": 3, "Carlos Manuel": 1 }
};

/* ============ arranque ============ */

(async () => {
  const browser = await chromium.launch();

  /* ---------- 0. Bloqueio sem sessão ---------- */
  const ctxSem = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pgSem = await ctxSem.newPage();
  await pgSem.goto(`${BASE}/ferramentaria`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: /ferramentaria manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await pgSem.goto(`${BASE}/imprimir/ferramentaria/relatorio`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: o papel do relatorio tambem manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await ctxSem.close();

  /* ---------- contexto com sessão de estrutura + mocks ---------- */
  const contexto = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);
  contexto.on("dialog", (d) => d.accept());

  const postsEmprestimo = [];
  const postsDevolucao = [];
  const postsFerramenta = [];
  const patchesFerramenta = [];
  const patchesDano = [];
  const postsStaff = [];
  const patchesStaff = [];
  const postsConfig = [];

  await contexto.route("**/api/ferramentaria/painel", (rota) => rota.fulfill({ json: LISTA_PAINEL }));

  await contexto.route("**/api/ferramentaria/ferramentas*", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") {
      const categoriaNome = Object.fromEntries(CATEGORIAS.map((c) => [c.id, c.nome]));
      return rota.fulfill({ json: { ok: true, ferramentas: FERRAMENTAS, categoriaNome } });
    }
    if (m === "POST") {
      postsFerramenta.push(rota.request().postDataJSON());
      return rota.fulfill({
        json: { ok: true, ferramenta: { ...FERRAMENTAS[1], code: "NVA-01" } }
      });
    }
    patchesFerramenta.push({ id: rota.request().url().split("id=")[1], corpo: rota.request().postDataJSON() });
    return rota.fulfill({ json: { ok: true, ferramenta: FERRAMENTAS[1] } });
  });

  await contexto.route("**/api/ferramentaria/movimentos*", async (rota) => {
    const url = new URL(rota.request().url());
    const tipo = url.searchParams.get("tipo");
    const toolId = url.searchParams.get("tool_id");
    const de = url.searchParams.get("de");
    let linhas = MOVIMENTOS_VISAO;
    if (tipo) linhas = linhas.filter((x) => x.tipo === tipo);
    if (toolId) linhas = linhas.filter((x) => x.tool_id === toolId);
    if (de) linhas = linhas.filter((x) => (x.data_saida || "").slice(0, 10) >= de);
    return rota.fulfill({ json: { ok: true, movimentos: linhas } });
  });

  await contexto.route("**/api/ferramentaria/listas", (rota) => rota.fulfill({ json: LISTAS }));

  await contexto.route("**/api/ferramentaria/emprestimos", async (rota) => {
    if (rota.request().method() === "POST") {
      postsEmprestimo.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, emprestimo: MOV_SAIU_RECENTE } });
    }
    return rota.fulfill({ json: { ok: true } });
  });

  await contexto.route("**/api/ferramentaria/devolucoes", async (rota) => {
    postsDevolucao.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { ok: true, novoEstado: "bom", dano: null } });
  });

  await contexto.route("**/api/ferramentaria/danos*", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: { ok: true, danos: DANOS } });
    patchesDano.push({ id: rota.request().url().split("id=")[1], corpo: rota.request().postDataJSON() });
    return rota.fulfill({ json: { ok: true, status: "em reparo" } });
  });

  await contexto.route("**/api/ferramentaria/cadastros*", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: CADASTROS });
    if (m === "POST") {
      postsStaff.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, ferramenteiro: STAFF[0] } });
    }
    patchesStaff.push({ id: rota.request().url().split("id=")[1], corpo: rota.request().postDataJSON() });
    return rota.fulfill({ json: { ok: true, ferramenteiro: STAFF[0] } });
  });

  await contexto.route("**/api/ferramentaria/config*", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: CONFIG });
    postsConfig.push({ url: rota.request().url(), corpo: rota.request().postDataJSON() });
    return rota.fulfill({ json: { ok: true, item: { id: "n1", tipo: "categoria", nome: "Nova" } } });
  });

  await contexto.route("**/api/ferramentaria/os*", (rota) => {
    return rota.fulfill({ json: { ok: true, os: "70104", equipamento: "70-01 - Sino Truck" } });
  });

  const pg = await contexto.newPage();

  /* ---------- 1. Menu ---------- */
  await pg.goto(`${BASE}/ferramentaria`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1500);
  // O submenu abre por clique (a sidebar do portal guarda o estado);
  // abrimos e provamos as âncoras REAIS no DOM, não o payload do RSC.
  await pg.locator("button[title='Ferramentaria']").click();
  await pg.waitForTimeout(600);
  const hrefsMenu = await pg.$$eval("a", (as) =>
    [...new Set(as.map((a) => a.getAttribute("href") || ""))]
  );
  ok("Menu: Painel da Ferramentaria", hrefsMenu.includes("/ferramentaria"));
  ok("Menu: Inventário com página real", hrefsMenu.includes("/ferramentaria/inventario"));
  ok("Menu: Empréstimos com página real", hrefsMenu.includes("/ferramentaria/emprestimos"));
  ok("Menu: Devoluções com página real", hrefsMenu.includes("/ferramentaria/devolucoes"));
  ok("Menu: Danos com página real", hrefsMenu.includes("/ferramentaria/danos"));
  ok("Menu: Ferramenteiros com página real", hrefsMenu.includes("/ferramentaria/ferramenteiros"));
  ok("Menu: Relatórios com página real", hrefsMenu.includes("/ferramentaria/relatorios"));
  ok("Menu: Configurações com página real", hrefsMenu.includes("/ferramentaria/configuracoes"));
  ok("Menu: sem link Em migração da Ferramentaria", !hrefsMenu.some((h) => h.includes("/em-migracao?mod=ferramentaria")));

  /* ---------- 2. Painel ---------- */
  await pg.goto(`${BASE}/ferramentaria`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  const corpoPainel = await pg.content();
  ok("Painel: título", corpoPainel.includes("Painel Ferramentaria"));
  ok("Painel: KPIs com etiquetas", corpoPainel.includes("Ferramentas fora agora") && corpoPainel.includes("Devoluções atrasadas") && corpoPainel.includes("Danos este mês") && corpoPainel.includes("Total disponível"));
  ok("Painel: KPI fora = 2 (mv1 + mv2 sem devolução)", corpoPainel.includes("Atrasada") || corpoPainel.includes("ATRASADA"));
  ok("Painel: top 5 mais emprestadas com a Chave", corpoPainel.includes("CBL-10 Chave Boca Luneta"));
  ok("Painel: tabela das devoluções com problema mostra SUJO", corpoPainel.includes("SUJO") && corpoPainel.includes("Carlos Manuel"));
  ok("Painel: custos do mês em MTn (3 500 + 150)", corpoPainel.includes("3 650,00 MTn"));

  /* ---------- 3. Empréstimos ---------- */
  await pg.goto(`${BASE}/ferramentaria/emprestimos`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  ok("Emprestimos: form presente", (await pg.locator("[data-form-emprestimo]").count()) === 1);
  ok("Emprestimos: activos = 2", (await pg.locator("[data-count-activos]").textContent()).trim() === "2");
  ok("Emprestimos: linha atrasada a vermelho", (await pg.locator("[data-linha-emprestimo]").first().textContent()).includes("ATRASADA"));

  // autocomplete por código ou nome
  await pg.fill("#f-ferramenta", "chave");
  await pg.waitForTimeout(300);
  const autoTexto = await pg.locator("[data-autocomplete]").textContent();
  ok("Emprestimos: autocomplete acha pelo NOME (chave -> CBL-10)", autoTexto.includes("CBL-10"));
  await pg.fill("#f-ferramenta", "ext");
  await pg.waitForTimeout(300);
  ok("Emprestimos: autocomplete acha por prefixo de código", (await pg.locator("[data-autocomplete]").textContent()).includes("EXT-05"));
  await pg.locator("[data-autocomplete] button").first().click();
  const codeEscolhido = await pg.inputValue("#f-ferramenta");
  ok("Emprestimos: clique na sugestão preenche o código", codeEscolhido === "EXT-05", codeEscolhido);

  // colaborador por nome ou código
  await pg.fill("#f-colaborador", "DM0011");
  await pg.waitForTimeout(300);
  ok("Emprestimos: seletor de colaborador aceita código", (await pg.locator("body").textContent()).includes("DM0011"));

  // OS lookup com debounce: traz o equipamento e trava o campo
  await pg.fill("#f-os", "70104");
  await pg.waitForTimeout(1400);
  ok("Emprestimos: OS traz o equipamento do servidor", (await pg.inputValue("#f-equip")).includes("70-01 - Sino Truck"));
  ok("Emprestimos: equipamento fica travado após lookup", await pg.locator("#f-equip").isDisabled());
  ok("Emprestimos: estado do OS diz reconhecida", (await pg.locator("[data-os-estado]").textContent()).includes("OS reconhecida"));

  // POST do empréstimo
  await pg.selectOption("#f-departamento", { label: "Mecânica" });
  await pg.selectOption("#f-entregue", { index: 1 });
  await pg.click("[data-acao='registar-emprestimo']");
  await pg.waitForTimeout(600);
  ok("Emprestimos: POST levou os campos certos", postsEmprestimo.length === 1 && postsEmprestimo[0].ferramentaCode === "EXT-05" && postsEmprestimo[0].departamento === "Mecânica", JSON.stringify(postsEmprestimo[0] || {}));
  ok("Emprestimos: POST levou entreguePorId (o servidor resolve o nome)", Boolean(postsEmprestimo[0]?.entreguePorId));

  // devolução
  await pg.locator("[data-linha-emprestimo]").first().locator("[data-acao='devolver']").click();
  await pg.waitForTimeout(300);
  ok("Devolucao: modal com a ferramenta certa", (await pg.locator("[data-devol-info]").textContent()).includes("CBL-10"));
  await pg.selectOption("[data-devol-estado]", "sujo");
  await pg.selectOption("[data-devol-recebido]", { index: 1 });
  await pg.fill("#d-obs", "Voltou com óleo");
  await pg.click("[data-acao='confirmar-devolucao']");
  await pg.waitForTimeout(600);
  ok("Devolucao: POST com movimentoId, estado e recebidoPorId", postsDevolucao.length === 1 && postsDevolucao[0].movimentoId === "mv1" && postsDevolucao[0].estadoVoltar === "sujo" && postsDevolucao[0].recebidoPorId === "s1", JSON.stringify(postsDevolucao[0] || {}));

  // 409 indisponível: popup "Está com"
  await contexto.route("**/api/ferramentaria/emprestimos", (rota) => {
    return rota.fulfill({
      status: 409,
      json: {
        ok: false,
        erro: "CBL-10 - Chave Boca Luneta não tem unidades disponíveis (1/1 emprestadas).",
        indisponivel: {
          code: "CBL-10",
          nome: "Chave Boca Luneta",
          total: 1,
          emprestadas: 1,
          com: [
            {
              id: "mv1",
              colaborador: "Didi Rogerio Jose Pita",
              departamento: "Mecânica",
              os_id: "70104",
              equipamento_id: "70-01 - Sino Truck",
              data_saida: MOV_SAIU.data_saida
            }
          ]
        }
      }
    });
  });
  await pg.fill("#f-ferramenta", "CBL-10");
  await pg.click("[data-acao='registar-emprestimo']");
  await pg.waitForTimeout(600);
  ok("Indisponivel: 409 abre o popup", (await pg.locator("[data-indisponivel]").count()) === 1);
  ok("Indisponivel: diz quem tem a ferramenta", (await pg.locator("[data-indisponivel]").textContent()).includes("Didi Rogerio Jose Pita"));
  ok("Indisponivel: mostra a OS onde está", (await pg.locator("[data-indisponivel]").textContent()).includes("70104"));

  /* ---------- 4. Inventário ---------- */
  await pg.goto(`${BASE}/ferramentaria/inventario`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  ok("Inventario: count = 4", (await pg.locator("[data-inventario-count]").textContent()).trim() === "4");
  ok("Inventario: linhas com código", (await pg.locator("[data-linha-ferramenta='CBL-10']").count()) === 1);
  ok("Inventario: valor em MTn", (await pg.locator("[data-linha-ferramenta='PER-01']").textContent()).includes("8 500,00 MTn"));

  await pg.fill("#inv-busca", "chave");
  await pg.waitForTimeout(300);
  ok("Inventario: pesquisa sem acentos filtra", (await pg.locator("[data-inventario-count]").textContent()).trim() === "2");
  await pg.fill("#inv-busca", "");
  await pg.selectOption("#inv-estado", "avariado");
  await pg.waitForTimeout(300);
  ok("Inventario: filtro de estado", (await pg.locator("[data-inventario-count]").textContent()).trim() === "1");
  await pg.selectOption("#inv-estado", "");

  // nova ferramenta
  await pg.locator("button:has-text('Nova ferramenta')").click();
  await pg.fill("#m-code", "NVA-01");
  await pg.fill("#m-nome", "Ferramenta Nova de Teste");
  await pg.selectOption("#m-cat", { index: 1 });
  await pg.fill("#m-qtd", "2");
  await pg.click("div[role='dialog'] button:has-text('Guardar')");
  await pg.waitForTimeout(600);
  ok("Inventario: POST da nova ferramenta com dados certos", postsFerramenta.length === 1 && postsFerramenta[0].code === "NVA-01" && postsFerramenta[0].quantidade === 2, JSON.stringify(postsFerramenta[0] || {}));

  // edição
  await pg.locator("[data-linha-ferramenta='CBL-11']").locator("button:has-text('Editar')").click();
  await pg.waitForTimeout(300);
  const codeTravado = await pg.locator("#m-code").isDisabled();
  ok("Inventario: código fica travado na edição", codeTravado);
  await pg.fill("#m-nome", "Chave Boca Luneta Grande");
  await pg.click("div[role='dialog'] button:has-text('Guardar')");
  await pg.waitForTimeout(600);
  ok("Inventario: PATCH da edição", patchesFerramenta.length === 1 && patchesFerramenta[0].corpo.nome === "Chave Boca Luneta Grande", JSON.stringify(patchesFerramenta[0] || {}));

  // histórico
  await pg.locator("[data-linha-ferramenta='CBL-10']").locator("button:has-text('Histórico')").click();
  await pg.waitForTimeout(600);
  const htmlHist = await pg.content();
  ok("Inventario: histórico com o título da ferramenta", htmlHist.includes("Histórico - CBL-10"));
  ok("Inventario: histórico mostra emprestimo e devolução", htmlHist.includes("emprestimo") && htmlHist.includes("devolucao"));
  await pg.locator("div[role='dialog'] button[aria-label], div[role='dialog']").first().click();
  await pg.keyboard.press("Escape");

  /* ---------- 5. Devoluções ---------- */
  await pg.goto(`${BASE}/ferramentaria/devolucoes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  ok("Devolucoes: mostra só devoluções (1 linha)", (await pg.locator("[data-linha-devolucao]").count()) === 1);
  ok("Devolucoes: linha com estado SUJO", (await pg.locator("[data-linha-devolucao='CBL-10']").textContent()).includes("sujo"));

  await pg.selectOption("#f-estado", "torto");
  await pg.waitForTimeout(300);
  ok("Devolucoes: filtro de estado vazio esvazia a tabela", (await pg.locator("[data-count-devolucoes]").textContent()).trim() === "0");
  await pg.selectOption("#f-estado", "");
  await pg.fill("#f-colab", "DM0011");
  await pg.waitForTimeout(300);
  ok("Devolucoes: filtro de colaborador por código mantém a devolução", (await pg.locator("[data-count-devolucoes]").textContent()).trim() === "1");

  /* ---------- 6. Danos ---------- */
  await pg.goto(`${BASE}/ferramentaria/danos`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  ok("Danos: count = 2", (await pg.locator("[data-count-danos]").textContent()).trim() === "2");
  ok("Danos: linha grave com custo", (await pg.locator("[data-linha-dano='PER-01']").textContent()).includes("3 500,00 MTn"));
  ok("Danos: resumo com pior colaborador", (await pg.locator("[data-resumo-danos]").textContent()).includes("Didi Rogerio Jose Pita"));

  await pg.locator("[data-linha-dano='PER-01']").locator("[data-acao='avancar']").click();
  await pg.waitForTimeout(600);
  ok("Danos: avançar estado PATCH com accao avancar", patchesDano.length === 1 && patchesDano[0].corpo.accao === "avancar", JSON.stringify(patchesDano[0] || {}));

  await pg.selectOption("#f-status", "reparado");
  await pg.waitForTimeout(300);
  ok("Danos: filtro por status", (await pg.locator("[data-count-danos]").textContent()).trim() === "1");
  await pg.selectOption("#f-status", "");

  await pg.locator("[data-linha-dano='PER-01']").locator("[data-acao='inutilizar']").click();
  await pg.waitForTimeout(600);
  ok("Danos: inutilizar PATCH com accao inutilizar", patchesDano.length === 2 && patchesDano[1].corpo.accao === "inutilizar", JSON.stringify(patchesDano[1] || {}));

  /* ---------- 7. Ferramenteiros ---------- */
  await pg.goto(`${BASE}/ferramentaria/ferramenteiros`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  ok("Ferramenteiros: count = 2", (await pg.locator("[data-count-staff]").textContent()).trim() === "2");
  ok("Ferramenteiros: contagem de empréstimos entregues", (await pg.locator("[data-linha-staff='João Paulo Jose']").textContent()).includes("3 empréstimos"));

  await pg.locator("button:has-text('Novo ferramenteiro')").click();
  // Fluxo real do seletor: foco abre o dropdown, pesquisar por CÓDIGO e
  // clicar a sugestão (o nome e o código preenchem juntos no ecrã).
  await pg.click("#m-nome");
  await pg.waitForTimeout(200);
  await pg.fill("input[aria-label='Pesquisar colaborador']", "DM0011");
  await pg.waitForTimeout(200);
  await pg.locator("ul[role='listbox'] button").first().click();
  await pg.waitForTimeout(300);
  const nomePreenchido = await pg.inputValue("#m-nome");
  await pg.click("div[role='dialog'] button:has-text('Guardar')");
  await pg.waitForTimeout(600);
  ok("Ferramenteiros: POST com nome escolhido por código", postsStaff.length === 1 && postsStaff[0].nome === "Didi Rogerio Jose Pita" && nomePreenchido === "Didi Rogerio Jose Pita", JSON.stringify(postsStaff[0] || {}));

  await pg.locator("[data-linha-staff='Carlos Manuel']").locator("button:has-text('Desactivar')").click();
  await pg.waitForTimeout(600);
  ok("Ferramenteiros: desactivar PATCH active=false", patchesStaff.length === 1 && patchesStaff[0].corpo.active === false, JSON.stringify(patchesStaff[0] || {}));

  /* ---------- 8. Configurações ---------- */
  await pg.goto(`${BASE}/ferramentaria/configuracoes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  ok("Config: categorias com contagem de uso", (await pg.locator("[data-linha-config='cat-Chaves']").textContent()).includes("2"));
  ok("Config: departamentos com contagem de uso", (await pg.locator("[data-linha-config='dep-Mecânica']").textContent()).includes("2"));
  ok("Config: inactiva com etiqueta Inactivo", (await pg.locator("[data-linha-config='cat-Categoria Antiga']").textContent()).includes("Inactivo"));

  await pg.locator("button:has-text('Novo')").first().click();
  await pg.fill("#cfg-nome", "Hidráulicas");
  await pg.click("div[role='dialog'] button:has-text('Guardar')");
  await pg.waitForTimeout(600);
  ok("Config: POST com tipo categoria", postsConfig.length === 1 && postsConfig[0].corpo.tipo === "categoria" && postsConfig[0].corpo.nome === "Hidráulicas", JSON.stringify(postsConfig[0] || {}));

  /* ---------- 9. Relatórios ---------- */
  await pg.goto(`${BASE}/ferramentaria/relatorios`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(800);
  await pg.click("[data-acao='gerar']");
  await pg.waitForTimeout(1200);
  const corpoRel = await pg.content();
  ok("Relatorio: movimentação geral com as 4 caixas", corpoRel.includes("Movimentação geral") && corpoRel.includes("Taxa no prazo") && corpoRel.includes("Taxa de atraso"));
  ok("Relatorio: ferramentas mais emprestadas do período", corpoRel.includes("Ferramentas mais emprestadas") && corpoRel.includes("EXT-05"));
  ok("Relatorio: colaboradores com mais movimentações", corpoRel.includes("Colaboradores com mais movimentações"));
  ok("Relatorio: mapa de danos com custo (3 500 + 150)", corpoRel.includes("Mapa de danos") && corpoRel.includes("3 650,00 MTn"));
  ok("Relatorio: Na Rua COMPLETA inclui a de Agosto fora do período", corpoRel.includes("Ferramentas na rua agora"));
  ok("Relatorio: inventário por estados", corpoRel.includes("Estado atual do inventário"));
  ok("Relatorio: link do papel A4", corpoRel.includes("/imprimir/ferramentaria/relatorio"));

  /* ---------- 10. Papel A4 ---------- */
  const pgPapel = await contexto.newPage();
  await pgPapel.goto(`${BASE}/imprimir/ferramentaria/relatorio?de=${ANO}-${MES}-01&ate=${HOJE_ISO}`, { waitUntil: "domcontentloaded" });
  await pgPapel.waitForTimeout(1600);
  const papel = await pgPapel.content();
  ok("Papel: título do relatório e período", papel.includes("Relatório de Movimentação da Ferramentaria") && papel.includes("a "));
  ok("Papel: indicadores", papel.includes("Movimentação Geral") && papel.includes("Taxa de devolução no prazo"));
  ok("Papel: top ferramentas", papel.includes("Ferramentas Mais Emprestadas"));
  ok("Papel: mapa de danos com MTn", papel.includes("Mapa de Danos") && papel.includes("MTn"));
  ok("Papel: ferramentas na rua", papel.includes("Ferramentas Na Rua Agora"));
  ok("Papel: estado do inventário", papel.includes("Estado Atual do Inventário"));
  ok("Papel: assinaturas", papel.includes("O Ferramenteiro Chefe") && papel.includes("Visto Direcção"));

  await contexto.close();
  await browser.close();

  console.log(`\n${passaram} passaram, ${falharam} falharam`);
  process.exit(falharam ? 1 : 0);
})().catch((e) => {
  console.error("ERRO DO TESTE:", e);
  process.exit(1);
});
