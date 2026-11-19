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
  campanhaTensao,
  classificarTensao,
  csvTensao,
  diaTensao,
  diasDeCampanha,
  eHta,
  estatisticaMedicacao,
  filtroMembrosRelatorio,
  fmtDataHst,
  indicadoresResumoMensal,
  medicoesNoPeriodo,
  numeroFmtHst,
  partirNumeroHst,
  pontosGraficoTensao,
  problemaAccao,
  problemaAcidente,
  problemaArea,
  problemaDatasCampanha,
  problemaEpi,
  problemaEntrega,
  problemaValoresTensao,
  proximoNumeroCampanha,
  proximoNumeroHst,
  resumoCampanha,
  resumoTensaoPeriodo,
  rotuloCampanha,
  rotuloCurtoTensao,
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

/* ============ controlo de tensão: período, campanha e CSV ============ */

describe("medicoesNoPeriodo", () => {
  test("intervalo fechado nos dois lados (a medição da fronteira entra)", () => {
    const lista = [
      medicao({ id: 1, data_medicao: "2026-11-01T08:00" }),
      medicao({ id: 2, data_medicao: "2026-11-05T09:30" }),
      medicao({ id: 3, data_medicao: "2026-11-13T07:10" }),
      medicao({ id: 4, data_medicao: "2026-10-31T22:00" }),
      medicao({ id: 5, data_medicao: "2026-11-14T08:00" })
    ];
    const dentro = medicoesNoPeriodo(lista, "2026-11-01", "2026-11-13");
    expect(dentro.map((m) => m.id).sort()).toEqual([1, 2, 3]);
  });
  test("limites vazios = tudo, e sem data fica de fora", () => {
    const lista = [
      medicao({ id: 1, data_medicao: "2026-11-01T08:00" }),
      medicao({ id: 2, data_medicao: null }),
      medicao({ id: 3, data_medicao: "2025-01-02T08:00" })
    ];
    expect(medicoesNoPeriodo(lista, "", "").length).toBe(2);
    expect(medicoesNoPeriodo(lista, "2026-11-01", "").map((m) => m.id)).toEqual([1]);
  });
});

describe("resumoTensaoPeriodo", () => {
  test("contagens, médias e percentagem de HTA", () => {
    const r = resumoTensaoPeriodo([
      medicao({ id: 1, sistolica: 120, diastolica: 80, data_medicao: "2026-11-12T08:00" }),
      medicao({ id: 2, colaborador_nome: "Olindo", sistolica: 150, diastolica: 95, data_medicao: "2026-11-12T09:00" }),
      medicao({ id: 3, sistolica: 140, diastolica: 90, data_medicao: "2026-11-13T08:00" })
    ]);
    expect(r.total).toBe(3);
    expect(r.pessoas).toBe(2);
    expect(r.mediaSys).toBe(137); // 120+150+140=410/3
    expect(r.mediaDia).toBe(88); // 80+95+90=265/3
    expect(r.medicoesHta).toBe(2); // 150/95 e 140/90
    expect(r.pctHta).toBe(67);
    expect(r.diasComMedicao).toBe(2);
  });
  test("período vazio: zeros, nunca NaN", () => {
    const r = resumoTensaoPeriodo([]);
    expect(r.total).toBe(0);
    expect(r.mediaSys).toBe(0);
    expect(r.pctHta).toBe(0);
  });
});

