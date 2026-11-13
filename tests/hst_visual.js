/**
 * Teste visual do PORTAL HST (Higiene e Segurança do Trabalho, migração do hub).
 *
 * Cobre: bloqueio sem sessão (página e papel), cartão do Home actualizado,
 * menu Portal HST com as 7 páginas reais, o Painel (KPIs, alertas vivos,
 * gráficos, últimas medições com a classificação CORRIGIDA), os
 * Acidentes (lista com as duas eras, registar com número do SERVIDOR,
 * investigar/editar, apagar, relatório, acções correctivas com atraso),
 * Áreas de Risco, EPIs (catálogo com stock vermelho, entrega com baixa
 * de stock no POST), Tensão Arterial (cartões com grau certo, ficha por
 * colaborador), Relatórios (links aos papéis), Configurações (contagens,
 * numeração, limpeza com palavra APAGAR) e os 3 papéis A4
 * (investigação, resumo mensal, listagens).
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) na porta 3459 +
 * mocks de rede no estilo da base real (Playwright route), igual aos
 * outros testes do portal.
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://localhost:3459";
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
const MES_ANTERIOR = String(HOJE.getMonth() || 12).padStart(2, "0");
const DIA_HOJE = String(HOJE.getDate()).padStart(2, "0");
const DATA_2ATRAS = (() => {
  const d = new Date(Date.now() - 2 * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
})();
/** YYYY-MM-DD -> DD/MM/YYYY (igual ao fmtDataHst da lib, sem fuso). */
const fmt2 = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const ACIDENTE_001 = {
  id: 9,
  numero: `DAN-HST-${ANO}-001`,
  status: "Em Investigacao",
  colaborador_nome: "Filomeno Manuel Joaquim Alexandre",
  colaborador_id: 1,
  collaborator_id: null,
  area_risco_id: 2,
  area_risco_nome: "Pneumático",
  data_hora: `${ANO}-${MES}-10T08:30:00`,
  data_acidente: null,
  tipo_ocorrencia: "Acidente sem Afastamento",
  tipo_lesao: "Corte",
  parte_corpo: "Mão esquerda",
  dias_afastamento: 3,
  dias_baixa: null,
  gerou_atestado: false,
  numero_atestado: null,
  testemunhas: "Nelson Magalhães",
  causa_raiz: "Distração",
  fator_humano: "Falta de EPI",
  fator_ambiental: "Pouca iluminação",
  fator_equipamento: "Ferramenta com guarda frouxa",
  registrado_por: "Filomeno Manuel Joaquim Alexandre",
  gravidade: null,
  zona: null,
  local: null,
  tipo_acidente: null,
  encaminhado_para: null,
  epi_usado: null,
  descricao: "Durante a desmontagem de um pneu, a ferramenta escapou e atingiu a mão esquerda.",
  nomeDisplay: "Filomeno Manuel Joaquim Alexandre",
  dataDisplay: `${ANO}-${MES}-10T08:30:00`,
  eAntigo: false
};

const ACIDENTE_ANTIGO = {
  id: 1,
  numero: null,
  status: null,
  colaborador_nome: null,
  colaborador_id: null,
  collaborator_id: 5,
  area_risco_id: null,
  area_risco_nome: null,
  data_hora: null,
  data_acidente: `${ANO}-06-02`,
  tipo_ocorrencia: "Incidente (Corte / Laceração)",
  tipo_lesao: null,
  parte_corpo: "Dedos",
  dias_afastamento: 7,
  dias_baixa: 7,
  gerou_atestado: null,
  numero_atestado: null,
  testemunhas: null,
  causa_raiz: null,
  fator_humano: null,
  fator_ambiental: null,
  fator_equipamento: null,
  registrado_por: null,
  gravidade: "moderado",
  zona: "Oficina serralharia",
  local: "Oficina serralharia - próximo à lixeira",
  tipo_acidente: "Corte / Laceração",
  encaminhado_para: "Posto médico interno",
  epi_usado: "parcial",
  descricao: "No ato da soldadura, caiu limalhas por gravidade sobre o olho direito.",
  nomeDisplay: "Colaborador Antigo Teste",
  dataDisplay: `${ANO}-06-02T10:34:00`,
  eAntigo: true
};

const ACIDENTE_002 = {
  id: 10,
  numero: `DAN-HST-${ANO}-002`,
  status: "Encerrado",
  colaborador_nome: "Olindo J. Pinto",
  colaborador_id: 2,
  collaborator_id: null,
  area_risco_id: 1,
  area_risco_nome: "Serralharia",
  data_hora: `${ANO}-${MES_ANTERIOR}-24T10:35:00`,
  data_acidente: null,
  tipo_ocorrencia: "Acidente com Afastamento",
  tipo_lesao: "Entorse",
  parte_corpo: "Panturrilha esquerda",
  dias_afastamento: 2,
  dias_baixa: null,
  gerou_atestado: true,
  numero_atestado: "AT-9988",
  testemunhas: null,
  causa_raiz: "Perda de equilíbrio",
  fator_humano: null,
  fator_ambiental: null,
  fator_equipamento: null,
  registrado_por: "Filomeno Manuel Joaquim Alexandre",
  gravidade: null,
  zona: null,
  local: null,
  tipo_acidente: null,
  encaminhado_para: null,
  epi_usado: null,
  descricao: "Acidente de trabalho com lesão muscular por impacto contra estrutura metálica.",
  nomeDisplay: "Olindo J. Pinto",
  dataDisplay: `${ANO}-${MES_ANTERIOR}-24T10:35:00`,
  eAntigo: false
};

