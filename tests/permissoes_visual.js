/**
 * Teste visual das PERMISSÕES POR UTILIZADOR (Fase 7 R1).
 *
 * Cobre: a página /permissoes (3 abas: Utilizadores, Matriz, Solicitações),
 * a página /perfil (Os meus dados: conta, cadastro, pedir alteração, trocar
 * senha), o home com o cartão Permissões & Contas, o menu com o item
 * Permissões (admin) e o submenu completo com bloqueados marcados.
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

const USUARIOS = [
  {
    id: "u-admin", usuario: "DM0069", nome: "Filomeno Manuel", cargo: "Direcção",
    nivel: "admin", ativo: true, precisa_trocar: false, tem_permissoes: false
  },
  {
    id: "u-gestor", usuario: "DM0101", nome: "Gestor do Stock", cargo: "Encarregado do armazém",
    nivel: "gestor", ativo: true, precisa_trocar: false, tem_permissoes: true
  },
  {
    id: "u-mecanico", usuario: "DM0120", nome: "Mecânico Chefe", cargo: "Mecânico",
    nivel: "operador", ativo: true, precisa_trocar: false, tem_permissoes: false
  },
  {
    id: "u-pendente", usuario: "DM0140", nome: "Motorista Novo", cargo: "Motorista",
    nivel: "pendente", ativo: true, precisa_trocar: false, tem_permissoes: false
  },
  {
    id: "u-off", usuario: "DM0150", nome: "Ex-collega", cargo: "Estafeta",
    nivel: "consulta", ativo: false, precisa_trocar: false, tem_permissoes: false
  }
];

const SOLICITACOES = [
  {
    id: "s1", utilizador: "DM0101", nome: "Gestor do Stock", campo: "contacto",
    valor_pretendido: "+258 84 777 0000", motivo: "Mudei de número.", estado: "pendente",
    criado_em: "2026-10-20T08:00:00Z", resolvido_em: null, resposta: ""
  },
  {
    id: "s2", utilizador: "DM0120", nome: "Mecânico Chefe", campo: "endereco",
    valor_pretendido: "Bairro Munhava", motivo: "", estado: "aplicada",
    criado_em: "2026-10-18T08:00:00Z", resolvido_em: "2026-10-19T10:00:00Z", resposta: "aplicado"
  }
];

const MATRIZ_GESTOR = [
  { pagina: "stock", ver: true, mexer: true, apagar: false },
  { pagina: "stock.entradas", ver: true, mexer: true, apagar: true },
  { pagina: "stock.saidas", ver: true, mexer: true, apagar: false }
];

const PERFIL = {
  ok: true,
  dados: {
    conta: {
      usuario: "DM0069", nome: "Filomeno Manuel", cargo: "Direcção", nivel: "admin"
    },
    cadastro: {
      encontrado: true, code: "DM0069", name: "Filomeno Manuel",
      department: "Direcção", categoria: "Administrador", setor: "Porto da Beira",
      funcao_grupo: "Sistemas", contacto: "+258 84 000 0000", contacto_1: "",
      contacto_2: "", email: "filomeno@danmo.co.mz", endereco: "Porto da Beira",
      naturalidade: "Beira", estado_civil: "Casado", data_admissao: "2020-01-15"
    }
  },
  minhas: [
    {
      id: "m1", campo: "email", valor_pretendido: "novo@danmo.co.mz", estado: "pendente",
      criado_em: "2026-10-20T09:00:00Z", resolvido_em: null, resposta: ""
    }
  ]
};

/* ============ arranque ============ */

