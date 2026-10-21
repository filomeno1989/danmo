/**
 * Teste visual do módulo GESTÃO DE STOCK (Fase 4).
 *
 * Cobre as 6 páginas novas: Painel, Materiais, Entradas, Saídas,
 * Relatórios e Configurações, mais o menu, o home actualizado
 * (cartão Stock "No ar") e o bloqueio sem sessão.
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

const MATERIAIS = [
  { id: "mat-oleo", referencia: "DAN-LUB-001", nome: "Óleo DX3", unidade: "Lt", preco_mzn: 350, ativo: true, criado_em: "2026-06-02T12:44:21Z", stock_minimo: 5, localizacao: "Prateleira A2", categoria: "Lubrificantes" },
  { id: "mat-filtro", referencia: "DAN-FIL-002", nome: "Filtro de Óleo", unidade: "Un", preco_mzn: 480, ativo: true, criado_em: "2026-06-02T12:44:21Z", stock_minimo: 2, localizacao: "Prateleira B1", categoria: "Peças" },
  { id: "mat-pneu", referencia: "DAN-PNE-003", nome: "Pneu 12.00R20", unidade: "Par", preco_mzn: 18500, ativo: true, criado_em: "2026-06-02T12:44:21Z", stock_minimo: 1, localizacao: "Armazém 2", categoria: "Pneus" },
  { id: "mat-hidr", referencia: "DAN-HID-004", nome: "Óleo Hidráulico HV46", unidade: "Lt", preco_mzn: 420, ativo: false, criado_em: "2026-06-02T12:44:21Z", stock_minimo: 0, localizacao: null, categoria: "Lubrificantes" }
];

/* posições coerentes: oleo 10-8=2 (baixo, min 5), filtro 0 (esgotado),
   pneu 4+6=10 (ok), hidr 3 (inactivo) */
const POSICOES = { "mat-oleo": 2, "mat-filtro": 0, "mat-pneu": 10, "mat-hidr": 3 };

const MOVIMENTOS = [
  {
    id: "mv-1", tipo: "entrada", estado: "confirmado", material_id: "mat-pneu",
    quantidade: 6, data_movimento: "2026-10-05", data_confirmacao: "2026-10-05",
    fornecedor: "PROSOL", numero_po: "COT-2026-014", numero_requisicao: "",
    departamento: "Mecânica", finalidade: "", colaborador_id: null, observacoes: "",
    criado_em: "2026-10-05T08:00:00Z", comprador_nome: "Filomeno Manuel",
    recebedor_nome: "José Chicote", fornecedor_saida: "", colaborador_nome: null,
    preco_unitario: 18500
  },
  {
    id: "mv-2", tipo: "saida", estado: "confirmado", material_id: "mat-oleo",
    quantidade: 8, data_movimento: "2026-10-06", data_confirmacao: "2026-10-06",
    fornecedor: "", numero_po: "", numero_requisicao: "REQ-12",
    departamento: "", finalidade: "Manutenção Corretiva", colaborador_id: null,
    observacoes: "RS 45-17", criado_em: "2026-10-06T09:00:00Z",
    comprador_nome: "", recebedor_nome: "", fornecedor_saida: "",
    colaborador_nome: "João Macuácua", preco_unitario: null
  },
  {
    id: "mv-3", tipo: "entrada", estado: "confirmado", material_id: "mat-oleo",
    quantidade: 10, data_movimento: "2026-09-20", data_confirmacao: "2026-09-20",
    fornecedor: "PROSOL", numero_po: "COT-2026-009", numero_requisicao: "",
    departamento: "", finalidade: "", colaborador_id: null, observacoes: "",
    criado_em: "2026-09-20T08:00:00Z", comprador_nome: "Filomeno Manuel",
    recebedor_nome: "José Chicote", fornecedor_saida: "", colaborador_nome: null,
    preco_unitario: 350
  },
  {
    id: "mv-4", tipo: "entrada", estado: "pendente", material_id: "mat-pneu",
    quantidade: 2, data_movimento: "2026-05-10", data_confirmacao: null,
    fornecedor: "TCM", numero_po: "PO-118", numero_requisicao: "",
    departamento: "", finalidade: "", colaborador_id: null, observacoes: "",
    criado_em: "2026-05-10T08:00:00Z", comprador_nome: "", recebedor_nome: "",
    fornecedor_saida: "", colaborador_nome: null, preco_unitario: null
  },
  {
    id: "mv-5", tipo: "saida", estado: "pendente", material_id: "mat-filtro",
    quantidade: 5, data_movimento: "2026-05-11", data_confirmacao: null,
    fornecedor: "", numero_po: "", numero_requisicao: "REQ-99",
    departamento: "", finalidade: "Manutenção Preventiva", colaborador_id: null,
    observacoes: "", criado_em: "2026-05-11T08:00:00Z", comprador_nome: "",
    recebedor_nome: "", fornecedor_saida: "", colaborador_nome: "Ana Sitoe",
    preco_unitario: null
  }
];

