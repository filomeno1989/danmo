/**
 * Teste visual do FUNDO DE IMPRESSÃO (papel) no tema escuro.
 *
 * Bug do Filomeno: no print das ordens, a área vazia no fim do papel
 * saía PRETA (tóner desperdiçado). Dois mecanismos, provados com PDF
 * paginado real (page.pdf + pdftoppm + contagem de pixels):
 *
 * 1. BODY escuro: a migração perdeu o `body { background: #fff }` do
 *    @media print que o hub tinha; o body do portal segue o tema e, no
 *    escuro, é #0b0f19 (quase preto). Na última página, abaixo de onde
 *    o conteúdo acaba, o canvas aparecia com essa cor (bloco preto).
 *    Corrigido no próprio impresso (igual ao hub e à faturação).
 *
 * 2. COLOR-SCHEME escuro: o next-themes põe color-scheme: dark no
 *    <html>; o Chromium pinta a área de margem @page (e o canvas) com
 *    a cor escura do sistema: folhas com margem (checklist usa 10mm)
 *    saíam com moldura preta em toda a volta. Corrigido uma vez só no
 *    globals.css (@media print: html color-scheme light) para todos os
 *    impressos presentes e futuros.
 *
 * Método: gera os PDFs em TEMA ESCURO, converte a última página a PNG
 * (pdftoppm) e mede a fração de pixels escuros (luminância < 90) na
 * faixa inferior de 25% da última página, onde antes vivia o bloco
 * preto. Antes da correção: OS 80,7%, Checklist 22,2%. Depois: ~0%.
 *
 * Ambiente: servidor dev SEM chaves (modo estrutura) na porta 3458 +
 * mocks de rede no estilo da base real (Playwright route), igual aos
 * outros testes do portal. Dependências de sistema: pdftoppm e python3
 * com PIL (ambos já usados nas provas do portal).
 */

const { chromium } = require("/home/z/.npm-global/lib/node_modules/playwright");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

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

const LINHAS_EXTRA = 14; // obriga o papel a transbordar para a 2a página

