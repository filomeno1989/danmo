/**
 * faturacao.ts - Motor puro da Faturação da Administração (Cotações e
 * Faturas), migrado do danmo-hub/faturacao.
 *
 * Funções SEM efeitos secundários: os totais, a numeração anual, o
 * número por extenso e a limpeza do HTML rico são calculados aqui e
 * usados igualmente pelo SERVIDOR (APIs, impressão) e pelos testes.
 *
 * Migração (decisões do Filomeno, 22/10/2026):
 * - Numeração por TIPO e por ANO, no formato 001/2026 (4 dígitos):
 *   reinicia a cada início de ano. Dentro de 2026 continua a sequência
 *   dos documentos antigos (001/26, 002/26... = ano 2026).
 * - Itens de material do CLIENTE (item_tipo "material_cliente"):
 *   descritos no documento, com valor 0, não entram nos totais e saem
 *   no Anexo de Material na impressão. Substitui o Excel à parte.
 * - Cotação -> Fatura: o editor abre com ?de=<id> e copia tudo; cada
 *   documento mantém a SUA numeração.
 */

export type TipoDocumento = "cotacao" | "fatura";
export type ServicoTipo = "mao" | "material" | "misto";
export type TipoCliente = "interno" | "externo" | "outro";
export type ItemTipo = "mao" | "material" | "material_cliente";
export type TipoDesconto = "fixo" | "pct";
export type Moeda = "MZN" | "USD";

export const UNIDADES = [
  "horas", "hora", "dias", "Und", "Litro", "Kg",
  "Metro", "Par", "Caixa", "Rolo", "Tonelada", "m²", "ml"
] as const;

export const SERVICO_LABEL: Record<ServicoTipo, string> = {
  mao: "Mão-de-Obra",
  material: "Material",
  misto: "Misto"
};

export const TIPO_CLIENTE_INFO: Record<TipoCliente, string> = {
  interno: "Tarifa interna aplicada (CdM e afiliadas)",
  externo: "Tarifa externa aplicada (clientes terceiros)",
  outro: "Tarifa personalizada - definir manualmente"
};

export type ItemFaturacao = {
  id?: string;
  ordem: number;
  item_tipo: ItemTipo;
  tecnico_id: string | null;
  tecnico_nome: string | null;
  descricao: string | null;
  qtd: number;
  tempo: number;
  unidade: string;
  valor_unit: number;
  total: number;
};

export type DocFaturacao = {
  id: string;
  tipo: TipoDocumento;
  numero: string;
  data: string;
  servico: ServicoTipo;
  moeda: Moeda;
  taxa_cambio: number;
  iva_incluido: boolean;
  iva_pct: number;
  tipo_cliente: TipoCliente;
  cliente_nome: string;
  cliente_morada: string | null;
  cliente_nuit: string | null;
  cliente_contacto: string | null;
  enviado_nome: string | null;
  enviado_cargo: string | null;
  assunto: string | null;
  subtotal: number;
  desconto: number;
  desconto_tipo: TipoDesconto;
  desconto_input: number;
  iva_amt: number;
  total: number;
  total_mzn: number;
  utilizador_id: string | null;
  utilizador_nome: string | null;
  utilizador_cargo: string | null;
  criado_em?: string;
  atualizado_em?: string;
};

export type ClienteFat = {
  id: string;
  nome: string;
  morada: string | null;
  nuit: string | null;
  contacto: string | null;
  ativo: boolean;
};

export type TecnicoFat = {
  id: string;
  nome: string;
  tarifa_mzn: number;
  tarifa_usd: number;
  ativo: boolean;
};

export type TarifaFat = {
  id: string;
  descricao: string;
  valor_mzn: number;
  ativo: boolean;
};

const arred2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/* ------------------------------------------------------------------
 * Totais
 * ------------------------------------------------------------------ */

