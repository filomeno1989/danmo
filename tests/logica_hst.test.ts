/**
 * Provas de LÓGICA do Portal HST (migração do hub).
 *
 * Cobre: o classificador de tensão corrigido (inclui os casos que o hub
 * classificava errado), os juízes de validação partilhados com as APIs,
 * a numeração DAN-HST no servidor, a resolução das linhas antigas da era
 * danmo-hst, KPIs, alertas, gráficos do painel, o resumo mensal e a
 * formatação.
 */

import { describe, expect, test } from "bun:test";
import {
  accaoAtrasada,
  acidentesPorTipo,
  alertasPainelHst,
  alvoPesquisaAcidente,
  areasPorNivel,
  classificarTensao,
  eHta,
  fmtDataHst,
  indicadoresResumoMensal,
  numeroFmtHst,
  partirNumeroHst,
  problemaAccao,
  problemaAcidente,
  problemaArea,
  problemaEpi,
  problemaEntrega,
  problemaValoresTensao,
  proximoNumeroHst,
  statsPainelHst,
  vestirAcidente,
  type AccaoHST,
  type AcidenteHST,
  type AreaRiscoHST,
  type EntregaEpiHST,
  type MedicaoTensaoHST
} from "@/lib/hst";

/* ============ dados de apoio ============ */

function acidente(overrides: Partial<AcidenteHST> = {}): AcidenteHST {
  return {
    id: 1,
    numero: "DAN-HST-2026-001",
    status: "Em Investigacao",
    colaborador_nome: "Filomeno",
    colaborador_id: null,
    area_risco_id: null,
    area_risco_nome: null,
    data_hora: "2026-11-10T08:30",
    tipo_ocorrencia: "Acidente sem Afastamento",
    tipo_lesao: "Corte",
    parte_corpo: "Mão",
    dias_afastamento: 0,
    gerou_atestado: false,
    numero_atestado: null,
    testemunhas: null,
    causa_raiz: null,
    fator_humano: null,
    fator_ambiental: null,
    fator_equipamento: null,
    registrado_por: "Filomeno",
    collaborator_id: null,
    data_acidente: null,
    gravidade: null,
    dias_baixa: null,
    zona: null,
    local: null,
    tipo_acidente: null,
    encaminhado_para: null,
    epi_usado: null,
    descricao: "Caiu uma peça",
    ...overrides
  };
}

function accao(overrides: Partial<AccaoHST> = {}): AccaoHST {
  return {
    id: 1,
    acidente_id: 1,
    descricao_acao: "Substituir guarda",
    responsavel: "Nelson",
    prazo: "2026-11-01",
    status: "Pendente",
    data_conclusao: null,
    observacoes: null,
    ...overrides
  };
}

function medicao(overrides: Partial<MedicaoTensaoHST> = {}): MedicaoTensaoHST {
  return {
    id: 1,
    colaborador_nome: "Filomeno",
    colaborador_id: null,
    sistolica: 120,
    diastolica: 80,
    frequencia_cardiaca: 72,
    classificacao: "Normal",
    medido_por: "Filomeno",
    observacoes: null,
    data_medicao: "2026-11-12T08:00",
    ...overrides
  };
}

function area(overrides: Partial<AreaRiscoHST> = {}): AreaRiscoHST {
  return {
    id: 1,
    nome: "Serralharia",
    nivel_risco: "Critico",
    descricao: null,
    medidas_controlo: null,
    ativo: true,
    ...overrides
  };
}

function entrega(overrides: Partial<EntregaEpiHST> = {}): EntregaEpiHST {
  return {
    id: 1,
    colaborador_nome: "Filomeno",
    epi_id: 1,
    epi_nome: "Luvas Nitrilo",
    quantidade: 1,
    observacoes: null,
    data_entrega: "2026-11-11T09:00",
    ...overrides
  };
}

/* ============ classificador de tensão ============ */

