"use client";

/**
 * RelatoriosClient - Os 7 relatórios da Oficina (client).
 *
 * Abas: Todas as obras, Na CdM agora, De volta da CdM, Obras fechadas,
 * Sem nº de obra, Em circulação e Distribuição por sector.
 *
 * Filtros partilhados (período com atalhos Hoje/1 semana/1 mês/Tudo,
 * máquina, sector, estado da obra, estado físico e busca). Colunas
 * configuráveis por relatório (guardadas no navegador), ordenação ao
 * clicar no cabeçalho, Excel formatado com a marca (xlsx-js-style) e
 * PDF de verdade com o logotipo (jsPDF + autoTable).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Printer, RotateCcw, Table2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Cabeca, EtiquetaEstado, EtiquetaFisico, Rodar, Etiqueta, pedir } from "@/components/oficina/ui-bits";
import { SelecionarEquipamento } from "@/components/oficina/selecionar-equipamento";
import {
  ESTADOS_FISICO,
  ESTADOS_WORKFLOW,
  SECTORES,
  dataHojeISO,
  formatarData,
  formatarDataHora,
  type Equipamento,
  type LogEstado,
  type OrdemServico
} from "@/lib/oficina";

type Dados = {
  ok: boolean;
  equipamentos: Equipamento[];
  ordens: OrdemServico[];
  logs: LogEstado[];
};

type ObraTrabalhada = OrdemServico & {
  _eq: Equipamento | null;
  _cdmData: Date | null;
  _cdmResp: string;
  _voltaData: Date | null;
  _fechadaData: Date | null;
  _fechadaResp: string;
  _faseData: Date | null;
};

type AbaId = "r0" | "r1" | "r2" | "r3" | "r4" | "r5" | "r6";

const TITULOS_ABAS: Record<AbaId, string> = {
  r0: "Todas as obras",
  r1: "Obras na CdM agora",
  r2: "Obras de volta da CdM",
  r3: "Obras sem nº de obra (em andamento)",
  r4: "Distribuição das obras por sector",
  r5: "Obras em circulação (antes da CdM)",
  r6: "Obras fechadas"
};

type Col = {
  id: string;
  t: string;
  num?: boolean;
  data?: boolean;
  badge?: "fisico" | "estado" | "situacao";
  v: (o: ObraTrabalhada) => string | number;
};

/* Colunas reutilizáveis (iguais em espírito ao COLS do hub) */
function colunas(): Record<string, Col> {
  return {
    obra: { id: "obra", t: "Nº Obra", v: (o) => o.numero_obra || "-" },
    maquina: { id: "maquina", t: "Nº Máquina", v: (o) => o._eq?.code || "-" },
    tipo: { id: "tipo", t: "Tipo de Máquina", v: (o) => o._eq?.fleet_type || "-" },
    trabalho: { id: "trabalho", t: "Descrição do Trabalho", v: (o) => o.descricao_avaria || "-" },
    sector: { id: "sector", t: "Sector", v: (o) => o.sector || "-" },
    situacao: { id: "situacao", t: "Situação", badge: "situacao", v: (o) => situacaoObra(o) },
    estado: { id: "estado", t: "Estado da Obra", badge: "estado", v: (o) => o.status_atual || "-" },
    fisico: { id: "fisico", t: "Estado Físico", badge: "fisico", v: (o) => o.status_fisico || "-" },
    abertura: { id: "abertura", t: "Abertura", data: true, v: (o) => (o.data_abertura ? formatarData(o.data_abertura) : "-") },
    abriu: { id: "abriu", t: "Quem abriu", v: (o) => textoAbertoPor(o) },
    diasAberta: { id: "dias_aberta", t: "Dias desde abertura", num: true, v: (o) => diasAteHoje(o.data_abertura) },
    diasTotal: {
      id: "dias_total",
      t: "Dias até fecho",
      num: true,
      v: (o) =>
        o._fechadaData && o.data_abertura
          ? Math.max(0, Math.floor((o._fechadaData.getTime() - dataLocal(o.data_abertura)!.getTime()) / 86400000))
          : diasAteHoje(o.data_abertura)
    },
    dataCdm: {
      id: "data_cdm",
      t: "Foi à CdM em",
      data: true,
      v: (o) => (o._cdmData ? formatarData(o._cdmData.toISOString()) : "-")
    },
    mandou: { id: "mandou", t: "Mandado por", v: (o) => o._cdmResp || "-" },
    diasCdm: { id: "dias_cdm", t: "Dias na CdM", num: true, v: (o) => (o._cdmData ? diasAteHoje(o._cdmData.toISOString()) : "") },
    dataVolta: {
      id: "data_volta",
      t: "Voltou em",
      data: true,
      v: (o) => (o._voltaData ? formatarData(o._voltaData.toISOString()) : "-")
    },
    diasNaCdm: {
      id: "dias_na_cdm",
      t: "Dias que esteve na CdM",
      num: true,
      v: (o) =>
        o._cdmData && o._voltaData
          ? Math.max(0, Math.floor((o._voltaData.getTime() - o._cdmData.getTime()) / 86400000))
          : ""
    },
    diasDesdeVolta: {
      id: "dias_volta",
      t: "Dias desde a volta",
      num: true,
      v: (o) => (o._voltaData ? diasAteHoje(o._voltaData.toISOString()) : "")
    },
    fechouQuem: { id: "fechou", t: "Fechada por", v: (o) => o._fechadaResp || "-" },
    fechouData: {
      id: "fechou_data",
      t: "Fechada em",
      data: true,
      v: (o) => (o._fechadaData ? formatarData(o._fechadaData.toISOString()) : "-")
    },
    diasSemNr: { id: "dias_sem", t: "Dias sem nº", num: true, v: (o) => diasAteHoje(o.data_abertura) },
    diasFase: {
      id: "dias_fase",
      t: "Dias no estado actual",
      num: true,
      v: (o) => (o._faseData ? diasAteHoje(o._faseData.toISOString()) : diasAteHoje(o.data_abertura))
    }
  };
}

const C = colunas();