/** Total de uma linha. Material do cliente vale sempre 0 (não faturado). */
export function totalItem(
  item: Pick<ItemFaturacao, "item_tipo" | "qtd" | "tempo" | "valor_unit">,
  servico: ServicoTipo
): number {
  if (item.item_tipo === "material_cliente") return 0;
  const eMaterial = item.item_tipo === "material" || servico === "material";
  const qtd = Number(item.qtd) || 0;
  if (eMaterial) return arred2(qtd * (Number(item.valor_unit) || 0));
  const tempo = Number(item.tempo) || 0;
  return arred2(qtd * tempo * (Number(item.valor_unit) || 0));
}

export type TotaisDoc = {
  subtotal: number;
  desconto: number;
  desconto_label: string;
  apos_desconto: number;
  iva: number;
  total: number;
  total_mzn: number;
};

/**
 * Totais do documento a partir das linhas. O subtotal EXCLUI material
 * do cliente. O IVA incide sobre o valor após desconto.
 */
export function calcTotais(
  itens: Pick<ItemFaturacao, "item_tipo" | "qtd" | "tempo" | "valor_unit">[],
  servico: ServicoTipo,
  opcoes: {
    desconto_input: number;
    desconto_tipo: TipoDesconto;
    iva_incluido: boolean;
    iva_pct: number;
    moeda: Moeda;
    taxa_cambio: number;
  }
): TotaisDoc {
  const subtotal = arred2(
    itens.reduce((soma, it) => soma + totalItem(it, servico), 0)
  );
  const entrada = Math.max(0, Number(opcoes.desconto_input) || 0);
  const desconto = arred2(
    opcoes.desconto_tipo === "pct" ? (subtotal * entrada) / 100 : entrada
  );
  const apos = Math.max(0, arred2(subtotal - desconto));
  const pct = Math.min(100, Math.max(0, Number(opcoes.iva_pct) || 0));
  const iva = arred2(opcoes.iva_incluido ? (apos * pct) / 100 : 0);
  const total = arred2(apos + iva);
  const taxa = Number(opcoes.taxa_cambio) > 0 ? Number(opcoes.taxa_cambio) : 64;
  const totalMzn = arred2(opcoes.moeda === "USD" ? total * taxa : total);

  const desconto_label =
    desconto > 0
      ? opcoes.desconto_tipo === "pct"
        ? `- ${fmtNum(desconto)} ${opcoes.moeda} (${entrada}%)`
        : `- ${fmtNum(desconto)} ${opcoes.moeda}`
      : "0,00";

  return {
    subtotal,
    desconto,
    desconto_label,
    apos_desconto: apos,
    iva,
    total,
    total_mzn: totalMzn
  };
}

/* ------------------------------------------------------------------
 * Totais do ano por tipo (Painel)
 * ------------------------------------------------------------------ */

export type TotaisAnoTipo = { faturas: number; cotacoes: number };

/**
 * Soma dos totais em MZN por TIPO, só dos documentos com data no ano
 * pedido. Cotação e fatura nunca somam no mesmo número: quando a cotação
 * vira fatura o mesmo trabalho entrava duas vezes no "Total do ano" do
 * painel e o valor dobrava. O dinheiro do ano é o das FATURAS; as
 * cotações ficam à parte (são proposta, não receita).
 */
export function totaisAnoPorTipo(
  docs: { tipo: string; data?: string; total_mzn?: number | null }[],
  ano: number
): TotaisAnoTipo {
  let faturas = 0;
  let cotacoes = 0;
  for (const d of docs) {
    if (String(d.data || "").slice(0, 4) !== String(ano)) continue;
    const v = Number(d.total_mzn) || 0;
    if (d.tipo === "fatura") faturas += v;
    else if (d.tipo === "cotacao") cotacoes += v;
  }
  return { faturas: arred2(faturas), cotacoes: arred2(cotacoes) };
}

/* ------------------------------------------------------------------
 * Numeração: 001/2026, por tipo, reinicia a cada ano
 * ------------------------------------------------------------------ */

/** Ano contido no número (001/2026 -> 2026; 001/26 -> 2026). Null se inválido. */
export function anoDoNumero(numero: string): number | null {
  const m = /^(\d{1,6})\/(\d{2}|\d{4})$/.exec(String(numero || "").trim());
  if (!m) return null;
  const y = Number(m[2]);
  return m[2].length === 2 ? 2000 + y : y;
}

