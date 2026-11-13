/**
 * Testes da recuperação de senha SEM email (Fase 8):
 * a rota /api/auth/recuperar (validações, normalização do código, rate
 * limit de 5 falhas e mensagem amigável quando o SQL ainda não está na
 * base). Corre com: bun test tests/logica_recuperacao.test.ts
 */

import { describe, it, expect, mock, beforeAll } from "bun:test";

process.env.SUPABASE_URL = "https://stub.supabase.co";
process.env.SUPABASE_KEY = "stub-key";

mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token-falso" }) })
}));

/** Comportamento da RPC escolhido por cada bloco de testes. */
let modoRpc: "ok" | "inexistente" | "recusado" = "ok";
/** Chamadas RPC observadas: { funcao, corpo }. */
const chamadas: { funcao: string; corpo: Record<string, unknown> }[] = [];

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" }
  });
}

beforeAll(async () => {
  globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const url = String(
      typeof entrada === "object" && entrada !== null && "url" in entrada
        ? (entrada as Request).url
        : entrada
    );
    const corpoBruto = typeof init?.body === "string" ? init.body : "";
    const corpo = corpoBruto ? JSON.parse(corpoBruto) : {};
    const funcao = url.split("rpc/")[1] || "";
    chamadas.push({ funcao, corpo });

    if (url.includes("rpc/")) {
      if (modoRpc === "inexistente") return respostaJson({ message: "Not Found" }, 404);
      if (modoRpc === "recusado") {
        return respostaJson({ message: "Codigo nao encontrado. Confere com a administracao." }, 400);
      }
      return respostaJson({ ok: true });
    }
    return respostaJson({ message: "rota inesperada" }, 500);
  }) as typeof fetch;
});

function pedido(corpo: unknown): Request {
  return new Request("http://localhost/api/auth/recuperar", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo)
  });
}

describe("POST /api/auth/recuperar: validações de entrada", () => {
  it("acção desconhecida -> 400", async () => {
    const { POST } = await import("../src/app/api/auth/recuperar/route");
    const res = await POST(pedido({ action: "outra" }) as never);
    expect(res.status).toBe(400);
  });

  it("pedir sem código -> 400 e não toca na base", async () => {
    modoRpc = "ok";
    const antes = chamadas.length;
    const { POST } = await import("../src/app/api/auth/recuperar/route");
    const res = await POST(pedido({ action: "pedir", codigo: "   " }) as never);
    expect(res.status).toBe(400);
    const d = (await res.json()) as { erro: string };
    expect(d.erro.length).toBeGreaterThan(0);
    expect(chamadas.length).toBe(antes);
  });

  it("aplicar com senha curta -> 400 e não toca na base", async () => {
    const antes = chamadas.length;
    const { POST } = await import("../src/app/api/auth/recuperar/route");
    const res = await POST(
      pedido({
        action: "aplicar",
        codigo: "DMTST1",
        codigo_recuperacao: "K7PQX2MN",
        nova: "123"
      }) as never
    );
    expect(res.status).toBe(400);
    expect(chamadas.length).toBe(antes);
  });

  it("aplicar com campos vazios -> 400", async () => {
    const { POST } = await import("../src/app/api/auth/recuperar/route");
    const res = await POST(pedido({ action: "aplicar" }) as never);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/recuperar: caminho feliz", () => {
  it("pedir normaliza o código (trim + maiúsculas) e chama recuperacao_pedir", async () => {
    modoRpc = "ok";
    const antes = chamadas.length;
    const { POST } = await import("../src/app/api/auth/recuperar/route");
    const res = await POST(pedido({ action: "pedir", codigo: " dm0069 " }) as never);
    expect(res.status).toBe(200);
    const d = (await res.json()) as { ok: boolean };
    expect(d.ok).toBe(true);
    const ultima = chamadas[chamadas.length - 1];
    expect(ultima.funcao).toBe("recuperacao_pedir");
    expect(ultima.corpo.p_usuario).toBe("DM0069");
    expect(chamadas.length).toBe(antes + 1);
  });

  it("aplicar manda código, código de recuperação e nova senha à RPC", async () => {
    modoRpc = "ok";
    const { POST } = await import("../src/app/api/auth/recuperar/route");
    const res = await POST(
      pedido({
        action: "aplicar",
        codigo: "dmtst2",
        codigo_recuperacao: " k7pqx2mn ",
        nova: "senhanova123"
      }) as never
    );
    expect(res.status).toBe(200);
    const ultima = chamadas[chamadas.length - 1];
    expect(ultima.funcao).toBe("recuperacao_aplicar");
    expect(ultima.corpo.p_usuario).toBe("DMTST2");
    expect(ultima.corpo.p_codigo).toBe("k7pqx2mn");
    expect(ultima.corpo.p_senha_nova).toBe("senhanova123");
  });
});

describe("POST /api/auth/recuperar: SQL da Fase 8 ainda não colado", () => {
  it("RPC 404 -> 503 com mensagem amigável", async () => {
    modoRpc = "inexistente";
    const { POST } = await import("../src/app/api/auth/recuperar/route");
    const res = await POST(pedido({ action: "pedir", codigo: "DM0069" }) as never);
    expect(res.status).toBe(503);
    const d = (await res.json()) as { erro: string };
    expect(d.erro).toContain("activada");
  });
});

describe("POST /api/auth/recuperar: limite de tentativas", () => {
  it("5 recusas da RPC bloqueiam o código por 15 minutos", async () => {
    modoRpc = "recusado";
    const { POST } = await import("../src/app/api/auth/recuperar/route");
    for (let i = 0; i < 5; i++) {
      const res = await POST(pedido({ action: "pedir", codigo: "DMRATE" }) as never);
      expect(res.status).toBe(400);
    }
    const bloqueado = await POST(pedido({ action: "pedir", codigo: "DMRATE" }) as never);
    expect(bloqueado.status).toBe(429);
    const d = (await bloqueado.json()) as { erro: string };
    expect(d.erro).toContain("Muitas tentativas");
  });

  it("código diferente não fica bloqueado pelo erro dos outros", async () => {
    modoRpc = "recusado";
    const { POST } = await import("../src/app/api/auth/recuperar/route");
    const res = await POST(pedido({ action: "pedir", codigo: "DMOUTRO" }) as never);
    expect(res.status).toBe(400);
  });
});
