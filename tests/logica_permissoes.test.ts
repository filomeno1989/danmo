/**
 * Testes da lógica das permissões POR UTILIZADOR (Fase 7 R1):
 * pode() com as 3 marcas (Ver/Mexer/Apagar), a normalização do
 * vocabulário antigo (criar/editar -> mexer), o mapa PAGINAS e a
 * cascata aplicada no pode(). Correm com: bun test tests/logica_permissoes.test.ts
 */

import { describe, expect, test, mock } from "bun:test";
import type { LinhaPermissao } from "@/lib/uso-comum";
import type { Sessao } from "@/lib/auth";

// Este ficheiro importa auth.ts (que importa next/headers): o mock tem de
// estar activo ANTES de auth.ts ser avaliado, senão avalia o next/headers
// real e contamina os testes seguintes (padrão dos testes de rotas).
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://stub.supabase.co";
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || "stub-key";
mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token-falso" }) })
}));

// Imports AVALIADOS depois do mock (top-level await)
const { pode, normalizarAcao } = await import("@/lib/auth");
const { PAGINAS, MODULOS, labelPagina, moduloPorId } = await import("@/lib/permissoes");

function sessao(matriz: LinhaPermissao[], nivel = "operador"): Sessao {
  return {
    utilizador: {
      id: "u1",
      usuario: "DM0101",
      nome: "Pessoa de Teste",
      cargo: "Cargo",
      nivel,
      precisa_trocar: false
    },
    matriz,
    token_sessao: "t"
  };
}

const L = (
  pagina: string,
  ver: boolean,
  mexer: boolean,
  apagar: boolean
): LinhaPermissao => ({ pagina, ver, mexer, apagar });

describe("normalizarAcao", () => {
  test("criar e editar viram mexer", () => {
    expect(normalizarAcao("criar")).toBe("mexer");
    expect(normalizarAcao("editar")).toBe("mexer");
  });
  test("ver e apagar mantêm-se", () => {
    expect(normalizarAcao("ver")).toBe("ver");
    expect(normalizarAcao("apagar")).toBe("apagar");
  });
  test("desconhecida cai em ver (o mais restritivo de leitura)", () => {
    expect(normalizarAcao("xpto")).toBe("ver");
  });
});

describe("pode(): admin", () => {
  test("admin entra em tudo mesmo sem matriz", () => {
    const s = sessao([], "admin");
    expect(pode(s, "stock.entradas", "ver")).toBe(true);
    expect(pode(s, "oficina.config", "apagar")).toBe(true);
    expect(pode(s, "pagina.inexistente", "mexer")).toBe(true);
  });
  test("sem sessão nunca", () => {
    expect(pode(null, "stock", "ver")).toBe(false);
  });
});

describe("pode(): as 3 marcas", () => {
  const s = sessao([L("stock.entradas", true, true, false)]);

  test("ver segue a marca ver", () => {
    expect(pode(s, "stock.entradas", "ver")).toBe(true);
  });
  test("mexer segue a marca mexer", () => {
    expect(pode(s, "stock.entradas", "mexer")).toBe(true);
    expect(pode(s, "stock.entradas", "criar")).toBe(true); // vocabulário antigo
    expect(pode(s, "stock.entradas", "editar")).toBe(true);
  });
  test("apagar recusado sem a marca", () => {
    expect(pode(s, "stock.entradas", "apagar")).toBe(false);
  });
  test("página sem linha = bloqueada (tudo)", () => {
    expect(pode(s, "stock.saidas", "ver")).toBe(false);
    expect(pode(s, "stock.saidas", "mexer")).toBe(false);
    expect(pode(s, "stock.saidas", "apagar")).toBe(false);
  });
  test("página só de ver: mexer recusado", () => {
    const soVer = sessao([L("stock.materiais", true, false, false)]);
    expect(pode(soVer, "stock.materiais", "ver")).toBe(true);
    expect(pode(soVer, "stock.materiais", "mexer")).toBe(false);
  });
  test("cascata: linha mal gravada com mexer sem ver não passa", () => {
    const estranha = sessao([L("stock.config", false, true, false)]);
    expect(pode(estranha, "stock.config", "mexer")).toBe(false);
  });
  test("cascata: apagar sem mexer não passa", () => {
    const estranha = sessao([L("stock.config", true, false, true)]);
    expect(pode(estranha, "stock.config", "apagar")).toBe(false);
  });
  test("pendente (matriz vazia) não vê nada", () => {
    const p = sessao([]);
    expect(pode(p, "stock", "ver")).toBe(false);
    expect(pode(p, "oficina", "ver")).toBe(false);
  });
});

