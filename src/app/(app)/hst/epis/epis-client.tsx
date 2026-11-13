/**
 * /hst/epis - EPIs (cliente).
 *
 * Abas Catálogo e Entregas como no hub, com KPIs no topo. O stock menor
 * que 5 fica vermelho (regra do hub). A entrega mostra a pré-visualização
 * do stock que fica depois (o servidor baixa de verdade e recusa se não
 * houver material suficiente).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, PackageOpen, Pencil, Plus, Save, Search, Shirt } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { SelecionarColaborador } from "@/components/oficina/selecionar-colaborador";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  fmtDataHst,
  problemaEntrega,
  problemaEpi,
  semAcentos,
  type EntregaEpiHST,
  type EpiHST,
  type ColaboradorHST
} from "@/lib/hst";

type Dados = { ok: boolean; epis: EpiHST[]; entregas: EntregaEpiHST[] };

export function EpisClient({ podeApagar }: { podeApagar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [colabs, setColabs] = useState<ColaboradorHST[]>([]);
  const [falha, setFalha] = useState("");
  const [aba, setAba] = useState<"catalogo" | "entregas">("catalogo");
  const [pesquisa, setPesquisa] = useState("");
  const [pesquisaEnt, setPesquisaEnt] = useState("");

  // Modais
  const [modalEpi, setModalEpi] = useState(false);
  const [editando, setEditando] = useState<EpiHST | null>(null);
  const [formEpi, setFormEpi] = useState({ nome: "", ca: "", stock_atual: 0, descricao: "" });
  const [aGravar, setAGravar] = useState(false);
  const [modalEntrega, setModalEntrega] = useState(false);
  const [formEnt, setFormEnt] = useState({
    colaborador_nome: "",
    epi_id: null as number | null,
    quantidade: 1,
    observacoes: "",
    data_entrega: ""
  });

  function carregar() {
    pedir<Dados>("/api/hst/epis")
      .then(setDados)
      .catch((e: Error) => setFalha(e.message));
  }
  useEffect(() => {
    carregar();
    pedir<{ colaboradores: ColaboradorHST[] }>("/api/hst/colaboradores")
      .then((d) => setColabs(d.colaboradores || []))
      .catch(() => {});
  }, []);

  const episAtivos = useMemo(() => (dados?.epis || []).filter((e) => e.ativo !== false), [dados]);

  const catalogo = useMemo(() => {
    const alvo = semAcentos(pesquisa);
    if (!alvo) return episAtivos;
    return episAtivos.filter((e) => semAcentos(`${e.nome} ${e.ca || ""} ${e.descricao || ""}`).includes(alvo));
  }, [episAtivos, pesquisa]);

  const entregas = useMemo(() => {
    if (!dados) return [];
    const alvo = semAcentos(pesquisaEnt);
    if (!alvo) return dados.entregas;
    return dados.entregas.filter((e) => semAcentos(`${e.colaborador_nome} ${e.epi_nome}`).includes(alvo));
  }, [dados, pesquisaEnt]);

  const stats = useMemo(() => ({
    tipos: episAtivos.length,
    stock: episAtivos.reduce((s, e) => s + (Number(e.stock_atual) || 0), 0),
    mes: (dados?.entregas || []).filter(
      (e) => String(e.data_entrega || "").slice(0, 7) === new Date().toISOString().slice(0, 7)
    ).length
  }), [dados, episAtivos]);

  const epiSelecionado = episAtivos.find((e) => e.id === formEnt.epi_id);
  const stockDepois = epiSelecionado ? Math.max(0, (Number(epiSelecionado.stock_atual) || 0) - (formEnt.quantidade || 0)) : null;

  function abrirNovoEpi() {
    setEditando(null);
    setFormEpi({ nome: "", ca: "", stock_atual: 0, descricao: "" });
    setModalEpi(true);
  }

  function abrirEditarEpi(e: EpiHST) {
    setEditando(e);
    setFormEpi({ nome: e.nome, ca: e.ca || "", stock_atual: Number(e.stock_atual) || 0, descricao: e.descricao || "" });
    setModalEpi(true);
  }

  async function gravarEpi() {
    const problema = problemaEpi(formEpi);
    if (problema) {
      toast.warning(problema);
      return;
    }
    setAGravar(true);
    try {
      if (editando) {
        await enviar(`/api/hst/epis/${editando.id}`, formEpi, "EPI actualizado.", "PATCH");
      } else {
        await enviar("/api/hst/epis", formEpi, "EPI registado.");
      }
      setModalEpi(false);
      carregar();
    } catch {
      /* toast já avisou */
    } finally {
      setAGravar(false);
    }
  }

  async function gravarEntrega() {
    const problema = problemaEntrega(formEnt);
    if (problema) {
      toast.warning(problema);
      return;
    }
    setAGravar(true);
    try {
      const corpo: Record<string, unknown> = {
        colaborador_nome: formEnt.colaborador_nome,
        epi_id: formEnt.epi_id,
        quantidade: formEnt.quantidade,
        observacoes: formEnt.observacoes
      };
      if (formEnt.data_entrega) corpo.data_entrega = formEnt.data_entrega;
      const r = await enviar<{ stockRestante?: number }>("/api/hst/entregas", corpo, "Entrega registada e stock baixado.");
      toast.success(`Stock actual: ${r.stockRestante ?? "-"} unidade(s).`);
      setModalEntrega(false);
      setFormEnt({ colaborador_nome: "", epi_id: null, quantidade: 1, observacoes: "", data_entrega: "" });
      carregar();
    } catch {
      /* toast já avisou */
    } finally {
      setAGravar(false);
    }
  }

  async function apagarEntrega(e: EntregaEpiHST) {
    if (!window.confirm(`Apagar a entrega de ${e.epi_nome} a ${e.colaborador_nome}? O stock volta ao catálogo.`)) return;
    try {
      await enviar(`/api/hst/entregas?id=${e.id}`, {}, "Entrega apagada e stock reposto.", "DELETE");
      carregar();
    } catch {
      /* toast já avisou */
    }
  }

  if (falha) {
    return <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">{falha}</div>;
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo="Equipamentos de Protecção Individual" subtitulo="Catálogo e registo de entregas">
        <Button onClick={abrirNovoEpi}>
          <Plus className="size-4" aria-hidden /> Novo EPI
        </Button>
      </Cabeca>

      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-3">
        <div className="card-sombra rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Tipos de EPI</div>
          <div className="text-xl font-bold">{dados ? stats.tipos : "..."}</div>
        </div>
        <div className="card-sombra rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Unidades em stock</div>
          <div className="text-xl font-bold">{dados ? stats.stock : "..."}</div>
        </div>
        <div className="card-sombra rounded-lg border border-border bg-card p-4">
          <div className="text-xs text-muted-foreground">Entregas (mês)</div>
          <div className="text-xl font-bold">{dados ? stats.mes : "..."}</div>
        </div>
      </section>

      <div className="flex gap-1 border-b-2 border-border">
        <button
          className={`px-5 py-2.5 text-sm font-semibold ${aba === "catalogo" ? "border-b-[3px] border-b-emerald-600 text-foreground" : "text-muted-foreground"}`}
          onClick={() => setAba("catalogo")}
        >
          Catálogo
        </button>
        <button
          className={`px-5 py-2.5 text-sm font-semibold ${aba === "entregas" ? "border-b-[3px] border-b-emerald-600 text-foreground" : "text-muted-foreground"}`}
          onClick={() => setAba("entregas")}
        >
          Entregas
        </button>
      </div>

      {aba === "catalogo" ? (
        <>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input className="pl-8" placeholder="Pesquisar EPI..." value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)} aria-label="Pesquisar EPIs" />
          </div>
          {!dados ? (
            <p className="py-8 text-center text-sm text-muted-foreground">A carregar...</p>
          ) : catalogo.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhum EPI registado.</p>
          ) : (
            <div className="space-y-2">
              {catalogo.map((e) => {
                const stock = Number(e.stock_atual) || 0;
                const baixo = stock <= 5;
                return (
                  <Card key={e.id} className="card-sombra">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <div className="min-w-48 flex-1">
                        <div className="font-bold">{e.nome}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {e.ca ? `CA: ${e.ca} | ` : ""}{e.descricao || "Sem descrição"}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`text-2xl font-bold ${baixo ? "text-red-600" : ""}`}>{stock}</div>
                        <div className="text-[0.72rem] text-muted-foreground">unid.</div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => { setFormEnt({ colaborador_nome: "", epi_id: e.id, quantidade: 1, observacoes: "", data_entrega: "" }); setModalEntrega(true); }}>
                          <PackageOpen className="size-3.5" aria-hidden /> Entregar
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => abrirEditarEpi(e)}>
                          <Pencil className="size-3.5" aria-hidden /> Editar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input className="pl-8" placeholder="Pesquisar por colaborador ou EPI..." value={pesquisaEnt}
                onChange={(e) => setPesquisaEnt(e.target.value)} aria-label="Pesquisar entregas" />
            </div>
            <Button size="sm" onClick={() => { setFormEnt({ colaborador_nome: "", epi_id: null, quantidade: 1, observacoes: "", data_entrega: "" }); setModalEntrega(true); }}>
              <Plus className="size-4" aria-hidden /> Registar Entrega
            </Button>
          </div>
          <Card className="card-sombra">
            <CardContent className="p-0">
              {!dados ? (
                <p className="py-8 text-center text-sm text-muted-foreground">A carregar...</p>
              ) : entregas.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma entrega registada.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="p-3 font-medium">Data</th>
                        <th className="p-3 font-medium">Colaborador</th>
                        <th className="p-3 font-medium">EPI</th>
                        <th className="p-3 font-medium">Qtd</th>
                        <th className="p-3 font-medium">Observações</th>
                        {podeApagar ? <th className="p-3 font-medium" aria-label="Acções" /> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {entregas.map((e) => (
                        <tr key={e.id} className="border-b last:border-0">
                          <td className="p-3">{fmtDataHst(e.data_entrega)}</td>
                          <td className="p-3">{e.colaborador_nome}</td>
                          <td className="p-3">{e.epi_nome}</td>
                          <td className="p-3">{e.quantidade || 1}</td>
                          <td className="max-w-52 truncate p-3" title={e.observacoes || ""}>{e.observacoes || "-"}</td>
                          {podeApagar ? (
                            <td className="p-3">
                              <Button size="sm" variant="outline" onClick={() => apagarEntrega(e)}>
                                Apagar
                              </Button>
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Modal: EPI */}
      <Modal aberto={modalEpi} fechar={() => setModalEpi(false)} titulo={editando ? "Editar EPI" : "Novo EPI"} largura="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="epi-nome">Nome do EPI *</label>
            <Input id="epi-nome" value={formEpi.nome} onChange={(e) => setFormEpi((f) => ({ ...f, nome: e.target.value }))}
              placeholder="Ex.: Capacete, Luvas, Botas..." />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="epi-ca">Certificado de Aprovação (CA)</label>
            <Input id="epi-ca" value={formEpi.ca} onChange={(e) => setFormEpi((f) => ({ ...f, ca: e.target.value }))}
              placeholder="Número do CA" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="epi-stock">Stock actual</label>
            <Input id="epi-stock" type="number" min={0} value={formEpi.stock_atual}
              onChange={(e) => setFormEpi((f) => ({ ...f, stock_atual: Number(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="epi-desc">Descrição</label>
            <textarea id="epi-desc" className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={formEpi.descricao} onChange={(e) => setFormEpi((f) => ({ ...f, descricao: e.target.value }))} />
          </div>
          {editando ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editando.ativo !== false} className="size-4"
                onChange={async (e) => {
                  try {
                    await enviar(`/api/hst/epis/${editando.id}`, { ativo: e.target.checked }, undefined, "PATCH");
                    toast.success(e.target.checked ? "EPI reactivado." : "EPI desactivado.");
                    carregar();
                  } catch {
                    /* toast já avisou */
                  }
                }} />
              EPI activo
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalEpi(false)}>Cancelar</Button>
            <Button onClick={gravarEpi} disabled={aGravar}>
              {aGravar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Guardar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: entrega */}
      <Modal aberto={modalEntrega} fechar={() => setModalEntrega(false)} titulo="Registar Entrega de EPI" largura="max-w-md">
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ent-colab">Colaborador *</label>
            <SelecionarColaborador
              id="ent-colab"
              colaboradores={colabs}
              value={formEnt.colaborador_nome}
              onChange={(nome) => setFormEnt((f) => ({ ...f, colaborador_nome: nome }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ent-epi">EPI *</label>
            <select id="ent-epi" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
              value={formEnt.epi_id ?? ""} onChange={(e) => setFormEnt((f) => ({ ...f, epi_id: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">Seleccionar...</option>
              {episAtivos.map((e) => (
                <option key={e.id} value={e.id}>{e.nome} (stock {Number(e.stock_atual) || 0})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ent-qtd">Quantidade</label>
            <Input id="ent-qtd" type="number" min={1} value={formEnt.quantidade}
              onChange={(e) => setFormEnt((f) => ({ ...f, quantidade: Number(e.target.value) || 1 }))} />
          </div>
          {stockDepois != null ? (
            <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">
              Stock de {epiSelecionado?.nome} depois da entrega: {stockDepois} unidade(s)
              {stockDepois === 0 ? " (fica a zero)" : ""}.
              {(Number(epiSelecionado?.stock_atual) || 0) < formEnt.quantidade ? (
                <span className="font-bold text-red-600"> Sem stock suficiente: o servidor vai recusar.</span>
              ) : null}
            </p>
          ) : null}
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ent-data">Data da entrega</label>
            <Input id="ent-data" type="date" value={formEnt.data_entrega}
              onChange={(e) => setFormEnt((f) => ({ ...f, data_entrega: e.target.value }))}
              placeholder="Vazio = agora" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold" htmlFor="ent-obs">Observações</label>
            <textarea id="ent-obs" className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={formEnt.observacoes} onChange={(e) => setFormEnt((f) => ({ ...f, observacoes: e.target.value }))} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalEntrega(false)}>Cancelar</Button>
            <Button onClick={gravarEntrega} disabled={aGravar}>
              {aGravar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Shirt className="size-4" aria-hidden />}
              Registar
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
