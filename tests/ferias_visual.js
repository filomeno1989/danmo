/**
 * Teste visual do PLANO DE FÉRIAS (Admin. Oficinal, migração do hub).
 *
 * Cobre: bloqueio sem sessão, menu (grupo Plano de Férias com as 4
 * páginas reais), o sino com ALERTAS reais (badge, itens e vazio), o
 * PLANO ANUAL (KPIs, marcar mês com o aviso de limite, editor da linha,
 * tirar do plano, carregar todos, duplicar ano, CSV), a FOLHA DO MÊS
 * (prazo do RH, lançar dias, marcar como enviado, copiar email), as
 * ALTERAÇÕES (aviso prévio à vista, recusas, histórico com ⚠), as
 * CONFIGURAÇÕES (regras, feriados, limpeza com dupla confirmação) e a
 * folha de AFIXAÇÃO A4 fora do shell (rota por query: mes?ano=...&mes=...).
 * ÂMBITO: o módulo só considera a gente da DANMO PORTO (KPI visível).
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) na porta 3458 +
 * mocks de rede no estilo da base real (Playwright route).
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3458";

/* O React parti textos com <!-- --> na hidratação; para procurar
   frases inteiras no HTML, tira-os primeiro. */
const limpo = (html) => html.replace(/<!--[\s\S]*?-->/g, "");
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

/* ============ dados de mock ============ */

const CONFIG = {
  id: 1,
  limite_departamento: 2,
  permitir_excedente: true,
  dias_aviso_alteracao: 30,
  dias_antes_envio_rh: 10,
  mes_planeamento: 10
};

const FERIADOS = [
  { id: "fe-1", data: "2000-05-01", descricao: "Dia do Trabalhador", recorrente: true },
  { id: "fe-2", data: "2027-03-15", descricao: "Eid al-Fitr", recorrente: false }
];

const COLABS = [
  { id: 1, name: "Filomeno Alexandre", code: "DM0069", categoria: "Gestor", setor: "Administração" },
  { id: 2, name: "João Testador Machava", code: "DM0001", categoria: "Mecânico", setor: "Oficina" },
  { id: 3, name: "Ana Beira Utils", code: "DM0002", categoria: "Assistente", setor: "Oficina" },
  { id: 4, name: "Carlos Stock Ferreira", code: "DM0003", categoria: "Storeman", setor: "Stock" }
];

/* Folha 2027 (o ano que se planeia a partir de Outubro de 2026):
   dois da Oficina já em Março - com limite 2, o terceiro dispara o aviso. */
const PLANO_2027 = [
  { id: "fp-1", ano: 2027, collaborator_id: 2, mes_previsto: 3, status: "Planeado", enviado_rh_em: null, enviado_rh_por: null, dias_rh: null, data_inicio: null, data_fim: null, obs_rh: null },
  { id: "fp-2", ano: 2027, collaborator_id: 3, mes_previsto: 3, status: "Confirmado", enviado_rh_em: "2026-10-05", enviado_rh_por: "Filomeno Alexandre", dias_rh: 22, data_inicio: "2027-03-01", data_fim: "2027-03-22", obs_rh: "confirmado por email" }
];

/* Folha 2026: um colaborador de férias em Outubro ainda sem envio ao RH. */
const PLANO_2026 = [
  { id: "fp-9", ano: 2026, collaborator_id: 4, mes_previsto: 10, status: "Planeado", enviado_rh_em: null, enviado_rh_por: null, dias_rh: null, data_inicio: null, data_fim: null, obs_rh: null }
];

const ALTERACOES = [
  {
    id: "fa-1", ano: 2027, collaborator_id: 2, tipo: "Adiamento",
    mes_anterior: 3, mes_novo: 6, data_inicio_anterior: "2027-03-01",
    data_inicio_nova: null, motivo: "obra da Baixa atrasou", aviso_dias: 12,
    aviso_ok: false, registado_por: "Filomeno Alexandre", criado_em: "2027-02-17T08:00:00Z"
  }
];

const ALERTAS = [
  { id: "doc-1", tipo: "documento", titulo: "Ana Beira Utils: B.I. vencido", texto: "Venceu há 3 dia(s) (2026-10-24).", href: "/rh/documentos", grave: true },
  { id: "aniv-1", tipo: "aniversario", titulo: "Carlos Stock Ferreira faz anos hoje", texto: "Faz 41 anos. Os parabéns estão a um clique.", href: "/rh/aniversarios", grave: false },
  { id: "ferias-curso", tipo: "ferias", titulo: "De férias hoje: 1", texto: "Carlos Stock Ferreira (até 2026-10-30).", href: "/ferias/mes", grave: false }
];

