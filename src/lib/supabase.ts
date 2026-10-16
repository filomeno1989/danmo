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
 *
 * Desempenho: a 1a pagina vem sozinha (e traz o total pelo cabeçalho
 * Content-Range, pedido com Prefer: count=exact); as restantes sao
 * buscadas em paralelo (6 de cada vez).
 *
 * ATENCAO: o total no Content-Range so vem se pedirmos count=exact -
 * sem isso o cabecalho vem "0-999/*" e ficavamos presos a uma unica
 * pagina. Foi exactamente o bug que escondia 2023-2025 no Painel e
 * cortava disp_mensal / disp_dias / disp_horometro na linha 1000.
 * Se mesmo assim o total nao vier, pagina-se em ondas ate uma pagina
 * vir incompleta (rede de seguranca).
 */
const CONCORRENTES_PAGINAS = 12;

export async function queryTudo<T = Record<string, unknown>>(
  tabela: string,
  params = "",
  tamanhoPagina = 1000
): Promise<T[]> {
  exigirChaves();
  if (!/(^|&)order=/.test(params)) {
    params += (params ? "&" : "") + "order=id.asc";
  }
  const pedirPagina = async (
    inicio: number,
    comContagem = false
  ): Promise<{ linhas: T[]; total: number }> => {
    const fim = inicio + tamanhoPagina - 1;
    const url = `${SUPABASE_URL}/rest/v1/${tabela}?${params}`;
    const r = await fetch(url, {
      headers: {
        ...headers(),
        "Range-Unit": "items",
        Range: `${inicio}-${fim}`,
        ...(comContagem ? { Prefer: "count=exact" } : {})
      },
      cache: "no-store"
    });
    if (!r.ok) {
      const erro = (await r.json().catch(() => ({}))) as { message?: string };
      throw new Error(erro.message || `Erro a ler ${tabela} (${r.status})`);
    }
    const linhas = (await r.json()) as T[];
    // Content-Range: "0-999/10568" (o total depois da barra) ou "0-999/*"
    const cr = r.headers.get("content-range") || "";
    const total = Number(cr.split("/")[1]);
    return { linhas, total: Number.isFinite(total) ? total : 0 };
  };

  const primeira = await pedirPagina(0, true);
  if (primeira.linhas.length < tamanhoPagina) return primeira.linhas;

  const blocos: T[][] = [];

  if (primeira.total > primeira.linhas.length) {
    // total real: buscar as paginas restantes em paralelo (uma vaga unica
    // quando cabem todas, ex. disp_mensal ~11 paginas)
    const inicioPaginas: number[] = [];
    for (let i = tamanhoPagina; i < primeira.total; i += tamanhoPagina) inicioPaginas.push(i);

    for (let i = 0; i < inicioPaginas.length; i += CONCORRENTES_PAGINAS) {
      const lote = inicioPaginas.slice(i, i + CONCORRENTES_PAGINAS);
      const resultados = await Promise.all(lote.map((ini) => pedirPagina(ini)));
      for (let j = 0; j < lote.length; j++) blocos[i + j] = resultados[j].linhas;
    }
  } else {
    // total ausente: ondas de paginas ate uma vir incompleta (fim da tabela)
    let inicio = tamanhoPagina;
    while (true) {
      const inicios = Array.from({ length: CONCORRENTES_PAGINAS }, (_, i) => inicio + i * tamanhoPagina);
      const resultados = await Promise.all(inicios.map((ini) => pedirPagina(ini)));
      let parar = false;
      for (const res of resultados) {
        if (res.linhas.length) blocos.push(res.linhas);
        if (res.linhas.length < tamanhoPagina) {
          parar = true;
          break;
        }
      }
      if (parar) break;
      inicio += CONCORRENTES_PAGINAS * tamanhoPagina;
    }
  }
  return [...primeira.linhas, ...blocos.flat()];
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

/**
 * Insere ou atualiza (upsert) em conflito com as colunas indicadas -
 * ex.: upsert("disp_dias", linhas, "equipment_id,data"). Nunca duplica:
 * a linha existente é atualizada com os dados novos.
 */
export async function upsert<T = Record<string, unknown>>(
  tabela: string,
  dados: unknown,
  conflito: string
): Promise<T[]> {
  exigirChaves();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?on_conflict=${conflito}`, {
    method: "POST",
    headers: {
      ...headers(),
      Prefer: "resolution=merge-duplicates,return=representation"
    },
    body: JSON.stringify(dados),
    cache: "no-store"
  });
  if (!r.ok) {
    const erro = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(erro.message || `Erro a gravar em ${tabela} (${r.status})`);
  }
  return (await r.json()) as T[];
}

/** DELETE por filtro PostgREST arbitrário (ex.: "equipment_id=eq.5&os_id=is.null"). */
export async function delFiltro(tabela: string, filtro: string): Promise<void> {
  exigirChaves();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?${filtro}`, {
    method: "DELETE",
    headers: headers(),
    cache: "no-store"
  });
  if (!r.ok && r.status !== 404) {
    const erro = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(erro.message || `Erro a apagar em ${tabela} (${r.status})`);
  }
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

/** Apaga o registo com o id indicado (usado pela Oficina e próximos módulos). */
export async function del(tabela: string, id: number | string): Promise<void> {
  exigirChaves();
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${tabela}?id=eq.${id}`, {
    method: "DELETE",
    headers: headers(),
    cache: "no-store"
  });
  if (!r.ok && r.status !== 404) {
    const erro = (await r.json().catch(() => ({}))) as { message?: string };
    throw new Error(erro.message || `Erro a apagar em ${tabela} (${r.status})`);
  }
}