const COLS: Record<AbaId, Col[]> = {
  r0: [
    C.obra, C.maquina, C.tipo, C.trabalho, C.sector, C.situacao, C.estado, C.fisico,
    C.abertura, C.abriu, C.diasAberta, C.dataCdm, C.mandou, C.dataVolta, C.diasNaCdm,
    C.fechouQuem, C.fechouData, C.diasTotal
  ],
  r1: [C.obra, C.maquina, C.tipo, C.trabalho, C.sector, C.abertura, C.diasAberta, C.dataCdm, C.mandou, C.diasCdm, C.estado, C.fisico],
  r2: [C.obra, C.maquina, C.tipo, C.trabalho, C.sector, C.abertura, C.diasAberta, C.dataCdm, C.mandou, C.dataVolta, C.diasNaCdm, C.diasDesdeVolta, C.fechouQuem, C.fechouData, C.diasTotal, C.estado, C.fisico],
  r3: [C.maquina, C.tipo, C.trabalho, C.sector, C.abertura, C.diasSemNr, C.diasAberta, C.abriu, C.estado, C.fisico],
  r4: [C.obra, C.maquina, C.tipo, C.trabalho, C.abertura, C.diasAberta, C.diasTotal, C.fechouQuem, C.fechouData, C.estado, C.fisico],
  r5: [C.obra, C.maquina, C.tipo, C.trabalho, C.sector, C.abertura, C.diasAberta, C.diasFase, C.abriu, C.estado, C.fisico],
  r6: [C.obra, C.maquina, C.tipo, C.trabalho, C.sector, C.abertura, C.dataCdm, C.mandou, C.dataVolta, C.fechouData, C.fechouQuem, C.diasTotal, C.fisico]
};

const BADGE_SITUACAO: Record<string, string> = {
  "Em circulação": "bg-muted text-muted-foreground",
  "Na CdM": "bg-ambar-claro text-ambar-texto",
  "De volta da CdM": "bg-info-bg text-info",
  Fechada: "bg-sucesso-bg text-sucesso"
};

function situacaoObra(o: ObraTrabalhada): string {
  if (o.status_atual === "Fechada") return "Fechada";
  if (o.status_atual === "CdM") return "Na CdM";
  if (o._cdmData) return "De volta da CdM";
  return "Em circulação";
}

function textoAbertoPor(o: OrdemServico): string {
  if (Array.isArray(o.aberto_por)) return o.aberto_por.join(", ") || "-";
  if (o.aberto_por) return String(o.aberto_por);
  return "-";
}

/** Data local (sem meia-noite deslocada) a partir de AAAA-MM-DD. */
function dataLocal(s: string | null | undefined): Date | null {
  if (!s) return null;
  const partes = String(s).slice(0, 10).split("-");
  if (partes.length < 3) return null;
  const d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  return isNaN(d.getTime()) ? null : d;
}

function diasAteHoje(s: string | null | undefined): number | "" {
  const d = dataLocal(s);
  if (!d) return "";
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  return Math.floor((hoje.getTime() - d.getTime()) / 86400000);
}

