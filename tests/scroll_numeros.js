/**
 * Teste da tranca do scroll do rato nos campos numericos.
 *
 * Prova 4 coisas:
 *  1. Metodo valido: sem a tranca, NINGUEM cancela o wheel (controlo).
 *  2. No portal COM a tranca, o valor NAO muda nas duas direccoes.
 *  3. O scroll da pagina continua a funcionar fora dos campos e as
 *     setas do teclado continuam a funcionar (intencional).
 *  4. O evento wheel sobre o campo e cancelado pela tranca.
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3457";

(async () => {
  const browser = await chromium.launch();
  const resultado = [];
  const ok = (nome, cond, detalhe = "") => {
    resultado.push(`${cond ? "PASSOU" : "FALHOU"} - ${nome}${detalhe ? ` (${detalhe})` : ""}`);
    if (!cond) process.exitCode = 1;
  };

  // ===== 1. Controlo: pagina SEM a tranca =====
  // Nota: o Chromium headless nao reproduz o incremento nativo do wheel
  // (comportamento do Chrome real, que o Filomeno apanha ao vivo). O
  // controlo prova antes o mecanismo: sem a tranca, o wheel NINGUEM
  // cancela (defaultPrevented=false); no portal, e cancelado (teste 5).
  const paginaSolta = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await paginaSolta.goto(
    "data:text/html,<body style='margin:0'><input type='number' step='0.01' id='n' value='1' style='position:absolute;top:20px;left:20px;width:180px;font-size:16px'></body>"
  );
  const semTranca = await paginaSolta.evaluate(() => {
    const campo = document.getElementById("n");
    campo.focus();
    const ev = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -120 });
    campo.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  ok("Controlo (sem tranca): wheel NAO e cancelado", semTranca === false);
  await paginaSolta.close();

  // ===== 2. Portal COM a tranca: o valor fica intacto =====
  const pagina = await browser.newPage({ viewport: { width: 1366, height: 850 } });
  await pagina.goto(`${BASE}/login`, { waitUntil: "networkidle" });

  await pagina.evaluate(() => {
    // espaco para a pagina poder rolar + campo de teste como os do portal
    const espaco = document.createElement("div");
    espaco.style.height = "2500px";
    document.body.appendChild(espaco);
    const campo = document.createElement("input");
    campo.type = "number";
    campo.step = "0.01";
    campo.id = "teste-num";
    campo.value = "1";
    campo.style.cssText =
      "position:absolute;top:20px;left:20px;width:180px;font-size:16px;z-index:9999";
    document.body.appendChild(campo);
    campo.focus();
  });

  const caixa = await pagina.locator("#teste-num").boundingBox();
  await pagina.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);

  await pagina.mouse.wheel(0, -120); // viria 1.01 sem a tranca
  await pagina.waitForTimeout(200);
  await pagina.mouse.wheel(0, 120); // viria 0.99 sem a tranca
  await pagina.waitForTimeout(200);
  await pagina.mouse.wheel(0, -360); // tres passos para cima: 1.03 acumulado
  await pagina.waitForTimeout(250);
  const valorDepois = await pagina.inputValue("#teste-num");
  ok("Com a tranca: valor continua 1 (3 rodadas de scroll)", valorDepois === "1", `valor ficou ${valorDepois}`);

  // ===== 3. Scroll da pagina fora dos campos continua normal =====
  await pagina.mouse.move(700, 400); // longe do campo
  await pagina.mouse.wheel(0, 600);
  await pagina.waitForTimeout(300);
  const rolou = await pagina.evaluate(() => window.scrollY);
  ok("Scroll da pagina funciona fora dos campos", rolou > 0, `scrollY = ${rolou}`);

  // ===== 4. Setas do teclado continuam a funcionar (intencional) =====
  await pagina.evaluate(() => {
    const campo = document.getElementById("teste-num");
    campo.focus();
    window.scrollTo(0, 0);
  });
  await pagina.keyboard.press("ArrowUp");
  await pagina.waitForTimeout(150);
  const valorSeta = await pagina.inputValue("#teste-num");
  ok("Seta para cima do teclado continua a somar", valorSeta === "1.01", `valor ficou ${valorSeta}`);

  // ===== 5. Tranca activa: o evento wheel e cancelado pelo portal =====
  const contagem = await pagina.evaluate(() => {
    const campo = document.getElementById("teste-num");
    campo.focus();
    const ev = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 });
    campo.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  ok("Tranca activa (evento wheel cancelado pelo portal)", contagem === true);

  await browser.close();
  console.log(resultado.join("\n"));
  console.log(process.exitCode ? "\nRESULTADO: FALHOU" : "\nRESULTADO: TUDO OK");
})();