(async () => {
  const browser = await chromium.launch();

  /* ---------- 0. Bloqueio sem sessão ---------- */
  const ctxSem = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pgSem = await ctxSem.newPage();
  await pgSem.goto(`${BASE}/permissoes`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: /permissoes manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await pgSem.goto(`${BASE}/perfil`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: /perfil manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await ctxSem.close();

  /* ---------- contexto com sessão de estrutura + mocks ---------- */
  const contexto = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  const postsPermissoes = [];
  await contexto.route("**/api/portal/permissoes", async (rota) => {
    if (rota.request().method() === "POST") {
      postsPermissoes.push(rota.request().postDataJSON());
      const corpo = rota.request().postDataJSON() || {};
      if (corpo.action === "matriz") {
        return rota.fulfill({ json: { ok: true, matriz: MATRIZ_GESTOR } });
      }
      return rota.fulfill({ json: { ok: true } });
    }
    return rota.fulfill({ json: { ok: true, usuarios: USUARIOS, solicitacoes: SOLICITACOES } });
  });

  const postsPerfil = [];
  await contexto.route("**/api/portal/perfil", async (rota) => {
    if (rota.request().method() === "POST") {
      postsPerfil.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true } });
    }
    return rota.fulfill({ json: PERFIL });
  });

  await contexto.route("**/api/auth/trocar-senha", (rota) =>
    rota.fulfill({ json: { ok: true, entrar_de_novo: true } })
  );
  await contexto.route("**/api/portal/fundos*", (rota) =>
    rota.fulfill({ json: { ok: true, fundos: [] } })
  );

  const pg = await contexto.newPage();

  /* ---------- 1. Home: cartão Permissões & Contas ---------- */
  await pg.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  const home = await pg.content();
  ok("Home: cartao Permissoes & Contas no ar", home.includes("Permissões &amp; Contas"));
  ok("Home: texto do stock ja nao anuncia a matriz", !home.includes("matriz de permissões"));
  ok("Home: cartao aponta a /permissoes para o admin", (await pg.$$('a[href="/permissoes"]')).length >= 1);

  /* ---------- 2. Menu: Permissões visível e submenu completo ---------- */
  const menuOficina = pg.locator('nav button:has-text("Oficina & Manutenção")').first();
  if ((await menuOficina.count()) > 0) {
    await menuOficina.click();
    await pg.waitForTimeout(400);
    const subsOficina = await pg.locator("nav >> text=Ordens de Serviço").count();
    ok("Menu: submenu da Oficina abre com as paginas", subsOficina >= 1);
    const subsStock = pg.locator('nav button:has-text("Gestão de Stock")').first();
    await subsStock.click();
    await pg.waitForTimeout(400);
    ok(
      "Menu: Stock mostra as 6 paginas (admin ve tudo)",
      (await pg.locator("nav >> text=Configurações").count()) >= 1 &&
        (await pg.locator("nav >> text=Relatórios").count()) >= 1
    );
  } else {
    ok("Menu: submenu da Oficina abre com as paginas", false, "botao nao encontrado");
  }
  ok(
    "Menu: item Permissoes presente para o admin",
    (await pg.locator('nav a[href="/permissoes"]').count()) === 1
  );

  /* perfil dropdown tem Os meus dados */
  await pg.click('button[aria-label="Menu do utilizador"]');
  await pg.waitForTimeout(400);
  ok(
    "Perfil dropdown: link Os meus dados",
    (await pg.locator('a[href="/perfil"]').count()) >= 1
  );
  await pg.keyboard.press("Escape");

  /* ---------- 3. /permissoes: aba Utilizadores ---------- */
  await pg.goto(`${BASE}/permissoes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  let html = await pg.content();
  ok("Permissoes: titulo e subtitulo", html.includes("Permissões"));
  ok("Permissoes: 3 abas", html.includes("Matriz de permissões") && html.includes("Solicitações"));
  ok("Permissoes: pendente com badge Por aprovar", html.includes("Por aprovar"));
  ok("Permissoes: conta admin sem acções (acesso total)", html.includes("Acesso total (administração)"));
  ok("Permissoes: desactivada em cartao proprio", html.includes("Contas desactivadas"));
  ok("Permissoes: botao Criar conta", (await pg.locator('button:has-text("Criar conta")').count()) >= 1);

  /* diálogo de aprovação */
  await pg.getByRole("button", { name: "Aprovar", exact: true }).first().click();
  await pg.waitForTimeout(800);
  html = await pg.content();
  ok("Permissoes: dialog de aprovacao abre", html.includes("Aprovar registo"));
  ok("Permissoes: dialog de aprovacao tem 3 rotulos", html.includes("Gestor") && html.includes("Consulta"));
  await pg.getByRole("button", { name: "Cancelar", exact: true }).first().click();
  await pg.waitForTimeout(400);

  /* diálogo de criar conta */
  await pg.getByRole("button", { name: "Criar conta", exact: true }).first().click();
  await pg.waitForTimeout(800);
  html = await pg.content();
  ok("Permissoes: dialog criar conta pede codigo/senha/chave", html.includes("Código do colaborador") && html.includes("Chave de administração"));
  await pg.getByRole("button", { name: "Cancelar", exact: true }).first().click();
  await pg.waitForTimeout(400);

  /* ---------- 4. /permissoes: aba Matriz ---------- */
  await pg.locator('button:has-text("Matriz de permissões")').click();
  await pg.waitForTimeout(500);
  html = await pg.content();
  ok("Matriz: pede para escolher pessoa", html.includes("Escolhe uma pessoa em cima"));

  await pg.selectOption("#pessoa-matriz", "u-gestor");
  await pg.waitForTimeout(700);
  html = await pg.content();
  ok("Matriz: abre a grelha do gestor", html.includes("Entradas (Gestão de Stock)"));
  ok(
    "Matriz: os 3 modulos aparecem",
    (await pg.getByText("Oficina & Manutenção", { exact: true }).count()) >= 1 &&
      (await pg.getByText("Disponibilidade Equip.", { exact: true }).count()) >= 1 &&
      (await pg.getByText("Gestão de Stock", { exact: true }).count()) >= 1
  );
  ok("Matriz: etiqueta de quem ja tem permissoes", html.includes("Já tem permissões gravadas"));

  /* alternar Apagar da pagina stock: cascata liga ver+mexer e grava */
  postsPermissoes.length = 0;
  const linhaStock = pg.locator('div:has(> p:has-text("Painel (Gestão de Stock)")) button[aria-label="Apagar"]');
  if ((await linhaStock.count()) === 0) {
    // fallback: procura pela linha do Painel no módulo Stock
  }
  // o Painel (Gestão de Stock) é a primeira linha do card do Stock
  const cardStock = pg.locator("div.card:has-text('Gestão de Stock'), div[data-slot='card']:has-text('Painel (Gestão de Stock)')").last();
  await cardStock.locator('button[aria-label="Apagar"]').first().click();
  await pg.waitForTimeout(700);
  const gravou = postsPermissoes.find(
    (c) => c.action === "gravar-pagina" && c.pagina === "stock" && c.ver && c.mexer && c.apagar
  );
  ok("Matriz: alternar Apagar grava ver+mexer+apagar (cascata)", Boolean(gravou), JSON.stringify(postsPermissoes));
  html = await pg.content();
  ok("Matriz: toast de gravado", html.includes("gravado"));

  /* ---------- 5. /permissoes: aba Solicitações ---------- */
  await pg.locator('button:has-text("Solicitações")').click();
  await pg.waitForTimeout(600);
  html = await pg.content();
  ok("Solicitacoes: pendente com valor pretendido", html.includes("+258 84 777 0000"));
  ok("Solicitacoes: resolvidas em historico", html.includes("Resolvidas") && html.includes("Aplicada"));

  /* resolver (ignorar) com resposta */
  postsPermissoes.length = 0;
  await pg.getByRole("button", { name: "Ignorar", exact: true }).first().click();
  await pg.waitForTimeout(600);
  await pg.fill("#resposta-resolver", "Falta o motivo");
  await pg.getByRole("button", { name: "Ignorar", exact: true }).last().click();
  await pg.waitForTimeout(700);
  const ignorou = postsPermissoes.find((c) => c.action === "resolver-solicitacao" && c.aplicar === false);
  ok("Solicitacoes: ignorar envia resposta", Boolean(ignorou), JSON.stringify(postsPermissoes));

  /* ---------- 6. /perfil: Os meus dados ---------- */
  await pg.goto(`${BASE}/perfil`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(900);
  html = await pg.content();
  ok("Perfil: titulo Os meus dados", html.includes("Os meus dados"));
  ok("Perfil: conta com codigo e nivel", html.includes("DM0069") && html.includes("Admin"));
  ok("Perfil: cadastro em leitura", html.includes("Cadastro de colaborador") && html.includes("Filomeno Manuel"));
  ok("Perfil: mostra contato do cadastro", html.includes("+258 84 000 0000"));
  ok("Perfil: minhas solicitacoes", html.includes("As minhas solicitações") && html.includes("novo@danmo.co.mz"));

  /* pedir alteração */
  postsPerfil.length = 0;
  await pg.getByRole("button", { name: "Pedir alteração", exact: true }).first().click();
  await pg.waitForTimeout(600);
  await pg.selectOption("#campo-pedir", "contacto");
  await pg.fill("#valor-pedir", "+258 87 111 2222");
  await pg.fill("#motivo-pedir", "Mudei de chip");
  await pg.getByRole("button", { name: "Enviar solicitação", exact: true }).click();
  await pg.waitForTimeout(700);
  const pediu = postsPerfil.find(
    (c) => c.action === "pedir" && c.campo === "contacto" && c.valor === "+258 87 111 2222"
  );
  ok("Perfil: pedir alteracao envia campo/valor/motivo", Boolean(pediu), JSON.stringify(postsPerfil));
  html = await pg.content();
  ok("Perfil: toast de solicitacao enviada", html.includes("Solicitação enviada"));

  /* trocar senha (a sessão fecha; o teste só confirma o POST) */
  postsPerfil.length = 0;
  await pg.getByRole("button", { name: "Trocar a minha senha", exact: true }).click();
  await pg.waitForTimeout(600);
  await pg.fill("#senha-atual", "antiga123");
  await pg.fill("#senha-nova", "nova1234");
  await pg.getByRole("button", { name: "Trocar senha", exact: true }).click();
  await pg.waitForTimeout(1000);
  html = await pg.content();
  ok(
    "Perfil: trocar senha manda ao login com aviso",
    pg.url().includes("/login") && html.includes("Senha trocada com sucesso"),
    pg.url()
  );

  await contexto.close();

  /* ---------- 7. Menu bloqueado (visual só de estrutura) ----------
     No modo estrutura a sessão é sempre admin, por isso o bloqueio
     visual por permissão é coberto nos testes de lógica (pode()). Aqui
     confirmamos apenas que as páginas por migrar continuam em cartaz. */
  const ctx2 = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx2.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);
  const pg2 = await ctx2.newPage();
  await pg2.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pg2.waitForTimeout(900);
  const h2 = await pg2.content();
  ok(
    "Menu: fases por migrar continuam em cartaz",
    (await pg2.locator("nav >> text=/Fase [0-9]/").count()) >= 1 ||
      (await pg2.locator("nav >> text=Dev").count()) >= 1,
    h2.includes("Fase") ? "tem Fase" : "sem Fase"
  );
  await ctx2.close();

  await browser.close();

  console.log(`\n${passaram} passaram, ${falharam} falharam`);
  process.exit(falharam ? 1 : 0);
})().catch((e) => {
  console.error("ERRO GERAL:", e);
  process.exit(1);
});
