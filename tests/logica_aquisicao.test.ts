/**
 * Testes lógicos do módulo Pedidos de Aquisição (migração do hub).
 *
 * O que se prova aqui é a LÓGICA pura (lib/aquisicao.ts): numeração,
 * validação, normalização de itens, filtros do histórico, KPIs do
 * painel e o texto do papel. As provas visuais (Playwright) vivem em
 * tests/aquisicao_visual.js.
 */

import { describe, expect, test } from "bun:test";
import {
  alvoPesquisaPedido,
  fmtDataAq,
  itensParaGravar,
  numeroFmt,
  problemaDoPedido,
  proximoNumero,
  semAcentos,
  statsPainel,
  textoReferencia,
  type PedidoAquisicao
} from "../src/lib/aquisicao";

const pedidoBase = (sobre: Partial<PedidoAquisicao> = {}): PedidoAquisicao => ({
  id: "p1",
  ano: 2026,
  numero: 2,
  data_pedido: "2026-09-02",
  tipo_documento: "Pro-forma",
  numero_cotacao_proforma: "13429",
  fornecedor_id: "f1",
  fornecedor_nome: "Carlos Ferreira Sociedade Unipessoal, Lda",
  solicitante: "Filomeno Manuel Joaquim Alexandre",
  solicitante_codigo: "DM0069",
  observacao_geral: "",
  ...sobre
});

describe("numeroFmt", () => {
  test("formato 002/2026 com 3 dígitos", () => {
    expect(numeroFmt(2026, 2)).toBe("002/2026");
  });
  test("número com 4 dígitos não corta", () => {
    expect(numeroFmt(2026, 1234)).toBe("1234/2026");
  });
});

describe("fmtDataAq", () => {
  test("ISO -> dd/mm/yyyy", () => {
    expect(fmtDataAq("2026-09-02")).toBe("02/09/2026");
  });
  test("vazio e lixo devolvem traço", () => {
    expect(fmtDataAq("")).toBe("-");
    expect(fmtDataAq(null)).toBe("-");
    expect(fmtDataAq("lixo")).toBe("-");
  });
});

describe("proximoNumero (a regra do hub, agora no servidor)", () => {
  test("sem nada: começa no 1", () => {
    expect(proximoNumero(2026, undefined, undefined)).toBe(1);
  });
  test("só histórico: último + 1", () => {
    expect(proximoNumero(2026, undefined, 4)).toBe(5);
  });
  test("só contador: usa o contador", () => {
    expect(proximoNumero(2026, 105, undefined)).toBe(105);
  });
  test("contador manda quando é maior que o histórico (caso real da base: 105 vs 2)", () => {
    expect(proximoNumero(2026, 105, 2)).toBe(105);
  });
  test("histórico manda quando ultrapassa o contador", () => {
    expect(proximoNumero(2026, 5, 9)).toBe(10);
  });
});

describe("problemaDoPedido (o juiz do servidor e do editor)", () => {
  const dadosOk = {
    data_pedido: "2026-10-27",
    tipo_documento: "Cotação",
    numero_cotacao_proforma: "13429",
    fornecedor_id: "f1",
    fornecedor_nome: "Carlos Ferreira",
    solicitante: "Filomeno",
    solicitante_codigo: "DM0069",
    observacao_geral: ""
  };
  const itemOk = { designacao: "Óleo 20L", quantidade: 2 };

  test("pedido completo passa", () => {
    expect(problemaDoPedido(dadosOk, [itemOk])).toBeNull();
  });
  test("sem data recusa", () => {
    expect(problemaDoPedido({ ...dadosOk, data_pedido: "" }, [itemOk])).toContain("data");
  });
  test("data torta recusa", () => {
    expect(problemaDoPedido({ ...dadosOk, data_pedido: "27/10/2026" }, [itemOk])).toContain("inválida");
  });
  test("sem denominação recusa", () => {
    expect(problemaDoPedido({ ...dadosOk, tipo_documento: "" }, [itemOk])).toContain("denominação");
  });
  test("sem nº da cotação recusa", () => {
    expect(problemaDoPedido({ ...dadosOk, numero_cotacao_proforma: " " }, [itemOk])).toContain("Cotação / Pro-forma");
  });
  test("sem fornecedor recusa", () => {
    expect(problemaDoPedido({ ...dadosOk, fornecedor_id: "", fornecedor_nome: "" }, [itemOk])).toContain("fornecedor");
  });
  test("sem solicitante recusa", () => {
    expect(problemaDoPedido({ ...dadosOk, solicitante: "" }, [itemOk])).toContain("solicitante");
  });
  test("sem itens recusa", () => {
    expect(problemaDoPedido(dadosOk, [])).toContain("pelo menos um item");
  });
  test("item sem designação recusa", () => {
    expect(problemaDoPedido(dadosOk, [{ designacao: "  " }])).toContain("designação");
  });
  test("quantidade zero ou negativa recusa", () => {
    expect(problemaDoPedido(dadosOk, [{ designacao: "x", quantidade: 0 }])).toContain("maior que zero");
    expect(problemaDoPedido(dadosOk, [{ designacao: "x", quantidade: -3 }])).toContain("maior que zero");
  });
});

