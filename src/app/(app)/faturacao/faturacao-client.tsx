/**
 * /faturacao - Painel de Cotações e Faturas da Administração.
 *
 * Migração do dashboard.html do hub antigo, com melhorias:
 * - estatísticas do ANO corrente à parte do total histórico;
 * - pesquisa com texto sem acentos e sem etiquetas do assunto rico;
 * - acção "Gerar Fatura" directamente na linha de cada cotação;
 * - impressão do documento e do Anexo de Material (itens do cliente).
 */

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText,
  LoaderCircle,
  Pencil,
  Printer,
  Receipt,
  Search,
  Trash2,
  ArrowRightLeft,
  Users
} from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Etiqueta, enviar, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fmtData,
  fmtNum,
  hojeISO,
  SERVICO_LABEL,
  textoSemTags,
  totaisAnoPorTipo,
  type ClienteFat,
  type DocFaturacao,
  type ServicoTipo
} from "@/lib/faturacao";

type Dados = {
  ok: boolean;
  documentos: DocFaturacao[];
  clientes: ClienteFat[];
  estrutura?: boolean;
};

const COR_SERVICO: Record<ServicoTipo, string> = {
  mao: "bg-sucesso-bg text-sucesso",
  material: "bg-blue-500/12 text-blue-600 dark:text-blue-300",
  misto: "bg-ambar-claro text-ambar-texto"
};

