"use client";

/**
 * Configurações da Disponibilidade:
 * - meta de disponibilidade (80% por defeito, ajustável aqui);
 * - legenda dos estados físicos de um dia.
 */

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Cabeca, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { COR_ESTADO_DIA, ESTADOS_DIA } from "@/lib/disponibilidade";

type ConfigDados = { ok: boolean; meta: number; atualizado_em: string | null; atualizado_por: string | null };

export function ConfigClient({ podeEditar }: { podeEditar: boolean }) {
  const [dados, setDados] = useState<ConfigDados | null>(null);
  const [meta, setMeta] = useState("80");
  const [carregar, setCarregar] = useState(true);
  const [falha, setFalha] = useState("");
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    pedir<ConfigDados>("/api/disponibilidade/config")
      .then((d) => {
        setDados(d);
        setMeta(String(d.meta));
      })
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setCarregar(false));
  }, []);

  async function gravar() {
    setAGravar(true);
    try {
      const r = await enviar<{ meta: number }>(
        "/api/disponibilidade/config",
        { meta_disponibilidade: Number(meta) },
        "Meta gravada."
      );
      setDados((d) => (d ? { ...d, meta: r.meta } : d));
    } catch {
      /* o enviar já avisa */
    } finally {
      setAGravar(false);
    }
  }

  return (
    <div className="space-y-4">
      <Cabeca
        titulo="Configurações da Disponibilidade"
        subtitulo="Meta de disponibilidade e estados físicos do módulo"
      />

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}

      {carregar && !dados && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar...
        </div>
      )}

      {dados && (
        <>
          <div className="card-sombra max-w-xl space-y-3 p-4">
            <h2 className="text-sm font-semibold">Meta de disponibilidade</h2>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={1}
                max={100}
                step={0.5}
                disabled={!podeEditar}
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
                className="h-10 w-24 rounded-md border border-input bg-background px-2 text-sm tabular-nums disabled:bg-muted/50"
              />
              <span className="text-sm text-muted-foreground">% de horas disponíveis no período</span>
            </div>
            <div className="flex items-center gap-2">
              {podeEditar && (
                <button
                  onClick={gravar}
                  disabled={aGravar}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
                >
                  {aGravar ? <Rodar /> : <Save className="size-4" />} Gravar meta
                </button>
              )}
              {dados.atualizado_por && (
                <span className="text-xs text-muted-foreground">
                  actual meta: {dados.meta}% (por {dados.atualizado_por})
                </span>
              )}
            </div>
          </div>

          <div className="card-sombra max-w-2xl space-y-3 p-4">
            <h2 className="text-sm font-semibold">Estados físicos de um dia</h2>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ESTADOS_DIA.map((estado) => (
                <li key={estado} className="flex items-center gap-2 text-sm">
                  <span className={`inline-block size-3.5 shrink-0 rounded-sm ${COR_ESTADO_DIA[estado] || "bg-muted"}`} />
                  {estado}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
