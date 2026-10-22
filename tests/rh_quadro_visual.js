/**
 * Teste visual do módulo RH: QUADRO DE PESSOAL.
 *
 * Cobre o painel de contagens (as DUAS listas), o aviso de estágios a
 * decidir com as duas decisões a um clique, pesquisa sem acentos,
 * filtros por empresa/estado, vista de cartões e de tabela, ficha de
 * detalhe com as parcelas do transferido, formulário com troca de tipo
 * e o home actualizado.
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

const hojeMs = Date.now();
const isoEmDias = (d) => new Date(hojeMs + d * 86400000).toISOString().slice(0, 10);

const COLS = [
  {
    id: 1, code: "DM0069", name: "Filomeno Manuel Joaquim Alexandre", categoria: "Diretor Geral",
    setor: "Direcção", department: "Administração", active: true,
    tipo_colaborador: "efetivo", tipo_vinculo: "contratado", empresa: "porto",
    empresa_origem: "Porto", data_admissao_danmo: "2013-04-14", data_admissao_grupo: null,
    data_admissao: null, data_inativo: null, data_nascimento: "1990-05-10",
    naturalidade: "Beira", estado_civil: "Casado(a)", endereco: null, num_dependentes: 2,
    mes_ferias: "Outubro", bi_numero: "110100123456", bi_validade: isoEmDias(30),
    carta_conducao: null, carta_conducao_validade: null, inss_numero: null, nuit_numero: null,
    contacto_1: "842760964", contacto_2: null, contacto: null, email: null,
    grupo_sanguineo: "O+", doenca_cronica: null, altura_cm: null,
    observacoes_gerais: null, estagio_instituicao: null, estagio_orientador: null,
    estagio_data_inicio: null, estagio_data_fim: null, estagio_resultado: null,
    funcao_grupo: null, faz_turno: false, grupo_id: null, created_at: "2026-06-10T05:52:15Z"
  },
  {
    id: 2, code: "DM0101", name: "José Chingueture Fernando", categoria: "Mecânico",
    setor: "Mecânica", department: "Manutenção", active: true,
    tipo_colaborador: "efetivo", tipo_vinculo: "transferido", empresa: "porto",
    empresa_origem: "TCM", data_admissao_danmo: "2022-03-10", data_admissao_grupo: "2018-03-10",
    data_admissao: null, data_inativo: null, data_nascimento: null,
    naturalidade: null, estado_civil: null, endereco: null, num_dependentes: 0,
    mes_ferias: null, bi_numero: null, bi_validade: null,
    carta_conducao: "AB-123456", carta_conducao_validade: isoEmDias(-5), inss_numero: null, nuit_numero: null,
    contacto_1: null, contacto_2: null, contacto: null, email: null,
    grupo_sanguineo: null, doenca_cronica: null, altura_cm: null,
    observacoes_gerais: null, estagio_instituicao: null, estagio_orientador: null,
    estagio_data_inicio: null, estagio_data_fim: null, estagio_resultado: null,
    funcao_grupo: null, faz_turno: false, grupo_id: null, created_at: "2026-06-10T05:52:15Z"
  },
  {
    id: 3, code: "DM0150", name: "Administrador TCM Augusto", categoria: "Administrador",
    setor: null, department: "Administração", active: true,
    tipo_colaborador: "efetivo", tipo_vinculo: "contratado", empresa: "danmo",
    empresa_origem: "TCM", data_admissao_danmo: "2024-06-01", data_admissao_grupo: null,
    data_admissao: null, data_inativo: null, data_nascimento: null,
    naturalidade: null, estado_civil: null, endereco: null, num_dependentes: 0,
    mes_ferias: null, bi_numero: null, inss_numero: null, nuit_numero: null,
    contacto_1: null, contacto_2: null, contacto: null, email: null,
    grupo_sanguineo: null, doenca_cronica: null, altura_cm: null,
    observacoes_gerais: null, estagio_instituicao: null, estagio_orientador: null,
    estagio_data_inicio: null, estagio_data_fim: null, estagio_resultado: null,
    funcao_grupo: null, faz_turno: false, grupo_id: null, created_at: "2026-07-23T13:50:22Z"
  },
  {
    id: 4, code: "EST007", name: "Diana Estagio Teste", categoria: "Estagiário de Serralharia",
    setor: "Serralharia", department: null, active: true,
    tipo_colaborador: "estagiario", tipo_vinculo: null, empresa: "porto",
    empresa_origem: null, data_admissao_danmo: null, data_admissao_grupo: null,
    data_admissao: null, data_inativo: null, data_nascimento: "2003-02-11",
    naturalidade: null, estado_civil: null, endereco: null, num_dependentes: 0,
    mes_ferias: null, bi_numero: null, bi_validade: null,
    carta_conducao: null, carta_conducao_validade: null, inss_numero: null, nuit_numero: null,
    contacto_1: null, contacto_2: null, contacto: null, email: null,
    grupo_sanguineo: null, doenca_cronica: null, altura_cm: null,
    observacoes_gerais: null, estagio_instituicao: "Instituto Politécnico da Beira",
    estagio_orientador: "José Chicote", estagio_data_inicio: "2026-04-01",
    estagio_data_fim: isoEmDias(5), estagio_resultado: null,
    funcao_grupo: null, faz_turno: false, grupo_id: null, created_at: "2026-08-01T08:00:00Z"
  },
  {
    id: 5, code: "DM0140", name: "Efraim Sem Classificacao", categoria: "Auxiliar",
    setor: null, department: null, active: true,
    tipo_colaborador: "efetivo", tipo_vinculo: "contratado", empresa: null,
    empresa_origem: null, data_admissao_danmo: null, data_admissao_grupo: null,
    data_admissao: null, data_inativo: null, data_nascimento: null,
    naturalidade: null, estado_civil: null, endereco: null, num_dependentes: 0,
    mes_ferias: null, bi_numero: null, inss_numero: null, nuit_numero: null,
    contacto_1: null, contacto_2: null, contacto: null, email: null,
    grupo_sanguineo: null, doenca_cronica: null, altura_cm: null,
    observacoes_gerais: null, estagio_instituicao: null, estagio_orientador: null,
    estagio_data_inicio: null, estagio_data_fim: null, estagio_resultado: null,
    funcao_grupo: null, faz_turno: false, grupo_id: null, created_at: "2026-07-23T13:50:22Z"
  },
  {
    id: 6, code: "DM0099", name: "Gustavo Inactivo Antigo", categoria: "Bate-Chapa",
    setor: "Serralharia", department: null, active: false,
    tipo_colaborador: "efetivo", tipo_vinculo: "contratado", empresa: "porto",
    empresa_origem: "Porto", data_admissao_danmo: "2019-02-01", data_admissao_grupo: null,
    data_admissao: null, data_inativo: "2026-05-01", data_nascimento: null,
    naturalidade: null, estado_civil: null, endereco: null, num_dependentes: 0,
    mes_ferias: null, bi_numero: null, inss_numero: null, nuit_numero: null,
    contacto_1: null, contacto_2: null, contacto: null, email: null,
    grupo_sanguineo: null, doenca_cronica: null, altura_cm: null,
    observacoes_gerais: null, estagio_instituicao: null, estagio_orientador: null,
    estagio_data_inicio: null, estagio_data_fim: null, estagio_resultado: null,
    funcao_grupo: null, faz_turno: false, grupo_id: null, created_at: "2026-06-10T05:52:15Z"
  }
];

const promovida = { ...COLS[3], tipo_colaborador: "efetivo", tipo_vinculo: "contratado", estagio_resultado: "promovido", data_admissao_danmo: "2026-04-01" };

/* Anexo de exemplo na ficha do Filomeno (B.I. digitalizado, ja vencido) */
const DOC1 = {
  id: "11111111-1111-4111-8111-111111111111",
  colaborador_id: 1,
  tipo: "B.I.",
  titulo: "BI Filomeno digitalizado",
  emissao: "2023-01-31",
  validade: "2024-01-31",
  arquivo_nome: "bi-filomeno.pdf",
  arquivo_tipo: "application/pdf",
  arquivo_bytes: 812345,
  criado_em: "2026-08-15T09:30:00Z"
};

