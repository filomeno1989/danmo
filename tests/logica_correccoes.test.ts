/**
 * Testes da lógica de SERVIDOR das correcções do Filomeno
 * (varredura Checklists + Equipamentos, fases 1 e 3).
 *
 * Corre com bun test (não Playwright): importa as rotas API
 * directamente com fetch stubado e sessão mockada via next/headers.
 *
 *  A. proximaDataAssinatura: os 3 ramos da regra das datas de assinatura
 *  B. FILTRO_ITEM_RESPONDIDO: filtro PostgREST com as 3 colunas
 *  C. POST /api/oficina/checklist/1 guardar-cabecalho: grava as datas
 *     (novo nome -> hoje; igual -> mantém; limpo -> null)
 *  D. GET /api/oficina/checklist-gestao: contagem de usos usa o filtro
 *     (linhas vazias não contam)
 *  E. POST apagar-item: contagem usa o filtro
 *  F. POST /api/oficina/equipamentos: código duplicado recusado (criar e
 *     editar), o próprio código no editar não se conta como duplicado
 */

import { describe, it, expect, mock, beforeAll, beforeEach } from "bun:test";

process.env.SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_KEY = "stub-key";

mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token-falso" }) })
}));

type Pedido = { url: string; metodo: string; corpo: string };

const pedidos: Pedido[] = [];

/** Linha do checklist devolvida pela query inicial de cada cenário. */
let linhaChecklist: Record<string, unknown> = {};
/** Linhas de equipamento a devolver na pesquisa de código duplicado. */
let duplicadosEquipment: Record<string, unknown>[] = [];

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" }
  });
}

beforeAll(async () => {
  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(typeof entrada === "object" && entrada !== null && "url" in entrada ? (entrada as Request).url : entrada);
    const metodo = (init?.method || (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
    const corpo = typeof init?.body === "string" ? init.body : "";
    pedidos.push({ url, metodo, corpo });

    if (url.includes("rpc/validar_sessao")) {
      return respostaJson({
        valido: true,
        utilizador: { id: 1, usuario: "filo", nome: "Filomeno", cargo: "DM", nivel: "admin", precisa_trocar: false },
        matriz: []
      });
    }
    if (url.includes("checklist_preenchidos?")) {
      if (metodo === "PATCH") return respostaJson([{ id: 1 }]);
      return respostaJson([linhaChecklist]);
    }
    if (url.includes("checklist_preenchidos_itens")) {
      return respostaJson([]);
    }
    if (url.includes("checklist_templates")) {
      return respostaJson([
        { id: 51, categoria_equipamento: "Escavadora", nome: "ME ESC", tipo: "mecanica", ativo: true }
      ]);
    }
    if (url.includes("checklist_template_secoes")) {
      return respostaJson([{ id: 1, template_id: 51, nome_secao: "MOTOR", ordem: 1 }]);
    }
    if (url.includes("checklist_template_itens")) {
      return respostaJson([{ id: 7, secao_id: 1, numero_item: 1, descricao: "Verificar nivel de oleo", ordem: 1 }]);
    }
    if (url.includes("/equipment") && metodo === "GET") {
      return respostaJson(duplicadosEquipment);
    }
    if (url.includes("/equipment") && metodo === "POST") {
      return respostaJson([{ id: 99 }]);
    }
    if (url.includes("/equipment") && metodo === "PATCH") {
      return respostaJson([{ id: 7 }]);
    }
    return respostaJson([]);
  }) as typeof fetch;
});

beforeEach(() => {
  pedidos.length = 0;
  duplicadosEquipment = [];
  linhaChecklist = {
    id: 1,
    template_id: 51,
    executante: null,
    encarregado: null,
    executante_data: null,
    encarregado_data: null
  };
});

function hojeISO(): string {
  const mapa = new Date(Date.now() + 2 * 3600 * 1000);
  return mapa.toISOString().slice(0, 10);
}

function patchDeDatas(): Record<string, unknown> | null {
  const p = pedidos.find((x) => x.metodo === "PATCH" && x.url.includes("checklist_preenchidos"));
  if (!p) return null;
  const patches = pedidos
    .filter((x) => x.metodo === "PATCH" && x.url.includes("checklist_preenchidos"))
    .map((x) => JSON.parse(x.corpo) as Record<string, unknown>);
  return patches.find((b) => "executante_data" in b || "encarregado_data" in b) || null;
}