describe("PAGINAS: o mapa das páginas atribuíveis", () => {
  test("são as 27 páginas reais dos 4 módulos no ar (18 + 6 da Faturação + 3 do RH)", () => {
    expect(PAGINAS.length).toBe(27);
    const modulos = new Set(PAGINAS.map((p) => p.modulo));
    expect([...modulos].sort()).toEqual(["admin", "disponibilidade", "oficina", "stock"]);
  });
  test("o RH entra na matriz com as 3 páginas do grupo Recursos Humanos", () => {
    const rh = PAGINAS.filter((p) => p.pagina.startsWith("rh."));
    expect(rh.length).toBe(3);
    expect(rh.map((p) => p.pagina).sort()).toEqual(["rh.aniversarios", "rh.documentos", "rh.quadro"]);
    expect(rh.every((p) => p.modulo === "admin")).toBe(true);
    expect(rh.find((p) => p.pagina === "rh.quadro")?.href).toBe("/rh/quadro");
    expect(rh.find((p) => p.pagina === "rh.aniversarios")?.href).toBe("/rh/aniversarios");
    expect(rh.find((p) => p.pagina === "rh.documentos")?.href).toBe("/rh/documentos");
  });
  test("a Faturação entra na matriz como páginas novas (sem href do sub, vem dos grupos)", () => {
    const fat = PAGINAS.filter((p) => p.pagina.startsWith("faturacao"));
    expect(fat.length).toBe(6);
    expect(fat.map((p) => p.pagina).sort()).toEqual([
      "faturacao",
      "faturacao.clientes",
      "faturacao.editor",
      "faturacao.relatorios",
      "faturacao.tarifas",
      "faturacao.tecnicos"
    ]);
  });
  test("ids únicos", () => {
    const ids = PAGINAS.map((p) => p.pagina);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test("cada id casa com a sub ou item de grupo do seu módulo (menu e matriz falam a mesma língua)", () => {
    for (const p of PAGINAS) {
      const m = moduloPorId(p.modulo);
      expect(m).toBeDefined();
      const sub = (m?.sub || []).find((x) => x.pagina === p.pagina);
      const grupo = (m?.grupos || []).flatMap((g) => g.itens).find((x) => x.pagina === p.pagina);
      const origem = sub || grupo;
      expect(origem).toBeDefined();
      expect(origem?.href).toBe(p.href);
    }
  });
  test("módulos por migrar (fase > 0) não entram na matriz", () => {
    for (const m of MODULOS) {
      if (m.fase > 0) {
        expect(PAGINAS.some((p) => p.pagina === m.id)).toBe(false);
      }
    }
  });
  test("labelPagina junta o nome do módulo", () => {
    expect(labelPagina("stock.entradas")).toBe("Entradas (Gestão de Stock)");
    expect(labelPagina("oficina")).toBe("Visão Geral (Oficina & Manutenção)");
  });
  test("labelPagina prefixa a Faturação (Painel sozinho não diz nada na matriz)", () => {
    expect(labelPagina("faturacao")).toBe("Faturação - Painel (Admin. Oficinal)");
    expect(labelPagina("faturacao.relatorios")).toBe("Faturação - Relatórios (Admin. Oficinal)");
  });
  test("labels especiais para páginas garantidas/admin", () => {
    expect(labelPagina("permissoes")).toBe("Permissões & Contas");
    expect(labelPagina("perfil")).toBe("Os meus dados");
  });
  test("cascata da grelha: ligar Mexer implica Ver (lógica usada pelo client)", () => {
    // o client grava (ver=true, mexer=!mexer) ao alternar Mexer
    let l = L("stock", false, false, false);
    // alternar mexer: ver fica true
    const novo = { ...l, ver: true, mexer: !l.mexer };
    expect(novo.ver).toBe(true);
    expect(novo.mexer).toBe(true);
    // desligar ver apaga mexer e apagar (igual ao RPC permissoes_gravar)
    l = L("stock", true, true, true);
    const desligada = { ...l, ver: false, mexer: false, apagar: false };
    expect(desligada.mexer).toBe(false);
    expect(desligada.apagar).toBe(false);
  });
});
