/**
 * Teste da ponte Ordens -> Disponibilidade + pesquisa/links da Faturação:
 *
 * A. GRELHA com dias sintetizados (ponte):
 *    - dia de obra (origem "ordem") mostra a obra no tooltip e no painel
 *      do dia, com link para a ficha da obra;
 *    - dia implícito "Disponível 24h" (origem "auto") pinta de verde sem
 *      ninguém ter marcado nada;
 *    - "Paradas neste momento" mostra o link da obra;
 *    - horas do mês por estado contam os dias sintetizados.
 * B. FATURAÇÃO:
 *    - campo de pesquisa por nº de obra ou máquina filtra KPIs, resumo e lista;
 *    - nº de obra é link para a ficha (/oficina/ordens/{os_id});
 *    - máquina é link para o histórico (/oficina/maquina/{equipment_id});
 *    - pesquisa sem resultados mostra "Nenhuma obra com os filtros escolhidos."
 *
 * A grelha abre no mês CORRENTE do navegador: os fixtures seguem o
 * calendário (mês e nº de dias calculados à hora), para o teste rodar em
 * qualquer mês sem morrer - era a dependência de data que fazia os
 * fixtures de Outubro falharem em Novembro.
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) + mock de rede.
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");

const BASE = process.env.BASE || "http://localhost:3458";

/* Mês corrente do navegador (a grelha nasce nele) + nº de dias do mês. */
const AGORA = new Date();
const MES = `${AGORA.getFullYear()}-${String(AGORA.getMonth() + 1).padStart(2, "0")}`;
const NDIAS = new Date(AGORA.getFullYear(), AGORA.getMonth() + 1, 0).getDate();
const dd = (n) => String(n).padStart(2, "0");

const EQUIPS = [
  { id: 1, code: "2.5-01", name: "Doosan", group_name: "FKL 2.5T", active: true },
  { id: 2, code: "45-17", name: "Sany", group_name: "RST 45T", active: true }
];

/* Totais esperados, derivados dos mesmos NDIAS que a grelha desenha:
   Disponível = (NDIAS-2) dias da máquina 1 + (NDIAS-1) da máquina 2, a
   24 h cada; Avariada = dia 1 (manual) + dia 3 (obra) a 24 h cada;
   Pneumático = dia 5 da obra a 24 h. */
const HORAS_DISPONIVEL = (NDIAS - 2) * 24 + (NDIAS - 1) * 24;

function construirDias() {
  const dias = [];
  let id = 1;
  for (let dia = 1; dia <= NDIAS; dia++) {
    const data = `${MES}-${dd(dia)}`;
    // máquina 1: dia 1 marcado à mão (Avariada), dia 3 vem da obra 68245
    if (dia === 1) {
      dias.push({ id: id++, equipment_id: 1, data, estado: "Avariada", horas_disponiveis: 0, hora_entrada: "08:00", hora_saida: null, observacao: "bombas" });
    } else if (dia === 3) {
      dias.push({ id: id++, equipment_id: 1, data, estado: "Avariada", horas_disponiveis: 0, hora_entrada: null, hora_saida: null, observacao: null, origem: "ordem", os_id: 91, numero_obra: "68245" });
    } else {
      dias.push({ id: id++, equipment_id: 1, data, estado: "Disponível", horas_disponiveis: 24, hora_entrada: null, hora_saida: null, observacao: null, origem: "auto" });
    }
    // máquina 2: dia 5 parada pela obra 70088 (Pneumático), resto automático
    if (dia === 5) {
      dias.push({ id: id++, equipment_id: 2, data, estado: "Pneumático", horas_disponiveis: 0, hora_entrada: null, hora_saida: null, observacao: null, origem: "ordem", os_id: 77, numero_obra: "70088" });
    } else {
      dias.push({ id: id++, equipment_id: 2, data, estado: "Disponível", horas_disponiveis: 24, hora_entrada: null, hora_saida: null, observacao: null, origem: "auto" });
    }
  }
  return dias;
}