function patchDeCabecalho(): Record<string, unknown> | null {
  const patches = pedidos
    .filter((x) => x.metodo === "PATCH" && x.url.includes("checklist_preenchidos"))
    .map((x) => JSON.parse(x.corpo) as Record<string, unknown>);
  return patches.find((b) => "folha_numero" in b) || null;
}

describe("A. proximaDataAssinatura", () => {
  it("nome novo preenchido -> data de hoje", async () => {
    const { proximaDataAssinatura } = await import("../src/lib/oficina");
    expect(proximaDataAssinatura("Filomeno", null, null, "2026-10-15")).toBe("2026-10-15");
  });

  it("nome igual -> mantém a data anterior", async () => {
    const { proximaDataAssinatura } = await import("../src/lib/oficina");
    expect(proximaDataAssinatura("Filomeno", "Filomeno", "2026-01-01", "2026-10-15")).toBe("2026-01-01");
  });

  it("nome limpo -> sem data", async () => {
    const { proximaDataAssinatura } = await import("../src/lib/oficina");
    expect(proximaDataAssinatura("", "Filomeno", "2026-01-01", "2026-10-15")).toBeNull();
  });

  it("espaços contam como vazio e nomes são comparados aparados", async () => {
    const { proximaDataAssinatura } = await import("../src/lib/oficina");
    expect(proximaDataAssinatura("  Filomeno  ", "Filomeno", "2026-01-01", "2026-10-15")).toBe("2026-01-01");
    expect(proximaDataAssinatura("   ", "Filomeno", "2026-01-01", "2026-10-15")).toBeNull();
  });
});

describe("B. FILTRO_ITEM_RESPONDIDO", () => {
  it("contém as 3 colunas como não nulas", async () => {
    const { FILTRO_ITEM_RESPONDIDO } = await import("../src/lib/oficina");
    expect(FILTRO_ITEM_RESPONDIDO).toContain("executado.neq.null");
    expect(FILTRO_ITEM_RESPONDIDO).toContain("estado.neq.null");
    expect(FILTRO_ITEM_RESPONDIDO).toContain("observacao.neq.null");
    expect(FILTRO_ITEM_RESPONDIDO.startsWith("or=(")).toBe(true);
  });
});

describe("C. guardar-cabecalho grava as datas de assinatura", () => {
  async function postCabecalho(cabecalho: Record<string, unknown>) {
    const { POST } = await import("../src/app/api/oficina/checklist/[id]/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/oficina/checklist/1", {
      method: "POST",
      body: JSON.stringify({ action: "guardar-cabecalho", cabecalho }),
      headers: { "content-type": "application/json" }
    });
    return POST(req, { params: Promise.resolve({ id: "1" }) });
  }

  it("executante novo -> PATCH com executante_data = hoje", async () => {
    linhaChecklist = { id: 1, template_id: 51, executante: null, encarregado: null, executante_data: null, encarregado_data: null };
    const r = await postCabecalho({ executante: "Filomeno", encarregado: "", folha_numero: "F-1" });
    const j = (await r.json()) as { ok: boolean };
    expect(j.ok).toBe(true);
    const cab = patchDeCabecalho();
    expect(cab?.executante).toBe("Filomeno");
    const datas = patchDeDatas();
    expect(datas?.executante_data).toBe(hojeISO());
    expect(datas?.encarregado_data).toBeNull();
  });

  it("mesmo executante -> mantém a data que já estava", async () => {
    linhaChecklist = { id: 1, template_id: 51, executante: "Filomeno", encarregado: null, executante_data: "2026-01-01", encarregado_data: null };
    await postCabecalho({ executante: "Filomeno", encarregado: "", folha_numero: "F-1" });
    const datas = patchDeDatas();
    expect(datas?.executante_data).toBe("2026-01-01");
  });

  it("executante limpo -> PATCH com executante_data nulo", async () => {
    linhaChecklist = { id: 1, template_id: 51, executante: "Filomeno", encarregado: null, executante_data: "2026-01-01", encarregado_data: null };
    await postCabecalho({ executante: "", encarregado: "", folha_numero: "F-1" });
    const datas = patchDeDatas();
    expect(datas?.executante_data).toBeNull();
  });

  it("encarregado novo -> PATCH com encarregado_data = hoje", async () => {
    linhaChecklist = { id: 1, template_id: 51, executante: null, encarregado: null, executante_data: null, encarregado_data: null };
    await postCabecalho({ executante: "", encarregado: "Chefe Mario", folha_numero: "F-2" });
    const datas = patchDeDatas();
    expect(datas?.encarregado_data).toBe(hojeISO());
  });
});

