"use client";

/**
 * Saídas de material com registo DIRECTO (decisão do Filomeno):
 * a saída nasce confirmada e o stock desce de imediato. O stock nunca
 * fica negativo: quem leva não pode levar o que não existe, bloqueado
 * aqui no formulário (aviso visível) e no servidor (independente da UI).
 *
 * Os pendentes antigos que já estavam na base continuam a poder ser
 * confirmados ou rejeitados, bem visíveis no topo.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { dataHojeISO } from "@/lib/oficina";
import { fmtData, fmtNum, normalizar, rotuloMaterial } from "@/lib/stock";
import type { Finalidade, Material, MovimentoStock } from "@/lib/stock";

type Dados = {
  ok: boolean;
  movimentos: MovimentoStock[];
  materiais: Material[];
  colaboradores: { id: string; name: string; setor: string | null }[];
  posicoes: Record<string, number>;
};

type ListasConfig = {
  finalidades: Finalidade[];
};

export function SaidasClient({
  podeCriar,
  podeEditar,
  podeApagar
}: {
  podeCriar: boolean;
  podeEditar: boolean;
  podeApagar: boolean;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [config, setConfig] = useState<ListasConfig | null>(null);
  const [falha, setFalha] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [busca, setBusca] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [aApagar, setAApagar] = useState<MovimentoStock | null>(null);
  const [aConfirmar, setAConfirmar] = useState<MovimentoStock | null>(null);

  const [fMaterial, setFMaterial] = useState("");
  const [fQtd, setFQtd] = useState("");
  const [fColaborador, setFColaborador] = useState("");
  const [fFinalidade, setFFinalidade] = useState("");
  const [fRequisicao, setFRequisicao] = useState("");
  const [fData, setFData] = useState(dataHojeISO());
  const [fObs, setFObs] = useState("");

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    Promise.all([
      pedir<Dados>("/api/stock/movimentos"),
      pedir<ListasConfig & { ok: boolean }>("/api/stock/config")
    ])
      .then(([d, c]) => {
        setDados(d);
        setConfig({ finalidades: (c.finalidades || []).filter((f) => f.ativo !== false) });
      })
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    // Primeira carga sem setState sincrono no efeito (regra react-hooks)
    let vivo = true;
    Promise.all([
      pedir<Dados>("/api/stock/movimentos"),
      pedir<ListasConfig & { ok: boolean }>("/api/stock/config")
    ])
      .then(([d, c]) => {
        if (!vivo) return;
        setDados(d);
        setConfig({ finalidades: (c.finalidades || []).filter((f) => f.ativo !== false) });
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

  const mapaMat = useMemo(
    () => new Map((dados?.materiais || []).map((m) => [m.id, m])),
    [dados]
  );
  const posicoes = dados?.posicoes || {};

  const pendentes = useMemo(
    () => (dados?.movimentos || []).filter((m) => m.tipo === "saida" && m.estado === "pendente"),
    [dados]
  );
  const confirmadas = useMemo(
    () => (dados?.movimentos || []).filter((m) => m.tipo === "saida" && m.estado === "confirmado"),
    [dados]
  );

  const listaFiltrada = useMemo(() => {
    const q = normalizar(busca);
    if (!q) return confirmadas;
    return confirmadas.filter((m) => {
      const mat = mapaMat.get(m.material_id);
      return (
        normalizar(rotuloMaterial(mat)).includes(q) ||
        normalizar(m.colaborador_nome).includes(q) ||
        normalizar(m.numero_requisicao).includes(q) ||
        normalizar(m.finalidade).includes(q)
      );
    });
  }, [confirmadas, busca, mapaMat]);

  const materialSel = fMaterial ? mapaMat.get(fMaterial) : null;
  const stockSel = fMaterial ? posicoes[fMaterial] || 0 : 0;
  const qtdPedida = Number(fQtd);
  const qtdValida = Number.isFinite(qtdPedida) && qtdPedida > 0;
  const stockInsuficiente = fMaterial && qtdValida && qtdPedida > stockSel;

  const campo = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const rotulo = "mb-1 block text-xs font-medium text-muted-foreground";

  async function gravar() {
    if (!fMaterial) {
      toast.error("Escolhe o material.");
      return;
    }
    if (!qtdValida) {
      toast.error("Quantidade: escreve um número maior que 0.");
      return;
    }
    if (!(fColaborador || "").trim()) {
      toast.error("Indica quem levanta o material.");
      return;
    }
    setAGravar(true);
    try {
      await enviar(
        "/api/stock/movimentos",
        {
          action: "criar",
          movimento: {
            tipo: "saida",
            material_id: fMaterial,
            quantidade: Number(fQtd),
            colaborador_nome: fColaborador,
            finalidade: fFinalidade,
            numero_requisicao: fRequisicao,
            data_movimento: fData,
            observacoes: fObs
          }
        },
        "Saída registada e confirmada."
      );
      setFMaterial("");
      setFQtd("");
      setFColaborador("");
      setFFinalidade("");
      setFRequisicao("");
      setFObs("");
      setFData(dataHojeISO());
      carregar();
    } catch {
      /* o enviar já avisa */
    } finally {
      setAGravar(false);
    }
  }

  async function confirmarPendente() {
    if (!aConfirmar) return;
    setAGravar(true);
    try {
      await enviar(
        "/api/stock/movimentos",
        { action: "confirmar-pendente", id: aConfirmar.id },
        "Saída confirmada no armazém."
      );
      setAConfirmar(null);
      carregar();
    } catch {
      /* o enviar já avisa (ex.: stock já não chega para esta saída) */
    } finally {
      setAGravar(false);
    }
  }

  async function apagar() {
    if (!aApagar) return;
    setAGravar(true);
    try {
      await enviar(
        "/api/stock/movimentos",
        { action: "apagar", id: aApagar.id },
        "Registo apagado."
      );
      setAApagar(null);
      carregar();
    } catch {
      /* o enviar já avisa */
    } finally {
      setAGravar(false);
    }
  }

  return (
    <div className="space-y-4">
      <Cabeca
        titulo="Stock - Saídas"
        subtitulo="Material entregue aos colegas, gravado já confirmado"
      />

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}
      {aCarregar && !dados && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar as saídas...
        </div>
      )}

      {dados && (
        <>
          {pendentes.length > 0 && (
            <div className="card-sombra border border-ambar/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                Pedidos antigos de saída por confirmar ({pendentes.length})
                <Etiqueta cor="bg-ambar-claro text-ambar-texto">pendente</Etiqueta>
              </div>
              <div className="divide-y">
                {pendentes.map((m) => {
                  const mat = mapaMat.get(m.material_id);
                  const stockDoMat = posicoes[m.material_id] || 0;
                  const podeConfirmar = (Number(m.quantidade) || 0) <= stockDoMat;
                  return (
                    <div key={m.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                      <span className="tabular-nums text-xs text-muted-foreground">{fmtData(m.data_movimento)}</span>
                      <span className="font-semibold">{rotuloMaterial(mat)}</span>
                      <span className="tabular-nums">
                        {fmtNum(Number(m.quantidade))} {mat?.unidade || ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {m.colaborador_nome || "sem colaborador"} · stock actual {fmtNum(stockDoMat)} {mat?.unidade || ""}
                      </span>
                      {!podeConfirmar && (
                        <Etiqueta cor="bg-erro-bg text-erro">stock já não chega</Etiqueta>
                      )}
                      {(podeEditar || podeApagar) && (
                        <span className="ml-auto flex gap-2">
                          {podeEditar && (
                            <button
                              onClick={() => setAConfirmar(m)}
                              disabled={!podeConfirmar}
                              className="rounded-md bg-sucesso px-2 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Confirmar
                            </button>
                          )}
                          {podeApagar && (
                            <button
                              onClick={() => setAApagar(m)}
                              className="rounded-md border border-input px-2 py-1 text-xs font-medium text-erro hover:bg-muted"
                            >
                              Rejeitar
                            </button>
                          )}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {podeCriar && (
            <div className="card-sombra p-4">
              <div className="mb-3 text-sm font-semibold">Registar saída</div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <div className="col-span-2">
                  <label className={rotulo}>Material *</label>
                  <select
                    className={campo}
                    value={fMaterial}
                    onChange={(e) => setFMaterial(e.target.value)}
                  >
                    <option value="">Seleccione</option>
                    {(dados.materiais || [])
                      .filter((m) => m.ativo !== false)
                      .map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.referencia} - {m.nome}
                        </option>
                      ))}
                  </select>
                  {materialSel && (
                    <p
                      className={cn(
                        "mt-1 text-xs font-medium",
                        stockSel <= 0 ? "text-erro" : "text-muted-foreground"
                      )}
                    >
                      {stockSel <= 0
                        ? `Esgotado: não há ${materialSel.nome.toLowerCase()} no stock.`
                        : `Stock actual: ${fmtNum(stockSel)} ${materialSel.unidade}`}
                    </p>
                  )}
                </div>
                <div>
                  <label className={rotulo}>Quantidade *</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={cn(campo, stockInsuficiente && "border-erro bg-erro-bg")}
                    value={fQtd}
                    onChange={(e) => setFQtd(e.target.value)}
                  />
                  {stockInsuficiente && (
                    <p className="mt-1 text-xs font-medium text-erro">
                      Stock insuficiente: disponível {fmtNum(stockSel)} {materialSel?.unidade || ""}. A saída fica
                      bloqueada para o stock nunca ficar negativo.
                    </p>
                  )}
                </div>
                <div>
                  <label className={rotulo}>Quem levanta *</label>
                  <input
                    className={campo}
                    list="colaboradores-stock"
                    value={fColaborador}
                    placeholder="Escreve ou escolhe o nome"
                    onChange={(e) => setFColaborador(e.target.value)}
                  />
                  <datalist id="colaboradores-stock">
                    {(dados.colaboradores || []).map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.setor || ""}
                      </option>
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className={rotulo}>Finalidade</label>
                  <select
                    className={campo}
                    value={fFinalidade}
                    onChange={(e) => setFFinalidade(e.target.value)}
                  >
                    <option value="">Sem finalidade</option>
                    {(config?.finalidades || []).map((f) => (
                      <option key={f.id} value={f.nome}>{f.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={rotulo}>Nº Requisição</label>
                  <input
                    className={campo}
                    value={fRequisicao}
                    placeholder="Opcional"
                    onChange={(e) => setFRequisicao(e.target.value)}
                  />
                </div>
                <div>
                  <label className={rotulo}>Data</label>
                  <input
                    type="date"
                    max={dataHojeISO()}
                    className={campo}
                    value={fData}
                    onChange={(e) => setFData(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className={rotulo}>Observações</label>
                  <input
                    className={campo}
                    value={fObs}
                    placeholder="Opcional"
                    onChange={(e) => setFObs(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-3">
                <button
                  onClick={gravar}
                  disabled={aGravar || Boolean(stockInsuficiente) || (Boolean(materialSel) && stockSel <= 0)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-forte disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {aGravar && <Rodar className="size-4" />}
                  {stockSel <= 0 && fMaterial
                    ? "Sem stock disponível"
                    : stockInsuficiente
                      ? "Quantidade acima do stock"
                      : "Gravar saída"}
                </button>
                <p className="mt-2 text-xs text-muted-foreground">
                  O stock não fica nunca negativo: a quantidade é conferida no servidor no momento de gravar.
                </p>
              </div>
            </div>
          )}

          <div className="card-sombra p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Saídas confirmadas ({listaFiltrada.length})</span>
              <div className="ml-auto relative">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar material, colaborador, requisição..."
                  className="h-9 w-72 rounded-md border border-input bg-background pl-8 pr-2 text-sm"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Data</th>
                    <th className="px-2 py-2 font-medium">Material</th>
                    <th className="px-2 py-2 text-right font-medium">Qtd</th>
                    <th className="px-2 py-2 font-medium">Colaborador</th>
                    <th className="px-2 py-2 font-medium">Requisição</th>
                    <th className="px-2 py-2 font-medium">Finalidade</th>
                    <th className="px-2 py-2 font-medium">Observações</th>
                    {podeApagar && <th className="px-2 py-2 text-right font-medium">Apagar</th>}
                  </tr>
                </thead>
                <tbody>
                  {listaFiltrada.length === 0 && (
                    <tr>
                      <td colSpan={podeApagar ? 8 : 7} className="py-6 text-center text-muted-foreground">
                        Nenhuma saída encontrada.
                      </td>
                    </tr>
                  )}
                  {listaFiltrada.map((m) => {
                    const mat = mapaMat.get(m.material_id);
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="px-2 py-1.5 tabular-nums">{fmtData(m.data_confirmacao || m.data_movimento)}</td>
                        <td className="px-2 py-1.5 font-semibold">{rotuloMaterial(mat)}</td>
                        <td className="px-2 py-1.5 text-right font-bold tabular-nums text-erro">
                          -{fmtNum(Number(m.quantidade))} {mat?.unidade || ""}
                        </td>
                        <td className="px-2 py-1.5">{m.colaborador_nome || "-"}</td>
                        <td className="px-2 py-1.5">{m.numero_requisicao || "-"}</td>
                        <td className="px-2 py-1.5">{m.finalidade || "-"}</td>
                        <td className="px-2 py-1.5">{m.observacoes || "-"}</td>
                        {podeApagar && (
                          <td className="px-2 py-1.5 text-right">
                            <button
                              onClick={() => setAApagar(m)}
                              className="inline-flex rounded-md border border-input p-1.5 text-erro hover:bg-muted"
                              aria-label="Apagar saída"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <Modal
        aberto={Boolean(aApagar)}
        fechar={() => setAApagar(null)}
        titulo="Apagar registo de saída"
        largura="max-w-md"
      >
        <p className="text-sm text-muted-foreground">
          {aApagar
            ? `Apagar a saída de ${fmtNum(Number(aApagar.quantidade))} ${
                mapaMat.get(aApagar.material_id)?.unidade || ""
              } de ${rotuloMaterial(mapaMat.get(aApagar.material_id))} do dia ${fmtData(
                aApagar.data_movimento
              )}? O stock sobe de imediato.`
            : ""}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setAApagar(null)}
            className="h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={apagar}
            disabled={aGravar}
            className="h-9 rounded-md bg-erro px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {aGravar ? <Rodar className="size-4" /> : "Apagar"}
          </button>
        </div>
      </Modal>

      <Modal
        aberto={Boolean(aConfirmar)}
        fechar={() => setAConfirmar(null)}
        titulo="Confirmar saída antiga"
        largura="max-w-md"
      >
        <p className="text-sm text-muted-foreground">
          {aConfirmar
            ? `Confirmar a saída de ${fmtNum(Number(aConfirmar.quantidade))} de ${rotuloMaterial(
                mapaMat.get(aConfirmar.material_id)
              )}? O stock desce de imediato.`
            : ""}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setAConfirmar(null)}
            className="h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={confirmarPendente}
            disabled={aGravar}
            className="h-9 rounded-md bg-sucesso px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {aGravar ? <Rodar className="size-4" /> : "Confirmar"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
