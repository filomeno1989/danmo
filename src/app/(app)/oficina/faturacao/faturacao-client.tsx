"use client";

/**
 * FaturacaoClient - Obras fechadas que vão a facturação da CdM.
 *
 * KPIs gerais, resumo mês a mês (obras, horas CdM vs nosso pessoal,
 * material e total) e a lista detalhada com materiais, diferenças e
 * dias até ao fecho. Permite corrigir (editar) e remover um fecho.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Pencil, Plus, Printer, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Cabeca, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import {
  MATERIAIS_FECHO,
  UNIDADES_PRECO,
  dataHojeISO,
  formatarData,
  type LinhaFaturacao,
  type MaterialFecho,
  type PrecoCatalogo,
  type ResumoMes
} from "@/lib/oficina";

type Totais = {
  obras: number;
  horas_cdm: number;
  horas_nossas: number;
  total_mao_obra: number;
  total_material: number;
  total_geral: number;
};

type Dados = {
  ok: boolean;
  linhas: LinhaFaturacao[];
  porMes: ResumoMes[];
  totais: Totais;
};

const MESES_PT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function etiquetaMes(mes: string): string {
  const [a, m] = mes.split("-");
  const idx = Number(m) - 1;
  return `${MESES_PT[idx] || m} ${a}`;
}

/** Mostra um valor em Meticais: "1 234,56 MT" */
function fmtMt(n: number): string {
  return (
    new Intl.NumberFormat("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n || 0) + " MT"
  );
}

const arred2 = (n: number) => Math.round(n * 100) / 100;

export function FaturacaoClient({
  podeEditar,
  podeApagar
}: {
  nomeUtilizador: string;
  podeEditar: boolean;
  podeApagar: boolean;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState("");
  const [ano, setAno] = useState("");
  const [mes, setMes] = useState("");
  const [expandida, setExpandida] = useState<number | null>(null);
  // Tabela de Preços (para a edição do fecho assumir os valores registados)
  const [precos, setPrecos] = useState<PrecoCatalogo[]>([]);

  // Edição de fecho
  const [fechoEdit, setFechoEdit] = useState<LinhaFaturacao | null>(null);
  const [editData, setEditData] = useState("");
  const [editHoras, setEditHoras] = useState("");
  const [editValor, setEditValor] = useState("");
  const [editMats, setEditMats] = useState([
    { material: "", quantidade: "", valor_unitario: "", livre: false }
  ]);
  const [editObs, setEditObs] = useState("");
  const [aGravar, setAGravar] = useState(false);

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro("");
    try {
      const d = await pedir<Dados>("/api/oficina/faturacao");
      setDados(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    // Primeiro carregamento em cadeia de promessas (sem setState síncrono)
    let vivo = true;
    fetch("/api/oficina/faturacao", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok || d?.ok === false) throw new Error(d?.erro || "Falha ao carregar");
        setDados(d);
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

  const anos = useMemo(
    () =>
      [...new Set((dados?.linhas || []).map((l) => l.data_fecho.slice(0, 4)))]
        .sort()
        .reverse(),
    [dados]
  );

  const linhas = useMemo(() => {
    let lista = dados?.linhas || [];
    if (ano) lista = lista.filter((l) => l.data_fecho.slice(0, 4) === ano);
    if (mes) lista = lista.filter((l) => Number(l.data_fecho.slice(5, 7)) === Number(mes));
    return lista;
  }, [dados, ano, mes]);

  const etiquetaPeriodo = useMemo(() => {
    if (!ano && !mes) return "Todo o período";
    if (!mes) return `Ano ${ano}`;
    const nomeMes = MESES_PT[Number(mes) - 1] || `mês ${mes}`;
    return ano ? `${nomeMes} de ${ano}` : `${nomeMes} (todos os anos)`;
  }, [ano, mes]);

  const sufixoPeriodo = ano && mes ? `${ano}-${mes.padStart(2, "0")}` : ano ? ano : mes ? `mes_${mes.padStart(2, "0")}` : "todo_o_periodo";

  const totais = useMemo<Totais>(() => {
    return {
      obras: linhas.length,
      horas_cdm: arred2(linhas.reduce((s, l) => s + l.horas_cdm, 0)),
      horas_nossas: arred2(linhas.reduce((s, l) => s + l.horas_nossas, 0)),
      total_mao_obra: arred2(linhas.reduce((s, l) => s + l.total_mao_obra, 0)),
      total_material: arred2(linhas.reduce((s, l) => s + l.total_material, 0)),
      total_geral: arred2(linhas.reduce((s, l) => s + l.total_geral, 0))
    };
  }, [linhas]);

  const porMes = useMemo<ResumoMes[]>(() => {
    const mapa = new Map<string, ResumoMes>();
    linhas.forEach((l) => {
      const mes = l.data_fecho.slice(0, 7);
      const atual =
        mapa.get(mes) ||
        { mes, obras: 0, horas_cdm: 0, horas_nossas: 0, total_material: 0, total_geral: 0 };
      atual.obras += 1;
      atual.horas_cdm = arred2(atual.horas_cdm + l.horas_cdm);
      atual.horas_nossas = arred2(atual.horas_nossas + l.horas_nossas);
      atual.total_material = arred2(atual.total_material + l.total_material);
      atual.total_geral = arred2(atual.total_geral + l.total_geral);
      mapa.set(mes, atual);
    });
    return [...mapa.values()].sort((a, b) => (a.mes < b.mes ? 1 : -1));
  }, [linhas]);

  function abrirEdicao(l: LinhaFaturacao) {
    setFechoEdit(l);
    setEditData(l.data_fecho.slice(0, 10));
    setEditHoras(String(l.horas_cdm));
    setEditValor(String(l.valor_hora));
    setEditObs(l.observacao || "");
    // Busca a Tabela de Preços para a lista de materiais vir com valores
    (async () => {
      let ps: PrecoCatalogo[] = [];
      try {
        const d = await pedir<{ ok: boolean; precos: PrecoCatalogo[] }>("/api/oficina/precos");
        ps = d.precos || [];
        setPrecos(ps);
      } catch {
        setPrecos([]);
      }
      const matsCatalogo = ps.filter((p) => p.tipo === "material");
      setEditMats(
        l.materiais.length
          ? l.materiais.map((m) => ({
              material: m.material,
              quantidade: String(m.quantidade),
              valor_unitario: String(m.valor_unitario),
              livre: !matsCatalogo.some((p) => p.nome === m.material)
            }))
          : [{ material: "", quantidade: "", valor_unitario: "", livre: false }]
      );
    })();
  }

  async function guardarEdicao() {
    if (!fechoEdit || aGravar) return;
    const horas = Number(editHoras);
    const valor = Number(editValor);
    if (editHoras === "" || !Number.isFinite(horas) || horas < 0) {
      toast.error("Escreve as horas que a CdM considerou.");
      return;
    }
    if (editValor === "" || !Number.isFinite(valor) || valor < 0) {
      toast.error("Escreve o valor por hora.");
      return;
    }
    const mats = editMats
      .map((m) => ({
        material: m.material.trim(),
        quantidade: Number(m.quantidade) || 0,
        valor_unitario: Number(m.valor_unitario) || 0
      }))
      .filter((m) => m.material && m.quantidade > 0);
    setAGravar(true);
    try {
      await enviar(
        "/api/oficina/faturacao",
        {
          action: "editar-fecho",
          id: fechoEdit.id,
          fecho: {
            data_fecho: editData,
            horas_cdm: horas,
            valor_hora: valor,
            materiais: mats,
            observacao: editObs.trim() || null
          }
        },
        "Fecho actualizado."
      );
      setFechoEdit(null);
      await carregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravar(false);
    }
  }

  async function apagarFecho(l: LinhaFaturacao) {
    if (!podeApagar) return;
    const ok = window.confirm(
      `Apagar o registo de faturação da obra ${l.numero_obra || "S/Nº"}? A obra continua fechada, mas sai do módulo de Faturação.`
    );
    if (!ok) return;
    try {
      await enviar("/api/oficina/faturacao", { action: "apagar-fecho", id: l.id }, "Registo apagado.");
      await carregar();
    } catch {
      // aviso já mostrado
    }
  }

  const editTotalMao = (Number(editHoras) || 0) * (Number(editValor) || 0);
  const editTotalMat = editMats.reduce(
    (s, m) => s + (Number(m.quantidade) || 0) * (Number(m.valor_unitario) || 0),
    0
  );

  /* ============ Exportações (Excel e PDF) ============ */

  function exportarExcel() {
    if (!linhas.length) {
      toast.error("Não há fechos para exportar com este filtro.");
      return;
    }
    const wb = XLSX.utils.book_new();

    // Folha 1: resumo por mês, com linha TOTAL no fim
    const resumoRows: Record<string, string | number>[] = porMes.map((m) => ({
      "Mês": etiquetaMes(m.mes),
      "Obras": m.obras,
      "Horas CdM": m.horas_cdm,
      "Horas nossas": m.horas_nossas,
      "Diferença (h)": arred2(m.horas_cdm - m.horas_nossas),
      "Material (MT)": m.total_material,
      "Total geral (MT)": m.total_geral
    }));
    resumoRows.push({
      "Mês": "TOTAL",
      "Obras": totais.obras,
      "Horas CdM": totais.horas_cdm,
      "Horas nossas": totais.horas_nossas,
      "Diferença (h)": arred2(totais.horas_cdm - totais.horas_nossas),
      "Material (MT)": totais.total_material,
      "Total geral (MT)": totais.total_geral
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumoRows), "Resumo por mês");

    // Folha 2: detalhe de cada obra fechada, com linha TOTAL no fim
    const detRows: Record<string, string | number>[] = linhas.map((l) => ({
      "Nº Obra": l.numero_obra || "S/Nº",
      "Máquina": l.equip_code || "-",
      "Sector": l.sector || "-",
      "Abertura": l.data_abertura ? formatarData(l.data_abertura) : "-",
      "Fecho": formatarData(l.data_fecho),
      "Dias até fecho": l.dias_ate_fecho,
      "Dias pós-trabalho": l.dias_apos_trabalho,
      "Horas CdM": l.horas_cdm,
      "Horas nossas": l.horas_nossas,
      "Diferença (h)": l.diferenca_horas,
      "Valor/hora (MT)": l.valor_hora,
      "Mão de obra (MT)": l.total_mao_obra,
      "Material (MT)": l.total_material,
      "Total geral (MT)": l.total_geral,
      "Materiais":
        l.materiais
          .map((m) => `${m.material}: ${m.quantidade} x ${m.valor_unitario} = ${m.total} MT`)
          .join(" | ") || "-",
      "Responsável": l.responsavel || "-",
      "Observação": l.observacao || ""
    }));
    detRows.push({
      "Nº Obra": `TOTAL (${linhas.length} obras)`,
      "Mão de obra (MT)": totais.total_mao_obra,
      "Material (MT)": totais.total_material,
      "Total geral (MT)": totais.total_geral
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detRows), "Detalhe das obras");

    XLSX.writeFile(wb, `Faturacao_CdM_${sufixoPeriodo}.xlsx`);
    toast.success(
      `Excel exportado: ${linhas.length} obras (${etiquetaPeriodo}) com o total do período.`
    );
  }

  function exportarPdf() {
    if (!linhas.length) {
      toast.error("Não há fechos para exportar com este filtro.");
      return;
    }
    window.print();
  }

  return (
    <div className="nao-imprimir space-y-5">
      <Cabeca
        titulo="Faturação CdM"
        subtitulo="Obras fechadas que vão a facturação: tempos, materiais e totais."
      >
        <Button variant="outline" size="sm" onClick={carregar} disabled={aCarregar}>
          {aCarregar ? <Rodar /> : <RotateCcw aria-hidden />}
          Actualizar
        </Button>
        <Button variant="outline" size="sm" onClick={exportarExcel} disabled={!linhas.length}>
          <Download aria-hidden /> Excel
        </Button>
        <Button variant="outline" size="sm" onClick={exportarPdf} disabled={!linhas.length}>
          <Printer aria-hidden /> PDF
        </Button>
      </Cabeca>

      {erro && (
        <Card className="border-erro/40">
          <CardContent className="flex items-center gap-2 p-4 text-sm text-erro">
            {erro}
            <Button variant="outline" size="sm" onClick={carregar} className="ml-auto">
              <RotateCcw aria-hidden /> Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPI titulo="Obras fechadas" valor={String(totais.obras)} nota={etiquetaPeriodo} />
        <KPI titulo="Mão de obra" valor={fmtMt(totais.total_mao_obra)} nota={`${totais.horas_cdm} h (CdM)`} />
        <KPI titulo="Material" valor={fmtMt(totais.total_material)} nota={`${totais.horas_nossas} h do nosso pessoal`} />
        <KPI titulo="TOTAL GERAL" valor={fmtMt(totais.total_geral)} nota="Mão de obra + material" destaque />
      </div>

      {/* Resumo por mês */}
      <Card className="card-sombra">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-semibold">Resumo por mês</p>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Label className="text-xs">Mês</Label>
              <select
                className="border-input bg-transparent h-8 rounded-md border px-2 text-sm outline-none dark:bg-input/30"
                value={mes}
                onChange={(e) => setMes(e.target.value)}
              >
                <option value="">Todos</option>
                {MESES_PT.map((nome, i) => (
                  <option key={nome} value={String(i + 1)}>
                    {nome}
                  </option>
                ))}
              </select>
              <Label className="text-xs">Ano</Label>
              <select
                className="border-input bg-transparent h-8 rounded-md border px-2 text-sm outline-none dark:bg-input/30"
                value={ano}
                onChange={(e) => setAno(e.target.value)}
              >
                <option value="">Todos</option>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {porMes.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                    <th className="py-2 pr-3">Mês</th>
                    <th className="py-2 pr-3">Obras</th>
                    <th className="py-2 pr-3">Horas CdM</th>
                    <th className="py-2 pr-3">Horas nossas</th>
                    <th className="py-2 pr-3">Diferença</th>
                    <th className="py-2 pr-3">Material</th>
                    <th className="py-2 text-right">Total geral</th>
                  </tr>
                </thead>
                <tbody>
                  {porMes.map((m) => (
                    <tr key={m.mes} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{etiquetaMes(m.mes)}</td>
                      <td className="py-2 pr-3">{m.obras}</td>
                      <td className="py-2 pr-3">{m.horas_cdm} h</td>
                      <td className="py-2 pr-3">{m.horas_nossas} h</td>
                      <td className={"py-2 pr-3 " + (m.horas_cdm - m.horas_nossas > 0 ? "text-erro" : "text-sucesso")}>
                        {arred2(m.horas_cdm - m.horas_nossas)} h
                      </td>
                      <td className="py-2 pr-3">{fmtMt(m.total_material)}</td>
                      <td className="py-2 text-right font-semibold">{fmtMt(m.total_geral)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {aCarregar ? "A carregar..." : "Ainda não há obras fechadas registadas."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Lista detalhada */}
      <Card className="card-sombra">
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Obras fechadas ({linhas.length})</p>
            <p className="text-muted-foreground text-xs max-w-xl">
              <b>Dias até fecho</b> = dias desde a abertura da obra até ao fecho pela CdM.
              <b> Dias pós-trabalho</b> = dias desde a última intervenção do nosso pessoal até ao
              fecho (quanto tempo a obra ficou à espera de ser fechada).
            </p>
          </div>
          {linhas.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs uppercase">
                    <th className="py-2 pr-2"></th>
                    <th className="py-2 pr-2">Nº Obra</th>
                    <th className="py-2 pr-2">Máquina</th>
                    <th className="py-2 pr-2">Fecho</th>
                    <th
                      className="py-2 pr-2 text-right"
                      title="Dias desde a abertura da obra até ao fecho pela CdM"
                    >
                      Dias até fecho
                    </th>
                    <th
                      className="py-2 pr-2 text-right"
                      title="Dias desde a última intervenção do nosso pessoal até ao fecho"
                    >
                      Dias pós-trab.
                    </th>
                    <th className="py-2 pr-2 text-right">H. CdM</th>
                    <th className="py-2 pr-2 text-right">H. nossas</th>
                    <th className="py-2 pr-2 text-right">Dif.</th>
                    <th className="py-2 pr-2 text-right">Total</th>
                    <th className="py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => (
                    <FechoLinha
                      key={l.id}
                      linha={l}
                      aberta={expandida === l.id}
                      alternar={() => setExpandida(expandida === l.id ? null : l.id)}
                      podeEditar={podeEditar}
                      podeApagar={podeApagar}
                      onEditar={() => abrirEdicao(l)}
                      onApagar={() => apagarFecho(l)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {aCarregar
                ? "A carregar..."
                : "Quando fechares uma obra com o formulário de Faturação, ela aparece aqui."}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Modal de edição do fecho */}
      <Modal
        aberto={!!fechoEdit}
        fechar={() => setFechoEdit(null)}
        titulo={`Corrigir fecho - Obra ${fechoEdit?.numero_obra || "S/Nº"}`}
        subtitulo="Os totais são recalculados automaticamente."
        largura="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Data de Fecho</Label>
              <Input type="date" value={editData} onChange={(e) => setEditData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Horas da CdM *</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={editHoras}
                onChange={(e) => setEditHoras(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor por hora (MT) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={editValor}
                onChange={(e) => setEditValor(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-accent/40 flex items-center justify-between rounded-md px-3 py-2 text-sm">
            <span className="font-medium">Total de mão de obra</span>
            <span className="font-semibold">{fmtMt(editTotalMao)}</span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Materiais</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setEditMats((atual) => [
                    ...atual,
                    { material: "", quantidade: "", valor_unitario: "", livre: false }
                  ])
                }
              >
                <Plus aria-hidden /> Adicionar material
              </Button>
            </div>
            {editMats.map((m, i) => {
              const totalLinha = (Number(m.quantidade) || 0) * (Number(m.valor_unitario) || 0);
              const matsCatalogo = precos.filter((p) => p.tipo === "material");
              return (
                <div key={i} className="grid grid-cols-[1fr_5rem_6.5rem_6rem_2rem] items-end gap-2">
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Material</Label>}
                    {!m.livre && matsCatalogo.length > 0 ? (
                      <select
                        className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                        value={matsCatalogo.some((p) => p.nome === m.material) ? m.material : ""}
                        onChange={(e) => {
                          if (e.target.value === "__livre__") {
                            setEditMats((atual) =>
                              atual.map((x, j) =>
                                j === i ? { ...x, material: "", livre: true } : x
                              )
                            );
                            return;
                          }
                          const p = matsCatalogo.find((x) => x.nome === e.target.value);
                          setEditMats((atual) =>
                            atual.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    material: p?.nome || "",
                                    valor_unitario: p ? String(p.valor) : x.valor_unitario
                                  }
                                : x
                            )
                          );
                        }}
                      >
                        <option value="">- Selecionar material -</option>
                        {matsCatalogo.map((p) => (
                          <option key={p.id} value={p.nome}>
                            {p.nome} - {fmtMt(p.valor)}/{UNIDADES_PRECO[p.unidade] || p.unidade}
                          </option>
                        ))}
                        <option value="__livre__">Outro material (escrever)...</option>
                      </select>
                    ) : (
                      <Input
                        list="lista-gases-edit"
                        value={m.material}
                        onChange={(e) =>
                          setEditMats((atual) =>
                            atual.map((x, j) => (j === i ? { ...x, material: e.target.value } : x))
                          )
                        }
                        placeholder="Ex: Oxigênio"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Qtd</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={m.quantidade}
                      onChange={(e) =>
                        setEditMats((atual) =>
                          atual.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x))
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Valor/un. (MT)</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={m.valor_unitario}
                      onChange={(e) =>
                        setEditMats((atual) =>
                          atual.map((x, j) =>
                            j === i ? { ...x, valor_unitario: e.target.value } : x
                          )
                        )
                      }
                    />
                  </div>
                  <div className="pb-2 text-right text-xs font-semibold">
                    {totalLinha ? fmtMt(totalLinha) : ""}
                  </div>
                  <div className="pb-1">
                    {editMats.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-erro"
                        aria-label="Remover material"
                        onClick={() => setEditMats((atual) => atual.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <datalist id="lista-gases-edit">
              {MATERIAIS_FECHO.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Input value={editObs} onChange={(e) => setEditObs(e.target.value)} />
          </div>

          <div className="flex items-center justify-between rounded-md border-2 border-[var(--primario)] px-3 py-2.5">
            <span className="font-semibold">TOTAL GERAL</span>
            <span className="text-lg font-bold">{fmtMt(editTotalMao + editTotalMat)}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFechoEdit(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarEdicao} disabled={aGravar}>
              {aGravar && <Rodar />}
              Guardar Correcções
            </Button>
          </div>
        </div>
      </Modal>

      {/* Vista de impressão / PDF: só aparece ao imprimir ou guardar como PDF.
          Respeita o filtro actual (mês/ano) e acaba sempre com o TOTAL GERAL. */}
      <div className="so-imprimir">
        <header className="imp-cabeca">
          <h1>Faturação CdM - Obras Fechadas</h1>
          <p>
            Período: {etiquetaPeriodo} · Emitido em {formatarData(dataHojeISO())} · Portal Danmo
            Service System
          </p>
        </header>

        <h2>Resumo por mês</h2>
        <table className="imp-tab">
          <thead>
            <tr>
              <th>Mês</th>
              <th>Obras</th>
              <th>Horas CdM</th>
              <th>Horas nossas</th>
              <th>Diferença (h)</th>
              <th>Material</th>
              <th>Total geral</th>
            </tr>
          </thead>
          <tbody>
            {porMes.map((m) => (
              <tr key={m.mes}>
                <td>{etiquetaMes(m.mes)}</td>
                <td>{m.obras}</td>
                <td>{m.horas_cdm} h</td>
                <td>{m.horas_nossas} h</td>
                <td>{arred2(m.horas_cdm - m.horas_nossas)} h</td>
                <td>{fmtMt(m.total_material)}</td>
                <td>{fmtMt(m.total_geral)}</td>
              </tr>
            ))}
            <tr className="imp-total">
              <td>TOTAL</td>
              <td>{totais.obras}</td>
              <td>{totais.horas_cdm} h</td>
              <td>{totais.horas_nossas} h</td>
              <td>{arred2(totais.horas_cdm - totais.horas_nossas)} h</td>
              <td>{fmtMt(totais.total_material)}</td>
              <td>{fmtMt(totais.total_geral)}</td>
            </tr>
          </tbody>
        </table>

        <h2>Detalhe das obras ({linhas.length})</h2>
        <table className="imp-tab">
          <thead>
            <tr>
              <th>Nº Obra</th>
              <th>Máquina</th>
              <th>Fecho</th>
              <th>Dias até fecho</th>
              <th>Dias pós-trab.</th>
              <th>H. CdM</th>
              <th>H. nossas</th>
              <th>Dif. (h)</th>
              <th>Mão de obra</th>
              <th>Material</th>
              <th>Total geral</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.numero_obra || "S/Nº"}
                  {l.materiais.length > 0 && (
                    <div className="imp-mat">
                      {l.materiais
                        .map((m) => `${m.material} ${m.quantidade} x ${m.valor_unitario}`)
                        .join("; ")}
                    </div>
                  )}
                </td>
                <td>{l.equip_code || "-"}</td>
                <td>{formatarData(l.data_fecho)}</td>
                <td>{l.dias_ate_fecho}</td>
                <td>{l.dias_apos_trabalho}</td>
                <td>{l.horas_cdm} h</td>
                <td>{l.horas_nossas} h</td>
                <td>{l.diferenca_horas} h</td>
                <td>{fmtMt(l.total_mao_obra)}</td>
                <td>{fmtMt(l.total_material)}</td>
                <td>{fmtMt(l.total_geral)}</td>
              </tr>
            ))}
            <tr className="imp-total">
              <td colSpan={8}>TOTAL GERAL ({linhas.length} obras)</td>
              <td>{fmtMt(totais.total_mao_obra)}</td>
              <td>{fmtMt(totais.total_material)}</td>
              <td>{fmtMt(totais.total_geral)}</td>
            </tr>
          </tbody>
        </table>

        <p className="imp-nota">
          Dias até fecho: da abertura da obra ao fecho pela CdM. Dias pós-trabalho: da última
          intervenção do nosso pessoal ao fecho. Diferença (h): horas consideradas pela CdM menos as
          horas registadas pelo nosso pessoal.
        </p>
      </div>

      <style jsx global>{`
        .so-imprimir {
          display: none;
        }
        @media print {
          @page {
            size: A4 landscape;
            margin: 12mm;
          }
          .nao-imprimir {
            display: none !important;
          }
          .so-imprimir {
            display: block !important;
            color: #000;
            background: #fff;
            font-family: Arial, sans-serif;
            font-size: 11px;
          }
          .imp-cabeca {
            border-bottom: 2px solid #009639;
            padding-bottom: 6px;
            margin-bottom: 10px;
          }
          .imp-cabeca h1 {
            font-size: 16px;
            font-weight: bold;
            margin: 0;
          }
          .imp-cabeca p {
            margin: 2px 0 0;
            font-size: 10px;
            color: #444;
          }
          .so-imprimir h2 {
            font-size: 12px;
            font-weight: bold;
            margin: 12px 0 4px;
          }
          .imp-tab {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
          }
          .imp-tab th,
          .imp-tab td {
            border: 1px solid #999;
            padding: 3px 5px;
            text-align: left;
          }
          .imp-tab th {
            background: #eee;
          }
          .imp-mat {
            color: #444;
            font-size: 9px;
            margin-top: 2px;
          }
          .imp-total td {
            font-weight: bold;
            background: #f2f2f2;
          }
          .imp-nota {
            margin-top: 10px;
            font-size: 9px;
            color: #555;
          }
        }
      `}</style>
    </div>
  );
}

/* ---- KPI ---- */
function KPI({
  titulo,
  valor,
  nota,
  destaque
}: {
  titulo: string;
  valor: string;
  nota?: string;
  destaque?: boolean;
}) {
  return (
    <Card className={"card-sombra " + (destaque ? "border-[var(--primario)] border-2" : "")}>
      <CardContent className="space-y-1 p-4">
        <p className="text-muted-foreground text-xs font-semibold uppercase">{titulo}</p>
        <p className={"text-xl font-bold " + (destaque ? "text-[var(--primario)]" : "")}>{valor}</p>
        {nota && <p className="text-muted-foreground text-xs">{nota}</p>}
      </CardContent>
    </Card>
  );
}

/* ---- Linha da tabela (com materiais expandíveis) ---- */
function FechoLinha({
  linha,
  aberta,
  alternar,
  podeEditar,
  podeApagar,
  onEditar,
  onApagar
}: {
  linha: LinhaFaturacao;
  aberta: boolean;
  alternar: () => void;
  podeEditar: boolean;
  podeApagar: boolean;
  onEditar: () => void;
  onApagar: () => void;
}) {
  const dif = linha.diferenca_horas;
  return (
    <>
      <tr className="border-b hover:bg-accent/30">
        <td className="py-2 pr-2">
          <button
            type="button"
            onClick={alternar}
            aria-label={aberta ? "Fechar detalhes" : "Ver detalhes"}
            className="rounded p-1 hover:bg-accent"
          >
            {aberta ? (
              <ChevronDown className="size-4" aria-hidden />
            ) : (
              <ChevronRight className="size-4" aria-hidden />
            )}
          </button>
        </td>
        <td className="py-2 pr-2 font-medium">{linha.numero_obra || "S/Nº"}</td>
        <td className="py-2 pr-2">{linha.equip_code || "-"}</td>
        <td className="py-2 pr-2">{formatarData(linha.data_fecho)}</td>
        <td className="py-2 pr-2 text-right">{linha.dias_ate_fecho}</td>
        <td className="py-2 pr-2 text-right">{linha.dias_apos_trabalho}</td>
        <td className="py-2 pr-2 text-right">{linha.horas_cdm} h</td>
        <td className="py-2 pr-2 text-right">{linha.horas_nossas} h</td>
        <td className={"py-2 pr-2 text-right " + (dif > 0 ? "text-erro" : dif < 0 ? "text-sucesso" : "")}>
          {dif} h
        </td>
        <td className="py-2 pr-2 text-right font-semibold">{fmtMt(linha.total_geral)}</td>
        <td className="py-2">
          <span className="flex justify-end gap-1">
            {podeEditar && (
              <Button variant="ghost" size="icon" className="size-8" aria-label="Editar fecho" onClick={onEditar}>
                <Pencil className="size-4" aria-hidden />
              </Button>
            )}
            {podeApagar && (
              <Button variant="ghost" size="icon" className="size-8 text-erro" aria-label="Apagar fecho" onClick={onApagar}>
                <Trash2 className="size-4" aria-hidden />
              </Button>
            )}
          </span>
        </td>
      </tr>
      {aberta && (
        <tr className="bg-accent/20">
          <td colSpan={11} className="px-4 py-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase">Materiais aplicados</p>
                {linha.materiais.length ? (
                  <ul className="space-y-1 text-sm">
                    {linha.materiais.map((m: MaterialFecho) => (
                      <li key={m.id} className="flex justify-between gap-2">
                        <span>
                          {m.material} - {m.quantidade} x {fmtMt(m.valor_unitario)}
                        </span>
                        <span className="font-semibold">{fmtMt(m.total)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground text-sm">Sem materiais.</p>
                )}
                <p className="text-muted-foreground text-xs">
                  Mão de obra: {fmtMt(linha.total_mao_obra)} ({linha.horas_cdm} h x {fmtMt(linha.valor_hora)}/h) +
                  material: {fmtMt(linha.total_material)}
                </p>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase">Detalhes</p>
                <p className="text-sm">
                  Responsável do fecho: <span className="font-medium">{linha.responsavel || "-"}</span>
                </p>
                <p className="text-sm">
                  Última intervenção:{" "}
                  <span className="font-medium">
                    {linha.data_ultima_intervencao ? formatarData(linha.data_ultima_intervencao) : "-"}
                  </span>
                </p>
                <p className="text-sm">
                  Abertura da obra:{" "}
                  <span className="font-medium">
                    {linha.data_abertura ? formatarData(linha.data_abertura) : "-"}
                  </span>
                </p>
                {linha.observacao && <p className="text-sm">Obs.: {linha.observacao}</p>}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
