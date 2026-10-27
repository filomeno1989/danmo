/**
 * Testes lógicos do Plano de Férias: dias corridos, estados, limite por
 * setor/mês, juiz das alterações (com a viragem do ano), aviso prévio,
 * prazo do RH, email, feriados e o mapa de permissões das 4 páginas.
 */

import { expect, test, describe } from "bun:test";
import {
  MESES_FERIAS,
  ROTULO_ESTADO,
  addDiasISO,
  anoDoMesNovo,
  avaliarAviso,
  baseAviso,
  contasSetorMes,
  diasAtePrazoEnvio,
  diasEntre,
  estadoDaLinha,
  excedentes,
  feriadosDoAno,
  fimDe,
  mesValido,
  nomeMes,
  paraCSV,
  problemaAlteracao,
  proximosFeriados,
  setorDe,
  textoEmailRh,
  vivas,
  type FeriadoFerias,
  type LinhaPlano
} from "@/lib/ferias";
import { PAGINAS, labelPagina } from "@/lib/permissoes";

const linha = (campos: Partial<LinhaPlano>): LinhaPlano => ({
  id: "l1",
  ano: 2027,
  collaborator_id: 1,
  mes_previsto: 3,
  status: "Planeado",
  enviado_rh_em: null,
  enviado_rh_por: null,
  dias_rh: null,
  data_inicio: null,
  data_fim: null,
  obs_rh: null,
  ...campos
});

describe("Dias corridos (sábado e domingo contam)", () => {
  test("fim = início + dias - 1", () => {
    expect(fimDe("2027-03-01", 22)).toBe("2027-03-22");
    expect(fimDe("2027-03-01", 1)).toBe("2027-03-01");
  });
  test("atravessa o fim de semana sem saltar", () => {
    // 2027-03-05 é sexta: 5 dias corridos acabam terça 09 (sáb+dom contam)
    expect(fimDe("2027-03-05", 5)).toBe("2027-03-09");
  });
  test("sem dias ou sem início, sem fim", () => {
    expect(fimDe("2027-03-01", 0)).toBe("");
    expect(fimDe("", 22)).toBe("");
  });
  test("addDiasISO e diasEntre", () => {
    expect(addDiasISO("2027-12-30", 5)).toBe("2028-01-04");
    expect(diasEntre("2027-01-01", "2027-01-31")).toBe(30);
  });
});

describe("Estado da linha (calculado, nunca gravado)", () => {
  test("planeado: só o mês", () => {
    expect(estadoDaLinha(linha({}), "2027-02-10")).toBe("planeado");
  });
  test("aguarda RH: lista enviada", () => {
    expect(
      estadoDaLinha(linha({ enviado_rh_em: "2027-02-10" }), "2027-02-15")
    ).toBe("aguardaRH");
  });
  test("confirmado: dias + início do RH", () => {
    expect(
      estadoDaLinha(linha({ status: "Confirmado", dias_rh: 22, data_inicio: "2027-03-01", data_fim: "2027-03-22" }), "2027-02-15")
    ).toBe("confirmado");
  });
  test("em curso: hoje dentro do período", () => {
    expect(
      estadoDaLinha(linha({ dias_rh: 22, data_inicio: "2027-03-01", data_fim: "2027-03-22" }), "2027-03-10")
    ).toBe("emCurso");
  });
  test("gozadas: fim já passou", () => {
    expect(
      estadoDaLinha(linha({ dias_rh: 22, data_inicio: "2027-03-01", data_fim: "2027-03-22" }), "2027-04-01")
    ).toBe("gozadas");
  });
  test("rótulos legíveis", () => {
    expect(ROTULO_ESTADO.emCurso).toBe("Em curso");
    expect(ROTULO_ESTADO.aguardaRH).toBe("Aguarda RH");
  });
});