describe("itensParaGravar", () => {
  test("renumera 1..n por cima do que veio", () => {
    const r = itensParaGravar([
      { numero_ordem: 7, designacao: "A", quantidade: 1 },
      { designacao: "B", quantidade: 2 }
    ]);
    expect(r.map((i) => i.numero_ordem)).toEqual([1, 2]);
  });
  test("apariza textos e cai na quantidade 1 quando vem lixo", () => {
    const r = itensParaGravar([{ designacao: "  Óleo 20L  ", quantidade: Number.NaN, unidade: " Un ", aplicacao: " Oficina ", observacao: "" }]);
    expect(r[0].designacao).toBe("Óleo 20L");
    expect(r[0].quantidade).toBe(1);
    expect(r[0].unidade).toBe("Un");
    expect(r[0].aplicacao).toBe("Oficina");
  });
  test("quantidade decimal honesta", () => {
    const r = itensParaGravar([{ designacao: "Cabo", quantidade: 2.5 }]);
    expect(r[0].quantidade).toBe(2.5);
  });
});

describe("semAcentos e pesquisa", () => {
  test("tira acentos e passa a minúsculas", () => {
    expect(semAcentos("Construção Civil")).toBe("construcao civil");
  });
  test("alvo de pesquisa inclui nº formatado, solicitante, fornecedor e materiais", () => {
    const alvo = alvoPesquisaPedido(pedidoBase(), ["Detergente Liquido", "Leite UHT"]);
    expect(alvo.includes("002/2026")).toBe(true);
    expect(alvo.includes("filomeno")).toBe(true);
    expect(alvo.includes("carlos ferreira")).toBe(true);
    expect(alvo.includes("detergente")).toBe(true);
    expect(alvo).toBe(semAcentos(alvo));
  });
  test("pesquisa sem acentos acha 'numeracao' dentro de 'Numeração'", () => {
    const alvo = alvoPesquisaPedido(pedidoBase({ tipo_documento: "Pro-forma nº Numeração" }), []);
    expect(alvo.includes("numeracao")).toBe(true);
  });
});

describe("textoReferencia (caixa verde do papel)", () => {
  test("formato fiel ao hub: 'Pro-forma nº 13429  ·  Fornecedor: X'", () => {
    expect(
      textoReferencia({ tipo_documento: "Pro-forma", numero_cotacao_proforma: "13429", fornecedor_nome: "Carlos Ferreira" })
    ).toBe("Pro-forma nº 13429  ·  Fornecedor: Carlos Ferreira");
  });
});

describe("statsPainel (KPIs do painel)", () => {
  const pedidos = [
    pedidoBase({ id: "1", ano: 2026, numero: 5, data_pedido: "2026-10-03", fornecedor_nome: "A" }),
    pedidoBase({ id: "2", ano: 2026, numero: 4, data_pedido: "2026-10-20", fornecedor_nome: "B" }),
    pedidoBase({ id: "3", ano: 2026, numero: 3, data_pedido: "2026-10-25", fornecedor_nome: "A" }),
    pedidoBase({ id: "4", ano: 2026, numero: 2, data_pedido: "2026-09-02", fornecedor_nome: "A" }),
    pedidoBase({ id: "5", ano: 2025, numero: 9, data_pedido: "2025-12-10", fornecedor_nome: "C" })
  ];

  test("conta por ano e por mês corrente (hoje = 2026-10-27)", () => {
    const s = statsPainel(pedidos, 7, "2026-10-27");
    expect(s.ano).toBe(2026);
    expect(s.totalAno).toBe(4);
    expect(s.totalMes).toBe(3);
    expect(s.fornecedoresAtivos).toBe(7);
  });
  test("top fornecedor e top 5", () => {
    const s = statsPainel(pedidos, 7, "2026-10-27");
    expect(s.topFornecedor).toBe("A");
    expect(s.topFornecedorQtd).toBe(3);
    expect(s.topCinco[0]).toEqual({ label: "A", count: 3 });
    expect(s.topCinco.length).toBe(3);
  });
  test("gráfico por mês do ano corrente", () => {
    const s = statsPainel(pedidos, 7, "2026-10-27");
    expect(s.porMes.length).toBe(12);
    expect(s.porMes[8].count).toBe(1); // Setembro
    expect(s.porMes[9].count).toBe(3); // Outubro
    expect(s.porMes[0].count).toBe(0);
  });
  test("sem pedidos: zeros e top nulo", () => {
    const s = statsPainel([], 2, "2026-10-27");
    expect(s.totalAno).toBe(0);
    expect(s.topFornecedor).toBeNull();
    expect(s.topCinco.length).toBe(0);
  });
});