function isoLocal(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

const CAMPO_DATA_ABA: Record<AbaId, string> = {
  r0: "abertura",
  r1: "cdm",
  r2: "volta",
  r3: "abertura",
  r4: "abertura",
  r5: "abertura",
  r6: "fecho"
};

/* Nome legível de cada relatório para os ficheiros exportados
 * (em vez dos códigos internos r0..r6: Relatorio_Oficina_r6_...). */
const SLUG_ABAS: Record<AbaId, string> = {
  r0: "Todas_as_obras",
  r1: "Obras_na_CdM_agora",
  r2: "Obras_de_volta_da_CdM",
  r3: "Obras_sem_numero",
  r4: "Distribuicao_por_sector",
  r5: "Obras_em_circulacao",
  r6: "Obras_fechadas"
};

/* Nome curto de cada aba para o nome da folha do Excel (máx. 31 caracteres). */
const FOLHA_ABAS: Record<AbaId, string> = {
  r0: "Todas as obras",
  r1: "Na CdM agora",
  r2: "De volta da CdM",
  r3: "Sem nº de obra",
  r4: "Resumo por sector",
  r5: "Em circulação",
  r6: "Obras fechadas"
};

/* Largura (em caracteres) de cada coluna na folha do Excel. */
const LARGURAS_COL: Record<string, number> = {
  obra: 11,
  maquina: 11,
  tipo: 16,
  trabalho: 38,
  sector: 12,
  situacao: 15,
  estado: 13,
  fisico: 13,
  abertura: 11,
  abriu: 18,
  diasAberta: 9,
  diasTotal: 9,
  dataCdm: 12,
  mandou: 18,
  diasCdm: 9,
  dataVolta: 12,
  diasNaCdm: 10,
  diasDesdeVolta: 10,
  fechouQuem: 18,
  fechouData: 12,
  diasSemNr: 9,
  diasFase: 10
};

export function RelatoriosClient({
  nomeUtilizador,
  podeEditar
}: {
  nomeUtilizador: string;
  podeEditar: boolean;
}) {
  void podeEditar;
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(true);

  // filtros
  const [fData, setFData] = useState("");
  const [periodoTipo, setPeriodoTipo] = useState<"hoje" | "semana" | "mes" | "tudo">("tudo");
  const [fMaquina, setFMaquina] = useState("");
  const [fSector, setFSector] = useState("");
  const [fEstado, setFEstado] = useState("");
  const [fFisico, setFFisico] = useState("");
  const [fBusca, setFBusca] = useState("");

  const [aba, setAba] = useState<AbaId>("r0");
  const [ordenacao, setOrdenacao] = useState<Record<string, { i: number; dir: 1 | -1 } | null>>({});
  const [visiveis, setVisiveis] = useState<Record<string, string[] | null>>({});
  const [modalColunas, setModalColunas] = useState(false);
  const [sectorSel, setSectorSel] = useState<string | null>(null);
  const [esconderFechadasR0, setEsconderFechadasR0] = useState(false);
  const [soFechadasR2, setSoFechadasR2] = useState(false);
  const [aExcel, setAExcel] = useState(false);
  const [aPdf, setAPdf] = useState(false);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro("");
    try {
      const d = await pedir<Dados>("/api/oficina/relatorios");
      setDados(d);
      setFData(isoLocal(new Date()));
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/oficina/relatorios", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok || d?.ok === false) throw new Error(d?.erro || "Falha ao carregar");
        setDados(d);
        setFData(isoLocal(new Date()));
        setErro("");
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Erro inesperado");
      })
      .finally(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
     
  }, []);

  // Colunas visíveis: por defeito todas; guarda no navegador. Lê-se num
  // segundo tempo (setTimeout) para o efeito não alterar estado sincrono.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const bruto = localStorage.getItem("rel_oficina_colunas_v3");
        const guardado = bruto ? (JSON.parse(bruto) as Record<string, string[]>) : {};
        const inicial: Record<string, string[]> = {};
        (Object.keys(COLS) as AbaId[]).forEach((k) => {
          inicial[k] = guardado[k]?.length ? guardado[k] : COLS[k].map((c) => c.id);
        });
        setVisiveis(inicial);
      } catch {
        const inicial: Record<string, string[]> = {};
        (Object.keys(COLS) as AbaId[]).forEach((k) => {
          inicial[k] = COLS[k].map((c) => c.id);
        });
        setVisiveis(inicial);
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  function guardarColunas(novo: Record<string, string[] | null>) {
    setVisiveis(novo);
    try {
      localStorage.setItem("rel_oficina_colunas_v3", JSON.stringify(novo));
    } catch {
      // sem localStorage: vale só para esta visita
    }
  }

  /* ============ Enriquecimento das obras (datas da CdM e fecho) ============ */

  const obras = useMemo<ObraTrabalhada[]>(() => {
    if (!dados) return [];
    const mapaEq = new Map(dados.equipamentos.map((e) => [e.id, e]));
    const base: ObraTrabalhada[] = dados.ordens.map((o) => ({
      ...o,
      _eq: mapaEq.get(o.equipment_id) || null,
      _cdmData: null,
      _cdmResp: "",
      _voltaData: null,
      _fechadaData: null,
      _fechadaResp: "",
      _faseData: null
    }));
    const mapa = new Map(base.map((o) => [String(o.id), o]));
    const logsOrdenados = [...dados.logs].sort(
      (a, b) => new Date(a.data_mudanca || 0).getTime() - new Date(b.data_mudanca || 0).getTime()
    );
    logsOrdenados.forEach((ev) => {
      const o = mapa.get(String(ev.os_id));
      if (!o) return;
      const quando = ev.data_mudanca ? new Date(ev.data_mudanca) : null;
      if (ev.status_novo === "CdM") {
        o._cdmData = quando;
        o._cdmResp = ev.responsavel || "";
      }
      if (ev.status_anterior === "CdM") {
        o._voltaData = quando;
      }
      if (ev.status_novo === "Fechada") {
        o._fechadaData = quando;
        o._fechadaResp = ev.responsavel || "";
      }
      if (quando) o._faseData = quando;
    });
    return base;
  }, [dados]);

  /* ============ Período ============ */

  const periodo = useMemo<{ de: string; ate: string } | null>(() => {
    if (periodoTipo === "tudo" || !fData) return null;
    const d = dataLocal(fData);
    if (!d) return null;
    let ini = d;
    if (periodoTipo === "semana") ini = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 7);
    if (periodoTipo === "mes") ini = new Date(d.getFullYear(), d.getMonth() - 1, d.getDate());
    return { de: isoLocal(ini), ate: isoLocal(d) };
  }, [periodoTipo, fData]);

  function dataChave(o: ObraTrabalhada, campo: string): string {
    if (campo === "cdm") return o._cdmData ? isoLocal(o._cdmData) : "";
    if (campo === "volta") return o._voltaData ? isoLocal(o._voltaData) : "";
    if (campo === "fecho") return o._fechadaData ? isoLocal(o._fechadaData) : "";
    return String(o.data_abertura || "").slice(0, 10);
  }

  function passaFiltros(o: ObraTrabalhada, ignorarSector = false, campoData?: string): boolean {
    if (periodo) {
      const chave = dataChave(o, campoData || "abertura");
      if (!chave) return false;
      if (periodo.de && chave < periodo.de) return false;
      if (periodo.ate && chave > periodo.ate) return false;
    }
    if (fMaquina && String(o.equipment_id) !== fMaquina) return false;
    if (fFisico && o.status_fisico !== fFisico) return false;
    if (fEstado && o.status_atual !== fEstado) return false;
    if (!ignorarSector && fSector && o.sector !== fSector) return false;
    if (fBusca.trim()) {
      const alvo = (
        (o.numero_obra || "") +
        " " +
        (o._eq?.code || "") +
        " " +
        (o._eq?.fleet_type || "") +
        " " +
        (o.descricao_avaria || "") +
        " " +
        (o.sector || "") +
        " " +
        (o.status_atual || "") +
        " " +
        textoAbertoPor(o) +
        " " +
        (o._cdmResp || "") +
        " " +
        (o._fechadaResp || "")
      ).toLowerCase();
      if (!alvo.includes(fBusca.trim().toLowerCase())) return false;
    }
    return true;
  }

  const listaAba = useCallback(
    (a: AbaId): ObraTrabalhada[] => {
      if (a === "r0") {
        return obras.filter(
          (o) => (!esconderFechadasR0 || o.status_atual !== "Fechada") && passaFiltros(o, false, CAMPO_DATA_ABA[a])
        );
      }
      if (a === "r1") {
        return obras.filter((o) => o.status_atual === "CdM" && passaFiltros(o, false, CAMPO_DATA_ABA[a]));
      }
      if (a === "r2") {
        return obras.filter(
          (o) =>
            o._cdmData &&
            o.status_atual !== "CdM" &&
            (!soFechadasR2 || o.status_atual === "Fechada") &&
            passaFiltros(o, false, CAMPO_DATA_ABA[a])
        );
      }
      if (a === "r6") {
        return obras.filter((o) => o.status_atual === "Fechada" && passaFiltros(o, false, CAMPO_DATA_ABA[a]));
      }
      if (a === "r3") {
        return obras.filter(
          (o) => !o.numero_obra && o.status_atual !== "Fechada" && passaFiltros(o, false, CAMPO_DATA_ABA[a])
        );
      }
      if (a === "r5") {
        return obras.filter(
          (o) =>
            o.status_atual !== "Fechada" &&
            o.status_atual !== "CdM" &&
            !o._cdmData &&
            passaFiltros(o, false, CAMPO_DATA_ABA[a])
        );
      }
      return [];
    },
    [obras, periodo, fMaquina, fFisico, fEstado, fSector, fBusca, esconderFechadasR0, soFechadasR2]
  );

  function listaOrdenada(a: AbaId): ObraTrabalhada[] {
    const lista = listaAba(a);
    const cols = COLS[a].filter((c) => (visiveis[a] || []).includes(c.id));
    const ord = ordenacao[a];

    const base = [...lista];
    if (a === "r1") {
      base.sort((x, y) => (y._cdmData?.getTime() || 0) - (x._cdmData?.getTime() || 0));
    } else if (a === "r2") {
      base.sort((x, y) => (y._voltaData?.getTime() || 0) - (x._voltaData?.getTime() || 0));
    } else if (a === "r6") {
      base.sort((x, y) => (y._fechadaData?.getTime() || 0) - (x._fechadaData?.getTime() || 0));
    } else if (a === "r3" || a === "r5") {
      base.sort((x, y) => String(x.data_abertura || "").localeCompare(String(y.data_abertura || "")));
    } else {
      base.sort((x, y) => String(y.data_abertura || "").localeCompare(String(x.data_abertura || "")));
    }

    if (!ord || ord.i < 0 || !cols[ord.i]) return base;
    const c = cols[ord.i];
    return base.sort((x, y) => {
      const vx = c.v(x);
      const vy = c.v(y);
      if (c.num) {
        return ((vx === "" ? -1 : Number(vx)) - (vy === "" ? -1 : Number(vy))) * ord.dir;
      }
      return String(vx).localeCompare(String(vy), "pt") * ord.dir;
    });
  }

  /* ============ Resumo por sector (r4) ============ */

  const resumoSector = useMemo(() => {
    const lista = obras.filter((o) => passaFiltros(o, true, "abertura"));
    const nomes = [...SECTORES];
    lista.forEach((o) => {
      if (o.sector && !nomes.includes(o.sector)) nomes.push(o.sector);
    });
    if (lista.some((o) => !o.sector)) nomes.push("Sem sector");
    const linhas = nomes
      .map((nome) => {
        const doSector = lista.filter((o) => (o.sector || "Sem sector") === nome);
        return {
          sector: nome,
          aberto: doSector.filter((o) => o.status_atual !== "Fechada").length,
          cdm: doSector.filter((o) => o.status_atual === "CdM").length,
          volta: doSector.filter((o) => o._cdmData && o.status_atual !== "CdM").length,
          semN: doSector.filter((o) => !o.numero_obra && o.status_atual !== "Fechada").length,
          fechadas: doSector.filter((o) => o.status_atual === "Fechada").length,
          total: doSector.length
        };
      })
      .filter((l) => l.total > 0)
      .sort((a, b) => b.total - a.total);
    return linhas;
  }, [obras, periodo, fMaquina, fFisico, fEstado, fBusca]);

  /* ============ KPIs do topo ============ */

  const kpis = useMemo(() => {
    const lista = obras.filter((o) => passaFiltros(o, true, "abertura"));
    return {
      circulacao: lista.filter((o) => o.status_atual !== "Fechada" && o.status_atual !== "CdM" && !o._cdmData).length,
      cdm: lista.filter((o) => o.status_atual === "CdM").length,
      volta: lista.filter((o) => o._cdmData && o.status_atual !== "CdM").length,
      sem: lista.filter((o) => !o.numero_obra && o.status_atual !== "Fechada").length,
      fechadas: lista.filter((o) => o.status_atual === "Fechada").length
    };
  }, [obras, periodo, fMaquina, fFisico, fEstado, fBusca]);

  /* ============ Exportações (Excel e PDF) ============ */

  /** Linha com o período e os filtros activos, para o Excel e o PDF. */
  function etiquetaFiltros(): string {
    const partes: string[] = [];
    partes.push(
      periodo
        ? `Período: ${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`
        : "Período: todo o histórico"
    );
    if (fMaquina) {
      const eq = (dados?.equipamentos || []).find((e) => String(e.id) === fMaquina);
      partes.push(`Máquina: ${eq?.code || fMaquina}`);
    }
    if (fSector) partes.push(`Sector: ${fSector}`);
    if (fEstado) partes.push(`Estado: ${fEstado}`);
    if (fFisico) partes.push(`Físico: ${fFisico}`);
    if (fBusca.trim()) partes.push(`Procura: "${fBusca.trim()}"`);
    return partes.join("  ·  ");
  }

  /** Obras do sector escolhido no relatório r4 (mesma lista da página). */
  function obrasDoSectorActivo(): ObraTrabalhada[] {
    const sectorActivo = sectorSel || resumoSector[0]?.sector || "";
    return obras
      .filter(
        (o) => (o.sector || "Sem sector") === sectorActivo && passaFiltros(o, false, "abertura")
      )
      .sort((x, y) => String(y.data_abertura || "").localeCompare(String(x.data_abertura || "")));
  }

  async function exportarExcel() {
    const lista = aba === "r4" ? [] : listaOrdenada(aba);
    if (aba !== "r4" && !lista.length) {
      toast.error("Não há obras para exportar neste relatório.");
      return;
    }
    if (aba === "r4" && !resumoSector.length) {
      toast.error("Não há obras para exportar com estes filtros.");
      return;
    }
    setAExcel(true);
    try {
      const XLSXS = await import("xlsx-js-style");
      const wb = XLSXS.utils.book_new();
      const emissao = agoraEmissao();
      const etiqueta = etiquetaFiltros();
      const borda = { style: "thin" as const, color: { rgb: "B7C4BC" } };
      const bordas = { top: borda, bottom: borda, left: borda, right: borda };

      /** Folha de relatório formatada: títulos da empresa, cabeçalho verde,
       *  zebra nos dados, colunas numéricas à direita e linha TOTAL destacada. */
      function montarFolha(
        nome: string,
        cabecalhos: string[],
        dadosAoa: (string | number)[][],
        larguras: number[],
        colsNum: number[],
        colsWrap: number[],
        linhaTotal?: (string | number)[],
        comFiltro?: boolean
      ) {
        const aoa: (string | number)[][] = [
          ["DANMO SERVICE SYSTEM, LDA"],
          [`Relatório: ${TITULOS_ABAS[aba]}`],
          [etiqueta],
          [`Emitido em ${emissao} (Portal Interno Danmo)`],
          [],
          cabecalhos,
          ...dadosAoa
        ];
        if (linhaTotal) aoa.push(linhaTotal);
        const ws = XLSXS.utils.aoa_to_sheet(aoa);
        const nCol = cabecalhos.length;
        const nLin = aoa.length;
        ws["!cols"] = larguras.map((w) => ({ wch: w }));
        ws["!merges"] = [0, 1, 2, 3].map((l) => ({ s: { r: l, c: 0 }, e: { r: l, c: Math.max(0, nCol - 1) } }));
        if (comFiltro) {
          ws["!autofilter"] = {
            ref: XLSXS.utils.encode_range({
              s: { r: 5, c: 0 },
              e: { r: nLin - (linhaTotal ? 2 : 1), c: nCol - 1 }
            })
          };
        }
        for (let r = 0; r < nLin; r++) {
          for (let c = 0; c < nCol; c++) {
            const cel = ws[XLSXS.utils.encode_cell({ r, c })];
            if (!cel) continue;
            if (r === 0) {
              cel.s = { font: { name: "Calibri", sz: 11, bold: true, color: { rgb: "009639" } } };
              continue;
            }
            if (r === 1) {
              cel.s = { font: { name: "Calibri", sz: 14, bold: true, color: { rgb: "1A1A1A" } } };
              continue;
            }
            if (r === 2 || r === 3) {
              cel.s = { font: { name: "Calibri", sz: 10, italic: true, color: { rgb: "555555" } } };
              continue;
            }
            if (r === 5) {
              cel.s = {
                font: { name: "Calibri", sz: 10, bold: true, color: { rgb: "FFFFFF" } },
                fill: { patternType: "solid", fgColor: { rgb: "009639" } },
                alignment: {
                  vertical: "center",
                  horizontal: colsNum.includes(c) ? "right" : "left",
                  wrapText: true
                },
                border: bordas
              };
              continue;
            }
            if (r > 5) {
              const eTotal = Boolean(linhaTotal) && r === nLin - 1;
              const eNum = colsNum.includes(c);
              if (eNum && typeof cel.v === "number") {
                // números inteiros (dias e contagens) ficam como estão
              } else if (eNum && typeof cel.v === "string" && cel.v !== "" && Number.isFinite(Number(cel.v))) {
                cel.v = Number(cel.v);
                cel.t = "n";
              }
              cel.s = {
                font: {
                  name: "Calibri",
                  sz: 10,
                  bold: eTotal,
                  color: { rgb: eTotal ? "005A28" : "1A1A1A" }
                },
                fill: {
                  patternType: "solid",
                  fgColor: { rgb: eTotal ? "E6F4EC" : r % 2 === 0 ? "F4F9F6" : "FFFFFF" }
                },
                alignment: {
                  vertical: "center",
                  horizontal: eNum ? "right" : "left",
                  wrapText: colsWrap.includes(c)
                },
                border: bordas
              };
            }
          }
        }
        XLSXS.utils.book_append_sheet(wb, ws, nome);
      }

      /** Linhas de dados já convertidas pelas colunas do relatório. */
      function linhasDe(cols: Col[], listaLinha: ObraTrabalhada[]): (string | number)[][] {
        return listaLinha.map((o) =>
          cols.map((c) => {
            const v = c.v(o);
            return v === "" ? "-" : v;
          })
        );
      }

      if (aba === "r4") {
        const sectorActivo = sectorSel || resumoSector[0]?.sector || "";
        const obrasSector = obrasDoSectorActivo();
        const tot = resumoSector.reduce(
          (s, l) => ({
            aberto: s.aberto + l.aberto,
            cdm: s.cdm + l.cdm,
            volta: s.volta + l.volta,
            semN: s.semN + l.semN,
            fechadas: s.fechadas + l.fechadas,
            total: s.total + l.total
          }),
          { aberto: 0, cdm: 0, volta: 0, semN: 0, fechadas: 0, total: 0 }
        );

        // Folha 1: resumo por sector, com TOTAL GERAL no fim
        montarFolha(
          "Resumo por sector",
          ["Sector", "Em aberto", "Na CdM", "De volta da CdM", "Sem nº de obra", "Fechadas", "Total"],
          resumoSector.map((l) => [l.sector, l.aberto, l.cdm, l.volta, l.semN, l.fechadas, l.total]),
          [20, 10, 9, 15, 14, 10, 9],
          [1, 2, 3, 4, 5, 6],
          [],
          ["TOTAL GERAL", tot.aberto, tot.cdm, tot.volta, tot.semN, tot.fechadas, tot.total]
        );

        // Folha 2: as obras do sector escolhido, com as colunas visíveis
        const colsR4 = COLS.r4.filter((c) => (visiveis.r4 || []).includes(c.id));
        if (colsR4.length) {
          montarFolha(
            "Obras do sector",
            colsR4.map((c) => c.t),
            linhasDe(colsR4, obrasSector),
            colsR4.map((c) => LARGURAS_COL[c.id] || 12),
            colsR4.map((c, i) => (c.num ? i : -1)).filter((i) => i >= 0),
            colsR4.map((c, i) => (c.id === "trabalho" ? i : -1)).filter((i) => i >= 0),
            undefined,
            true
          );
        }

        XLSXS.writeFile(wb, `Relatorio_${SLUG_ABAS[aba]}_${dataHojeISO()}.xlsx`);
        toast.success(
          `Excel exportado: resumo por sector e ${obrasSector.length} obras de ${sectorActivo}.`
        );
        return;
      }

      const cols = COLS[aba].filter((c) => (visiveis[aba] || []).includes(c.id));
      if (!cols.length) {
        toast.error("Escolhe pelo menos uma coluna antes de exportar.");
        return;
      }
      montarFolha(
        FOLHA_ABAS[aba],
        cols.map((c) => c.t),
        linhasDe(cols, lista),
        cols.map((c) => LARGURAS_COL[c.id] || 12),
        cols.map((c, i) => (c.num ? i : -1)).filter((i) => i >= 0),
        cols.map((c, i) => (c.id === "trabalho" ? i : -1)).filter((i) => i >= 0),
        undefined,
        true
      );
      XLSXS.writeFile(wb, `Relatorio_${SLUG_ABAS[aba]}_${dataHojeISO()}.xlsx`);
      toast.success(`Excel exportado: ${lista.length} obras.`);
    } catch {
      toast.error("Não foi possível gerar o Excel.");
    } finally {
      setAExcel(false);
    }
  }

  async function exportarPdf() {
    const lista = aba === "r4" ? obrasDoSectorActivo() : listaOrdenada(aba);
    if (aba !== "r4" && !lista.length) {
      toast.error("Não há obras para exportar neste relatório.");
      return;
    }
    setAPdf(true);
    try {
      const { jsPDF } = await import("jspdf");
      const autoTable = (await import("jspdf-autotable")).default;
      type DocComTabela = import("jspdf").jsPDF & { lastAutoTable: { finalY: number } };
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const L = doc.internal.pageSize.getWidth();
      const A = doc.internal.pageSize.getHeight();
      const M = 14;
      const VERDE: [number, number, number] = [0, 150, 57];
      const etiquetaBruta = etiquetaFiltros();
      const etiqueta =
        etiquetaBruta.length > 130 ? `${etiquetaBruta.slice(0, 130).trim()}...` : etiquetaBruta;

      /* Cabeçalho do documento com o logotipo da marca (public/logos/DANMO.png).
       * Se o logotipo não carregar, mantém a caixa verde como reserva. */
      const logo = await carregarLogo("/logos/DANMO.png");
      if (logo) {
        // DANMO.png é 142x83 px -> proporção 1,71; desenha com 13 mm de altura
        doc.addImage(logo, "PNG", M, 8.5, 22.2, 13);
      } else {
        doc.setFillColor(VERDE[0], VERDE[1], VERDE[2]);
        doc.roundedRect(M, 10, 46, 13, 1.5, 1.5, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(15);
        doc.text("DANMO", M + 23, 18.2, { align: "center" });
      }
      const xTexto = M + (logo ? 28 : 53);
      doc.setTextColor(25, 25, 25);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(TITULOS_ABAS[aba], xTexto, 16.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(95, 95, 95);
      doc.text(`${etiqueta}   ·   Emitido em ${agoraEmissao()}`, xTexto, 22);
      doc.setProperties({ title: `Relatório: ${TITULOS_ABAS[aba]}` });
      doc.setDrawColor(VERDE[0], VERDE[1], VERDE[2]);
      doc.setLineWidth(0.8);
      doc.line(M, 29.5, L - M, 29.5);

      /* KPIs do topo (respeitam os filtros, como na página) */
      const kpisPdf: { t: string; v: string }[] = [
        { t: "EM CIRCULAÇÃO", v: String(kpis.circulacao) },
        { t: "NA CDM", v: String(kpis.cdm) },
        { t: "DE VOLTA DA CDM", v: String(kpis.volta) },
        { t: "SEM Nº DE OBRA", v: String(kpis.sem) },
        { t: "FECHADAS", v: String(kpis.fechadas) }
      ];
      const kw = (L - 2 * M - 4 * 4) / 5;
      kpisPdf.forEach((k, i) => {
        const x = M + i * (kw + 4);
        doc.setFillColor(248, 249, 250);
        doc.setDrawColor(203, 208, 214);
        doc.roundedRect(x, 33, kw, 15, 1.5, 1.5, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(110, 110, 110);
        doc.text(k.t, x + 3, 38);
        doc.setFontSize(12);
        doc.setTextColor(25, 25, 25);
        doc.text(k.v, x + 3, 44.5);
      });

      /** Linhas do corpo da tabela a partir das colunas visíveis. */
      function corpoDe(cols: Col[], listaCorpo: ObraTrabalhada[]): string[][] {
        return listaCorpo.map((o) =>
          cols.map((c) => {
            const v = c.v(o);
            return String(v === "" ? "-" : v);
          })
        );
      }

      const comprimentosCols = ["r0", "r1", "r2", "r3", "r5", "r6"].map(
        (a) => COLS[a as AbaId].filter((c) => (visiveis[a as AbaId] || []).includes(c.id)).length
      );
      comprimentosCols.push(
        COLS.r4.filter((c) => (visiveis.r4 || []).includes(c.id)).length,
        1
      );
      const nColunasMax = Math.max(...comprimentosCols);
      const fonteTabela = nColunasMax > 15 ? 6.3 : 7.2;

      if (aba === "r4") {
        const sectorActivo = sectorSel || resumoSector[0]?.sector || "";
        const colsR4 = COLS.r4.filter((c) => (visiveis.r4 || []).includes(c.id));
        const tot = resumoSector.reduce(
          (s, l) => ({
            aberto: s.aberto + l.aberto,
            cdm: s.cdm + l.cdm,
            volta: s.volta + l.volta,
            semN: s.semN + l.semN,
            fechadas: s.fechadas + l.fechadas,
            total: s.total + l.total
          }),
          { aberto: 0, cdm: 0, volta: 0, semN: 0, fechadas: 0, total: 0 }
        );

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(25, 25, 25);
        doc.text("Resumo por sector", M, 56);

        autoTable(doc, {
          startY: 58,
          margin: { left: M, right: M },
          head: [["Sector", "Em aberto", "Na CdM", "De volta da CdM", "Sem nº de obra", "Fechadas", "Total"]],
          body: resumoSector.map((l) => [
            l.sector,
            String(l.aberto),
            String(l.cdm),
            String(l.volta),
            String(l.semN),
            String(l.fechadas),
            String(l.total)
          ]),
          foot: [
            [
              "TOTAL GERAL",
              String(tot.aberto),
              String(tot.cdm),
              String(tot.volta),
              String(tot.semN),
              String(tot.fechadas),
              String(tot.total)
            ]
          ],
          styles: { fontSize: 8.5, cellPadding: 1.8, lineColor: [180, 190, 184], lineWidth: 0.1, textColor: [30, 30, 30] },
          headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontStyle: "bold" },
          footStyles: { fillColor: [230, 244, 236], textColor: [0, 90, 40], fontStyle: "bold" },
          alternateRowStyles: { fillColor: [246, 250, 248] },
          columnStyles: {
            1: { halign: "right" },
            2: { halign: "right" },
            3: { halign: "right" },
            4: { halign: "right" },
            5: { halign: "right" },
            6: { halign: "right", fontStyle: "bold" }
          }
        });

        if (colsR4.length) {
          const fimResumo = (doc as DocComTabela).lastAutoTable.finalY;
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(25, 25, 25);
          doc.text(`Obras do sector: ${sectorActivo} (${lista.length})`, M, fimResumo + 8);
          autoTable(doc, {
            startY: fimResumo + 10,
            margin: { left: M, right: M, top: 16, bottom: 12 },
            head: [colsR4.map((c) => c.t)],
            body: corpoDe(colsR4, lista),
            styles: { fontSize: fonteTabela, cellPadding: 1.5, lineColor: [180, 190, 184], lineWidth: 0.1, textColor: [30, 30, 30] },
            headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontSize: fonteTabela, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [246, 250, 248] },
            columnStyles: colsR4.reduce<Record<number, { halign: "right" }>>((acc, c, i) => {
              if (c.num) acc[i] = { halign: "right" };
              return acc;
            }, {})
          });
        }
      } else {
        const cols = COLS[aba].filter((c) => (visiveis[aba] || []).includes(c.id));
        if (cols.length) {
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.setTextColor(25, 25, 25);
          doc.text(`${TITULOS_ABAS[aba]} (${lista.length} obras)`, M, 56);
          autoTable(doc, {
            startY: 58,
            margin: { left: M, right: M, top: 16, bottom: 12 },
            head: [cols.map((c) => c.t)],
            body: corpoDe(cols, lista),
            styles: { fontSize: fonteTabela, cellPadding: 1.5, lineColor: [180, 190, 184], lineWidth: 0.1, textColor: [30, 30, 30] },
            headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontSize: fonteTabela, fontStyle: "bold" },
            alternateRowStyles: { fillColor: [246, 250, 248] },
            columnStyles: cols.reduce<Record<number, { halign: "right" }>>((acc, c, i) => {
              if (c.num) acc[i] = { halign: "right" };
              return acc;
            }, {})
          });
        }
      }

      /* Rodapé em todas as páginas */
      const nPag = doc.getNumberOfPages();
      for (let p = 1; p <= nPag; p++) {
        doc.setPage(p);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(125, 125, 125);
        doc.text(
          `Danmo Service System, Lda - Portal Interno - Página ${p} de ${nPag}`,
          L - M,
          A - 8,
          { align: "right" }
        );
      }

      doc.save(`Relatorio_${SLUG_ABAS[aba]}_${dataHojeISO()}.pdf`);
      toast.success(aba === "r4" ? `PDF exportado: resumo por sector e ${lista.length} obras.` : `PDF exportado: ${lista.length} obras.`);
    } catch {
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setAPdf(false);
    }
  }

  function clicarOrdenacao(i: number) {
    const atual = ordenacao[aba];
    if (atual && atual.i === i) {
      if (atual.dir === 1) setOrdenacao({ ...ordenacao, [aba]: { i, dir: -1 } });
      else setOrdenacao({ ...ordenacao, [aba]: null });
    } else {
      setOrdenacao({ ...ordenacao, [aba]: { i, dir: 1 } });
    }
  }

  const colsAtivas = (COLS[aba] || []).filter((c) => (visiveis[aba] || []).includes(c.id));

  return (
    <div className="space-y-5">
      <Cabeca titulo="Relatórios da Oficina" subtitulo="Sete relatórios com os mesmos filtros. Clica no nº de obra para abrir a ficha.">
        <Button variant="outline" size="sm" onClick={carregar} disabled={aCarregar}>
          {aCarregar ? <Rodar /> : <RotateCcw aria-hidden />}
          Actualizar
        </Button>
        <Button variant="outline" size="sm" onClick={exportarExcel} disabled={aExcel}>
          {aExcel ? <Rodar /> : <FileSpreadsheet aria-hidden />}
          Excel
        </Button>
        <Button variant="outline" size="sm" onClick={exportarPdf} disabled={aPdf}>
          {aPdf ? <Rodar /> : <Printer aria-hidden />}
          PDF
        </Button>
        <Button variant="outline" size="sm" onClick={() => setModalColunas(true)}>
          <Table2 aria-hidden />
          Colunas
        </Button>
      </Cabeca>

      {erro && (
        <Card className="border-erro/40">
          <CardContent className="text-sm text-erro">{erro}</CardContent>
        </Card>
      )}

      {/* KPIs clicáveis */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <KpiRotulo rotulo="Em circulação" valor={kpis.circulacao} onClick={() => setAba("r5")} activo={aba === "r5"} />
        <KpiRotulo rotulo="Na CdM" valor={kpis.cdm} onClick={() => setAba("r1")} activo={aba === "r1"} />
        <KpiRotulo rotulo="De volta da CdM" valor={kpis.volta} onClick={() => setAba("r2")} activo={aba === "r2"} />
        <KpiRotulo rotulo="Sem nº de obra" valor={kpis.sem} onClick={() => setAba("r3")} activo={aba === "r3"} />
        <KpiRotulo rotulo="Fechadas" valor={kpis.fechadas} onClick={() => setAba("r6")} activo={aba === "r6"} />
      </div>

      {/* Filtros */}
      <Card className="card-sombra nao-imprimir">
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="r-data">Período (data de partida)</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                <Input id="r-data" type="date" className="w-36" value={fData} onChange={(e) => setFData(e.target.value)} />
                <Button size="sm" variant={periodoTipo === "hoje" ? "default" : "outline"} onClick={() => setPeriodoTipo(periodoTipo === "hoje" ? "tudo" : "hoje")}>
                  Hoje
                </Button>
                <Button size="sm" variant={periodoTipo === "semana" ? "default" : "outline"} onClick={() => setPeriodoTipo(periodoTipo === "semana" ? "tudo" : "semana")}>
                  1 semana
                </Button>
                <Button size="sm" variant={periodoTipo === "mes" ? "default" : "outline"} onClick={() => setPeriodoTipo(periodoTipo === "mes" ? "tudo" : "mes")}>
                  1 mês
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPeriodoTipo("tudo")}>
                  Tudo
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {periodo
                  ? `${formatarData(periodo.de)} a ${formatarData(periodo.ate)}`
                  : "Sem limite de período (tudo)."}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-maq">Máquina</Label>
              {/* Campo com pesquisa: escreve o nº e a lista descarrega (200+ máquinas) */}
              <SelecionarEquipamento
                id="r-maq"
                equipamentos={dados?.equipamentos || []}
                value={fMaquina}
                onChange={setFMaquina}
                placeholder="Todas as máquinas"
                todosLabel="Todas as máquinas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-sector">Sector</Label>
              <select
                id="r-sector"
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={fSector}
                onChange={(e) => setFSector(e.target.value)}
              >
                <option value="">Todos os sectores</option>
                {SECTORES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-estado">Estado da Obra</Label>
              <select
                id="r-estado"
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={fEstado}
                onChange={(e) => setFEstado(e.target.value)}
              >
                <option value="">Todos os estados</option>
                {ESTADOS_WORKFLOW.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-fisico">Estado Físico</Label>
              <select
                id="r-fisico"
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={fFisico}
                onChange={(e) => setFFisico(e.target.value)}
              >
                <option value="">Todos</option>
                {ESTADOS_FISICO.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-busca">Procurar</Label>
              <Input
                id="r-busca"
                value={fBusca}
                onChange={(e) => setFBusca(e.target.value)}
                placeholder="Nº obra, máquina ou trabalho..."
              />
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Os filtros valem para todos os relatórios. Os atalhos do Período partem da data escolhida e contam
            para trás. Cada relatório usa a data que lhe diz respeito: as fechadas contam pela data de fecho, as
            que estão na CdM pela data da ida, as que voltaram pela data da volta, e as restantes pela abertura.
          </p>
        </CardContent>
      </Card>

      {/* Abas */}
      <div className="flex flex-wrap gap-1.5 nao-imprimir">
        {(Object.keys(TITULOS_ABAS) as AbaId[]).map((id) => (
          <Button key={id} size="sm" variant={aba === id ? "default" : "outline"} onClick={() => setAba(id)}>
            {TITULOS_ABAS[id]}
          </Button>
        ))}
      </div>

      {/* Cabeçalho que só sai no papel */}
      <div className="cabecalho-impresso hidden">
        <p className="font-bold">Danmo Service System, Lda · Oficina</p>
        <p>Relatório: {TITULOS_ABAS[aba]}</p>
      </div>

      {/* Tabela do relatório activo */}
      {aCarregar ? (
        <Card className="card-sombra">
          <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Rodar /> A carregar dados...
          </CardContent>
        </Card>
      ) : aba === "r4" ? (
        <Card className="card-sombra">
          <CardContent className="space-y-6">
            <div>
              <p className="font-semibold">Distribuição por sector</p>
              <p className="text-xs text-muted-foreground">Clica numa linha para ver as obras desse sector.</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                      {["Sector", "Em aberto", "Na CdM", "De volta", "Sem nº", "Fechadas", "Total"].map((c) => (
                        <th key={c} className="px-2 py-2 font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resumoSector.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-6 text-center text-muted-foreground">
                          Nenhuma obra encontrada com estes filtros.
                        </td>
                      </tr>
                    ) : (
                      resumoSector.map((l) => (
                        <tr
                          key={l.sector}
                          className={
                            "cursor-pointer border-b transition-colors hover:bg-muted/50 last:border-0 " +
                            (sectorSel === l.sector ? "bg-muted/70" : "")
                          }
                          onClick={() => setSectorSel(l.sector)}
                        >
                          <td className="px-2 py-2 font-medium">{l.sector}</td>
                          <td className="px-2 py-2 tabular-nums">{l.aberto}</td>
                          <td className="px-2 py-2 tabular-nums">{l.cdm}</td>
                          <td className="px-2 py-2 tabular-nums">{l.volta}</td>
                          <td className="px-2 py-2 tabular-nums">{l.semN}</td>
                          <td className="px-2 py-2 tabular-nums">{l.fechadas}</td>
                          <td className="px-2 py-2 font-bold tabular-nums">{l.total}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <p className="font-semibold">
                Obras do sector: {sectorSel || resumoSector[0]?.sector || "-"}
              </p>
              <div className="mt-3 overflow-x-auto">
                <TabelaObras
                  cols={COLS.r4.filter((c) => (visiveis.r4 || []).includes(c.id))}
                  lista={obras
                    .filter(
                      (o) =>
                        (o.sector || "Sem sector") === (sectorSel || resumoSector[0]?.sector) &&
                        passaFiltros(o, false, "abertura")
                    )
                    .sort((x, y) => String(y.data_abertura || "").localeCompare(String(x.data_abertura || "")))}
                  onOrdenar={clicarOrdenacao}
                  ordenacao={ordenacao[aba]}
                  router={router}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="card-sombra">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">{TITULOS_ABAS[aba]}</p>
                {aba === "r0" && (
                  <label className="mt-1 flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--primario)]"
                      checked={esconderFechadasR0}
                      onChange={(e) => setEsconderFechadasR0(e.target.checked)}
                    />
                    Esconder as já fechadas
                  </label>
                )}
                {aba === "r2" && (
                  <label className="mt-1 flex items-center gap-2 text-xs font-normal text-muted-foreground">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--primario)]"
                      checked={soFechadasR2}
                      onChange={(e) => setSoFechadasR2(e.target.checked)}
                    />
                    Mostrar só as já fechadas
                  </label>
                )}
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold tabular-nums">
                {listaAba(aba).length} obras
              </span>
            </div>
            <div className="overflow-x-auto">
              <TabelaObras
                cols={colsAtivas}
                lista={listaOrdenada(aba)}
                onOrdenar={clicarOrdenacao}
                ordenacao={ordenacao[aba]}
                router={router}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de colunas */}
      <Modal
        aberto={modalColunas}
        fechar={() => setModalColunas(false)}
        titulo="Colunas do relatório"
        subtitulo={TITULOS_ABAS[aba]}
      >
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => guardarColunas({ ...visiveis, [aba]: COLS[aba].map((c) => c.id) })}
            >
              Marcar todas
            </Button>
            <Button size="sm" variant="outline" onClick={() => guardarColunas({ ...visiveis, [aba]: [] })}>
              Limpar todas
            </Button>
          </div>
          <div className="grid max-h-64 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
            {COLS[aba].map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm font-normal">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--primario)]"
                  checked={(visiveis[aba] || []).includes(c.id)}
                  onChange={(e) => {
                    const atual = visiveis[aba] || [];
                    const novo = e.target.checked
                      ? [...atual, c.id]
                      : atual.filter((id) => id !== c.id);
                    // mantém a ordem original das colunas
                    guardarColunas({
                      ...visiveis,
                      [aba]: COLS[aba].map((x) => x.id).filter((id) => novo.includes(id))
                    });
                  }}
                />
                {c.t}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            A escolha fica guardada neste navegador e vale para a tabela, o Excel e a impressão.
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setModalColunas(false)}>Pronto</Button>
          </div>
        </div>
      </Modal>

      {/* Estilos de impressão */}
      <style jsx global>{`
        @media print {
          .nao-imprimir {
            display: none !important;
          }
          body {
            background: white !important;
          }
          .cabecalho-impresso {
            display: block !important;
            margin-bottom: 12px;
          }
        }
      `}</style>
    </div>
  );
}

function KpiRotulo({
  rotulo,
  valor,
  onClick,
  activo
}: {
  rotulo: string;
  valor: number;
  onClick: () => void;
  activo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-xl border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 " +
        (activo ? "border-primario ring-2 ring-primario/30" : "border-border")
      }
    >
      <p className="text-[0.7rem] font-medium leading-tight text-muted-foreground">{rotulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
    </button>
  );
}

function TabelaObras({
  cols,
  lista,
  onOrdenar,
  ordenacao,
  router
}: {
  cols: Col[];
  lista: ObraTrabalhada[];
  onOrdenar: (i: number) => void;
  ordenacao: { i: number; dir: 1 | -1 } | null;
  router: ReturnType<typeof useRouter>;
}) {
  return (
    <table className="w-full min-w-[720px] text-left text-sm">
      <thead>
        <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
          {cols.map((c, i) => (
            <th
              key={c.id}
              className="cursor-pointer select-none px-2 py-2 font-semibold hover:text-foreground"
              onClick={() => onOrdenar(i)}
              title="Clicar para ordenar"
            >
              {c.t}
              {ordenacao && ordenacao.i === i && (
                <span className="ml-1">{ordenacao.dir === 1 ? "▲" : "▼"}</span>
              )}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {lista.length === 0 ? (
          <tr>
            <td colSpan={Math.max(1, cols.length)} className="px-2 py-6 text-center text-muted-foreground">
              Nenhuma obra encontrada com estes filtros.
            </td>
          </tr>
        ) : (
          lista.map((o) => (
            <tr
              key={o.id}
              className="cursor-pointer border-b transition-colors hover:bg-muted/50 last:border-0"
              onClick={() => router.push(`/oficina/ordens/${o.id}`)}
              title="Clica para abrir esta obra"
            >
              {cols.map((c) => (
                <td key={c.id} className="px-2 py-2 align-middle">
                  {c.id === "obra" ? (
                    <span className="font-semibold text-primario dark:text-primario-forte">
                      {o.numero_obra || "s/nº"}
                    </span>
                  ) : c.badge === "fisico" ? (
                    <EtiquetaFisico estado={String(c.v(o))} />
                  ) : c.badge === "estado" ? (
                    <EtiquetaEstado estado={String(c.v(o))} />
                  ) : c.badge === "situacao" ? (
                    <Etiqueta cor={BADGE_SITUACAO[String(c.v(o))] || "bg-muted text-muted-foreground"}>
                      {String(c.v(o))}
                    </Etiqueta>
                  ) : c.num ? (
                    String(c.v(o)) === "" ? (
                      "-"
                    ) : (
                      <span className={Number(c.v(o)) >= 15 ? "font-bold text-erro" : "font-semibold"}>
                        {String(c.v(o))} d
                      </span>
                    )
                  ) : (
                    String(c.v(o))
                  )}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

/* ---- Helpers das exportações ---- */

/** Lê o logotipo da marca e devolve um data URL PNG (para o jsPDF).
 *  Devolve "" se não conseguir carregar (o PDF segue com a caixa verde). */
function carregarLogo(caminho: string): Promise<string> {
  return new Promise((resolvida) => {
    try {
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement("canvas");
          cv.width = img.naturalWidth;
          cv.height = img.naturalHeight;
          const ctx = cv.getContext("2d");
          if (!ctx) return resolvida("");
          ctx.drawImage(img, 0, 0);
          resolvida(cv.toDataURL("image/png"));
        } catch {
          resolvida("");
        }
      };
      img.onerror = () => resolvida("");
      img.src = caminho;
    } catch {
      resolvida("");
    }
  });
}

/** Data e hora da emissão: "15/10/2026 às 09:42". */
function agoraEmissao(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()} às ${hh}:${mi}`;
}
