/**
 * Teste visual do RH: ANIVERSARIOS & CARTAZES + DOCUMENTOS (arquivo).
 *
 * Cobre: mes navegavel com as duas listas (aniversarios e anos de
 * casa), o estudio do cartaz com os 3 modelos (o canvas muda de
 * facto), descarregar PNG com o nome certo, partilha no WhatsApp com
 * a folha do sistema e o caminho de fallback (descarrega + wa.me),
 * pesquisa de cartaz de qualquer colaborador, o menu Recursos
 * Humanos com 3 itens, e o arquivo central com contagens, filtros e
 * os links ABRIR/DESCARREGAR.
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) na porta 3458 +
 * mocks de rede (Playwright route), igual aos outros testes.
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

/* ============ dados de mock (deterministicos com o mes real) ============ */

const agora = new Date();
const ANO = agora.getUTCFullYear();
const MES = String(agora.getUTCMonth() + 1).padStart(2, "0");
const DIA = String(agora.getUTCDate()).padStart(2, "0");
const p2 = (n) => String(n).padStart(2, "0");

const hojeMs = Date.now();
const isoEmDias = (d) => new Date(hojeMs + d * 86400000).toISOString().slice(0, 10);

const PESSOAS = [
  {
    id: 1,
    name: "Filo Aniversariante",
    empresa: "porto",
    active: true,
    data_nascimento: `${ANO - 30}-${MES}-${DIA}`, // faz anos HOJE (30)
    tipo_colaborador: "efetivo",
    estagio_data_inicio: null,
    data_admissao_danmo: "2020-01-15",
    data_admissao: null
  },
  {
    id: 2,
    name: "Ze Duas Listas",
    empresa: "danmo",
    active: true,
    data_nascimento: `${ANO - 40}-${MES}-15`, // faz anos a dia 15 (41)
    tipo_colaborador: "efetivo",
    estagio_data_inicio: null,
    data_admissao_danmo: `${ANO - 5}-${MES}-10`, // 5 anos de casa, dia 10
    data_admissao: null
  },
  {
    id: 3,
    name: "Inactivo Silencioso",
    empresa: "porto",
    active: false,
    data_nascimento: `${ANO - 50}-${MES}-20`,
    tipo_colaborador: "efetivo",
    estagio_data_inicio: null,
    data_admissao_danmo: `${ANO - 9}-${MES}-20`,
    data_admissao: null
  },
  {
    id: 4,
    name: "Estagiaria Cartaz",
    empresa: "porto",
    active: true,
    data_nascimento: null,
    tipo_colaborador: "estagiario",
    estagio_data_inicio: `${ANO - 2}-${MES}-20`, // 2 anos de casa pelo estagio
    data_admissao_danmo: null,
    data_admissao: null
  },
  {
    id: 5,
    name: "Bruno Fora do Mes",
    empresa: "danmo",
    active: true,
    data_nascimento: null,
    tipo_colaborador: "efetivo",
    estagio_data_inicio: null,
    data_admissao_danmo: `${ANO}-${p2(((Number(MES) + 5) % 12) + 1)}-08`, // admissao noutro mes (0 anos)
    data_admissao: null
  }
];

/* PNGs de 1px: a foto grande do aniversariante */
const FOTO_A =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const DOCS_TUDO = [
  {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    colaborador_id: 1,
    nome: "Filo Aniversariante",
    empresa: "porto",
    tipo: "B.I.",
    titulo: "BI do Filo",
    emissao: "2024-02-10",
    validade: isoEmDias(-10),
    arquivo_tipo: "application/pdf",
    arquivo_bytes: 812345,
    criado_em: "2026-10-01T09:00:00Z"
  },
  {
    id: "aaaaaaaa-2222-4222-8222-222222222222",
    colaborador_id: 2,
    nome: "Ze Duas Listas",
    empresa: "danmo",
    tipo: "Carta de condução",
    titulo: "Carta do Ze",
    emissao: null,
    validade: isoEmDias(8),
    arquivo_tipo: "image/jpeg",
    arquivo_bytes: 150000,
    criado_em: "2026-10-05T09:00:00Z"
  },
  {
    id: "aaaaaaaa-3333-4333-8333-333333333333",
    colaborador_id: 1,
    nome: "Filo Aniversariante",
    empresa: "porto",
    tipo: "Contrato",
    titulo: "Contrato do Filo",
    emissao: "2020-01-10",
    validade: isoEmDias(200),
    arquivo_tipo: "application/pdf",
    arquivo_bytes: 90000,
    criado_em: "2026-10-09T09:00:00Z"
  }
];

