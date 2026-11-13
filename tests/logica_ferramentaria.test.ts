/**
 * Provas de LÓGICA da Ferramentaria (migração do hub).
 *
 * Cobre: os juízes de tempo (atraso, dias fora), o estado após
 * devolução (bom/avariado/inutilizado), o juiz ÚNICO de dano (sujo/
 * desgastado não criam dano; torto/partido/avariado/perdido criam -
 * os dois juízes contraditórios do hub), disponibilidade por
 * quantidade, validações partilhadas ecrã/API (empréstimo, devolução,
 * ferramenta, nomes simples), duplicados sem acentos, statsPainel
 * (KPIs + tops + fuso Maputo), statsRelatorio (taxas, Na Rua COMPLETA,
 * inventário) e o CSV com BOM.
 */

import { describe, expect, test } from "bun:test";
import {
  activosDa,
  amanhaISO,
  corEstadoFerramenta,
  corEstadoVoltar,
  corSeveridade,
  corStatusDano,
  csvMovimentos,
  devolucoesComProblema,
  diasFora,
  disponibilidadeDe,
  estaAtrasada,
  estadoAposDevolucao,
  ESTADOS_FERRAMENTA,
  ESTADOS_VOLTAR,
  fmtDias,
  fmtMTn,
  geraDano,
  nomeDuplicado,
  problemaDevolucao,
  problemaEmprestimo,
  problemaFerramenta,
  problemaNomeSimples,
  proximoStatusDano,
  statsPainel,
  statsRelatorio,
  type DanoVisao,
  type Ferramenta,
  type Movimento,
  type MovimentoVisao
} from "@/lib/ferramentaria";

/* ============ fábricas ============ */

function ferramenta(overrides: Partial<Ferramenta> = {}): Ferramenta {
  return {
    id: "t1",
    code: "CBL-10",
    nome: "Chave Boca Luneta",
    category_id: "cat1",
    marca: null,
    estado: "bom",
    localizacao: null,
    quantidade: 1,
    unidade: "unidade",
    valor_unitario: 0,
    active: true,
    ...overrides
  };
}

function movimento(overrides: Partial<Movimento> = {}): Movimento {
  return {
    id: "m1",
    tool_id: "t1",
    tipo: "emprestimo",
    colaborador: "Didi Rogério",
    departamento: "Mecânica",
    os_id: null,
    equipamento_id: null,
    estado_ao_sair: "bom",
    estado_ao_voltar: null,
    entregue_por: "João Paulo",
    recebido_por: null,
    data_saida: "2026-08-14T06:51:12",
    data_devolucao: null,
    prazo_devolucao: "2026-08-14",
    observacoes_saida: null,
    observacoes_devolucao: null,
    ...overrides
  };
}

function visao(m: Movimento, code: string | null = "CBL-10", nome: string | null = "Chave Boca Luneta"): MovimentoVisao {
  return { ...m, code, nome };
}

function dano(overrides: Partial<DanoVisao> = {}): DanoVisao {
  return {
    id: "d1",
    tool_id: "t1",
    movement_id: "m1",
    tipo_dano: null,
    estado_reportado: "avariado",
    severidade: "moderado",
    custo_reparacao: 500,
    status: "reportado",
    colaborador: "Didi Rogério",
    responsavel: null,
    observacoes: null,
    resolved_at: null,
    created_at: "2026-08-15T10:00:00",
    code: "CBL-10",
    nome: "Chave Boca Luneta",
    ...overrides
  };
}

/* ============ juízes de tempo ============ */

