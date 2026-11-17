/**
 * escalas-import.ts - Leitor dos Excel da escala (mensal 2026).
 *
 * Lê o ficheiro ESCALA MENSAL que a casa já usa e extrai 3 coisas:
 * 1. o REGISTO da gente (Configuração: código, nome, contacto,
 *    categoria) com área e grupo de turno deduzidos da categoria;
 * 2. as GRELHAS dos meses (folhas JAN 2026, FEV 2026...): cada célula
 *    com código válido da legenda vira uma linha de esc_dias;
 * 3. as FOLGAS guardadas (coluna Anterior da folha mais recente).
 *
 * O Excel tinha VLOOKUP que rebentava em #N/A quando o nome divergia
 * da Configuração (Barreto/Sousa "Candiado" escrito de duas maneiras)
 * e códigos EST repetidos para estagiários. Aqui o nome resolve o
 * código e os EST ganham sufixo único (EST-01, EST-02...), com tudo o
 * que for estranho listado em `problemas` - nada é adivinhado às
 * escondidas. Função PURA: usada pela página de importação e pelas
 * provas (que leem o Excel real da raiz do projeto).
 */

import * as XLSX from "xlsx";
import { CODIGOS_ESCALA, areaDeCategoria, grupoDeCategoria, type AreaEscala } from "./escalas";

export type ImportColab = {
  codigo: string;
  nome: string;
  contacto: string;
  categoria: string;
  area: string;
  grupo: string | null;
  colaborador_id: number | null;
  ordem: number;
};

export type ImportCelula = { codigo: string; data: string; codigo_escala: string };

export type ImportMes = {
  ano: number;
  mes: number;
  celulas: ImportCelula[];
};

export type ImportFolga = { codigo: string; valor: number; obs: string };

export type ImportDados = {
  colaboradores: ImportColab[];
  meses: ImportMes[];
  folgas: ImportFolga[];
  problemas: string[];
};