describe("classificarTensao: cascata OMS/ESH correcta", () => {
  test("os casos normais", () => {
    expect(classificarTensao(115, 75).texto).toBe("Ótima");
    expect(classificarTensao(125, 78).texto).toBe("Normal");
    expect(classificarTensao(135, 86).texto).toBe("Limítrofe");
    expect(classificarTensao(145, 95).texto).toBe("HTA Grau 1");
    expect(classificarTensao(165, 105).texto).toBe("HTA Grau 2");
    expect(classificarTensao(185, 115).texto).toBe("HTA Grau 3");
  });

  test("os casos que o HUB CLASSIFICAVA ERRADO (o || arrastava a sistólica alta para baixo)", () => {
    // 150/70: a diastólica baixa não esconde a sistólica alta (hub: Limítrofe).
    const r1 = classificarTensao(150, 70);
    expect(r1.texto).toBe("HTA Grau 1");
    expect(r1.cls).toBe("alta");
    // 170/85: hub dizia Limítrofe; o certo é Grau 2.
    expect(classificarTensao(170, 85).texto).toBe("HTA Grau 2");
    // 190/75: hub dizia Limítrofe; o certo é Grau 3.
    expect(classificarTensao(190, 75).texto).toBe("HTA Grau 3");
    // 125/92: diastólica alta conta (Grau 1) mesmo com sistólica normal.
    expect(classificarTensao(125, 92).texto).toBe("HTA Grau 1");
    // 122/82: hub dizia Ótima (as duas condições em && falham pelo dia); o
    // certo é Normal (nenhum valor chegou a Limítrofe).
    expect(classificarTensao(122, 82).texto).toBe("Normal");
  });

  test("a categoria é sempre do PIOR dos dois valores (tabela de referência)", () => {
    // Cada par (sys, dia) cai no grau do valor mais grave dos dois.
    expect(classificarTensao(160, 70).texto).toBe("HTA Grau 2");
    expect(classificarTensao(140, 90).texto).toBe("HTA Grau 1");
    expect(classificarTensao(130, 85).texto).toBe("Limítrofe");
    expect(classificarTensao(120, 80).texto).toBe("Normal");
  });

  test("eHta marca qualquer grau de HTA", () => {
    expect(eHta(150, 70)).toBe(true);
    expect(eHta(185, 115)).toBe(true);
    expect(eHta(120, 80)).toBe(false);
    expect(eHta(135, 88)).toBe(false);
  });

  test("problemaValoresTensao recusa o absurdo", () => {
    expect(problemaValoresTensao(NaN, 80, null)).toContain("Preenche");
    expect(problemaValoresTensao(50, 80, null)).toContain("Sistólica");
    expect(problemaValoresTensao(120, 20, null)).toContain("Diastólica");
    expect(problemaValoresTensao(120, 120, null)).toContain("menor");
    expect(problemaValoresTensao(120, 80, 500)).toContain("cardíaca");
    expect(problemaValoresTensao(120, 80, null)).toBeNull();
    expect(problemaValoresTensao(120, 80, 72)).toBeNull();
  });
});

/* ============ numeração ============ */

describe("numeração DAN-HST", () => {
  test("o formato do papel", () => {
    expect(numeroFmtHst(2026, 1)).toBe("DAN-HST-2026-001");
    expect(numeroFmtHst(2026, 23)).toBe("DAN-HST-2026-023");
    expect(numeroFmtHst(2026, 123)).toBe("DAN-HST-2026-123");
  });
  test("partirNúmero devolve ano e sequência (e null no lixo)", () => {
    expect(partirNumeroHst("DAN-HST-2026-002")).toEqual({ ano: 2026, seq: 2 });
    expect(partirNumeroHst(null)).toBeNull();
    expect(partirNumeroHst("001/2026")).toBeNull();
  });
  test("o próximo número é o último gravado + 1 (regra do papel, no servidor)", () => {
    expect(proximoNumeroHst(2026, 0)).toBe(1);
    expect(proximoNumeroHst(2026, 1)).toBe(2);
    expect(proximoNumeroHst(2026, undefined)).toBe(1);
  });
});

/* ============ juízes de validação ============ */

describe("juízes de validação (editor + API)", () => {
  test("problemaAcidente recusa o que falta", () => {
    expect(problemaAcidente({})).toContain("colaborador");
    expect(problemaAcidente({ colaborador_nome: "X" })).toContain("data");
    expect(problemaAcidente({ colaborador_nome: "X", data_hora: "10:00" })).toContain("inválidas");
    expect(
      problemaAcidente({ colaborador_nome: "X", data_hora: "2026-11-10T08:30", tipo_ocorrencia: "Incidente" })
    ).toContain("Descreve");
    expect(
      problemaAcidente({
        colaborador_nome: "X",
        data_hora: "2026-11-10T08:30",
        tipo_ocorrencia: "Incidente",
        descricao: "algo"
      })
    ).toBeNull();
    expect(
      problemaAcidente({
        colaborador_nome: "X",
        data_hora: "2026-11-10T08:30",
        tipo_ocorrencia: "Tipo inventado",
        descricao: "algo"
      })
    ).toContain("desconhecido");
  });

  test("problemaAccao exige os 3 campos com data válida", () => {
    expect(problemaAccao({})).toContain("Descreve");
    expect(problemaAccao({ descricao_acao: "x" })).toContain("responsável");
    expect(problemaAccao({ descricao_acao: "x", responsavel: "y" })).toContain("prazo");
    expect(problemaAccao({ descricao_acao: "x", responsavel: "y", prazo: "31/12" })).toContain("prazo");
    expect(problemaAccao({ descricao_acao: "x", responsavel: "y", prazo: "2026-12-31" })).toBeNull();
  });

  test("problemaArea e problemaEpi", () => {
    expect(problemaArea({})).toContain("nome");
    expect(problemaArea({ nome: "X", nivel_risco: "Altíssimo" })).toContain("desconhecido");
    expect(problemaArea({ nome: "X", nivel_risco: "Critico" })).toBeNull();
    expect(problemaEpi({})).toContain("nome");
    expect(problemaEpi({ nome: "Luvas", stock_atual: -1 })).toContain("negativo");
    expect(problemaEpi({ nome: "Luvas", stock_atual: 10 })).toBeNull();
  });

  test("problemaEntrega", () => {
    expect(problemaEntrega({})).toContain("colaborador");
    expect(problemaEntrega({ colaborador_nome: "X" })).toContain("EPI");
    expect(problemaEntrega({ colaborador_nome: "X", epi_id: 1, quantidade: 0 })).toContain("quantidade");
    expect(problemaEntrega({ colaborador_nome: "X", epi_id: 1, quantidade: 2 })).toBeNull();
  });
});

