"use client";

/**
 * TarifasClient - Tarifas (Standard, CdM...) que aparecem como atalhos
 * no editor para preencher o valor unitário das linhas de mão-de-obra.
 * As inactivas saem dos atalhos mas continuam na lista (reactiváveis).
 */

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Etiqueta, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmtNum } from "@/lib/faturacao";
import type { TarifaFat } from "@/lib/faturacao";

const VAZIO = { id: "", descricao: "", valor_mzn: "0" };

export function TarifasClient({
  podeEditar,
  podeApagar
}: {
  podeEditar: boolean;
  podeApagar: boolean;
}) {
  const [tarifas, setTarifas] = useState<TarifaFat[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [falha, setFalha] = useState("");
  const [modal, setModal] = useState<typeof VAZIO | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [aApagar, setAApagar] = useState<TarifaFat | null>(null);

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    pedir<{ tarifas: TarifaFat[] }>("/api/faturacao/tarifas")
      .then((d) => setTarifas(d.tarifas || []))
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    // Primeira carga sem setState sincrono no efeito (regra react-hooks)
    let vivo = true;
    pedir<{ tarifas: TarifaFat[] }>("/api/faturacao/tarifas")
      .then((d) => {
        if (vivo) setTarifas(d.tarifas || []);
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

  const gravar = async () => {
    if (!modal) return;
    if (!modal.descricao.trim()) {
      toast.error("Descrição obrigatória.");
      return;
    }
    setAGravar(true);
    try {
      const r = await fetch("/api/faturacao/tarifas", {
        method: modal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: modal.id || undefined,
          descricao: modal.descricao,
          valor_mzn: Number(modal.valor_mzn) || 0
        })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.erro || "Falha ao guardar.");
      toast.success(modal.id ? "Tarifa actualizada." : "Tarifa adicionada.");
      setModal(null);
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAGravar(false);
    }
  };

  const alternarAtivo = async (t: TarifaFat) => {
    try {
      const r = await fetch("/api/faturacao/tarifas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: t.id, descricao: t.descricao, valor_mzn: t.valor_mzn, ativo: t.ativo === false })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.erro || "Falha.");
      toast.success(t.ativo === false ? "Tarifa activa de novo." : "Tarifa desactivada.");
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const apagar = async () => {
    if (!aApagar) return;
    try {
      const r = await fetch(`/api/faturacao/tarifas?id=${encodeURIComponent(aApagar.id)}`, {
        method: "DELETE"
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.erro || "Falha ao apagar.");
      toast.success("Tarifa apagada.");
      setAApagar(null);
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Faturação - Tarifas"
        subtitulo="Atalhos de preço por hora que aparecem no editor, por baixo do valor unitário."
      >
        {podeEditar && (
          <Button onClick={() => setModal({ ...VAZIO })}>
            <Plus className="size-4" aria-hidden /> Nova Tarifa
          </Button>
        )}
      </Cabeca>

      <Card className="card-sombra py-4">
        <CardContent className="px-2 sm:px-4">
          {aCarregar ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar tarifas...
            </div>
          ) : falha ? (
            <div className="py-12 text-center text-sm text-destructive">{falha}</div>
          ) : tarifas.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma tarifa registada.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Descrição</th>
                    <th className="px-3 py-2 text-right">Valor MZN / hora</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {tarifas.map((t) => (
                    <tr key={t.id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-3 py-2.5 font-semibold">{t.descricao}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{fmtNum(Number(t.valor_mzn) || 0)}</td>
                      <td className="px-3 py-2.5">
                        {t.ativo !== false ? (
                          <Etiqueta cor="bg-sucesso-bg text-sucesso">Activa</Etiqueta>
                        ) : (
                          <Etiqueta cor="bg-muted text-muted-foreground">Inactiva</Etiqueta>
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
                                    descricao: t.descricao || "",
                                    valor_mzn: String(t.valor_mzn ?? 0)
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

      <Modal aberto={!!modal} fechar={() => setModal(null)} titulo={modal?.id ? "Editar tarifa" : "Nova tarifa"}>
        {modal && (
          <div className="space-y-3">
            <Campo rotulo="Descrição *">
              <Input
                value={modal.descricao}
                onChange={(e) => setModal({ ...modal, descricao: e.target.value })}
                placeholder="ex.: Standard, CdM, Feriado..."
              />
            </Campo>
            <Campo rotulo="Valor MZN / hora *">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={modal.valor_mzn}
                onChange={(e) => setModal({ ...modal, valor_mzn: e.target.value })}
              />
            </Campo>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setModal(null)}>Cancelar</Button>
              <Button onClick={gravar} disabled={aGravar}>
                {aGravar && <LoaderCircle className="size-4 animate-spin" aria-hidden />} Guardar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal aberto={!!aApagar} fechar={() => setAApagar(null)} titulo={`Apagar ${aApagar?.descricao || ""}`}>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            A tarifa sai da lista e dos atalhos do editor. As linhas de documentos já gravados
            guardam o valor por cópia e continuam correctas.
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
