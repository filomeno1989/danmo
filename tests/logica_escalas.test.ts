/**
 * Provas de LÓGICA do módulo Escalas.
 *
 * Cobre: datas sem fuso (mês, dia da semana a la Excel, semana Sáb a
 * Sex e sábados do mês), o ciclo de turnos A-D (padrão 07/19 07/19
 * 19/07 19/07 + 4 folgas, desfasamentos 0/2/4/6 e a âncora do Grupo A),
 * a proposta do ciclo (só escreve em célula vazia ou regenerável,
 * salta quem tem LD no mês com aviso de auditoria, nunca toca em
 * Norm./Sup./Esc./FRD/CCIS/TDP), a cobertura do substituto, contagens
 * por área e do dia, folgas guardadas (saldo com meios dias e
 * validações), validações do registo, a auditoria de LD+turno, os
 * códigos e áreas deduzidos da categoria e a leitura de códigos do
 * Excel (variantes).
 */

import { describe, expect, test } from "bun:test";
import {
  areaDeCategoria,
  avisoAuditoria,
  chefeDaCategoria,
  cicloDeGrupo,
  CODIGOS_ESCALA,
  contagensDe,
  diaSemanaCurto,
  eCodigoValido,
  eFaltaSQL,
  grupoDeCategoria,
  labelSemana,
  mesDatas,
  nomesPorCodigo,
  numeroSemanaExcel,
  problemaColab,
  problemaFolga,
  propostaCiclo,
  propostaCobertura,
  sabadosDoMes,
  saldoFolgas,
  semanaContendo,
  totalTrabalho,
  type EscColab
} from "@/lib/escalas";
import { chaveNome, normalizaCodigo } from "@/lib/escalas-import";

/* ============ fábrica ============ */

let seq = 0;
function colab(overrides: Partial<EscColab> = {}): EscColab {
  seq += 1;
  return {
    id: `c${seq}`,
    colaborador_id: null,
    codigo: "DM0001",
    nome: `Pessoa ${seq}`,
    contacto: "840000000",
    categoria: "Mecanico",
    area: "Mecânica",
    grupo: null,
    ordem: seq,
    ativo: true,
    ...overrides
  };
}

/* ============ datas ============ */

describe("Datas da escala", () => {
  test("mesDatas: Janeiro 2026 tem 31 dias, Fevereiro 2026 tem 28", () => {
    expect(mesDatas(2026, 1).length).toBe(31);
    expect(mesDatas(2026, 1)[0]).toBe("2026-01-01");
    expect(mesDatas(2026, 1)[30]).toBe("2026-01-31");
    expect(mesDatas(2026, 2).length).toBe(28);
  });

  test("diaSemanaCurto e numeroSemanaExcel (1 Jan 2026 = quinta)", () => {
    expect(diaSemanaCurto("2026-01-01")).toBe("Qui");
    expect(numeroSemanaExcel("2026-01-01")).toBe(5);
    expect(diaSemanaCurto("2026-01-04")).toBe("Dom");
    expect(numeroSemanaExcel("2026-01-04")).toBe(1);
    expect(numeroSemanaExcel("2026-01-03")).toBe(7);
  });

  test("semanaContendo: Domingo 01/11/2026 pertence à semana de Sábado 31/10", () => {
    const sem = semanaContendo("2026-11-01");
    expect(sem[0]).toBe("2026-10-31");
    expect(sem[6]).toBe("2026-11-06");
    expect(sem.length).toBe(7);
    expect(diaSemanaCurto(sem[0])).toBe("Sáb");
    expect(diaSemanaCurto(sem[6])).toBe("Sex");
  });

  test("semanaContendo num sábado devolve o próprio dia como início", () => {
    const sem = semanaContendo("2026-11-07");
    expect(sem[0]).toBe("2026-11-07");
  });

  test("sabadosDoMes(2026, 11): 31/10, 7, 14, 21, 28", () => {
    expect(sabadosDoMes(2026, 11)).toEqual([
      "2026-10-31",
      "2026-11-07",
      "2026-11-14",
      "2026-11-21",
      "2026-11-28"
    ]);
  });

  test("labelSemana fala de Sábado a Sexta", () => {
    expect(labelSemana("2026-11-07")).toBe("Sáb 07/11 a Sex 13/11");
  });
});

