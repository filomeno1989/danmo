/**
 * Testes da lógica da ponte Ordens -> Disponibilidade (servidor).
 *
 * Corre com bun test (não Playwright): funções puras da lib + as rotas
 * API da Disponibilidade com fetch stubado e sessão mockada.
 *
 *  A. sintetizarDias: o mês em curso NUNCA inventa dias futuros
 *     (pedido do Filomeno de 21/10: a percentagem recolhida a dia 21
 *     não pode contar os dias 22-31)
 *  B. sintetizarDias: mês passado fica intacto (comportamento antigo)
 *  C. sintetizarAnoMensal: agregado do ano em curso (meses fechados
 *     completos, mês em curso até hoje, explícito ganha, futuro não entra)
 *  D. calcularMovimentoDeOrdens: chaves iguais às linhas do Resumo Semanal
 *  E. GET /api/disponibilidade/dias: sem dias > hoje, resumos só até hoje
 *  F. GET /api/disponibilidade/painel: ano em curso com dados, futuros a
 *     zero, anos fechados não tocam nas ordens
 *  G. GET /api/disponibilidade/semana: osCalculado com as chaves certas
 */

import { describe, it, expect, mock, beforeAll } from "bun:test";

process.env.SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_KEY = "stub-key";

mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token-falso" }) })
}));

function hojeMaputo(): string {
  const agora = new Date();
  const maputo = new Date(agora.getTime() + (2 * 60 + agora.getTimezoneOffset()) * 60000);
  return maputo.toISOString().slice(0, 10);
}

const HOJE = hojeMaputo();
const ANO = Number(HOJE.slice(0, 4));
const MES = Number(HOJE.slice(5, 7));
const DIA = Number(HOJE.slice(8, 10));
const MES_STR = HOJE.slice(0, 7);
const ULT_DIA = new Date(Date.UTC(ANO, MES, 0)).getUTCDate();
const diasNoMes = (m: number) => new Date(Date.UTC(ANO, m, 0)).getUTCDate();

type Linha = Record<string, unknown>;

/** Máquinas: 2 activas (frotas diferentes) + 1 inactiva. */
const EQUIPOS: Linha[] = [
  { id: 1, code: "45-01", name: "RS um", group_name: "RST 45T", active: true },
  { id: 2, code: "70-01", name: "TT um", group_name: "TT 70T", active: true },
  { id: 3, code: "99-01", name: "X", group_name: "Outros", active: false }
];

/** Ordens do mês em curso: obra aberta na máquina 1 (dia 5) e obra
 *  fechada na máquina 2 (abriu dia 1, saiu dia 8). */
const ORDENS_MES: Linha[] = [
  {
    id: 11, numero_obra: "70001", equipment_id: 1,
    data_abertura: `${MES_STR}-05`, data_fecho: null,
    status_atual: "Aberta", status_fisico: "Avariada", atualizado_em: null
  },
  {
    id: 12, numero_obra: "70002", equipment_id: 2,
    data_abertura: `${MES_STR}-01`, data_fecho: `${MES_STR}-08`,
    status_atual: "Fechada", status_fisico: "Revisão/Manutenção", atualizado_em: null
  }
];

/** Marcações explícitas: inactiva com dia marcado + marcação futura. */
const DIAS_ANO: Linha[] = [
  { equipment_id: 3, data: `${MES_STR}-02`, estado: "Avariada", horas_disponiveis: 0 },
  { equipment_id: 1, data: `${MES_STR}-${String(ULT_DIA).padStart(2, "0")}`, estado: "Avariada", horas_disponiveis: 0 }
];

/** disp_mensal oficial: só 2025 (o ano em curso não tem excel). */
const MENSAL_2025: Linha[] = [1, 2].flatMap((eq) =>
  Array.from({ length: 12 }, (_, i) => ({
    equipment_id: eq, ano: 2025, mes: i + 1,
    horas_a: 600, horas_pm: 60, horas_ty: 0, horas_ac: 0, horas_bd: 24, horas_sp: 0,
    horas_total: 720
  }))
);