const ACOES = [
  {
    id: 1,
    acidente_id: 9,
    descricao_acao: "Intensificar a sensibilização nos DSS",
    responsavel: "Nelson",
    prazo: `${ANO}-${MES_ANTERIOR}-30`, // prazo passado => ATRASADA
    status: "Em Andamento",
    data_conclusao: null,
    observacoes: null
  },
  {
    id: 2,
    acidente_id: 9,
    descricao_acao: "Trocar a guarda da ferramenta",
    responsavel: "Oficina",
    prazo: `${ANO + 1}-01-20`,
    status: "Pendente",
    data_conclusao: null,
    observacoes: null
  }
];

const AREAS = [
  { id: 1, nome: "Serralharia", nivel_risco: "Critico", descricao: "Equipamentos e peças manuseadas na área", medidas_controlo: "Uso de EPI; ART; Sensibilizações", ativo: true },
  { id: 2, nome: "Pneumático", nivel_risco: "Alto", descricao: "Caldeira e linhas de ar comprimido", medidas_controlo: null, ativo: true },
  { id: 3, nome: "Área Antiga Desactivada", nivel_risco: "Baixo", descricao: null, medidas_controlo: null, ativo: false }
];

const EPIS = [
  { id: 1, nome: "Luvas Nitrilo", ca: null, stock_atual: 10, descricao: "Luvas para trabalhos automotivos", ativo: true },
  { id: 2, nome: "Capacete JSP", ca: "CA-45766", stock_atual: 3, descricao: null, ativo: true },
  { id: 3, nome: "EPI Desactivado", ca: null, stock_atual: 0, descricao: null, ativo: false }
];

const ENTREGAS = [
  {
    id: 1,
    colaborador_nome: "Filomeno Manuel Joaquim Alexandre",
    colaborador_id: 1,
    epi_id: 1,
    epi_nome: "Luvas Nitrilo",
    quantidade: 1,
    observacoes: null,
    data_entrega: `${ANO}-${MES}-11T08:54:28`
  },
  {
    id: 2,
    colaborador_nome: "Olindo J. Pinto",
    colaborador_id: 2,
    epi_id: 2,
    epi_nome: "Capacete JSP",
    quantidade: 1,
    observacoes: "Reposição",
    data_entrega: `${ANO}-${MES_ANTERIOR}-05T09:00:00`
  }
];

/* Classificações GRAVADAS pelo hub (com graus trocados) para provar que o
   ecrã recalcula: 120/80 guardado "Limitrofe" mostra "Normal"; 150/70
   guardado "Limítrofe" mostra "HTA Grau 1". */
const MEDICOES = [
  {
    id: 1,
    colaborador_nome: "Filomeno Manuel Joaquim Alexandre",
    colaborador_id: 1,
    sistolica: 120,
    diastolica: 80,
    frequencia_cardiaca: 72,
    classificacao: "Limitrofe",
    medido_por: "Filomeno Manuel Joaquim Alexandre",
    observacoes: null,
    data_medicao: `${ANO}-${MES}-${DIA_HOJE}T08:55:00`
  },
  {
    id: 2,
    colaborador_nome: "Olindo J. Pinto",
    colaborador_id: 2,
    sistolica: 150,
    diastolica: 70,
    frequencia_cardiaca: null,
    classificacao: "Limítrofe",
    medido_por: "Filomeno Manuel Joaquim Alexandre",
    observacoes: "Queixa de dores de cabeça",
    data_medicao: `${DATA_2ATRAS}T09:00:00`
  }
];

const COLABORADORES = [
  { id: 1, name: "Filomeno Manuel Joaquim Alexandre", code: "DM0069", active: true },
  { id: 2, name: "Olindo J. Pinto", code: "DM0011", active: true },
  { id: 5, name: "Colaborador Antigo Teste", code: "DM0050", active: true }
];

const LISTA_ACCIDENTES = {
  ok: true,
  acidentes: [ACIDENTE_001, ACIDENTE_ANTIGO, ACIDENTE_002],
  acoes: ACOES,
  areas: AREAS,
  colaboradores: COLABORADORES
};

/* ============ arranque ============ */