/** Formato novo obrigatório em documentos NOVOS: 001/2026. */
export function numeroNovoValido(numero: string): boolean {
  return /^\d{1,6}\/\d{4}$/.test(String(numero || "").trim());
}

/** Formatos aceites a EDITAR (documentos antigos usam 2 dígitos). */
export function numeroEdicaoValido(numero: string): boolean {
  return /^\d{1,6}\/(\d{2}|\d{4})$/.test(String(numero || "").trim());
}

/**
 * Próximo número do tipo no ano dado. Conta os documentos do MESMO tipo
 * cujo ano (do número, ou da data quando o número é inválido) seja o ano
 * pedido e soma 1 ao maior. Em 2026, com faturas 001/26 a 010/26, sugere
 * 011/2026; em 2027 reinicia em 001/2027.
 */
export function proximoNumero(
  tipo: TipoDocumento,
  docs: { tipo: string; numero: string; data?: string }[],
  ano: number
): string {
  let max = 0;
  for (const d of docs) {
    if (d.tipo !== tipo) continue;
    let y = anoDoNumero(d.numero);
    if (y === null && d.data) y = Number(String(d.data).slice(0, 4)) || null;
    if (y !== ano) continue;
    const m = /^(\d{1,6})\//.exec(String(d.numero || "").trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${String(max + 1).padStart(3, "0")}/${ano}`;
}

/** Número repetido no mesmo tipo (fora o próprio documento). */
export function numeroDuplicado(
  tipo: string,
  numero: string,
  docs: { id: string; tipo: string; numero: string }[],
  proprioId?: string
): boolean {
  const alvo = String(numero || "").trim().toLowerCase();
  return docs.some(
    (d) =>
      d.id !== proprioId &&
      d.tipo === tipo &&
      String(d.numero || "").trim().toLowerCase() === alvo
  );
}

/* ------------------------------------------------------------------
 * Número por extenso (migrado 1 para 1 do hub, mantém o discurso)
 * ------------------------------------------------------------------ */

export function fmtNum(n: number): string {
  if (Number.isNaN(Number(n)) || n === null || n === undefined) return "0,00";
  const neg = Number(n) < 0;
  const [int, dec] = Math.abs(Number(n)).toFixed(2).split(".");
  const agrupado = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return (neg ? "-" : "") + agrupado + "," + dec;
}

export function numPorExtenso(numero: number): string {
  numero = Math.round(numero * 100) / 100;
  if (!numero || numero === 0) return "Zero meticais";

  const unidades = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
  const dezenas10 = ["dez", "onze", "doze", "treze", "catorze", "quinze", "dezasseis", "dezassete", "dezoito", "dezanove"];
  const dezenas = ["", "dez", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  function converteBloco(n: number): string {
    if (n === 0) return "";
    if (n === 100) return "cem";
    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;
    const partes: string[] = [];
    if (c > 0) partes.push(centenas[c]);
    if (d === 1) {
      partes.push(dezenas10[u]);
    } else {
      if (d > 1) partes.push(dezenas[d]);
      if (u > 0) partes.push(unidades[u]);
    }
    return partes.join(" e ");
  }

  const meticais = Math.floor(numero);
  const centavos = Math.round((numero - meticais) * 100);
  const resultado: string[] = [];

  if (meticais > 0) {
    const bilhoes = Math.floor(meticais / 1000000000);
    const milhoes = Math.floor((meticais % 1000000000) / 1000000);
    const milhares = Math.floor((meticais % 1000000) / 1000);
    const resto = meticais % 1000;
    const partes: string[] = [];

    if (bilhoes > 0)
      partes.push(converteBloco(bilhoes) + (bilhoes === 1 ? " bilião" : " biliões"));
    if (milhoes > 0)
      partes.push(converteBloco(milhoes) + (milhoes === 1 ? " milhão" : " milhões"));
    if (milhares > 0) {
      let strMilhares = converteBloco(milhares);
      if (strMilhares === "um") strMilhares = "";
      partes.push((strMilhares ? strMilhares + " " : "") + "mil");
    }
    if (resto > 0) {
      const strResto = converteBloco(resto);
      if (partes.length > 0) {
        if (resto < 100 || resto % 100 === 0) partes.push("e " + strResto);
        else partes.push(strResto);
      } else {
        partes.push(strResto);
      }
    } else if ((bilhoes > 0 || milhoes > 0) && milhares === 0 && resto === 0) {
      partes.push("de");
    }

    let strExtenso = partes.join(" ").replace(/\s+/g, " ").trim();
    strExtenso += meticais === 1 ? " metical" : " meticais";
    resultado.push(strExtenso);
  }

  if (centavos > 0) {
    resultado.push(
      converteBloco(centavos) + (centavos === 1 ? " centavo" : " centavos")
    );
  }

  const final = resultado.join(" e ");
  return final.charAt(0).toUpperCase() + final.slice(1);
}

/* ------------------------------------------------------------------
 * HTML rico: limpeza no SERVIDOR (sem DOMParser)
 * ------------------------------------------------------------------ */

const TAGS_PERMITIDAS = ["b", "strong", "i", "em", "u", "s", "p", "div", "br", "ul", "ol", "li", "span"];

const STYLE_TEXTO_OK = /^text-align\s*:\s*[a-z-]+\s*;?$/i;

/**
 * Mantém apenas as etiquetas de formatação usadas pelo editor
 * (negrito, itálico, sublinhado, riscado, parágrafos, listas, spans)
 * e o único style aceito: text-align. Todo o resto sai - etiquetas,
 * atributos, comentários e blocos script/style inteiros.
 */
export function sanitizarHTMLRico(html: string): string {
  let s = String(html || "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");

  let mudou = true;
  let rondas = 0;
  while (mudou && rondas < 20) {
    mudou = false;
    rondas += 1;
    s = s.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*)?)>/g, (_m, barra, tag, attrs) => {
      const t = String(tag).toLowerCase();
      if (!TAGS_PERMITIDAS.includes(t)) {
        mudou = true;
        return "";
      }
      if (barra) return `</${t}>`;
      const mStyle = /style\s*=\s*["']([^"']*)["']/i.exec(String(attrs || ""));
      const style = mStyle && STYLE_TEXTO_OK.test(mStyle[1].trim())
        ? ` style="${mStyle[1].trim().replace(/;+$/, "")}"`
        : "";
      if ((String(attrs || "").trim() || "") !== style.trim()) mudou = true;
      return `<${t}${style}>`;
    });
  }
  return s;
}

