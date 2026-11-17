/**
 * Teste visual da ESCALAS (Admin. Oficinal > Escalas).
 *
 * Cobre: bloqueio sem sessão (página e papéis), cartão no Home, menu
 * com o grupo Escalas, Mensal (grelha, legenda, feriado a vermelho,
 * saldo de folgas, aviso de auditoria LD+turno, barra de código que
 * grava, gerador do ciclo com aviso), Semanal (Sáb a Sex, bloco de
 * turnos, contactos, link do papel), Folgas Guardadas (saldo com
 * meios dias e registos), Colaboradores (busca sem acentos), 
 * Configurações (registo, grupos, feriados, importador) e os dois
 * papéis A4 (mensal e semanal) com contagens e nota.
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) + mocks de rede
 * no estilo da base real (Playwright route), igual aos outros testes.
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

const HOJE = new Date();
const ANO = HOJE.getFullYear();
const MES = String(HOJE.getMonth() + 1).padStart(2, "0");
const HOJE_ISO = `${ANO}-${MES}-${String(HOJE.getDate()).padStart(2, "0")}`;
const ANO_M = 2026;
const MES_M = "11";

const GENTE = [
  { id: "s1", colaborador_id: 55, codigo: "DM0026", nome: "Mario Jose Guiliche", contacto: "843019613", categoria: "Supervisor Electrico", area: "Supervisores", grupo: null, ordem: 1, ativo: true },
  { id: "a1", colaborador_id: 40, codigo: "DM0120", nome: "Edson Cumbe", contacto: "853141975", categoria: "Mecanico - Grupo A - C.T.", area: "Grupos de Turno", grupo: "A", ordem: 1, ativo: true },
  { id: "a2", colaborador_id: 41, codigo: "DM0262", nome: "Antonio Fernando Francisco", contacto: "871329382", categoria: "Electrico - Grupo A", area: "Grupos de Turno", grupo: "A", ordem: 2, ativo: true },
  { id: "b1", colaborador_id: 42, codigo: "DM0090", nome: "Lino Maitor Joao", contacto: "846541590", categoria: "Mecanico - Grupo B", area: "Grupos de Turno", grupo: "B", ordem: 3, ativo: true },
  { id: "ld1", colaborador_id: 43, codigo: "DM0122", nome: "Friston Homo", contacto: "853177177", categoria: "Electrico - Grupo A", area: "Grupos de Turno", grupo: "A", ordem: 4, ativo: true },
  { id: "p1", colaborador_id: 44, codigo: "DM0038", nome: "Issaias Magul", contacto: "843115742", categoria: "Pneumatico", area: "Pneumáticos", grupo: null, ordem: 1, ativo: true },
  { id: "m1", colaborador_id: 45, codigo: "DM0259", nome: "Nazir Caravela Alberto", contacto: "843115745", categoria: "Mecanico", area: "Mecânica", grupo: null, ordem: 1, ativo: true },
  { id: "e1", colaborador_id: 46, codigo: "DM0064", nome: "Octavio Quissitone", contacto: "843115743", categoria: "Electrico", area: "Eléctrica", grupo: null, ordem: 1, ativo: true },
  { id: "se1", colaborador_id: 47, codigo: "DM0025", nome: "Carlos Sebastiao Caetano", contacto: "843115759", categoria: "Serralheiro - C. G.", area: "Serralharia", grupo: null, ordem: 1, ativo: true },
  { id: "o1", colaborador_id: 48, codigo: "DM0077", nome: "Benildo Novele", contacto: "853169245", categoria: "Adm. Oficinal", area: "Outros", grupo: null, ordem: 1, ativo: true }
];

const DIA = (d, codigo) => ({ colaborador_id: "x", data: `2026-${MES_M}-${String(d).padStart(2, "0")}`, codigo: codigo });

const DIAS_MES = [
  { ...DIA(1, "Sup."), colaborador_id: "s1" },
  { ...DIA(2, "Norm."), colaborador_id: "s1" },
  { ...DIA(2, "07/19"), colaborador_id: "a1" },
  { ...DIA(3, "07/19"), colaborador_id: "a1" },
  { ...DIA(4, "19/07"), colaborador_id: "a1" },
  { ...DIA(5, "19/07"), colaborador_id: "a1" },
  { ...DIA(6, "Folga"), colaborador_id: "a1" },
  { ...DIA(2, "19/07"), colaborador_id: "b1" },
  { ...DIA(3, "19/07"), colaborador_id: "b1" },
  { ...DIA(4, "Folga"), colaborador_id: "b1" },
  { ...DIA(1, "LD"), colaborador_id: "ld1" },
  { ...DIA(2, "07/19"), colaborador_id: "ld1" },
  { ...DIA(2, "Norm."), colaborador_id: "m1" },
  { ...DIA(2, "CCIS"), colaborador_id: "e1" },
  { ...DIA(2, "Esc."), colaborador_id: "p1" },
  { ...DIA(2, "Norm."), colaborador_id: "se1" },
  { ...DIA(2, "TDP"), colaborador_id: "o1" }
];

const MOCK_MES = {
  ok: true,
  hoje: HOJE_ISO,
  ano: ANO_M,
  mes: 11,
  colaboradores: GENTE,
  dias: DIAS_MES,
  nota: "Operação de granito nos dias 07 a 13.",
  feriados: [{ data: "2026-11-25", descricao: "Feriado de prova" }],
  ferias: [{ codigo: "DM0122", data_inicio: "2026-11-01", data_fim: "2026-11-10" }],
  folgasSaldo: [{ colaborador_id: "s1", saldo: 2.5 }]
};

const DIAS_SEMANA = [
  { colaborador_id: "s1", data: "2026-11-07", codigo: "Sup." },
  { colaborador_id: "s1", data: "2026-11-08", codigo: "Sup." },
  { colaborador_id: "a1", data: "2026-11-09", codigo: "07/19" },
  { colaborador_id: "a1", data: "2026-11-10", codigo: "07/19" },
  { colaborador_id: "b1", data: "2026-11-09", codigo: "19/07" },
  { colaborador_id: "m1", data: "2026-11-09", codigo: "Norm." },
  { colaborador_id: "e1", data: "2026-11-10", codigo: "CCIS" },
  { colaborador_id: "p1", data: "2026-11-11", codigo: "Esc." }
];

const MOCK_SEMANA = {
  ok: true,
  hoje: HOJE_ISO,
  inicio: "2026-11-07",
  fim: "2026-11-13",
  colaboradores: GENTE,
  dias: DIAS_SEMANA,
  nota: "Operação de granito nos dias 07 a 13.",
  feriados: [],
  ferias: []
};

const MOCK_FOLGAS = {
  ok: true,
  hoje: HOJE_ISO,
  folgas: [
    { id: "f1", colaborador_id: "s1", data_origem: "2026-10-25", valor: 2.5, data_gozo: null, estado: "guardada", obs: "Saldo trazido do Excel (NOV 2026)" },
    { id: "f2", colaborador_id: "m1", data_origem: "2026-10-18", valor: 1, data_gozo: "2026-10-30", estado: "usada", obs: null }
  ],
  colaboradores: GENTE
};

const MOCK_COLABORADORES = { ok: true, colaboradores: GENTE };

const MOCK_CONFIG = {
  ok: true,
  hoje: HOJE_ISO,
  ano: ANO_M,
  feriados: [
    { data: `${ANO_M}-01-01`, descricao: "Dia do Ano Novo" },
    { data: `${ANO_M}-05-01`, descricao: "Dia do Trabalhador" },
    { data: `${ANO_M + 1}-01-01`, descricao: "Dia do Ano Novo" }
  ],
  totalAtivos: 10,
  totalComContacto: 10,
  turnos: { A: 3, B: 1, C: 0, D: 0 }
};

/* ============ arranque ============ */