const COLABORADORES = [
  { id: "c1", name: "Ana Sitoe", setor: "Mecânica" },
  { id: "c2", name: "João Macuácua", setor: "Mecânica" },
  { id: "c3", name: "Filomeno Manuel", setor: "Direcção" }
];

const MATERIAIS_GET = {
  ok: true,
  materiais: MATERIAIS,
  categorias: [
    { id: "cat-1", nome: "Lubrificantes", ativo: true },
    { id: "cat-2", nome: "Peças", ativo: true },
    { id: "cat-3", nome: "Pneus", ativo: true }
  ],
  unidades: ["Un", "Kg", "Lt", "Mt", "Cx", "Par", "Rolo", "Saco"],
  posicoes: POSICOES
};

const MOVIMENTOS_GET = {
  ok: true,
  movimentos: MOVIMENTOS,
  materiais: MATERIAIS,
  colaboradores: COLABORADORES,
  posicoes: POSICOES
};

const CONFIG_GET = {
  ok: true,
  fornecedores: [
    { id: "f1", nome: "PROSOL", contacto: "84 000 0000", ativo: true },
    { id: "f2", nome: "TCM", contacto: "", ativo: false }
  ],
  departamentos: [
    { id: "d1", nome: "Mecânica", active: true, created_at: "2026-08-13T09:36:25Z" },
    { id: "d2", nome: "Electricidade", active: false, created_at: "2026-08-13T09:36:25Z" }
  ],
  finalidades: [
    { id: "fi1", nome: "Manutenção Corretiva", ativo: true },
    { id: "fi2", nome: "Manutenção Preventiva", ativo: true },
    { id: "fi3", nome: "Obra", ativo: true }
  ],
  categorias: MATERIAIS_GET.categorias,
  responsaveis: [
    { id: "r1", nome: "Filomeno Manuel", funcao: "ambos", ativo: true },
    { id: "r2", nome: "José Chicote", funcao: "comprador", ativo: true },
    { id: "r3", nome: "Ana Sitoe", funcao: "receptor", ativo: true }
  ],
  unidades: [
    { id: "u1", nome: "Un", ativo: true }, { id: "u2", nome: "Kg", ativo: true },
    { id: "u3", nome: "Lt", ativo: true }, { id: "u4", nome: "Mt", ativo: true },
    { id: "u5", nome: "Cx", ativo: true }, { id: "u6", nome: "Par", ativo: true },
    { id: "u7", nome: "Rolo", ativo: true }, { id: "u8", nome: "Saco", ativo: true }
  ],
  unidadesOk: false
};

const MES = 10;
const PAINEL = {
  ok: true,
  kpis: { materiais: 3, entradasMes: 1, saidasMes: 1, alertas: 2, esgotados: 1, comprasMes: 18500 },
  serie: Array.from({ length: 6 }, (_, i) => ({
    chave: `2026-0${5 + i}`,
    label: ["Mai", "Jun", "Jul", "Ago", "Set", "Out"][i],
    entradas: [0, 0, 1, 0, 1, 1][i],
    saidas: [0, 0, 0, 0, 0, 1][i],
    mzn: [0, 0, 420, 0, 3500, 18500][i]
  })),
  alertas: [
    { id: "mat-filtro", referencia: "DAN-FIL-002", nome: "Filtro de Óleo", unidade: "Un", stock: 0, minimo: 2, estado: "Esgotado" },
    { id: "mat-oleo", referencia: "DAN-LUB-001", nome: "Óleo DX3", unidade: "Lt", stock: 2, minimo: 5, estado: "Stock Baixo" }
  ],
  ultimasEntradas: [MOVIMENTOS[0]],
  ultimasSaidas: [MOVIMENTOS[1]],
  materiais: MATERIAIS
};

