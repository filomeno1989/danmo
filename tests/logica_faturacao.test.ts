/**
 * Testes da lógica pura da FATURAÇÃO da administração: totais (com
 * material do cliente fora), numeração anual 001/2026, número por
 * extenso, sanitização de HTML rico e validação do documento.
 * Correm com: bun test tests/logica_faturacao.test.ts
 */

import { describe, expect, test } from "bun:test";

const {
  calcTotais,
  totalItem,
  proximoNumero,
  anoDoNumero,
  numeroNovoValido,
  numeroEdicaoValido,
  numeroDuplicado,
  numPorExtenso,
  fmtNum,
  sanitizarHTMLRico,
  textoSemTags,
  validarDocEntrada,
  fmtData,
  dataExtenso,
  totaisAnoPorTipo
} = await import("@/lib/faturacao");
import type { ItemFaturacao } from "@/lib/faturacao";

const linha = (parcial: Partial<ItemFaturacao>): ItemFaturacao => ({
  ordem: 0,
  item_tipo: "mao",
  tecnico_id: null,
  tecnico_nome: null,
  descricao: null,
  qtd: 1,
  tempo: 1,
  unidade: "horas",
  valor_unit: 0,
  total: 0,
  ...parcial
});

const OP_PADRAO = {
  desconto_input: 0,
  desconto_tipo: "fixo" as const,
  iva_incluido: false,
  iva_pct: 16,
  moeda: "MZN" as const,
  taxa_cambio: 64
};

/* ------------------------------------------------------------------ */

describe("totalItem", () => {
  test("mão-de-obra: qtd x tempo x valor", () => {
    expect(
      totalItem({ item_tipo: "mao", qtd: 2, tempo: 14, valor_unit: 3225.5 }, "mao")
    ).toBe(90314);
  });

  test("material: qtd x valor (sem tempo)", () => {
    expect(
      totalItem({ item_tipo: "material", qtd: 3, tempo: 9, valor_unit: 10 }, "misto")
    ).toBe(30);
  });

  test("material do cliente vale sempre 0", () => {
    expect(
      totalItem({ item_tipo: "material_cliente", qtd: 5, tempo: 3, valor_unit: 100 }, "misto")
    ).toBe(0);
  });
});

describe("calcTotais", () => {
  test("mão-de-obra simples, sem desconto e sem IVA", () => {
    const t = calcTotais(
      [linha({ qtd: 2, tempo: 6, valor_unit: 2013.94 })],
      "mao",
      OP_PADRAO
    );
    expect(t.subtotal).toBe(24167.28);
    expect(t.total).toBe(24167.28);
    expect(t.total_mzn).toBe(24167.28);
    expect(t.iva).toBe(0);
  });

  test("desconto percentual e IVA incluído", () => {
    const t = calcTotais(
      [linha({ item_tipo: "material", qtd: 10, valor_unit: 100 })],
      "material",
      { ...OP_PADRAO, desconto_input: 10, desconto_tipo: "pct", iva_incluido: true, iva_pct: 16 }
    );
    expect(t.subtotal).toBe(1000);
    expect(t.desconto).toBe(100);
    expect(t.iva).toBe(144); // 900 * 0.16
    expect(t.total).toBe(1044);
  });

  test("material do cliente NÃO entra no subtotal", () => {
    const t = calcTotais(
      [
        linha({ item_tipo: "material", qtd: 2, valor_unit: 50 }),
        linha({ item_tipo: "material_cliente", qtd: 4, valor_unit: 0 })
      ],
      "misto",
      OP_PADRAO
    );
    expect(t.subtotal).toBe(100);
    expect(t.total).toBe(100);
  });

  test("USD: total_mzn usa a taxa", () => {
    const t = calcTotais(
      [linha({ item_tipo: "material", qtd: 1, valor_unit: 100 })],
      "material",
      { ...OP_PADRAO, moeda: "USD", taxa_cambio: 64 }
    );
    expect(t.total).toBe(100);
    expect(t.total_mzn).toBe(6400);
  });

  test("desconto maior que o subtotal não dá total negativo", () => {
    const t = calcTotais(
      [linha({ item_tipo: "material", qtd: 1, valor_unit: 50 })],
      "material",
      { ...OP_PADRAO, desconto_input: 80, desconto_tipo: "fixo" }
    );
    expect(t.apos_desconto).toBe(0);
    expect(t.total).toBe(0);
  });
});