let cenario = {
  equipamentos: EQUIPOS,
  ordens: ORDENS_MES,
  transicoes: [] as Linha[],
  dias: DIAS_ANO,
  mensal: MENSAL_2025,
  horometro: [] as Linha[],
  semanal: [] as Linha[],
  geral: [] as Linha[],
  avarias: [] as Linha[],
  config: [{ meta_disponibilidade: 80 }]
};

const pedidos: string[] = [];

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" }
  });
}

beforeAll(() => {
  globalThis.fetch = (async (entrada: string | URL | Request) => {
    const url = String(typeof entrada === "object" && entrada !== null && "url" in entrada ? (entrada as Request).url : entrada);
    pedidos.push(url);
    if (url.includes("rpc/validar_sessao")) {
      return respostaJson({
        valido: true,
        utilizador: { id: 1, usuario: "filo", nome: "Filomeno", cargo: "DM", nivel: "admin", precisa_trocar: false },
        matriz: []
      });
    }
    const u = new URL(url);
    const tabela = u.pathname.split("/rest/v1/")[1] || "";
    const nome = tabela.split("?")[0];
    if (nome === "equipment") return respostaJson(cenario.equipamentos);
    if (nome === "ordens_servico") return respostaJson(cenario.ordens);
    if (nome === "os_status_log") return respostaJson([]);
    if (nome === "disp_transicoes") return respostaJson(cenario.transicoes);
    if (nome === "disp_mensal") return respostaJson(cenario.mensal);
    if (nome === "disp_horometro") return respostaJson(cenario.horometro);
    if (nome === "disp_config") return respostaJson(cenario.config);
    if (nome === "disp_semanal") return respostaJson(cenario.semanal);
    if (nome === "disp_semana_geral") return respostaJson(cenario.geral);
    if (nome === "disp_semana_avarias") return respostaJson(cenario.avarias);
    if (nome === "disp_dias") {
      // respeita os filtros data=gte.X e data=lt.Y do pedido
      const condicoes = u.searchParams.getAll("data");
      let de = "";
      let ate = "";
      for (const c of condicoes) {
        if (c.startsWith("gte.")) de = c.slice(4);
        if (c.startsWith("lt.")) ate = c.slice(3);
      }
      const linhas = cenario.dias.filter((d) => {
        const data = String(d.data);
        if (de && data < de) return false;
        if (ate && data >= ate) return false;
        return true;
      });
      return respostaJson(linhas);
    }
    return respostaJson([]);
  }) as typeof fetch;
});

async function getJson(caminho: string): Promise<Record<string, unknown>> {
  const mod = await import(caminho);
  const r = await mod.GET(new Request("http://localhost" + caminho));
  return (await r.json()) as Record<string, unknown>;
}

/* ==================== A + B. sintetizarDias ==================== */