describe("tempo", () => {
  test("estaAtrasada: prazo passado é atraso, prazo de hoje não é", () => {
    expect(estaAtrasada("2026-08-13", "2026-08-14")).toBe(true);
    expect(estaAtrasada("2026-08-14", "2026-08-14")).toBe(false);
    expect(estaAtrasada(null, "2026-08-14")).toBe(false);
  });

  test("diasFora: conta dias inteiros desde a saída", () => {
    expect(diasFora("2026-08-12T10:00:00", "2026-08-14")).toBe(2);
    expect(diasFora("2026-08-14T06:00:00", "2026-08-14")).toBe(0);
    expect(diasFora(null, "2026-08-14")).toBeNull();
  });

  test("fmtDias: Hoje, 1 dia, n dias (mesmo discurso do hub)", () => {
    expect(fmtDias(0)).toBe("Hoje");
    expect(fmtDias(1)).toBe("1 dia");
    expect(fmtDias(7)).toBe("7 dias");
    expect(fmtDias(null)).toBe("-");
  });

  test("amanhaISO: prazo nascido amanhã", () => {
    const amanha = amanhaISO();
    const hoje = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(amanha).toBe(hoje);
  });
});

/* ============ juiz único de estado ============ */

describe("estadoAposDevolucao", () => {
  test("regra do negócio: torto/partido/avariado voltam avariado", () => {
    expect(estadoAposDevolucao("torto")).toBe("avariado");
    expect(estadoAposDevolucao("partido")).toBe("avariado");
    expect(estadoAposDevolucao("avariado")).toBe("avariado");
  });
  test("perdido mata a ferramenta", () => {
    expect(estadoAposDevolucao("perdido")).toBe("inutilizado");
  });
  test("bom/sujo/desgastado voltam bom", () => {
    expect(estadoAposDevolucao("bom")).toBe("bom");
    expect(estadoAposDevolucao("sujo")).toBe("bom");
    expect(estadoAposDevolucao("desgastado")).toBe("bom");
  });
});