/* ============ linhas antigas (era danmo-hst) ============ */

describe("vestirAcidente: as duas eras na mesma tabela", () => {
  test("linha do hub chega como está", () => {
    const v = vestirAcidente(acidente(), {});
    expect(v.eAntigo).toBe(false);
    expect(v.nomeDisplay).toBe("Filomeno");
    expect(v.dataDisplay).toBe("2026-11-10T08:30");
  });
  test("linha antiga resolve o nome pelo collaborator_id e a data pelo campo antigo", () => {
    const antigo = acidente({
      numero: null,
      colaborador_nome: null,
      collaborator_id: 5,
      data_hora: null,
      data_acidente: "2026-06-02",
      hora_acidente: "10:34:00",
      dias_afastamento: null,
      dias_baixa: 7,
      tipo_ocorrencia: null,
      tipo_acidente: "Corte / Laceração"
    });
    const v = vestirAcidente(antigo, { 5: "Colaborador Antigo" });
    expect(v.eAntigo).toBe(true);
    expect(v.nomeDisplay).toBe("Colaborador Antigo");
    expect(v.dataDisplay).toBe("2026-06-02T10:34:00");
    expect(v.dias_afastamento).toBe(7);
    expect(v.tipo_ocorrencia).toContain("Corte / Laceração");
  });
  test("linha antiga sem nome possível mostra Sem nome (nunca quebra)", () => {
    const v = vestirAcidente(acidente({ numero: null, colaborador_nome: null, collaborator_id: 999 }), {});
    expect(v.nomeDisplay).toBe("Sem nome");
  });
});

/* ============ painel ============ */

describe("statsPainelHst e alertas", () => {
  const HOJE = "2026-11-13";

  test("KPIs contam só o mês corrente", () => {
    const vestidos = [
      vestirAcidente(acidente(), {}),
      vestirAcidente(acidente({ id: 2, data_hora: "2026-10-05T09:00" }), {}),
      vestirAcidente(acidente({ id: 3, status: "Encerrado" }), {})
    ];
    const stats = statsPainelHst(
      vestidos,
      [entrega(), entrega({ id: 2, data_entrega: "2026-10-11T09:00" })],
      [medicao(), medicao({ id: 2, data_medicao: "2026-10-12T08:00" })],
      [area(), area({ id: 2, ativo: false })],
      HOJE
    );
    expect(stats.acidentesMes).toBe(2);
    expect(stats.emInvestigacao).toBe(2);
    expect(stats.entregasMes).toBe(1);
    expect(stats.medicoesMes).toBe(1);
    expect(stats.areasAtivas).toBe(1);
  });

  test("colabsHta olha a ÚLTIMA medição de cada colaborador", () => {
    const stats = statsPainelHst(
      [],
      [],
      [
        medicao({ colaborador_nome: "A", data_medicao: "2026-11-01T08:00" }), // normal antiga
        medicao({ colaborador_nome: "A", sistolica: 150, data_medicao: "2026-11-10T08:00" }), // HTA recente
        medicao({ colaborador_nome: "B", data_medicao: "2026-11-09T08:00" }) // normal
      ],
      [],
      HOJE
    );
    expect(stats.colabsHta).toBe(1);
    expect(stats.colabsHtaLista[0].nome).toBe("A");
    expect(stats.colabsHtaLista[0].classificacao.texto).toBe("HTA Grau 1");
  });

  test("acção atrasada: passou o prazo sem estar concluída", () => {
    expect(accaoAtrasada(accao({ prazo: "2026-11-01" }), HOJE)).toBe(true);
    expect(accaoAtrasada(accao({ prazo: "2026-11-01", status: "Concluida" }), HOJE)).toBe(false);
    expect(accaoAtrasada(accao({ prazo: "2026-12-01" }), HOJE)).toBe(false);
    expect(accaoAtrasada(accao({ prazo: "" }), HOJE)).toBe(false);
  });

  test("alertas: HTA urgente, acções atrasadas, áreas críticas, e o vazio honesto", () => {
    const comTudo = alertasPainelHst(
      [medicao({ sistolica: 150 })],
      [accao({ prazo: "2026-11-01" })],
      [area({ nivel_risco: "Critico" })],
      HOJE
    );
    expect(comTudo.length).toBe(3);
    expect(comTudo[0].nivel).toBe("erro");
    expect(comTudo[0].badge).toBe("Urgente");
    expect(comTudo[1].badge).toBe("Atrasada");
    expect(comTudo[2].badge).toBe("Atenção");

    const vazio = alertasPainelHst([medicao()], [accao({ prazo: "2026-12-01" })], [area({ nivel_risco: "Baixo" })], HOJE);
    expect(vazio.length).toBe(1);
    expect(vazio[0].nivel).toBe("ok");
  });
});

