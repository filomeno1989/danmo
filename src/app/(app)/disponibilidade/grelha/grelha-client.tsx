"use client";

/**
 * Grelha Diária - máquina por dia, estado físico e horas.
 *
 * Cada célula é um dia de uma máquina: verde (Disponível) ou da cor do
 * estado (Avariada, Acidentada, Pneumático, Revisão, Inspeção, Aguarda
 * Acessório). Clicar numa célula abre o painel do dia: estado, horas
 * disponíveis (0-24), hora de entrada/saída, observação e opção de
 * repetir o estado até ao fim do mês (uma avaria de 5 dias marca-se uma
 * vez). As marcações ficam à espera e gravam-se todas num clique.
 *
 * Do lado direito: horas do mês por estado, resumo por semana, máquinas
 * paradas neste momento (transições em curso) e a legenda.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eraser, Save, Wrench } from "lucide-react";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  COR_ESTADO_DIA,
  COR_SOLIDA_ESTADO,
  ESTADOS_DIA,
  FROTAS_PADRAO,
  MESES_PT,
  diasNoMes,
  hojeMaputo
} from "@/lib/disponibilidade";

type EquipLinha = { id: number; code: string; name: string | null; group_name: string | null; active: boolean };
type DiaLinha = {
  id: number;
  equipment_id: number;
  data: string;
  estado: string | null;
  horas_disponiveis: number | string | null;
  hora_entrada: string | null;
  hora_saida: string | null;
  observacao: string | null;
  origem?: string;
  os_id?: number | null;
  numero_obra?: string | null;
};
type TransicaoAberta = {
  id: number;
  equipment_id: number;
  estado: string;
  inicio: string;
  code: string;
  nome: string;
  obra?: string | null;
  os_id?: number | null;
};
type GrelhaDados = {
  ok: boolean;
  equipamentos: EquipLinha[];
  dias: DiaLinha[];
  transicoesAbertas: TransicaoAberta[];
  resumoSemanal: { semana: number; pct: number; maquinas: number; dias: number }[];
  resumoMes: { horasDisponiveis: number; diasMarcados: number };
};

type EditarDia = {
  equipment_id: number;
  code: string;
  data: string;
  estado: string | null;
  horas_disponiveis: number | null;
  hora_entrada: string;
  hora_saida: string;
  observacao: string;
  repetirAte: string; // "" = só o dia
  os_id?: number | null;
  numero_obra?: string | null;
};

const chaveDe = (equipmentId: number, data: string) => `${equipmentId}|${data}`;

export function GrelhaClient({ podeEditar, podeApagar }: { podeEditar: boolean; podeApagar: boolean }) {
  const agora = new Date();
  const [mes, setMes] = useState(
    `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`
  );
  const [frota, setFrota] = useState("todos");
  const [dados, setDados] = useState<GrelhaDados | null>(null);
  const [carregar, setCarregar] = useState(true);
  const [falha, setFalha] = useState("");
  const [edits, setEdits] = useState<Map<string, EditarDia>>(new Map());
  const [gravarA, setGravarA] = useState(false);
  const [diaAberto, setDiaAberto] = useState<EditarDia | null>(null);

  const ano = Number(mes.slice(0, 4));
  const nMes = Number(mes.slice(5, 7));
  const nDias = diasNoMes(ano, nMes);
  const diasDoMes = useMemo(
    () => Array.from({ length: nDias }, (_, i) => `${mes}-${String(i + 1).padStart(2, "0")}`),
    [mes, nDias]
  );

  const carregarDados = useCallback(() => {
    setCarregar(true);
    setFalha("");
    pedir<GrelhaDados>(`/api/disponibilidade/dias?mes=${mes}&frota=${encodeURIComponent(frota)}`)
      .then((d) => setDados(d))
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setCarregar(false));
  }, [mes, frota]);

  useEffect(() => {
    // Carregamento em cadeia de promessas (sem setState sincrono no efeito)
    let vivo = true;
    pedir<GrelhaDados>(`/api/disponibilidade/dias?mes=${mes}&frota=${encodeURIComponent(frota)}`)
      .then((d) => {
        if (vivo) setDados(d);
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
  }, [mes, frota, carregarDados]);

  // índice rápido: chave -> marcação existente (ou edição pendente)
  const mapa = useMemo(() => {
    const m = new Map<string, DiaLinha>();
    for (const d of dados?.dias || []) m.set(chaveDe(d.equipment_id, d.data.slice(0, 10)), d);
    return m;
  }, [dados]);

  const valorDe = (equipmentId: number, data: string): EditarDia | null => {
    const edit = edits.get(chaveDe(equipmentId, data));
    if (edit) return edit;
    const orig = mapa.get(chaveDe(equipmentId, data));
    if (!orig) return null;
    return {
      equipment_id: equipmentId,
      code: "",
      data,
      estado: orig.estado,
      horas_disponiveis: orig.horas_disponiveis === null ? null : Number(orig.horas_disponiveis),
      hora_entrada: orig.hora_entrada || "",
      hora_saida: orig.hora_saida || "",
      observacao: orig.observacao || "",
      repetirAte: "",
      os_id: orig.os_id ?? null,
      numero_obra: orig.numero_obra ?? null
    };
  };

  const horasEstadoMes = useMemo(() => {
    const totais: Record<string, number> = {};
    for (const estado of ESTADOS_DIA) totais[estado] = 0;
    let contados = 0;
    for (const eq of dados?.equipamentos || []) {
      for (const data of diasDoMes) {
        const v = valorDe(eq.id, data);
        if (!v || (v.estado === null && v.horas_disponiveis === null)) continue;
        contados += 1;
        const horas = v.horas_disponiveis ?? 0;
        totais.Disponível += horas;
        if (v.estado && v.estado !== "Disponível") {
          totais[v.estado] = (totais[v.estado] || 0) + Math.max(0, 24 - horas);
        }
      }
    }
    return { totais, contados };
  }, [dados, edits, diasDoMes]);

  function abrirDia(eq: EquipLinha, data: string) {
    const v = valorDe(eq.id, data);
    setDiaAberto({
      equipment_id: eq.id,
      code: eq.code,
      data,
      estado: v?.estado ?? null,
      horas_disponiveis: v?.horas_disponiveis ?? null,
      hora_entrada: v?.hora_entrada ?? "",
      hora_saida: v?.hora_saida ?? "",
      observacao: v?.observacao ?? "",
      repetirAte: "",
      os_id: v?.os_id ?? null,
      numero_obra: v?.numero_obra ?? null
    });
  }

  function marcarDirecto(eq: EquipLinha, data: string, estado: string) {
    if (!podeEditar) return;
    setEdits((antigo) => {
      const m = new Map(antigo);
      m.set(chaveDe(eq.id, data), {
        equipment_id: eq.id,
        code: eq.code,
        data,
        estado,
        horas_disponiveis: estado === "Disponível" ? 24 : 0,
        hora_entrada: valorDe(eq.id, data)?.hora_entrada ?? "",
        hora_saida: valorDe(eq.id, data)?.hora_saida ?? "",
        observacao: valorDe(eq.id, data)?.observacao ?? "",
        repetirAte: ""
      });
      return m;
    });
  }

  async function gravarTudo() {
    if (!edits.size) return;
    setGravarA(true);
    try {
      const marcacoes = [...edits.values()].map((e) => ({
        equipment_id: e.equipment_id,
        data: e.data,
        estado: e.estado,
        horas_disponiveis: e.horas_disponiveis,
        hora_entrada: e.hora_entrada || null,
        hora_saida: e.hora_saida || null,
        observacao: e.observacao || null
      }));
      await enviar("/api/disponibilidade/dias", { marcacoes }, `Gravadas ${marcacoes.length} marcações.`);
      setEdits(new Map());
      carregarDados();
    } catch {
      /* o enviar já avisa */
    } finally {
      setGravarA(false);
    }
  }

  async function gravarDia(d: EditarDia) {
    const marcacoes: EditarDia[] = [d];
    // "repetirAte" e um numero do dia do mes (ex.: 4 = marca de hoje ate dia 4)
    const ate = Math.min(Number(d.repetirAte) || 0, nDias);
    const diaInicial = Number(d.data.slice(8, 10));
    if (ate > diaInicial) {
      for (let dia = diaInicial + 1; dia <= ate; dia += 1) {
        marcacoes.push({
          ...d,
          data: `${mes}-${String(dia).padStart(2, "0")}`,
          repetirAte: ""
        });
      }
    }
    try {
      await enviar(
        "/api/disponibilidade/dias",
        {
          marcacoes: marcacoes.map((m) => ({
            equipment_id: m.equipment_id,
            data: m.data,
            estado: m.estado,
            horas_disponiveis: m.horas_disponiveis,
            hora_entrada: m.hora_entrada || null,
            hora_saida: m.hora_saida || null,
            observacao: m.observacao || null
          }))
        },
        marcacoes.length > 1
          ? `Estado marcado de ${d.data.slice(8)} a ${marcacoes[marcacoes.length - 1].data.slice(8)}.`
          : "Dia gravado."
      );
      setDiaAberto(null);
      carregarDados();
    } catch {
      /* o enviar já avisa */
    }
  }

  async function limparDia(d: EditarDia) {
    try {
      const r = await fetch(
        `/api/disponibilidade/dias?equipment_id=${d.equipment_id}&data=${d.data}`,
        { method: "DELETE" }
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.ok === false) throw new Error(j?.erro || "Não foi possível limpar o dia.");
      toast.success("Marcação limpa.");
      setDiaAberto(null);
      carregarDados();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const equipamentos = dados?.equipamentos || [];
  const equipamentosOrdenados = [...equipamentos].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return (a.group_name || "").localeCompare(b.group_name || "") || a.code.localeCompare(b.code);
  });

  return (
    <div className="space-y-4">
      <Cabeca
        titulo="Grelha Diária"
        subtitulo="Estado físico de cada máquina em cada dia - substitui a folha de marcação diária (DAN_DTEC_FR_005)"
      >
        <input
          type="month"
          aria-label="Mês"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={mes}
          max={hojeMaputo().slice(0, 7)}
          onChange={(e) => setMes(e.target.value)}
        />
        <select
          aria-label="Frota"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          value={frota}
          onChange={(e) => setFrota(e.target.value)}
        >
          <option value="todos">Todas as frotas</option>
          {FROTAS_PADRAO.map((f) => (
            <option key={f.label} value={f.label}>{f.label}</option>
          ))}
        </select>
        {podeEditar && edits.size > 0 && (
          <button
            onClick={gravarTudo}
            disabled={gravarA}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
          >
            {gravarA ? <Rodar /> : <Save className="size-4" />}
            Gravar {edits.size} marcação{edits.size > 1 ? "ões" : ""}
          </button>
        )}
      </Cabeca>

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}

      {carregar && !dados && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar a grelha...
        </div>
      )}

      {dados && (
        <div className="grid gap-3 xl:grid-cols-4">
          {/* GRELHA */}
          <div className="card-sombra overflow-hidden p-0 xl:col-span-3">
            <div className="flex items-center justify-between gap-2 p-4 pb-2">
              <h2 className="text-sm font-semibold">
                {MESES_PT[nMes - 1]} de {ano}
              </h2>
              <span className="text-xs text-muted-foreground">
                {dados.resumoMes.diasMarcados} dias com marcação · {equipamentos.length} máquinas
              </span>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0 text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-20 min-w-36 border-b bg-background px-2 py-1.5 text-left font-semibold">
                      Máquina
                    </th>
                    {diasDoMes.map((d) => (
                      <th
                        key={d}
                        className={cn(
                          "sticky top-0 z-10 w-7 border-b bg-background px-0 py-1.5 text-center font-semibold tabular-nums",
                          d === hojeMaputo() && "bg-primario/10 text-primario-forte"
                        )}
                      >
                        {Number(d.slice(8))}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {equipamentosOrdenados.map((eq) => (
                    <tr key={eq.id} className="group">
                      <th
                        className={cn(
                          "sticky left-0 z-10 border-b bg-background px-2 py-1 text-left font-medium",
                          !eq.active && "opacity-50"
                        )}
                      >
                        <span className="font-semibold">{eq.code}</span>{" "}
                        <span className="text-muted-foreground">{eq.name}</span>
                        {!eq.active && <span className="block text-[0.6rem] text-muted-foreground">inactiva</span>}
                      </th>
                      {diasDoMes.map((data) => {
                        const v = valorDe(eq.id, data);
                        const estado = v?.estado ?? null;
                        const horas = v?.horas_disponiveis;
                        const parcial =
                          estado !== null && estado !== "Disponível" && horas !== null && horas !== undefined && horas > 0;
                        const alterado = edits.has(chaveDe(eq.id, data));
                        return (
                          <td key={data} className="border-b border-l p-0.5">
                            <button
                              type="button"
                              disabled={!podeEditar}
                              onClick={() => abrirDia(eq, data)}
                              onContextMenu={(e) => {
                                if (!podeEditar) return;
                                e.preventDefault();
                                const i = ESTADOS_DIA.indexOf(estado as never);
                                marcarDirecto(eq, data, ESTADOS_DIA[(i + 1) % ESTADOS_DIA.length]);
                              }}
                              className={cn(
                                "flex h-6 w-full items-center justify-center rounded-sm text-[0.55rem] font-bold transition-colors",
                                estado
                                  ? COR_ESTADO_DIA[estado] || "bg-muted"
                                  : "bg-muted/40 text-muted-foreground hover:bg-muted",
                                data === hojeMaputo() && !estado && "ring-1 ring-primario/40",
                                alterado && "outline outline-2 outline-offset-1 outline-primario"
                              )}
                              title={
                                estado
                                  ? `${eq.code} · ${data}: ${estado}${v?.numero_obra ? ` · Obra ${v.numero_obra}` : ""}${parcial ? ` (${horas}h disp.)` : ""}${v?.observacao ? ` · ${v.observacao}` : ""}`
                                  : `${eq.code} · ${data}: sem marcação`
                              }
                            >
                              {parcial ? horas : ""}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {podeEditar && (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                Clique no dia para abrir (estado, horas, hora de entrada/saída, observação e "repetir até").
                Clique com o botão direito avança directamente para o estado seguinte.
              </p>
            )}
          </div>

          {/* LATERAL */}
          <div className="space-y-3">
            <div className="card-sombra p-4">
              <h2 className="text-sm font-semibold">Horas do mês por estado</h2>
              <ul className="mt-2 space-y-1.5">
                {ESTADOS_DIA.map((estado) => {
                  const h = horasEstadoMes.totais[estado] || 0;
                  return (
                    <li key={estado} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={cn("inline-block size-2.5 shrink-0 rounded-full", COR_SOLIDA_ESTADO[estado] || "bg-muted")} />
                        <span className="truncate">{estado}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {Math.round(h).toLocaleString("pt-PT")} h
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                {horasEstadoMes.contados.toLocaleString("pt-PT")} dias-máquina marcados ·{" "}
                {Math.round(dados.resumoMes.horasDisponiveis).toLocaleString("pt-PT")} h disponíveis
              </p>
            </div>

            <div className="card-sombra p-4">
              <h2 className="text-sm font-semibold">Por semana (ISO)</h2>
              {dados.resumoSemanal.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Sem marcações neste mês.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {dados.resumoSemanal.map((s) => (
                    <li key={s.semana} className="flex items-center justify-between gap-2 text-xs">
                      <span>Semana {s.semana}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {s.dias}d × {s.maquinas}máq
                        </span>
                        <Etiqueta cor={s.pct >= 80 ? "bg-sucesso-bg text-sucesso" : "bg-erro-bg text-erro"}>
                          {s.pct}%
                        </Etiqueta>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card-sombra p-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Wrench className="size-4" /> Paradas neste momento
              </h2>
              {dados.transicoesAbertas.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">Nenhuma máquina parada com estado aberto.</p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {dados.transicoesAbertas.slice(0, 12).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0">
                        <span className="font-semibold">{t.code}</span>{" "}
                        <span className="text-muted-foreground">{t.nome}</span>
                        {t.obra && (
                          <a
                            href={`/oficina/ordens/${t.os_id}`}
                            className="text-primario hover:underline dark:text-primario-forte"
                          >
                            {" "}
                            Obra {t.obra}
                          </a>
                        )}
                      </span>
                      <Etiqueta cor={COR_ESTADO_DIA[t.estado] || "bg-muted text-muted-foreground"}>{t.estado}</Etiqueta>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card-sombra p-4">
              <h2 className="text-sm font-semibold">Legenda</h2>
              <ul className="mt-2 grid grid-cols-2 gap-1.5">
                {ESTADOS_DIA.map((estado) => (
                  <li key={estado} className="flex items-center gap-1.5 text-[0.68rem]">
                    <span className={cn("inline-block size-3 shrink-0 rounded-sm", COR_SOLIDA_ESTADO[estado] || "bg-muted")} />
                    {estado}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DO DIA */}
      <Modal
        aberto={diaAberto !== null}
        fechar={() => setDiaAberto(null)}
        titulo={diaAberto ? `${diaAberto.code} · ${diaAberto.data}` : ""}
        subtitulo="Estado físico do dia e horas (a máquina conta 24h por dia até sair)"
        largura="max-w-2xl"
      >
        {diaAberto && (
          <div className="space-y-4">
            {diaAberto.numero_obra && (
              <p className="text-sm">
                Parada pela obra{" "}
                <a
                  href={`/oficina/ordens/${diaAberto.os_id}`}
                  className="font-semibold text-primario hover:underline dark:text-primario-forte"
                >
                  {diaAberto.numero_obra}
                </a>
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {ESTADOS_DIA.map((estado) => (
                <button
                  key={estado}
                  type="button"
                  onClick={() =>
                    setDiaAberto({
                      ...diaAberto,
                      estado,
                      horas_disponiveis: estado === "Disponível" ? 24 : diaAberto.horas_disponiveis
                    })
                  }
                  className={cn(
                    "rounded-md border px-2 py-2 text-xs font-semibold transition-colors",
                    diaAberto.estado === estado
                      ? cn(COR_ESTADO_DIA[estado] || "bg-muted", "border-transparent")
                      : "border-input hover:bg-muted"
                  )}
                >
                  {estado}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDiaAberto({ ...diaAberto, estado: null, horas_disponiveis: null })}
                className={cn(
                  "rounded-md border px-2 py-2 text-xs font-semibold text-muted-foreground transition-colors",
                  diaAberto.estado === null ? "border-primario bg-muted" : "border-input hover:bg-muted"
                )}
              >
                Sem marcação
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="text-xs font-medium">
                Horas disponíveis (0-24)
                <input
                  type="number"
                  min={0}
                  max={24}
                  step={0.5}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={diaAberto.horas_disponiveis ?? ""}
                  onChange={(e) =>
                    setDiaAberto({
                      ...diaAberto,
                      horas_disponiveis: e.target.value === "" ? null : Math.min(24, Math.max(0, Number(e.target.value)))
                    })
                  }
                />
              </label>
              <label className="text-xs font-medium">
                Hora entrada
                <input
                  type="time"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={diaAberto.hora_entrada}
                  onChange={(e) => setDiaAberto({ ...diaAberto, hora_entrada: e.target.value })}
                />
              </label>
              <label className="text-xs font-medium">
                Hora saída
                <input
                  type="time"
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={diaAberto.hora_saida}
                  onChange={(e) => setDiaAberto({ ...diaAberto, hora_saida: e.target.value })}
                />
              </label>
              <label className="text-xs font-medium">
                Repetir até dia
                <input
                  type="number"
                  min={Number(diaAberto.data.slice(8, 10)) + 1}
                  max={nDias}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={diaAberto.repetirAte || ""}
                  placeholder="só este dia"
                  onChange={(e) => setDiaAberto({ ...diaAberto, repetirAte: e.target.value })}
                />
              </label>
            </div>

            <label className="block text-xs font-medium">
              Observação
              <input
                type="text"
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                value={diaAberto.observacao}
                placeholder="ex.: aguarda bomba injetora do fornecedor"
                onChange={(e) => setDiaAberto({ ...diaAberto, observacao: e.target.value })}
              />
            </label>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
              {podeApagar ? (
                <button
                  type="button"
                  onClick={() => limparDia(diaAberto)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input px-3 text-sm text-erro hover:bg-erro-bg"
                >
                  <Eraser className="size-4" /> Limpar dia
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDiaAberto(null)}
                  className="h-9 rounded-md border border-input px-3 text-sm hover:bg-muted"
                >
                  Cancelar
                </button>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => gravarDia(diaAberto)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte"
                  >
                    <Save className="size-4" /> Gravar
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