describe("juiz unico de dano (os 2 juizes contraditórios do hub morrem aqui)", () => {
  test("desastres criam dano", () => {
    for (const e of ["torto", "partido", "avariado", "perdido"]) {
      expect(geraDano(e)).toBe(true);
    }
  });
  test("conservação NUNCA cria dano (no dashboard do hub sujo era 'problema' mas não criava dano; agora a verdade é uma só)", () => {
    expect(geraDano("sujo")).toBe(false);
    expect(geraDano("desgastado")).toBe(false);
    expect(geraDano("bom")).toBe(false);
  });
  test("devolucoesComProblema mostra desgaste E desastre (o painel do hub também mostrava conservação)", () => {
    const movs = [
      visao(movimento({ id: "a", tipo: "devolucao", estado_ao_voltar: "sujo", data_devolucao: "2026-08-10T09:00:00" })),
      visao(movimento({ id: "b", tipo: "devolucao", estado_ao_voltar: "avariado", data_devolucao: "2026-08-11T09:00:00" })),
      visao(movimento({ id: "c", tipo: "devolucao", estado_ao_voltar: "bom", data_devolucao: "2026-08-12T09:00:00" })),
      visao(movimento({ id: "d", tipo: "emprestimo", estado_ao_voltar: "sujo" }))
    ];
    const lista = devolucoesComProblema(movs, 10);
    expect(lista.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("proximoStatusDano", () => {
  test("fila oficial: reportado -> em reparo -> reparado -> fecha", () => {
    expect(proximoStatusDano("reportado")).toBe("em reparo");
    expect(proximoStatusDano("em reparo")).toBe("reparado");
    expect(proximoStatusDano("reparado")).toBeNull();
    expect(proximoStatusDano("inutilizado")).toBeNull();
  });
});

/* ============ disponibilidade ============ */

describe("disponibilidade", () => {
  test("quantidade 1: uma na rua esgota", () => {
    const t = ferramenta({ quantidade: 1 });
    const movs = [movimento()];
    const disp = disponibilidadeDe(t, movs);
    expect(disp.total).toBe(1);
    expect(disp.emprestadas).toBe(1);
    expect(disp.disponivel).toBe(0);
    expect(disp.activos).toHaveLength(1);
  });

  test("quantidade 5 com 3 na rua sobra 2 (o hub só marcava 'emprestado' quando esgotava)", () => {
    const t = ferramenta({ id: "t5", quantidade: 5 });
    const movs = [
      movimento({ id: "a", tool_id: "t5" }),
      movimento({ id: "b", tool_id: "t5" }),
      movimento({ id: "c", tool_id: "t5" })
    ];
    const disp = disponibilidadeDe(t, movs);
    expect(disp.emprestadas).toBe(3);
    expect(disp.disponivel).toBe(2);
  });

  test("devoluções não contam como activos", () => {
    const t = ferramenta();
    const movs = [
      movimento(),
      movimento({ id: "v1", tipo: "devolucao", data_devolucao: "2026-08-15T09:00:00" })
    ];
    expect(disponibilidadeDe(t, movs).emprestadas).toBe(1);
  });

  test("activosDa só aceita emprestimo sem data de devolução", () => {
    const movs = [
      movimento({ id: "a" }),
      movimento({ id: "b", data_devolucao: "2026-08-15" }),
      movimento({ id: "c", tipo: "devolucao" })
    ];
    expect(activosDa(movs, "t1")).toHaveLength(1);
  });
});

/* ============ validações partilhadas ============ */

describe("problemaEmprestimo", () => {
  const bom = {
    ferramentaCode: "CBL-10",
    colaborador: "Didi Rogério",
    departamento: "Mecânica",
    prazo: "2026-08-15",
    entreguePorId: "s1"
  };
  test("passa com tudo preenchido", () => {
    expect(problemaEmprestimo(bom)).toBeNull();
  });
  test("recusa sem ferramenta, colaborador, departamento, entregue ou prazo", () => {
    expect(problemaEmprestimo({ ...bom, ferramentaCode: " " })).toMatch(/ferramenta/i);
    expect(problemaEmprestimo({ ...bom, colaborador: "" })).toMatch(/quem leva/i);
    expect(problemaEmprestimo({ ...bom, departamento: "" })).toMatch(/departamento/i);
    expect(problemaEmprestimo({ ...bom, entreguePorId: "" })).toMatch(/ferramenteiro/i);
    expect(problemaEmprestimo({ ...bom, prazo: "" })).toMatch(/prazo/i);
  });
  test("recusa prazo com data inválida", () => {
    expect(problemaEmprestimo({ ...bom, prazo: "15/08/2026" })).toMatch(/inválida/i);
  });
});

describe("problemaDevolucao", () => {
  test("passa com estado oficial e recebido", () => {
    expect(problemaDevolucao({ estadoVoltar: "bom", recebidoPorId: "s1" })).toBeNull();
  });
  test("recusa estado fora da lista oficial", () => {
    expect(problemaDevolucao({ estadoVoltar: "mofo", recebidoPorId: "s1" })).toMatch(/desconhecido/i);
    expect(problemaDevolucao({ estadoVoltar: "", recebidoPorId: "s1" })).toMatch(/estado/i);
  });
  test("recusa sem quem recebe", () => {
    expect(problemaDevolucao({ estadoVoltar: "bom", recebidoPorId: "" })).toMatch(/recebe/i);
  });
});

describe("problemaFerramenta", () => {
  const bom = { code: "CBL-20", nome: "Chave inglesa", category_id: "cat1" };
  test("passa com o essencial", () => {
    expect(problemaFerramenta(bom)).toBeNull();
  });
  test("recusa código/nome/categoria em falta", () => {
    expect(problemaFerramenta({ ...bom, code: " " })).toMatch(/código/i);
    expect(problemaFerramenta({ ...bom, nome: "" })).toMatch(/nome/i);
    expect(problemaFerramenta({ ...bom, category_id: "" })).toMatch(/categoria/i);
  });
  test("quantidade tem de ser inteiro >= 1", () => {
    expect(problemaFerramenta({ ...bom, quantidade: 0 })).toMatch(/Quantidade/i);
    expect(problemaFerramenta({ ...bom, quantidade: 1.5 })).toMatch(/Quantidade/i);
    expect(problemaFerramenta({ ...bom, quantidade: 4 })).toBeNull();
  });
  test("valor negativo recusado; estado desconhecido recusado", () => {
    expect(problemaFerramenta({ ...bom, valor_unitario: -5 })).toMatch(/Valor/i);
    expect(problemaFerramenta({ ...bom, estado: "mofo" })).toMatch(/Estado/i);
  });
});

describe("nomes e duplicados", () => {
  test("problemaNomeSimples", () => {
    expect(problemaNomeSimples("Mecânica")).toBeNull();
    expect(problemaNomeSimples("")).toMatch(/nome/i);
    expect(problemaNomeSimples("a".repeat(121))).toMatch(/longo/i);
  });
  test("nomeDuplicado sem acentos e sem maiúsculas (o hub só via duplicado exacto)", () => {
    expect(nomeDuplicado("Eletrica", ["Elétrica"])).toBe(true);
    expect(nomeDuplicado("PNEUMATICA", ["Pneumática"])).toBe(true);
    expect(nomeDuplicado("Pneumatica", ["Eletrica"])).toBe(false);
  });
  test("nomeDuplicado com exceto (edição não briga consigo própria)", () => {
    expect(nomeDuplicado("Pneumática", ["Pneumatica"], "Pneumatica")).toBe(false);
  });
});

/* ============ painel ============ */

describe("statsPainel", () => {
  const hoje = "2026-08-31";
  const ferramentas = [
    ferramenta({ id: "t1", estado: "emprestado" }),
    ferramenta({ id: "t2", estado: "avariado" }),
    ferramenta({ id: "t3", estado: "bom" }),
    ferramenta({ id: "t4", estado: "inutilizado" }),
    ferramenta({ id: "t5", estado: "novo", active: false })
  ];
  const movs = [
    visao(
      movimento({
        id: "fora1",
        prazo_devolucao: "2026-08-20"
      })
    ),
    visao(
      movimento({
        id: "fora2",
        tool_id: "t3",
        code: "KEY-1",
        nome: "Martelo",
        prazo_devolucao: "2026-09-02"
      })
    ),
    visao(
      movimento({
        id: "dev1",
        tipo: "devolucao",
        data_devolucao: "2026-08-05T09:00:00",
        estado_ao_voltar: "bom"
      })
    )
  ];
  const danos = [
    dano({ created_at: "2026-08-15T10:00:00", custo_reparacao: 750 }),
    dano({ id: "d2", tool_id: "t2", created_at: "2026-07-01T10:00:00", custo_reparacao: 1000 })
  ];

  test("fora conta só emprestimos sem devolução", () => {
    const s = statsPainel(ferramentas, movs, danos, hoje);
    expect(s.fora).toHaveLength(2);
    expect(s.fora.map((m) => m.id).sort()).toEqual(["fora1", "fora2"]);
  });

  test("atrasadas: só a do prazo 08-20", () => {
    const s = statsPainel(ferramentas, movs, danos, hoje);
    expect(s.atrasadas).toBe(1);
  });

  test("avariadas: 1 (inutilizado não conta; inactivo não conta)", () => {
    const s = statsPainel(ferramentas, movs, danos, hoje);
    expect(s.avariadas).toBe(1);
  });

  test("danos do mês com custo (Maputo, pelo created_at YYYY-MM)", () => {
    const s = statsPainel(ferramentas, movs, danos, hoje);
    expect(s.danosMes).toBe(1);
    expect(s.custoDanosMes).toBe(750);
  });

  test("disponiveis: bom + novo, sem emprestado/avariado/inutilizado/inactivo", () => {
    const s = statsPainel(ferramentas, movs, danos, hoje);
    expect(s.disponiveis).toBe(1);
    expect(s.totalFerramentas).toBe(4);
  });

  test("topEmprestadas: etiqueta com código e nome, do mais emprestado", () => {
    const movs2 = [
      visao(movimento({ id: "1", tool_id: "t1" }), "CBL-10", "Chave"),
      visao(movimento({ id: "2", tool_id: "t1" }), "CBL-10", "Chave"),
      visao(movimento({ id: "3", tool_id: "t3" }), "KEY-1", "Martelo")
    ];
    const s = statsPainel(ferramentas, movs2, danos, hoje);
    expect(s.topEmprestadas[0]).toEqual({ label: "CBL-10 Chave", count: 2 });
    expect(s.topEmprestadas[1].count).toBe(1);
  });

  test("topDanos por colaborador", () => {
    const danos2 = [
      dano({ colaborador: "A" }),
      dano({ id: "x2", colaborador: "A" }),
      dano({ id: "x3", colaborador: "B" })
    ];
    const s = statsPainel(ferramentas, movs, danos2, hoje);
    expect(s.topDanos[0]).toEqual({ label: "A", count: 2 });
  });

  test("devoluções com problema no painel já não duplica (fonte única tipo=devolucao)", () => {
    const movs3 = [
      visao(movimento({ id: "orig", tipo: "emprestimo", data_devolucao: "2026-08-10", estado_ao_voltar: "sujo" })),
      visao(movimento({ id: "dev", tipo: "devolucao", data_devolucao: "2026-08-10T10:00:00", estado_ao_voltar: "sujo" }))
    ];
    const s = statsPainel(ferramentas, movs3, danos, hoje);
    expect(s.fora).toHaveLength(0);
    expect(devolucoesComProblema(movs3)).toHaveLength(1);
  });
});

/* ============ relatório ============ */

describe("statsRelatorio", () => {
  const ferramentas = [
    ferramenta({ id: "t1", estado: "emprestado" }),
    ferramenta({ id: "t2", estado: "avariado" }),
    ferramenta({ id: "t3", estado: "bom" })
  ];
  const movs = [
    visao(
      movimento({
        id: "p1",
        data_saida: "2026-08-02T08:00:00",
        data_devolucao: "2026-08-04T08:00:00",
        prazo_devolucao: "2026-08-05"
      })
    ),
    visao(
      movimento({
        id: "p2",
        tool_id: "t3",
        data_saida: "2026-08-10T08:00:00",
        data_devolucao: "2026-08-12T08:00:00",
        prazo_devolucao: "2026-08-11"
      })
    ),
    visao(
      movimento({
        id: "p3",
        data_saida: "2026-07-20T08:00:00",
        prazo_devolucao: "2026-07-25"
      })
    ),
    visao(
      movimento({
        id: "fora",
        tool_id: "t3",
        data_saida: "2026-08-20T08:00:00"
      })
    ),
    visao(
      movimento({
        id: "fora_antiga",
        tool_id: "t1",
        data_saida: "2026-05-01T08:00:00"
      })
    )
  ];
  const danos = [
    dano({ created_at: "2026-08-15T10:00:00", severidade: "grave", custo_reparacao: 300, estado_reportado: "partido" }),
    dano({ id: "d2", created_at: "2026-08-20T10:00:00", severidade: "leve", custo_reparacao: 50, estado_reportado: "torto" }),
    dano({ id: "d3", created_at: "2026-09-02T10:00:00" })
  ];

  test("movimentação geral dentro do período", () => {
    const s = statsRelatorio(movs, ferramentas, danos, "2026-08-01", "2026-08-31");
    expect(s.totalEmprestimos).toBe(3);
    expect(s.totalDevolucoes).toBe(2);
    expect(s.taxaNoPrazo).toBe(50);
    expect(s.taxaAtraso).toBe(50);
  });

  test("Na Rua COMPLETA: inclui a emprestada de Maio fora do período (correcção do corte do hub)", () => {
    const s = statsRelatorio(movs, ferramentas, danos, "2026-08-01", "2026-08-31");
    // p3 (saída a 20-07, sem devolução) também está na rua: é isso que a
    // coluna "Tempo fora" promete, mesmo fora do período escolhido.
    expect(s.naRua.map((m) => m.id).sort()).toEqual(["fora", "fora_antiga", "p3"]);
    expect(s.naRua[0].id).toBe("fora_antiga"); // mais antiga primeiro
  });

  test("danos do período com severidades e custo", () => {
    const s = statsRelatorio(movs, ferramentas, danos, "2026-08-01", "2026-08-31");
    expect(s.danos.total).toBe(2);
    expect(s.danos.custoTotal).toBe(350);
    expect(s.danos.leves).toBe(1);
    expect(s.danos.graves).toBe(1);
    expect(s.danos.porTipo[0]).toEqual({ tipo: "partido", count: 1 });
  });

  test("topColaboradores soma e conta atrasos", () => {
    const s = statsRelatorio(movs, ferramentas, danos, "2026-08-01", "2026-08-31");
    const didi = s.topColaboradores.find((c) => c.colaborador === "Didi Rogério");
    expect(didi).toBeTruthy();
    expect(didi!.total).toBe(3); // p1, p2 e o 'fora' (ainda na rua)
    expect(didi!.atrasadas).toBe(1); // só o p2 voltou depois do prazo
  });

  test("inventário agrupa por estados oficiais", () => {
    const s = statsRelatorio(movs, ferramentas, danos, "2026-08-01", "2026-08-31");
    const mapa = Object.fromEntries(s.inventario.map((i) => [i.estado, i.count]));
    expect(mapa["emprestado"]).toBe(1);
    expect(mapa["avariado"]).toBe(1);
    expect(mapa["bom"]).toBe(1);
  });
});

/* ============ etiquetas e formatos ============ */

describe("etiquetas", () => {
  test("cores por estado", () => {
    expect(corEstadoFerramenta("bom")).toMatch(/emerald/);
    expect(corEstadoFerramenta("avariado")).toMatch(/red/);
    expect(corEstadoFerramenta("emprestado")).toMatch(/sky/);
    expect(corEstadoFerramenta(null)).toMatch(/muted/);
    expect(corEstadoVoltar("sujo")).toMatch(/amber/);
    expect(corEstadoVoltar("perdido")).toMatch(/red/);
    expect(corSeveridade("grave")).toMatch(/red/);
    expect(corStatusDano("reparado")).toMatch(/emerald/);
  });

  test("fmtMTn agrupa milhares à portuguesa", () => {
    expect(fmtMTn(6451)).toBe("6 451,00 MTn");
    expect(fmtMTn(0)).toBe("0,00 MTn");
    expect(fmtMTn(1234567.5)).toBe("1 234 567,50 MTn");
  });
});

/* ============ listas oficiais ============ */

describe("listas oficiais", () => {
  test("ESTADOS_FERRAMENTA cobre o vocabulário da base real", () => {
    // amostra real da base: novo, bom, emprestado, avariado
    for (const e of ["novo", "bom", "emprestado", "avariado", "inutilizado", "desgastado"]) {
      expect(ESTADOS_FERRAMENTA).toContain(e);
    }
  });
  test("ESTADOS_VOLTAR cobre o dropdown do hub", () => {
    for (const e of ["bom", "sujo", "desgastado", "torto", "partido", "avariado", "perdido"]) {
      expect(ESTADOS_VOLTAR).toContain(e);
    }
  });
});

/* ============ CSV ============ */

describe("csvMovimentos", () => {
  test("cabeçalho, BOM e separador ;", () => {
    const csv = csvMovimentos([
      visao(
        movimento({
          os_id: "70104",
          equipamento_id: "70-01 - Sino Truck",
          observacoes_saida: "Trabalho na OS 70104"
        })
      )
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const linhas = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(linhas[0]).toContain("Tipo;Codigo;Ferramenta;Colaborador");
    expect(linhas[1]).toContain("emprestimo;CBL-10;Chave Boca Luneta;Didi Rogério;Mecânica");
    expect(linhas[1]).toContain("70104");
    expect(linhas[1]).toContain("70-01 - Sino Truck");
    expect(linhas[1]).toContain("2026-08-14");
    expect(linhas[1]).toContain("Trabalho na OS 70104");
  });

  test("escapa ; e aspas nas observações", () => {
    const csv = csvMovimentos([
      visao(movimento({ observacoes_devolucao: 'Ferramenta "mole"; revisar' }))
    ]);
    expect(csv).toContain('"Ferramenta ""mole""; revisar"');
  });
});