const OS_MOCK = {
  ok: true,
  os: {
    id: 77,
    numero_obra: "OS-2026-042",
    equipment_id: 5,
    data_abertura: "2026-10-20",
    status_atual: "Chefe da Oficina",
    aberto_por: ["Filomeno Manuel"],
    descricao_avaria:
      "Empilhadora sem força no avanço; suspeita de bomba hidráulica com desgaste e filtro saturado.",
    hora_equipamento: 1234.5,
    unidade_medida: "h",
    tipo_intervencao: ["Inspeção Geral", "Rep. Sis. Hidráulico", "Rep. Sis. Elétrico"],
    sector: "Terminal de Contentores",
    nome_cliente: "CdM"
  },
  equip: { code: "FD-245" },
  timeline: [
    { id: 1, os_id: 77, status_anterior: null, status_novo: "Supervisão", data_mudanca: "2026-10-20T08:30:00Z", responsavel: "Filomeno Manuel" },
    { id: 2, os_id: 77, status_anterior: "Supervisão", status_novo: "Chefe da Oficina", data_mudanca: "2026-10-21T10:00:00Z", responsavel: "Eng. Casimiro" },
    { id: 3, os_id: 77, status_anterior: "Chefe da Oficina", status_novo: "Departamento Técnico", data_mudanca: "2026-10-22T14:20:00Z", responsavel: "Carlos Tembe" }
  ],
  intervencoes: [
    { id: 1, shift_date: "2026-10-20", time_start: "08:00", time_end: "12:00", hours: 4, description: "Drenagem do óleo hidráulico e substituição do filtro", tecnicos: [{ id: 1, name: "João Macuácua", code: "DM0123" }], setores: ["Mecânica"] },
    { id: 2, shift_date: "2026-10-21", time_start: "07:30", time_end: "13:30", hours: 6, description: "Substituição da bomba hidráulica e purga do sistema", tecnicos: [{ id: 1, name: "João Macuácua", code: "DM0123" }], setores: ["Mecânica"] },
    { id: 3, shift_date: "2026-10-21", time_start: "09:00", time_end: "11:30", hours: 2.5, description: "Reparação do chicote elétrico do sensor de carga", tecnicos: [{ id: 3, name: "Ernesto Chissano", code: "DM0155" }], setores: ["Elétrica"] },
    { id: 4, shift_date: "2026-10-22", time_start: "07:30", time_end: "12:30", hours: 5, description: "Teste de carga e calibração da válvula de alívio", tecnicos: [{ id: 1, name: "João Macuácua", code: "DM0123" }, { id: 2, name: "Amosse Cuambe", code: "DM0140" }], setores: ["Mecânica"] },
    { id: 5, shift_date: "2026-10-22", time_start: "14:00", time_end: "16:00", hours: 2, description: "Lubrificação geral e aperto de torções", tecnicos: [{ id: 4, name: "Salomão Nhaca", code: "DM0161" }], setores: ["Lubrificação"] },
    { id: 6, shift_date: "2026-10-23", time_start: "08:00", time_end: "10:00", hours: 2, description: "Ensaio final em vazio e em carga", tecnicos: [{ id: 1, name: "João Macuácua", code: "DM0123" }], setores: ["Mecânica"] },
    { id: 7, shift_date: "2026-10-23", time_start: "10:30", time_end: "12:00", hours: 1.5, description: "Limpeza da máquina e pintura de retoque no chassis", tecnicos: [{ id: 2, name: "Amosse Cuambe", code: "DM0140" }], setores: ["Outros"] }
  ],
  pecas: [
    { id: 1, peca: "Filtro hidráulico HF-6655", data: "2026-10-20", quantidade: 2, unidade: "un", colaborador: "João Macuácua" },
    { id: 2, peca: "Óleo hidráulico ISO 46 (20 L)", data: "2026-10-20", quantidade: 3, unidade: "Lt", colaborador: "Amosse Cuambe" },
    { id: 3, peca: "Bomba hidráulica CBK-F25", data: "2026-10-21", quantidade: 1, unidade: "un", colaborador: "João Macuácua" },
    { id: 4, peca: "Kit juntas da bomba", data: "2026-10-21", quantidade: 1, unidade: "kit", colaborador: "João Macuácua" },
    { id: 5, peca: "Sensor de carga original", data: "2026-10-21", quantidade: 1, unidade: "un", colaborador: "Ernesto Chissano" },
    { id: 6, peca: "Graxa EP2 (5 Kg)", data: "2026-10-22", quantidade: 1, unidade: "Kg", colaborador: "Salomão Nhaca" }
  ].concat(
    Array.from({ length: LINHAS_EXTRA }, (_, i) => ({
      id: 100 + i,
      peca: `Material diverso de apoio nº ${i + 1}`,
      data: "2026-10-23",
      quantidade: 1,
      unidade: "un",
      colaborador: i % 2 ? "Amosse Cuambe" : "João Macuácua"
    }))
  )
};