describe("numeração anual 001/2026", () => {
  const docs = [
    { id: "1", tipo: "cotacao", numero: "001/26", data: "2026-04-08" },
    { id: "2", tipo: "cotacao", numero: "008/26", data: "2026-10-19" },
    { id: "3", tipo: "fatura", numero: "002/26", data: "2026-05-19" },
    { id: "4", tipo: "fatura", numero: "010/26", data: "2026-09-23" },
    { id: "5", tipo: "fatura", numero: "010/26", data: "2026-08-21" }, // duplicado histórico
    { id: "6", tipo: "fatura", numero: "xxx", data: "2025-12-31" } // inválido
  ];

  test("continua a sequência de 2026 com 4 dígitos", () => {
    expect(proximoNumero("fatura", docs, 2026)).toBe("011/2026");
    expect(proximoNumero("cotacao", docs, 2026)).toBe("009/2026");
  });

  test("reinicia a cada ano", () => {
    expect(proximoNumero("fatura", docs, 2027)).toBe("001/2027");
    expect(proximoNumero("cotacao", docs, 2027)).toBe("001/2027");
  });

  test("ignora documentos de outro tipo", () => {
    const soCotacoes = docs.filter((d) => d.tipo === "cotacao");
    expect(proximoNumero("fatura", soCotacoes, 2026)).toBe("001/2026");
  });

  test("anoDoNumero: 2 dígitos e 4 dígitos", () => {
    expect(anoDoNumero("001/26")).toBe(2026);
    expect(anoDoNumero("011/2026")).toBe(2026);
    expect(anoDoNumero("abc")).toBeNull();
  });

  test("formato novo exige ano com 4 dígitos", () => {
    expect(numeroNovoValido("011/2026")).toBeTrue();
    expect(numeroNovoValido("011/26")).toBeFalse();
    expect(numeroEdicaoValido("001/26")).toBeTrue();
  });

  test("número duplicado no mesmo tipo (fora o próprio)", () => {
    expect(numeroDuplicado("fatura", "010/26", docs)).toBeTrue();
    expect(numeroDuplicado("fatura", "010/26", docs, "4")).toBeTrue(); // o outro 010 existe
    expect(numeroDuplicado("fatura", "999/2026", docs)).toBeFalse();
  });
});

describe("número por extenso (1 para 1 com o hub)", () => {
  test("casos principais", () => {
    expect(numPorExtenso(0)).toBe("Zero meticais");
    expect(numPorExtenso(1)).toBe("Um metical");
    expect(numPorExtenso(193530)).toBe("Cento e noventa e três mil quinhentos e trinta meticais");
    expect(numPorExtenso(1000)).toBe("Mil meticais");
    expect(numPorExtenso(100)).toBe("Cem meticais");
    expect(numPorExtenso(2.5)).toBe("Dois meticais e cinquenta centavos");
    expect(numPorExtenso(90314)).toBe("Noventa mil trezentos e catorze meticais");
  });

  test("milhões", () => {
    expect(numPorExtenso(2000000)).toBe("Dois milhões de meticais");
    expect(numPorExtenso(1100000)).toBe("Um milhão cem mil meticais");
  });
});

describe("formatação", () => {
  test("fmtNum agrupa milhares à portuguesa", () => {
    expect(fmtNum(24167.28)).toBe("24.167,28");
    expect(fmtNum(1000)).toBe("1.000,00");
    expect(fmtNum(-5.5)).toBe("-5,50");
  });

  test("fmtData e dataExtenso", () => {
    expect(fmtData("2026-10-22")).toBe("22/10/2026");
    expect(dataExtenso("2026-10-22")).toBe("Beira, 22 de outubro de 2026");
  });
});

describe("sanitizarHTMLRico (servidor, sem DOMParser)", () => {
  test("mantém a formatação permitida", () => {
    const html = "<p>Olá <b>mundo</b> <u>bonito</u></p><ul><li>um</li><li>dois</li></ul>";
    expect(sanitizarHTMLRico(html)).toBe(html);
  });

  test("remove etiqueta perigosa mas mantém o texto", () => {
    expect(sanitizarHTMLRico("a <script>alert(1)</script>b")).toBe("a b");
    expect(sanitizarHTMLRico('<img src=x onerror="alert(1)">texto')).toBe("texto");
    expect(sanitizarHTMLRico("<b onclick='x'>n</b>")).toBe("<b>n</b>");
  });

  test("aceita só style text-align", () => {
    expect(sanitizarHTMLRico('<p style="text-align: right;">x</p>')).toBe(
      '<p style="text-align: right">x</p>'
    );
    expect(sanitizarHTMLRico('<p style="color:red">x</p>')).toBe("<p>x</p>");
  });

  test("textoSemTags devolve texto simples", () => {
    expect(textoSemTags("<p>Exmos <b>Senhores</b>,</p>")).toBe("Exmos Senhores,");
  });
});

