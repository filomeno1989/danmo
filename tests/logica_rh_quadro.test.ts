/**
 * Testes da logica pura do QUADRO DE PESSOAL (RH): tempos de servico
 * (incluindo as parcelas do transferido), estado do estagio, codigos
 * sugeridos, classificacao de empresa, validacao da ficha, filtros e
 * resumo do painel. Correm com: bun test tests/logica_rh_quadro.test.ts
 */

import { describe, expect, test } from "bun:test";

const {
  normalizar,
  normalizarCodigo,
  tempoServico,
  tempoLongo,
  idadeAnos,
  classificarEmpresa,
  estadoEstagio,
  estagioATerminar,
  inicioServico,
  tempoDeCasa,
  temposTransferido,
  proximoCodigo,
  problemaDaFicha,
  payloadDaFicha,
  resumoQuadro,
  filtrarQuadro,
  iniciais,
  ESTADOS_CIVIS,
  fotosParaGrelha
} = await import("@/lib/rh");
import type { Colaborador, DadosFicha } from "@/lib/rh";

const HOJE = "2026-10-22";

const fichaBase = (parcial: Partial<Colaborador> = {}): Colaborador => ({
  id: 1,
  code: "DM0001",
  name: "Fulano Teste",
  categoria: "Mecânico",
  setor: null,
  department: null,
  active: true,
  tipo_colaborador: "efetivo",
  tipo_vinculo: "contratado",
  empresa: "porto",
  empresa_origem: null,
  data_admissao_danmo: "2020-01-15",
  data_admissao_grupo: null,
  data_admissao: null,
  data_inativo: null,
  data_nascimento: null,
  naturalidade: null,
  estado_civil: null,
  endereco: null,
  num_dependentes: 0,
  mes_ferias: null,
  bi_numero: null,
  inss_numero: null,
  nuit_numero: null,
  contacto_1: null,
  contacto_2: null,
  contacto: null,
  email: null,
  grupo_sanguineo: null,
  doenca_cronica: null,
  altura_cm: null,
  observacoes_gerais: null,
  estagio_instituicao: null,
  estagio_orientador: null,
  estagio_data_inicio: null,
  estagio_data_fim: null,
  estagio_resultado: null,
  funcao_grupo: null,
  faz_turno: false,
  grupo_id: null,
  created_at: null,
  ...parcial
});

const dadosBase = (parcial: Partial<DadosFicha> = {}): DadosFicha => ({
  code: "DM0300",
  name: "Fulano Teste",
  categoria: "Mecânico",
  setor: "Mecânica",
  empresa: "porto",
  tipo_colaborador: "efetivo",
  tipo_vinculo: "contratado",
  empresa_origem: "",
  data_admissao_danmo: "2026-01-01",
  data_admissao_grupo: "",
  estagio_instituicao: "",
  estagio_orientador: "",
  estagio_data_inicio: "",
  estagio_data_fim: "",
  active: true,
  data_inativo: "",
  data_nascimento: "",
  naturalidade: "",
  estado_civil: "",
  endereco: "",
  num_dependentes: "",
  mes_ferias: "",
  bi_numero: "",
  inss_numero: "",
  nuit_numero: "",
  contacto_1: "",
  contacto_2: "",
  email: "",
  grupo_sanguineo: "",
  doenca_cronica: "",
  altura_cm: "",
  observacoes_gerais: "",
  ...parcial
});

describe("Tempos de servico", () => {
  test("tempo curto com anos e meses", () => {
    expect(tempoServico("2020-01-15", "2024-03-15")).toBe("4a 2m");
  });

  test("tempo curto sem fim conta ate hoje", () => {
    expect(tempoServico("2026-09-01", HOJE)).toBe("0a 1m");
  });

  test("tempo curto sem inicio devolve travessao curto", () => {
    expect(tempoServico(null)).toBe("-");
  });

  test("tempo longo com dias emprestados como no hub", () => {
    // de 15/01 a 14/03: 1 mes (15/01-15/02) e 29 dias emprestam 30
    expect(tempoLongo("2020-01-15", "2021-03-14")).toBe("1 ano, 1 mes e 29 dias");
  });

  test("tempo longo exacto", () => {
    expect(tempoLongo("2020-01-15", "2021-01-15")).toBe("1 ano, 0 meses e 0 dias");
  });

  test("fim antes do inicio nao rebenta", () => {
    expect(tempoLongo("2021-01-01", "2020-01-01")).toBe("0 anos, 0 meses e 0 dias");
    expect(tempoServico("2021-01-01", "2020-01-01")).toBe("0a 0m");
  });

  test("idade em anos completos", () => {
    expect(idadeAnos("2000-10-21", HOJE)).toBe("26");
    expect(idadeAnos("2000-10-23", HOJE)).toBe("25");
    expect(idadeAnos(null, HOJE)).toBe("");
  });
});