/* ============ ciclo de turnos ============ */

describe("Ciclo de turnos A-D", () => {
  test("padrão do grupo A: manhã, manhã, noite, noite, 4 folgas", () => {
    const ciclo = cicloDeGrupo("A", "2026-01-01", mesDatas(2026, 1).slice(0, 8));
    expect(ciclo.map((c) => c.codigo)).toEqual([
      "07/19", "07/19", "19/07", "19/07", "Folga", "Folga", "Folga", "Folga"
    ]);
  });

  test("grupo B folga enquanto A trabalha e começa a manhã 2 dias depois", () => {
    const ciclo = cicloDeGrupo("B", "2026-01-01", mesDatas(2026, 1).slice(0, 4));
    expect(ciclo.map((c) => c.codigo)).toEqual(["Folga", "Folga", "07/19", "07/19"]);
  });

  test("grupo D com âncora de A em 30/12/2025 (padrão do Excel de Janeiro)", () => {
    const ciclo = cicloDeGrupo("D", "2025-12-30", mesDatas(2026, 1).slice(4, 8));
    expect(ciclo.map((c) => c.codigo)).toEqual(["07/19", "07/19", "19/07", "19/07"]);
  });

  test("âncora no ano anterior: fases negativas fecham (A segue nas noites de Janeiro)", () => {
    const ciclo = cicloDeGrupo("A", "2025-12-30", mesDatas(2026, 1).slice(0, 2));
    expect(ciclo.map((c) => c.codigo)).toEqual(["19/07", "19/07"]);
  });
});

describe("Proposta do ciclo", () => {
  test("preenche células vazias dos membros e conta avisos", () => {
    const a = colab({ area: "Grupos de Turno", grupo: "A" });
    const datas = mesDatas(2026, 1).slice(0, 8);
    const p = propostaCiclo("2026-01-01", { A: [a.id] }, {}, datas);
    const linha = p.celulas[a.id] || {};
    expect(linha["2026-01-01"]).toBe("07/19");
    expect(linha["2026-01-03"]).toBe("19/07");
    expect(linha["2026-01-05"]).toBe("Folga");
    expect(p.avisos.length).toBe(0);
  });

  test("quem tem LD no mês fica FORA do turno com aviso de auditoria", () => {
    const a = colab({ area: "Grupos de Turno", grupo: "A" });
    const datas = mesDatas(2026, 1).slice(0, 8);
    const p = propostaCiclo(
      "2026-01-01",
      { A: [a.id] },
      { [a.id]: { "2026-01-01": "LD" } },
      datas
    );
    expect(p.celulas[a.id]).toBeUndefined();
    expect(p.avisos.length).toBe(1);
    expect(p.avisos[0]).toContain("Auditoria");
  });

  test("NUNCA sobrescreve Norm., Sup., Esc., LD, FRD, CCIS ou TDP", () => {
    const a = colab({ area: "Grupos de Turno", grupo: "A" });
    const datas = mesDatas(2026, 1).slice(0, 5);
    const existentes = {
      [a.id]: {
        "2026-01-01": "Norm.",
        "2026-01-02": "Sup.",
        "2026-01-03": "FRD",
        "2026-01-04": "CCIS",
        "2026-01-05": "TDP"
      }
    };
    const p = propostaCiclo("2026-01-01", { A: [a.id] }, existentes, datas);
    expect(p.celulas[a.id]).toBeUndefined();
  });

  test("sobrescreve turnos antigos ao corrigir a âncora (07/19 e 19/07)", () => {
    const a = colab({ area: "Grupos de Turno", grupo: "A" });
    const datas = mesDatas(2026, 1).slice(0, 4);
    const p = propostaCiclo(
      "2026-01-01",
      { A: [a.id] },
      { [a.id]: { "2026-01-01": "19/07", "2026-01-02": "07/19" } },
      datas
    );
    const linha = p.celulas[a.id] || {};
    expect(linha["2026-01-01"]).toBe("07/19");
    expect(linha["2026-01-02"]).toBe("07/19");
    expect(linha["2026-01-03"]).toBe("19/07");
  });

  test("cobertura do substituto: aplica o ciclo do grupo a quem está de fora", () => {
    const sub = colab({ area: "Mecânica" });
    const datas = mesDatas(2026, 1).slice(0, 5);
    const linha = propostaCobertura("C", "2026-01-01", sub.id, {}, datas);
    // C começa a manhã 4 dias depois de A
    expect(linha["2026-01-01"]).toBe("Folga");
    expect(linha["2026-01-05"]).toBe("07/19");
    // e o substituto com LD fica de fora, como qualquer membro
    const comLD = propostaCobertura(
      "C",
      "2026-01-01",
      sub.id,
      { "2026-01-02": "LD" },
      datas
    );
    expect(Object.keys(comLD).length).toBe(0);
  });
});