export function FaturacaoClient({
  podeApagar
}: {
  podeApagar: boolean;
}) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [fTipo, setFTipo] = useState("");
  const [busca, setBusca] = useState("");
  const [aApagar, setAApagar] = useState<DocFaturacao | null>(null);
  const [aConverter, setAConverter] = useState<DocFaturacao | null>(null);

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    pedir<Dados>("/api/faturacao/documentos")
      .then((d) => setDados(d))
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    // Primeira carga sem setState sincrono no efeito (regra react-hooks)
    let vivo = true;
    pedir<Dados>("/api/faturacao/documentos")
      .then((d) => {
        if (!vivo) return;
        setDados(d);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const lista = useMemo(() => {
    const docs = dados?.documentos || [];
    const q = norm(busca.trim());
    return docs.filter((d) => {
      if (fTipo && d.tipo !== fTipo) return false;
      if (!q) return true;
      const alvo = [d.numero, d.cliente_nome, textoSemTags(d.assunto || ""), d.utilizador_nome]
        .map((x) => norm(String(x || "")))
        .join(" ");
      return alvo.includes(q);
    });
  }, [dados, fTipo, busca]);

  const ano = Number(hojeISO().slice(0, 4));
  const stats = useMemo(() => {
    const docs = dados?.documentos || [];
    const doAno = docs.filter((d) => String(d.data || "").slice(0, 4) === String(ano));
    /* Dinheiro do ano SÓ das faturas: somar cotações no mesmo número
       dobrava o valor quando a cotação era convertida (o mesmo trabalho
       contava 2x). As cotações ficam à parte, no próprio cartão. */
    const dinheiro = totaisAnoPorTipo(docs, ano);
    return {
      total: docs.length,
      cotacoes: docs.filter((d) => d.tipo === "cotacao").length,
      faturas: docs.filter((d) => d.tipo === "fatura").length,
      clientes: (dados?.clientes || []).filter((c) => c.ativo !== false).length,
      doAno: doAno.length,
      mznFaturas: dinheiro.faturas,
      mznCotacoes: dinheiro.cotacoes
    };
  }, [dados, ano]);

  const apagar = async () => {
    if (!aApagar) return;
    try {
      await enviar(`/api/faturacao/documentos/${aApagar.id}`, null, undefined, "DELETE");
      toast.success(`Documento ${aApagar.numero} apagado.`);
      setAApagar(null);
      carregar();
    } catch {
      /* o toast já saiu */
    }
  };

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Faturação"
        subtitulo="Cotações e Faturas da administração. A numeração é por tipo e reinicia a cada ano (001/2026)."
      >
        <Button asChild>
          <Link href="/faturacao/editor">
            <FileText className="size-4" aria-hidden /> Novo Documento
          </Link>
        </Button>
      </Cabeca>

      {/* Estatísticas */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icone={<FileText className="size-4" aria-hidden />} valor={stats.total} rotulo="Documentos" />
        <Stat icone={<FileText className="size-4" aria-hidden />} valor={stats.cotacoes} rotulo="Cotações" />
        <Stat icone={<Receipt className="size-4" aria-hidden />} valor={stats.faturas} rotulo="Faturas" />
        <Stat icone={<Users className="size-4" aria-hidden />} valor={stats.clientes} rotulo="Clientes activos" />
        <Stat
          icone={<Receipt className="size-4" aria-hidden />}
          valor={fmtNum(stats.mznFaturas)}
          rotulo={`Faturado ${ano} (MZN equiv.)`}
          nota={`Cotações ${ano}: ${fmtNum(stats.mznCotacoes)} MZN`}
          pequeno
        />
      </section>

      {/* Filtros */}
      <Card className="card-sombra py-4">
        <CardContent className="flex flex-wrap items-center gap-3 px-4">
          <select
            value={fTipo}
            onChange={(e) => setFTipo(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Filtrar por tipo"
          >
            <option value="">Todos os tipos</option>
            <option value="cotacao">Cotações</option>
            <option value="fatura">Faturas</option>
          </select>
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar por número, cliente, assunto..."
              className="pl-8"
            />
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card className="card-sombra py-4">
        <CardContent className="px-2 sm:px-4">
          {aCarregar ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar documentos...
            </div>
          ) : falha ? (
            <div className="py-12 text-center text-sm text-destructive">
              {falha}
              <div className="mt-3">
                <Button variant="outline" size="sm" onClick={carregar}>Tentar de novo</Button>
              </div>
            </div>
          ) : lista.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum documento encontrado.
              <div className="mt-3">
                <Button asChild size="sm">
                  <Link href="/faturacao/editor">Criar primeiro documento</Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Nº</th>
                    <th className="px-3 py-2">Tipo</th>
                    <th className="px-3 py-2">Cliente / Assunto</th>
                    <th className="px-3 py-2">Serviço</th>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2">Elaborado por</th>
                    <th className="px-3 py-2 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((d) => (
                    <tr key={d.id} className="border-b border-border/60 transition-colors hover:bg-muted/40">
                      <td className="px-3 py-2.5 font-mono font-bold text-ambar-texto dark:text-amber-400">
                        {d.numero}
                      </td>
                      <td className="px-3 py-2.5">
                        <Etiqueta
                          cor={
                            d.tipo === "fatura"
                              ? "bg-blue-500/12 text-blue-600 dark:text-blue-300"
                              : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          }
                        >
                          {d.tipo === "fatura" ? "Fatura" : "Cotação"}
                        </Etiqueta>
                      </td>
                      <td className="max-w-[240px] px-3 py-2.5">
                        <div className="truncate font-semibold">{d.cliente_nome || "-"}</div>
                        {textoSemTags(d.assunto || "") && (
                          <div className="truncate text-xs text-muted-foreground">
                            {textoSemTags(d.assunto || "").slice(0, 60)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Etiqueta cor={COR_SERVICO[d.servico] || "bg-muted text-muted-foreground"}>
                          {SERVICO_LABEL[d.servico] || d.servico}
                        </Etiqueta>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{fmtData(d.data)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="font-mono font-semibold">{fmtNum(d.total)} {d.moeda}</div>
                        <div className="text-[0.68rem] text-muted-foreground">
                          {d.moeda === "USD"
                            ? `≈ ${fmtNum(d.total_mzn)} MZN`
                            : `≈ USD ${fmtNum((Number(d.total) || 0) / (Number(d.taxa_cambio) || 64))}`}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-[0.8rem]">{d.utilizador_nome || "-"}</div>
                        {d.utilizador_cargo && (
                          <div className="text-[0.68rem] text-muted-foreground">{d.utilizador_cargo}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {d.tipo === "cotacao" && (
                            <Button
                              variant="outline"
                              size="icon"
                              title="Gerar Fatura a partir desta cotação"
                              onClick={() => setAConverter(d)}
                            >
                              <ArrowRightLeft className="size-4" aria-hidden />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="icon"
                            title="Editar"
                            onClick={() => router.push(`/faturacao/editor?id=${d.id}`)}
                          >
                            <Pencil className="size-4" aria-hidden />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            title="Imprimir documento"
                            onClick={() => window.open(`/imprimir/faturacao/${d.id}`, "_blank")}
                          >
                            <Printer className="size-4" aria-hidden />
                          </Button>
                          {podeApagar && (
                            <Button
                              variant="outline"
                              size="icon"
                              title="Apagar"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => setAApagar(d)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmar apagar */}
      <Modal
        aberto={!!aApagar}
        fechar={() => setAApagar(null)}
        titulo={`Apagar ${aApagar?.numero || ""}`}
      >
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Tem a certeza que quer apagar o documento{" "}
            <strong>{aApagar?.numero}</strong> ({aApagar?.cliente_nome})? Esta acção
            não pode ser desfeita e as linhas do documento saem juntas.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAApagar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={apagar}>Apagar</Button>
          </div>
        </div>
      </Modal>

      {/* Confirmar gerar fatura */}
      <Modal
        aberto={!!aConverter}
        fechar={() => setAConverter(null)}
        titulo="Gerar Fatura a partir da cotação"
      >
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            O editor abre com todos os dados da cotação{" "}
            <strong>{aConverter?.numero}</strong> copiados: cliente, descrição,
            linhas, moeda, IVA e desconto. O número passa a fatura com a SUA
            numeração própria e a data de hoje. Só fica gravado quando
            carregares em Guardar.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAConverter(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                router.push(`/faturacao/editor?de=${aConverter?.id || ""}`);
                setAConverter(null);
              }}
            >
              Abrir como nova fatura
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Stat({
  icone,
  valor,
  rotulo,
  nota,
  pequeno
}: {
  icone: React.ReactNode;
  valor: number | string;
  rotulo: string;
  nota?: string;
  pequeno?: boolean;
}) {
  return (
    <Card className="card-sombra py-3">
      <CardContent className="flex items-center gap-3 px-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icone}
        </span>
        <div className="min-w-0">
          <div className={`truncate font-bold ${pequeno ? "text-lg" : "text-xl"}`}>{valor}</div>
          <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground">{rotulo}</div>
          {nota && <div className="truncate text-[0.68rem] italic text-muted-foreground">{nota}</div>}
        </div>
      </CardContent>
    </Card>
  );
}
