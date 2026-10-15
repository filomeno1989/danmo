"use client";

/**
 * Configurações da Disponibilidade:
 * - meta de disponibilidade (80% por defeito, fixa nos ecrãs mas
 *   ajustável aqui - decisão do Filomeno);
 * - explicação das regras de cálculo (24h por dia, transições, horómetro)
 *   para quem chega agora ao módulo.
 */

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
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
        subtitulo="Meta, estados físicos e regras de cálculo do módulo"
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
            <p className="text-xs text-muted-foreground">
              Fixa em 80% por decisão do Filomeno, mas ajustável aqui. Verde nos ecrãs = meta atingida,
              laranja/vermelho = abaixo da meta.
            </p>
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
            <p className="text-xs text-muted-foreground">
              São os mesmos estados de <b>ordens_servico.status_fisico</b> - previstos desde o início da
              Oficina e finalmente em uso real com este módulo. Os códigos dos excels antigos (A, PM, TY, AC,
              BD, SP) foram mapeados para estes nomes na importação.
            </p>
          </div>

          <div className="card-sombra max-w-2xl space-y-2 p-4 text-sm">
            <h2 className="text-sm font-semibold">Regras de cálculo</h2>
            <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
              <li>
                Cada dia marcado vale <b>24 horas</b>: Disponível soma 24h ao disponível; qualquer outro
                estado soma as horas ao estado (as horas disponíveis parciais, 0-24, podem ser ajustadas à
                mão no dia - ex.: máquina saiu da oficina às 14:00 = 14h).
              </li>
              <li>
                A mudança de estado a meio cria <b>dois segmentos</b> com data/hora (entrou Avariada às
                10:22, às 15:00 passou a Aguarda Acessório: cada tramo conta as suas horas, mesmo sem a
                máquina ser mexida).
              </li>
              <li>
                O mensal soma os dias marcados de cada máquina; a percentagem usa o total de horas do mês
                (dias do mês × 24), igual ao excel deles.
              </li>
              <li>
                O horómetro guarda a leitura inicial e final de cada mês; as horas trabalhadas = final -
                inicial. A inicial do mês seguinte vem preenchida com a final do anterior.
              </li>
              <li>
                Histórico 2022-2025 importado dos excels (horas por dia + resumo mensal por estado +
                horómetro). 2026 em diante passa a ser marcado aqui dentro, sem papel.
              </li>
            </ul>
            <p className="pt-1">
              <Etiqueta cor="bg-info-bg text-info">Nota</Etiqueta>{" "}
              <span className="text-xs text-muted-foreground">
                os 102 códigos do histórico que não estavam na base foram criados como máquinas inactivas
                (decisão do Filomeno) para o histórico ficar completo.
              </span>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