describe("Empresa (as duas listas)", () => {
  test("classifica a partir da empresa_origem antiga", () => {
    expect(classificarEmpresa("Porto")).toBe("porto");
    expect(classificarEmpresa("TCM")).toBe("danmo");
    expect(classificarEmpresa("tcm ")).toBe("danmo");
    expect(classificarEmpresa("Mesquita Transitários")).toBe(null);
    expect(classificarEmpresa(null)).toBe(null);
  });
});

describe("Estagios", () => {
  test("estagiario a decorrer conta os dias que faltam", () => {
    const c = fichaBase({
      tipo_colaborador: "estagiario",
      estagio_data_inicio: "2026-04-01",
      estagio_data_fim: "2026-10-28"
    });
    const s = estadoEstagio(c, HOJE);
    expect(s).toEqual({ situacao: "a_decorrer", dias: 6 });
    expect(estagioATerminar(c, 30)).toBe(true);
    expect(estagioATerminar(c, 5)).toBe(false);
  });

  test("terminado sem decisao marca o atraso", () => {
    const c = fichaBase({
      tipo_colaborador: "estagiario",
      estagio_data_fim: "2026-10-01"
    });
    const s = estadoEstagio(c, HOJE);
    expect(s).toEqual({ situacao: "terminado", diasAtraso: 21 });
    expect(estagioATerminar(c)).toBe(true);
  });

  test("decisao ficada muda a situacao e sai do aviso", () => {
    const promovido = fichaBase({
      tipo_colaborador: "estagiario",
      estagio_data_fim: "2026-10-01",
      estagio_resultado: "promovido"
    });
    expect(estadoEstagio(promovido, HOJE)).toEqual({ situacao: "promovido" });
    expect(estagioATerminar(promovido)).toBe(false);

    const fora = fichaBase({
      tipo_colaborador: "estagiario",
      estagio_data_fim: "2026-10-01",
      estagio_resultado: "nao_permaneceu",
      active: false,
      data_inativo: "2026-10-02"
    });
    expect(estadoEstagio(fora, HOJE)).toEqual({ situacao: "nao_permaneceu" });
    expect(estagioATerminar(fora)).toBe(false);
  });

  test("efetivo nunca tem estado de estagio", () => {
    expect(estadoEstagio(fichaBase(), HOJE)).toBe(null);
  });

  test("inicio de servico do estagiario e o inicio do estagio", () => {
    const c = fichaBase({
      tipo_colaborador: "estagiario",
      estagio_data_inicio: "2026-04-01",
      data_admissao_danmo: null
    });
    expect(inicioServico(c)).toBe("2026-04-01");
    expect(tempoDeCasa(c)).toBe("0a 6m");
  });
});

describe("Transferidos do grupo", () => {
  test("parcelas separadas: antes da Danmo e total", () => {
    const c = fichaBase({
      tipo_vinculo: "transferido",
      empresa_origem: "TCM",
      data_admissao_grupo: "2018-03-10",
      data_admissao_danmo: "2022-03-10"
    });
    const p = temposTransferido(c);
    expect(p).not.toBe(null);
    expect(p!.antes).toBe("4 anos, 0 meses e 0 dias");
    // total conta de 2018-03-10 ate hoje (2026-10-22): 8a 7m 12d
    expect(p!.total).toBe("8 anos, 7 meses e 12 dias");
  });

  test("contratado directo nao tem parcelas", () => {
    expect(temposTransferido(fichaBase())).toBe(null);
  });

  test("estagiario nunca entra como transferido", () => {
    const c = fichaBase({
      tipo_colaborador: "estagiario",
      tipo_vinculo: "transferido",
      data_admissao_grupo: "2018-03-10"
    });
    expect(temposTransferido(c)).toBe(null);
  });

  test("tempo de casa do transferido conta so na Danmo", () => {
    const c = fichaBase({
      tipo_vinculo: "transferido",
      data_admissao_grupo: "2018-03-10",
      data_admissao_danmo: "2022-03-10"
    });
    expect(tempoDeCasa(c)).toBe("4a 7m");
  });
});