(async () => {
  const browser = await chromium.launch();

  /* ---------- 0. Bloqueio sem sessão ---------- */
  const ctxSem = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pgSem = await ctxSem.newPage();
  await pgSem.goto(`${BASE}/escalas`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: /escalas manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await pgSem.goto(`${BASE}/imprimir/escalas/mensal?ano=2026&mes=11`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: o papel mensal tambem manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await ctxSem.close();

  /* ---------- contexto com sessão de estrutura + mocks ---------- */
  const contexto = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);
  contexto.on("dialog", (d) => d.accept());

  const postsDias = [];
  const postsNota = [];
  const postsFolga = [];
  const patchesFolga = [];
  const postsColab = [];
  const patchesColab = [];
  const postsImportar = [];

  await contexto.route("**/api/escalas/mes*", (rota) => rota.fulfill({ json: MOCK_MES }));
  await contexto.route("**/api/escalas/semanal*", (rota) => rota.fulfill({ json: MOCK_SEMANA }));
  await contexto.route("**/api/escalas/folgas", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: MOCK_FOLGAS });
    if (m === "POST") {
      postsFolga.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true } });
    }
    patchesFolga.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route("**/api/escalas/colaboradores*", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: MOCK_COLABORADORES });
    if (m === "POST") {
      postsColab.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true } });
    }
    patchesColab.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route("**/api/escalas/config", (rota) => rota.fulfill({ json: MOCK_CONFIG }));
  await contexto.route("**/api/escalas/nota", async (rota) => {
    postsNota.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { ok: true, texto: "" } });
  });
  await contexto.route("**/api/escalas/dias", async (rota) => {
    postsDias.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { ok: true, gravadas: 1, apagadas: 0 } });
  });
  await contexto.route("**/api/escalas/importar", async (rota) => {
    postsImportar.push(rota.request().postDataJSON());
    const corpo = rota.request().postDataJSON();
    return rota.fulfill({
      json:
        corpo?.tipo === "registo"
          ? { ok: true, pessoas: 117, folgas: 44 }
          : { ok: true, gravadas: 2685, semPessoa: 0, semCodigo: 0 }
    });
  });

  /* ---------- 1. Home e menu ---------- */
  const pgHome = await contexto.newPage();
  await pgHome.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await pgHome.waitForTimeout(900);
  const home = await pgHome.content();
  ok("Home: cartao das Escalas com pill No ar", home.includes("Abrir as Escalas") && home.includes("Escala Mensal editável"));

  /* ---------- 2. Mensal ---------- */
  const pg = await contexto.newPage();
  await pg.goto(`${BASE}/escalas?ano=2026&mes=11`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  const mensal = await pg.content();
  ok("Mensal: titulo e subtitulo", mensal.includes("Escala mensal de Novembro de 2026"));
  ok("Mensal: grelha com o supervisor e codigo", mensal.includes("Mario Jose Guiliche") && mensal.includes("DM0026"));
  ok("Mensal: grupo marcado na linha (GA)", mensal.includes("GA"));
  ok("Mensal: feriado no cabecalho da coluna", mensal.includes("Feriado de prova"));
  ok("Mensal: legenda completa com os 10 codigos", mensal.includes("07/19 - Turno da manhã") && mensal.includes("TDP - Tolerância de ponto"));
  ok("Mensal: saldo de folgas com meio dia (2,5)", mensal.includes("2,5"));
  ok("Mensal: aviso de auditoria LD + turno", mensal.includes("Auditoria (LD e turno no mesmo mês)") && mensal.includes("Friston Homo"));
  ok("Mensal: contagens do dia com total em trabalho", mensal.includes("Contagens do dia") && mensal.includes("Em trabalho"));
  ok("Mensal: botões na ordem da casa", mensal.includes("Férias do plano") && mensal.includes("Gerar ciclo de turnos") && mensal.includes("Feriados") && mensal.includes("Norm. nas vazias"));
  ok("Mensal: nota do mes presente", mensal.includes("Operação de granito"));
  ok("Mensal: links da semana e do papel", mensal.includes("/escalas/semanal") && mensal.includes("/imprimir/escalas/mensal"));

  // barra de código: clicar numa célula vazia do Nazir (dia 3) e marcar Norm.
  const celulaAlvo = pg.locator('button[aria-label="Nazir Caravela Alberto dia 2026-11-03"]');
  await celulaAlvo.click();
  await pg.waitForTimeout(300);
  ok("Mensal: barra de codigo abre ao clicar celula", (await pg.locator('[data-barra-codigo]').count()) === 1);
  await pg.locator('[data-barra-codigo] button', { hasText: "Norm." }).first().click();
  await pg.waitForTimeout(1700);
  const postDias1 = postsDias.find((p) => p?.linhas?.some((l) => l.id === "m1" && l.celulas?.["2026-11-03"] === "Norm."));
  ok("Mensal: marcar Norm. grava via POST na celula certa", !!postDias1, JSON.stringify(postsDias).slice(0, 160));

  // gerador do ciclo: âncora 2026-11-01 para o grupo A (ld1 tem LD: fica fora com aviso)
  await pg.locator('button', { hasText: "Gerar ciclo de turnos" }).first().click();
  await pg.waitForTimeout(300);
  await pg.locator('input[type="date"]').first().fill("2026-11-01");
  await pg.waitForTimeout(500);
  ok("Mensal: gerador mostra preview de celulas", (await pg.locator('[data-preview-ciclo]').count()) === 1);
  const preview = await pg.locator('[data-preview-ciclo]').textContent();
  ok("Mensal: gerador avisa a pessoa com LD", preview.includes("Auditoria") || (await pg.locator('[data-preview-ciclo] li').count()) >= 1);
  await pg.locator('button', { hasText: "Aplicar" }).last().click();
  await pg.waitForTimeout(1700);
  const postCiclo = postsDias.find((p) => p?.linhas?.some((l) => l.id === "a2"));
  ok("Mensal: aplicar o ciclo grava as celulas do grupo", !!postCiclo, JSON.stringify(postsDias.length));
  const celulasCiclo = postCiclo?.linhas?.find((l) => l.id === "a2")?.celulas || {};
  ok("Mensal: ciclo do grupo A nasce no dia da ancora", celulasCiclo["2026-11-01"] === "07/19" && celulasCiclo["2026-11-03"] === "19/07");

  /* ---------- 3. Semanal ---------- */
  const pgSem2 = await contexto.newPage();
  await pgSem2.goto(`${BASE}/escalas/semanal?inicio=2026-11-07`, { waitUntil: "domcontentloaded" });
  await pgSem2.waitForTimeout(1000);
  const semanal = await pgSem2.content();
  ok("Semanal: semana de Sabado a Sexta", semanal.includes("Sáb 07/11 a Sex 13/11"));
  ok("Semanal: bloco de turnos com nomes", semanal.includes("Turno 07/19") && semanal.includes("Edson Cumbe"));
  ok("Semanal: rótulos de área no bloco de turnos", semanal.includes("Tur:") && semanal.includes("Ele:"));
  ok("Semanal: grelha com contactos para o cliente", semanal.includes("843019613"));
  ok("Semanal: link do papel da semana", semanal.includes("/imprimir/escalas/semanal?inicio=2026-11-07"));
  ok("Semanal: setas de semana", (await pgSem2.locator('[aria-label="Semana seguinte"]').count()) === 1);

  /* ---------- 4. Folgas Guardadas ---------- */
  const pgF = await contexto.newPage();
  await pgF.goto(`${BASE}/escalas/folgas`, { waitUntil: "domcontentloaded" });
  await pgF.waitForTimeout(1000);
  await pgF.locator('label', { hasText: "só guardadas" }).locator('input').uncheck();
  await pgF.waitForTimeout(300);
  const folgas = await pgF.content();
  ok("Folgas: saldo com meio dia na tabela", folgas.includes("2,5") && folgas.includes("Mario Jose Guiliche"));
  ok("Folgas: registos com estados guardada e gozada", folgas.includes("guardada") && folgas.includes("gozada"));
  ok("Folgas: saldo trazido do Excel no obs", folgas.includes("Saldo trazido do Excel"));
  await pgF.locator('button', { hasText: "Nova folga guardada" }).click();
  await pgF.waitForTimeout(300);
  ok("Folgas: dialog nova folga abre", (await pgF.locator('[aria-label="Nova folga guardada"]').count()) === 1);
  await pgF.locator('[aria-label="Nova folga guardada"] select').first().selectOption("m1");
  await pgF.locator('[aria-label="Nova folga guardada"] button', { hasText: "Guardar" }).click();
  await pgF.waitForTimeout(400);
  const postFolga = postsFolga[0];
  ok("Folgas: POST com pessoa e valor", postFolga?.colaborador_id === "m1" && postFolga?.valor === 1);
  await pgF.locator('button', { hasText: "Marcar gozo" }).first().click();
  await pgF.waitForTimeout(300);
  await pgF.locator('[aria-label="Marcar gozo"] button', { hasText: "Marcar" }).click();
  await pgF.waitForTimeout(400);
  ok("Folgas: PATCH de gozo com acao", patchesFolga[0]?.acao === "gozo");

  /* ---------- 5. Colaboradores ---------- */
  const pgC = await contexto.newPage();
  await pgC.goto(`${BASE}/escalas/colaboradores`, { waitUntil: "domcontentloaded" });
  await pgC.waitForTimeout(1000);
  ok("Colaboradores: lista com 10 pessoas", (await pgC.locator('table tbody tr').count()) === 10);
  await pgC.locator('input[aria-label="Buscar"]').fill("mario");
  await pgC.waitForTimeout(300);
  ok("Colaboradores: busca filtra por nome", (await pgC.locator('table tbody tr').count()) === 1);
  await pgC.locator('input[aria-label="Buscar"]').fill("dm0120");
  await pgC.waitForTimeout(300);
  ok("Colaboradores: busca tambem por codigo", (await pgC.locator('table tbody tr').count()) === 1);
  await pgC.locator('button', { hasText: "Nova pessoa" }).click();
  await pgC.waitForTimeout(300);
  ok("Colaboradores: dialog nova pessoa com area e grupo", (await pgC.locator('[role="dialog"] select').count()) >= 2);

  /* ---------- 6. Configurações ---------- */
  const pgX = await contexto.newPage();
  await pgX.goto(`${BASE}/escalas/configuracoes`, { waitUntil: "domcontentloaded" });
  await pgX.waitForTimeout(1000);
  const config = await pgX.content();
  ok("Configuracoes: saude do registo", config.includes("Registo") && config.includes("com contacto"));
  ok("Configuracoes: composicao dos grupos", config.includes("Grupo A") && config.includes("Grupo D"));
  ok("Configuracoes: feriados lidos do Plano de Ferias", config.includes("Dia do Trabalhador") && config.includes("ferias_feriados"));
  ok("Configuracoes: importador presente", config.includes("Importar o Excel da escala mensal") && config.includes("Escolher ficheiro"));

  /* ---------- 7. Papel A4 mensal ---------- */
  const pgPM = await contexto.newPage();
  await pgPM.goto(`${BASE}/imprimir/escalas/mensal?ano=2026&mes=11`, { waitUntil: "domcontentloaded" });
  await pgPM.waitForTimeout(1200);
  const papelM = await pgPM.content();
  ok("Papel mensal: cabecalho DANMO e titulo do mes", papelM.includes("DANMO SERVICE SYSTEM, LDA") && papelM.includes("ESCALA MENSAL - NOVEMBRO 2026"));
  ok("Papel mensal: grelha com secoes escuras", papelM.includes("Grupos de Turno") && papelM.includes("Supervisores"));
  ok("Papel mensal: contagens e total", papelM.includes("Contagens do dia") && papelM.includes("TOTAL EM TRABALHO NO DIA"));
  ok("Papel mensal: coluna de folgas", papelM.includes("Folgas"));
  ok("Papel mensal: legenda e nota", papelM.includes("CCIS - Trabalhos na CCIS") && papelM.includes("NOTA IMPORTANTE: Operação de granito"));
  ok("Papel mensal: codigo do colaborador", papelM.includes("DM0026"));

  /* ---------- 8. Papel A4 semanal ---------- */
  const pgPS = await contexto.newPage();
  await pgPS.goto(`${BASE}/imprimir/escalas/semanal?inicio=2026-11-07`, { waitUntil: "domcontentloaded" });
  await pgPS.waitForTimeout(1200);
  const papelS = await pgPS.content();
  ok("Papel semanal: titulo da semana", papelS.includes("ESCALA SEMANAL - Sáb 07/11 a Sex 13/11 2026"));
  ok("Papel semanal: bloco de turnos dia a dia", papelS.includes("Turno 19/07") && papelS.includes("Supervisão"));
  ok("Papel semanal: contactos na grelha", papelS.includes("843115745"));
  ok("Papel semanal: legenda", papelS.includes("Esc. - Escalados para o Dia"));

  await contexto.close();
  await browser.close();

  console.log(`\n${passaram} passaram, ${falharam} falharam`);
  process.exit(falharam ? 1 : 0);
})().catch((e) => {
  console.error("ERRO DO TESTE:", e);
  process.exit(1);
});