describe("D. contagem de usos usa o filtro de respostas reais", () => {
  it("GET com templateId manda or=(...) na contagem", async () => {
    const { GET } = await import("../src/app/api/oficina/checklist-gestao/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/oficina/checklist-gestao?categoria=Escavadora&templateId=51");
    const r = await GET(req);
    expect((await r.json() as { ok: boolean }).ok).toBe(true);
    const contagem = pedidos.find(
      (p) => p.url.includes("checklist_preenchidos_itens") && p.url.includes("template_item_id=in.")
    );
    expect(contagem).toBeTruthy();
    expect(contagem!.url).toContain("or=(executado.neq.null");
  });

  it("POST apagar-item manda or=(...) na contagem", async () => {
    const { POST } = await import("../src/app/api/oficina/checklist-gestao/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/oficina/checklist-gestao", {
      method: "POST",
      body: JSON.stringify({ action: "apagar-item", itemId: 7 }),
      headers: { "content-type": "application/json" }
    });
    const r = await POST(req);
    expect((await r.json() as { ok: boolean }).ok).toBe(true);
    const contagem = pedidos.find(
      (p) => p.url.includes("checklist_preenchidos_itens") && p.url.includes("template_item_id=eq.7")
    );
    expect(contagem).toBeTruthy();
    expect(contagem!.url).toContain("or=(executado.neq.null");
  });
});

describe("F. código duplicado de equipamento", () => {
  function reqCriar(corpo: Record<string, unknown>) {
    return new Request("http://localhost/api/oficina/equipamentos", {
      method: "POST",
      body: JSON.stringify(corpo),
      headers: { "content-type": "application/json" }
    });
  }

  it("criar com código que já existe -> 409 com mensagem amigável", async () => {
    duplicadosEquipment = [{ id: 3 }];
    const { POST } = await import("../src/app/api/oficina/equipamentos/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/oficina/equipamentos", {
      method: "POST",
      body: JSON.stringify({ action: "criar", code: "45-30", fleet_type: "Escavadora" }),
      headers: { "content-type": "application/json" }
    });
    void reqCriar;
    const r = await POST(req);
    expect(r.status).toBe(409);
    const j = (await r.json()) as { ok: boolean; erro: string };
    expect(j.ok).toBe(false);
    expect(j.erro).toContain("45-30");
  });

  it("criar com código novo -> grava", async () => {
    duplicadosEquipment = [];
    const { POST } = await import("../src/app/api/oficina/equipamentos/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/oficina/equipamentos", {
      method: "POST",
      body: JSON.stringify({ action: "criar", code: "88-88", fleet_type: "Escavadora" }),
      headers: { "content-type": "application/json" }
    });
    const r = await POST(req);
    expect((await r.json() as { ok: boolean }).ok).toBe(true);
    const insercao = pedidos.find((p) => p.metodo === "POST" && p.url.includes("/equipment"));
    expect(insercao).toBeTruthy();
  });

  it("editar mantendo o próprio código -> grava (não é duplicado)", async () => {
    duplicadosEquipment = [];
    const { POST } = await import("../src/app/api/oficina/equipamentos/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/oficina/equipamentos", {
      method: "POST",
      body: JSON.stringify({ action: "editar", id: 7, code: "45-30", fleet_type: "Escavadora" }),
      headers: { "content-type": "application/json" }
    });
    const r = await POST(req);
    expect((await r.json() as { ok: boolean }).ok).toBe(true);
    const filtro = pedidos.find((p) => p.metodo === "GET" && p.url.includes("code=eq.45-30"));
    expect(filtro!.url).toContain("id=neq.7");
  });
});