const CK_MOCK = {
  ok: true,
  checklist: {
    numero_obra: "OS-2026-042",
    horas_equipamento: 1234,
    data_revisao: "2026-10-20",
    horas_trabalho: 6,
    folha_numero: "001",
    executante: "João Macuácua",
    executante_data: "2026-10-20",
    encarregado: "Carlos Tembe",
    encarregado_data: "2026-10-21",
    observacoes_gerais: "Máquina entregue em condições; rever novamente às 250 h."
  },
  template: { id: 1, categoria_equipamento: "Empilhadora", nome: "REVISÃO 250H", tipo: "mecanica", intervalo_horas: 250, intervalo_label: "250 h", ref_versao: "v3", ativo: true },
  secoes: [
    { id: 1, template_id: 1, nome_secao: "Motor", ordem: 1 },
    { id: 2, template_id: 1, nome_secao: "Sistema Hidráulico", ordem: 2 },
    { id: 3, template_id: 1, nome_secao: "Segurança", ordem: 3 }
  ],
  itensTemplate: [
    { id: 1, secao_id: 1, numero_item: 1, descricao: "Nível e estado do óleo do motor", ordem: 1 },
    { id: 2, secao_id: 1, numero_item: 2, descricao: "Filtro de óleo e de combustível", ordem: 2 },
    { id: 3, secao_id: 1, numero_item: 3, descricao: "Correia do alternador (tensão e estado)", ordem: 3 },
    { id: 4, secao_id: 1, numero_item: 4, descricao: "Sistema de arrefecimento e mangueiras", ordem: 4 },
    { id: 5, secao_id: 2, numero_item: 5, descricao: "Nível do óleo hidráulico", ordem: 5 },
    { id: 6, secao_id: 2, numero_item: 6, descricao: "Filtro hidráulico", ordem: 6 },
    { id: 7, secao_id: 2, numero_item: 7, descricao: "Cilindros (fugas e vedações)", ordem: 7 },
    { id: 8, secao_id: 2, numero_item: 8, descricao: "Mangueiras e abraçadeiras", ordem: 8 },
    { id: 9, secao_id: 3, numero_item: 9, descricao: "Cinto de segurança", ordem: 9 },
    { id: 10, secao_id: 3, numero_item: 10, descricao: "Buzina e luzes de trabalho", ordem: 10 },
    { id: 11, secao_id: 3, numero_item: 11, descricao: "Espelhos e sinalização", ordem: 11 },
    { id: 12, secao_id: 3, numero_item: 12, descricao: "Extintor (validade e pressão)", ordem: 12 }
  ],
  itensResp: [
    { id: 1, checklist_id: 88, template_item_id: 1, executado: "sim", estado: "bom", observacao: null },
    { id: 2, checklist_id: 88, template_item_id: 2, executado: "sim", estado: "bom", observacao: "Substituído" },
    { id: 3, checklist_id: 88, template_item_id: 3, executado: "sim", estado: "danificado", observacao: "A trocar na próxima revisão" },
    { id: 4, checklist_id: 88, template_item_id: 4, executado: "sim", estado: "bom", observacao: null },
    { id: 5, checklist_id: 88, template_item_id: 5, executado: "sim", estado: "bom", observacao: null },
    { id: 6, checklist_id: 88, template_item_id: 6, executado: "sim", estado: "bom", observacao: "HF-6655" },
    { id: 7, checklist_id: 88, template_item_id: 7, executado: "nao", estado: "danificado", observacao: "Fuga lenta no cilindro de elevação" },
    { id: 8, checklist_id: 88, template_item_id: 8, executado: "sim", estado: "bom", observacao: null },
    { id: 9, checklist_id: 88, template_item_id: 9, executado: "sim", estado: "bom", observacao: null },
    { id: 10, checklist_id: 88, template_item_id: 10, executado: "sim", estado: "bom", observacao: null },
    { id: 11, checklist_id: 88, template_item_id: 11, executado: "sim", estado: "bom", observacao: null },
    { id: 12, checklist_id: 88, template_item_id: 12, executado: "sim", estado: "bom", observacao: "Válido até 03/2027" }
  ],
  equip: { code: "FD-245" },
  colaboradores: [
    { id: 1, name: "João Macuácua", code: "DM0123" },
    { id: 2, name: "Carlos Tembe", code: "DM0101" }
  ]
};

/* ============ medição de pixels (pdftoppm + python3/PIL) ============ */