/** Nome de comparação: espaços colapsados, sem acentos, minúsculas. */
export function chaveNome(nome: string): string {
  return String(nome || "")
    .replace(/\s+/g, " ")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Distância de Levenshtein (nomes divergentes do Excel, ex. Candiado/Candido). */
function levenshtein(a: string, b: string): number {
  const n = a.length;
  const m = b.length;
  if (!n) return m;
  if (!m) return n;
  let anterior = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i++) {
    const atual = [i];
    for (let j = 1; j <= m; j++) {
      atual[j] = Math.min(
        anterior[j] + 1,
        atual[j - 1] + 1,
        anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    anterior = atual;
  }
  return anterior[m];
}

const VARIANTES_CODIGO: Record<string, string> = {
  "07/19": "07/19",
  "07-19": "07/19",
  "19/07": "19/07",
  "19-07": "19/07",
  norm: "Norm.",
  "norm.": "Norm.",
  folga: "Folga",
  sup: "Sup.",
  "sup.": "Sup.",
  esc: "Esc.",
  "esc.": "Esc.",
  ld: "LD",
  frd: "FRD",
  ccis: "CCIS",
  tdp: "TDP"
};

/** Normaliza o código escrito no Excel para o código da legenda. */
export function normalizaCodigo(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "#N/A" || s.startsWith("#")) return null;
  const chave = s.replace(/\s+/g, " ").toLowerCase().replace("-", "/").replace("/", "/").trim();
  const direto = (CODIGOS_ESCALA as readonly string[]).find((c) => c.toLowerCase() === chave);
  if (direto) return direto;
  return VARIANTES_CODIGO[chave.replace(/ /g, "")] || VARIANTES_CODIGO[chave] || null;
}

/** A folha de configuração (código, nome, categoria, contacto por linha). */
function lerConfiguracao(
  wb: XLSX.WorkBook,
  problemas: string[]
): {
    porNome: Map<string, { codigo: string; nome: string; categoria: string; contacto: string }>;
    lista: { codigo: string; nome: string; categoria: string; contacto: string }[];
  } {
  const nomeFolha = wb.SheetNames.find((n) => n.trim().toLowerCase().startsWith("configura")) || wb.SheetNames[0];
  const ws = wb.Sheets[nomeFolha];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  const porNome = new Map<string, { codigo: string; nome: string; categoria: string; contacto: string }>();
  const lista: { codigo: string; nome: string; categoria: string; contacto: string }[] = [];
  for (const lin of linhas) {
    if (!Array.isArray(lin)) continue;
    const codigo = lin[2] == null ? "" : String(lin[2]).trim();
    const nome = lin[3] == null ? "" : String(lin[3]).trim();
    if (!nome || nome === "Nome" || codigo === "Nr." || codigo.startsWith("#")) continue;
    const categoria = lin[4] == null ? "" : String(lin[4]).trim();
    const contacto = lin[5] == null ? "" : String(lin[5]).trim();
    const chave = chaveNome(nome);
    if (!chave) continue;
    if (porNome.has(chave)) {
      problemas.push(`Configuração: nome repetido "${nome}" (mantido o 1º).`);
      continue;
    }
    porNome.set(chave, { codigo, nome, categoria, contacto });
    lista.push({ codigo, nome, categoria, contacto });
  }
  return { porNome, lista };
}

/** Ano/mês de uma folha mensal, pela data do "Prim. Dia Mês" ou pelo nome. */
function periodoDaFolha(ws: XLSX.WorkSheet, nomeFolha: string): { ano: number; mes: number } | null {
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
  const c1 = linhas[0]?.[2];
  if (c1 instanceof Date && !Number.isNaN(c1.getTime())) {
    return { ano: c1.getFullYear(), mes: c1.getMonth() + 1 };
  }
  const texto = String(c1 || "").trim();
  const m = texto.match(/^(\d{4})-(\d{2})/);
  if (m) return { ano: Number(m[1]), mes: Number(m[2]) };
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const mn = nomeFolha.toLowerCase().match(/^([a-zç]{3})\w*\s+(\d{4})$/);
  if (mn) {
    const idx = meses.indexOf(mn[1].slice(0, 3));
    if (idx >= 0) return { ano: Number(mn[2]), mes: idx + 1 };
  }
  return null;
}

/** Lê o workbook inteiro e devolve os dados prontos para importar. */
export function lerEscalasDeWorkbook(wb: XLSX.WorkBook): ImportDados {
  const problemas: string[] = [];
  const { porNome, lista } = lerConfiguracao(wb, problemas);

  /** Resolve o código de um nome: exacto, depois aproximação ÚNICA. */
  const resolverCodigo = (
    nome: string
  ): { codigo: string; nome: string; categoria: string; contacto: string } | null => {
    const chave = chaveNome(nome);
    const direto = porNome.get(chave);
    if (direto) return direto;
    const candidatos = lista.filter(
      (c) => levenshtein(chaveNome(c.nome), chave) <= 2
    );
    if (candidatos.length === 1) {
      problemas.push(
        `Nome aproximado: "${nome}" tratado como "${candidatos[0].nome}" (${candidatos[0].codigo}). Confirma no registo.`
      );
      return candidatos[0];
    }
    if (candidatos.length > 1) {
      problemas.push(`Nome ambíguo: "${nome}" parece ${candidatos.length} pessoas da Configuração. Fica sem código.`);
    }
    return null;
  };

  // 1. Registo: a Configuração é a base; as folhas mensais actualizam a
  //    categoria (os grupos mudam ao longo do ano, a última folha manda).
  const registo = new Map<string, ImportColab>();
  const garantir = (nome: string): ImportColab | null => {
    const chave = chaveNome(nome);
    if (!chave) return null;
    const existente = registo.get(chave);
    if (existente) return existente;
    const cfg = porNome.get(chave);
    if (!cfg) {
      const aproxCfg = resolverCodigo(nome);
      if (!aproxCfg) {
        problemas.push(`Sem código: "${nome}" (não está na Configuração).`);
      }
      const c0: ImportColab = {
        codigo: aproxCfg?.codigo || "",
        nome: nome.replace(/\s+/g, " ").trim(),
        contacto: aproxCfg?.contacto || "",
        categoria: aproxCfg?.categoria || "",
        area: aproxCfg ? areaDeCategoria(aproxCfg.categoria) : "Outros",
        grupo: aproxCfg ? grupoDeCategoria(aproxCfg.categoria) : null,
        colaborador_id: null,
        ordem: 999
      };
      registo.set(chave, c0);
      // alias: a grafia certa da Configuração passa a resolver para a
      // MESMA pessoa (Candido e Candiado são o Barreto DM0247)
      if (aproxCfg) {
        const chaveCfg = chaveNome(aproxCfg.nome);
        if (chaveCfg && !registo.has(chaveCfg)) registo.set(chaveCfg, c0);
      }
      return c0;
    }
    const c = {
      codigo: cfg.codigo,
      nome: nome.replace(/\s+/g, " ").trim(),
      contacto: cfg.contacto,
      categoria: cfg.categoria,
      area: areaDeCategoria(cfg.categoria),
      grupo: grupoDeCategoria(cfg.categoria),
      colaborador_id: null,
      ordem: 999
    };
    registo.set(chave, c);
    return c;
  };

  // 2. Folhas mensais: códigos por célula + categoria real + folgas.
  const meses: ImportMes[] = [];
  let folgaFonte: { ano: number; mes: number; folgas: ImportFolga[] } | null = null;

  for (const nomeFolha of wb.SheetNames) {
    if (nomeFolha.trim().toLowerCase().startsWith("configura")) continue;
    const ws = wb.Sheets[nomeFolha];
    const periodo = periodoDaFolha(ws, nomeFolha);
    if (!periodo) {
      problemas.push(`Folha "${nomeFolha}" ignorada: sem mês reconhecível.`);
      continue;
    }
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });

    // linha 4 (index 3): mapear colunas de dias (números 1..31) e "Anterior"
    const cab = linhas[3] || [];
    const colunasDia = new Map<number, number>(); // coluna -> dia do mês
    let colAnterior = -1;
    cab.forEach((v, col) => {
      const s = String(v ?? "").trim();
      if (/^\d{1,2}$/.test(s)) {
        const dia = Number(s);
        if (dia >= 1 && dia <= 31) colunasDia.set(col, dia);
      }
      if (s.toLowerCase() === "anterior") colAnterior = col;
    });
    if (colunasDia.size === 0) {
      problemas.push(`Folha "${nomeFolha}" ignorada: sem colunas de dias.`);
      continue;
    }

    const celulas: ImportCelula[] = [];
    const folgasDaFolha: ImportFolga[] = [];
    const ordemNestaFolha = new Map<string, Map<string, number>>();
    for (let r = 4; r < linhas.length; r++) {
      const lin = linhas[r];
      if (!Array.isArray(lin)) continue;
      const nomeRaw2 = lin[1] == null ? "" : String(lin[1]).trim();
      if (!nomeRaw2) continue;
      // rodapé do mapa: legenda ("07/19 - Turno da Manhã", "C. T. = ...")
      // e a nota importante não são pessoas
      const eLegenda =
        /(turno da|horario normal|folga do dia|supervis|escalados|licenca|feriados|trabalhos na ccis|tolerancia)/i.test(chaveNome(nomeRaw2)) ||
        nomeRaw2.includes("=") ||
        /^(nota|escala)/i.test(chaveNome(nomeRaw2));
      if (eLegenda) continue;
      const nomeRaw = nomeRaw2;
      const catRaw = lin[2] == null ? "" : String(lin[2]).trim();
      if (/^total/i.test(catRaw)) continue;

      const pessoa = garantir(nomeRaw);
      if (!pessoa) continue;
      if (catRaw) {
        pessoa.categoria = catRaw;
        pessoa.area = areaDeCategoria(catRaw);
        pessoa.grupo = grupoDeCategoria(catRaw);
      }
      // a ÚLTIMA folha que a pessoa aparece define a ordem de afixação
      let porArea = ordemNestaFolha.get(pessoa.area);
      if (!porArea) {
        porArea = new Map();
        ordemNestaFolha.set(pessoa.area, porArea);
      }
      if (!porArea.has(chaveNome(nomeRaw))) {
        porArea.set(chaveNome(nomeRaw), porArea.size + 1);
      }
      pessoa.ordem = porArea.get(chaveNome(nomeRaw)) as number;
      if (!pessoa.contacto) {
        const cfg = resolverCodigo(nomeRaw);
        if (cfg?.contacto) pessoa.contacto = cfg.contacto;
      }
      if (!pessoa.codigo) {
        const a = lin[0] == null ? "" : String(lin[0]).trim();
        if (/^(DM|EST)/i.test(a) && !a.startsWith("#")) {
          pessoa.codigo = a.toUpperCase();
        }
      }

      for (const [col, dia] of colunasDia) {
        const codigoEsc = normalizaCodigo(lin[col]);
        if (!codigoEsc) continue;
        if (dia > new Date(Date.UTC(periodo.ano, periodo.mes, 0)).getUTCDate()) continue;
        celulas.push({
          codigo: pessoa.codigo,
          data: `${periodo.ano}-${String(periodo.mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
          codigo_escala: codigoEsc
        });
      }

      if (colAnterior >= 0) {
        const v = Number(lin[colAnterior]);
        if (Number.isFinite(v) && v > 0) {
          folgasDaFolha.push({
            codigo: pessoa.codigo,
            valor: Math.round(v * 2) / 2,
            obs: `Saldo trazido do Excel (${nomeFolha.trim()})`
          });
        }
      }
    }

    meses.push({ ano: periodo.ano, mes: periodo.mes, celulas });

    const maisRecente =
      !folgaFonte || periodo.ano > folgaFonte.ano || (periodo.ano === folgaFonte.ano && periodo.mes > folgaFonte.mes);
    if (maisRecente) folgaFonte = { ano: periodo.ano, mes: periodo.mes, folgas: folgasDaFolha };
  }

  // 3. Códigos EST repetidos ganham sufixo único; códigos em branco
  //    ganham identificador de trabalho SEM nome real de código DM.
  //    O registo contém ALIASES (a mesma pessoa por duas grafias), por
  //    isso deduplica por identidade do objecto antes de contar.
  const unicos = [...new Set(registo.values())];
  const vistos = new Map<string, number>();
  for (const c of unicos) {
    if (!c.codigo) continue;
    const n = (vistos.get(c.codigo) || 0) + 1;
    vistos.set(c.codigo, n);
    if (n > 1) {
      if (/^EST/i.test(c.codigo)) {
        c.codigo = `${c.codigo}-${String(n).padStart(2, "0")}`;
        problemas.push(`Código EST repetido: "${c.nome}" passou a ${c.codigo}.`);
      } else {
        problemas.push(`Código duplicado na base: "${c.codigo}" (${c.nome}).`);
      }
    }
  }
  let semCodigo = 0;
  for (const c of unicos) {
    if (!c.codigo) {
      semCodigo += 1;
      c.codigo = `SEM-${String(semCodigo).padStart(2, "0")}`;
    }
  }

  meses.sort((a, b) => a.ano - b.ano || a.mes - b.mes);
  const colaboradores = unicos.sort(
    (a, b) =>
      (AREAS_ORDEM[a.area as AreaEscala] ?? 99) - (AREAS_ORDEM[b.area as AreaEscala] ?? 99) ||
      a.ordem - b.ordem ||
      a.nome.localeCompare(b.nome)
  );
  return {
    colaboradores,
    meses,
    folgas: folgaFonte?.folgas || [],
    problemas
  };
}

const AREAS_ORDEM: Record<string, number> = {
  Supervisores: 1,
  "Grupos de Turno": 2,
  "Pneumáticos": 3,
  "Mecânica": 4,
  "Eléctrica": 5,
  Serralharia: 6,
  Outros: 7
};

/** Lê um ficheiro .xlsx (buffer) e devolve os dados de importação. */
export function lerEscalasDeBuffer(buf: ArrayBuffer): ImportDados {
  const wb = XLSX.read(buf, { cellDates: true });
  return lerEscalasDeWorkbook(wb);
}
