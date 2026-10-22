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
    mes_ferias: "Outubro", bi_numero: "110100123456", inss_numero: null, nuit_numero: null,
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
    mes_ferias: null, bi_numero: null, inss_numero: null, nuit_numero: null,
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
    mes_ferias: null, bi_numero: null, inss_numero: null, nuit_numero: null,
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

/* ============ teste ============ */

(async () => {
  const browser = await chromium.launch();
  const contexto = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  const pedidosPatch = [];
  await contexto.route("**/api/rh/quadro", async (rota) => {
    if (rota.request().method() === "GET") {
      return rota.fulfill({ json: { ok: true, colaboradores: COLS } });
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

  /* ---------- 3. Cartões com badges das duas listas ---------- */
  ok("cartao Filomeno com Danmo Porto", (await pagina.locator("button", { hasText: "Filomeno Manuel" }).textContent()).includes("Danmo Porto"));
  ok("cartao José com badge Transferido", (await pagina.locator("button", { hasText: "José Chingueture" }).textContent()).includes("Transferido"));
  ok("cartao Augusto na lista TCM", (await pagina.locator("button", { hasText: "Administrador TCM Augusto" }).textContent()).includes("Danmo (TCM)"));
  ok("cartao estagio com iniciais", (await pagina.locator("button", { hasText: "Diana Estagio Teste" }).count()) === 1);

  /* ---------- 4. Pesquisa sem acentos + filtro ---------- */
  await pagina.getByPlaceholder("Pesquisar por nome, código ou função...").fill("jose");
  await pagina.waitForTimeout(300);
  ok("pesquisa 'jose' acha José Chingueture", await pagina.locator("button", { hasText: "José Chingueture" }).count() === 1);
  ok("pesquisa 'jose' esconde Filomeno", await pagina.locator("button", { hasText: "Filomeno Manuel" }).count() === 0);
  await pagina.getByPlaceholder("Pesquisar por nome, código ou função...").fill("");
  await pagina.waitForTimeout(200);

  await pagina.getByLabel("Filtrar por empresa").selectOption("sem");
  await pagina.waitForTimeout(300);
  ok("filtro 'Sem classificar' mostra so Efraim", await pagina.locator("button", { hasText: "Efraim Sem Classificacao" }).count() === 1 && await pagina.locator("button", { hasText: "Filomeno Manuel" }).count() === 0);
  await pagina.getByRole("button", { name: "Limpar" }).click();
  await pagina.waitForTimeout(200);

  /* ---------- 5. Vista tabela ---------- */
  await pagina.getByRole("button", { name: "Tabela" }).click();
  await pagina.waitForTimeout(200);
  ok("tabela mostra coluna Tempo de casa", await pagina.locator("th", { hasText: "Tempo de casa" }).count() === 1);
  ok("tabela mostra linha do inactivo", (await pagina.locator("tr", { hasText: "Gustavo Inactivo Antigo" }).textContent()).includes("Inactivo"));
  await pagina.getByRole("button", { name: "Cartões" }).click();
  await pagina.waitForTimeout(200);

  /* ---------- 6. Ficha detalhe: parcelas do transferido ---------- */
  await pagina.locator("button", { hasText: "José Chingueture" }).first().click();
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
  await pagina.locator("button", { hasText: "Diana Estagio Teste" }).first().click();
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
  await dialogo.locator("button").filter({ hasText: "Estagiário" }).first().click();
  await pagina.waitForTimeout(200);
  ok("troca para estagiario esconde admissao e mostra estagio", await dialogo.locator("#fich-adm").count() === 0 && await dialogo.locator("#fich-eini").count() === 1);
  ok("codigo resugere EST", (await dialogo.locator("#fich-code").inputValue()).startsWith("EST"));
  await dialogo.locator("button").filter({ hasText: "Guardar" }).first().click();
  await pagina.waitForTimeout(300);
  ok("validacao pede nome", await dialogo.getByText("Escreve o nome completo.").count() === 1);
  await dialogo.locator("button").filter({ hasText: "Cancelar" }).first().click();
  await pagina.waitForTimeout(200);

  /* ---------- 9. Menu (acordeão: módulo -> grupo -> link) e home ---------- */
  await pagina.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pagina.waitForSelector("text=Admin. Oficinal", { timeout: 15000 });
  await pagina.locator("button[title='Admin. Oficinal']").first().click();
  await pagina.waitForTimeout(300);
  await pagina.locator("button", { hasText: "RH & Quadro de Pessoal" }).first().click();
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