describe("Codigos sugeridos", () => {
  test("proximo DM salta o maximo", () => {
    expect(proximoCodigo(["DM0001", "DM0268", "DM0009"], "efetivo")).toBe("DM0269");
  });

  test("proximo EST com formatos antigos com espaco", () => {
    expect(proximoCodigo(["EST001", "EST 03", "EST 06"], "estagiario")).toBe("EST007");
  });

  test("normalizarCodigo tira espacos e maiusculas", () => {
    expect(normalizarCodigo("est 01")).toBe("EST01");
    expect(normalizar("José Chingueture")).toBe("jose chingueture");
  });

  test("sem colisao quando falta um numero do meio", () => {
    expect(proximoCodigo(["DM0001", "DM0003"], "efetivo")).toBe("DM0004");
  });
});

describe("Validacao da ficha", () => {
  test("ficha valida nao tem problema", () => {
    expect(problemaDaFicha(dadosBase())).toBe(null);
  });

  test("campos obrigatorios", () => {
    expect(problemaDaFicha(dadosBase({ name: "" }))).toContain("nome");
    expect(problemaDaFicha(dadosBase({ categoria: "" }))).toContain("funcao");
    expect(problemaDaFicha(dadosBase({ empresa: "" }))).toContain("empresa");
    expect(problemaDaFicha(dadosBase({ code: "" }))).toContain("codigo");
    expect(problemaDaFicha(dadosBase({ data_admissao_danmo: "" }))).toContain("admissao");
  });

  test("transferido exige origem e data no grupo", () => {
    expect(problemaDaFicha(dadosBase({ tipo_vinculo: "transferido" }))).toContain("origem");
    expect(
      problemaDaFicha(dadosBase({ tipo_vinculo: "transferido", empresa_origem: "TCM" }))
    ).toContain("grupo");
    expect(
      problemaDaFicha(
        dadosBase({
          tipo_vinculo: "transferido",
          empresa_origem: "TCM",
          data_admissao_grupo: "2026-12-31"
        })
      )
    ).toContain("depois");
  });

  test("estagiario exige inicio e fim previsto, fim depois do inicio", () => {
    const e = { tipo_colaborador: "estagiario", data_admissao_danmo: "" };
    expect(problemaDaFicha(dadosBase(e))).toContain("inicio");
    expect(
      problemaDaFicha(dadosBase({ ...e, estagio_data_inicio: "2026-04-01" }))
    ).toContain("fim");
    expect(
      problemaDaFicha(
        dadosBase({
          ...e,
          estagio_data_inicio: "2026-04-01",
          estagio_data_fim: "2026-03-01"
        })
      )
    ).toContain("depois");
    expect(
      problemaDaFicha(
        dadosBase({
          ...e,
          estagio_data_inicio: "2026-04-01",
          estagio_data_fim: "2026-09-30"
        })
      )
    ).toBe(null);
  });

  test("inactivo exige data de desvinculamento", () => {
    expect(problemaDaFicha(dadosBase({ active: false }))).toContain("desvinculamento");
    expect(problemaDaFicha(dadosBase({ active: false, data_inativo: "2026-10-01" }))).toBe(null);
  });

  test("payload separa estagiario de efetivo e limpa campos", () => {
    const p = payloadDaFicha(
      dadosBase({
        tipo_colaborador: "estagiario",
        data_admissao_danmo: "2020-01-01",
        estagio_data_inicio: "2026-04-01",
        estagio_data_fim: "2026-09-30",
        estagio_instituicao: "IPB",
        code: "est 07"
      })
    );
    expect(p.tipo_colaborador).toBe("estagiario");
    expect(p.tipo_vinculo).toBe(null);
    expect(p.data_admissao_danmo).toBe(null);
    expect(p.estagio_instituicao).toBe("IPB");
    expect(p.code).toBe("EST07");

    const t = payloadDaFicha(
      dadosBase({
        tipo_vinculo: "transferido",
        empresa_origem: " TCM ",
        data_admissao_grupo: "2018-03-10",
        num_dependentes: "3",
        altura_cm: "172,5"
      })
    );
    expect(t.empresa_origem).toBe("TCM");
    expect(t.data_admissao_grupo).toBe("2018-03-10");
    expect(t.num_dependentes).toBe(3);
    expect(t.altura_cm).toBe(172.5);
    expect(t.empresa).toBe("porto");
  });
});