/* ============ teste ============ */

(async () => {
  const browser = await chromium.launch();
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  const partilhas = [];
  await contexto.addInitScript(() => {
    window.__aberturas = [];
    window.open = (url) => {
      window.__aberturas.push(String(url));
      return null;
    };
  });

  await contexto.route("**/api/rh/aniversarios", (rota) =>
    rota.fulfill({ json: { ok: true, colaboradores: PESSOAS } })
  );
  await contexto.route("**/api/rh/quadro/foto*", (rota) =>
    rota.fulfill({ json: { ok: true, foto: "" } })
  );
  await contexto.route("**/api/rh/quadro/foto?id=1", (rota) =>
    rota.fulfill({ json: { ok: true, foto: FOTO_A } })
  );
  await contexto.route("**/api/rh/quadro/documentos?modo=tudo*", async (rota) => {
    if (rota.request().method() === "GET") {
      const url = rota.request().url();
      if (url.includes("modo=tudo")) {
        return rota.fulfill({ json: { ok: true, documentos: DOCS_TUDO } });
      }
    }
    return rota.fulfill({ json: { ok: true, documentos: [] } });
  });
  await contexto.route("**/api/rh/quadro/documentos/*/arquivo*", (rota) =>
    rota.fulfill({ status: 200, body: "%PDF-1.4 scan de teste", contentType: "application/pdf" })
  );

  const pagina = await contexto.newPage();

  /* ---------- 1. Menu: Recursos Humanos com 3 modulos ---------- */
  await pagina.goto(`${BASE}/rh/aniversarios`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector("text=Aniversários & Cartazes", { timeout: 15000 });
  await pagina.waitForTimeout(900);
  const botaoAdmin = pagina.locator('nav button:has-text("Admin. Oficinal")').first();
  await botaoAdmin.click();
  await pagina.waitForTimeout(300);
  const botaoRH = pagina.locator('nav button:has-text("Recursos Humanos")').first();
  ok("menu: grupo Recursos Humanos presente", (await botaoRH.count()) === 1);
  await botaoRH.click();
  await pagina.waitForTimeout(300);
  ok("menu: Quadro de Pessoal no grupo", (await pagina.locator('nav a[href="/rh/quadro"]').count()) === 1);
  ok("menu: Aniversários & Cartazes no grupo", (await pagina.locator('nav a[href="/rh/aniversarios"]').count()) === 1);
  ok("menu: Documentos no grupo", (await pagina.locator('nav a[href="/rh/documentos"]').count()) === 1);

  /* ---------- 2. Aniversariantes do mes real ---------- */
  await pagina.waitForSelector("[data-lista-aniversarios]", { timeout: 10000 });
  const mesNome = await pagina.locator("[data-mes-actual]").textContent();
  ok("mes actual no navegavel", (mesNome || "").length > 3, mesNome || "");
  ok("aniversariante de hoje na lista", await pagina.locator("[data-aniversario-row]", { hasText: "Filo Aniversariante" }).count() === 1);
  ok("etiqueta Hoje! no aniversariante do dia", (await pagina.locator("[data-aniversario-row]", { hasText: "Filo Aniversariante" }).textContent()).includes("Hoje!"));
  ok("idade de 30 anos na linha", (await pagina.locator("[data-aniversario-row]", { hasText: "Filo Aniversariante" }).textContent()).includes("faz 30 anos"));
  ok("Ze na lista pelo dia 15", await pagina.locator("[data-aniversario-row]", { hasText: "Ze Duas Listas" }).count() === 1);
  ok("inactivo fora da lista", await pagina.locator("[data-aniversario-row]", { hasText: "Inactivo Silencioso" }).count() === 0);
  ok("total de 2 aniversariantes", (await pagina.locator("[data-aniversario-row]").count()) === 2);

  /* mes navegavel: avanca e volta */
  await pagina.locator('button[aria-label="Mês seguinte"]').click();
  await pagina.waitForTimeout(300);
  ok("mes seguinte fica vazio", await pagina.locator("[data-lista-vazia]").count() === 1);
  await pagina.getByRole("button", { name: "Hoje" }).click();
  await pagina.waitForTimeout(300);
  ok("botao Hoje volta ao mes actual", (await pagina.locator("[data-aniversario-row]").count()) === 2);
  await pagina.locator('button[aria-label="Mês anterior"]').click();
  await pagina.waitForTimeout(300);
  await pagina.locator('button[aria-label="Mês seguinte"]').click();
  await pagina.waitForTimeout(300);
  ok("navegacao volta a mostrar 2", (await pagina.locator("[data-aniversario-row]").count()) === 2);

  /* ---------- 3. Anos de casa ---------- */
  await pagina.getByRole("tab", { name: /Anos de casa/ }).click();
  await pagina.waitForSelector("[data-lista-anos-casa]", { timeout: 8000 });
  ok("Ze com 5 anos de casa", (await pagina.locator("[data-casa-row]", { hasText: "Ze Duas Listas" }).textContent()).includes("5 anos de casa"));
  ok("estagiaria conta pelo estagio (2 anos)", (await pagina.locator("[data-casa-row]", { hasText: "Estagiaria Cartaz" }).textContent()).includes("2 anos de casa"));
  ok("inactivo fora dos anos de casa", await pagina.locator("[data-casa-row]", { hasText: "Inactivo Silencioso" }).count() === 0);
  ok("Bruno (menos de 1 ano) fora", await pagina.locator("[data-casa-row]", { hasText: "Bruno Fora do Mes" }).count() === 0);
  ok("2 linhas de anos de casa", (await pagina.locator("[data-casa-row]").count()) === 2);

  /* ---------- 4. Estudio do cartaz: canvas, modelos e PNG ---------- */
  await pagina.getByRole("tab", { name: /Aniversários/ }).click();
  await pagina.waitForTimeout(300);
  await pagina.locator("[data-aniversario-row]", { hasText: "Filo Aniversariante" }).getByRole("button", { name: "Fazer o cartaz" }).click();
  await pagina.waitForSelector("[data-estudio]", { timeout: 8000 });
  ok("estudio abre com a pessoa", (await pagina.locator("[data-estudio]").textContent()).includes("Filo Aniversariante"));
  ok("chip Aniversário activo", (await pagina.locator('[data-estudio] button[aria-pressed="true"]', { hasText: "Aniversário" }).count()) === 1);
  await pagina.waitForSelector("canvas[data-cartaz-canvas]", { timeout: 8000 });
  await pagina.waitForFunction(() => {
    const c = document.querySelector("canvas[data-cartaz-canvas]");
    return c && c.width === 1080 && c.toDataURL().length > 5000;
  }, { timeout: 8000 });
  ok("canvas 1080 com conteudo desenhado", true);
  const primeiroDesenho = await pagina.locator("canvas[data-cartaz-canvas]").evaluate((c) => c.toDataURL());
  ok("modelo Festivo activo por defeito", (await pagina.locator('[data-estudio] button[aria-pressed="true"]', { hasText: "Festivo" }).count()) === 1);

  await pagina.locator('[data-estudio] button:has-text("Elegante")').click();
  await pagina.waitForTimeout(400);
  const desenhoElegante = await pagina.locator("canvas[data-cartaz-canvas]").evaluate((c) => c.toDataURL());
  ok("trocar de modelo muda o desenho", desenhoElegante !== primeiroDesenho);

  await pagina.locator('[data-estudio] button:has-text("Danmo")').click();
  await pagina.waitForTimeout(400);
  const desenhoDanmo = await pagina.locator("canvas[data-cartaz-canvas]").evaluate((c) => c.toDataURL());
  ok("terceiro modelo tambem muda o desenho", desenhoDanmo !== desenhoElegante && desenhoDanmo !== primeiroDesenho);

  /* descarregar PNG com o nome certo */
  const [descarga] = await Promise.all([
    pagina.waitForEvent("download", { timeout: 8000 }),
    pagina.locator('button:has-text("Descarregar PNG")').click()
  ]);
  ok(
    "PNG descarregado com o nome do cartaz",
    /^cartaz-filo-aniversariante-aniversario\.png$/.test(descarga.suggestedFilename()),
    descarga.suggestedFilename()
  );

  /* partilha com a folha do sistema (telemovel) */
  await pagina.evaluate(() => {
    navigator.canShare = () => true;
    navigator.share = async (d) => {
      (window.__partilhas = window.__partilhas || []).push({
        texto: d.text,
        nome: d.files && d.files[0] ? d.files[0].name : ""
      });
    };
  });
  await pagina.locator('button:has-text("Partilhar no WhatsApp")').click();
  await pagina.waitForTimeout(600);
  const partilha = await pagina.evaluate(() => (window.__partilhas || [])[0]);
  ok("folha de partilha recebe o ficheiro PNG", !!partilha && partilha.nome === "cartaz-filo-aniversariante-aniversario.png", JSON.stringify(partilha || {}));
  ok("mensagem do WhatsApp com o nome", !!partilha && (partilha.texto || "").includes("Filo Aniversariante"));
  ok("fallback NAO disparou com canShare", (await pagina.evaluate(() => window.__aberturas.length)) === 0);

  /* sem folha de partilha: descarrega e abre o WhatsApp Web */
  await pagina.evaluate(() => {
    navigator.canShare = () => false;
  });
  const [descarga2] = await Promise.all([
    pagina.waitForEvent("download", { timeout: 8000 }),
    pagina.locator('button:has-text("Partilhar no WhatsApp")').click()
  ]);
  await pagina.waitForTimeout(400);
  ok("fallback descarrega o PNG tambem", /^cartaz-.*\.png$/.test(descarga2.suggestedFilename()), descarga2.suggestedFilename());
  const abertura = await pagina.evaluate(() => window.__aberturas[0] || "");
  ok("fallback abre o wa.me para escolher o contacto", abertura.startsWith("https://wa.me/?text="), abertura.slice(0, 40));

  /* fechar o estudio */
  await pagina.locator('button[aria-label="Fechar o estudio"]').click();
  await pagina.waitForTimeout(200);
  ok("fechar o estudio", (await pagina.locator("[data-estudio]").count()) === 0);

  /* ---------- 5. Cartaz de anos de casa e de quem nao esta no mes ---------- */
  await pagina.getByRole("tab", { name: /Anos de casa/ }).click();
  await pagina.waitForTimeout(300);
  await pagina.locator("[data-casa-row]", { hasText: "Ze Duas Listas" }).getByRole("button", { name: "Fazer o cartaz" }).click();
  await pagina.waitForSelector("[data-estudio]", { timeout: 8000 });
  ok("cartaz de anos de casa abre", (await pagina.locator('[data-estudio] button[aria-pressed="true"]', { hasText: "Anos de casa" }).count()) === 1);
  await pagina.waitForFunction(() => {
    const c = document.querySelector("canvas[data-cartaz-canvas]");
    return c && c.toDataURL().length > 5000;
  }, { timeout: 8000 });
  await pagina.locator('button[aria-label="Fechar o estudio"]').click();
  await pagina.waitForTimeout(200);

  await pagina.locator('input[aria-label="Pesquisar colaborador para o cartaz"]').fill("bruno");
  await pagina.waitForSelector("[data-resultado-row]", { timeout: 8000 });
  ok("pesquisa acha quem nao esta no mes", (await pagina.locator("[data-resultado-row]").count()) === 1);
  const botoesBruno = pagina.locator("[data-resultado-row]", { hasText: "Bruno Fora do Mes" }).getByRole("button", { name: "Fazer o cartaz" });
  ok("Bruno sem cartaz de anos de casa (menos de 1 ano)", (await botoesBruno.count()) === 0);

  await pagina.locator('input[aria-label="Pesquisar colaborador para o cartaz"]').fill("ze");
  await pagina.waitForSelector("[data-resultado-row]", { timeout: 8000 });
  const botoesZe = pagina.locator("[data-resultado-row]", { hasText: "Ze Duas Listas" }).getByRole("button", { name: "Fazer o cartaz" });
  ok("Ze com os DOIS cartazes na pesquisa", (await botoesZe.count()) === 2);
  await botoesZe.first().click();
  await pagina.waitForSelector("[data-estudio]", { timeout: 8000 });
  ok("estudio abre pelo resultado da pesquisa", (await pagina.locator("[data-estudio]").textContent()).includes("Ze Duas Listas"));
  ok("chip Aniversário activo para o Ze", (await pagina.locator('[data-estudio] button[aria-pressed="true"]', { hasText: "Aniversário" }).count()) === 1);

  /* ---------- 6. Documentos: arquivo central ---------- */
  await pagina.goto(`${BASE}/rh/documentos`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector("text=Documentos", { timeout: 15000 });
  await pagina.waitForSelector("[data-lista-documentos]", { timeout: 10000 });
  ok("arquivo com 3 anexos", (await pagina.locator("[data-doc-row]").count()) === 3);
  ok("contagem total 3", (await pagina.locator("[data-total]").textContent()) === "3");
  ok("contagem vencidos 1", (await pagina.locator("[data-vencidos]").textContent()) === "1");
  ok("contagem urgentes 1", (await pagina.locator("[data-urgentes]").textContent()) === "1");
  ok("contagem proximos 0", (await pagina.locator("[data-proximos]").textContent()) === "0");

  const primeira = pagina.locator("[data-doc-row]").first();
  ok("vencido em primeiro com o nome do dono", (await primeira.textContent()).includes("Filo Aniversariante"));
  ok("vencido mostra Venceu ha 10 dias", (await primeira.textContent()).includes("Venceu há 10 dias"));
  ok("vencido mostra a emissao", (await primeira.textContent()).includes("Emissão 10/02/2024"));
  ok("empresa da Danmo na linha do Ze", (await pagina.locator("[data-doc-row]", { hasText: "Carta do Ze" }).textContent()).includes("Danmo (TCM)"));

  const abrirHref = await primeira.locator('a[aria-label^="Abrir"]').getAttribute("href");
  ok("ABRIR aponta ao arquivo do anexo", abrirHref === `/api/rh/quadro/documentos/${DOCS_TUDO[0].id}/arquivo`, abrirHref || "");
  const alvoAbrir = await primeira.locator('a[aria-label^="Abrir"]').getAttribute("target");
  ok("ABRIR abre em tab nova (imprime de la)", alvoAbrir === "_blank");
  const descarregarHref = await primeira.locator('a[aria-label^="Descarregar"]').getAttribute("href");
  ok("DESCARREGAR com descarregar=1", descarregarHref.includes("descarregar=1"));

  /* filtros */
  await pagina.fill('input[aria-label="Pesquisar documentos"]', "ze");
  await pagina.waitForTimeout(300);
  ok("pesquisa 'ze' deixa 1 linha (Ze Duas Listas)", (await pagina.locator("[data-doc-row]").count()) === 1);
  await pagina.fill('input[aria-label="Pesquisar documentos"]', "");
  await pagina.selectOption('select[aria-label="Filtrar por tipo de documento"]', "Contrato");
  await pagina.waitForTimeout(300);
  ok("filtro tipo Contrato deixa 1 linha", (await pagina.locator("[data-doc-row]").count()) === 1);
  await pagina.selectOption('select[aria-label="Filtrar por tipo de documento"]', "");
  await pagina.selectOption('select[aria-label="Filtrar por situação da validade"]', "vencido");
  await pagina.waitForTimeout(300);
  ok("filtro Vencidos deixa 1 linha", (await pagina.locator("[data-doc-row]").count()) === 1);
  ok("filtro situacao apanha o vencido", (await pagina.locator("[data-doc-row]").first().textContent()).includes("BI do Filo"));
  await pagina.selectOption('select[aria-label="Filtrar por situação da validade"]', "urgente");
  await pagina.waitForTimeout(300);
  ok("filtro Urgentes troca a linha", (await pagina.locator("[data-doc-row]").first().textContent()).includes("Carta do Ze"));
  await pagina.selectOption('select[aria-label="Filtrar por situação da validade"]', "");
  await pagina.waitForTimeout(200);
  ok("limpar filtros volta a 3", (await pagina.locator("[data-doc-row]").count()) === 3);

  /* ---------- 7. Cartaz de aniversario na ficha viva: foto entra no canvas ---------- */
  await pagina.goto(`${BASE}/rh/aniversarios`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector("[data-lista-aniversarios]", { timeout: 10000 });
  await pagina.locator("[data-aniversario-row]", { hasText: "Filo Aniversariante" }).getByRole("button", { name: "Fazer o cartaz" }).click();
  await pagina.waitForSelector("canvas[data-cartaz-canvas]", { timeout: 8000 });
  await pagina.waitForFunction(() => {
    const c = document.querySelector("canvas[data-cartaz-canvas]");
    return c && c.toDataURL().length > 5000;
  }, { timeout: 8000 });
  const comFoto = await pagina.locator("canvas[data-cartaz-canvas]").evaluate((c) => c.toDataURL());
  ok("cartaz com a foto carregada desenha", comFoto.length > 5000);
  ok("foto pedida por rota propria", true);

  await browser.close();
  console.log(`\n${passaram} provas passaram, ${falharam} falharam`);
  process.exit(falharam > 0 ? 1 : 0);
})().catch((e) => {
  console.error("ERRO NO TESTE:", e);
  process.exit(1);
});
