/**
 * stock.ts - Tipos e regras do módulo Gestão de Stock.
 *
 * Corre no SERVIDOR e no NAVEGADOR (não importa nada de next/headers
 * nem de supabase.ts). Toda a lógica de cálculo vive aqui em funções
 * puras: posições de stock, estados de alerta, série dos 6 meses e
 * a busca sem acentos. Assim os testes (bun) validam as regras sem
 * precisar da base de dados.
 *
 * Decisões do Filomeno (21/10):
 * - Registo directo: os movimentos nascem confirmados (o estado
 *   "pendente" fica na base para o futuro, mas ninguém o cria hoje);
 * - Stock nunca fica negativo: a saída é bloqueada no servidor;
 * - Unidades do hub mantidas e extensíveis nas Configurações.
 */

export type Material = {
  id: string;
  referencia: string;
  nome: string;
  unidade: string;
  preco_mzn: number | string | null;
  ativo: boolean;
  criado_em?: string;
  stock_minimo: number | string | null;
  localizacao: string | null;
  categoria: string | null;
};

export type CategoriaMaterial = { id: string; nome: string; ativo: boolean };
export type Fornecedor = { id: string; nome: string; contacto?: string | null; ativo: boolean };
export type Departamento = { id: string; nome: string; active?: boolean; ativo?: boolean; created_at?: string };
export type Finalidade = { id: string; nome: string; ativo: boolean };
export type Responsavel = { id: string; nome: string; funcao: string; ativo: boolean };
export type UnidadeMedida = { id: string; nome: string; ativo: boolean };

export type MovimentoStock = {
  id: string;
  tipo: "entrada" | "saida";
  estado: "pendente" | "confirmado";
  material_id: string;
  quantidade: number | string;
  data_movimento: string;
  data_confirmacao: string | null;
  fornecedor: string | null;
  numero_po: string | null;
  numero_requisicao: string | null;
  departamento: string | null;
  finalidade: string | null;
  colaborador_id: string | null;
  observacoes: string | null;
  criado_em: string;
  comprador_nome: string | null;
  recebedor_nome: string | null;
  fornecedor_saida: string | null;
  colaborador_nome: string | null;
  preco_unitario: number | string | null;
};

/** Posição de stock de um material: entradas confirmadas menos saídas confirmadas. */
export type Posicao = {
  material: Material;
  stock: number;
  minimo: number;
  estado: EstadoPosicao;
};

/** As 8 unidades do hub: fallback enquanto o SQL das unidades não correr. */
export const UNIDADES_BASE = ["Un", "Kg", "Lt", "Mt", "Cx", "Par", "Rolo", "Saco"];

export const ESTADO_OK = "OK";
export const ESTADO_BAIXO = "Stock Baixo";
export const ESTADO_ESGOTADO = "Esgotado";
export type EstadoPosicao = "OK" | "Stock Baixo" | "Esgotado";

/** Cor do estado de posição (etiquetas, nas cores do tema). */
export const COR_POSICAO: Record<EstadoPosicao, string> = {
  OK: "bg-sucesso-bg text-sucesso",
  "Stock Baixo": "bg-ambar-claro text-ambar-texto",
  Esgotado: "bg-erro-bg text-erro"
};

/**
 * Normaliza texto para busca e comparação sem acentos:
 * minúsculas, sem diacríticos, espaços colapsados.
 * "Óleo DX3" e "oleo dx3" passam a ser o mesmo texto.
 */
