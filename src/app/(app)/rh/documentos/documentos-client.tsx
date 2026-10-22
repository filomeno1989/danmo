"use client";

/**
 * DocumentosClient - O arquivo central com pesquisa e filtros.
 *
 * Tudo do lado do cliente: as linhas chegam do servidor com o nome de
 * quem possui o anexo; aqui ficam os filtros (pesquisa sem acentos por
 * titulo ou nome, tipo, situacao da validade), as contagens e os
 * botoes ABRIR (tab nova, imprime de la) e DESCARREGAR. Anexar e
 * apagar continuam na ficha do Quadro de Pessoal, com mexer.
 */

import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileImage, FileText, LoaderCircle, Search, X } from "lucide-react";
import { Cabeca, Etiqueta, pedir } from "@/components/oficina/ui-bits";
import {
  EMPRESA_LABEL,
  TIPOS_DOCUMENTOS,
  filtrarDocumentos,
  formatoBytes,
  formatoData,
  ordenarDocumentos,
  situacaoPorValidade,
  textoAlertaDoc,
  type FiltroDocs,
  type LinhaDoc,
  type ValidadeCor
} from "@/lib/rh";

type Props = {
  hoje: string;
};

const COR_SITUACAO: Record<ValidadeCor, string> = {
  vencido: "bg-red-600/12 text-red-700 dark:text-red-300",
  urgente: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  proximo: "bg-amber-500/10 text-amber-700 dark:text-amber-200/90",
  ok: "bg-sucesso-bg text-sucesso"
};

const SITUACOES: { valor: FiltroDocs["situacao"]; label: string }[] = [
  { valor: "", label: "Todas as situações" },
  { valor: "vencido", label: "Vencidos" },
  { valor: "urgente", label: "Urgentes (15 dias)" },
  { valor: "proximo", label: "Próximos (60 dias)" },
  { valor: "ok", label: "Com validade tranquila" }
];

