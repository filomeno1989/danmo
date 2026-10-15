/**
 * Teste dos 2 pontos do Filomeno (feedback da oficina):
 *  A. Visão Geral: a legenda de estados passa a mostrar SEMPRE os 8
 *     estados (Revisao/Manutencao e Inspecao com 0% em vez de sumirem),
 *     com as cores do dashboard do hub.
 *  B. Checklist de Manutencao (gestao): escolher um checklist no
 *     dropdown passa a carregar o conteudo sozinho (antes nao fazia
 *     NADA - so o botao Actualizar carregava).
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) + mocks de rede
 * com dados do estilo da base real (Playwright route).
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3458";

const CATEGORIAS = [
  { id: 1, nome: "Escavadora", ativo: true },
  { id: 2, nome: "Forklift", ativo: true }
];
const TEMPLATE = {
  id: 51,
  nome: "ME ESC",
  categoria_equipamento: "Escavadora",
  tipo: "eletrica",
  intervalo_horas: null,
  intervalo_label: "Mensal",
  ref_versao: "Ref. 01",
  ativo: true
};
const SECOES = [{ id: 1, template_id: 51, nome_secao: "MOTOR", ordem: 1 }];
const ITENS = [{ id: 7, secao_id: 1, numero_item: 1, descricao: "Verificar nivel de oleo", ordem: 1 }];

function respostaGestao(url) {
  const p = new URLSearchParams(new URL(url).search);
  const categoria = p.get("categoria") || "";
  const templateId = p.get("templateId") || "";
  const templates = categoria === "Escavadora" ? [TEMPLATE] : [];
  const conteudo =
    templateId === "51"
      ? { template: TEMPLATE, secoes: SECOES, itens: ITENS.map((i) => ({ ...i, usos: 3 })) }
      : { template: null, secoes: [], itens: [] };
  return { ok: true, categorias: CATEGORIAS, templates, conteudo };
}

const PAINEL_MOCK = {
  ok: true,
  categorias: CATEGORIAS,
  grupos: [],
  equipamentos: [{ id: 1, code: "DM001", fleet_type: "Escavadora", group_name: "Frota Teste" }],
  ordens: [],
  logCdm: [],
  checklistsRevisao: [],
  colaboradores: []
};

const OS8 = [
  "Disponível",
  "Avariada",
  "Acidentada",
  "Pneumático",
  "Revisão/Manutenção",
  "Inspeção",
  "Aguarda Acessório",
  "Concluído"
];

(async () => {
  const browser = await chromium.launch();
  const resultado = [];
  const ok = (nome, cond, detalhe = "") => {
    resultado.push(`${cond ? "PASSOU" : "FALHOU"} - ${nome}${detalhe ? ` (${detalhe})` : ""}`);
    if (!cond) process.exitCode = 1;
  };

  const contexto = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);

  // ===== A. VISÃO GERAL: legenda sempre com os 8 estados =====
  const paginaP = await contexto.newPage();
  let pedidoPainel = 0;
  await paginaP.route("**/api/oficina/painel*", (rota) => {
    pedidoPainel++;
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(PAINEL_MOCK) });
  });
  await paginaP.goto(`${BASE}/oficina`, { waitUntil: "networkidle" });
  const corpoP = await paginaP.textContent("body");
  ok("Painel carrega com dados do mock", pedidoPainel > 0 && !corpoP.includes("Sessão expirada"));
  const legendaAusente = OS8.filter((est) => {
    const re = new RegExp(est.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return !re.test(corpoP);
  });
  ok("Legenda mostra os 8 estados (mesmo sem maquinas)", legendaAusente.length === 0, legendaAusente.join(", ") || "todos presentes");
  ok("Revisao/Manutencao aparece com 0%", corpoP.includes("Revisão/Manutenção") && /\(0%\)/.test(corpoP));
  ok("Inspecao aparece com 0%", corpoP.includes("Inspeção"));
  const dotRevisao = await paginaP.locator("span.bg-amber-500").count();
  const dotInspecao = await paginaP.locator("span.bg-purple-500").count();
  ok("Cores do hub nos pontos (ambar revisao, roxo inspecao)", dotRevisao >= 1 && dotInspecao >= 1, `ambar=${dotRevisao} roxo=${dotInspecao}`);
  await paginaP.close();

  // ===== B. CHECKLIST (GESTAO): escolher template carrega o conteudo =====
  const paginaG = await contexto.newPage();
  const urlsPedidas = [];
  await paginaG.route("**/api/oficina/checklist-gestao*", (rota) => {
    urlsPedidas.push(rota.request().url());
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(respostaGestao(rota.request().url())) });
  });
  await paginaG.goto(`${BASE}/oficina/checklist`, { waitUntil: "networkidle" });
  let corpoG = await paginaG.textContent("body");
  ok("Gestao carrega sem erro", !corpoG.includes("Sessão expirada") && !corpoG.includes("Falha ao carregar"));

  // escolher categoria -> templates aparecem
  await paginaG.selectOption("#ck-cat", "Escavadora");
  await paginaG.waitForTimeout(500);
  corpoG = await paginaG.textContent("body");
  ok("Categoria escolhida mostra o checklist ME ESC", corpoG.includes("ME ESC"));

  // escolher o template -> o conteudo chega SOZINHO (o bug era aqui)
  await paginaG.selectOption("#ck-tpl", "51");
  await paginaG.waitForTimeout(500);
  // o nome da seccao e dos itens vive em VALUES de inputs (defaultValue),
  // por isso verificamos pelos proprios inputs e nao pelo textContent
  const valores = await paginaG.evaluate(() =>
    [...document.querySelectorAll("input")].map((i) => i.value)
  );
  ok("Escolher o checklist carrega a seccao MOTOR", valores.includes("MOTOR"));
  ok("Escolher o checklist carrega os itens", valores.includes("Verificar nivel de oleo"));
  ok("Campos gerais preenchidos (Nome = ME ESC)", valores.includes("ME ESC"), valores.slice(0, 6).join(" | "));
  ok("Pedido feito com templateId na URL", urlsPedidas.some((u) => u.includes("templateId=51")), urlsPedidas.join(" | ").slice(-120));

  // ===== C. Proteccao sem sessao =====
  const contextoSolto = await browser.newContext({ viewport: { width: 1366, height: 850 } });
  const paginaS = await contextoSolto.newPage();
  await paginaS.goto(`${BASE}/oficina/checklist`, { waitUntil: "domcontentloaded" });
  ok("Sem sessao: /oficina/checklist redirige ao login", paginaS.url().includes("/login"), paginaS.url());
  await contextoSolto.close();

  await browser.close();
  console.log(resultado.join("\n"));
  console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: TUDO OK");
  process.exit(process.exitCode || 0);
})();
