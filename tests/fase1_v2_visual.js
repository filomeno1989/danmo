/**
 * Teste visual do portal Danmo - Fase 1 v2 (novo layout dos mockups).
 * Modo estrutura (bun dev sem .env.local): login aceita qualquer codigo.
 * Cobertura: topbar com pílula de data/hora, campainha com novidades
 * reais, acento por tema (verde claro / verde escuro - cores da marca),
 * herói sem ponto verde, cartões de fase nas cores do logo (verde /
 * ambar / vermelho), painel "Sobre" que acompanha o tema, login sem
 * alerta genérico, personalizar com carregamento inicial que TERMINA
 * (spinner para sozinho), sidebar recolhível e mobile.
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3457";
const FOTOS = "/home/z/my-project/danmo/tests";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 } });
  const erros = [];
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") erros.push("console: " + m.text());
  });

  const resultado = [];
  const ok = (nome, cond) => {
    resultado.push(`${cond ? "PASSOU" : "FALHOU"} - ${nome}`);
    if (!cond) process.exitCode = 1;
  };

  // 1. Login: SEM alerta genérico de redireccionamento (o motivo
  // "sem_sessao" é o óbvio - não se repete a todos)
  await page.goto(`${BASE}/login?motivo=sem_sessao`, { waitUntil: "networkidle" });
  const corpoLogin = await page.textContent("body");
  ok("Login sem alerta genérico 'Entra para acederes'", !corpoLogin.includes("Entra para acederes"));

  // 1b. Entrar (modo estrutura aceita qualquer credencial)
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#codigo", "DM0069");
  await page.fill("#senha", "qualquer1");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 30000 });
  await page.waitForTimeout(1500);

  // 2. Topbar: nome correcto + pílula de data/hora ao centro
  const corpo = await page.textContent("body");
  ok("Topbar tem 'Portal Danmo Service System, Lda'",
     corpo.includes("Portal Danmo") && corpo.includes("Service System, Lda"));
  ok("Sem nome antigo com hífen", !corpo.includes("Portal Danmo -"));
  const pilula = await page.locator("header").textContent();
  ok("Pílula de data/hora presente (dia + hora)", /de \w+/.test(pilula) && /\d{2}:\d{2}/.test(pilula));

  // 3. Sidebar: Início activo + Definições (admin)
  const activo = await page.locator('a[aria-current="page"]').textContent();
  ok("Item activo é 'Início'", (activo || "").includes("Início"));
  ok("Admin vê 'Definições' no menu", corpo.includes("Definições"));
  // Fase 6: Admin. Oficinal entrou no ar (Faturação), logo "Fase 6"
  // saiu do menu; ficam Fase 5 (HST e Ferramentaria).
  ok("Fases marcadas no menu (Admin. Oficinal no ar: fase 6 saiu do menu)",
     !corpo.includes("Fase 4") && corpo.includes("Fase 5") && !corpo.includes("Fase 6") && !corpo.includes("Fase 7"));

  // 4. Herói: saudação + selos + cartões de fase (nas cores do logo)
  ok("Herói tem 'Olá,'", corpo.includes("Olá,"));
  ok("Herói tem saudação à hora", corpo.includes("Bom dia") || corpo.includes("Boa tarde") || corpo.includes("Boa noite"));
  ok("Boas-vindas correctas ('Bem-vindo ao portal da Danmo S. S. Lda')",
     corpo.includes("Bem-vindo ao portal da Danmo S. S. Lda"));
  ok("Sem o texto antigo 'novo portal Danmo'", !corpo.includes("Bem-vindo ao novo portal Danmo"));
  ok("Sem ponto verde junto ao nome", (await page.locator("h1 span.bg-sucesso").count()) === 0);
  ok("Selos de confiança", corpo.includes("Sistema seguro") && corpo.includes("Acesso autorizado") && corpo.includes("Em funcionamento"));
  ok("Cartões de fase", corpo.includes("Fundação") && corpo.includes("Oficina & Manutenção") && corpo.includes("Gestão de Stock"));
  ok("Pills de estado (stock passa a No ar)", corpo.includes("Concluída") && (corpo.match(/No ar/g) || []).length >= 2 && !corpo.includes("A seguir"));
  // Fase 6: 5 cartões (Oficina e Admin. Oficinal partilham o ambar)
  ok("Cartões nas cores do logo (verde + 2 ambar + vermelho + azul)",
     (await page.locator(".fase-verde").count()) === 1 &&
     (await page.locator(".fase-ambar").count()) === 2 &&
     (await page.locator(".fase-vermelha").count()) === 1 &&
     (await page.locator(".fase-azul").count()) === 1);
  ok("Sobre este painel presente", (await page.locator("#sobre").count()) === 1);
  ok("Painel 'Sobre' no claro acompanha o tema (texto verde profundo)",
     (await page.evaluate(() => getComputedStyle(document.querySelector(".painel-sobre")).color)) === "rgb(20, 83, 45)");
  await page.screenshot({ path: `${FOTOS}/v2-real-claro.png` });

  // 5. Acento do tema claro: VERDE da marca no item activo
  const acClaro = await page.evaluate(() =>
    getComputedStyle(document.querySelector('a[aria-current="page"]')).backgroundColor
  );
  ok("Acento claro é VERDE Danmo (rgba 0,150,57)", acClaro.includes("0, 150, 57"));

  // 6. Campainha: 3 novidades reais e badge desaparece ao abrir
  const badgeSel = "header span.bg-erro";
  ok("Badge de novidades visível antes", (await page.locator(badgeSel).count()) === 1);
  await page.getByRole("button", { name: /Novidades do portal/ }).click();
  await page.waitForTimeout(500);
  const corpoBell = await page.textContent("body");
  ok("Novidades reais na campainha", corpoBell.includes("Fase 1 concluída") && corpoBell.includes("Auto-registo activo"));
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  ok("Badge some depois de abrir", (await page.locator(badgeSel).count()) === 0);

  // 7. Tema escuro: unificado + acento VERDE no item activo
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await page.waitForTimeout(700);
  const acEscuro = await page.evaluate(() => {
    const a = document.querySelector('a[aria-current="page"]');
    return {
      cor: getComputedStyle(a).backgroundColor,
      escuro: document.documentElement.classList.contains("dark"),
      nav: getComputedStyle(document.querySelector("nav")).backgroundColor,
      header: getComputedStyle(document.querySelector("header")).backgroundColor
    };
  });
  ok("Modo escuro activo", acEscuro.escuro);
  ok("Acento escuro é VERDE (rgba 52,211,153)", acEscuro.cor.includes("52, 211, 153"));
  ok("Sidebar e topbar acompanham o escuro", acEscuro.nav !== "rgb(255, 255, 255)" && acEscuro.header !== "rgb(255, 255, 255)");
  await page.screenshot({ path: `${FOTOS}/v2-real-escuro.png` });

  // 8. Sidebar recolhível: ícones só (68px) e conteúdo expande
  await page.getByRole("button", { name: "Recolher o menu" }).click();
  await page.waitForTimeout(500);
  const pl = await page.evaluate(() =>
    getComputedStyle(document.querySelector("main")).paddingLeft
  );
  ok("Sidebar recolhida: conteúdo a 68px", pl === "68px");
  await page.screenshot({ path: `${FOTOS}/v2-real-recolhida.png` });
  await page.getByRole("button", { name: "Abrir o menu" }).click();
  await page.waitForTimeout(400);

  // 9. Personalizar portal (rota real): Voltar + chave primeiro +
  //    carregamento inicial que TERMINA (o spinner do Recarregar para)
  await page.goto(`${BASE}/admin/personalizar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const corpoFotos = await page.textContent("body");
  ok("Personalizar tem botão 'Voltar ao painel'", corpoFotos.includes("Voltar ao painel"));
  ok("Chave de administração no TOPO (antes das posições)",
     corpoFotos.indexOf("Chave de administração") < corpoFotos.indexOf("Posição 1"));
  ok("Zona de clicar ou arrastar", corpoFotos.includes("Clicar ou arrastar a foto"));
  ok("Explica que não é a senha de entrada", corpoFotos.includes("Não é a tua senha de entrada"));
  ok("Lista de posições carrega sozinha (sem o botão Recarregar antigo)",
     corpoFotos.includes("Posição 1") &&
     (await page.getByRole("button", { name: /Recarregar as fotos/ }).count()) === 0);
  await page.screenshot({ path: `${FOTOS}/v2-real-fotos.png` });

  // 10. Mobile: menu overlay com citação no fundo
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  mobile.on("pageerror", (e) => erros.push("mobile pageerror: " + e.message));
  await mobile.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mobile.fill("#codigo", "DM0069");
  await mobile.fill("#senha", "qualquer1");
  await mobile.getByRole("button", { name: "Entrar" }).click();
  await mobile.waitForURL(`${BASE}/`, { timeout: 30000 });
  await mobile.waitForTimeout(1200);
  await mobile.getByRole("button", { name: "Abrir menu" }).click();
  await mobile.waitForTimeout(600);
  await mobile.screenshot({ path: `${FOTOS}/v2-real-mobile.png` });
  const corpoMobile = await mobile.textContent("body");
  ok("Mobile: citação da marca no menu", corpoMobile.includes("Juntos construímos um sistema mais forte."));
  ok("Mobile: assinatura completa na sidebar", corpoMobile.includes("Danmo Service System, Lda"));
  await mobile.getByRole("button", { name: "Fechar menu" }).click();

  ok("Zero erros JavaScript", erros.length === 0);
  if (erros.length) console.log("ERROS:\n" + erros.join("\n"));

  console.log(resultado.join("\n"));
  console.log(`\nTOTAL: ${resultado.filter((r) => r.startsWith("PASSOU")).length}/${resultado.length}`);
  await browser.close();
})();