describe("A. sintetizarDias nao inventa o futuro", () => {
  it("mes em curso: so dias vividos, obra aberta parada ate hoje", async () => {
    const { sintetizarDias } = await import("../src/lib/ponte-os");
    const dias = sintetizarDias({
      mes: MES_STR,
      hoje: HOJE,
      equipamentos: EQUIPOS,
      chavesExplicitas: new Set(),
      segmentos: [
        { equipment_id: 1, estado: "Avariada", inicio: `${MES_STR}-05`, fim: null, os_id: 11, numero_obra: "70001", origem: "ordem" }
      ]
    });
    const datas = dias.map((d) => d.data);
    expect(datas.some((d) => d > HOJE)).toBe(false);
    expect(datas.length).toBe(2 * DIA);
    const eq1 = dias.filter((d) => d.equipment_id === 1);
    const eq2 = dias.filter((d) => d.equipment_id === 2);
    // máquina 1: disponível 1..4 e parada 5..hoje (obra aberta NÃO estende ao futuro)
    expect(eq1.filter((d) => d.estado === "Disponível").length).toBe(4);
    expect(eq1.filter((d) => d.estado === "Avariada").length).toBe(DIA - 4);
    // máquina 2: só os dias vividos, todos disponíveis (nenhuma obra)
    expect(eq2.length).toBe(DIA);
    expect(eq2.every((d) => d.estado === "Disponível" && d.horas_disponiveis === 24)).toBe(true);
    // máquina inactiva não gera dias
    expect(dias.some((d) => d.equipment_id === 3)).toBe(false);
  });

  it("mes passado: sem 'hoje' fica o mês inteiro (comportamento antigo)", async () => {
    const { sintetizarDias } = await import("../src/lib/ponte-os");
    const mesAnterior = MES === 1 ? `${ANO - 1}-12` : `${ANO}-${String(MES - 1).padStart(2, "0")}`;
    const dias = sintetizarDias({
      mes: mesAnterior,
      equipamentos: [EQUIPOS[0] as { id: number; active: boolean }],
      chavesExplicitas: new Set(),
      segmentos: []
    });
    expect(dias.length).toBe(diasNoMes(MES === 1 ? 12 : MES - 1));
  });
});

/* ==================== C. sintetizarAnoMensal ==================== */

describe("C. sintetizarAnoMensal (Painel do ano em curso)", () => {
  it("meses fechados completos, mes em curso ate hoje, futuro fora", async () => {
    const { sintetizarAnoMensal } = await import("../src/lib/ponte-os");
    const linhas = sintetizarAnoMensal({
      ano: ANO,
      hoje: HOJE,
      equipamentos: EQUIPOS,
      diasExplicitos: DIAS_ANO as { equipment_id: number; data: string; estado: string | null; horas_disponiveis: number | string | null }[],
      segmentos: [
        { equipment_id: 1, estado: "Avariada", inicio: `${MES_STR}-05`, fim: null, os_id: 11, numero_obra: "70001", origem: "ordem" },
        { equipment_id: 2, estado: "Revisão/Manutenção", inicio: `${MES_STR}-01`, fim: `${MES_STR}-07`, os_id: 12, numero_obra: "70002", origem: "ordem" }
      ]
    });
    const de = (eq: number, mes: number) => linhas.find((l) => l.equipment_id === eq && l.mes === mes);

    // mês em curso: 2 activas com DIA dias + inactiva com 1 marcação
    const actual = de(1, MES);
    expect(actual).toBeTruthy();
    expect(actual!.horas_total).toBe(DIA * 24);
    expect(actual!.horas_a).toBe(4 * 24); // dias 1..4 disponíveis, depois obra
    const actual2 = de(2, MES);
    expect(actual2!.horas_total).toBe(DIA * 24);
    expect(actual2!.horas_pm).toBe(7 * 24); // obra dias 1..7 parada
    const inactiva = de(3, MES);
    expect(inactiva!.horas_total).toBe(24); // a marcação explícita da inactiva conta

    // mês anterior: completo, tudo disponível
    if (MES >= 2) {
      const anterior = de(1, MES - 1);
      expect(anterior!.horas_total).toBe(diasNoMes(MES - 1) * 24);
      expect(anterior!.horas_a).toBe(diasNoMes(MES - 1) * 24);
    }

    // mês futuro: não existe
    if (MES < 12) expect(de(1, MES + 1)).toBeUndefined();

    // a marcação futura não entrou (nenhuma linha com ela contada)
    const comFuturo = de(1, MES)!;
    expect(comFuturo.horas_total).toBe(DIA * 24);
  });
});

/* ==================== D. calcularMovimentoDeOrdens ==================== */