describe("campanhaTensao", () => {
  test("só entra quem tem a ÚLTIMA medição alta; medido hoje sai do estado por_medir", () => {
    const fila = campanhaTensao(
      [
        medicao({ id: 1, colaborador_nome: "Olindo", sistolica: 150, diastolica: 95, data_medicao: "2026-11-13T09:00" }),
        medicao({ id: 2, colaborador_nome: "Filomeno", sistolica: 120, diastolica: 80, data_medicao: "2026-11-13T08:00" }),
        medicao({ id: 3, colaborador_nome: "Helena", sistolica: 160, diastolica: 100, data_medicao: "2026-11-11T08:00" })
      ],
      "2026-11-13"
    );
    // Olindo (150/95 hoje) e Helena (160/100 há 2 dias) estão na fila; Filomeno normal fica fora.
    expect(fila.map((p) => p.nome)).toEqual(["Helena", "Olindo"]);
    expect(fila[0].estado).toBe("por_medir");
    expect(fila[0].diasSemMedir).toBe(2);
    expect(fila[1].estado).toBe("medido_hoje");
    expect(fila[1].diasSemMedir).toBe(0);
  });
  test("medição antiga HTA atrás de uma normal recente TIRA a pessoa da fila", () => {
    const fila = campanhaTensao(
      [
        medicao({ id: 1, colaborador_nome: "Olindo", sistolica: 170, diastolica: 105, data_medicao: "2026-10-01T08:00" }),
        medicao({ id: 2, colaborador_nome: "Olindo", sistolica: 118, diastolica: 76, data_medicao: "2026-11-12T08:00" })
      ],
      "2026-11-13"
    );
    expect(fila.length).toBe(0);
  });
  test("medição do futuro não dá dias negativos", () => {
    const fila = campanhaTensao(
      [medicao({ id: 1, colaborador_nome: "X", sistolica: 150, diastolica: 95, data_medicao: "2026-11-20T08:00" })],
      "2026-11-13"
    );
    expect(fila[0].diasSemMedir).toBe(0);
    expect(fila[0].estado).toBe("por_medir");
  });
});

