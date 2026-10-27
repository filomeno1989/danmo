/**
 * aquisicao.ts - Lógica do módulo Pedidos de Aquisição (Admin. Oficinal).
 *
 * Migração do hub antigo (aquisicao/*.html) com melhorias de analista:
 * - o NÚMERO do pedido passa a ser decidido no SERVIDOR (o hub calculava
 *   no navegador: duas gravações ao mesmo tempo nasciam com o mesmo
 *   número, o mesmo bug que duplicou a fatura 002/26 na Faturação);
 * - o juiz de validação vive aqui e é usado pela API (o formulário
 *   também usa, para avisar cedo, mas o servidor decide sempre).
 *
 * As tabelas (aquisicao_pedidos, aquisicao_itens, aquisicao_fornecedores,
 * aquisicao_denominacoes, aquisicao_contadores) já existem na base do
 * portal: o hub usava-as com a mesma chave. Nenhum SQL novo nesta fase.
 */

/** Pedido gravado em aquisicao_pedidos. */
export type PedidoAquisicao = {
  id: string;
  ano: number;
  numero: number;
  data_pedido: string; // ISO YYYY-MM-DD
  tipo_documento: string; // denominação: Cotação / Pro-forma / Venda a Dinheiro...
  numero_cotacao_proforma: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  solicitante: string;
  solicitante_codigo: string | null;
  observacao_geral: string | null;
  created_at?: string;
};

/** Linha de material de aquisicao_itens. */
export type ItemAquisicao = {
  id?: string;
  pedido_id?: string;
  numero_ordem: number;
  designacao: string;
  quantidade: number;
  unidade: string;
  aplicacao: string;
  observacao: string;
};

/** Fornecedor de aquisicao_fornecedores. */
export type FornecedorAq = {
  id: string;
  nome: string;
  contacto: string | null;
  morada: string | null;
  nuit: string | null;
  observacao: string | null;
  ativo: boolean;
};

/** Denominação de aquisicao_denominacoes (Cotação, Pro-forma...). */
export type DenominacaoAq = {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
};

/** Contador anual de aquisicao_contadores. */
export type ContadorAq = {
  id?: string;
  ano: number;
  proximo_numero: number;
};

/** Colaborador leve para o seletor de solicitante. */
export type ColaboradorAq = {
  id: number | string;
  name: string;
  code: string | null;
  setor: string | null;
};

/** Payload que o editor manda e a API valida (campos do pedido). */
export type DadosPedido = {
  data_pedido: string;
  tipo_documento: string;
  numero_cotacao_proforma: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  solicitante: string;
  solicitante_codigo: string | null;
  observacao_geral: string;
};

/** Unidades sugeridas no datalist do hub (livre, mas com atalhos). */
export const UNIDADES_AQ = [
  "Un", "Kg", "L", "m", "m²", "m³", "Cx", "Saco", "Rolo", "Par", "Galão", "Pacote"
];

/** 002/2026 - o formato que o papel e a lista sempre mostraram. */
export function numeroFmt(ano: number, numero: number): string {
  return `${String(numero).padStart(3, "0")}/${ano}`;
}