const DIAS_GET = {
  ok: true,
  mes: MES,
  equipamentos: EQUIPS,
  dias: construirDias(),
  transicoesAbertas: [
    { id: 12, equipment_id: 2, estado: "Avariada", inicio: `${MES}-02T00:00:00+02:00`, code: "45-17", nome: "Sany", obra: "72849", os_id: 12 }
  ],
  resumoSemanal: [
    { semana: 1, pct: 91.1, maquinas: 2, dias: 4 },
    { semana: 2, pct: 94.6, maquinas: 2, dias: 7 }
  ],
  resumoMes: { horasDisponiveis: HORAS_DISPONIVEL, diasMarcados: 1 }
};

const FATURACAO_GET = {
  ok: true,
  linhas: [
    {
      id: 501, os_id: 501, numero_obra: "70001", equipment_id: 33, equip_code: "DM001",
      data_fecho: "2026-09-10", data_abertura: "2026-09-02", dias_ate_fecho: 8, dias_apos_trabalho: 1,
      horas_cdm: 8, horas_nossas: 7.5, diferenca_horas: 0.5, valor_hora: 1500,
      total_mao_obra: 12000, total_material: 2500, total_geral: 14500,
      materiais: [], diagnostico: "Falha de marcha", responsavel: "Filomeno", observacao: null
    },
    {
      id: 502, os_id: 502, numero_obra: "70002", equipment_id: 34, equip_code: "DM014",
      data_fecho: "2026-09-20", data_abertura: "2026-09-12", dias_ate_fecho: 8, dias_apos_trabalho: 2,
      horas_cdm: 10, horas_nossas: 10, diferenca_horas: 0, valor_hora: 1600,
      total_mao_obra: 16000, total_material: 4800, total_geral: 20800,
      materiais: [], responsavel: "Filomeno", observacao: null
    }
  ],
  porMes: [],
  totais: { obras: 2, horas_cdm: 18, horas_nossas: 17.5, total_mao_obra: 28000, total_material: 7300, total_geral: 35300 }
};