describe("csvTensao", () => {
  test("cabeçalho, BOM, data/hora separados e escapes", () => {
    const csv = csvTensao([
      medicao({
        id: 7,
        colaborador_nome: "Olindo; Filho",
        sistolica: 150,
        diastolica: 95,
        frequencia_cardiaca: null,
        observacoes: "Dor de cabeça \"forte\"",
        data_medicao: "2026-11-12T08:55"
      })
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM
    const linhas = csv.slice(1).split("\n");
    expect(linhas[0]).toBe("Data;Hora;Colaborador;Sistolica;Diastolica;FC (bpm);Classificacao;Medido por;Observacoes");
    expect(linhas[1]).toContain("12/11/2026;08:55");
    expect(linhas[1]).toContain('"Olindo; Filho"');
    expect(linhas[1]).toContain('"Dor de cabeça ""forte"""');
    expect(linhas[1]).toContain("150;95;;");
    expect(linhas[1]).toContain("HTA Grau 1"); // classificação recalculada quando gravada errada
  });
});

describe("diaTensao", () => {
  test("corta o ISO no dia sem deslocar fuso", () => {
    expect(diaTensao("2026-11-13T08:55:00.718Z")).toBe("2026-11-13");
    expect(diaTensao(null)).toBe("");
  });
});

describe("resumoCampanha: a % conta SOBRE o pessoal da campanha", () => {
  const HOJE = "2026-11-14";
  const membros = [
    { colaborador_nome: "Olindo" },
    { colaborador_nome: "Filomeno" },
    { colaborador_nome: "Novato" }
  ];
  const medicoes = [
    medicao({ id: 1, colaborador_nome: "Olindo", sistolica: 150, diastolica: 90, data_medicao: "2026-11-12T09:00" }),
    medicao({ id: 2, colaborador_nome: "Filomeno", sistolica: 125, diastolica: 82, data_medicao: `${HOJE}T08:00` }),
    medicao({ id: 3, colaborador_nome: "Fora da campanha", sistolica: 190, diastolica: 120, data_medicao: `${HOJE}T08:30` })
  ];
  const r = resumoCampanha(membros, medicoes, HOJE);

  test("total = 3 membros; quem está fora da campanha NÃO entra", () => {
    expect(r.total).toBe(3);
  });
  test("comHta = 1 e pctHta = 33% da campanha (o 190/120 de fora não conta)", () => {
    expect(r.comHta).toBe(1);
    expect(r.pctHta).toBe(33);
  });
  test("fila só com o Olindo (última alta, por medir há 2 dias)", () => {
    expect(r.fila.length).toBe(1);
    expect(r.fila[0].nome).toBe("Olindo");
    expect(r.fila[0].estado).toBe("por_medir");
    expect(r.fila[0].diasSemMedir).toBe(2);
  });
  test("medidosHoje = 1 (Filomeno mediu hoje)", () => {
    expect(r.medidosHoje).toBe(1);
  });
  test("emControlo = Filomeno; semMedicao = Novato", () => {
    expect(r.emControlo.map((m) => m.nome)).toEqual(["Filomeno"]);
    expect(r.semMedicao).toEqual(["Novato"]);
  });
  test("campanha vazia: tudo a zero sem rebentar", () => {
    const v = resumoCampanha([], medicoes, HOJE);
    expect(v.total).toBe(0);
    expect(v.pctHta).toBe(0);
    expect(v.fila).toEqual([]);
  });
});

describe("estatisticaMedicacao: desde o início vs. antes", () => {
  const medicoes = [
    medicao({ id: 1, sistolica: 150, diastolica: 95, data_medicao: "2026-08-01T08:00" }),
    medicao({ id: 2, sistolica: 160, diastolica: 100, data_medicao: "2026-09-04T08:00" }),
    medicao({ id: 3, sistolica: 135, diastolica: 85, data_medicao: "2026-09-05T08:00" }),
    medicao({ id: 4, sistolica: 128, diastolica: 82, data_medicao: "2026-09-20T08:00" })
  ];
  test("desde 05/09: 2 medições, média 132/84, 0 altas; antes: 2, média 155/98, 2 altas", () => {
    const est = estatisticaMedicacao(medicoes, "2026-09-05")!;
    expect(est.desde.total).toBe(2);
    expect(est.desde.mediaSys).toBe(132);
    expect(est.desde.mediaDia).toBe(84);
    expect(est.desde.alta).toBe(0);
    expect(est.desde.pctAlta).toBe(0);
    expect(est.antes.total).toBe(2);
    expect(est.antes.mediaSys).toBe(155);
    expect(est.antes.mediaDia).toBe(98);
    expect(est.antes.alta).toBe(2);
  });
  test("sem medições depois do início da medicação: null", () => {
    expect(estatisticaMedicacao(medicoes, "2026-11-01")).toBeNull();
  });
  test("média desde o início abaixo da anterior = tendência de melhoria", () => {
    const est = estatisticaMedicacao(medicoes, "2026-09-05")!;
    expect(est.desde.mediaSys < est.antes.mediaSys).toBe(true);
  });
});

describe("pontosGraficoTensao: o gráfico comparativo", () => {
  const asc = [
    medicao({ id: 1, sistolica: 120, diastolica: 80, data_medicao: "2026-11-01T08:00" }),
    medicao({ id: 2, sistolica: 150, diastolica: 95, data_medicao: "2026-11-05T08:00" }),
    medicao({ id: 3, sistolica: 135, diastolica: 85, data_medicao: "2026-11-10T08:00" })
  ];
  const g = pontosGraficoTensao(asc, 760, 240);

  test("as duas linhas com o mesmo número de pontos", () => {
    expect(g.sys.length).toBe(3);
    expect(g.dia.length).toBe(3);
  });
  test("as linhas de corte 140/90 ficam dentro da escala", () => {
    expect(g.escalaMin).toBeLessThanOrEqual(90);
    expect(g.escalaMax).toBeGreaterThanOrEqual(140);
    // Em SVG o Y cresce para baixo: o corte de 140 fica ACIMA (menor y) do de 90.
    expect(g.yLimiarSys).toBeLessThan(g.yLimiarDia);
  });
  test("pontos em ordem crescente de X e rótulos dd/mm", () => {
    const xs = g.sys.map((p) => p.x);
    expect(xs[0]).toBeLessThan(xs[1]);
    expect(xs[1]).toBeLessThan(xs[2]);
    expect(g.rotulos.length).toBeGreaterThanOrEqual(1);
    expect(g.rotulos.every((r) => /^\d{2}\/\d{2}$/.test(r.texto))).toBe(true);
  });
  test("um valor altíssimo não corta o gráfico (a escala acompanha)", () => {
    const g2 = pontosGraficoTensao([
      medicao({ id: 9, sistolica: 250, diastolica: 140, data_medicao: "2026-11-01T08:00" })
    ]);
    expect(g2.escalaMax).toBeGreaterThanOrEqual(250);
    expect(g2.yLimiarSys).toBeLessThan(g2.yLimiarDia);
    expect(g2.yTicks.every((t) => t.y >= 0 && t.y <= 240)).toBe(true);
  });
  test("rotuloCurtoTensao corta dd/mm do que está gravado", () => {
    expect(rotuloCurtoTensao("2026-11-05T08:00")).toBe("05/11");
    expect(rotuloCurtoTensao("")).toBe("");
  });
});

describe("campanhas numeradas (Fase 11)", () => {
  test("rótulo com 2 dígitos: Campanha 01, Campanha 02, Campanha 12", () => {
    expect(rotuloCampanha(1)).toBe("Campanha 01");
    expect(rotuloCampanha(2)).toBe("Campanha 02");
    expect(rotuloCampanha(12)).toBe("Campanha 12");
  });
  test("próximo número NUNCA reusa: sem histórico = 1, depois do 1 = 2", () => {
    expect(proximoNumeroCampanha(undefined)).toBe(1);
    expect(proximoNumeroCampanha(0)).toBe(1);
    expect(proximoNumeroCampanha(1)).toBe(2);
    expect(proximoNumeroCampanha(7)).toBe(8);
  });
  test("dia da campanha: o dia de abertura é o dia 1", () => {
    expect(diasDeCampanha("2026-11-01", "2026-11-01")).toBe(1);
    expect(diasDeCampanha("2026-11-01", "2026-11-14")).toBe(14);
  });
  test("datas malucas: início futuro ou ausente = 0 (sem rebentar)", () => {
    expect(diasDeCampanha("2026-11-30", "2026-11-14")).toBe(0);
    expect(diasDeCampanha(null, "2026-11-14")).toBe(0);
    expect(diasDeCampanha("", "2026-11-14")).toBe(0);
  });
});

describe("datas geridas e relatório da campanha (Fase 12)", () => {
  test("datas boas passam; fim antes do início e formato mau são apanhados", () => {
    expect(problemaDatasCampanha("2026-11-01")).toBe(null);
    expect(problemaDatasCampanha("2026-11-01", "2026-11-19")).toBe(null);
    expect(problemaDatasCampanha("2026-11-01", "2026-10-01")).toContain("não pode ser antes");
    expect(problemaDatasCampanha("")).toContain("AAAA-MM-DD");
    expect(problemaDatasCampanha("11/01/2026")).toContain("AAAA-MM-DD");
    expect(problemaDatasCampanha("2026-11-01", "fim maluco")).toContain("válida");
  });
  test("relatório da campanha ABERTA: só quem está nela agora (o tirado não entra)", () => {
    expect(filtroMembrosRelatorio({ id: "c0", estado: "aberta", fim: null })).toBe(
      "campanha_id=eq.c0&ativo=eq.true"
    );
  });
  test("relatório da campanha ARQUIVADA: quem estava no arquivo fica; quem saiu antes, não", () => {
    expect(filtroMembrosRelatorio({ id: "c9", estado: "arquivada", fim: "2026-11-18" })).toBe(
      "campanha_id=eq.c9&or=(ativo.eq.true,fim.eq.2026-11-18)"
    );
    expect(filtroMembrosRelatorio({ id: "c9", estado: "arquivada", fim: null })).toBe(
      "campanha_id=eq.c9&ativo=eq.true"
    );
  });
});
