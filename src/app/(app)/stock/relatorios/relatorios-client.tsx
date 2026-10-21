"use client";

/**
 * Relatórios do Stock: Inventário Actual, Movimentos por Período e
 * Resumo de Compras. Os números vêm do servidor (/api/stock/relatorios)
 * e as exportações Excel/PDF mostram exactamente as linhas visíveis.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileDown, FileSpreadsheet, Search } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Etiqueta, Rodar, pedir } from "@/components/oficina/ui-bits";
import { cn } from "@/lib/utils";
import { COR_POSICAO, fmtData, fmtMzn, fmtNum, normalizar } from "@/lib/stock";
import type { Material, MovimentoStock } from "@/lib/stock";
import { exportarRelatorioExcel, exportarRelatorioPdf } from "./exportar";

type Rel = "inventario" | "movimentos" | "compras";

type LinhaInventario = {
  id: string;
  referencia: string;
  nome: string;
  categoria: string | null;
  unidade: string;
  localizacao: string | null;
  minimo: number;
  stock: number;
  estado: string;
};

type RespostaInventario = {
  ok: boolean;
  linhas: LinhaInventario[];
  kpis: { total: number; ok: number; baixo: number; esgotado: number };
  materiais: Material[];
};

type RespostaMovimentos = {
  ok: boolean;
  linhas: MovimentoStock[];
  kpis: { totalEntradas: number; totalSaidas: number; qtdEntradas: number; qtdSaidas: number };
  materiais: Material[];
};

type RespostaCompras = {
  ok: boolean;
  linhas: MovimentoStock[];
  porFornecedor: { fornecedor: string; count: number; total: number }[];
  kpis: { total: number; totalGasto: number };
  materiais: Material[];
};

const REL_INFO: Record<Rel, { label: string; subtitulo: string }> = {
  inventario: {
    label: "Inventário Actual",
    subtitulo: "O que existe agora no armazém, com estado e localização"
  },
  movimentos: {
    label: "Movimentos por Período",
    subtitulo: "Entradas e saídas confirmadas dentro das datas escolhidas"
  },
  compras: {
    label: "Resumo de Compras",
    subtitulo: "O que foi comprado no período, com o gasto por fornecedor"
  }
};

function primeiroDiaMes(): string {
  const d = new Date(Date.now() + 2 * 3600 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

export function RelatoriosClient() {
  const [rel, setRel] = useState<Rel>("inventario");
  const [aCarregar, setACarregar] = useState(false);
  const [falha, setFalha] = useState("");
  const [busca, setBusca] = useState("");
  const [aExportar, setAExportar] = useState("");

  // inventario
  const [inv, setInv] = useState<RespostaInventario | null>(null);
  const [fCat, setFCat] = useState("");
  const [fEstado, setFEstado] = useState("");

  // movimentos / compras
  const [mv, setMv] = useState<RespostaMovimentos | null>(null);
  const [cp, setCp] = useState<RespostaCompras | null>(null);
  const [fDe, setFDe] = useState(primeiroDiaMes());
  const [fAte, setFAte] = useState(
    new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10)
  );
  const [fTipo, setFTipo] = useState("");
  const [fMaterial, setFMaterial] = useState("");
  const [fFornecedor, setFFornecedor] = useState("");

  const mapaMat = useMemo(() => {
    const base = rel === "inventario" ? inv?.materiais : rel === "movimentos" ? mv?.materiais : cp?.materiais;
    return new Map((base || []).map((m) => [m.id, m]));
  }, [rel, inv, mv, cp]);

  const fornecedores = useMemo(() => {
    const lista = new Set<string>();
    (cp?.linhas || []).forEach((m) => m.fornecedor && lista.add(m.fornecedor));
    return [...lista].sort((a, b) => a.localeCompare(b));
  }, [cp]);

  const carregar = useCallback(
    (qual: Rel) => {
      setACarregar(true);
      setFalha("");
      const qs = new URLSearchParams({ rel: qual });
      if (qual === "inventario") {
        if (fCat) qs.set("categoria", fCat);
        if (fEstado) qs.set("estado", fEstado);
      } else {
        qs.set("de", fDe);
        qs.set("ate", fAte);
        if (qual === "movimentos") {
          if (fTipo) qs.set("tipo", fTipo);
          if (fMaterial) qs.set("material", fMaterial);
        }
        if (qual === "compras" && fFornecedor) qs.set("fornecedor", fFornecedor);
      }
      pedir<RespostaInventario & RespostaMovimentos & RespostaCompras>(
        `/api/stock/relatorios?${qs.toString()}`
      )
        .then((d) => {
          if (qual === "inventario") setInv(d as RespostaInventario);
          else if (qual === "movimentos") setMv(d as RespostaMovimentos);
          else setCp(d as RespostaCompras);
        })
        .catch((e: Error) => setFalha(e.message))
        .finally(() => setACarregar(false));
    },
    [fCat, fEstado, fDe, fAte, fTipo, fMaterial, fFornecedor]
  );

  useEffect(() => {
    // Primeira carga de cada relatório, sem setState sincrono no efeito
    // (regra react-hooks): os filtros usados são os do render actual;
    // mudar um filtro depois não recarrega sozinho, quem recarrega é o
    // botão Aplicar.
    let vivo = true;
    const qs = new URLSearchParams({ rel });
    if (rel === "inventario") {
      if (fCat) qs.set("categoria", fCat);
      if (fEstado) qs.set("estado", fEstado);
    } else {
      qs.set("de", fDe);
      qs.set("ate", fAte);
      if (rel === "movimentos") {
        if (fTipo) qs.set("tipo", fTipo);
        if (fMaterial) qs.set("material", fMaterial);
      }
      if (rel === "compras" && fFornecedor) qs.set("fornecedor", fFornecedor);
    }
    pedir<RespostaInventario & RespostaMovimentos & RespostaCompras>(
      `/api/stock/relatorios?${qs.toString()}`
    )
      .then((d) => {
        if (!vivo) return;
        if (rel === "inventario") setInv(d as RespostaInventario);
        else if (rel === "movimentos") setMv(d as RespostaMovimentos);
        else setCp(d as RespostaCompras);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      })
      .finally(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [rel]);

  /* ---------- exportação ---------- */

  function filtrosTexto(): string {
    if (rel === "inventario") {
      const partes = ["Inventário actual"];
      if (fCat) partes.push(`Categoria: ${fCat}`);
      if (fEstado) partes.push(`Estado: ${fEstado}`);
      return partes.join("   ·   ");
    }
    const base = `${fmtData(fDe)} a ${fmtData(fAte)}`;
    if (rel === "movimentos") {
      const partes = [`Período: ${base}`];
      if (fTipo) partes.push(`Tipo: ${fTipo === "entrada" ? "Entradas" : "Saídas"}`);
      if (fMaterial) partes.push(`Material: ${mapaMat.get(fMaterial)?.nome || fMaterial}`);
      return partes.join("   ·   ");
    }
    return `Período: ${base}${fFornecedor ? `   ·   Fornecedor: ${fFornecedor}` : ""}`;
  }

  async function exportarExcel() {
    setAExportar("excel");
    try {
      if (rel === "inventario" && inv) {
        await exportarRelatorioExcel(
          "Inventário Actual",
          "Inventário",
          filtrosTexto(),
          ["Referência", "Nome", "Categoria", "Unidade", "Mínimo", "Stock", "Estado", "Localização"],
          linhasInventario().map((l) => [
            l.referencia,
            l.nome,
            l.categoria || "",
            l.unidade,
            l.minimo,
            l.stock,
            l.estado,
            l.localizacao || ""
          ]),
          [4, 5]
        );
      } else if (rel === "movimentos" && mv) {
        await exportarRelatorioExcel(
          "Movimentos por Período",
          "Movimentos",
          filtrosTexto(),
          ["Data", "Tipo", "Material", "Qtd", "Unidade", "Quem", "Requisição/Pro-forma", "Observações"],
          linhasMovimentos().map((l) => [
            fmtData(l.data_movimento),
            l.tipo === "entrada" ? "Entrada" : "Saída",
            l.rotulo,
            Number(l.quantidade),
            l.unidade,
            l.quem,
            l.doc,
            l.observacoes || ""
          ]),
          [3]
        );
      } else if (rel === "compras" && cp) {
        await exportarRelatorioExcel(
          "Resumo de Compras",
          "Compras",
          filtrosTexto(),
          ["Data", "Material", "Qtd", "Unidade", "Preço unit.", "Total", "Fornecedor", "Pro-forma"],
          linhasCompras().map((l) => {
            const mat = mapaMat.get(l.material_id);
            return [
              fmtData(l.data_movimento),
              mat ? `${mat.referencia} - ${mat.nome}` : "-",
              Number(l.quantidade),
              mat?.unidade || "",
              Number(l.preco_unitario) || 0,
              (Number(l.preco_unitario) || 0) * (Number(l.quantidade) || 0),
              l.fornecedor || "Sem fornecedor",
              l.numero_po || ""
            ];
          }),
          [2, 4, 5]
        );
      }
      toast.success("Excel descarregado.");
    } catch {
      toast.error("Não foi possível exportar o Excel.");
    } finally {
      setAExportar("");
    }
  }

  async function exportarPdf() {
    setAExportar("pdf");
    try {
      if (rel === "inventario" && inv) {
        await exportarRelatorioPdf(
          "Inventário Actual",
          filtrosTexto(),
          ["Referência", "Nome", "Categoria", "Unidade", "Mínimo", "Stock", "Estado", "Localização"],
          linhasInventario().map((l) => [
            l.referencia,
            l.nome,
            l.categoria || "-",
            l.unidade,
            l.minimo,
            l.stock,
            l.estado,
            l.localizacao || "-"
          ]),
          { 4: { halign: "right" }, 5: { halign: "right" } }
        );
      } else if (rel === "movimentos" && mv) {
        await exportarRelatorioPdf(
          "Movimentos por Período",
          filtrosTexto(),
          ["Data", "Tipo", "Material", "Qtd", "Unidade", "Quem", "Requisição/Pro-forma", "Observações"],
          linhasMovimentos().map((l) => [
            fmtData(l.data_movimento),
            l.tipo === "entrada" ? "Entrada" : "Saída",
            l.rotulo,
            Number(l.quantidade),
            l.unidade,
            l.quem,
            l.doc,
            l.observacoes || "-"
          ]),
          { 3: { halign: "right" } }
        );
      } else if (rel === "compras" && cp) {
        await exportarRelatorioPdf(
          "Resumo de Compras",
          filtrosTexto(),
          ["Data", "Material", "Qtd", "Unidade", "Preço unit.", "Total", "Fornecedor", "Pro-forma"],
          linhasCompras().map((l) => {
            const mat = mapaMat.get(l.material_id);
            return [
              fmtData(l.data_movimento),
              mat ? `${mat.referencia} - ${mat.nome}` : "-",
              Number(l.quantidade),
              mat?.unidade || "",
              Number(l.preco_unitario) || 0,
              (Number(l.preco_unitario) || 0) * (Number(l.quantidade) || 0),
              l.fornecedor || "Sem fornecedor",
              l.numero_po || "-"
            ];
          }),
          { 2: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } }
        );
      }
      toast.success("PDF descarregado.");
    } catch {
      toast.error("Não foi possível exportar o PDF.");
    } finally {
      setAExportar("");
    }
  }

  /* ---------- linhas visíveis (com busca) ---------- */

  function linhasInventario(): LinhaInventario[] {
    let l = inv?.linhas || [];
    const q = normalizar(busca);
    if (q) l = l.filter((x) => normalizar(`${x.referencia} ${x.nome}`).includes(q));
    return l;
  }

  function linhasMovimentos(): (MovimentoStock & { rotulo: string; unidade: string; quem: string; doc: string })[] {
    let l = mv?.linhas || [];
    const q = normalizar(busca);
    if (q) {
      l = l.filter((m) => {
        const mat = mapaMat.get(m.material_id);
        return (
          normalizar(`${mat?.referencia} ${mat?.nome}`).includes(q) ||
          normalizar(m.colaborador_nome).includes(q) ||
          normalizar(m.fornecedor).includes(q) ||
          normalizar(m.numero_requisicao).includes(q) ||
          normalizar(m.numero_po).includes(q)
        );
      });
    }
    return l.map((m) => {
      const mat = mapaMat.get(m.material_id);
      return {
        ...m,
        rotulo: mat ? `${mat.referencia} - ${mat.nome}` : "-",
        unidade: mat?.unidade || "",
        quem: m.tipo === "entrada" ? m.comprador_nome || "-" : m.colaborador_nome || "-",
        doc: m.tipo === "entrada" ? m.numero_po || "-" : m.numero_requisicao || "-"
      };
    });
  }

  function linhasCompras(): MovimentoStock[] {
    let l = cp?.linhas || [];
    const q = normalizar(busca);
    if (q) {
      l = l.filter((m) => {
        const mat = mapaMat.get(m.material_id);
        return normalizar(`${mat?.referencia} ${mat?.nome}`).includes(q) || normalizar(m.fornecedor).includes(q);
      });
    }
    return l;
  }

  const relMovimentos = rel === "movimentos";
  const relCompras = rel === "compras";
  const temDados =
    rel === "inventario" ? Boolean(inv) : relMovimentos ? Boolean(mv) : Boolean(cp);

  const campo = "h-9 rounded-md border border-input bg-background px-2 text-sm";
  const rotulo = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div className="space-y-4">
      <Cabeca
        titulo="Stock - Relatórios"
        subtitulo="Inventário, movimentos e compras, com exportação Excel e PDF"
      />

      <div className="card-sombra p-4">
        <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Relatórios do stock">
          {(Object.keys(REL_INFO) as Rel[]).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={rel === r}
              onClick={() => {
                setRel(r);
                setBusca("");
              }}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                rel === r
                  ? "bg-primario text-white"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              )}
            >
              {REL_INFO[r].label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {rel === "inventario" && (
            <>
              <div>
                <label className={rotulo}>Categoria</label>
                <select className={campo} value={fCat} onChange={(e) => setFCat(e.target.value)}>
                  <option value="">Todas</option>
                  {[...new Set((inv?.materiais || []).filter((m) => m.categoria).map((m) => m.categoria as string))]
                    .sort((a, b) => a.localeCompare(b))
                    .map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className={rotulo}>Estado</label>
                <select className={campo} value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="OK">OK</option>
                  <option value="Stock Baixo">Stock Baixo</option>
                  <option value="Esgotado">Esgotado</option>
                </select>
              </div>
            </>
          )}

          {(relMovimentos || relCompras) && (
            <>
              <div>
                <label className={rotulo}>De</label>
                <input type="date" className={campo} value={fDe} onChange={(e) => setFDe(e.target.value)} />
              </div>
              <div>
                <label className={rotulo}>Até</label>
                <input type="date" className={campo} value={fAte} onChange={(e) => setFAte(e.target.value)} />
              </div>
            </>
          )}

          {relMovimentos && (
            <>
              <div>
                <label className={rotulo}>Tipo</label>
                <select className={campo} value={fTipo} onChange={(e) => setFTipo(e.target.value)}>
                  <option value="">Entradas e saídas</option>
                  <option value="entrada">Só entradas</option>
                  <option value="saida">Só saídas</option>
                </select>
              </div>
              <div>
                <label className={rotulo}>Material</label>
                <select className={campo} value={fMaterial} onChange={(e) => setFMaterial(e.target.value)}>
                  <option value="">Todos</option>
                  {(mv?.materiais || []).map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.referencia} - {m.nome}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {relCompras && (
            <div>
              <label className={rotulo}>Fornecedor</label>
              <select className={campo} value={fFornecedor} onChange={(e) => setFFornecedor(e.target.value)}>
                <option value="">Todos</option>
                {fornecedores.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={() => carregar(rel)}
            disabled={aCarregar}
            className="h-9 rounded-md bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
          >
            {aCarregar ? <Rodar className="size-4" /> : "Aplicar"}
          </button>
        </div>
      </div>

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}

      {temDados && !falha && (
        <div className="card-sombra p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{REL_INFO[rel].label}</span>
            <span className="text-xs text-muted-foreground">{REL_INFO[rel].subtitulo}</span>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar na lista..."
                  className="h-9 w-56 rounded-md border border-input bg-background pl-8 pr-2 text-sm"
                />
              </div>
              <button
                onClick={exportarExcel}
                disabled={Boolean(aExportar)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                {aExportar === "excel" ? <Rodar className="size-4" /> : <FileSpreadsheet className="size-4" />}
                Excel
              </button>
              <button
                onClick={exportarPdf}
                disabled={Boolean(aExportar)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
              >
                {aExportar === "pdf" ? <Rodar className="size-4" /> : <FileDown className="size-4" />}
                PDF
              </button>
            </div>
          </div>

          {/* KPIs do relatório */}
          {rel === "inventario" && inv && (
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <Etiqueta cor="bg-muted text-muted-foreground">Materiais: {inv.kpis.total}</Etiqueta>
              <Etiqueta cor={COR_POSICAO.OK}>OK: {inv.kpis.ok}</Etiqueta>
              <Etiqueta cor={COR_POSICAO["Stock Baixo"]}>Stock Baixo: {inv.kpis.baixo}</Etiqueta>
              <Etiqueta cor={COR_POSICAO.Esgotado}>Esgotado: {inv.kpis.esgotado}</Etiqueta>
            </div>
          )}
          {relMovimentos && mv && (
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <Etiqueta cor="bg-sucesso-bg text-sucesso">
                Entradas: {mv.kpis.totalEntradas} ({fmtNum(mv.kpis.qtdEntradas)})
              </Etiqueta>
              <Etiqueta cor="bg-erro-bg text-erro">
                Saídas: {mv.kpis.totalSaidas} ({fmtNum(mv.kpis.qtdSaidas)})
              </Etiqueta>
            </div>
          )}
          {relCompras && cp && (
            <div className="mb-3 flex flex-wrap gap-2 text-xs">
              <Etiqueta cor="bg-muted text-muted-foreground">Compras: {cp.kpis.total}</Etiqueta>
              <Etiqueta cor="bg-ambar-claro text-ambar-texto">
                Total gasto: {fmtMzn(cp.kpis.totalGasto)}
              </Etiqueta>
            </div>
          )}

          {/* Tabela do relatório */}
          <div className="overflow-x-auto">
            {rel === "inventario" && (
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Referência</th>
                    <th className="px-2 py-2 font-medium">Nome</th>
                    <th className="px-2 py-2 font-medium">Categoria</th>
                    <th className="px-2 py-2 text-right font-medium">Mínimo</th>
                    <th className="px-2 py-2 text-right font-medium">Stock</th>
                    <th className="px-2 py-2 font-medium">Estado</th>
                    <th className="px-2 py-2 font-medium">Localização</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasInventario().length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted-foreground">
                        Nenhum material nesta selecção.
                      </td>
                    </tr>
                  )}
                  {linhasInventario().map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5 font-mono text-xs font-semibold text-ambar-texto">{l.referencia}</td>
                      <td className="px-2 py-1.5 font-semibold">{l.nome}</td>
                      <td className="px-2 py-1.5">{l.categoria || "-"}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(l.minimo)}</td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-bold tabular-nums",
                          l.stock <= 0 ? "text-erro" : l.estado === "Stock Baixo" ? "text-ambar-texto" : "text-sucesso"
                        )}
                      >
                        {fmtNum(l.stock)} {l.unidade}
                      </td>
                      <td className="px-2 py-1.5">
                        <Etiqueta cor={COR_POSICAO[l.estado as keyof typeof COR_POSICAO] || COR_POSICAO.OK}>
                          {l.estado}
                        </Etiqueta>
                      </td>
                      <td className="px-2 py-1.5">{l.localizacao || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {relMovimentos && (
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Data</th>
                    <th className="px-2 py-2 font-medium">Tipo</th>
                    <th className="px-2 py-2 font-medium">Material</th>
                    <th className="px-2 py-2 text-right font-medium">Qtd</th>
                    <th className="px-2 py-2 font-medium">Quem</th>
                    <th className="px-2 py-2 font-medium">Requisição/Pro-forma</th>
                    <th className="px-2 py-2 font-medium">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasMovimentos().length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted-foreground">
                        Nenhum movimento neste período.
                      </td>
                    </tr>
                  )}
                  {linhasMovimentos().map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-2 py-1.5 tabular-nums">{fmtData(l.data_movimento)}</td>
                      <td className="px-2 py-1.5">
                        <Etiqueta cor={l.tipo === "entrada" ? "bg-sucesso-bg text-sucesso" : "bg-erro-bg text-erro"}>
                          {l.tipo === "entrada" ? "Entrada" : "Saída"}
                        </Etiqueta>
                      </td>
                      <td className="px-2 py-1.5 font-semibold">{l.rotulo}</td>
                      <td
                        className={cn(
                          "px-2 py-1.5 text-right font-bold tabular-nums",
                          l.tipo === "entrada" ? "text-sucesso" : "text-erro"
                        )}
                      >
                        {l.tipo === "entrada" ? "+" : "-"}
                        {fmtNum(Number(l.quantidade))} {l.unidade}
                      </td>
                      <td className="px-2 py-1.5">{l.quem}</td>
                      <td className="px-2 py-1.5">{l.doc}</td>
                      <td className="px-2 py-1.5">{l.observacoes || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {relCompras && (
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Data</th>
                    <th className="px-2 py-2 font-medium">Material</th>
                    <th className="px-2 py-2 text-right font-medium">Qtd</th>
                    <th className="px-2 py-2 text-right font-medium">Preço unit.</th>
                    <th className="px-2 py-2 text-right font-medium">Total</th>
                    <th className="px-2 py-2 font-medium">Fornecedor</th>
                    <th className="px-2 py-2 font-medium">Pro-forma</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasCompras().length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-muted-foreground">
                        Nenhuma compra neste período.
                      </td>
                    </tr>
                  )}
                  {linhasCompras().map((m) => {
                    const mat = mapaMat.get(m.material_id);
                    const totalLinha = (Number(m.preco_unitario) || 0) * (Number(m.quantidade) || 0);
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="px-2 py-1.5 tabular-nums">{fmtData(m.data_movimento)}</td>
                        <td className="px-2 py-1.5 font-semibold">
                          {mat ? `${mat.referencia} - ${mat.nome}` : "-"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {fmtNum(Number(m.quantidade))} {mat?.unidade || ""}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {m.preco_unitario ? fmtMzn(m.preco_unitario) : "-"}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-ambar-texto">
                          {totalLinha ? fmtMzn(totalLinha) : "-"}
                        </td>
                        <td className="px-2 py-1.5">{m.fornecedor || "-"}</td>
                        <td className="px-2 py-1.5">{m.numero_po || "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Resumo por fornecedor (só no relatório de compras) */}
          {relCompras && cp && cp.porFornecedor.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-sm font-semibold">Gasto por fornecedor</div>
              <div className="divide-y">
                {cp.porFornecedor
                  .filter((f) => {
                    const q = normalizar(busca);
                    return !q || normalizar(f.fornecedor).includes(q);
                  })
                  .map((f) => (
                    <div key={f.fornecedor} className="flex items-center gap-3 py-1.5 text-sm">
                      <span className="font-semibold">{f.fornecedor}</span>
                      <span className="text-xs text-muted-foreground">{f.count} compras</span>
                      <span className="ml-auto font-bold tabular-nums text-ambar-texto">{fmtMzn(f.total)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