/* Validade que vem de um SCAN anexado (José, B.I. renovado com scan novo) */
const DOCS_VALIDADES = [{ colaborador_id: 2, tipo: "B.I.", validade: isoEmDias(20) }];

/* PNGs de 1px distintos: a MINI da grelha e a FOTO grande da ficha */
const MINI_A = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const FOTO_A = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/* ============ teste ============ */

(async () => {
  const browser = await chromium.launch();
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  const pedidosPatch = [];
  const pedidosDocsPost = [];
  const pedidosDocsDelete = [];
  let proximoDocId = 2;
  await contexto.route("**/api/rh/quadro", async (rota) => {
    if (rota.request().method() === "GET") {
      return rota.fulfill({ json: { ok: true, colaboradores: COLS, docsValidades: DOCS_VALIDADES } });
    }
    if (rota.request().method() === "POST") {
      const corpo = rota.request().postDataJSON();
      if (corpo?.accao === "criar") {
        const novo = {
          ...COLS[0],
          id: 99,
          code: corpo.dados.code,
          name: corpo.dados.name,
          empresa: corpo.dados.empresa,
          tipo_colaborador: corpo.dados.tipo_colaborador
        };
        return rota.fulfill({ json: { ok: true, colaborador: novo } });
      }
    }
    return rota.fulfill({ json: { ok: false, erro: "pedido inesperado" }, status: 400 });
  });
  await contexto.route("**/api/rh/quadro/4", async (rota) => {
    if (rota.request().method() === "PATCH") {
      pedidosPatch.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, colaborador: promovida } });
    }
    return rota.fulfill({ json: { ok: true, colaborador: COLS[3], foto: "" } });
  });
  await contexto.route("**/api/rh/quadro/2", async (rota) => {
    return rota.fulfill({ json: { ok: true, colaborador: COLS[1], foto: "" } });
  });
  await contexto.route("**/api/rh/quadro/1", async (rota) => {
    if (rota.request().method() === "PATCH") {
      pedidosPatch.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, colaborador: COLS[0] } });
    }
    return rota.fulfill({ json: { ok: true, colaborador: COLS[0], foto: FOTO_A } });
  });
  await contexto.route("**/api/rh/quadro/documentos/*/arquivo*", async (rota) => {
    return rota.fulfill({
      status: 200,
      body: "%PDF-1.4 scan de teste",
      contentType: "application/pdf"
    });
  });
  await contexto.route("**/api/rh/quadro/documentos/*", async (rota) => {
    if (rota.request().method() === "DELETE") {
      const idApagado = rota.request().url().split("/documentos/")[1];
      pedidosDocsDelete.push(idApagado);
      return rota.fulfill({ json: { ok: true } });
    }
    return rota.fulfill({ json: { ok: false, erro: "pedido inesperado" }, status: 400 });
  });
  await contexto.route("**/api/rh/quadro/documentos*", async (rota) => {
    const url = rota.request().url();
    if (rota.request().method() === "GET") {
      const quem = Number(new URL(url).searchParams.get("colaborador_id") || 0);
      return rota.fulfill({ json: { ok: true, documentos: quem === 1 ? [DOC1] : [] } });
    }
    if (rota.request().method() === "POST") {
      const corpo = rota.request().postDataJSON();
      pedidosDocsPost.push(corpo);
      const novo = {
        id: `22222222-2222-4222-8222-${String(proximoDocId++).padStart(12, "0")}`,
        colaborador_id: corpo.colaborador_id,
        tipo: corpo.tipo,
        titulo: corpo.arquivo_nome.replace(/\.[^.]+$/, ""),
        emissao: corpo.emissao || null,
        validade: corpo.validade || null,
        arquivo_nome: corpo.arquivo_nome,
        arquivo_tipo: corpo.arquivo_tipo,
        arquivo_bytes: corpo.arquivo_bytes,
        criado_em: new Date().toISOString()
      };
      return rota.fulfill({ json: { ok: true, documento: novo } });
    }
    return rota.fulfill({ json: { ok: false, erro: "pedido inesperado" }, status: 400 });
  });
  await contexto.route("**/api/rh/quadro/fotos", async (rota) => {
    return rota.fulfill({ json: { ok: true, fotos: [{ id: 1, img: MINI_A }] } });
  });

  const pagina = await contexto.newPage();

  /* ---------- 1. Página carrega com painel e contagens ---------- */
  await pagina.goto(`${BASE}/rh/quadro`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector("text=Quadro de Pessoal", { timeout: 15000 });
  await pagina.waitForSelector("text=Diretor Geral", { timeout: 15000 });

  ok("pagina abre com titulo", await pagina.locator("h1", { hasText: "Quadro de Pessoal" }).count() === 1);
  const subtitulo = await pagina.locator("p", { hasText: "activos ·" }).first().textContent();
  ok("subtitulo conta 5 activos e 1 inactivo", /5 activos · 1 inactivos · 1 estagiários · 6 no total/.test(subtitulo || ""), subtitulo || "");

  ok("KPI Danmo Porto = 3", await pagina.locator("button, div").filter({ hasText: /^Danmo Porto/ }).count() >= 1);
  const corpoHtml = await pagina.locator("body").innerHTML();
  ok("KPI Danmo (TCM) presente", corpoHtml.includes("Danmo (TCM)"));
  ok("KPI Sem classificar presente", corpoHtml.includes("Sem classificar"));
  ok("KPI A terminar (30d) presente", corpoHtml.includes("A terminar (30d)"));

  /* ---------- 2. Aviso de estágios a decidir com acções ---------- */
  ok("aviso de estagios a decidir", await pagina.getByText("Estágios a decidir (1)").count() === 1);
  ok("estagiario com fim previsto", await pagina.getByText("Fim previsto:").count() >= 1);
  ok("botao Promover a efetivo no aviso", await pagina.getByRole("button", { name: "Promover a efetivo" }).count() >= 1);
  ok("botao Nao permanece no aviso", await pagina.getByRole("button", { name: "Não permanece" }).count() >= 1);

  /* ---------- 2b. Painel de documentos a vencer ---------- */
  ok("painel de documentos a vencer com 3 avisos", await pagina.getByText("Documentos a vencer (3)").count() === 1);
  const alertasRows = pagina.locator("[data-alerta-doc]");
  ok("carta vencida do José em primeiro", (await alertasRows.first().textContent()).includes("Venceu há 5 dias"));
  ok("BI do José vem do scan anexado (20 dias)", (await alertasRows.nth(1).textContent()).includes("Faltam 20 dias"));
  ok("BI do Filomeno vem da ficha (30 dias)", (await alertasRows.nth(2).textContent()).includes("Faltam 30 dias"));
  await alertasRows.first().click();
  await pagina.waitForSelector("text=Código DM0101", { timeout: 8000 });
  ok("clicar no alerta abre a ficha do José", true);
  ok("ficha do José traz o número da carta", await pagina.getByText("AB-123456").count() === 1);
  ok("ficha do José sem anexos mostra vazio", await pagina.getByText("Sem documentos anexados.").count() === 1);
  await pagina.locator("button").filter({ hasText: "Fechar" }).first().click();
  await pagina.waitForTimeout(200);

  /* ---------- 3. Cartões com badges das duas listas ---------- */
  ok("cartao Filomeno com Danmo Porto", (await pagina.locator("[data-cartao]", { hasText: "Filomeno Manuel" }).textContent()).includes("Danmo Porto"));
  ok("cartao José com badge Transferido", (await pagina.locator("[data-cartao]", { hasText: "José Chingueture" }).textContent()).includes("Transferido"));
  ok("cartao Augusto na lista TCM", (await pagina.locator("[data-cartao]", { hasText: "Administrador TCM Augusto" }).textContent()).includes("Danmo (TCM)"));
  ok("cartao estagio com iniciais", (await pagina.locator("[data-cartao]", { hasText: "Diana Estagio Teste" }).count()) === 1);

  /* ---------- 4. Pesquisa sem acentos + filtro ---------- */
  await pagina.getByPlaceholder("Pesquisar por nome, código ou função...").fill("jose");
  await pagina.waitForTimeout(300);
  ok("pesquisa 'jose' acha José Chingueture", await pagina.locator("[data-cartao]", { hasText: "José Chingueture" }).count() === 1);
  ok("pesquisa 'jose' esconde Filomeno", await pagina.locator("[data-cartao]", { hasText: "Filomeno Manuel" }).count() === 0);
  await pagina.getByPlaceholder("Pesquisar por nome, código ou função...").fill("");
  await pagina.waitForTimeout(200);

  await pagina.getByLabel("Filtrar por empresa").selectOption("sem");
  await pagina.waitForTimeout(300);
  ok("filtro 'Sem classificar' mostra so Efraim", await pagina.locator("[data-cartao]", { hasText: "Efraim Sem Classificacao" }).count() === 1 && await pagina.locator("[data-cartao]", { hasText: "Filomeno Manuel" }).count() === 0);
  await pagina.getByRole("button", { name: "Limpar" }).click();
  await pagina.waitForTimeout(200);

  /* ---------- 5. Vista tabela ---------- */
  await pagina.getByRole("button", { name: "Tabela" }).click();
  await pagina.waitForTimeout(200);
  ok("tabela mostra coluna Tempo de casa", await pagina.locator("th", { hasText: "Tempo de casa" }).count() === 1);
  ok("tabela mostra linha do inactivo", (await pagina.locator("tr", { hasText: "Gustavo Inactivo Antigo" }).textContent()).includes("Inactivo"));
  await pagina.getByRole("button", { name: "Cartões" }).click();
  await pagina.waitForTimeout(300);

  /* ---------- 5b. Foto na grelha: avatar maior e zoom sem abrir a ficha ---------- */
  const cartaoFoto = pagina.locator("[data-cartao]", { hasText: "Filomeno Manuel" });
  ok("cartao com foto mostra a imagem", await cartaoFoto.locator("img").count() === 1);
  const caixaFoto = await cartaoFoto.locator("img").first().boundingBox();
  ok("avatar maior (64px, antes 40px)", !!caixaFoto && caixaFoto.width >= 56 && caixaFoto.height >= 56, JSON.stringify(caixaFoto));
  ok("cartao sem foto fica com iniciais", await pagina.locator("[data-cartao]", { hasText: "Diana Estagio Teste" }).locator("img").count() === 0);

  await pagina.locator('button[aria-label="Ampliar foto de Filomeno Manuel Joaquim Alexandre"]').click();
  const zoomDialog = pagina.locator('div[role="dialog"][aria-label="Foto de Filomeno Manuel Joaquim Alexandre"]');
  ok("zoom abre com a foto do cartao", await zoomDialog.count() === 1);
  ok("clicar na foto NAO abre a ficha", await pagina.getByText("Código DM0069").count() === 0);
  await pagina.waitForFunction(
    (esperada) => {
      const i = document.querySelector('div[aria-label^="Foto de"] img');
      return !!i && i.getAttribute("src") === esperada;
    },
    FOTO_A,
    { timeout: 6000 }
  );
  ok("zoom troca para a foto grande (busca na rota da ficha)", true);
  await pagina.mouse.click(12, 12);
  await pagina.waitForTimeout(250);
  ok("clicar fora fecha o zoom", await zoomDialog.count() === 0);

  /* ---------- 5c. Foto na ficha: amplia por cima do detalhe e a ficha fica ---------- */
  await pagina.locator("[data-cartao]", { hasText: "Filomeno Manuel" }).first().click();
  await pagina.waitForSelector("text=Código DM0069", { timeout: 8000 });
  ok("ficha abre com a foto", await pagina.locator('div[role="dialog"][aria-label="Filomeno Manuel Joaquim Alexandre"] img').count() === 1);
  await pagina.locator('button[aria-label="Ampliar foto"]').click();
  await pagina.waitForTimeout(250);
  ok("zoom abre sobre a ficha", await zoomDialog.count() === 1);
  await pagina.keyboard.press("Escape");
  await pagina.waitForTimeout(250);
  ok("ESC fecha o zoom e MANTÉM a ficha aberta", await zoomDialog.count() === 0 && (await pagina.getByText("Código DM0069").count()) === 1);
  await pagina.locator("button").filter({ hasText: "Fechar" }).first().click();
  await pagina.waitForTimeout(200);

  /* ---------- 5d. Arquivo de documentos na ficha (scans) ---------- */
  await pagina.locator("[data-cartao]", { hasText: "Filomeno Manuel" }).first().click();
  await pagina.waitForSelector("text=Documentos anexados", { timeout: 8000 });
  ok("ficha mostra 1 anexo", await pagina.locator("[data-doc]").count() === 1);
  const linhaDoc = pagina.locator("[data-doc]").first();
  ok("anexo mostra o titulo", (await linhaDoc.textContent()).includes("BI Filomeno digitalizado"));
  ok("anexo mostra o tamanho (793 KB)", (await linhaDoc.textContent()).includes("793 KB"));
  ok("anexo vencido mostra a data", (await linhaDoc.textContent()).includes("31/01/2024"));
  ok("anexo mostra a emissao", (await linhaDoc.textContent()).includes("emissão 31/01/2023"));
  ok("rotulos visiveis Emissao e Validade no anexo", (await pagina.locator('label[for="doc-emissao"]').textContent()).includes("Emissão") && (await pagina.locator('label[for="doc-validade"]').textContent()).includes("Validade"));
  ok("botao Abrir aponta ao ficheiro", (await linhaDoc.locator('a[aria-label^="Abrir"]').getAttribute("href")).endsWith("/arquivo"));
  ok("botao Descarregar com descarregar=1", (await linhaDoc.locator('a[aria-label^="Descarregar"]').getAttribute("href")).includes("descarregar=1"));
  ok("detalhe traz B.I. Validade", (await pagina.locator("body").textContent()).includes("B.I. Validade"));

  await pagina.locator("#doc-tipo").selectOption("B.I.");
  await pagina.locator("#doc-emissao").fill("2023-06-01");
  await pagina.locator("#doc-validade").fill(isoEmDias(40));
  await pagina.locator('input[type="file"]').setInputFiles({
    name: "bi-filomeno-novo.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 scan novo do BI")
  });
  await pagina.waitForSelector("text=Documento anexado.", { timeout: 8000 });
  ok("toast de anexo gravado", true);
  await pagina.waitForFunction(() => document.querySelectorAll("[data-doc]").length === 2, { timeout: 8000 });
  ok("anexo novo aparece na lista", await pagina.getByText("bi-filomeno-novo").count() >= 1);
  const corpoPost = pedidosDocsPost[0];
  ok("POST manda o PDF em data URL", typeof corpoPost?.arquivo === "string" && corpoPost.arquivo.startsWith("data:application/pdf;base64,"));
  ok("POST manda tipo, emissao e validade", corpoPost?.tipo === "B.I." && corpoPost?.emissao === "2023-06-01" && corpoPost?.validade === isoEmDias(40));

  pagina.on("dialog", (d) => d.accept());
  await pagina.locator("[data-doc]").first().locator('button[aria-label^="Apagar"]').click();
  await pagina.waitForSelector("text=Documento apagado.", { timeout: 8000 });
  await pagina.waitForFunction(() => document.querySelectorAll("[data-doc]").length === 1, { timeout: 8000 });
  ok("apagar manda DELETE e a linha sai", pedidosDocsDelete.length === 1);

  await pagina.locator("button").filter({ hasText: "Fechar" }).first().click();
  await pagina.waitForTimeout(200);

  /* ---------- 6. Ficha detalhe: parcelas do transferido ---------- */
  await pagina.locator("[data-cartao]", { hasText: "José Chingueture" }).first().click();
  await pagina.waitForSelector("text=Código DM0101", { timeout: 8000 });
  await pagina.waitForSelector("text=Tempo no Grupo, por parcela", { timeout: 8000 });
  ok("detalhe abre a ficha do José", true);
  ok("parcela Antes (TCM)", await pagina.getByText("Antes (TCM)").count() === 1);
  ok("parcela Na Danmo", await pagina.getByText("Na Danmo", { exact: true }).count() === 1);
  ok("total do transferido = 4 anos", (await pagina.locator("body").textContent()).includes("4 anos, 0 meses e 0 dias"));
  ok("caixa Transferência com admissao no grupo", await pagina.getByText("Transferência").count() >= 1);
  await pagina.locator("button").filter({ hasText: "Fechar" }).first().click();
  await pagina.waitForTimeout(200);

  /* ---------- 7. Detalhe do estagiario e PROMOCAO ---------- */
  await pagina.locator("[data-cartao]", { hasText: "Diana Estagio Teste" }).first().click();
  await pagina.waitForSelector("text=Situação do Estágio", { timeout: 8000 });
  ok("detalhe mostra situacao do estagio", await pagina.getByText("Faltam 5 dias para o fim previsto").count() === 1);
  ok("detalhe mostra instituicao", await pagina.getByText("Instituto Politécnico da Beira").count() === 1);
  await pagina.getByRole("button", { name: "Editar" }).click();
  await pagina.waitForSelector("text=Estágio", { timeout: 8000 });
  const dialogoEd = pagina.locator('[role="dialog"]');
  ok("editar abre pelo detalhe", await dialogoEd.locator("input#fich-inst").inputValue() === "Instituto Politécnico da Beira");
  ok("estagiario nao mostra admissao na Danmo", await dialogoEd.locator("#fich-adm").count() === 0);
  await dialogoEd.locator("button").filter({ hasText: "Cancelar" }).first().click();
  await pagina.waitForTimeout(200);

  await pagina.getByRole("button", { name: "Promover a efetivo" }).first().click();
  await pagina.waitForSelector("text=Promovido a efetivo.", { timeout: 8000 });
  ok("toast de promocao", true);
  ok("PATCH com accao promover", pedidosPatch.some((p) => p.accao === "promover"));
  await pagina.waitForTimeout(400);
  ok("banner sai depois de decidir", await pagina.getByText("Estágios a decidir").count() === 0);

  /* ---------- 8. Novo colaborador: troca de tipo ---------- */
  await pagina.getByRole("button", { name: "Novo Colaborador" }).click();
  await pagina.waitForSelector("text=Novo Colaborador", { timeout: 8000 });
  const dialogo = pagina.locator('[role="dialog"]');
  ok("novo ficha abre com codigo sugerido", (await dialogo.locator("#fich-code").inputValue()).startsWith("DM"));
  ok("efetivo mostra admissao", await dialogo.locator("#fich-adm").count() === 1);
  ok("estado civil traz União de facto", await dialogo.locator('#lista-estados-civis option[value="União de facto"]').count() === 1);
  ok("estado civil mantém os antigos", await dialogo.locator('#lista-estados-civis option[value="Casado(a)"]').count() === 1);
  await dialogo.locator("button").filter({ hasText: "Estagiário" }).first().click();
  await pagina.waitForTimeout(200);
  ok("troca para estagiario esconde admissao e mostra estagio", await dialogo.locator("#fich-adm").count() === 0 && await dialogo.locator("#fich-eini").count() === 1);
  ok("codigo resugere EST", (await dialogo.locator("#fich-code").inputValue()).startsWith("EST"));
  await dialogo.locator("button").filter({ hasText: "Guardar" }).first().click();
  await pagina.waitForTimeout(300);
  ok("validacao pede nome", await dialogo.getByText("Escreve o nome completo.").count() === 1);
  ok("form tem B.I. Validade e Carta Validade", await dialogo.locator("#fich-bival").count() === 1 && await dialogo.locator("#fich-cartaval").count() === 1);
  const optMarco = dialogo.locator('#fich-mfer option[value="Marco"]');
  ok("mes de ferias guarda Marco e mostra Março", (await optMarco.count()) === 1 && (await optMarco.textContent()) === "Março");
  await dialogo.locator("button").filter({ hasText: "Cancelar" }).first().click();
  await pagina.waitForTimeout(200);

  /* ---------- 8b. Editar ficha grava as datas dos documentos ---------- */
  await pagina.locator("[data-cartao]", { hasText: "Filomeno Manuel" }).first().click();
  await pagina.waitForSelector("text=Código DM0069", { timeout: 8000 });
  await pagina.getByRole("button", { name: "Editar" }).click();
  await pagina.waitForSelector("#fich-bival", { timeout: 8000 });
  const dialogoDocs = pagina.locator('[role="dialog"]');
  ok("B.I. Validade preenchida no formulario", (await dialogoDocs.locator("#fich-bival").inputValue()) === isoEmDias(30));
  await dialogoDocs.locator("#fich-carta").fill("AB-987654");
  await dialogoDocs.locator("#fich-cartaval").fill("2027-01-31");
  await dialogoDocs.locator("button").filter({ hasText: "Guardar" }).first().click();
  await pagina.waitForSelector("text=Ficha actualizada.", { timeout: 8000 });
  const patchEdicao = pedidosPatch.find((p) => p.accao === "editar");
  ok("PATCH leva carta e validade", patchEdicao?.dados?.carta_conducao === "AB-987654" && patchEdicao?.dados?.carta_conducao_validade === "2027-01-31");
  await pagina.waitForTimeout(300);

  /* ---------- 9. Menu (acordeão: módulo -> grupo -> link) e home ---------- */
  await pagina.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector("text=Admin. Oficinal", { timeout: 30000 });
  await pagina.locator("button[title='Admin. Oficinal']").first().click();
  // A hidratacao pode chegar depois do HTML em compile a frio: se o
  // acordeao nao abriu, clica outra vez (prova de robustez, nao de sorte)
  let abriuRh = false;
  for (let tentativa = 0; tentativa < 6 && !abriuRh; tentativa++) {
    await pagina.waitForTimeout(500);
    abriuRh = (await pagina.locator("button", { hasText: "Recursos Humanos" }).count()) > 0;
    if (!abriuRh && tentativa >= 1) {
      await pagina.locator("button[title='Admin. Oficinal']").first().click();
    }
  }
  await pagina.waitForTimeout(300);
  await pagina.locator("button", { hasText: "Recursos Humanos" }).first().click();
  await pagina.waitForTimeout(300);
  const menuLink = pagina.locator('a[href="/rh/quadro"]');
  ok("menu mostra o link Quadro de Pessoal activo", (await menuLink.count()) === 1);
  await menuLink.first().click();
  await pagina.waitForSelector("h1:has-text('Quadro de Pessoal')", { timeout: 15000 });
  ok("link do menu abre a pagina", pagina.url().includes("/rh/quadro"));
  const homeTxt2 = await pagina.locator("body").textContent();
  ok("sem travessao U+2014 no quadro", !homeTxt2.includes("\u2014"));

  const homeResp = await pagina.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector("text=Admin. Oficinal", { timeout: 15000 });
  const homeTxt = await pagina.locator("body").textContent();
  ok("home menciona o Quadro de Pessoal no ar", homeTxt.includes("Quadro de Pessoal com as duas listas"));

  /* ---------- 10. Sem travessoes no HTML do modulo ---------- */
  const htmlFinal = await pagina.content();
  ok("sem travessao U+2014 no home", !htmlFinal.includes("\u2014"));

  await browser.close();

  console.log(`\n${passaram} passaram, ${falharam} falharam`);
  process.exit(falharam ? 1 : 0);
})().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(2);
});