(async () => {
  const browser = await chromium.launch();
  const resultado = [];
  const ok = (nome, cond, detalhe = "") => {
    resultado.push(`${cond ? "PASSOU" : "FALHOU"} - ${nome}${detalhe ? ` (${detalhe})` : ""}`);
    if (!cond) process.exitCode = 1;
  };
  const normalizar = (t) => t.replace(/[\u00A0\u202F]/g, " ");

  /* ================= A. GRELHA ================= */
  const contextoA = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await contextoA.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);
  const pagina = await contextoA.newPage();
  await pagina.route("**/api/disponibilidade/dias*", (rota) => {
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DIAS_GET) });
  });
  await pagina.route("**/api/disponibilidade/config*", (rota) => {
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, meta: 80, legenda: {}, notas: null }) });
  });
  await pagina.goto(`${BASE}/disponibilidade/grelha`, { waitUntil: "networkidle" });

  // dia de obra: tooltip com a obra
  const celulaObra = pagina.locator(`button[title*='2.5-01 · ${MES}-03']`);
  ok("Grelha: celula do dia da obra tem a obra no tooltip", (await celulaObra.count()) === 1 && (await celulaObra.getAttribute("title") || "").includes("Obra 68245"), await celulaObra.getAttribute("title").catch(() => ""));

  // dia implícito: verde Disponível sem marcação
  const celulaAuto = pagina.locator(`button[title*='2.5-01 · ${MES}-02']`);
  const classeAuto = (await celulaAuto.getAttribute("class")) || "";
  ok("Grelha: dia implicito Disponivel pinta de verde cheio", classeAuto.includes("bg-sucesso") && !classeAuto.includes("bg-sucesso-bg"), classeAuto);

  // abrir o painel do dia da obra
  await celulaObra.click();
  await pagina.waitForTimeout(300);
  const modalTexto = normalizar(await pagina.textContent("body"));
  ok("Grelha: painel do dia mostra a obra que parou a maquina", modalTexto.includes("Parada pela obra 68245"));
  ok("Grelha: painel do dia liga a ficha da obra", (await pagina.locator("a[href='/oficina/ordens/91']").count()) > 0);
  ok("Grelha: painel do dia mantem os 7 estados e Sem marcação", (await pagina.locator("button:text-is('Sem marcação')").count()) > 0);
  await pagina.locator("button:text-is('Cancelar')").click();

  // paradas neste momento com obra
  const linkParada = pagina.locator("#__next a[href='/oficina/ordens/12'], body a[href='/oficina/ordens/12']").first();
  ok("Grelha: Paradas neste momento mostra Obra 72849 com link", (await linkParada.count()) > 0 && (await linkParada.textContent() || "").includes("Obra 72849"));

  // horas do mês por estado contam os dias sintetizados:
  // m1: NDIAS-2 dias Disponível + dia 2 (24h) = (NDIAS-1)x24; m2: (NDIAS-1)x24
  const corpoA = normalizar(await pagina.textContent("body"));
  ok(`Grelha: horas de Disponível contam dias automaticos (${HORAS_DISPONIVEL} h)`, corpoA.includes(`${HORAS_DISPONIVEL} h`));
  // (o cartão fica identificado pelo h2: as paradas em curso também têm li de estado e vêm antes no DOM)
  const liAvariada = pagina.locator("div.card-sombra:has(h2:has-text('Horas do mês por estado')) li:has-text('Avariada')").first();
  ok("Grelha: horas de Avariada = 48 h (marcada + obra)", (await liAvariada.textContent() || "").includes("48 h"));
  const liPneu = pagina.locator("div.card-sombra:has(h2:has-text('Horas do mês por estado')) li:has-text('Pneumático')").first();
  ok("Grelha: horas de Pneumático = 24 h (obra)", (await liPneu.textContent() || "").includes("24 h"));

  await contextoA.close();

  /* ================= B. FATURAÇÃO ================= */
  const contextoB = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await contextoB.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);
  const pagB = await contextoB.newPage();
  await pagB.route("**/api/oficina/faturacao*", (rota) => {
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(FATURACAO_GET) });
  });
  await pagB.route("**/api/oficina/precos*", (rota) => {
    rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, precos: [] }) });
  });
  await pagB.goto(`${BASE}/oficina/faturacao`, { waitUntil: "networkidle" });

  const busca = pagB.locator("input[aria-label='Buscar por obra ou máquina']");
  ok("Faturação: campo de pesquisa existe", (await busca.count()) === 1);

  // links na tabela
  ok("Faturação: nº de obra 70001 liga a ficha da obra", (await pagB.locator("a[href='/oficina/ordens/501']").count()) > 0);
  ok("Faturação: máquina DM001 liga ao histórico da máquina", (await pagB.locator("a[href='/oficina/maquina/33']").count()) > 0);

  // pesquisa por obra
  await busca.fill("70001");
  await pagB.waitForTimeout(250);
  let corpoB = normalizar(await pagB.textContent("body"));
  ok("Faturação: pesquisa por obra filtra a lista (1 obra)", corpoB.includes("Obras fechadas (1)") && !corpoB.includes("70002"));
  ok("Faturação: KPI acompanha o filtro (1 obra)", corpoB.includes("Obras fechadas1") || /Obras fechadas\s*1/.test(corpoB), "KPI");

  // pesquisa por máquina
  await busca.fill("DM014");
  await pagB.waitForTimeout(250);
  corpoB = normalizar(await pagB.textContent("body"));
  ok("Faturação: pesquisa por máquina acha a obra 70002", corpoB.includes("70002") && !corpoB.includes("70001"));

  // pesquisa sem resultados
  await busca.fill("zzzz");
  await pagB.waitForTimeout(250);
  corpoB = normalizar(await pagB.textContent("body"));
  ok("Faturação: sem resultados mostra mensagem de filtros", corpoB.includes("Nenhuma obra com os filtros escolhidos."));

  // limpar a pesquisa restaura
  await busca.fill("");
  await pagB.waitForTimeout(250);
  corpoB = normalizar(await pagB.textContent("body"));
  ok("Faturação: limpar a pesquisa restaura as 2 obras", corpoB.includes("Obras fechadas (2)") && corpoB.includes("70001"));

  await contextoB.close();
  await browser.close();

  console.log(resultado.join("\n"));
  const passaram = resultado.filter((r) => r.startsWith("PASSOU")).length;
  console.log(`\nPONTE + FATURACAO: ${passaram}/${resultado.length} testes passaram`);
})();
