/**
 * Teste do preenchimento automatico do Resumo Semanal pelas ordens
 * (pedido do Filomeno de 21/10: o movimento vem das obras, nao do
 * preenchimento a mao):
 *
 * A. Semana AINDA NAO gravada + OS calculadas -> as caixas nascem
 *    preenchidas com os numeros das OS (nao a zeros);
 * B. Frota sem numeros das OS -> fica a zero;
 * C. Sem hint "(x)" enquanto o valor e igual ao das OS; ao editar, o
 *    hint aparece com o valor original das OS;
 * D. Gravar leva os valores preenchidos (POST);
 * E. Semana JA gravada -> manda o gravado, mesmo com OS diferentes.
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) + mock de rede.
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3458";

const FROTAS = [
  "Reach-Stacker 45T", "Tratores 70T", "Tratores 60T", "Forklifts 2,5-16T",
  "Forklifts 30-50T", "Plataformas SK", "Plataformas R-R", "Pás Mecânicas (WLD)",
  "Escavadoras", "Manuseadoras", "Basculantes", "Outros"
];

const OS_CALCULADO = {
  "Reach-Stacker 45T": { pend_inicio: 5, entradas: 9, saidas: 2, aguardam_pecas: 3 },
  "Tratores 70T": { pend_inicio: 1, entradas: 4, saidas: 1, aguardam_pecas: 0 }
};

const GET_COM_OS = {
  ok: true,
  ano: 2026,
  semana: 44,
  intervalo: { de: "2026-10-26", ate: "2026-11-01" },
  meta: 80,
  frotas: FROTAS,
  osCalculado: OS_CALCULADO,
  guardado: {},
  disponibilidade: {},
  disponibilidadeGlobal: null,
  totalFrota: {},
  avarias: {},
  geral: { dificuldades: "", melhorias: [] }
};

const GET_GRAVADO = {
  ...GET_COM_OS,
  guardado: {
    "Reach-Stacker 45T": { pend_inicio: 7, entradas: 32, saidas: 33, aguardam_pecas: 7 }
  }
};

(async () => {
  const browser = await chromium.launch();
  const resultado = [];
  const ok = (nome, cond, detalhe = "") => {
    resultado.push(`${cond ? "PASSOU" : "FALHOU"} - ${nome}${detalhe ? ` (${detalhe})` : ""}`);
    if (!cond) process.exitCode = 1;
  };

  /* ============ A..D. semana por gravar: nasce preenchida pelas OS ============ */
  const contexto = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await contexto.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);
  const pagina = await contexto.newPage();

  let corpoPost = null;
  await pagina.route("**/api/disponibilidade/semana*", (rota) => {
    if (rota.request().method() === "POST") {
      corpoPost = rota.request().postDataJSON();
      rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, frotas: 12, melhorias: 0, avarias: 12 }) });
      return;
    }
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GET_COM_OS) });
  });

  await pagina.goto(`${BASE}/disponibilidade/semana`, { waitUntil: "networkidle" });

  const linhaRst = pagina.locator("tbody tr", { hasText: "Reach-Stacker 45T" }).first();
  ok("A. Pend. inicio nasce das OS (5)", (await linhaRst.locator("input").nth(0).inputValue()) === "5");
  ok("A. Entradas nasce das OS (9)", (await linhaRst.locator("input").nth(1).inputValue()) === "9");
  ok("A. Saidas nasce das OS (2)", (await linhaRst.locator("input").nth(2).inputValue()) === "2");
  ok("A. Aguardam pecas nasce das OS (3)", (await linhaRst.locator("input").nth(3).inputValue()) === "3");

  const linhaTt = pagina.locator("tbody tr", { hasText: "Tratores 70T" }).first();
  ok("B. Frota com OS tambem nasce preenchida (pend 1)", (await linhaTt.locator("input").nth(0).inputValue()) === "1");
  const linhaEsc = pagina.locator("tbody tr", { hasText: "Escavadoras" }).first();
  ok("B. Frota sem OS fica a zero", (await linhaEsc.locator("input").nth(0).inputValue()) === "0");

  ok("C. Sem hint enquanto igual as OS", (await linhaRst.locator("[title='calculado das OS']").count()) === 0);
  await linhaRst.locator("input").nth(0).fill("7");
  const hints = linhaRst.locator("[title='calculado das OS']");
  ok("C. Hint aparece ao editar, com o valor das OS", (await hints.count()) === 1 && (await hints.first().textContent())?.trim() === "(5)", await hints.first().textContent().catch(() => ""));

  await pagina.locator("button", { hasText: "Gravar semana" }).first().click();
  await pagina.waitForTimeout(400);
  const linhaPost = corpoPost?.linhas?.find((l) => l.frota === "Reach-Stacker 45T");
  ok("D. POST leva pend_inicio editado (7)", linhaPost?.pend_inicio === 7, String(linhaPost?.pend_inicio));
  ok("D. POST leva entradas preenchidas pelas OS (9)", linhaPost?.entradas === 9, String(linhaPost?.entradas));

  await contexto.close();

  /* ============ E. semana gravada manda ============ */
  const contexto2 = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await contexto2.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);
  const pagina2 = await contexto2.newPage();
  await pagina2.route("**/api/disponibilidade/semana*", (rota) =>
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GET_GRAVADO) })
  );
  await pagina2.goto(`${BASE}/disponibilidade/semana`, { waitUntil: "networkidle" });
  const linhaRst2 = pagina2.locator("tbody tr", { hasText: "Reach-Stacker 45T" }).first();
  ok("E. Gravado manda sobre as OS (pend 7)", (await linhaRst2.locator("input").nth(0).inputValue()) === "7");
  ok("E. Frota sem gravado nasce das OS na mesma (Tratores pend 1)", (await pagina2.locator("tbody tr", { hasText: "Tratores 70T" }).first().locator("input").nth(0).inputValue()) === "1");

  await browser.close();
  console.log(resultado.join("\n"));
  const falhas = resultado.filter((r) => r.startsWith("FALHOU")).length;
  console.log(`\nSEMANA AUTO OS: ${resultado.length - falhas}/${resultado.length} testes passaram`);
})().catch((e) => {
  console.error("ERRO FATAL:", e.message);
  process.exit(1);
});