/* ============ contagens ============ */

describe("Contagens", () => {
  const datas = ["2026-11-02", "2026-11-03"];
  const m1 = colab({ area: "Mecânica", nome: "Amado Mecanico" });
  const m2 = colab({ area: "Mecânica" });
  const e1 = colab({ area: "Eléctrica" });
  const gente = [m1, m2, e1];
  const linhas: Record<string, Record<string, string>> = {
    [m1.id]: { "2026-11-02": "Norm.", "2026-11-03": "07/19" },
    [m2.id]: { "2026-11-02": "Norm.", "2026-11-03": "Norm." },
    [e1.id]: { "2026-11-02": "19/07", "2026-11-03": "Folga" }
  };

  test("Norm. por área e global com todos os códigos", () => {
    const c = contagensDe(gente, (id) => linhas[id] || {}, datas);
    expect(c.porArea["Mecânica"][0]["Norm."]).toBe(2);
    expect(c.porArea["Eléctrica"][0]["19/07"]).toBe(1);
    expect(c.global[0]["Norm."]).toBe(2);
    expect(c.global[0]["19/07"]).toBe(1);
    expect(c.global[1]["07/19"]).toBe(1);
    expect(c.global[1]["Folga"]).toBe(1);
  });

  test("totalTrabalho soma os códigos de gente em trabalho", () => {
    const c = contagensDe(gente, (id) => linhas[id] || {}, datas);
    expect(totalTrabalho(c.global[0])).toBe(3);
    expect(totalTrabalho(c.global[1])).toBe(2);
  });

  test("inativos não contam", () => {
    const morto = colab({ area: "Mecânica", ativo: false });
    const c = contagensDe([...gente, morto], (id) => linhas[id] || {}, datas);
    expect(c.porArea["Mecânica"][0]["Norm."]).toBe(2);
  });

  test("nomesPorCodigo agrupa por área com rótulos da casa", () => {
    const grupos = nomesPorCodigo(gente, (id) => linhas[id] || {}, "2026-11-03", "07/19");
    expect(grupos.length).toBe(1);
    expect(grupos[0].area).toBe("Mecânica");
    expect(grupos[0].nomes).toEqual(["Amado Mecanico"]);
  });
});

/* ============ folgas ============ */

describe("Folgas guardadas", () => {
  test("saldo soma só guardadas (com meios dias)", () => {
    const s = saldoFolgas([
      { id: "1", colaborador_id: "c", data_origem: null, valor: 2.5, data_gozo: null, estado: "guardada", obs: null },
      { id: "2", colaborador_id: "c", data_origem: null, valor: 1, data_gozo: null, estado: "guardada", obs: null },
      { id: "3", colaborador_id: "c", data_origem: null, valor: 3, data_gozo: "2026-11-10", estado: "usada", obs: null },
      { id: "4", colaborador_id: "c", data_origem: null, valor: 9, data_gozo: null, estado: "cancelada", obs: null }
    ]);
    expect(s).toBeCloseTo(3.5);
  });

  test("problemaFolga recusa valor ruim e aceita 0.5", () => {
    expect(problemaFolga({ valor: 0 })).toContain("valor");
    expect(problemaFolga({ valor: 0.3 })).toContain("meios dias");
    expect(problemaFolga({ valor: 31 })).toContain("máx");
    expect(problemaFolga({ valor: 0.5 })).toBeNull();
    expect(problemaFolga({ valor: 1, data_origem: "2026-13-01" })).toContain("origem");
    expect(problemaFolga({ valor: 1 })).toBeNull();
  });
});

/* ============ registo e auditoria ============ */