describe("Limite por setor/mês", () => {
  const colabs = [
    { id: 1, name: "A", code: "c1", categoria: null, setor: "Oficina" },
    { id: 2, name: "B", code: "c2", categoria: null, setor: "Oficina" },
    { id: 3, name: "C", code: "c3", categoria: null, setor: "Oficina" },
    { id: 4, name: "D", code: "c4", categoria: null, setor: "Stock" },
    { id: 5, name: "E", code: "c5", categoria: null, setor: null }
  ];
  const linhas = vivas(
    [
      linha({ id: "l1", collaborator_id: 1, mes_previsto: 3 }),
      linha({ id: "l2", collaborator_id: 2, mes_previsto: 3 }),
      linha({ id: "l3", collaborator_id: 3, mes_previsto: 3 }),
      linha({ id: "l4", collaborator_id: 4, mes_previsto: 3 }),
      linha({ id: "l5", collaborator_id: 5, mes_previsto: 4 })
    ],
    colabs
  );
  test("setorDe com e sem setor", () => {
    expect(setorDe(colabs[0])).toBe("Oficina");
    expect(setorDe(colabs[4])).toBe("Sem setor");
  });
  test("contas por setor+mes", () => {
    const contas = contasSetorMes(linhas);
    expect(contas.get("Oficina|3")).toBe(3);
    expect(contas.get("Stock|3")).toBe(1);
    expect(contas.get("Sem setor|4")).toBe(1);
  });
  test("excedentes com limite 2: Oficina|3 fica, Stock não", () => {
    const exc = excedentes(linhas, 2);
    expect(exc).toEqual([{ setor: "Oficina", mes: 3, qtd: 3 }]);
  });
  test("sem excedente com limite 3", () => {
    expect(excedentes(linhas, 3)).toEqual([]);
  });
});

describe("Juiz das alterações", () => {
  const ok = { tipo: "Adiamento", mesAnterior: 3, mesNovo: 5, motivo: "obra atrasou", temMes: true };
  test("passa quando tudo certo", () => {
    expect(problemaAlteracao(ok)).toBe("");
  });
  test("adiamento exige mês DEPOIS", () => {
    expect(problemaAlteracao({ ...ok, mesNovo: 3 })).toContain("DEPOIS");
    expect(problemaAlteracao({ ...ok, mesNovo: 2 })).toContain("DEPOIS");
  });
  test("antecipação exige mês ANTES", () => {
    const ant = { ...ok, tipo: "Antecipação", mesNovo: 1 };
    expect(problemaAlteracao(ant)).toBe("");
    expect(problemaAlteracao({ ...ant, mesNovo: 6 })).toContain("ANTES");
  });
  test("motivo é obrigatório", () => {
    expect(problemaAlteracao({ ...ok, motivo: "  " })).toContain("motivo");
  });
  test("sem mês marcado nem mês novo não passa", () => {
    expect(problemaAlteracao({ ...ok, temMes: false })).toContain("não tem mês");
    expect(problemaAlteracao({ ...ok, mesNovo: 0 })).toContain("mês novo");
    expect(problemaAlteracao({ ...ok, tipo: "Troca" })).toContain("Adiamento ou Antecipação");
  });
});

describe("Viragem do ano nas alterações (defeito do hub corrigido)", () => {
  test("Dez -> Janeiro seguinte muda de folha", () => {
    expect(anoDoMesNovo(2026, "Adiamento", 12, 1)).toBe(2027);
  });
  test("Janeiro -> Dezembro anterior muda de folha", () => {
    expect(anoDoMesNovo(2026, "Antecipação", 1, 12)).toBe(2025);
  });
  test("dentro do mesmo ano não muda", () => {
    expect(anoDoMesNovo(2026, "Adiamento", 3, 8)).toBe(2026);
  });
});