describe("Resumo e filtros do painel", () => {
  const lista = [
    fichaBase({ id: 1, name: "Ana Porto", empresa: "porto" }),
    fichaBase({ id: 2, name: "Bruno TCM", empresa: "danmo" }),
    fichaBase({ id: 3, name: "Cláudio Sem", empresa: null }),
    fichaBase({
      id: 4,
      name: "Diana Estagio",
      empresa: "porto",
      tipo_colaborador: "estagiario",
      estagio_data_inicio: "2026-04-01",
      estagio_data_fim: "2026-11-05"
    }),
    fichaBase({
      id: 5,
      name: "Edu Saiu",
      empresa: "porto",
      active: false,
      data_inativo: "2026-05-01"
    })
  ];

  test("resumo separa as duas listas e os avisos", () => {
    const r = resumoQuadro(lista);
    expect(r.total).toBe(5);
    expect(r.activos).toBe(4);
    expect(r.inactivos).toBe(1);
    expect(r.porto).toBe(3);
    expect(r.danmo).toBe(1);
    expect(r.semClassificar).toBe(1);
    expect(r.estagiarios).toBe(1);
    expect(r.estagiosATerminar).toBe(1);
  });

  test("pesquisa sem acentos encontra Cláudio por claudio", () => {
    const f = filtrarQuadro(lista, { texto: "claudio", empresa: "", estado: "", tipo: "", vinculo: "" });
    expect(f).toHaveLength(1);
    expect(f[0].name).toBe("Cláudio Sem");
  });

  test("filtro por empresa e por estado", () => {
    const fPorto = filtrarQuadro(lista, { texto: "", empresa: "porto", estado: "", tipo: "", vinculo: "" });
    expect(fPorto.map((c) => c.id).sort()).toEqual([1, 4, 5]);
    const fSem = filtrarQuadro(lista, { texto: "", empresa: "sem", estado: "", tipo: "", vinculo: "" });
    expect(fSem.map((c) => c.id)).toEqual([3]);
    const fIna = filtrarQuadro(lista, { texto: "", empresa: "", estado: "inactivos", tipo: "", vinculo: "" });
    expect(fIna.map((c) => c.id)).toEqual([5]);
  });

  test("filtro por tipo e vinculo", () => {
    const fEst = filtrarQuadro(lista, { texto: "", empresa: "", estado: "", tipo: "estagiario", vinculo: "" });
    expect(fEst.map((c) => c.id)).toEqual([4]);
    const fTransf = filtrarQuadro(lista, { texto: "", empresa: "", estado: "", tipo: "", vinculo: "transferido" });
    expect(fTransf).toHaveLength(0);
  });

  test("iniciais do avatar", () => {
    expect(iniciais("Filomeno Alexandre")).toBe("FA");
    expect(iniciais("Mesquita")).toBe("M");
    expect(iniciais(null)).toBe("?");
  });
});

describe("Fotos da grelha e estados civis", () => {
  test("ESTADOS_CIVIS tem a uniao de facto com os antigos", () => {
    expect(ESTADOS_CIVIS).toContain("União de facto");
    expect(ESTADOS_CIVIS).toContain("Solteiro(a)");
    expect(ESTADOS_CIVIS).toContain("Casado(a)");
    expect(ESTADOS_CIVIS).toContain("Divorciado(a)");
    expect(ESTADOS_CIVIS).toContain("Viuvo(a)");
    expect(new Set(ESTADOS_CIVIS).size).toBe(ESTADOS_CIVIS.length);
  });

  test("mini ganha e fica ordenada por id", () => {
    const r = fotosParaGrelha(
      [
        { colaborador_id: 3, mini: "mini3" },
        { colaborador_id: 1, mini: "mini1" }
      ],
      []
    );
    expect(r).toEqual([
      { id: 1, img: "mini1" },
      { id: 3, img: "mini3" }
    ]);
  });

  test("sem mini, sai a foto grande (fotos antigas)", () => {
    const r = fotosParaGrelha([], [{ colaborador_id: 7, foto: "grande7" }]);
    expect(r).toEqual([{ id: 7, img: "grande7" }]);
  });

  test("quando ha as duas, a mini manda sobre a grande", () => {
    const r = fotosParaGrelha(
      [{ colaborador_id: 7, mini: "mini7" }],
      [{ colaborador_id: 7, foto: "grande7" }]
    );
    expect(r).toEqual([{ id: 7, img: "mini7" }]);
  });

  test("listas vazias e linhas sem imagem nao rebentam", () => {
    expect(fotosParaGrelha([], [])).toEqual([]);
    expect(
      fotosParaGrelha(
        [{ colaborador_id: 2, mini: "" }],
        [{ colaborador_id: 4, foto: null }]
      )
    ).toEqual([]);
  });
});
