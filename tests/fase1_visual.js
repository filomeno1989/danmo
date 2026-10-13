/**
 * Teste visual do portal Danmo (Fase 1 polida) com Playwright.
 * Modo estrutura (sem base local): login com qualquer codigo.
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = "http://localhost:3333";
const FOTOS = "/home/z/my-project/danmo/tests";

(async () => {
  const browser = await chromium.launch();
  const pagina = await browser.newPage({ viewport: { width: 1366, height: 850 } });
  const resultado = [];
  const ok = (nome, cond) => {
    resultado.push(`${cond ? "PASSOU" : "FALHOU"} - ${nome}`);
    if (!cond) process.exitCode = 1;
  };

  // 1. Login: nome correcto e sem travessao
  await pagina.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  ok("Login carrega", (await pagina.title()).length > 0);
  const textoTopo = await pagina.textContent("body");
  ok("Nome 'Danmo Service System, Lda' no login", textoTopo.includes("Danmo Service System, Lda"));
  ok("Sem 'Portal Danmo -' no login", !textoTopo.includes("Portal Danmo -"));
  ok("Link 'Criar o meu acesso' visivel", textoTopo.includes("Criar o meu acesso"));
  await pagina.screenshot({ path: `${FOTOS}/f1-login-claro.png` });

  // 2. Auto-registo: fluxo ate dados pre-preenchidos (modo estrutura)
  await pagina.getByRole("button", { name: /Criar o meu acesso/i }).click();
  await pagina.waitForTimeout(400);
  await pagina.fill("#reg-codigo", "DM0069");
  await pagina.screenshot({ path: `${FOTOS}/f1-registo-codigo.png` });
  await pagina.getByRole("button", { name: "Continuar" }).click();
  await pagina.waitForTimeout(900);
  const corpo2 = await pagina.textContent("body");
  ok(
    "Registo mostra dados pre-preenchidos (estrutura)",
    corpo2.includes("Colaborador de Exemplo")
  );
  ok("Registo tem campo 'Cria a tua senha'", corpo2.includes("Cria a tua senha"));
  await pagina.screenshot({ path: `${FOTOS}/f1-registo-dados.png` });

  // 3. Botao do olho presente
  const olhos = pagina.getByRole("button", { name: /senha/i });
  ok("Botao olho presente", (await olhos.count()) > 0);
  await pagina.fill("#reg-senha", "teste123");

  // 4. Voltar ao login e entrar (modo estrutura aceita tudo)
  await pagina.getByRole("button", { name: "Voltar", exact: true }).click();
  await pagina.waitForTimeout(400);
  await pagina.fill("#codigo", "DM0069");
  await pagina.fill("#senha", "qualquer1");
  await pagina.getByRole("button", { name: "Entrar" }).click();
  await pagina.waitForURL(`${BASE}/`, { timeout: 20000 });
  await pagina.waitForTimeout(1500);
  const corpo3 = await pagina.textContent("body");
  ok("Painel: saudacao 'Bom dia/Boa tarde/Boa noite'",
     corpo3.includes("Bom dia") || corpo3.includes("Boa tarde") || corpo3.includes("Boa noite"));
  ok("Painel sem banner navy grande (logo fora do conteudo)",
     !(await pagina.locator("main img[alt='Logo Danmo Service System']").count()));
  await pagina.screenshot({ path: `${FOTOS}/f1-painel-claro.png` });

  // 5. Tema escuro unificado: sidebar e topbar mudam junto
  await pagina.getByRole("button", { name: /Alternar tema/i }).click();
  await pagina.waitForTimeout(700);
  const coresDark = await pagina.evaluate(() => {
    const cs = getComputedStyle(document.body);
    const nav = getComputedStyle(document.querySelector("nav"));
    const header = getComputedStyle(document.querySelector("header"));
    return {
      body: cs.backgroundColor,
      nav: nav.backgroundColor,
      header: header.backgroundColor,
      escuro: document.documentElement.classList.contains("dark")
    };
  });
  ok("Modo escuro activo", coresDark.escuro);
  await pagina.screenshot({ path: `${FOTOS}/f1-painel-escuro.png` });

  // 6. Voltar a claro e abrir perfil: Personalizar portal (admin)
  await pagina.getByRole("button", { name: /Alternar tema/i }).click();
  await pagina.waitForTimeout(500);
  await pagina.getByRole("button", { name: /Menu do utilizador/i }).click();
  await pagina.waitForTimeout(500);
  const corpo4 = await pagina.textContent("body");
  ok("Dropdown tem 'Personalizar portal'", corpo4.includes("Personalizar portal"));
  await pagina.screenshot({ path: `${FOTOS}/f1-perfil-dropdown.png` });

  // 7. Pagina de personalizacao abre
  await pagina.getByText("Personalizar portal").click();
  await pagina.waitForTimeout(1200);
  const corpo5 = await pagina.textContent("body");
  ok("Pagina Personalizar portal abre", corpo5.includes("Fotos da empresa"));
  ok("Pagina tem 4 posicoes",
     (await pagina.getByText("Posição 4").count()) > 0);
  await pagina.screenshot({ path: `${FOTOS}/f1-personalizar.png` });

  // 8. Menu lateral em mobile (viewport fraco)
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mobile.fill("#codigo", "DM0069");
  await mobile.fill("#senha", "qualquer1");
  await mobile.getByRole("button", { name: "Entrar" }).click();
  await mobile.waitForURL(`${BASE}/`, { timeout: 20000 });
  await mobile.waitForTimeout(1200);
  await mobile.getByRole("button", { name: /Abrir menu/i }).click();
  await mobile.waitForTimeout(600);
  await mobile.screenshot({ path: `${FOTOS}/f1-mobile-menu.png` });
  await mobile.getByRole("button", { name: /Fechar menu/i }).click();
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: `${FOTOS}/f1-mobile-painel.png` });

  console.log(resultado.join("\n"));
  console.log(`\nTOTAL: ${resultado.filter((r) => r.startsWith("PASSOU")).length}/${resultado.length}`);
  await browser.close();
})();
