"use client";

/**
 * Entradas de material com registo DIRECTO (decisão do Filomeno):
 * a entrada nasce confirmada, sem fase de pedido pendente. Os pendentes
 * antigos que já estavam na base continuam a poder ser confirmados ou
 * rejeitados aqui, e a porta para o fluxo em 2 passos fica aberta.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { dataHojeISO } from "@/lib/oficina";
import { fmtData, fmtMzn, fmtNum, normalizar, rotuloMaterial } from "@/lib/stock";
import type { Fornecedor, Material, MovimentoStock } from "@/lib/stock";

type Dados = {
  ok: boolean;
  movimentos: MovimentoStock[];
  materiais: Material[];
  posicoes: Record<string, number>;
};

type ListasConfig = {
  fornecedores: Fornecedor[];
  departamentos: { id: string; nome: string; active?: boolean }[];
  compradores: { id: string; nome: string }[];
  receptores: { id: string; nome: string }[];
};

/** Resposta crua da API de configurações (antes do filtro por função). */
type RespConfigApi = ListasConfig & {
  responsaveis: { id: string; nome: string; funcao: string }[];
};

export function EntradasClient({
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
  const [fPreco, setFPreco] = useState("");
  const [fFornecedor, setFFornecedor] = useState("");
  const [fPo, setFPo] = useState("");
  const [fDepartamento, setFDepartamento] = useState("");
  const [fComprador, setFComprador] = useState("");
  const [fRecebedor, setFRecebedor] = useState("");
  const [fData, setFData] = useState(dataHojeISO());
  const [fObs, setFObs] = useState("");

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    Promise.all([
      pedir<Dados>("/api/stock/movimentos"),
      pedir<RespConfigApi>("/api/stock/config")
    ])
      .then(([d, c]) => {
        setDados(d);
        setConfig({
          fornecedores: (c.fornecedores || []).filter((f) => f.ativo !== false),
          departamentos: (c.departamentos || []).filter((d2) => d2.active !== false),
          compradores: (c.responsaveis || []).filter(
            (r) => r.funcao === "comprador" || r.funcao === "ambos"
          ),
          receptores: (c.responsaveis || []).filter(
            (r) => r.funcao === "receptor" || r.funcao === "ambos"
          )
        });
      })
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    // Primeira carga sem setState sincrono no efeito (regra react-hooks)
    let vivo = true;
    Promise.all([
      pedir<Dados>("/api/stock/movimentos"),
      pedir<RespConfigApi>("/api/stock/config")
    ])
      .then(([d, c]) => {
        if (!vivo) return;
        setDados(d);
        setConfig({
          fornecedores: (c.fornecedores || []).filter((f) => f.ativo !== false),
          departamentos: (c.departamentos || []).filter((d2) => d2.active !== false),
          compradores: (c.responsaveis || []).filter(
            (r) => r.funcao === "comprador" || r.funcao === "ambos"
          ),
          receptores: (c.responsaveis || []).filter(
            (r) => r.funcao === "receptor" || r.funcao === "ambos"
          )
        });
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
    () => (dados?.movimentos || []).filter((m) => m.tipo === "entrada" && m.estado === "pendente"),
    [dados]
  );
  const confirmadas = useMemo(
    () => (dados?.movimentos || []).filter((m) => m.tipo === "entrada" && m.estado === "confirmado"),
    [dados]
  );

  const listaFiltrada = useMemo(() => {
    const q = normalizar(busca);
    if (!q) return confirmadas;
    return confirmadas.filter((m) => {
      const mat = mapaMat.get(m.material_id);
      return (
        normalizar(rotuloMaterial(mat)).includes(q) ||
        normalizar(m.fornecedor).includes(q) ||
        normalizar(m.numero_po).includes(q)
      );
    });
  }, [confirmadas, busca, mapaMat]);

  const total = Number(fQtd) * Number(fPreco);
  const materialSel = fMaterial ? mapaMat.get(fMaterial) : null;
  const stockSel = fMaterial ? posicoes[fMaterial] || 0 : 0;

  const campo = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const rotulo = "mb-1 block text-xs font-medium text-muted-foreground";

  async function gravar() {
    if (!fMaterial) {
      toast.error("Escolhe o material.");
      return;
    }
    if (!(Number(fQtd) > 0)) {
      toast.error("Quantidade: escreve um número maior que 0.");
      return;
    }
    setAGravar(true);
    try {
      await enviar(
        "/api/stock/movimentos",
        {
          action: "criar",
          movimento: {
            tipo: "entrada",
            material_id: fMaterial,
            quantidade: Number(fQtd),
            preco_unitario: fPreco,
            fornecedor: fFornecedor,
            numero_po: fPo,
            departamento: fDepartamento,
            comprador_nome: fComprador,
            recebedor_nome: fRecebedor,
            data_movimento: fData,
            observacoes: fObs
          }
        },
        "Entrada registada e confirmada."
      );
      setFMaterial("");
      setFQtd("");
      setFPreco("");
      setFPo("");
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
        "Entrada confirmada no armazém."
      );
      setAConfirmar(null);
      carregar();
    } catch {
      /* o enviar já avisa */
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
        titulo="Stock - Entradas"
        subtitulo="Entradas de material no armazém, gravadas já confirmadas"
      />

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}
      {aCarregar && !dados && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar as entradas...
        </div>
      )}

      {dados && (
        <>
          {pendentes.length > 0 && (
            <div className="card-sombra border border-ambar/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                Pedidos antigos por confirmar ({pendentes.length})
                <Etiqueta cor="bg-ambar-claro text-ambar-texto">pendente</Etiqueta>
              </div>
              <div className="divide-y">
                {pendentes.map((m) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                    <span className="tabular-nums text-xs text-muted-foreground">{fmtData(m.data_movimento)}</span>
                    <span className="font-semibold">{rotuloMaterial(mapaMat.get(m.material_id))}</span>
                    <span className="tabular-nums">
                      {fmtNum(Number(m.quantidade))} {mapaMat.get(m.material_id)?.unidade || ""}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.fornecedor || "sem fornecedor"}</span>
                    {(podeEditar || podeApagar) && (
                      <span className="ml-auto flex gap-2">
                        {podeEditar && (
                          <button
                            onClick={() => setAConfirmar(m)}
                            className="rounded-md bg-sucesso px-2 py-1 text-xs font-semibold text-white hover:opacity-90"
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
                ))}
              </div>
            </div>
          )}

          {podeCriar && (
            <div className="card-sombra p-4">
              <div className="mb-3 text-sm font-semibold">Registar entrada</div>
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
                    <p className="mt-1 text-xs text-muted-foreground">
                      Stock actual: {fmtNum(stockSel)} {materialSel.unidade}
                    </p>
                  )}
                </div>
                <div>
                  <label className={rotulo}>Quantidade *</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={campo}
                    value={fQtd}
                    onChange={(e) => setFQtd(e.target.value)}
                  />
                </div>
                <div>
                  <label className={rotulo}>Preço unitário (MZN)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={campo}
                    value={fPreco}
                    onChange={(e) => setFPreco(e.target.value)}
                  />
                </div>
                <div>
                  <label className={rotulo}>Total</label>
                  <input
                    className={cn(campo, "font-semibold text-ambar-texto")}
                    readOnly
                    value={total > 0 ? fmtMzn(total) : ""}
                    placeholder="-"
                  />
                </div>
                <div>
                  <label className={rotulo}>Fornecedor</label>
                  <select
                    className={campo}
                    value={fFornecedor}
                    onChange={(e) => setFFornecedor(e.target.value)}
                  >
                    <option value="">Sem fornecedor</option>
                    {(config?.fornecedores || []).map((f) => (
                      <option key={f.id} value={f.nome}>{f.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={rotulo}>Nº Pro-forma / Cotação</label>
                  <input
                    className={campo}
                    value={fPo}
                    placeholder="ex.: COT-2026-001"
                    onChange={(e) => setFPo(e.target.value)}
                  />
                </div>
                <div>
                  <label className={rotulo}>Departamento solicitante</label>
                  <select
                    className={campo}
                    value={fDepartamento}
                    onChange={(e) => setFDepartamento(e.target.value)}
                  >
                    <option value="">Sem departamento</option>
                    {(config?.departamentos || []).map((d) => (
                      <option key={d.id} value={d.nome}>{d.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={rotulo}>Quem foi comprar</label>
                  <select
                    className={campo}
                    value={fComprador}
                    onChange={(e) => setFComprador(e.target.value)}
                  >
                    <option value="">Sem comprador</option>
                    {(config?.compradores || []).map((c) => (
                      <option key={c.id} value={c.nome}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={rotulo}>Recebido no armazém</label>
                  <select
                    className={campo}
                    value={fRecebedor}
                    onChange={(e) => setFRecebedor(e.target.value)}
                  >
                    <option value="">Sem receptor</option>
                    {(config?.receptores || []).map((r) => (
                      <option key={r.id} value={r.nome}>{r.nome}</option>
                    ))}
                  </select>
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
                  disabled={aGravar}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
                >
                  {aGravar && <Rodar className="size-4" />}
                  Gravar entrada
                </button>
              </div>
            </div>
          )}

          <div className="card-sombra p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Entradas confirmadas ({listaFiltrada.length})</span>
              <div className="ml-auto relative">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar material, fornecedor, pro-forma..."
                  className="h-9 w-72 rounded-md border border-input bg-background pl-8 pr-2 text-sm"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Data</th>
                    <th className="px-2 py-2 font-medium">Material</th>
                    <th className="px-2 py-2 text-right font-medium">Qtd</th>
                    <th className="px-2 py-2 text-right font-medium">Preço unit.</th>
                    <th className="px-2 py-2 text-right font-medium">Total</th>
                    <th className="px-2 py-2 font-medium">Fornecedor</th>
                    <th className="px-2 py-2 font-medium">Pro-forma</th>
                    <th className="px-2 py-2 font-medium">Departamento</th>
                    <th className="px-2 py-2 font-medium">Comprador</th>
                    <th className="px-2 py-2 font-medium">Recebido por</th>
                    {podeApagar && <th className="px-2 py-2 text-right font-medium">Apagar</th>}
                  </tr>
                </thead>
                <tbody>
                  {listaFiltrada.length === 0 && (
                    <tr>
                      <td colSpan={podeApagar ? 11 : 10} className="py-6 text-center text-muted-foreground">
                        Nenhuma entrada encontrada.
                      </td>
                    </tr>
                  )}
                  {listaFiltrada.map((m) => {
                    const mat = mapaMat.get(m.material_id);
                    const totalLinha = (Number(m.preco_unitario) || 0) * (Number(m.quantidade) || 0);
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="px-2 py-1.5 tabular-nums">{fmtData(m.data_confirmacao || m.data_movimento)}</td>
                        <td className="px-2 py-1.5 font-semibold">{rotuloMaterial(mat)}</td>
                        <td className="px-2 py-1.5 text-right font-bold tabular-nums text-sucesso">
                          +{fmtNum(Number(m.quantidade))} {mat?.unidade || ""}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {m.preco_unitario ? fmtMzn(m.preco_unitario) : "-"}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-ambar-texto">
                          {totalLinha ? fmtMzn(totalLinha) : "-"}
                        </td>
                        <td className="px-2 py-1.5">{m.fornecedor || "-"}</td>
                        <td className="px-2 py-1.5">{m.numero_po || "-"}</td>
                        <td className="px-2 py-1.5">{m.departamento || "-"}</td>
                        <td className="px-2 py-1.5">{m.comprador_nome || "-"}</td>
                        <td className="px-2 py-1.5">{m.recebedor_nome || "-"}</td>
                        {podeApagar && (
                          <td className="px-2 py-1.5 text-right">
                            <button
                              onClick={() => setAApagar(m)}
                              className="inline-flex rounded-md border border-input p-1.5 text-erro hover:bg-muted"
                              aria-label="Apagar entrada"
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
        titulo="Apagar registo de entrada"
        largura="max-w-md"
      >
        <p className="text-sm text-muted-foreground">
          {aApagar
            ? `Apagar a entrada de ${fmtNum(Number(aApagar.quantidade))} ${
                mapaMat.get(aApagar.material_id)?.unidade || ""
              } de ${rotuloMaterial(mapaMat.get(aApagar.material_id))} do dia ${fmtData(
                aApagar.data_movimento
              )}? O stock desce de imediato.`
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
        titulo="Confirmar entrada antiga"
        largura="max-w-md"
      >
        <p className="text-sm text-muted-foreground">
          {aConfirmar
            ? `Confirmar a entrada de ${fmtNum(Number(aConfirmar.quantidade))} de ${rotuloMaterial(
                mapaMat.get(aConfirmar.material_id)
              )}? O stock sobe de imediato.`
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
