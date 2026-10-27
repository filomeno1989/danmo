/**
 * /aquisicao/historico - Histórico de Pedidos de Aquisição (cliente).
 *
 * Migração do lista.html do hub, com melhorias:
 - pesquisa sem acentos por nº, solicitante, fornecedor, denominação,
   nº da cotação/pro-forma e MATERIAIS das linhas (o hub também, mas com
   todos os itens no navegador; aqui o servidor manda as designações);
 - exportação Excel da lista filtrada no padrão verde DANMO;
 - apagar com confirmação e trava (o hub apagava item a item).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, FileSpreadsheet, LoaderCircle, Pencil, Printer, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  alvoPesquisaPedido,
  fmtDataAq,
  numeroFmt,
  semAcentos,
  type FornecedorAq,
  type PedidoAquisicao
} from "@/lib/aquisicao";

type Dados = {
  ok: boolean;
  pedidos: PedidoAquisicao[];
  designacoesPorPedido: Record<string, string[]>;
};

export function HistoricoClient({ podeApagar }: { podeApagar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [fornecedores, setFornecedores] = useState<FornecedorAq[]>([]);
  const [falha, setFalha] = useState("");
  const [aCarregar, setACarregar] = useState(true);

  const [fAno, setFAno] = useState("");
  const [fFornecedor, setFFornecedor] = useState("");
  const [busca, setBusca] = useState("");
  const [aApagar, setAApagar] = useState<PedidoAquisicao | null>(null);
  const [aApagarAgora, setAApagarAgora] = useState(false);

  /* Ano por defeito: o ano corrente se tiver pedidos, senão o mais
     recente (mesma escolha do hub); fixado na CARGA, sem efeito extra. */
  const fixaAno = (p: Dados) => {
    const anosLocal = [...new Set((p.pedidos || []).map((x) => x.ano))].sort((a, b) => b - a);
    const anoAtual = new Date().getFullYear();
    setFAno((prev) => prev || String(anosLocal.includes(anoAtual) ? anoAtual : (anosLocal[0] ?? anoAtual)));
  };

  const carregar = () => {
    setACarregar(true);
    setFalha("");
    Promise.all([
      pedir<Dados>("/api/aquisicao/pedidos"),
      pedir<{ fornecedores: FornecedorAq[] }>("/api/aquisicao/fornecedores")
    ])
      .then(([p, f]) => {
        setDados(p);
        setFornecedores(f.fornecedores || []);
        fixaAno(p);
      })
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  };

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<Dados>("/api/aquisicao/pedidos"),
      pedir<{ fornecedores: FornecedorAq[] }>("/api/aquisicao/fornecedores")
    ])
      .then(([p, f]) => {
        if (!vivo) return;
        setDados(p);
        setFornecedores(f.fornecedores || []);
        fixaAno(p);
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
  }, []);

  const anos = useMemo(() => {
    const conj = [...new Set((dados?.pedidos || []).map((p) => p.ano))].sort((a, b) => b - a);
    const anoAtual = new Date().getFullYear();
    return conj.length ? conj : [anoAtual];
  }, [dados]);

  const lista = useMemo(() => {
    const pedidos = dados?.pedidos || [];
    const q = semAcentos(busca.trim());
    return pedidos.filter((p) => {
      if (fAno && String(p.ano) !== fAno) return false;
      if (fFornecedor && p.fornecedor_id !== fFornecedor) return false;
      if (q && !alvoPesquisaPedido(p, (dados?.designacoesPorPedido || {})[p.id] || []).includes(q)) return false;
      return true;
    });
  }, [dados, fAno, fFornecedor, busca]);

  const apagar = async () => {
    if (!aApagar || aApagarAgora) return;
    setAApagarAgora(true);
    try {
      await enviar(`/api/aquisicao/pedidos/${aApagar.id}`, null, undefined, "DELETE");
      toast.success(`Pedido ${numeroFmt(aApagar.ano, aApagar.numero)} apagado.`);
      setAApagar(null);
      carregar();
    } catch {
      /* o toast já saiu */
    } finally {
      setAApagarAgora(false);
    }
  };

  const exportarExcel = async () => {
    if (!lista.length) {
      toast.error("Não há pedidos na lista para exportar.");
      return;
    }
    try {
      const XLSXS = await import("xlsx-js-style");
      const hoje = new Date();
      const linhas: (string | number)[][] = [
        ["DANMO SERVICE SYSTEM, LDA"],
        [`Histórico de Pedidos de Aquisição (filtro actual) - gerado em ${fmtDataAq(hoje.toISOString())}`],
        [],
        ["Nº Pedido", "Data", "Denominação", "Nº Cotação/Pro-forma", "Fornecedor", "Solicitante", "Nº Itens", "Materiais", "Observação Geral"]
      ];
      for (const p of lista) {
        const mats = (dados?.designacoesPorPedido || {})[p.id] || [];
        linhas.push([
          numeroFmt(p.ano, p.numero),
          fmtDataAq(p.data_pedido),
          p.tipo_documento || "",
          p.numero_cotacao_proforma || "",
          p.fornecedor_nome || "",
          p.solicitante || "",
          mats.length,
          mats.join("; "),
          p.observacao_geral || ""
        ]);
      }
      const ws = XLSXS.utils.aoa_to_sheet(linhas);
      ws["!cols"] = [{ wch: 11 }, { wch: 11 }, { wch: 16 }, { wch: 20 }, { wch: 34 }, { wch: 30 }, { wch: 8 }, { wch: 60 }, { wch: 40 }];
      const estiloCel = (r: number, c: number, s: object) => {
        const cel = ws[XLSXS.utils.encode_cell({ r, c })];
        if (cel) cel.s = s;
      };
      for (let c = 0; c < 9; c++) estiloCel(0, c, { font: { bold: true, sz: 14, color: { rgb: "1F7A33" } } });
      for (let c = 0; c < 9; c++) estiloCel(1, c, { font: { italic: true, sz: 10, color: { rgb: "666666" } } });
      for (let c = 0; c < 9; c++) {
        estiloCel(3, c, {
          font: { bold: true, color: { rgb: "FFFFFF" } },
          fill: { patternType: "solid", fgColor: { rgb: "1F7A33" } },
          alignment: { vertical: "center", wrapText: true }
        });
      }
      ws["!freeze"] = { xSplit: 0, ySplit: 4 };
      const wb = XLSXS.utils.book_new();
      XLSXS.utils.book_append_sheet(wb, ws, "Pedidos");
      XLSXS.writeFile(wb, `aquisicao-pedidos-${hoje.toISOString().slice(0, 10)}.xlsx`);
      toast.success(`Excel gerado com ${lista.length} pedido(s).`);
    } catch (e) {
      toast.error((e as Error).message || "Falha a gerar o Excel.");
    }
  };

  return (
    <div className="space-y-5">
      <Cabeca titulo="Histórico de Pedidos" subtitulo="Todos os pedidos de aquisição, por ano">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportarExcel}>
            <FileSpreadsheet className="size-4" aria-hidden /> Exportar Excel
          </Button>
          <Button asChild className="bg-emerald-700 hover:bg-emerald-800">
            <Link href="/aquisicao/novo">
              <ClipboardList className="size-4" aria-hidden /> Novo Pedido
            </Link>
          </Button>
        </div>
      </Cabeca>

      {falha ? (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{falha}</CardContent>
        </Card>
      ) : null}

      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              className="h-9 rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
              value={fAno}
              onChange={(e) => setFAno(e.target.value)}
              aria-label="Filtrar por ano"
            >
              {anos.map((a) => (
                <option key={a} value={String(a)}>{a}</option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
              value={fFornecedor}
              onChange={(e) => setFFornecedor(e.target.value)}
              aria-label="Filtrar por fornecedor"
            >
              <option value="">Todos os fornecedores</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                className="pl-9"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar por nº, solicitante, fornecedor ou material..."
              />
            </div>
          </div>

          {aCarregar ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar pedidos...
            </div>
          ) : lista.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Nenhum pedido encontrado.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Nº Pedido</th>
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Tipo / Nº Doc.</th>
                    <th className="py-2 pr-3">Fornecedor</th>
                    <th className="py-2 pr-3">Solicitante</th>
                    <th className="py-2 pr-3 text-center">Itens</th>
                    <th className="py-2">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((p) => {
                    const nItens = ((dados?.designacoesPorPedido || {})[p.id] || []).length;
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-bold">{numeroFmt(p.ano, p.numero)}</td>
                        <td className="py-2 pr-3">{fmtDataAq(p.data_pedido)}</td>
                        <td className="py-2 pr-3">{p.tipo_documento} nº {p.numero_cotacao_proforma}</td>
                        <td className="py-2 pr-3">{p.fornecedor_nome || "-"}</td>
                        <td className="py-2 pr-3">{p.solicitante || "-"}</td>
                        <td className="py-2 pr-3 text-center">
                          <span className="inline-flex items-center rounded-full bg-blue-500/12 px-2 py-0.5 text-[0.68rem] font-semibold text-blue-600 dark:text-blue-300">
                            {nItens}
                          </span>
                        </td>
                        <td className="py-2">
                          <a
                            className="mr-3 inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-emerald-700 dark:text-blue-400"
                            href={`/imprimir/aquisicao/${p.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Printer className="size-3.5" aria-hidden /> Ver / Imprimir
                          </a>
                          <Link
                            className="mr-3 inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-emerald-700 dark:text-blue-400"
                            href={`/aquisicao/novo?id=${p.id}`}
                          >
                            <Pencil className="size-3.5" aria-hidden /> Editar
                          </Link>
                          {podeApagar ? (
                            <button
                              className="inline-flex items-center gap-1 font-semibold text-red-600 hover:opacity-80"
                              onClick={() => setAApagar(p)}
                            >
                              <Trash2 className="size-3.5" aria-hidden /> Apagar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Modal
        aberto={!!aApagar}
        fechar={() => setAApagar(null)}
        titulo="Apagar pedido"
        subtitulo={
          aApagar
            ? `Apagar definitivamente o pedido ${numeroFmt(aApagar.ano, aApagar.numero)} de ${aApagar.fornecedor_nome || "-"}? Esta acção não pode ser desfeita.`
            : ""
        }
      >
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setAApagar(null)}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={aApagarAgora}
            onClick={apagar}
          >
            {aApagarAgora ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Apagar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