export function DocumentosClient({ hoje }: Props) {
  const [linhas, setLinhas] = useState<LinhaDoc[] | null>(null);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [situacao, setSituacao] = useState<FiltroDocs["situacao"]>("");

  useEffect(() => {
    let morto = false;
    pedir<{ ok: boolean; documentos: LinhaDoc[] }>("/api/rh/quadro/documentos?modo=tudo")
      .then((d) => {
        if (!morto) setLinhas(d.documentos || []);
      })
      .catch(() => {
        if (!morto) setLinhas([]);
      });
    return () => {
      morto = true;
    };
  }, []);

  const lista = linhas || [];
  const ordenadas = useMemo(() => ordenarDocumentos(lista, hoje), [lista, hoje]);
  const filtradas = useMemo(
    () => filtrarDocumentos(ordenadas, { busca, tipo, situacao }, hoje),
    [ordenadas, busca, tipo, situacao, hoje]
  );

  const contagem = useMemo(() => {
    let vencido = 0;
    let urgente = 0;
    let proximo = 0;
    for (const d of lista) {
      const sit = situacaoPorValidade(d.validade, hoje);
      if (sit === "vencido") vencido += 1;
      else if (sit === "urgente") urgente += 1;
      else if (sit === "proximo") proximo += 1;
    }
    return { total: lista.length, vencido, urgente, proximo };
  }, [lista, hoje]);

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Documentos"
        subtitulo="O arquivo central dos scans anexados nas fichas"
      />

      {/* Contagens */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-contagens>
        <div className="card-sombra rounded-xl p-3.5">
          <p className="text-2xl font-bold tabular-nums" data-total>{contagem.total}</p>
          <p className="text-xs text-muted-foreground">Anexos no arquivo</p>
        </div>
        <div className="card-sombra rounded-xl p-3.5">
          <p className="text-2xl font-bold tabular-nums text-red-600 dark:text-red-300" data-vencidos>{contagem.vencido}</p>
          <p className="text-xs text-muted-foreground">Vencidos</p>
        </div>
        <div className="card-sombra rounded-xl p-3.5">
          <p className="text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-300" data-urgentes>{contagem.urgente}</p>
          <p className="text-xs text-muted-foreground">Urgentes (15 dias)</p>
        </div>
        <div className="card-sombra rounded-xl p-3.5">
          <p className="text-2xl font-bold tabular-nums text-amber-500" data-proximos>{contagem.proximo}</p>
          <p className="text-xs text-muted-foreground">Próximos (60 dias)</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="card-sombra grid gap-2 rounded-xl p-3.5 sm:grid-cols-[minmax(0,1fr),170px,190px]" data-filtros>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar por título ou colaborador..."
            aria-label="Pesquisar documentos"
            className="h-9 w-full rounded-md border bg-background pl-8 pr-8 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {busca && (
            <button
              type="button"
              onClick={() => setBusca("")}
              aria-label="Limpar pesquisa"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          aria-label="Filtrar por tipo de documento"
          className="h-9 rounded-md border bg-background px-2.5 text-sm"
        >
          <option value="">Todos os tipos</option>
          {TIPOS_DOCUMENTOS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={situacao}
          onChange={(e) => setSituacao(e.target.value as FiltroDocs["situacao"])}
          aria-label="Filtrar por situação da validade"
          className="h-9 rounded-md border bg-background px-2.5 text-sm"
        >
          {SITUACOES.map((s) => (
            <option key={s.valor} value={s.valor}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
      {linhas === null ? (
        <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" data-a-carregar>
          <LoaderCircle className="size-4 animate-spin" /> A carregar o arquivo...
        </p>
      ) : filtradas.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-lista-vazia>
          {linhas.length === 0
            ? "O arquivo está vazio: os scans anexam-se na ficha de cada colaborador, no Quadro de Pessoal."
            : "Nenhum documento com estes filtros."}
        </p>
      ) : (
        <ul className="card-sombra divide-y rounded-xl" data-lista-documentos>
          {filtradas.map((d) => {
            const imagem = d.arquivo_tipo.startsWith("image/");
            const sit = situacaoPorValidade(d.validade, hoje);
            const dias =
              d.validade && sit
                ? Math.round(
                    (new Date(`${d.validade.slice(0, 10)}T00:00:00Z`).getTime() -
                      new Date(`${hoje.slice(0, 10)}T00:00:00Z`).getTime()) /
                      86400000
                  )
                : null;
            return (
              <li key={d.id} data-doc-row className="flex flex-wrap items-center gap-2.5 px-3.5 py-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {imagem ? <FileImage className="size-4.5" aria-hidden /> : <FileText className="size-4.5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold leading-tight">{d.titulo}</p>
                  <p className="truncate text-[0.7rem] text-muted-foreground">
                    {d.nome}
                    {d.empresa ? ` · ${EMPRESA_LABEL[d.empresa]}` : ""} · {formatoBytes(d.arquivo_bytes)} · anexado {formatoData(d.criado_em.slice(0, 10)) || "-"}
                  </p>
                </div>
                <Etiqueta cor="bg-neutral-900/8 text-neutral-700 dark:bg-white/10 dark:text-neutral-200">
                  {d.tipo}
                </Etiqueta>
                {d.emissao && (
                  <span className="whitespace-nowrap text-[0.7rem] tabular-nums text-muted-foreground">
                    Emissão {formatoData(d.emissao)}
                  </span>
                )}
                {d.validade && sit && (
                  <Etiqueta cor={COR_SITUACAO[sit]}>
                    {sit === "ok" ? "Vence " : ""}
                    {formatoData(d.validade)}
                  </Etiqueta>
                )}
                {d.validade && sit && sit !== "ok" && dias !== null && (
                  <Etiqueta cor={COR_SITUACAO[sit]}>{textoAlertaDoc({ dias, situacao: sit })}</Etiqueta>
                )}
                <span className="flex gap-1">
                  <a
                    href={`/api/rh/quadro/documentos/${d.id}/arquivo`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir ${d.titulo}`}
                    title="Abrir para ver ou imprimir"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                  <a
                    href={`/api/rh/quadro/documentos/${d.id}/arquivo?descarregar=1`}
                    aria-label={`Descarregar ${d.titulo}`}
                    title="Descarregar"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Download className="size-4" aria-hidden />
                  </a>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
