/**
 * Testes da lógica pura do módulo STOCK (Fase 4).
 *
 * Corre com bun test (não Playwright): funções puras de src/lib/stock.ts
 * sem base de dados. Cobrem as regras decididas com o Filomeno:
 *  - posições calculadas só com movimentos confirmados;
 *  - estados Esgotado / Stock Baixo / OK;
 *  - bloqueio de saída para o stock nunca ficar negativo;
 *  - apagar entrada consumida é bloqueado;
 *  - série dos 6 meses com zeros e custo MZN;
 *  - casarMaterialFecho (nomes dos gases sem acentos);
 *  - busca sem acentos (normalizar).
 */

import { describe, it, expect } from "bun:test";
import {
  calcularPosicoes,
  estadoPosicao,
  motivoBloqueioSaida,
  motivoBloqueioApagarEntrada,
  serieSeisMeses,
  casarMaterialFecho,
  normalizar,
  fmtNum,
  fmtMzn,
  fmtData,
  mesCurto,
  rotuloMaterial,
  MESES_PT,
  UNIDADES_BASE
} from "../src/lib/stock";
import type { MovimentoStock } from "../src/lib/stock";

function mv(parcial: Partial<MovimentoStock>): MovimentoStock {
  return {
    id: "m1",
    tipo: "entrada",
    estado: "confirmado",
    material_id: "mat-a",
    quantidade: 1,
    data_movimento: "2026-10-01",
    data_confirmacao: "2026-10-01",
    fornecedor: null,
    numero_po: null,
    numero_requisicao: null,
    departamento: null,
    finalidade: null,
    colaborador_id: null,
    observacoes: null,
    criado_em: "2026-10-01T00:00:00Z",
    comprador_nome: null,
    recebedor_nome: null,
    fornecedor_saida: null,
    colaborador_nome: null,
    preco_unitario: null,
    ...parcial
  };
}

describe("normalizar (busca sem acentos)", () => {
  it("tira acentos, maiúsculas e espaços extra", () => {
    expect(normalizar("  Óleo   DX3 ")).toBe("oleo dx3");
    expect(normalizar("AÇO Inox")).toBe("aco inox");
    expect(normalizar(null)).toBe("");
  });
});

describe("calcularPosicoes", () => {
  it("entradas confirmadas somam, saídas subtraem", () => {
    const pos = calcularPosicoes([
      mv({ id: "1", tipo: "entrada", material_id: "a", quantidade: 10 }),
      mv({ id: "2", tipo: "saida", material_id: "a", quantidade: 3.5 }),
      mv({ id: "3", tipo: "entrada", material_id: "b", quantidade: 2 })
    ]);
    expect(pos["a"]).toBe(6.5);
    expect(pos["b"]).toBe(2);
    expect(pos["c"]).toBeUndefined();
  });

  it("movimentos pendentes NÃO mexem no stock", () => {
    const pos = calcularPosicoes([
      mv({ id: "1", tipo: "entrada", material_id: "a", quantidade: 10 }),
      mv({ id: "2", tipo: "saida", material_id: "a", quantidade: 4, estado: "pendente" })
    ]);
    expect(pos["a"]).toBe(10);
  });
});

describe("estadoPosicao", () => {
  it("0 ou menos é Esgotado", () => {
    expect(estadoPosicao(0, 5)).toBe("Esgotado");
    expect(estadoPosicao(-2, 5)).toBe("Esgotado");
  });
  it("igual ou abaixo do mínimo é Stock Baixo", () => {
    expect(estadoPosicao(5, 5)).toBe("Stock Baixo");
    expect(estadoPosicao(4.99, 5)).toBe("Stock Baixo");
  });
  it("acima do mínimo é OK; mínimo zero com stock é OK", () => {
    expect(estadoPosicao(6, 5)).toBe("OK");
    expect(estadoPosicao(1, 0)).toBe("OK");
  });
});

describe("motivoBloqueioSaida (stock nunca negativo)", () => {
  it("quantidade inválida bloqueia", () => {
    expect(motivoBloqueioSaida(0, 10)).not.toBe("");
    expect(motivoBloqueioSaida(-1, 10)).not.toBe("");
    expect(motivoBloqueioSaida(NaN, 10)).not.toBe("");
  });
  it("pedir mais do que existe bloqueia com o disponível na mensagem", () => {
    const msg = motivoBloqueioSaida(11, 10);
    expect(msg).toContain("10");
    expect(msg.toLowerCase()).toContain("bloqueada");
  });
  it("pedir exactamente o que existe passa", () => {
    expect(motivoBloqueioSaida(10, 10)).toBe("");
  });
  it("disponível negativo tratado como zero", () => {
    const msg = motivoBloqueioSaida(1, -5);
    expect(msg).toContain("0.");
  });
});