describe("Aviso prévio", () => {
  test("base: início gravado quando existe", () => {
    expect(baseAviso(2027, 3, "2027-03-10")).toBe("2027-03-10");
  });
  test("base: 1.º dia do mês previsto quando não há início", () => {
    expect(baseAviso(2027, 3, null)).toBe("2027-03-01");
  });
  test("30 dias de aviso: fronteira certa", () => {
    expect(avaliarAviso("2027-01-01", "2027-01-31", 30).ok).toBe(true);
    expect(avaliarAviso("2027-01-02", "2027-01-31", 30).ok).toBe(false);
  });
});

describe("Prazo de envio ao RH", () => {
  test("10 dias antes do 1.º do mês", () => {
    expect(diasAtePrazoEnvio("2027-01-21", 2, 10)).toBe(1);
  });
  test("negativo quando o prazo já passou", () => {
    expect(diasAtePrazoEnvio("2027-01-25", 2, 10)).toBeLessThan(0);
  });
  test("mês passado do ano em curso: alvo é o ano seguinte", () => {
    const f = diasAtePrazoEnvio("2027-12-20", 1, 10);
    expect(f).toBeGreaterThan(0);
  });
});

describe("Email para o RH central (modelo do hub)", () => {
  test("assunto, lista numerada e fecho", () => {
    const txt = textoEmailRh(
      2027,
      3,
      [
        { nome: "Ana Beira Utils", codigo: "DM0002", categoria: "Assistente", setor: "Stock" },
        { nome: "João Testador", codigo: null, categoria: null, setor: "Oficina" }
      ],
      "Filomeno"
    );
    expect(txt).toContain("Assunto: Férias - colaboradores do mês de Março de 2027");
    expect(txt).toContain("1. Ana Beira Utils (DM0002) - Assistente - Stock");
    expect(txt).toContain("2. João Testador - - - Oficina");
    expect(txt).toContain("dias de direito");
    expect(txt).toContain("Filomeno - Danmo Services");
  });
});

describe("Feriados", () => {
  const feriados: FeriadoFerias[] = [
    { id: "f1", data: "2000-05-01", descricao: "Dia do Trabalhador", recorrente: true },
    { id: "f2", data: "2027-03-15", descricao: "Eid al-Fitr", recorrente: false }
  ];
  test("recorrente expande para o ano pedido", () => {
    const l = feriadosDoAno(feriados, 2027);
    expect(l).toContainEqual({ data: "2027-05-01", descricao: "Dia do Trabalhador" });
    expect(l).toContainEqual({ data: "2027-03-15", descricao: "Eid al-Fitr" });
    expect(feriadosDoAno(feriados, 2025).length).toBe(1);
  });
  test("próximos a partir de hoje, por ordem", () => {
    const p = proximosFeriados(feriados, "2027-03-01", 2);
    expect(p[0].data).toBe("2027-03-15");
    expect(p[1].data).toBe("2027-05-01");
  });
});

describe("Validações soltas", () => {
  test("mesValido", () => {
    expect(mesValido(3)).toBe(3);
    expect(mesValido("7")).toBe(7);
    expect(mesValido(0)).toBeNull();
    expect(mesValido(13)).toBeNull();
    expect(mesValido(null)).toBeNull();
  });
  test("nomeMes", () => {
    expect(nomeMes(1)).toBe("Janeiro");
    expect(nomeMes(12)).toBe("Dezembro");
    expect(nomeMes(13)).toBe("");
    expect(MESES_FERIAS.length).toBe(12);
  });
  test("paraCSV escapa ponto e vírgula, quebra de linha e aspas", () => {
    const csv = paraCSV(["A", "B"], [["x;y", 'diz "oi"\nagora']]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"x;y"');
    expect(csv).toContain('"diz ""oi""\nagora"');
  });
});

describe("Férias no mapa de permissões", () => {
  test("4 páginas reais com prefixo na matriz", () => {
    const fe = PAGINAS.filter((p) => p.pagina.startsWith("ferias"));
    expect(fe.length).toBe(4);
    expect(labelPagina("ferias.plano")).toContain("Férias - ");
    expect(labelPagina("ferias.mes")).toContain("Folha do Mês");
  });
});