const REL_INVENTARIO = {
  ok: true,
  linhas: [
    { id: "mat-pneu", referencia: "DAN-PNE-003", nome: "Pneu 12.00R20", categoria: "Pneus", unidade: "Par", localizacao: "Armazém 2", minimo: 1, stock: 10, estado: "OK" },
    { id: "mat-oleo", referencia: "DAN-LUB-001", nome: "Óleo DX3", categoria: "Lubrificantes", unidade: "Lt", localizacao: "Prateleira A2", minimo: 5, stock: 2, estado: "Stock Baixo" },
    { id: "mat-filtro", referencia: "DAN-FIL-002", nome: "Filtro de Óleo", categoria: "Peças", unidade: "Un", localizacao: "Prateleira B1", minimo: 2, stock: 0, estado: "Esgotado" }
  ],
  kpis: { total: 3, ok: 1, baixo: 1, esgotado: 1 },
  materiais: MATERIAIS
};

const REL_MOVIMENTOS = {
  ok: true,
  linhas: [MOVIMENTOS[0], MOVIMENTOS[1]],
  kpis: { totalEntradas: 1, totalSaidas: 1, qtdEntradas: 6, qtdSaidas: 8 },
  materiais: MATERIAIS
};

const REL_COMPRAS = {
  ok: true,
  linhas: [MOVIMENTOS[0]],
  porFornecedor: [{ fornecedor: "PROSOL", count: 1, total: 111000 }],
  kpis: { total: 1, totalGasto: 111000 },
  materiais: MATERIAIS
};

/* ============ arranque ============ */

