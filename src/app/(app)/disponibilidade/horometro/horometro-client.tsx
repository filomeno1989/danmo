"use client";

/**
 * Horómetro - lançamento das horas das máquinas no fim de cada mês,
 * máquina por máquina (requisito 4 do Filomeno).
 *
 * A leitura inicial vem preenchida com o FINAL do mês anterior (a regra
 * do excel deles); o colaborador só lança a leitura final e o sistema
 * calcula as horas trabalhadas. Leituras importadas dos excels 2022-2026
 * aparecem a cinzento e podem ser corrigidas por quem tem permissão.
 * Serve também para o cenário futuro: os colaboradores lançarem a leitura
 * directamente no sistema na recolha, sem sair com papel.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Search } from "lucide-react";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { MESES_PT } from "@/lib/disponibilidade";

type EquipDisp = { id: number; code: string; nome: string | null; frota: string; active: boolean };
type Leitura = {
  id: number;
  equipment_id: number;
  leitura_inicial: number | string | null;
  leitura_final: number | string | null;
  horas_trabalhadas: number | string | null;
  lancado_por: string | null;
  lancado_em: string;
  observacao: string | null;
};
type HorometroDados = {
  ok: boolean;
  equipamentos: EquipDisp[];
  leituras: Leitura[];
  finalAnterior: Record<string, number>;
};

type LinhaEstado = {
  inicial: string;
  final: string;
  observacao: string;
  gravada: boolean;
  importada: boolean;
  lancado_por?: string | null;
};

export function HorometroClient({ podeEditar, nomeUtilizador }: { podeEditar: boolean; nomeUtilizador: string }) {
  const agora = new Date();
  const [ano, setAno] = useState(agora.getFullYear());
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [busca, setBusca] = useState("");
  const [dados, setDados] = useState<HorometroDados | null>(null);
  const [carregar, setCarregar] = useState(true);
  const [falha, setFalha] = useState("");
  const [linhas, setLinhas] = useState<Map<number, LinhaEstado>>(new Map());
  const [aGravar, setAGravar] = useState<Set<number>>(new Set());

  const carregarDados = useCallback(() => {
    setCarregar(true);
    setFalha("");
    pedir<HorometroDados>(`/api/disponibilidade/horometro?ano=${ano}&mes=${mes}`)
      .then((d) => {
        setDados(d);
        const m = new Map<number, LinhaEstado>();
        for (const eq of d.equipamentos) {
          const l = d.leituras.find((x) => x.equipment_id === eq.id);
          const importada = Boolean(l && l.lancado_por === "importacao");
          m.set(eq.id, {
            inicial: l && l.leitura_inicial !== null ? String(l.leitura_inicial) : String(d.finalAnterior[eq.id] ?? ""),
            final: l && l.leitura_final !== null ? String(l.leitura_final) : "",
            observacao: l?.observacao || "",
            gravada: Boolean(l),
            importada,
            lancado_por: l?.lancado_por || null
          });
        }
        setLinhas(m);
      })
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setCarregar(false));
  }, [ano, mes]);

  useEffect(() => {
    // Carregamento em cadeia de promessas (sem setState sincrono no efeito)
    let vivo = true;
    pedir<HorometroDados>(`/api/disponibilidade/horometro?ano=${ano}&mes=${mes}`)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        const m = new Map<number, LinhaEstado>();
        for (const eq of d.equipamentos) {
          const l = d.leituras.find((x) => x.equipment_id === eq.id);
          const importada = Boolean(l && l.lancado_por === "importacao");
          m.set(eq.id, {
            inicial: l && l.leitura_inicial !== null ? String(l.leitura_inicial) : String(d.finalAnterior[eq.id] ?? ""),
            final: l && l.leitura_final !== null ? String(l.leitura_final) : "",
            observacao: l?.observacao || "",
            gravada: Boolean(l),
            importada,
            lancado_por: l?.lancado_por || null
          });
        }
        setLinhas(m);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      })
      .finally(() => {
        if (vivo) setCarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [ano, mes]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return dados?.equipamentos || [];
    return (dados?.equipamentos || []).filter(
      (e) =>
        e.code.toLowerCase().includes(q) ||
        (e.nome || "").toLowerCase().includes(q) ||
        e.frota.toLowerCase().includes(q)
    );
  }, [dados, busca]);

  const contar = useMemo(() => {
    let gravadas = 0;
    let comFinal = 0;
    for (const l of linhas.values()) {
      if (l.gravada) gravadas += 1;
      if (l.final !== "") comFinal += 1;
    }
    return { gravadas, comFinal, total: linhas.size };
  }, [linhas]);

  function atualizar(eqId: number, campo: keyof LinhaEstado, valor: string) {
    setLinhas((antigo) => {
      const m = new Map(antigo);
      const l = m.get(eqId);
      if (l) m.set(eqId, { ...l, [campo]: valor, importada: false });
      return m;
    });
  }

  async function gravar(eqId: number, code: string) {
    const l = linhas.get(eqId);
    if (!l) return;
    if (l.final === "") {
      toast.error(`${code}: lança a leitura final antes de gravar.`);
      return;
    }
    setAGravar((a) => new Set(a).add(eqId));
    try {
      await enviar(
        "/api/disponibilidade/horometro",
        {
          equipment_id: eqId,
          ano,
          mes,
          leitura_inicial: l.inicial === "" ? null : Number(l.inicial),
          leitura_final: Number(l.final),
          observacao: l.observacao || null
        },
        `${code}: leitura gravada.`
      );
      setLinhas((antigo) => {
        const m = new Map(antigo);
        const linha = m.get(eqId);
        if (linha) m.set(eqId, { ...linha, gravada: true, lancado_por: nomeUtilizador });
        return m;
      });
    } catch {
      /* o enviar já avisa */
    } finally {
      setAGravar((a) => {
        const n = new Set(a);
        n.delete(eqId);
        return n;
      });
    }
  }

  const anos = Array.from({ length: 5 }, (_, i) => agora.getFullYear() - 4 + i);

  return (
    <div className="space-y-4">
      <Cabeca
        titulo="Horómetro"
        subtitulo="Leituras mensais do contador de horas - substitui a folia HOURMETER CONTROL (DAN_ADO_FR_021)"
      >
        <select
          aria-label="Mês"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
        >
          {MESES_PT.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
        <select
          aria-label="Ano"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
        >
          {anos.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </Cabeca>

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}

      {carregar && !dados && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar as leituras...
        </div>
      )}

      {dados && (
        <>
          <div className="card-sombra flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold">
                {MESES_PT[mes - 1]} de {ano}
              </span>
              <Etiqueta cor={contar.comFinal >= contar.total ? "bg-sucesso-bg text-sucesso" : "bg-ambar-claro text-ambar-texto"}>
                {contar.comFinal} de {contar.total} máquinas lançadas
              </Etiqueta>
              {contar.gravadas > 0 && (
                <span className="text-xs text-muted-foreground">
                  {contar.gravadas} já têm leitura gravada (importada ou lançada)
                </span>
              )}
            </div>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar código, nome, frota..."
                className="h-9 w-56 rounded-md border border-input bg-background pl-8 pr-2 text-sm"
              />
            </div>
          </div>

          <div className="card-sombra overflow-hidden p-0">
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="sticky top-0 bg-background px-3 py-2 font-medium">Máquina</th>
                    <th className="sticky top-0 bg-background px-2 py-2 text-right font-medium">Inicial</th>
                    <th className="sticky top-0 bg-background px-2 py-2 text-right font-medium">Final</th>
                    <th className="sticky top-0 bg-background px-2 py-2 text-right font-medium">Trabalhadas</th>
                    <th className="sticky top-0 bg-background px-2 py-2 font-medium">Observação</th>
                    <th className="sticky top-0 bg-background px-3 py-2 text-right font-medium">Gravar</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((eq) => {
                    const l = linhas.get(eq.id);
                    if (!l) return null;
                    const wh = l.inicial !== "" && l.final !== "" ? Number(l.final) - Number(l.inicial) : null;
                    const negativo = wh !== null && wh < 0;
                    return (
                      <tr key={eq.id} className="border-b last:border-0">
                        <td className="px-3 py-1.5">
                          <span className="font-semibold">{eq.code}</span>{" "}
                          <span className="text-muted-foreground">{eq.nome}</span>
                          {!eq.active && <span className="ml-1 text-xs text-muted-foreground">(inactiva)</span>}
                          <span className="block text-xs text-muted-foreground">
                            {eq.frota}
                            {l.gravada && l.lancado_por && ` · por ${l.lancado_por}`}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            step={0.1}
                            disabled={!podeEditar}
                            className={cn(
                              "h-8 w-24 rounded-md border border-input bg-background px-1.5 text-right text-sm tabular-nums disabled:bg-muted/50",
                              l.inicial === "" && "text-muted-foreground"
                            )}
                            value={l.inicial}
                            onChange={(e) => atualizar(eq.id, "inicial", e.target.value)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          <input
                            type="number"
                            step={0.1}
                            disabled={!podeEditar}
                            className="h-8 w-24 rounded-md border border-input bg-background px-1.5 text-right text-sm tabular-nums disabled:bg-muted/50"
                            value={l.final}
                            onChange={(e) => atualizar(eq.id, "final", e.target.value)}
                          />
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right font-semibold tabular-nums",
                            negativo ? "text-erro" : wh === null ? "text-muted-foreground" : ""
                          )}
                        >
                          {wh === null ? "-" : `${wh.toLocaleString("pt-PT")} h`}
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            type="text"
                            disabled={!podeEditar}
                            className="h-8 w-full min-w-32 rounded-md border border-input bg-background px-1.5 text-sm disabled:bg-muted/50"
                            value={l.observacao}
                            placeholder="ex.: contador trocado na revisão"
                            onChange={(e) => atualizar(eq.id, "observacao", e.target.value)}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          {podeEditar ? (
                            <button
                              onClick={() => gravar(eq.id, eq.code)}
                              disabled={aGravar.has(eq.id)}
                              className={cn(
                                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-white",
                                l.gravada && !aGravar.has(eq.id) ? "bg-primario/80 hover:bg-primario" : "bg-primario hover:bg-primario-forte",
                                aGravar.has(eq.id) && "opacity-60"
                              )}
                            >
                              {aGravar.has(eq.id) ? <Rodar className="size-3.5" /> : <Save className="size-3.5" />}
                              {l.gravada ? "Actualizar" : "Gravar"}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">só leitura</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            A leitura inicial vem do FINAL do mês anterior. Se o contador foi trocado ou reiniciou, lança o valor
            novo na inicial e explica na observação - o sistema guarda as horas trabalhadas desse mês como
            estiverem lançadas. As leituras importadas dos excels ficam com "por importacao" até serem
            actualizadas.
          </p>
        </>
      )}
    </div>
  );
}