describe("Validações do registo", () => {
  test("problemaColab recusa o essencial em falta", () => {
    expect(problemaColab({ codigo: "", nome: "X" })).toContain("código");
    expect(problemaColab({ codigo: "DM0001", nome: "" })).toContain("nome");
    expect(problemaColab({ codigo: "DM0001", nome: "X", contacto: "abc" })).toContain("Contacto");
    expect(problemaColab({ codigo: "DM0001", nome: "X", area: "Invenção" })).toContain("Área");
    expect(problemaColab({ codigo: "DM0001", nome: "X", grupo: "E" })).toContain("Grupo");
    expect(problemaColab({ codigo: "DM0001", nome: "X", contacto: "843115747" })).toBeNull();
  });

  test("avisoAuditoria: LD + turno no mesmo mês avisa; LD só não avisa", () => {
    expect(
      avisoAuditoria({ "2026-11-01": "LD", "2026-11-02": "07/19" })
    ).toContain("auditoria");
    expect(avisoAuditoria({ "2026-11-01": "LD" })).toBeNull();
    expect(avisoAuditoria({ "2026-11-01": "Norm." })).toBeNull();
  });

  test("área e grupo deduzidos da categoria (vocabulário do Excel)", () => {
    expect(areaDeCategoria("Supervisor Electrico")).toBe("Supervisores");
    expect(areaDeCategoria("Mecanico - Grupo A - C.T.")).toBe("Grupos de Turno");
    expect(grupoDeCategoria("Mecanico - Grupo A - C.T.")).toBe("A");
    expect(grupoDeCategoria("Electrico - Grupo D")).toBe("D");
    expect(areaDeCategoria("Pneumatico - C. G.")).toBe("Pneumáticos");
    expect(areaDeCategoria("Torneiro Mecanico")).toBe("Mecânica");
    expect(areaDeCategoria("Lubrificador")).toBe("Mecânica");
    expect(areaDeCategoria("Estagiario Electrico")).toBe("Eléctrica");
    expect(areaDeCategoria("Serralheiro")).toBe("Serralharia");
    expect(areaDeCategoria("Bate-Chapa")).toBe("Serralharia");
    expect(areaDeCategoria("Pintor")).toBe("Serralharia");
    expect(areaDeCategoria("Tec. QSS")).toBe("Outros");
    expect(areaDeCategoria("Planificação/Inspecção")).toBe("Outros");
    expect(chefeDaCategoria("Mecanico - Grupo C - C.T.")).toBe("C.T.");
    expect(chefeDaCategoria("Electrico - C. G.")).toBe("C.G.");
    expect(chefeDaCategoria("Mecanico")).toBeNull();
  });
});

/* ============ códigos e leitura do Excel ============ */

describe("Códigos da legenda", () => {
  test("eCodigoValido aceita os 10 e recusa o resto", () => {
    expect(CODIGOS_ESCALA.length).toBe(10);
    expect(eCodigoValido("07/19")).toBe(true);
    expect(eCodigoValido("TDP")).toBe(true);
    expect(eCodigoValido("XX")).toBe(false);
    expect(eCodigoValido("")).toBe(false);
  });

  test("normalizaCodigo aceita variantes do Excel e recusa #N/A", () => {
    expect(normalizaCodigo("Norm.")).toBe("Norm.");
    expect(normalizaCodigo("NORM")).toBe("Norm.");
    expect(normalizaCodigo("07-19")).toBe("07/19");
    expect(normalizaCodigo("Folga")).toBe("Folga");
    expect(normalizaCodigo("Sup.")).toBe("Sup.");
    expect(normalizaCodigo("#N/A")).toBeNull();
    expect(normalizaCodigo("")).toBeNull();
    expect(normalizaCodigo(null)).toBeNull();
  });

  test("chaveNome colapsa espaços e acentos (nomes divergentes do Excel)", () => {
    expect(chaveNome("  Inacio   Luis  Nhanga ")).toBe(chaveNome("inacio luis nhanga"));
    expect(chaveNome("José")).toBe(chaveNome("jose"));
  });

  test("eFaltaSQL reconhece 'tabela não existe' e não reconhece erros normais", () => {
    expect(eFaltaSQL(new Error("HTTP 404 from /rest/v1/esc_dias"))).toBe(true);
    expect(eFaltaSQL(new Error("Could not find the table 'esc_dias'"))).toBe(true);
    expect(eFaltaSQL(new Error("JWT expired"))).toBe(false);
  });
});
