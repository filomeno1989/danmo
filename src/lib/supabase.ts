/**
 * supabase.ts - Ligação à base de dados, do lado do SERVIDOR.
 *
 * Diferença fundamental em relação ao hub actual: aqui as chaves nunca
 * chegam ao navegador. Este ficheiro só corre em Route Handlers e Server
 * Components (Node), e as credenciais vêm das variáveis de ambiente.
 *
 * Usa o MESMO projeto Supabase e as MESMAS tabelas e funções RPC do
 * danmo-hub actual. Nada na base de dados muda.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

/** Verdadeiro quando as chaves ainda não foram configuradas. */
export function chavesConfiguradas(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Modo estrutura: sem chaves E fora de produção (só no ambiente de
 * desenvolvimento). Permite ver e testar o desenho das páginas sem
 * base de dados. Em produção (Vercel) nunca se activa: sem chaves,
 * mostra-se um erro claro em vez de abrir o sistema.
 */
export function modoEstrutura(): boolean {
  return !chavesConfiguradas() && process.env.NODE_ENV !== "production";
}

function headers(): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json"
  };
}

function exigirChaves() {
  if (!chavesConfiguradas()) {
    throw new Error(
      "Configuracao em falta: define SUPABASE_URL e SUPABASE_KEY nas variaveis de ambiente."
    );
  }
}

/** Chama uma função RPC criada no SQL Editor do Supabase. */
export async function rpc<T = unknown>(
  nome: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  exigirChaves();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(params),
    cache: "no-store"
  });
  if (!r.ok) {
    const erro = (await r.json().catch(() => ({}))) as { message?: string };
    const e = new Error(erro.message || `Erro RPC ${nome} (${r.status})`);
    (e as Error & { status?: number }).status = r.status;
    throw e;
  }
  const texto = await r.text();
  return (texto ? JSON.parse(texto) : null) as T;
}

/**
 * Consulta a tabela toda em páginas (o PostgREST devolve no máximo
 * 1000 linhas por pedido). Mesma ideia do queryTudo do hub actual.
 */
export async function queryTudo<T = Record<string, unknown>>(
  tabela: string,
  params = "",
  tamanhoPagina = 1000
): Promise<T[]> {
  exigirChaves();
  if (!/(^|&)order=/.test(params)) {
    params += (params ? "&" : "") + "order=id.asc";
  }
  const todas: T[] = [];
  let inicio = 0;
  for (let i = 0; i < 200; i++) {
    const fim = inicio + tamanhoPagina - 1;
    const url = `${SUPABASE_URL}/rest/v1/${tabela}?${params}`;
    const r = await fetch(url, {
      headers: {
        ...headers(),
        "Range-Unit": "items",
        Range: `${inicio}-${fim}`
      },
      cache: "no-store"
    });
    if (!r.ok) {
      const erro = (await r.json().catch(() => ({}))) as { message?: string };
      throw new Error(erro.message || `Erro a ler ${tabela} (${r.status})`);
    }
    const bloco = (await r.json()) as T[];
    todas.push(...bloco);
    if (bloco.length < tamanhoPagina) break;
    inicio += tamanhoPagina;
  }
  return todas;
}

/**
 * Consulta com filtros simples, devolve todas as linhas encontradas.
 * params: query-string PostgREST (ex.: "select=*&ordem=eq.ASC&limit=50").
 */
export async function query<T = Record<string, unknown>>(
  tabela: string,
  params = ""
): Promise<T[]> {
  exigirChaves();
  const url = `${SUPABASE_URL}/rest/v1/${tabela}?${params}`;
  const r = await fetch(url, { headers: headers(), cache: "no-store" });
  if (!r.ok) {
    const erro = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(erro.message || `Erro a ler ${tabela} (${r.status})`);
  }
  return (await r.json()) as T[];
}

/** Insere um ou mais registos e devolve as linhas criadas. */
export async function insert<T = Record<string, unknown>>(
  tabela: string,
  dados: unknown
): Promise<T[]> {
  exigirChaves();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}`, {
    method: "POST",
    headers: { ...headers(), Prefer: "return=representation" },
    body: JSON.stringify(dados),
    cache: "no-store"
  });
  if (!r.ok) {
    const erro = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(erro.message || `Erro a gravar em ${tabela} (${r.status})`);
  }
  return (await r.json()) as T[];
}

/** Atualiza registos que cumpram o filtro (coluna=eq.valor) e devolve as linhas. */
export async function update<T = Record<string, unknown>>(
  tabela: string,
  filtro: string,
  dados: unknown
): Promise<T[]> {
  exigirChaves();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?${filtro}`, {
    method: "PATCH",
    headers: { ...headers(), Prefer: "return=representation" },
    body: JSON.stringify(dados),
    cache: "no-store"
  });
  if (!r.ok) {
    const erro = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(erro.message || `Erro a atualizar ${tabela} (${r.status})`);
  }
  return (await r.json()) as T[];
}