/** Texto simples de um HTML rico (para listas, pesquisas e Excel). */
export function textoSemTags(str: string): string {
  if (!str) return "";
  let s = String(str);
  if (!/<[a-z][^>]*>/i.test(s)) return s.replace(/\s+/g, " ").trim();
  s = sanitizarHTMLRico(s);
  s = s
    .replace(/<(br|\/p|\/div|\/li)\s*>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Escapa HTML em texto simples (nomes de cliente, descrições...). */
export function escaparHTML(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Descrição no papel do impresso, igual ao renderAssunto do print.html
 * do hub: HTML rico passa pelo allowlist (o servidor já limpa ao gravar,
 * na impressão a limpeza repete-se como no hub) e TEXTO SIMPLES antigo
 * (documentos do tempo do billing, com quebras de linha) é escapado com
 * as quebras viradas <br> - sem isto a descrição antiga sai colapsada
 * num parágrafo só no papel.
 */
export function renderAssuntoImpresso(raw: string): string {
  const s = String(raw || "");
  if (/<[a-z][^>]*>/i.test(s)) return sanitizarHTMLRico(s);
  return escaparHTML(s).replace(/\n/g, "<br>");
}

/* ------------------------------------------------------------------
 * Datas e formatação para a impressão
 * ------------------------------------------------------------------ */

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
];

/** "22/10/2026" (ou com hora) a partir de AAAA-MM-DD. */
export function fmtData(dataISO: string, comHora = false): string {
  if (!dataISO) return "-";
  const [d, hora] = String(dataISO).split("T");
  const p = d.split("-");
  if (p.length !== 3) return String(dataISO);
  const base = `${p[2]}/${p[1]}/${p[0]}`;
  if (!comHora || !hora) return base;
  return `${base} ${hora.slice(0, 5)}`;
}

/** "Beira, 22 de outubro de 2026" (linha de assinatura da impressão). */
export function dataExtenso(dataISO: string): string {
  if (!dataISO) return "";
  const p = String(dataISO).split("-");
  if (p.length !== 3) return "";
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  return `Beira, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

/** Hoje em AAAA-MM-DD na hora de Maputo (UTC+2). */
export function hojeISO(): string {
  return new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Ano corrente (hora de Maputo). */
export function anoActual(): number {
  return Number(hojeISO().slice(0, 4));
}

/* ------------------------------------------------------------------
 * Normalização do documento vindo do cliente (APIs)
 * ------------------------------------------------------------------ */

export type DocEntrada = {
  tipo: string;
  numero: string;
  data: string;
  servico: string;
  moeda: string;
  taxa_cambio: number;
  iva_incluido: boolean;
  iva_pct: number;
  tipo_cliente: string;
  cliente_nome: string;
  cliente_morada: string;
  cliente_nuit: string;
  cliente_contacto: string;
  enviado_nome: string;
  enviado_cargo: string;
  assunto: string;
  desconto_input: number;
  desconto_tipo: string;
  itens: {
    item_tipo: string;
    tecnico_id: string | null;
    descricao: string | null;
    qtd: number;
    tempo: number;
    unidade: string;
    valor_unit: number;
  }[];
};

export type ValidacaoDoc = {
  ok: boolean;
  erro?: string;
  dados?: {
    tipo: TipoDocumento;
    numero: string;
    data: string;
    servico: ServicoTipo;
    moeda: Moeda;
    taxa_cambio: number;
    iva_incluido: boolean;
    iva_pct: number;
    tipo_cliente: TipoCliente;
    cliente_nome: string;
    cliente_morada: string;
    cliente_nuit: string;
    cliente_contacto: string;
    enviado_nome: string;
    enviado_cargo: string;
    assunto: string;
    desconto_input: number;
    desconto_tipo: TipoDesconto;
    itens: ItemFaturacao[];
    subtotal: number;
    desconto: number;
    iva_amt: number;
    total: number;
    total_mzn: number;
  };
};

const corta = (v: unknown, max: number) =>
  String(v === undefined || v === null ? "" : v).slice(0, max);

/**
 * Valida e normaliza um documento recebido do navegador:
 * recalcula TODOS os valores (o navegador nunca manda totais), limpa
 * o HTML da descrição e resolve o nome do técnico no servidor.
 */
export function validarDocEntrada(
  corpo: unknown,
  tecnicos: { id: string; nome: string }[],
  opcoes: { novo: boolean }
): ValidacaoDoc {
  const c = (corpo || {}) as Record<string, unknown>;

  const tipo = c.tipo === "fatura" ? "fatura" : "cotacao";
  const numero = corta(c.numero, 20).trim();
  const data = corta(c.data, 10).trim();
  const servico: ServicoTipo =
    c.servico === "material" ? "material" : c.servico === "misto" ? "misto" : "mao";
  const moeda: Moeda = c.moeda === "USD" ? "USD" : "MZN";
  const taxa = Number(c.taxa_cambio);
  const ivaIncluido = c.iva_incluido === true;
  const ivaPct = Number(c.iva_pct);
  const tipoCliente: TipoCliente =
    c.tipo_cliente === "externo" ? "externo" : c.tipo_cliente === "outro" ? "outro" : "interno";
  const clienteNome = corta(c.cliente_nome, 160).trim();
  const descontoTipo: TipoDesconto = c.desconto_tipo === "pct" ? "pct" : "fixo";
  const descontoInput = Math.max(0, Number(c.desconto_input) || 0);

  if (!numero) return { ok: false, erro: "Insira o número do documento." };
  if (!(opcoes.novo ? numeroNovoValido(numero) : numeroEdicaoValido(numero)))
    return {
      ok: false,
      erro: opcoes.novo
        ? "Número no formato antigo. Os novos documentos usam 001/2026 (4 dígitos no ano)."
        : "Número inválido (ex.: 001/2026)."
    };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data))
    return { ok: false, erro: "Data inválida." };
  if (!clienteNome) return { ok: false, erro: "Insira o nome do cliente." };
  if (!Number.isFinite(taxa) || taxa <= 0)
    return { ok: false, erro: "Taxa de câmbio inválida." };
  if (!Number.isFinite(ivaPct) || ivaPct < 0 || ivaPct > 100)
    return { ok: false, erro: "Percentagem de IVA inválida (0 a 100)." };

  const itensBrutos = Array.isArray(c.itens) ? (c.itens as Record<string, unknown>[]) : [];
  const itens: ItemFaturacao[] = [];
  for (let i = 0; i < itensBrutos.length; i++) {
    const bruto = itensBrutos[i] || {};
    let tipoItem: ItemTipo =
      bruto.item_tipo === "material"
        ? "material"
        : bruto.item_tipo === "material_cliente"
          ? "material_cliente"
          : "mao";
    if (servico === "mao") tipoItem = "mao";
    if (servico === "material" && tipoItem === "mao") tipoItem = "material";
    if (tipoItem === "material_cliente" && servico === "mao") tipoItem = "material";
    if (tipoItem === "mao" && servico === "material") tipoItem = "material";

    const tecnicoId = bruto.tecnico_id ? corta(bruto.tecnico_id, 40) : "";
    const tecnico = tecnicoId ? tecnicos.find((t) => t.id === tecnicoId) : null;
    const qtd = Number(bruto.qtd);
    const tempo = Number(bruto.tempo);
    const vu = Number(bruto.valor_unit);
    const item: ItemFaturacao = {
      ordem: i,
      item_tipo: tipoItem,
      tecnico_id: tecnico ? tecnico.id : null,
      tecnico_nome: tecnico ? tecnico.nome : null,
      descricao: tipoItem === "mao" ? null : corta(bruto.descricao, 400) || null,
      qtd: Number.isFinite(qtd) && qtd > 0 ? arred2(qtd) : 1,
      tempo: Number.isFinite(tempo) && tempo > 0 ? arred2(tempo) : 1,
      unidade: corta(bruto.unidade, 30) || (tipoItem === "mao" ? "horas" : "Und"),
      valor_unit: Number.isFinite(vu) && vu >= 0 ? arred2(vu) : 0,
      total: 0
    };
    item.total = totalItem(item, servico);
    itens.push(item);
  }

  const tot = calcTotais(itens, servico, {
    desconto_input: descontoInput,
    desconto_tipo: descontoTipo,
    iva_incluido: ivaIncluido,
    iva_pct: ivaPct,
    moeda,
    taxa_cambio: taxa
  });

  return {
    ok: true,
    dados: {
      tipo,
      numero,
      data,
      servico,
      moeda,
      taxa_cambio: taxa,
      iva_incluido: ivaIncluido,
      iva_pct: ivaPct,
      tipo_cliente: tipoCliente,
      cliente_nome: clienteNome,
      cliente_morada: corta(c.cliente_morada, 200),
      cliente_nuit: corta(c.cliente_nuit, 40),
      cliente_contacto: corta(c.cliente_contacto, 80),
      enviado_nome: corta(c.enviado_nome, 120),
      enviado_cargo: corta(c.enviado_cargo, 120),
      assunto: sanitizarHTMLRico(corta(c.assunto, 20000)),
      desconto_input: descontoInput,
      desconto_tipo: descontoTipo,
      itens,
      subtotal: tot.subtotal,
      desconto: tot.desconto,
      iva_amt: tot.iva,
      total: tot.total,
      total_mzn: tot.total_mzn
    }
  };
}
