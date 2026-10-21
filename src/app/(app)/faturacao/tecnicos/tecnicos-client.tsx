"use client";

/**
 * TecnicosClient - Técnicos da Faturação.
 *
 * Nota do analista: as tarifas por técnico preenchem o valor unitário no
 * editor QUANDO são maiores que zero. No histórico real estão todas a 0
 * e o preço vai pelos atalhos da página Tarifas (Standard / CdM), que é
 * o comportamento que a equipa já usa.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Pencil, Plus, Power, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Etiqueta, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmtNum } from "@/lib/faturacao";
import type { DocFaturacao, TecnicoFat } from "@/lib/faturacao";

type Resposta = { tecnicos: TecnicoFat[]; documentos: DocFaturacao[] };

const VAZIO = { id: "", nome: "", tarifa_mzn: "0", tarifa_usd: "0" };

export function TecnicosClient({
  podeEditar,
  podeApagar
}: {
  podeEditar: boolean;
  podeApagar: boolean;
}) {
  const [tecnicos, setTecnicos] = useState<TecnicoFat[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [falha, setFalha] = useState("");
  const [busca, setBusca] = useState("");
  const [modal, setModal] = useState<typeof VAZIO | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [aApagar, setAApagar] = useState<TecnicoFat | null>(null);

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    pedir<Resposta>("/api/faturacao/documentos")
      .then((d) => setTecnicos(d.tecnicos || []))
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    // Primeira carga sem setState sincrono no efeito (regra react-hooks)
    let vivo = true;
    pedir<{ tecnicos: TecnicoFat[] }>("/api/faturacao/documentos")
      .then((d) => {
        if (vivo) setTecnicos(d.tecnicos || []);
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

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return tecnicos
      .filter((t) => !q || (t.nome || "").toLowerCase().includes(q))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt"));
  }, [tecnicos, busca]);

  const gravar = async () => {
    if (!modal) return;
    if (!modal.nome.trim()) {
      toast.error("Nome obrigatório.");
      return;
    }
    setAGravar(true);
    try {
      const r = await fetch("/api/faturacao/tecnicos", {
        method: modal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: modal.id || undefined,
          nome: modal.nome,
          tarifa_mzn: Number(modal.tarifa_mzn) || 0,
          tarifa_usd: Number(modal.tarifa_usd) || 0
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.erro || "Falha ao guardar.");
      toast.success(modal.id ? "Técnico actualizado." : "Técnico adicionado.");
      setModal(null);
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAGravar(false);
    }
  };

  const alternarAtivo = async (t: TecnicoFat) => {
    try {
      const r = await fetch("/api/faturacao/tecnicos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, nome: t.nome, tarifa_mzn: t.tarifa_mzn, tarifa_usd: t.tarifa_usd, ativo: t.ativo === false })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.erro || "Falha.");
      toast.success(t.ativo === false ? "Técnico reactivado." : "Técnico desactivado.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const apagar = async () => {
    if (!aApagar) return;
    try {
      const r = await fetch(`/api/faturacao/tecnicos?id=${encodeURIComponent(aApagar.id)}`, {
        method: "DELETE"
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.erro || "Falha ao apagar.");
      toast.success("Técnico apagado.");
      setAApagar(null);
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Faturação - Técnicos"
        subtitulo="Nomes que aparecem nas linhas de mão-de-obra. Tarifa a 0 = o preço entra pelos atalhos das Tarifas."
      >
        {podeEditar && (
          <Button onClick={() => setModal({ ...VAZIO })}>
            <Plus className="size-4" aria-hidden /> Novo Técnico
          </Button>
        )}
      </Cabeca>

      <Card className="card-sombra py-4">
        <CardContent className="px-4">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Pesquisar técnico..."
            className="max-w-sm"
          />
        </CardContent>
      </Card>

      <Card className="card-sombra py-4">
        <CardContent className="px-2 sm:px-4">
          {aCarregar ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar técnicos...
            </div>
          ) : falha ? (
            <div className="py-12 text-center text-sm text-destructive">{falha}</div>
          ) : lista.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhum técnico encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Nome</th>
                    <th className="px-3 py-2 text-right">Tarifa MZN</th>
                    <th className="px-3 py-2 text-right">Tarifa USD</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((t) => (
                    <tr key={t.id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-3 py-2.5 font-semibold">{t.nome}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtNum(Number(t.tarifa_mzn) || 0)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtNum(Number(t.tarifa_usd) || 0)}</td>
                      <td className="px-3 py-2.5">
                        {t.ativo !== false ? (
                          <Etiqueta cor="bg-sucesso-bg text-sucesso">Activo</Etiqueta>
                        ) : (
                          <Etiqueta cor="bg-muted text-muted-foreground">Inactivo</Etiqueta>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {podeEditar && (
                            <>
                              <Button
                                variant="outline"
                                size="icon"
                                title="Editar"
                                onClick={() =>
                                  setModal({
                                    id: t.id,
                                    nome: t.nome || "",
                                    tarifa_mzn: String(t.tarifa_mzn ?? 0),
                                    tarifa_usd: String(t.tarifa_usd ?? 0)
                                  })
                                }
                              >
                                <Pencil className="size-4" aria-hidden />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                title={t.ativo === false ? "Reactivar" : "Desactivar"}
                                onClick={() => alternarAtivo(t)}
                              >
                                <Power className="size-4" aria-hidden />
                              </Button>
                            </>
                          )}
                          {podeApagar && (
                            <Button
                              variant="outline"
                              size="icon"
                              title="Apagar"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => setAApagar(t)}
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

      <Modal aberto={!!modal} fechar={() => setModal(null)} titulo={modal?.id ? "Editar técnico" : "Novo técnico"}>
        {modal && (
          <div className="space-y-3">
            <Campo rotulo="Nome *">
              <Input value={modal.nome} onChange={(e) => setModal({ ...modal, nome: e.target.value })} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Tarifa MZN">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={modal.tarifa_mzn}
                  onChange={(e) => setModal({ ...modal, tarifa_mzn: e.target.value })}
                />
              </Campo>
              <Campo rotulo="Tarifa USD">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={modal.tarifa_usd}
                  onChange={(e) => setModal({ ...modal, tarifa_usd: e.target.value })}
                />
              </Campo>
            </div>
            <p className="text-xs text-muted-foreground">
              Tarifa maior que 0 preenche o valor unitário sozinha ao escolher o técnico no editor.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
              <Button onClick={gravar} disabled={aGravar}>
                {aGravar && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal aberto={!!aApagar} fechar={() => setAApagar(null)} titulo={`Apagar ${aApagar?.nome || ""}`}>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Se o técnico já tem linhas em documentos, o servidor recusa e sugere desactivar
            (as linhas antigas guardam o nome por cópia e ficam coerentes).
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setAApagar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={apagar}>Apagar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      {children}
    </div>
  );
}