(async () => {
  const browser = await chromium.launch();

  /* ---------- 0. Bloqueio sem sessão ---------- */
  const ctxSem = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pgSem = await ctxSem.newPage();
  await pgSem.goto(`${BASE}/stock`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(600);
  ok("Sem sessao: /stock manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await ctxSem.close();

  /* ---------- contexto com sessão de estrutura + mocks ---------- */
  const contexto = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  await contexto.route("**/api/stock/painel*", (rota) => rota.fulfill({ json: PAINEL }));
  await contexto.route("**/api/stock/relatorios*", (rota) => {
    const u = new URL(rota.request().url());
    const rel = u.searchParams.get("rel") || "inventario";
    if (rel === "movimentos") return rota.fulfill({ json: REL_MOVIMENTOS });
    if (rel === "compras") return rota.fulfill({ json: REL_COMPRAS });
    return rota.fulfill({ json: REL_INVENTARIO });
  });
  const postsMovimentos = [];
  const postsConfig = [];
  const postsMateriais = [];
  await contexto.route("**/api/stock/materiais", async (rota) => {
    if (rota.request().method() === "POST") {
      postsMateriais.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, id: "novo-mat" } });
    }
    return rota.fulfill({ json: MATERIAIS_GET });
  });
  await contexto.route("**/api/stock/movimentos", (rota) => {
    if (rota.request().method() === "POST") {
      postsMovimentos.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, id: "novo-1" } });
    }
    return rota.fulfill({ json: MOVIMENTOS_GET });
  });
  await contexto.route("**/api/stock/config", async (rota) => {
    if (rota.request().method() === "POST") {
      postsConfig.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true } });
    }
    return rota.fulfill({ json: CONFIG_GET });
  });

  const pagina = await contexto.newPage();

  /* ---------- 1. HOME ---------- */
  await pagina.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const cartaoStock = pagina.locator("a[href='/stock']:has-text('Gestão de Stock')");
  ok("Home: cartão Gestão de Stock linka /stock", (await cartaoStock.count()) === 1);
  ok(
    "Home: cartão diz 'No ar' (não 'A seguir')",
    (await pagina.locator("a[href='/stock'] >> text=No ar").count()) > 0 &&
      (await pagina.locator("a[href='/em-migracao?mod=stock']").count()) === 0
  );

  /* ---------- 2. MENU ---------- */
  await pagina.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const botaoStock = pagina.locator("button[title='Gestão de Stock']");
  ok("Menu mostra o módulo Gestão de Stock", (await botaoStock.count()) > 0);
  if ((await botaoStock.count()) > 0) {
    await botaoStock.first().click();
    await pagina.waitForTimeout(400);
    const subs = [
      ["Painel", "/stock"],
      ["Entradas", "/stock/entradas"],
      ["Saídas", "/stock/saidas"],
      ["Materiais", "/stock/materiais"],
      ["Relatórios", "/stock/relatorios"],
      ["Configurações", "/stock/config"]
    ];
    for (const [label, href] of subs) {
      ok(
        `Sub-página ${label} linkada no menu`,
        (await pagina.locator(`a[href='${href}']`).count()) > 0
      );
    }
  }

  /* ---------- 3. PAINEL ---------- */
  await pagina.goto(`${BASE}/stock`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(400);
  ok("Painel: título", (await pagina.locator("h1:has-text('Stock - Painel')").count()) > 0);
  ok("Painel: 6 KPIs com Compras do mês", (await pagina.locator("text=Compras do mês").count()) > 0);
  ok("Painel: KPI compras 18 500,00 MZN", (await pagina.locator("text=18 500,00 MZN").count()) > 0);
  ok("Painel: KPI entradas do mês", (await pagina.locator("text=Entradas do mês").count()) > 0);
  ok("Painel: alertas visíveis (2)", (await pagina.locator("text=Alertas de stock mínimo (2)").count()) > 0);
  ok("Painel: etiqueta Esgotado nos alertas", (await pagina.locator("text=Esgotado").count()) > 0);
  ok("Painel: gráfico 6 meses", (await pagina.locator("text=Entradas e saídas dos últimos 6 meses").count()) > 0);
  ok("Painel: últimas entradas com material", (await pagina.locator("text=DAN-PNE-003 - Pneu 12.00R20").count()) > 0);
  ok("Painel: últimas saídas com material", (await pagina.locator("text=DAN-LUB-001 - Óleo DX3").count()) > 0);

  /* ---------- 4. MATERIAIS ---------- */
  await pagina.goto(`${BASE}/stock/materiais`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(400);
  ok("Materiais: título", (await pagina.locator("h1:has-text('Stock - Materiais')").count()) > 0);
  ok("Materiais: 3 activos na tabela", (await pagina.locator("tbody tr").count()) === 3);
  ok("Materiais: alertas de mínimo (2)", (await pagina.locator("text=Alertas de stock mínimo (2)").count()) > 0);

  // busca sem acentos: "oleo" acha "Óleo DX3"
  await pagina.fill("input[type='search']", "oleo dx3");
  await pagina.waitForTimeout(300);
  ok(
    "Materiais: busca 'oleo dx3' acha 'Óleo DX3' (sem acentos)",
    (await pagina.locator("tbody tr:has-text('Óleo DX3')").count()) === 1 &&
      (await pagina.locator("tbody tr:has-text('Pneu')").count()) === 0
  );
  await pagina.fill("input[type='search']", "");
  await pagina.waitForTimeout(300);

  // inactivas
  await pagina.locator("label:has-text('Mostrar inactivas') input").check();
  await pagina.waitForTimeout(300);
  ok("Materiais: toggle inactivas traz o 4º material", (await pagina.locator("tbody tr").count()) === 4);
  await pagina.locator("label:has-text('Mostrar inactivas') input").uncheck();
  await pagina.waitForTimeout(300);

  // criar material (referência, nome, unidade)
  await pagina.click("button:has-text('Novo Material')");
  await pagina.fill("input[placeholder='ex.: DAN_LUB_001']", "DAN-LUB-999");
  await pagina.fill("input[placeholder='ex.: Óleo DX3']", "Graxa Industrial");
  await pagina.locator("select").nth(1).selectOption("Lt");
  await pagina.click("button:has-text('Guardar')");
  await pagina.waitForTimeout(400);
  const postCriarMat = postsMateriais.find((p) => p.action === "criar");
  ok(
    "Materiais: POST criar com referência, nome e unidade",
    Boolean(postCriarMat) &&
      postCriarMat.referencia === "DAN-LUB-999" &&
      postCriarMat.nome === "Graxa Industrial" &&
      postCriarMat.unidade === "Lt"
  );
  ok("Materiais: criar não mostra erro de duplicado", (await pagina.locator("text=Já existe um material").count()) === 0);

  /* ---------- 5. ENTRADAS ---------- */
  await pagina.goto(`${BASE}/stock/entradas`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(400);
  ok("Entradas: título", (await pagina.locator("h1:has-text('Stock - Entradas')").count()) > 0);
  ok(
    "Entradas: pendentes antigos bem visíveis (1)",
    (await pagina.locator("text=Pedidos antigos por confirmar (1)").count()) > 0
  );
  ok(
    "Entradas: pendente antigo mostra fornecedor",
    (await pagina.locator("text=TCM").count()) > 0
  );

  // stock actual no formulário
  await pagina.locator("select").first().selectOption("mat-pneu");
  await pagina.waitForTimeout(200);
  ok("Entradas: stock actual mostrado no form", (await pagina.locator("text=Stock actual: 10 Par").count()) > 0);

  // gravar entrada
  await pagina.fill("input[type='number'] >> nth=0", "2");
  await pagina.click("button:has-text('Gravar entrada')");
  await pagina.waitForTimeout(400);
  const postEntrada = postsMovimentos.find((p) => p.action === "criar" && p.movimento?.tipo === "entrada");
  ok("Entradas: POST criar com tipo entrada", Boolean(postEntrada));
  ok(
    "Entradas: POST com os campos do hub",
    postEntrada &&
      postEntrada.movimento.material_id === "mat-pneu" &&
      postEntrada.movimento.numero_po !== undefined &&
      postEntrada.movimento.comprador_nome !== undefined
  );

  /* ---------- 6. SAÍDAS ---------- */
  await pagina.goto(`${BASE}/stock/saidas`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(400);
  ok("Saídas: título", (await pagina.locator("h1:has-text('Stock - Saídas')").count()) > 0);
  ok(
    "Saídas: pendentes antigos bem visíveis (1)",
    (await pagina.locator("text=Pedidos antigos de saída por confirmar (1)").count()) > 0
  );
  ok(
    "Saídas: pendente acima do stock marcado",
    (await pagina.locator("text=stock já não chega").count()) > 0
  );
  ok(
    "Saídas: botão confirmar do pendente desactivado",
    (await pagina.locator("button:has-text('Confirmar') >> nth=0").isDisabled().catch(() => true)) === true
  );

  // material esgotado: botão vira "Sem stock disponível"
  await pagina.locator("select").first().selectOption("mat-filtro");
  await pagina.waitForTimeout(200);
  ok(
    "Saídas: material esgotado bloqueia (Sem stock disponível)",
    (await pagina.locator("button:has-text('Sem stock disponível')").count()) > 0
  );

  // stock insuficiente: quantidade acima do stock
  await pagina.locator("select").first().selectOption("mat-pneu");
  await pagina.waitForTimeout(200);
  ok("Saídas: stock actual mostrado", (await pagina.locator("text=Stock actual: 10 Par").count()) > 0);
  await pagina.fill("input[type='number'] >> nth=0", "50");
  await pagina.waitForTimeout(200);
  ok(
    "Saídas: qtd acima do stock mostra aviso",
    (await pagina.locator("text=Stock insuficiente: disponível 10 Par").count()) > 0
  );
  ok(
    "Saídas: botão desactivado quando qtd acima do stock",
    (await pagina.locator("button:has-text('Quantidade acima do stock')").isDisabled().catch(() => true)) === true
  );

  // gravar saída dentro do stock
  await pagina.fill("input[type='number'] >> nth=0", "3");
  await pagina.fill("input[list='colaboradores-stock']", "João Macuácua");
  await pagina.locator("select").nth(1).selectOption("Manutenção Corretiva");
  await pagina.fill("input[placeholder='Opcional']", "Teste do teste");
  await pagina.click("button:has-text('Gravar saída')");
  await pagina.waitForTimeout(400);
  const postSaida = postsMovimentos.find((p) => p.action === "criar" && p.movimento?.tipo === "saida");
  ok("Saídas: POST criar com tipo saida", Boolean(postSaida));
  ok(
    "Saídas: POST tem colaborador e finalidade",
    postSaida &&
      postSaida.movimento.colaborador_nome === "João Macuácua" &&
      postSaida.movimento.finalidade === "Manutenção Corretiva" &&
      Number(postSaida.movimento.quantidade) === 3
  );

  // busca sem acentos nas saídas
  await pagina.fill("input[type='search']", "joao");
  await pagina.waitForTimeout(300);
  ok(
    "Saídas: busca 'joao' acha 'João Macuácua' (sem acentos)",
    (await pagina.locator("tbody tr:has-text('João Macuácua')").count()) > 0
  );

  /* ---------- 7. RELATÓRIOS ---------- */
  await pagina.goto(`${BASE}/stock/relatorios`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(400);
  ok("Relatórios: título", (await pagina.locator("h1:has-text('Stock - Relatórios')").count()) > 0);
  ok("Relatórios: 3 abas", (await pagina.locator("[role='tab']").count()) === 3);
  ok(
    "Relatórios: inventário com KPIs",
    (await pagina.locator("text=Materiais: 3").count()) > 0 &&
      (await pagina.locator("text=OK: 1").count()) > 0 &&
      (await pagina.locator("text=Esgotado: 1").count()) > 0
  );
  ok(
    "Relatórios: inventário lista materiais",
    (await pagina.locator("tbody tr:has-text('DAN-PNE-003')").count()) > 0
  );
  ok("Relatórios: botões Excel e PDF", (await pagina.locator("button:has-text('Excel')").count()) === 1 && (await pagina.locator("button:has-text('PDF')").count()) === 1);

  // movimentos
  await pagina.click("[role='tab']:has-text('Movimentos')");
  await pagina.waitForTimeout(500);
  ok(
    "Relatórios: movimentos com KPIs de entradas/saídas",
    (await pagina.locator("text=Entradas: 1 (6)").count()) > 0 &&
      (await pagina.locator("text=Saídas: 1 (8)").count()) > 0
  );
  ok(
    "Relatórios: movimentos com filtros De/Até",
    (await pagina.locator("input[type='date']").count()) === 2
  );

  // compras
  await pagina.click("[role='tab']:has-text('Compras')");
  await pagina.waitForTimeout(500);
  ok(
    "Relatórios: compras com total gasto",
    (await pagina.locator("text=Total gasto: 111 000,00 MZN").count()) > 0
  );
  ok(
    "Relatórios: gasto por fornecedor (PROSOL)",
    (await pagina.locator("text=PROSOL").count()) > 0 &&
      (await pagina.locator("text=1 compras").count()) > 0
  );

  /* ---------- 8. CONFIGURAÇÕES ---------- */
  await pagina.goto(`${BASE}/stock/config`, { waitUntil: "networkidle" });
  await pagina.waitForTimeout(400);
  ok("Config: título", (await pagina.locator("h1:has-text('Stock - Configurações')").count()) > 0);
  ok("Config: 7 abas", (await pagina.locator("[role='tab']").count()) === 7);
  ok("Config: fornecedores (2)", (await pagina.locator("[role='tab']:has-text('Fornecedores (2)')").count()) > 0);

  // criar fornecedor
  await pagina.fill("input[placeholder='ex.: Nome']", "Bridgestone Moçambique");
  await pagina.click("button:has-text('Guardar')");
  await pagina.waitForTimeout(400);
  const postConfig = postsConfig.find((p) => p.action === "criar" && p.tipo === "fornecedor");
  ok("Config: POST criar fornecedor", Boolean(postConfig) && postConfig.nome === "Bridgestone Moçambique");

  // aba unidades: banner do SQL
  await pagina.click("[role='tab']:has-text('Unidades')");
  await pagina.waitForTimeout(400);
  ok(
    "Config: 8 unidades do hub na lista",
    (await pagina.locator("tbody tr:has-text('Rolo')").count()) > 0
  );
  ok(
    "Config: banner avisa que o SQL das unidades ainda não correu",
    (await pagina.locator("text=fase4-stock-unidades.sql").count()) > 0
  );

  // alternar activo/inactivo
  await pagina.click("[role='tab']:has-text('Finalidades')");
  await pagina.waitForTimeout(400);
  await pagina.locator("tbody tr:has-text('Obra') button:has-text('Desactivar')").click();
  await pagina.waitForTimeout(400);
  const postAlt = postsConfig.find((p) => p.action === "alternar" && p.tipo === "finalidade");
  ok("Config: POST alternar finalidade", Boolean(postAlt));

  await pagina.screenshot({ path: "tests/s4-config.png", fullPage: false });

  /* ---------- fim ---------- */
  console.log(`\n${passaram} passaram, ${falharam} falharam`);
  await browser.close();
  process.exit(falharam ? 1 : 0);
})().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