export function normalizar(t: string | null | undefined): string {
  return (t || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Posições de stock por material_id, contando só movimentos confirmados.
 * Movimentos pendentes não mexem no stock (nem no passado, nem no futuro
 * quando o fluxo em 2 passos voltar).
 */
export function calcularPosicoes(movimentos: MovimentoStock[]): Record<string, number> {
  const pos: Record<string, number> = {};
  for (const m of movimentos) {
    if (m.estado !== "confirmado") continue;
    const id = m.material_id;
    const qtd = Number(m.quantidade) || 0;
    if (!pos[id]) pos[id] = 0;
    if (m.tipo === "entrada") pos[id] += qtd;
    else pos[id] -= qtd;
  }
  return pos;
}

/** Estado da posição: Esgotado (<= 0), Stock Baixo (<= mínimo) ou OK. */
export function estadoPosicao(stock: number, minimo: number | string | null | undefined): EstadoPosicao {
  const min = Number(minimo) || 0;
  if (stock <= 0) return ESTADO_ESGOTADO;
  if (stock <= min) return ESTADO_BAIXO;
  return ESTADO_OK;
}

/** Posição completa de um material (junta stock, mínimo e estado). */
export function posicaoDe(material: Material, stock: number): Posicao {
  return {
    material,
    stock,
    minimo: Number(material.stock_minimo) || 0,
    estado: estadoPosicao(stock, material.stock_minimo)
  };
}

/**
 * Regra do stock não negativo: pode sair apenas o que existe.
 * Devolve o motivo do bloqueio ("" quando pode sair).
 */
export function motivoBloqueioSaida(quantidade: number, disponivel: number): string {
  if (!(quantidade > 0)) return "Quantidade inválida.";
  if (disponivel < 0) disponivel = 0;
  if (quantidade > disponivel) {
    return `Stock insuficiente: disponível ${disponivel}. A saída fica bloqueada para o stock nunca ficar negativo.`;
  }
  return "";
}

/**
 * Ao apagar uma entrada confirmada, o stock desce. Só se pode apagar
 * se nenhum material ficar negativo (senão o histórico mente).
 */
export function motivoBloqueioApagarEntrada(
  entrada: { material_id: string; quantidade: number | string },
  posicoes: Record<string, number>
): string {
  const novo = (posicoes[entrada.material_id] || 0) - (Number(entrada.quantidade) || 0);
  if (novo < 0) {
    return `Esta entrada já foi consumida: ao apagá-la o stock ficaria negativo (${novo}). Apaga primeiro as saídas que a consumiram.`;
  }
  return "";
}

/** Rótulo curto do mês "2026-10" -> "Out". */
export const MESES_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

export function mesCurto(mesChave: string, meses: string[]): string {
  const m = Number(mesChave.slice(5, 7));
  return meses[m - 1] ? meses[m - 1].slice(0, 3) : mesChave;
}

/**
 * Série dos últimos 6 meses (contagem de movimentos confirmados e MZN
 * das entradas) para o gráfico do Painel. Mês a mês até ao mês corrente,
 * com zeros onde não houve movimento.
 */
export function serieSeisMeses(
  movimentos: MovimentoStock[],
  hoje: Date,
  mesesPt: string[]
): { chave: string; label: string; entradas: number; saidas: number; mzn: number }[] {
  const serie: { chave: string; label: string; entradas: number; saidas: number; mzn: number }[] = [];
  const mapa = new Map<string, { entradas: number; saidas: number; mzn: number }>();
  for (const m of movimentos) {
    if (m.estado !== "confirmado") continue;
    const chave = (m.data_movimento || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(chave)) continue;
    if (!mapa.has(chave)) mapa.set(chave, { entradas: 0, saidas: 0, mzn: 0 });
    const l = mapa.get(chave)!;
    if (m.tipo === "entrada") {
      l.entradas += 1;
      l.mzn += (Number(m.preco_unitario) || 0) * (Number(m.quantidade) || 0);
    } else {
      l.saidas += 1;
    }
  }
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const l = mapa.get(chave) || { entradas: 0, saidas: 0, mzn: 0 };
    serie.push({ chave, label: mesCurto(chave, mesesPt), entradas: l.entradas, saidas: l.saidas, mzn: l.mzn });
  }
  return serie;
}

/** Linha de material do fecho CdM, já validada pelo servidor. */
export type LinhaFechoStock = {
  material: string;
  quantidade: number;
  valor_unitario: number;
};

/** Saída de stock que o fecho CdM deve criar, já agregada por material. */
export type SaidaFechoStock = {
  material_id: string;
  nome_material: string;
  quantidade: number;
  nomes_fecho: string[];
};

/**
 * ETAPA D - DESCONTO ÚNICO POR OBRA: transforma as linhas de material do
 * fecho CdM nas saídas de stock a criar. Três regras:
 * 1. Linhas do fecho com o MESMO material agregam-se numa saída só
 *    (quantidades somadas, arredondadas a 2 casas);
 * 2. Materiais em idsJaSaidos (material_ids que já têm saída ligada às
 *    peças da MESMA obra - pendente ou confirmado; um movimento
 *    rejeitado foi APAGADO, por isso não entra no conjunto) ficam de
 *    fora: o material já saiu do stock na oficina, o fecho deles serve
 *    só para FATURAR, não gera nova saída;
 * 3. Nomes sem material no catálogo ficam de fora (só faturação).
 */
export function saidasStockDoFecho(
  linhas: LinhaFechoStock[],
  catalogo: { id: string; nome: string; ativo: boolean }[],
  idsJaSaidos: string[] = []
): SaidaFechoStock[] {
  const jaSaidos = new Set(idsJaSaidos);
  const agregado = new Map<string, SaidaFechoStock>();
  for (const l of linhas) {
    const nome = (l.material || "").trim();
    const qtd = Number(l.quantidade);
    if (!nome || !Number.isFinite(qtd) || qtd <= 0) continue;
    const mat = casarMaterialFecho(nome, catalogo);
    if (!mat) continue;
    const h = agregado.get(mat.id);
    if (h) {
      h.quantidade = Math.round((h.quantidade + qtd) * 100) / 100;
      if (!h.nomes_fecho.includes(nome)) h.nomes_fecho.push(nome);
    } else {
      agregado.set(mat.id, {
        material_id: mat.id,
        nome_material: mat.nome,
        quantidade: Math.round(qtd * 100) / 100,
        nomes_fecho: [nome]
      });
    }
  }
  return [...agregado.values()].filter((s) => !jaSaidos.has(s.material_id));
}

/**
 * Casar o nome livre do fecho CdM (gases) com um material do catálogo,
 * sem acentos e sem diferenciar maiúsculas. Devolve o material ou null.
 */
export function casarMaterialFecho(
  nomeLivre: string,
  catalogo: { id: string; nome: string; ativo: boolean }[]
): { id: string; nome: string } | null {
  const alvo = normalizar(nomeLivre);
  if (!alvo) return null;
  const match = catalogo.find((m) => normalizar(m.nome) === alvo);
  if (match) return { id: match.id, nome: match.nome };
  // segunda passada: o catálogo contém o nome livre (ex. "Gas" dentro de "Gas Acetileno")
  const dentro = catalogo.find((m) => normalizar(m.nome).includes(alvo));
  return dentro ? { id: dentro.id, nome: dentro.nome } : null;
}

/**
 * Milhares com espaço e vírgula decimal, escrito à mão para o formato
 * ser EXACTAMENTE igual em qualquer sítio (navegador, Bun, Node): o
 * toLocaleString depende do ICU de cada runtime e dava números
 * diferentes no ecrã e nos testes.
 */
function milhares(n: number, casas: number): string {
  const partes = Math.abs(n).toFixed(casas).split(".");
  const inteiro = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const comDecimal = partes[1] ? `${inteiro},${partes[1]}` : inteiro;
  return n < 0 ? `-${comDecimal}` : comDecimal;
}

/** Número à portuguesa com espaço de milhar: 12345.5 -> "12 345,5". */
export function fmtNum(n: number | string | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0";
  if (Number.isInteger(v)) return milhares(v, 0);
  const s = milhares(v, 2);
  return s.includes(",") ? s.replace(/0+$/, "").replace(/,$/, "") : s;
}

/** Valor monetário: "12 345,50 MZN". */
export function fmtMzn(n: number | string | null | undefined): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return "0 MZN";
  return `${milhares(v, 2)} MZN`;
}

/** Data AAAA-MM-DD -> "DD/MM/AAAA" ("-" se faltar). */
export function fmtData(s?: string | null): string {
  if (!s || s.length < 10) return "-";
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}

/** Rótulo do material: "REF - Nome". */
export function rotuloMaterial(m?: Material | null): string {
  if (!m) return "-";
  return `${m.referencia} - ${m.nome}`;
}