/* ============ gráficos ============ */

describe("gráficos do painel", () => {
  test("acidentesPorTipo conta e ordena do maior para o menor", () => {
    const dados = acidentesPorTipo([
      acidente({ tipo_ocorrencia: "Incidente" }),
      acidente({ tipo_ocorrencia: "Incidente" }),
      acidente({ tipo_ocorrencia: "Acidente com Afastamento" })
    ]);
    expect(dados[0]).toEqual({ label: "Incidente", count: 2 });
    expect(dados[1]).toEqual({ label: "Acidente com Afastamento", count: 1 });
  });

  test("areasPorNivel ordena do Crítico para o Baixo e só conta activas", () => {
    const dados = areasPorNivel([
      area({ nivel_risco: "Baixo" }),
      area({ id: 2, nivel_risco: "Critico" }),
      area({ id: 3, nivel_risco: "Alto", ativo: false })
    ]);
    expect(dados.length).toBe(2);
    expect(dados[0].label).toBe("Critico");
    expect(dados[0].cls).toBe("bg-red-600");
    expect(dados[1].label).toBe("Baixo");
  });
});

/* ============ pesquisa e formatação ============ */

describe("pesquisa sem acentos e formatação", () => {
  test("alvoPesquisaAcidente acha sem acentos", () => {
    const alvo = alvoPesquisaAcidente(vestirAcidente(acidente({ descricao: "Correção na Serralharia" }), {}));
    expect(alvo).toContain("correcao");
    expect(alvo).toContain("serralharia");
  });
  test("fmtDataHst corta o ISO na mão (sem deslocar fuso)", () => {
    expect(fmtDataHst("2026-11-10T08:30")).toBe("10/11/2026");
    expect(fmtDataHst("2026-11-10T08:30", true)).toBe("10/11/2026 08:30");
    expect(fmtDataHst(null)).toBe("-");
  });
});

/* ============ resumo mensal ============ */

describe("indicadoresResumoMensal", () => {
  test("só conta o mês pedido e soma os dias de afastamento", () => {
    const d = indicadoresResumoMensal(
      [
        vestirAcidente(acidente({ dias_afastamento: 3 }), {}),
        vestirAcidente(
          acidente({ id: 2, dias_afastamento: 2, tipo_ocorrencia: "Acidente com Afastamento" }),
          {}
        ),
        vestirAcidente(acidente({ id: 3, data_hora: "2026-10-20T09:00" }), {})
      ],
      [entrega(), entrega({ id: 2, data_entrega: "2026-09-05T09:00" })],
      [medicao({ sistolica: 150, diastolica: 95 }), medicao({ id: 2, data_medicao: "2026-09-02T09:00" })],
      [accao({ prazo: "2026-10-30" }), accao({ id: 2, prazo: "2026-12-01" })],
      [area({ nivel_risco: "Critico" }), area({ id: 2, nivel_risco: "Baixo", ativo: false })],
      2026,
      11,
      "2026-11-13"
    );
    expect(d.acidentes.length).toBe(2);
    expect(d.comAfastamento).toBe(1);
    expect(d.diasAfastamento).toBe(5);
    expect(d.entregas.length).toBe(1);
    expect(d.medicoes.length).toBe(1);
    expect(d.acoesPendentes).toBe(2);
    expect(d.acoesAtrasadas).toBe(1);
    expect(d.areasAtivas).toBe(1);
    expect(d.colabsHta.length).toBe(1);
  });
});