describe("D. calcularMovimentoDeOrdens (Resumo Semanal)", () => {
  it("chaves iguais às linhas gravadas e contagens certas", async () => {
    const { calcularMovimentoDeOrdens } = await import("../src/lib/ponte-os");
    const r = calcularMovimentoDeOrdens(
      [
        { equipment_id: 1, data_abertura: "2026-10-05", data_fecho: null, status_fisico: "Aguarda Acessório" },
        { equipment_id: 1, data_abertura: "2026-10-13", data_fecho: null, status_fisico: null },
        { equipment_id: 2, data_abertura: "2026-09-20", data_fecho: "2026-10-14", status_fisico: null },
        { equipment_id: 2, data_abertura: "2026-10-11", data_fecho: "2026-10-12", status_fisico: null }
      ],
      (id) => (id === 1 ? "Reach-Stacker 45T" : "Tratores 70T"),
      ["Reach-Stacker 45T", "Tratores 70T"],
      "2026-10-12",
      "2026-10-19"
    );
    expect(r["Reach-Stacker 45T"]).toEqual({ pend_inicio: 1, entradas: 1, saidas: 0, aguardam_pecas: 1 });
    // C e D estavam ambas na oficina no início da semana (pend 2) e saíram nela
    expect(r["Tratores 70T"]).toEqual({ pend_inicio: 2, entradas: 0, saidas: 2, aguardam_pecas: 0 });
  });
});

/* ==================== E. GET dias (Grelha) ==================== */

describe("E. GET /api/disponibilidade/dias", () => {
  it("mes em curso: sintese so ate hoje e resumo so ate hoje", async () => {
    const j = await getJson(`../src/app/api/disponibilidade/dias/route?mes=${MES_STR}&frota=todos`);
    expect(j.ok).toBe(true);
    const dias = j.dias as { id?: number; equipment_id: number; data: string; estado: string | null; horas_disponiveis: number | string | null }[];
    // dias SINTETIZADOS (id negativo) nunca passam de hoje; a marcação
    // explícita do futuro vem para a grelha mas não entra nas percentagens
    const sintetizados = dias.filter((d) => typeof d.id === "number" && d.id < 0);
    expect(sintetizados.length).toBeGreaterThan(0);
    expect(sintetizados.some((d) => d.data > HOJE)).toBe(false);
    // 2 activas x DIA dias sintetizados + 2 marcações explícitas (inactiva + futura)
    expect(dias.length).toBe(2 * DIA + 2);
    const resumo = j.resumoMes as { horasDisponiveis: number; diasMarcados: number };
    if (DIA >= 8) {
      // eq1: 4x24 (dias 1..4) + eq2: (DIA-7)x24 (dias 8..hoje) + inactiva: 0
      expect(resumo.horasDisponiveis).toBe(4 * 24 + (DIA - 7) * 24);
    }
    expect(resumo.diasMarcados).toBe(2);
  });

  it("mes passado: síntese completa como sempre", async () => {
    const mesAnterior = MES === 1 ? `${ANO - 1}-12` : `${ANO}-${String(MES - 1).padStart(2, "0")}`;
    const j = await getJson(`../src/app/api/disponibilidade/dias/route?mes=${mesAnterior}&frota=todos`);
    expect(j.ok).toBe(true);
    const dias = j.dias as { data: string }[];
    expect(dias.length).toBe(2 * diasNoMes(MES === 1 ? 12 : MES - 1));
  });
});

/* ==================== F. GET painel ==================== */