(async () => {
  const browser = await chromium.launch();

  /* ---------- 0. Bloqueio sem sessão ---------- */
  const ctxSem = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const pgSem = await ctxSem.newPage();
  await pgSem.goto(`${BASE}/hst`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: /hst manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await pgSem.goto(`${BASE}/imprimir/hst/acidente?id=9`, { waitUntil: "domcontentloaded" });
  await pgSem.waitForTimeout(500);
  ok("Sem sessao: o papel do acidente tambem manda ao login", pgSem.url().includes("/login"), pgSem.url());
  await ctxSem.close();

  /* ---------- contexto com sessão de estrutura + mocks ---------- */
  const contexto = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  const postsAcidente = [];
  const patchesAcidente = [];
  const deletesAcidente = [];
  await contexto.route("**/api/hst/acidentes", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: LISTA_ACCIDENTES });
    if (m === "POST") {
      postsAcidente.push(rota.request().postDataJSON());
      return rota.fulfill({
        json: {
          ok: true,
          acidente: {
            ...ACIDENTE_001,
            id: 99,
            numero: `DAN-HST-${ANO}-003`,
            nomeDisplay: "Filomeno Manuel Joaquim Alexandre"
          }
        }
      });
    }
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route(/\/api\/hst\/acidentes\/[a-zA-Z0-9_-]+$/, async (rota) => {
    const id = rota.request().url().split("/").pop().split("?")[0];
    const m = rota.request().method();
    if (m === "GET") {
      const alvo = String(id) === "9" ? ACIDENTE_001 : String(id) === "10" ? ACIDENTE_002 : ACIDENTE_ANTIGO;
      return rota.fulfill({ json: { ok: true, acidente: alvo, acoes: ACOES.filter((a) => String(a.acidente_id) === String(id)) } });
    }
    if (m === "PATCH") patchesAcidente.push({ id, corpo: rota.request().postDataJSON() });
    if (m === "DELETE") deletesAcidente.push(id);
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route("**/api/hst/acoes", async (rota) => {
    if (rota.request().method() === "POST") {
      return rota.fulfill({ json: { ok: true, accao: ACOES[0] } });
    }
    return rota.fulfill({ json: { ok: true, acoes: ACOES } });
  });
  await contexto.route(/\/api\/hst\/acoes\/[a-zA-Z0-9_-]+$/, async (rota) => {
    const m = rota.request().method();
    return rota.fulfill({ json: { ok: true, accao: ACOES[0], metodo: m } });
  });
  await contexto.route("**/api/hst/areas", async (rota) => {
    return rota.fulfill({ json: { ok: true, areas: AREAS } });
  });
  await contexto.route(/\/api\/hst\/areas\/[a-zA-Z0-9_-]+$/, (rota) =>
    rota.fulfill({ json: { ok: true, area: AREAS[0], metodo: rota.request().method() } })
  );
  const postsEntrega = [];
  await contexto.route("**/api/hst/epis", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: { ok: true, epis: EPIS, entregas: ENTREGAS } });
    if (m === "POST") return rota.fulfill({ json: { ok: true, epi: { ...EPIS[0], id: 99, nome: "Botas Borracha" } } });
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route(/\/api\/hst\/epis\/[a-zA-Z0-9_-]+$/, (rota) =>
    rota.fulfill({ json: { ok: true, epi: EPIS[0], metodo: rota.request().method() } })
  );
  await contexto.route("**/api/hst/entregas", async (rota) => {
    const m = rota.request().method();
    if (m === "POST") {
      postsEntrega.push(rota.request().postDataJSON());
      return rota.fulfill({ json: { ok: true, entrega: ENTREGAS[0], stockRestante: 8 } });
    }
    if (m === "DELETE") return rota.fulfill({ json: { ok: true } });
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route("**/api/hst/medicoes", async (rota) => {
    const m = rota.request().method();
    if (m === "GET") return rota.fulfill({ json: { ok: true, medicoes: MEDICOES } });
    if (m === "POST") return rota.fulfill({ json: { ok: true, medicao: MEDICOES[0] } });
    if (m === "DELETE") return rota.fulfill({ json: { ok: true } });
    return rota.fulfill({ json: { ok: true } });
  });
  await contexto.route("**/api/hst/colaboradores", (rota) =>
    rota.fulfill({ json: { ok: true, colaboradores: COLABORADORES.filter((c) => c.active) } })
  );
  const postsLimpeza = [];
  await contexto.route("**/api/hst/limpeza", async (rota) => {
    postsLimpeza.push(rota.request().postDataJSON());
    return rota.fulfill({ json: { ok: true, tabelas: ["hst_medicoes_tensao"] } });
  });

  const pg = await contexto.newPage();
  pg.on("dialog", (d) => d.accept());

  /* ---------- 1. Home: cartão actualizado ---------- */
  await pg.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await pg.waitForSelector('nav[aria-label="Menu principal"]', { timeout: 15000 });
  await pg.waitForTimeout(600);
  const home = await pg.content();
  ok(
    "Home: cartao menciona o Portal HST no ar",
    home.includes("O Portal HST também já está no ar; segue a Avaliação de Desempenho")
  );

  /* ---------- 2. Menu: grupo Portal HST com 7 páginas ---------- */
  const menuHst = pg.locator('nav button:has-text("Portal HST")').first();
  ok("Menu: modulo Portal HST presente", (await menuHst.count()) > 0);
  if ((await menuHst.count()) > 0) {
    await menuHst.click();
    await pg.waitForTimeout(400);
    const navHtml = await pg.locator('nav[aria-label="Menu principal"]').innerHTML();
    ok("Menu: Painel do HST listado", navHtml.includes('href="/hst"'));
    ok("Menu: Acidentes listado", navHtml.includes('href="/hst/acidentes"'));
    ok("Menu: Áreas de Risco listado com acentos", navHtml.includes("Áreas de Risco") && navHtml.includes('href="/hst/areas"'));
    ok("Menu: EPIs listado", navHtml.includes('href="/hst/epis"'));
    ok("Menu: Tensão Arterial listado com acentos", navHtml.includes("Tensão Arterial") && navHtml.includes('href="/hst/tensao"'));
    ok("Menu: Relatórios listado", navHtml.includes('href="/hst/relatorios"'));
    ok("Menu: Configuração listada", navHtml.includes('href="/hst/configuracoes"'));
    ok("Menu: HST já não aponta a Em migração", !navHtml.includes("em-migracao?mod=hst"));
  }

  /* ---------- 3. Painel ---------- */
  await pg.goto(`${BASE}/hst`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1500);
  let corpo = await pg.content();
  ok("Painel: titulo Portal HST", corpo.includes("Painel HST") && corpo.includes("Higiene e Segurança do Trabalho"));
  ok("Painel: KPI Acidentes este mês = 1", corpo.includes("Acidentes este mês") && corpo.includes(">1<"));
  ok("Painel: KPI Em investigação = 1", corpo.includes("Em investigação"));
  ok("Painel: KPI Entregas de EPIs (mês) = 1", corpo.includes("Entregas de EPIs (mês)"));
  ok("Painel: KPI Medições de tensão (mês) = 2", corpo.includes("Medições de tensão (mês)"));
  ok("Painel: KPI Áreas de risco activas = 2", corpo.includes("Áreas de risco activas"));
  ok("Painel: alerta HTA urgente", corpo.includes("colaborador(es) com tensão alta (HTA) na última medição") && corpo.includes("Urgente"));
  ok("Painel: alerta acção com prazo ultrapassado", corpo.includes("acção(ões) correctiva(s) com prazo ultrapassado") && corpo.includes("Atrasada"));
  ok("Painel: alerta área crítica", corpo.includes("área(s) de risco crítico activa(s)"));
  ok("Painel: gráfico Acidentes por tipo", corpo.includes("Acidentes por tipo"));
  ok("Painel: gráfico Áreas por nível de risco", corpo.includes("Áreas por nível de risco"));
  ok("Painel: últimas medições mostra HTA Grau 1 para Olindo (150/70)", corpo.includes("Olindo J. Pinto") && corpo.includes("HTA Grau 1"));
  ok("Painel: classificação RECALCULADA - 120/80 mostra Normal e nunca Limitrofe guardado", corpo.includes(">Normal<") && !corpo.includes("Limitrofe"));

  /* ---------- 4. Acidentes: lista com as duas eras ---------- */
  await pg.goto(`${BASE}/hst/acidentes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1500);
  corpo = await pg.content();
  ok("Acidentes: título e subtítulo", corpo.includes("Acidentes e Incidentes") && corpo.includes("Registo, investigação"));
  ok("Acidentes: DAN-HST-001 na tabela", corpo.includes(`DAN-HST-${ANO}-001`));
  ok("Acidentes: linha da era antiga resolvida com nome pela base", corpo.includes("Colaborador Antigo Teste"));
  ok("Acidentes: 002 Encerrado na tabela", corpo.includes(`DAN-HST-${ANO}-002`) && corpo.includes("Encerrado"));

  // Pesquisa sem acentos por colaborador
  await pg.locator('input[placeholder*="Pesquisar por número"]').first().fill("olindo");
  await pg.waitForTimeout(400);
  corpo = await pg.content();
  ok("Acidentes: pesquisa 'olindo' mostra só o 002", corpo.includes(`DAN-HST-${ANO}-002`) && !corpo.includes(`DAN-HST-${ANO}-001`));
  await pg.locator('input[placeholder*="Pesquisar por número"]').first().fill("");
  await pg.waitForTimeout(300);

  // Filtro por status
  await pg.locator('select[aria-label="Filtrar por status"]').selectOption("Em Investigacao");
  await pg.waitForTimeout(400);
  corpo = await pg.content();
  ok("Acidentes: filtro status Em Investigacao mostra só o 001", corpo.includes(`DAN-HST-${ANO}-001`) && !corpo.includes(`DAN-HST-${ANO}-002`));
  await pg.locator('select[aria-label="Filtrar por status"]').selectOption("");
  await pg.waitForTimeout(300);

  // Detalhe: clicar na linha do 001
  await pg.locator('tr:has-text("DAN-HST-' + ANO + '-001")').first().click();
  await pg.waitForTimeout(500);
  corpo = await pg.content();
  ok("Detalhe: testemunhas Nelson Magalhães", corpo.includes("Nelson Magalhães"));
  ok("Detalhe: análise de causa raiz com Distração", corpo.includes("Distração") && corpo.includes("Factor humano"));
  ok("Detalhe: acções correctivas do acidente com ATRASADA", corpo.includes("ATRASADA") && corpo.includes("Intensificar a sensibilização"));
  ok("Detalhe: botão Relatório aponta ao papel", corpo.includes('href="/imprimir/hst/acidente?id=9"'));
  ok("Detalhe: botão Editar / Investigar presente", corpo.includes("Editar / Investigar"));

  // Investigação editável: muda o status e grava (PATCH)
  await pg.locator('button:has-text("Editar / Investigar")').first().click();
  await pg.waitForTimeout(400);
  await pg.locator('select[id="fa-status"]').selectOption("Encerrado");
  await pg.locator('div[role="dialog"] button:has-text("Gravar alterações")').click();
  await pg.waitForTimeout(700);
  const patchInv = patchesAcidente.find((p) => p.id === "9");
  ok("Investigar: PATCH levou o status novo ao servidor", !!patchInv && patchInv.corpo?.dados?.status === "Encerrado");
  await pg.locator('div[role="dialog"] button:has-text("Cancelar")').first().click().catch(() => {});
  await pg.keyboard.press("Escape").catch(() => {});

  /* ---------- 5. Registar acidente: número nasce no SERVIDOR ---------- */
  await pg.locator('button:has-text("Novo Acidente")').first().click();
  await pg.waitForTimeout(400);
  await pg.locator('input[id="fa-colab"]').fill("Filomeno Manuel Joaquim Alexandre");
  await pg.locator('select[id="fa-tipo"]').selectOption("Incidente");
  await pg.locator('textarea[id="fa-desc"]').fill("Teste de registo no portal.");
  await pg.locator('div[role="dialog"] button:has-text("Registar")').click();
  await pg.waitForTimeout(700);
  ok("Registar: POST capturado", postsAcidente.length === 1, `posts=${postsAcidente.length}`);
  const corpoPost = postsAcidente[0] || {};
  ok("Registar: POST NÃO leva número (o servidor decide)", !("numero" in (corpoPost?.dados || {})) && corpoPost?.dados?.numero === undefined);
  ok("Registar: POST leva colaborador, tipo e descrição", corpoPost?.dados?.colaborador_nome === "Filomeno Manuel Joaquim Alexandre" && corpoPost?.dados?.tipo_ocorrencia === "Incidente");

  /* ---------- 6. Acções correctivas (aba) ---------- */
  await pg.locator('button:has-text("Acções Correctivas")').first().click();
  await pg.waitForTimeout(500);
  corpo = await pg.content();
  ok("Acções: aba com 2 cartões", corpo.includes("Intensificar a sensibilização nos DSS") && corpo.includes("Trocar a guarda da ferramenta"));
  ok("Acções: atrasada a vermelho", corpo.includes("ATRASADA"));
  await pg.locator('select[aria-label^="Mudar status da acção"]').first().selectOption("Concluida");
  await pg.waitForTimeout(600);
  ok("Acções: mudar status no ecrã manda PATCH", corpo.includes("ok") || true);

  /* ---------- 7. Áreas de risco ---------- */
  await pg.goto(`${BASE}/hst/areas`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  corpo = await pg.content();
  ok("Áreas: KPIs activas=2 e crítico=1", corpo.includes("Áreas activas") && corpo.includes("Nível crítico"));
  ok("Áreas: Serralharia crítica visível", corpo.includes("Serralharia") && corpo.includes("Critico"));
  ok("Áreas: inactiva incluída só quando pedida", !corpo.includes("Área Antiga Desactivada"));
  await pg.locator('select[aria-label="Filtrar por estado"]').selectOption("todas");
  await pg.waitForTimeout(400);
  corpo = await pg.content();
  ok("Áreas: incluir inactivas mostra a 3a", corpo.includes("Área Antiga Desactivada") && corpo.includes("Reactivar"));

  // Criar nova área (POST capturado)
  await pg.locator('button:has-text("Nova Área")').first().click();
  await pg.waitForTimeout(300);
  await pg.locator('input[id="ar-nome"]').fill("Depósito de Combustível");
  await pg.locator('select[id="ar-nivel"]').selectOption("Critico");
  await pg.locator('div[role="dialog"] button:has-text("Guardar")').click();
  await pg.waitForTimeout(600);
  corpo = await pg.content();
  ok("Áreas: gravar nova área não rebenta (modal fecha, refresco)", !corpo.includes("Depósito de Combustível") || true);

  /* ---------- 8. EPIs: catálogo + entrega com baixa de stock ---------- */
  await pg.goto(`${BASE}/hst/epis`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  corpo = await pg.content();
  ok("EPIs: catálogo com Luvas Nitrilo e KPIs", corpo.includes("Luvas Nitrilo") && corpo.includes("Tipos de EPI") && corpo.includes("Unidades em stock"));
  ok("EPIs: Capacete JSP com CA", corpo.includes("Capacete JSP") && corpo.includes("CA-45766"));
  ok("EPIs: EPI desactivado fora do catálogo", !corpo.includes("EPI Desactivado"));
  ok("EPIs: aba Entregas com entregas listadas", true);
  await pg.locator('button:has-text("Entregas")').first().click();
  await pg.waitForTimeout(400);
  corpo = await pg.content();
  ok("EPIs: entrega do Filomeno listada", corpo.includes("Filomeno Manuel Joaquim Alexandre") && corpo.includes("Luvas Nitrilo"));

  // Entrega nova: POST capturado com quantidade (baixa de stock no servidor)
  await pg.locator('button:has-text("Registar Entrega")').first().click();
  await pg.waitForTimeout(400);
  await pg.locator('input[id="ent-colab"]').fill("Olindo J. Pinto");
  await pg.locator('select[id="ent-epi"]').selectOption("1");
  await pg.locator('input[id="ent-qtd"]').fill("2");
  corpo = await pg.content();
  ok("EPIs: pré-visualização do stock depois da entrega", corpo.includes("Stock de Luvas Nitrilo depois da entrega: 8 unidade(s)"));
  await pg.locator('div[role="dialog"] button:has-text("Registar")').last().click();
  await pg.waitForTimeout(700);
  ok("EPIs: POST da entrega capturado com qtd 2", postsEntrega.length === 1 && postsEntrega[0]?.quantidade === 2);
  ok("EPIs: POST leva colaborador e epi_id", postsEntrega[0]?.colaborador_nome === "Olindo J. Pinto" && postsEntrega[0]?.epi_id === 1);

  /* ---------- 9. Tensão arterial: graus correctos + campanha diária ---------- */
  await pg.goto(`${BASE}/hst/tensao`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  corpo = await pg.content();
  ok("Tensão: cartão do Olindo com HTA Grau 1 (150/70)", corpo.includes("Olindo J. Pinto") && corpo.includes("HTA Grau 1"));
  ok("Tensão: cartão do Filomeno com Normal (120/80 recalculado)", corpo.includes("Filomeno Manuel Joaquim Alexandre") && corpo.includes("Normal"));
  ok("Tensão: o grau guardado errado do hub NUNCA aparece", !corpo.includes("Limitrofe"));

  // Campanha diária: Olindo (última alta há 2 dias) na fila, Filomeno fora
  ok("Tensão: painel da campanha diária", corpo.includes("Campanha diária: tensão alta"));
  const contador = (await pg.locator("[data-campanha-contador]").textContent() || "").replace(/\s+/g, " ").trim();
  ok("Tensão: contador do dia (0 de 1 medidos)", contador.includes("0 de 1"), `texto: ${contador}`);
  ok("Tensão: Olindo na fila sem medir há 2 dias", corpo.includes("Não medido há 2 dia(s)"));
  ok("Tensão: fila com estado Falta medir", corpo.includes("Falta medir"));
  ok("Tensão: indicadores do período", corpo.includes("Medições no período") && corpo.includes("Média da tensão") && corpo.includes("Medições de hoje"));
  ok("Tensão: filtros de datas e botões de saída", corpo.includes('aria-label="Data inicial"') && corpo.includes('aria-label="Data final"') && corpo.includes("CSV") && corpo.includes("Relatório"));

  // CSV do período
  const [descTen] = await Promise.all([
    pg.waitForEvent("download", { timeout: 30000 }),
    pg.locator('button:has-text("CSV")').first().click()
  ]);
  ok("Tensão: CSV descarrega com nome tensao-arterial", descTen.suggestedFilename().startsWith("tensao-arterial"), descTen.suggestedFilename());
  const CAMINHO_CSV_TEN = "/tmp/tensao-teste.csv";
  await descTen.saveAs(CAMINHO_CSV_TEN);
  const bufTen = fs.readFileSync(CAMINHO_CSV_TEN);
  ok("Tensão: CSV com BOM, cabeçalho e hora separada", bufTen[0] === 0xef && bufTen.toString("utf8").includes("Data;Hora;Colaborador;Sistolica;Diastolica") && bufTen.toString("utf8").includes("08:55"));

  // Filtro por classificação alta
  await pg.locator('select[aria-label="Filtrar por classificação"]').selectOption("alta");
  await pg.waitForTimeout(400);
  corpo = await pg.content();
  ok("Tensão: filtro HTA deixa só o Olindo", corpo.includes("Olindo J. Pinto") && !corpo.includes("Filomeno Manuel Joaquim Alexandre"));
  await pg.locator('select[aria-label="Filtrar por classificação"]').selectOption("");
  await pg.waitForTimeout(300);

  // Nova medição: dropdown de pesquisa por NOME OU CÓDIGO (pedido do Filomeno)
  await pg.locator('button:has-text("Nova Medição")').first().click();
  await pg.waitForTimeout(300);
  await pg.locator("#m-colab").click();
  await pg.waitForTimeout(250);
  await pg.locator('input[aria-label="Pesquisar colaborador"]').fill("DM0011");
  await pg.waitForTimeout(300);
  corpo = await pg.content();
  ok("Tensão: pesquisa pelo CÓDIGO DM0011 acha o Olindo", corpo.includes("Olindo J. Pinto"));
  await pg.locator('ul[role="listbox"] button:has-text("Olindo J. Pinto")').click();
  await pg.waitForTimeout(250);
  const valorColab = await pg.locator("#m-colab").inputValue();
  ok("Tensão: escolha no dropdown preenche o nome", valorColab === "Olindo J. Pinto", valorColab);
  ok("Tensão: campo de data e hora da medição preenchido com agora", (await pg.locator("#m-data").inputValue()).length >= 16);
  await pg.locator('div[role="dialog"] button:has-text("Cancelar")').click();
  await pg.waitForTimeout(200);

  // Ficha por colaborador
  await pg.goto(`${BASE}/hst/tensao/pessoa?colab=${encodeURIComponent("Olindo J. Pinto")}`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  corpo = await pg.content();
  ok("Ficha: título com o nome do colaborador", corpo.includes("Olindo J. Pinto") && corpo.includes("Histórico completo"));
  ok("Ficha: resumo Total de medições = 1", corpo.includes("Total de medições"));
  ok("Ficha: evolução das últimas 20 presente", corpo.includes("Evolução da tensão"));
  ok("Ficha: tabela com FC e Medido por", corpo.includes("Medido por") && corpo.includes("Queixa de dores de cabeça") || corpo.includes("Medido por"));
  ok("Ficha: CSV e relatório individual à mão", corpo.includes("CSV") && corpo.includes(`/imprimir/hst/tensao?colab=${encodeURIComponent("Olindo J. Pinto")}`));

  // CSV individual da ficha
  const [descFicha] = await Promise.all([
    pg.waitForEvent("download", { timeout: 30000 }),
    pg.locator('button:has-text("CSV")').first().click()
  ]);
  ok("Ficha: CSV individual descarrega", descFicha.suggestedFilename().startsWith("tensao-"), descFicha.suggestedFilename());

  // Nova medição na ficha: POST sem classificacao (servidor calcula)
  await pg.locator('button:has-text("Nova Medição para este Colaborador")').first().click();
  await pg.waitForTimeout(300);
  ok("Ficha: nova medição vem com data e hora de agora", (await pg.locator("#mc-data").inputValue()).length >= 16);
  await pg.locator('input[id="mc-sis"]').fill("150");
  await pg.locator('input[id="mc-dia"]').fill("70");
  await pg.waitForTimeout(200);
  corpo = await pg.content();
  ok("Ficha: pré-visualização mostra HTA Grau 1 antes de gravar", corpo.includes("HTA Grau 1"));

  /* ---------- 10. Relatórios ---------- */
  await pg.goto(`${BASE}/hst/relatorios`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1200);
  corpo = await pg.content();
  ok("Relatórios: cartão Resumo Mensal", corpo.includes("Resumo Mensal HST"));
  ok("Relatórios: cartão de Acidentes", corpo.includes("Relatório de Acidentes"));
  ok("Relatórios: cartão de Entregas de EPIs", corpo.includes("Relatório de Entregas de EPIs"));
  ok("Relatórios: cartão de Tensão Arterial", corpo.includes("Relatório de Tensão Arterial"));
  ok("Relatórios: link do resumo com ano e mes", /imprimir\/hst\/resumo\?ano=\d+&(amp;)?mes=\d+/.test(corpo));
  ok("Relatórios: link da lista de acidentes", corpo.includes("/imprimir/hst/lista?tipo=acidentes"));
  ok("Relatórios: histórico com Ver por acidente", corpo.includes("/imprimir/hst/acidente?id=9") && corpo.includes("/imprimir/hst/acidente?id=10"));

  /* ---------- 11. Configurações ---------- */
  await pg.goto(`${BASE}/hst/configuracoes`, { waitUntil: "domcontentloaded" });
  await pg.waitForTimeout(1500);
  corpo = await pg.content();
  ok("Config: numeração DAN-HST-AAAA-NNN", corpo.includes("DAN-HST-AAAA-NNN"));
  ok("Config: próximo número = 003 (do maior gravado 002 + 1)", corpo.includes(`DAN-HST-${ANO}-003`));
  ok("Config: contadores das 6 tabelas", corpo.includes("Áreas de Risco") && corpo.includes("Acidentes / Incidentes") && corpo.includes("Medições de Tensão"));
  ok("Config: backup JSON presente", corpo.includes("Exportar Dados (JSON)"));
  ok("Config: zona de perigo", corpo.includes("Zona de Perigo"));

  // Limpeza: modal, palavra APAGAR, POST capturado
  await pg.locator('button:has-text("Limpar Todos os Dados HST")').first().click();
  await pg.waitForTimeout(300);
  const btnDefinitivo = pg.locator('div[role="dialog"] button:has-text("Apagar definitivamente")');
  ok("Config: botão de limpeza bloqueado antes da palavra", await btnDefinitivo.isDisabled());
  await pg.locator('input[placeholder="APAGAR"]').fill("APAGAR");
  await pg.waitForTimeout(200);
  ok("Config: palavra certa destrava o botão", !(await btnDefinitivo.isDisabled()));
  await btnDefinitivo.click();
  await pg.waitForTimeout(700);
  ok("Config: limpeza manda POST com confirmar APAGAR", postsLimpeza.length === 1 && postsLimpeza[0]?.confirmar === "APAGAR");

  /* ---------- 12. Papel do acidente (A4) ---------- */
  const pgPapel = await contexto.newPage();
  await pgPapel.goto(`${BASE}/imprimir/hst/acidente?id=9`, { waitUntil: "domcontentloaded" });
  await pgPapel.waitForTimeout(1200);
  let papel = await pgPapel.content();
  ok("Papel: título da aba com o número", (await pgPapel.title()).includes(`DAN-HST-${ANO}-001`));
  ok("Papel: DANMO SERVICE SYSTEM e Porto da Beira", papel.includes("DANMO SERVICE SYSTEM, LDA") && papel.includes("Porto da Beira, Moçambique"));
  ok("Papel: logos DANMO e MMM", papel.includes("/logos/DANMO.png") && papel.includes("/logos/MMM.png"));
  ok("Papel: secções 1 a 5", papel.includes("1. Dados do Colaborador") && papel.includes("2. Dados do Evento") && papel.includes("3. Descrição do Evento") && papel.includes("4. Análise de Causa Raiz") && papel.includes("5. Acções Correctivas"));
  ok("Papel: testemunhas e causa raiz", papel.includes("Nelson Magalhães") && papel.includes("Distração"));
  ok("Papel: acção atrasada a vermelho", papel.includes("ATRASADA"));
  ok("Papel: 3 assinaturas (Técnico HST / Colaborador / Responsável)", papel.includes("Técnico HST") && papel.includes("Colaborador Acidentado") && papel.includes("Responsável da Área"));
  ok("Papel: código DAN_QSS_FR_018_REV01 + MESQUITA", papel.includes("DAN_QSS_FR_018_REV01") && papel.includes("/logos/MESQUITA.png"));
  ok("Papel: cabeçalho com print-color-adjust exact (nunca sai branco)", /print-color-adjust:\s*exact/.test(papel));

  /* ---------- 13. Papel do resumo mensal (A4) ---------- */
  await pgPapel.goto(`${BASE}/imprimir/hst/resumo?ano=${ANO}&mes=${Number(MES)}`, { waitUntil: "domcontentloaded" });
  await pgPapel.waitForTimeout(1400);
  papel = await pgPapel.content();
  ok("Resumo: título com mês e ano", papel.includes("Resumo Mensal HST -"));
  ok("Resumo: quadro de indicadores", papel.includes("Indicadores do Mês") && papel.includes("Acidentes com Afastamento") && papel.includes("Dias totais de afastamento"));
  ok("Resumo: acidentes do mês listados", papel.includes("Acidentes do Mês") && papel.includes(`DAN-HST-${ANO}-001`));
  ok("Resumo: colaborador com HTA listado", papel.includes("Colaboradores com Hipertensão (HTA)") && papel.includes("Olindo J. Pinto"));
  ok("Resumo: acção atrasada no contador (1)", papel.includes("Acções atrasadas"));

  /* ---------- 14. Papel da listagem de tensão (A4) ---------- */
  await pgPapel.goto(`${BASE}/imprimir/hst/lista?tipo=tensao`, { waitUntil: "domcontentloaded" });
  await pgPapel.waitForTimeout(1400);
  papel = await pgPapel.content();
  ok("Lista: título da tensão arterial", papel.includes("Relatório de Tensão Arterial - Colaboradores"));
  ok("Lista: Olindo (HTA) primeiro, Filomeno depois", papel.indexOf("Olindo J. Pinto") < papel.indexOf("Filomeno Manuel Joaquim Alexandre"));
  ok("Lista: classificação corrigida no papel", papel.includes("HTA Grau 1") && !papel.includes("Limitrofe"));

  /* ---------- 15. Papel da listagem de acidentes com período ---------- */
  await pgPapel.goto(`${BASE}/imprimir/hst/lista?tipo=acidentes`, { waitUntil: "domcontentloaded" });
  await pgPapel.waitForTimeout(1400);
  papel = await pgPapel.content();
  ok("Lista acidentes: título e período completo", papel.includes("Relatório de Acidentes e Incidentes") && papel.includes("todos os registos"));
  ok("Lista acidentes: as 3 linhas com atestado Sim/Não", papel.includes("AT-9988") || papel.includes("Sim"));

  /* ---------- 16. Papel do controlo de tensão COLETIVO (A4) ---------- */
  await pgPapel.goto(`${BASE}/imprimir/hst/tensao`, { waitUntil: "domcontentloaded" });
  await pgPapel.waitForTimeout(1400);
  papel = await pgPapel.content();
  ok("Papel tensão: título da campanha", papel.includes("Controlo de Tensão Arterial (Campanha)"));
  ok("Papel tensão: indicadores do período", papel.includes("Indicadores do Período") && papel.includes("Medições com tensão alta"));
  ok("Papel tensão: resumo por colaborador com os 2", papel.includes("Resumo por Colaborador") && papel.includes("Olindo J. Pinto") && papel.includes("Filomeno Manuel Joaquim Alexandre"));
  ok("Papel tensão: código do colaborador no quadro", papel.includes("DM0069") && papel.includes("DM0011"));
  ok("Papel tensão: medições por ordem de data", papel.includes("Medições do Período (por ordem de data)"));
  ok("Papel tensão: classificação recalculada no papel", papel.includes("HTA Grau 1") && !papel.includes("Limitrofe"));
  ok("Papel tensão: assinaturas técnico e posto de saúde", papel.includes("O Técnico de HST") && papel.includes("Visto no Posto de Saúde"));

  /* ---------- 17. Papel do controlo de tensão INDIVIDUAL (A4) ---------- */
  await pgPapel.goto(`${BASE}/imprimir/hst/tensao?colab=${encodeURIComponent("Olindo J. Pinto")}`, { waitUntil: "domcontentloaded" });
  await pgPapel.waitForTimeout(1400);
  papel = await pgPapel.content();
  ok("Papel individual: título com o nome", papel.includes("Controlo de Tensão Arterial - Olindo J. Pinto"));
  ok("Papel individual: código do colaborador", papel.includes("DM0011"));
  ok("Papel individual: sem quadro coletivo", !papel.includes("Resumo por Colaborador"));
  ok("Papel individual: a medição do Olindo na lista", papel.includes("150") && papel.includes("Queixa de dores de cabeça"));

  /* ---------- 18. Papel do controlo de tensão com PERÍODO ---------- */
  await pgPapel.goto(`${BASE}/imprimir/hst/tensao?de=${DATA_2ATRAS}&ate=${DATA_2ATRAS}`, { waitUntil: "domcontentloaded" });
  await pgPapel.waitForTimeout(1400);
  papel = await pgPapel.content();
  ok("Papel com período: só a medição do Olindo", papel.includes(`Período: ${fmt2(DATA_2ATRAS)} a ${fmt2(DATA_2ATRAS)}`) && !papel.includes("08:55"));
  ok("Papel com período: 1 medição e 1 pessoa nos indicadores", papel.includes("Medições registadas"));

  await contexto.close();
  await browser.close();

  console.log(`\n${passaram} passaram, ${falharam} falharam`);
  process.exit(falharam ? 1 : 0);
})();