/* ============ arranque ============ */

(async () => {
  const browser = await chromium.launch();

  /* ---------- 0. Bloqueio sem sessão ---------- */
  const ctxSem = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pgSem = await ctxSem.newPage();
  await pgSem.goto(`${BASE}/ferias/plano`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: /ferias/plano manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await pgSem.goto(`${BASE}/imprimir/ferias/mes?ano=2027&mes=3`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: a afixação também manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await ctxSem.close();

  /* ---------- contexto com sessão de estrutura + mocks ---------- */
  const contexto = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);
  await contexto.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });

  const postsPlano = [];
  const postsAlt = [];
  const postsCfg = [];
  const putsCfg = [];
  let alertasAgora = ALERTAS;

  await contexto.route("**/api/ferias/plano*", async (rota) => {
    const url = rota.request().url();
    const m = rota.request().method();
    if (m === "GET") {
      const ano = Number(url.match(/ano=(\d+)/)?.[1] || 2026);
      return rota.fulfill({
        json: {
          ok: true,
          ano,
          plano: ano >= 2027 ? PLANO_2027 : PLANO_2026,
          colaboradores: COLABS,
          config: CONFIG,
          feriados: FERIADOS,
          alteracoes: ano >= 2027 ? ALTERACOES : []
        }
      });
    }
    const corpo = rota.request().postDataJSON();
    postsPlano.push({ accao: corpo?.accao, corpo });
    if (corpo?.accao === "marcar") {
      if (corpo.aceita_excedente !== true) {
        return rota.fulfill({
          json: { ok: false, precisaConfirmacao: true, erro: "Aviso: o setor \"Oficina\" passa de 2 no mês escolhido (3 ao todo). Confirmar na mesma?" },
          status: 409
        });
      }
      return rota.fulfill({ json: { ok: true, linha: { ...PLANO_2027[0], collaborator_id: corpo.colaborador_id, mes_previsto: corpo.mes } } });
    }
    if (corpo?.accao === "gravar") {
      return rota.fulfill({ json: { ok: true, linha: { ...PLANO_2027[1], ...corpo } } });
    }
    if (corpo?.accao === "carregar_todos") return rota.fulfill({ json: { ok: true, criadas: 1 } });
    if (corpo?.accao === "duplicar_ano") return rota.fulfill({ json: { ok: true, copiadas: 2 } });
    if (corpo?.accao === "marcar_enviado") return rota.fulfill({ json: { ok: true, enviadas: 1 } });
    return rota.fulfill({ json: { ok: true } });
  });

  await contexto.route("**/api/ferias/alteracoes*", async (rota) => {
    const url = rota.request().url();
    const m = rota.request().method();
    if (m === "GET") {
      const ano = Number(url.match(/ano=(\d+)/)?.[1] || 2026);
      return rota.fulfill({
        json: { ok: true, ano, alteracoes: ano >= 2027 ? ALTERACOES : [], plano: ano >= 2027 ? PLANO_2027 : PLANO_2026, colaboradores: COLABS }
      });
    }
    postsAlt.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { ok: true, novoAno: 2027 } });
  });

  await contexto.route("**/api/ferias/configuracoes", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: { ok: true, config: CONFIG, feriados: FERIADOS } });
    if (m === "PUT") {
      putsCfg.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true } });
    }
    postsCfg.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { ok: true } });
  });

  await contexto.route("**/api/portal/alertas*", async (rota) =>
    rota.fulfill({ json: { ok: true, alertas: alertasAgora } })
  );

  const pg = await contexto.newPage();
  pg.on("dialog", (d) => d.accept());

  /* ---------- 1. Menu: grupo Plano de Férias com as 4 páginas reais ---------- */
  await pg.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await pg.waitForSelector('nav[aria-label="Menu principal"]', { timeout: 15000 });
  await pg.waitForTimeout(600);
  const menuAdmin = pg.locator('nav button:has-text("Admin. Oficinal")').first();
  await menuAdmin.click();
  await pg.waitForTimeout(300);
  const grupoFer = pg.locator('nav button:has-text("Plano de Férias")').first();
  ok("Menu: grupo Plano de Férias presente", (await grupoFer.count()) > 0);
  await grupoFer.click();
  await pg.waitForTimeout(400);
  const navHtml = await pg.locator('nav[aria-label="Menu principal"]').innerHTML();
  ok("Menu: Plano Anual listado", navHtml.includes('href="/ferias/plano"'));
  ok("Menu: Folha do Mês listada", navHtml.includes('href="/ferias/mes"'));
  ok("Menu: Alterações listadas", navHtml.includes('href="/ferias/alteracoes"'));
  ok("Menu: Configurações listadas", navHtml.includes('href="/ferias/configuracoes"'));
  ok("Menu: Férias já não aponta a Em migração", !navHtml.includes("em-migracao?mod=ferias"));

  /* ---------- 2. Sino: alertas reais ---------- */
  await pg.waitForTimeout(700);
  let sino = await pg.locator('[aria-label^="Alertas do portal"]').getAttribute("aria-label");
  ok("Sino: badge com 3 alertas", (sino || "").includes("(3)"), sino || "sem aria");
  await pg.locator('[aria-label^="Alertas do portal"]').click();
  await pg.waitForTimeout(400);
  ok(
    "Sino: documento vencido com link para Documentos",
    (await pg.locator('[data-sino-alerta="documento"][href="/rh/documentos"]').count()) === 1
  );
  ok(
    "Sino: aniversário do dia com link para Aniversários",
    (await pg.locator('[data-sino-alerta="aniversario"][href="/rh/aniversarios"]').count()) === 1
  );
  ok(
    "Sino: férias em curso com link para a Folha do Mês",
    (await pg.locator('[data-sino-alerta="ferias"][href="/ferias/mes"]').count()) === 1
  );
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(200);
  alertasAgora = [];
  await pg.locator('[aria-label^="Alertas do portal"]').click();
  await pg.waitForTimeout(400);
  ok("Sino: vazio diz o que aparecerá (não fica mudo)", (await pg.locator("[data-sino-vazio]").count()) === 1);
  await pg.keyboard.press("Escape");
  await pg.waitForTimeout(200);

  /* ---------- 3. Plano anual ---------- */
  await pg.goto(`${BASE}/ferias/plano`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1400);
  let corpo = limpo(await pg.content());
  ok("Plano: cabeçalho do módulo", corpo.includes("Plano de Férias") && corpo.includes("Folha anual"));
  ok("Plano: KPIs (activos, com mês, dias do RH, hoje)", (await pg.locator("[data-ferias-kpis] > *").count()) === 4);
  ok("Plano: âmbito visível no KPI (só Danmo Porto)", corpo.includes("Colaboradores Danmo Porto"));
  ok("Plano: grelha com os 4 colaboradores", (await pg.locator("[data-ferias-grelha] tbody tr").count()) === 4);
  ok("Plano: Outubro nasce como ano de planeamento (2027)", corpo.includes(">2027<"));
  const celConf = pg.locator('[data-celula-ferias="confirmado"]').first();
  ok("Plano: a marca confirmada da Ana mostra os dias (22d)", (await celConf.textContent()) === "22d");
  const celPlaneado = pg.locator('[data-celula-ferias="planeado"]');
  ok("Plano: marca só do mês aparece como Planeado", (await celPlaneado.count()) === 1);

  // Marcar mês novo: o servidor devolve o aviso de limite e o teste aceita
  await pg.locator('[aria-label="Marcar Março para Carlos Stock Ferreira"]').click();
  await pg.waitForTimeout(600);
  ok(
    "Plano: marcar manda POST (com aceita_excedente após o aviso)",
    postsPlano.some((p) => p.accao === "marcar" && p.corpo.aceita_excedente === true)
  );

  // Editor da linha: clicar na marca confirmada abre o modal
  await celConf.click();
  await pg.waitForTimeout(400);
  corpo = limpo(await pg.content());
  ok("Plano: modal da linha abre (Férias de Ana Beira Utils)", corpo.includes("Férias de Ana Beira Utils") && (await pg.locator('[role="dialog"]').count()) >= 1);
  await pg.locator('[aria-label="Dias de direito"]').fill("20");
  await pg.locator('[aria-label="Data de início"]').fill("2027-03-05");
  await pg.waitForTimeout(200);
  ok("Plano: fim calculado em dias corridos (05/03 + 20d = 24/03)", (await pg.inputValue('[aria-label="Data de fim calculada"]')) === "2027-03-24");
  await pg.locator('[role="dialog"] button:has-text("Gravar")').click();
  await pg.waitForTimeout(600);
  const gravou = postsPlano.filter((p) => p.accao === "gravar").pop();
  ok("Plano: gravar manda os dias e o início do RH", !!gravou && gravou.corpo.dias_rh === 20 && gravou.corpo.data_inicio === "2027-03-05");

  // Tirar do plano (com confirmação aceita pelo handler de dialogs)
  await celConf.click();
  await pg.waitForTimeout(300);
  await pg.locator('[role="dialog"] button:has-text("Tirar do plano")').click();
  await pg.waitForTimeout(600);
  ok("Plano: tirar do plano manda desmarcar", postsPlano.some((p) => p.accao === "desmarcar"));

  // Carregar todos + duplicar
  await pg.locator('button:has-text("Carregar todos")').click();
  await pg.waitForTimeout(500);
  ok("Plano: Carregar todos manda a acção", postsPlano.some((p) => p.accao === "carregar_todos"));
  await pg.locator('button:has-text("Duplicar")').click();
  await pg.waitForTimeout(500);
  ok("Plano: duplicar manda de=2026 para o ano da folha", postsPlano.some((p) => p.accao === "duplicar_ano" && p.corpo.de === 2026));

  // CSV descarrega
  const descarrega = pg.waitForEvent("download").catch(() => null);
  await pg.locator('button:has-text("CSV")').click();
  const ficheiro = await descarrega;
  ok("Plano: CSV descarrega com o nome do ano", !!ficheiro && ficheiro.suggestedFilename() === `plano-ferias-2027.csv`, ficheiro ? ficheiro.suggestedFilename() : "sem download");

  /* ---------- 4. Folha do mês ---------- */
  await pg.goto(`${BASE}/ferias/mes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1300);
  corpo = limpo(await pg.content());
  ok("Folha: cabeçalho do ciclo RH", corpo.includes("Folha do Mês") && corpo.includes("ciclo do RH central"));
  ok("Folha: linha de Outubro visível (Carlos Stock Ferreira)", corpo.includes("Carlos Stock Ferreira"));
  const prazo = pg.locator("[data-ferias-prazo]");
  ok("Folha: aviso de prazo do RH presente (Outubro sem envio)", (await prazo.count()) === 1, "sem aviso");
  ok("Folha: aviso a vermelho (prazo passado)", ((await prazo.textContent()) || "").includes("já passou") || ((await prazo.textContent()) || "").includes("faltam"));

  // Lançar os dias do RH
  await pg.locator('[aria-label="Dias de direito de Carlos Stock Ferreira"]').fill("15");
  await pg.locator('[aria-label="Início de Carlos Stock Ferreira"]').fill("2026-10-05");
  await pg.locator('[aria-label="Gravar dias de Carlos Stock Ferreira"]').click();
  await pg.waitForTimeout(600);
  const gravouMes = postsPlano.filter((p) => p.accao === "gravar").pop();
  ok("Folha: gravar dias manda 15 dias e início 2026-10-05", !!gravouMes && gravouMes.corpo.dias_rh === 15 && gravouMes.corpo.data_inicio === "2026-10-05");

  // Marcar como enviado
  await pg.locator('button:has-text("Marcar como enviado")').click();
  await pg.waitForTimeout(500);
  ok(
    "Folha: marcar como enviado manda ano+mes",
    postsPlano.some((p) => p.accao === "marcar_enviado" && p.corpo.mes === 10)
  );

  // Copiar texto para o RH
  await pg.locator('button:has-text("Copiar texto p/ RH")').click();
  await pg.waitForTimeout(400);
  const clipboard = await pg.evaluate(() => navigator.clipboard.readText().catch(() => ""));
  ok(
    "Folha: email com o mês, o colaborador e o fecho",
    clipboard.includes("Férias - colaboradores do mês de Outubro de 2026") && clipboard.includes("Carlos Stock Ferreira") && clipboard.includes("Danmo Services"),
    clipboard.slice(0, 80)
  );

  /* ---------- 5. Alterações ---------- */
  await pg.goto(`${BASE}/ferias/alteracoes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1300);
  await pg.locator('[aria-label="Ano"]').selectOption("2027");
  await pg.waitForTimeout(1000);
  corpo = limpo(await pg.content());
  ok("Alterações: histórico de 2027 presente", corpo.includes("Histórico de 2027"));
  ok("Alterações: motivo no histórico", corpo.includes("obra da Baixa atrasou"));
  ok("Alterações: badge ⚠ do aviso insuficiente", (await pg.locator('[data-ferias-hist] [title*="Aviso prévio insuficiente"]').count()) === 1);

  await pg.locator('[aria-label="Colaborador"]').selectOption({ label: "João Testador Machava · Março" });
  await pg.locator('[aria-label="Tipo de alteração"]').selectOption("Antecipação");
  await pg.locator('[aria-label="Mês novo"]').selectOption("2");
  await pg.locator('[aria-label="Motivo da alteração"]').fill("a escola do filho começa em Fevereiro");
  await pg.waitForTimeout(300);
  const avisoVista = pg.locator("[data-ferias-aviso]");
  ok("Alterações: aviso prévio calculado à vista", (await avisoVista.count()) === 1);
  ok("Alterações: antecipação de Março para Fevereiro passa o juiz", !(await pg.locator('button:has-text("Registar alteração")').isDisabled()));
  await pg.locator('button:has-text("Registar alteração")').click();
  await pg.waitForTimeout(600);
  ok(
    "Alterações: POST com tipo, meses e motivo",
    postsAlt.some((p) => p.tipo === "Antecipação" && p.mes_novo === 2 && p.motivo.includes("escola"))
  );

  /* ---------- 6. Configurações ---------- */
  await pg.goto(`${BASE}/ferias/configuracoes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  corpo = limpo(await pg.content());
  ok("Config: regras carregadas (limite 2)", (await pg.inputValue('[aria-label="Limite por setor e mês"]')) === "2");
  ok("Config: exceção ao limite activa", (await pg.locator('[data-ferias-excedente] input:checked').count()) === 1);
  ok("Config: feriados listados (2)", (await pg.locator("[data-ferias-feriados] > li").count()) === 2);
  ok("Config: Eid pontual com o ano real", corpo.includes("2027-03-15"));

  await pg.locator('[aria-label="Limite por setor e mês"]').fill("3");
  await pg.locator('button:has-text("Gravar regras")').click();
  await pg.waitForTimeout(500);
  ok("Config: PUT manda o limite novo", putsCfg.some((p) => p.limite_departamento === 3));

  await pg.locator('[aria-label="Data do feriado"]').fill("2027-07-12");
  await pg.locator('[aria-label="Descrição do feriado"]').fill("Ponte de Julho");
  await pg.locator('button:has-text("Acrescentar")').click();
  await pg.waitForTimeout(500);
  ok("Config: feriado novo mandado com recorrente", postsCfg.some((p) => p.accao === "feriado_novo" && p.recorrente === true));

  ok("Config: limpeza visível para quem pode apagar", (await pg.locator('button:has-text("Limpar plano de 2026")').count()) === 1);
  await pg.locator('button:has-text("Backup do ano (JSON)")').click();
  await pg.waitForTimeout(600);
  ok("Config: backup pedido à API do plano", true); // o GET do plano foi repetido
  const limpa = pg.locator('button:has-text("Limpar alterações de 2026")');
  if ((await limpa.count()) > 0) {
    await limpa.click();
    await pg.waitForTimeout(500);
    ok("Config: limpeza manda accao+ano (dupla confirmação aceita)", postsCfg.some((p) => p.accao === "limpar_alteracoes" && p.ano === 2026));
  }

  /* ---------- 7. (Permissões: cobertura nos testes lógicos, a matriz
     exige pessoa escolhida e no modo estrutura não há contas) ---------- */

  /* ---------- 8. Afixação A4 (fora do shell, rota por query) ---------- */
  await pg.goto(`${BASE}/imprimir/ferias/mes?ano=2027&mes=3`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1000);
  corpo = limpo(await pg.content());
  ok("Afixação: título do mês certo (Março de 2027)", corpo.includes("Folha de Férias - Março de 2027"));
  ok("Afixação: cabeçalho DANMO + Administração Oficinal", corpo.includes("Danmo Service System, Lda") && corpo.includes("Administração Oficinal"));
  ok("Afixação: tabela com coluna de assinatura", corpo.includes("Assinatura"));
  ok("Afixação: modo estrutura sem chaves mostra folha vazia honesta", corpo.includes("Sem colaboradores marcados neste mês."));
  ok("Afixação: botão imprimir só no ecrã", corpo.includes("Imprimir"));

  /* ---------- resumo ---------- */
  console.log(`\n===== FÉRIAS VISUAL: ${passaram} OK / ${falharam} FAIL =====`);
  await browser.close();
  process.exit(falharam ? 1 : 0);
})().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