describe("F. GET /api/disponibilidade/painel", () => {
  it("ano em curso: meses vividos com dados, futuros a zero, 2025 na comparação", async () => {
    const j = await getJson(`../src/app/api/disponibilidade/painel/route?ano=${ANO}&mes=0&frota=todos`);
    expect(j.ok).toBe(true);
    const resumo = j.resumoMensal as { mes: number; horasA: number; total: number; pct: number; maquinas: number; estados: Record<string, number> }[];
    const actual = resumo[MES - 1];
    expect(actual.total).toBe(DIA * 48 + 24);
    expect(actual.maquinas).toBe(3);
    if (DIA >= 8) expect(actual.estados["Avariada"]).toBe((DIA - 4) * 24 + 24); // obra + o dia marcado da inactiva
    if (MES >= 2) {
      const anterior = resumo[MES - 2];
      expect(anterior.total).toBe(diasNoMes(MES - 1) * 48);
      expect(anterior.pct).toBe(100);
    }
    if (MES < 12) {
      expect(resumo[MES].total).toBe(0);
      expect(resumo[MES].maquinas).toBe(0);
    }
    const anos = j.comparacaoAnos as { ano: number; pct: number; total: number }[];
    expect(anos.some((a) => a.ano === ANO && a.total > 0)).toBe(true);
    expect(anos.some((a) => a.ano === 2025 && a.total > 0)).toBe(true);
    const frotas = j.porFrota as { frota: string; maquinas: number; pctAno: number }[];
    const rst = frotas.find((f) => f.frota === "Reach-Stacker 45T");
    expect(rst?.maquinas).toBe(1);
    expect((rst?.pctAno || 0) > 0).toBe(true);
    expect((rst?.pctAno || 0) < 100).toBe(true);
  });

  it("mes do ano em curso: denominador so com dias vividos", async () => {
    const j = await getJson(`../src/app/api/disponibilidade/painel/route?ano=${ANO}&mes=${MES}&frota=todos`);
    expect(j.ok).toBe(true);
    expect(j.disponibilidade).toBeGreaterThan(0);
    expect(j.disponibilidade).toBeLessThanOrEqual(100);
  });

  it("ano fechado (2025): usa o disp_mensal e NAO toca nas ordens", async () => {
    pedidos.length = 0;
    const j = await getJson("../src/app/api/disponibilidade/painel/route?ano=2025&mes=0&frota=todos");
    expect(j.ok).toBe(true);
    const resumo = j.resumoMensal as { mes: number; total: number; maquinas: number }[];
    expect(resumo[0].maquinas).toBe(2);
    expect(resumo[0].total).toBe(1440); // 2 máquinas x 720h oficiais do excel
    expect(pedidos.some((p) => p.includes("ordens_servico"))).toBe(false);
  });
});

/* ==================== G. GET semana (osCalculado) ==================== */

describe("G. GET /api/disponibilidade/semana", () => {
  it("osCalculado vem com as chaves do quadro (pend_inicio, entradas...)", async () => {
    cenario = {
      ...cenario,
      ordens: [
        { id: 21, equipment_id: 1, data_abertura: "2026-10-05", data_fecho: null, status_atual: "Aberta", status_fisico: "Aguarda Acessório", atualizado_em: null },
        { id: 22, equipment_id: 1, data_abertura: "2026-10-13", data_fecho: null, status_atual: "Aberta", status_fisico: null, atualizado_em: null },
        { id: 23, equipment_id: 2, data_abertura: "2026-09-20", data_fecho: "2026-10-14", status_atual: "Fechada", status_fisico: null, atualizado_em: null },
        { id: 24, equipment_id: 2, data_abertura: "2026-10-11", data_fecho: "2026-10-12", status_atual: "Fechada", status_fisico: null, atualizado_em: null }
      ],
      dias: []
    };
    const j = await getJson("../src/app/api/disponibilidade/semana/route?ano=2026&semana=42");
    expect(j.ok).toBe(true);
    const calc = j.osCalculado as Record<string, { pend_inicio: number; entradas: number; saidas: number; aguardam_pecas: number }>;
    expect(calc["Reach-Stacker 45T"]).toEqual({ pend_inicio: 1, entradas: 1, saidas: 0, aguardam_pecas: 1 });
    expect(calc["Tratores 70T"]).toEqual({ pend_inicio: 2, entradas: 0, saidas: 2, aguardam_pecas: 0 });
    expect(calc["Escavadoras"]).toEqual({ pend_inicio: 0, entradas: 0, saidas: 0, aguardam_pecas: 0 });
    cenario = { ...cenario, ordens: ORDENS_MES, dias: DIAS_ANO };
  });
});