/** Data ISO YYYY-MM-DD -> DD/MM/YYYY (o papel usa pt-PT). */
export function fmtDataAq(iso: string | null | undefined): string {
  if (!iso) return "-";
  const partes = String(iso).slice(0, 10).split("-");
  if (partes.length !== 3) return "-";
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

/**
 * Próximo número do ano: o MAIOR entre
 * - o contador configurado à mão em Configurações > Numeração (para
 *   continuar a numeração vinda do papel) e
 * - o último número já gravado nesse ano.
 * Igual ao hub, mas agora correndo sempre no SERVIDOR.
 */
export function proximoNumero(ano: number, contador: number | undefined, ultimoGravado: number | undefined): number {
  const peloHistorico = (ultimoGravado || 0) + 1;
  const peloContador = contador || 1;
  return Math.max(peloHistorico, peloContador);
}

/**
 * Juiz de validação do pedido (o mesmo para o editor e para a API).
 * Devolve o texto do problema ou null se estiver tudo bem.
 */
export function problemaDoPedido(
  dados: Partial<DadosPedido>,
  itens: Partial<ItemAquisicao>[]
): string | null {
  if (!dados.data_pedido) return "Indica a data do pedido.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data_pedido)) return "Data do pedido inválida.";
  if (!dados.tipo_documento?.trim()) return "Selecciona a denominação.";
  if (!dados.numero_cotacao_proforma?.trim()) return "Indica o nº da Cotação / Pro-forma.";
  if (!dados.fornecedor_id?.trim()) return "Selecciona um fornecedor.";
  if (!dados.fornecedor_nome?.trim()) return "Selecciona um fornecedor.";
  if (!dados.solicitante?.trim()) return "Selecciona o solicitante na lista.";
  if (!itens.length) return "Adiciona pelo menos um item.";
  const semNome = itens.some((i) => !i.designacao?.trim());
  if (semNome) return "Preenche a designação de todos os itens.";
  const qtdRuim = itens.some((i) => !(Number(i.quantidade) > 0));
  if (qtdRuim) return "A quantidade de todos os itens tem de ser maior que zero.";
  return null;
}

/**
 * Normaliza as linhas para gravar: ordem sequencial 1..n, textos aparados,
 * quantidade numericamente honesta (o hub gravava o que viesse).
 */
export function itensParaGravar(itens: Partial<ItemAquisicao>[]): ItemAquisicao[] {
  return itens.map((i, idx) => ({
    numero_ordem: idx + 1,
    designacao: String(i.designacao || "").trim(),
    quantidade: Number(i.quantidade) || 1,
    unidade: String(i.unidade || "").trim(),
    aplicacao: String(i.aplicacao || "").trim(),
    observacao: String(i.observacao || "").trim()
  }));
}

/** Pesquisa sem acentos: fonte única no uso-comum (import e re-export). */
import { semAcentos } from "./uso-comum";
export { semAcentos };

/** Alvo de pesquisa de um pedido: nº formatado, solicitante, fornecedor e materiais. */
export function alvoPesquisaPedido(
  p: PedidoAquisicao,
  designacoes: string[]
): string {
  return semAcentos(
    [numeroFmt(p.ano, p.numero), p.solicitante || "", p.fornecedor_nome || "", p.tipo_documento || "",
     p.numero_cotacao_proforma || "", designacoes.join(" ")].join(" ")
  );
}

/**
 * Texto da caixa de referência do papel (fiel ao hub):
 * "Pro-forma nº 13429  ·  Fornecedor: Carlos Ferreira...".
 */
export function textoReferencia(p: { tipo_documento: string; numero_cotacao_proforma: string; fornecedor_nome: string }): string {
  return `${p.tipo_documento} nº ${p.numero_cotacao_proforma}  ·  Fornecedor: ${p.fornecedor_nome}`;
}

/** KPIs do painel, todos derivados da lista (função pura, testável). */
export function statsPainel(pedidos: PedidoAquisicao[], fornecedoresAtivos: number, hoje: string) {
  const ano = Number(hoje.slice(0, 4));
  const mes = Number(hoje.slice(5, 7));
  const doAno = pedidos.filter((p) => p.ano === ano);
  const doMes = doAno.filter((p) => Number(p.data_pedido?.slice(5, 7)) === mes);

  const contagem: Record<string, number> = {};
  for (const p of pedidos) {
    const nome = p.fornecedor_nome || "Desconhecido";
    contagem[nome] = (contagem[nome] || 0) + 1;
  }
  const top = Object.entries(contagem).sort((a, b) => b[1] - a[1]);

  const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const porMes = MESES.map((label, i) => ({
    label,
    count: doAno.filter((p) => Number(p.data_pedido?.slice(5, 7)) === i + 1).length
  }));

  return {
    ano,
    totalAno: doAno.length,
    totalMes: doMes.length,
    fornecedoresAtivos,
    topFornecedor: top[0]?.[0] || null,
    topFornecedorQtd: top[0]?.[1] || 0,
    topCinco: top.slice(0, 5).map(([label, count]) => ({ label, count })),
    porMes
  };
}
