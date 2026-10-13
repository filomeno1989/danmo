/**
 * Teste visual do portal Danmo - Fase 1 v2 (novo layout dos mockups).
 * Modo estrutura (bun dev sem .env.local): login aceita qualquer codigo.
 * Cobertura: topbar com pílula de data/hora, campainha com novidades
 * reais, acento por tema (azul claro / verde escuro), herói, cartões de
 * fase, personalizar com chave no topo e botão Voltar, sidebar
 * recolhível e mobile.
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

  // 1. Entrar (modo estrutura aceita qualquer credencial)
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
  ok("Fases marcadas no menu", corpo.includes("Fase 3") && corpo.includes("Fase 7"));

  // 4. Herói: saudação + selos + cartões de fase
  ok("Herói tem 'Olá,'", corpo.includes("Olá,"));
  ok("Herói tem saudação à hora", corpo.includes("Bom dia") || corpo.includes("Boa tarde") || corpo.includes("Boa noite"));
  ok("Selos de confiança", corpo.includes("Sistema seguro") && corpo.includes("Acesso autorizado") && corpo.includes("Em funcionamento"));
  ok("Cartões de fase", corpo.includes("Fundação") && corpo.includes("Oficina & Manutenção") && corpo.includes("Restantes módulos"));
  ok("Pills de estado", corpo.includes("Concluída") && corpo.includes("A seguir") && corpo.includes("Fases 2 e 4 a 7"));
  ok("Sobre este painel presente", (await page.locator("#sobre").count()) === 1);
  await page.screenshot({ path: `${FOTOS}/v2-real-claro.png` });

  // 5. Acento do tema claro: azul no item activo
  const acClaro = await page.evaluate(() =>
    getComputedStyle(document.querySelector('a[aria-current="page"]')).backgroundColor
  );
  ok("Acento claro é AZUL (rgba 37,99,235)", acClaro.includes("37, 99, 235"));

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

  // 9. Personalizar portal (rota real): Voltar + chave primeiro + arrastar
  await page.goto(`${BASE}/admin/personalizar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const corpoFotos = await page.textContent("body");
  ok("Personalizar tem botão 'Voltar ao painel'", corpoFotos.includes("Voltar ao painel"));
  ok("Chave de administração no TOPO (antes das posições)",
     corpoFotos.indexOf("Chave de administração") < corpoFotos.indexOf("Posição 1"));
  ok("Zona de clicar ou arrastar", corpoFotos.includes("Clicar ou arrastar a foto"));
  ok("Explica que não é a senha de entrada", corpoFotos.includes("Não é a tua senha de entrada"));
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
  await mobile.getByRole("button", { name: "Fechar menu" }).click();

  ok("Zero erros JavaScript", erros.length === 0);
  if (erros.length) console.log("ERROS:\n" + erros.join("\n"));

  console.log(resultado.join("\n"));
  console.log(`\nTOTAL: ${resultado.filter((r) => r.startsWith("PASSOU")).length}/${resultado.length}`);
  await browser.close();
})();