/** Fração de pixels escuros na faixa inferior da ÚLTIMA página do PDF. */
function medirUltimaPagina(pdfPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fundo-print-"));
  try {
    execFileSync("pdftoppm", ["-png", "-r", "60", pdfPath, path.join(tmp, "pag")]);
    const pags = fs.readdirSync(tmp).filter((f) => f.endsWith(".png")).sort();
    if (pags.length === 0) throw new Error(`pdftoppm não gerou páginas: ${pdfPath}`);
    const ultima = path.join(tmp, pags[pags.length - 1]);
    const script = `
import json, sys
from PIL import Image
img = Image.open(sys.argv[1]).convert("RGB")
w, h = img.size
px = img.load()
def escuros(y0, y1):
    e = t = 0
    for y in range(y0, y1):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            t += 1
            if 0.299*r + 0.587*g + 0.114*b < 90:
                e += 1
    return e / t if t else 0.0
print(json.dumps({"paginas": ${pags.length}, "faixa_inferior": escuros(int(h*0.75), h), "pagina_toda": escuros(0, h)}))
`;
    const saida = execFileSync("python3", ["-c", script, ultima], { encoding: "utf8" });
    return JSON.parse(saida.trim().split("\n").pop());
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/* ============ prova ============ */

(async () => {
  const browser = await chromium.launch();

  /** Contexto com tema ESCURO (cenário do bug) ou claro (controlo). */
  async function contexto(tema) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addCookies([{ name: "dss_token", value: "estrutura", url: BASE }]);
    await ctx.addInitScript((t) => {
      window.localStorage.setItem("theme", t);
    }, tema);
    await ctx.route("**/api/oficina/ordens/77", (rota) => rota.fulfill({ json: OS_MOCK }));
    await ctx.route("**/api/oficina/checklist/88", (rota) => rota.fulfill({ json: CK_MOCK }));
    return ctx;
  }

  async function pdfDe(ctx, rota, seletorEspera, destino) {
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded" });
    await pg.waitForSelector(seletorEspera, { timeout: 20000 });
    await pg.waitForTimeout(600);
    await pg.pdf({
      path: destino,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true
    });
    await pg.close();
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fundo-print-prova-"));

  try {
    /* ---------- TEMA ESCURO: o cenário do bug ---------- */
    const ctxEscuro = await contexto("dark");

    const osPdf = path.join(tmpDir, "os.pdf");
    await pdfDe(ctxEscuro, "/imprimir/os/77", ".folha", osPdf);
    const mOs = medirUltimaPagina(osPdf);
    ok("OS (escuro): papel transborda para 2 paginas (cenario do relato)", mOs.paginas >= 2, `paginas=${mOs.paginas}`);
    ok(
      "OS (escuro): faixa inferior da ultima pagina sem bloco preto (<5%)",
      mOs.faixa_inferior < 0.05,
      `escuros=${(mOs.faixa_inferior * 100).toFixed(1)}% (era 80.7% antes da correcao)`
    );

    const ckPdf = path.join(tmpDir, "ck.pdf");
    await pdfDe(ctxEscuro, "/imprimir/checklist/88", ".folha-fundo", ckPdf);
    const mCk = medirUltimaPagina(ckPdf);
    ok(
      "Checklist (escuro): sem moldura preta na margem @page (<5% em baixo)",
      mCk.faixa_inferior < 0.05,
      `escuros=${(mCk.faixa_inferior * 100).toFixed(1)}% (era 22.2% antes da correcao)`
    );
    ok(
      "Checklist (escuro): pagina toda so com o conteudo azul/texto (<12%)",
      mCk.pagina_toda < 0.12,
      `escuros=${(mCk.pagina_toda * 100).toFixed(1)}%`
    );

    /* ---------- TEMA CLARO: controlo (na regrediu nada) ---------- */
    const ctxClaro = await contexto("light");
    const osPdfClaro = path.join(tmpDir, "os-claro.pdf");
    await pdfDe(ctxClaro, "/imprimir/os/77", ".folha", osPdfClaro);
    const mOsClaro = medirUltimaPagina(osPdfClaro);
    ok(
      "OS (claro): faixa inferior continua branca (<5%)",
      mOsClaro.faixa_inferior < 0.05,
      `escuros=${(mOsClaro.faixa_inferior * 100).toFixed(1)}%`
    );

    /* ---------- Guarda estrutural: as regras da correcao existem ---------- */
    const globals = fs.readFileSync("src/app/globals.css", "utf8");
    ok(
      "globals.css: @media print com color-scheme claro e body branco",
      /@media print\s*\{[^}]*html\s*\{[^}]*color-scheme:\s*light[^}]*\}/s.test(globals.replace(/\n/g, " ")) &&
        /@media print\s*\{[\s\S]*body\s*\{[^}]*background:\s*#fff[^}]*\}/.test(globals),
      ""
    );
    const osSrc = fs.readFileSync("src/app/imprimir/os/[id]/os-imprimir.tsx", "utf8");
    const ckSrc = fs.readFileSync("src/app/imprimir/checklist/[id]/checklist-imprimir.tsx", "utf8");
    ok("OS: body branco no @media print (porto do hub)", /@media print\s*\{[\s\S]*?body\s*\{\s*background:\s*#fff\s*!important/.test(osSrc));
    ok("Checklist: body branco no @media print (porto do hub)", /@media print\s*\{[\s\S]*?body\s*\{\s*background:\s*#fff\s*!important/.test(ckSrc));

    await ctxEscuro.close();
    await ctxClaro.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await browser.close();
  }

  console.log(`\nTotal: ${passaram} OK, ${falharam} FAIL`);
  process.exit(falharam > 0 ? 1 : 0);
})().catch((e) => {
  console.error("ERRO NO TESTE:", e);
  process.exit(1);
});