describe("validarDocEntrada", () => {
  const tecnicos = [{ id: "t1", nome: "Técnico Mecânico" }];

  const corpoValido = {
    tipo: "fatura",
    numero: "011/2026",
    data: "2026-10-22",
    servico: "mao",
    moeda: "MZN",
    taxa_cambio: 64,
    iva_incluido: false,
    iva_pct: 16,
    tipo_cliente: "interno",
    cliente_nome: "CCIS",
    desconto_input: 0,
    desconto_tipo: "fixo",
    itens: [
      { item_tipo: "mao", tecnico_id: "t1", qtd: 2, tempo: 6, unidade: "horas", valor_unit: 2013.94 }
    ]
  };

  test("aceita documento correcto e recalcula totais", () => {
    const v = validarDocEntrada(corpoValido, tecnicos, { novo: true });
    expect(v.ok).toBeTrue();
    expect(v.dados?.subtotal).toBe(24167.28);
    expect(v.dados?.total_mzn).toBe(24167.28);
    expect(v.dados?.itens[0].tecnico_nome).toBe("Técnico Mecânico"); // resolvido no servidor
  });

  test("recusa formato antigo em documento NOVO", () => {
    const v = validarDocEntrada({ ...corpoValido, numero: "011/26" }, tecnicos, { novo: true });
    expect(v.ok).toBeFalse();
    expect(v.erro).toContain("4 dígitos");
  });

  test("aceita formato antigo a EDITAR (histórico)", () => {
    const v = validarDocEntrada({ ...corpoValido, numero: "001/26" }, tecnicos, { novo: false });
    expect(v.ok).toBeTrue();
  });

  test("recusa sem cliente e sem número", () => {
    expect(validarDocEntrada({ ...corpoValido, cliente_nome: "" }, tecnicos, { novo: true }).ok).toBeFalse();
    expect(validarDocEntrada({ ...corpoValido, numero: "" }, tecnicos, { novo: true }).ok).toBeFalse();
  });

  test("material do cliente no misto: total 0 e fora do subtotal", () => {
    const v = validarDocEntrada(
      {
        ...corpoValido,
        servico: "misto",
        itens: [
          { item_tipo: "mao", tecnico_id: "t1", qtd: 1, tempo: 2, unidade: "horas", valor_unit: 100 },
          { item_tipo: "material_cliente", descricao: "Oleo 15W40", qtd: 3, unidade: "Lt", valor_unit: 0 }
        ]
      },
      tecnicos,
      { novo: true }
    );
    expect(v.ok).toBeTrue();
    expect(v.dados?.subtotal).toBe(200);
    expect(v.dados?.itens[1].total).toBe(0);
  });

  test("em mão-de-obra a linha vira mão-de-obra normal (a marca Do cliente só existe em material/misto)", () => {
    const v = validarDocEntrada(
      {
        ...corpoValido,
        itens: [
          { item_tipo: "material_cliente", descricao: "X", qtd: 1, unidade: "Und", valor_unit: 0 }
        ]
      },
      tecnicos,
      { novo: true }
    );
    expect(v.ok).toBeTrue();
    expect(v.dados?.itens[0].item_tipo).toBe("mao");
  });
});

/* ------------------------------------------------------------------ */

describe("totaisAnoPorTipo", () => {
  const docs = [
    { tipo: "fatura", data: "2026-03-10", total_mzn: 53452.8 },
    { tipo: "fatura", data: "2026-06-01", total_mzn: 1000 },
    { tipo: "cotacao", data: "2026-04-15", total_mzn: 24167.28 },
    { tipo: "cotacao", data: "2025-12-31", total_mzn: 999999 },
    { tipo: "fatura", data: "2025-07-01", total_mzn: 777 },
    { tipo: "fatura", data: "2026-05-05" }
  ];

  test("faturas e cotações ficam em números SEPARADOS (cotação convertida não dobra o total)", () => {
    const t = totaisAnoPorTipo(docs, 2026);
    expect(t.faturas).toBe(54452.8);
    expect(t.cotacoes).toBe(24167.28);
  });

  test("só entra quem tem data no ano pedido", () => {
    const t = totaisAnoPorTipo(docs, 2025);
    expect(t.faturas).toBe(777);
    expect(t.cotacoes).toBe(999999);
  });

  test("documento sem total_mzn conta 0, não rebenta", () => {
    const t = totaisAnoPorTipo(docs, 2026);
    expect(t.faturas).toBe(54452.8);
  });

  test("lista vazia dá zeros", () => {
    expect(totaisAnoPorTipo([], 2026)).toEqual({ faturas: 0, cotacoes: 0 });
  });

  test("o mesmo trabalho em cotação + fatura soma uma só vez nas faturas", () => {
    const trabalho = [
      { tipo: "cotacao", data: "2026-02-01", total_mzn: 50000 },
      { tipo: "fatura", data: "2026-03-01", total_mzn: 50000 }
    ];
    const t = totaisAnoPorTipo(trabalho, 2026);
    expect(t.faturas).toBe(50000);
    expect(t.cotacoes).toBe(50000);
  });
});