describe("motivoBloqueioApagarEntrada", () => {
  it("entrada já consumida é bloqueada", () => {
    const msg = motivoBloqueioApagarEntrada(
      { material_id: "a", quantidade: 10 },
      { a: 4 }
    );
    expect(msg).toContain("-6");
  });
  it("entrada não consumida pode ser apagada", () => {
    expect(motivoBloqueioApagarEntrada({ material_id: "a", quantidade: 10 }, { a: 10 })).toBe("");
  });
});

describe("serieSeisMeses", () => {
  const hoje = new Date(2026, 9, 21); // 21/10/2026

  it("devolve 6 meses até ao mês corrente, com zeros onde não houve movimento", () => {
    const serie = serieSeisMeses([], hoje, MESES_PT);
    expect(serie.length).toBe(6);
    expect(serie[0].chave).toBe("2026-05");
    expect(serie[0].label).toBe("Mai");
    expect(serie[5].chave).toBe("2026-10");
    expect(serie[0].entradas).toBe(0);
  });

  it("conta entradas, saídas e MZN só de confirmados, e ignora meses fora", () => {
    const serie = serieSeisMeses(
      [
        mv({ id: "1", data_movimento: "2026-09-10", quantidade: 10, preco_unitario: 350 }),
        mv({ id: "2", data_movimento: "2026-10-05", quantidade: 2, preco_unitario: 100 }),
        mv({ id: "3", tipo: "saida", data_movimento: "2026-10-06", quantidade: 1 }),
        mv({ id: "4", data_movimento: "2026-10-07", quantidade: 5, estado: "pendente" }),
        mv({ id: "5", data_movimento: "2026-01-01", quantidade: 100, preco_unitario: 900 })
      ],
      hoje,
      MESES_PT
    );
    const set = serie.find((s) => s.chave === "2026-09")!;
    expect(set.entradas).toBe(1);
    expect(set.mzn).toBe(3500);
    const out = serie.find((s) => s.chave === "2026-10")!;
    expect(out.entradas).toBe(1);
    expect(out.saidas).toBe(1);
    expect(out.mzn).toBe(200);
  });
});

describe("casarMaterialFecho (gases da Faturação)", () => {
  const catalogo = [
    { id: "g1", nome: "Gás Acetileno", ativo: true },
    { id: "g2", nome: "Oxigénio Medicinal", ativo: true }
  ];

  it("casa sem acentos nem maiúsculas", () => {
    expect(casarMaterialFecho("gas acetileno", catalogo)?.id).toBe("g1");
    expect(casarMaterialFecho("GÁS ACETILENO", catalogo)?.id).toBe("g1");
  });
  it("aceita o nome livre dentro do nome do material", () => {
    expect(casarMaterialFecho("Acetileno", catalogo)?.id).toBe("g1");
  });
  it("devolve null quando não casa", () => {
    expect(casarMaterialFecho("Argon", catalogo)).toBeNull();
    expect(casarMaterialFecho("", catalogo)).toBeNull();
  });
});

describe("formatos", () => {
  it("fmtNum à portuguesa", () => {
    expect(fmtNum(12345.5)).toBe("12 345,5");
    expect(fmtNum("abc")).toBe("0");
  });
  it("fmtMzn com 2 casas", () => {
    expect(fmtMzn(3500)).toBe("3 500,00 MZN");
  });
  it("fmtData e mesCurto", () => {
    expect(fmtData("2026-10-21")).toBe("21/10/2026");
    expect(fmtData("")).toBe("-");
    expect(mesCurto("2026-10", MESES_PT)).toBe("Out");
  });
  it("rotuloMaterial", () => {
    expect(
      rotuloMaterial({ id: "1", referencia: "DAN-LUB-001", nome: "Óleo DOT3", unidade: "Lt", preco_mzn: 350, ativo: true, stock_minimo: 3, localizacao: null, categoria: null })
    ).toBe("DAN-LUB-001 - Óleo DOT3");
    expect(rotuloMaterial(null)).toBe("-");
  });
  it("unidades base do hub mantidas", () => {
    expect(UNIDADES_BASE).toEqual(["Un", "Kg", "Lt", "Mt", "Cx", "Par", "Rolo", "Saco"]);
  });
});
