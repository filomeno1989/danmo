"use client";

/**
 * ClientesClient - Cadastro de clientes da Faturação.
 *
 * Melhorias sobre o hub antigo: busca sem acentos, toggle Inactivos
 * (no hub o cliente inactivo desaparecia para sempre) e a edição mostra
 * quantos documentos citam o nome (o documento guarda cópia dos dados).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Etiqueta, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ClienteFat, DocFaturacao } from "@/lib/faturacao";

type Resposta = { clientes: ClienteFat[]; documentos: DocFaturacao[] };

const VAZIO = { id: "", nome: "", morada: "", nuit: "", contacto: "" };

export function ClientesClient({
  podeEditar,
  podeApagar
}: {
  podeEditar: boolean;
  podeApagar: boolean;
}) {
  const [clientes, setClientes] = useState<ClienteFat[]>([]);
  const [docs, setDocs] = useState<DocFaturacao[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [falha, setFalha] = useState("");
  const [busca, setBusca] = useState("");
  const [verInactivos, setVerInactivos] = useState(true);
  const [modal, setModal] = useState<typeof VAZIO | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [aApagar, setAApagar] = useState<ClienteFat | null>(null);

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    pedir<Resposta>("/api/faturacao/documentos")
      .then((d) => {
        setClientes(d.clientes || []);
        setDocs(d.documentos || []);
      })
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    // Primeira carga sem setState sincrono no efeito (regra react-hooks)
    let vivo = true;
    pedir<Resposta>("/api/faturacao/documentos")
      .then((d) => {
        if (!vivo) return;
        setClientes(d.clientes || []);
        setDocs(d.documentos || []);
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

  const norm = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

  const lista = useMemo(() => {
    const q = norm(busca.trim());
    return clientes
      .filter((c) => (verInactivos ? true : c.ativo !== false))
      .filter((c) => !q || norm(c.nome || "").includes(q) || norm(c.morada || "").includes(q))
      .sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt"));
  }, [clientes, busca, verInactivos]);

  const docsDoCliente = (nome: string) =>
    docs.filter((d) => (d.cliente_nome || "").toLowerCase() === (nome || "").toLowerCase()).length;

  const gravar = async () => {
    if (!modal) return;
    if (!modal.nome.trim()) {
      toast.error("Nome obrigatório.");
      return;
    }
    setAGravar(true);
    try {
      const r = await fetch("/api/faturacao/clientes", {
        method: modal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(modal)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.ok === false) throw new Error(d.erro || "Falha ao guardar.");
      toast.success(modal.id ? "Cliente actualizado." : "Cliente adicionado.");
      setModal(null);
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAGravar(false);
    }
  };

  const apagar = async () => {
    if (!aApagar) return;
    try {
      await fetch(`/api/faturacao/clientes?id=${encodeURIComponent(aApagar.id)}`, { method: "DELETE" }).then(
        async (r) => {
          const d = await r.json().catch(() => ({}));
          if (!r.ok || d.ok === false) throw new Error(d.erro || "Falha ao apagar.");
        }
      );
      toast.success("Cliente apagado.");
      setAApagar(null);
      carregar();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Faturação - Clientes"
        subtitulo="Cadastro usado pelo editor; os documentos guardam uma cópia dos dados de cada vez."
      >
        {podeEditar && (
          <Button onClick={() => setModal({ ...VAZIO })}>
            <Plus className="size-4" aria-hidden /> Novo Cliente
          </Button>
        )}
      </Cabeca>

      <Card className="card-sombra py-4">
        <CardContent className="flex flex-wrap items-center gap-3 px-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar por nome ou morada..."
              className="pl-8"
            />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={verInactivos}
              onChange={(e) => setVerInactivos(e.target.checked)}
              className="size-4 accent-amber-600"
            />
            Mostrar inactivos
          </label>
        </CardContent>
      </Card>

      <Card className="card-sombra py-4">
        <CardContent className="px-2 sm:px-4">
          {aCarregar ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar clientes...
            </div>
          ) : falha ? (
            <div className="py-12 text-center text-sm text-destructive">{falha}</div>
          ) : lista.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-[0.7rem] uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-2">Nome / Empresa</th>
                    <th className="px-3 py-2">Morada</th>
                    <th className="px-3 py-2">NUIT</th>
                    <th className="px-3 py-2">Contacto</th>
                    <th className="px-3 py-2">Docs</th>
                    <th className="px-3 py-2">Estado</th>
                    <th className="px-3 py-2 text-right">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 hover:bg-muted/40">
                      <td className="px-3 py-2.5 font-semibold">{c.nome}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{c.morada || "-"}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{c.nuit || "-"}</td>
                      <td className="px-3 py-2.5">{c.contacto || "-"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{docsDoCliente(c.nome)}</td>
                      <td className="px-3 py-2.5">
                        {c.ativo !== false ? (
                          <Etiqueta cor="bg-sucesso-bg text-sucesso">Activo</Etiqueta>
                        ) : (
                          <Etiqueta cor="bg-muted text-muted-foreground">Inactivo</Etiqueta>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end gap-1">
                          {podeEditar && (
                            <Button
                              variant="outline"
                              size="icon"
                              title="Editar"
                              onClick={() =>
                                setModal({
                                  id: c.id,
                                  nome: c.nome || "",
                                  morada: c.morada || "",
                                  nuit: c.nuit || "",
                                  contacto: c.contacto || ""
                                })
                              }
                            >
                              <Pencil className="size-4" aria-hidden />
                            </Button>
                          )}
                          {podeApagar && (
                            <Button
                              variant="outline"
                              size="icon"
                              title="Apagar"
                              className="text-destructive hover:bg-destructive/10"
                              onClick={() => setAApagar(c)}
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

      <Modal
        aberto={!!modal}
        fechar={() => setModal(null)}
        titulo={modal?.id ? "Editar cliente" : "Novo cliente"}
      >
        {modal && (
          <div className="space-y-3">
            <Campo rotulo="Nome / Empresa *">
              <Input value={modal.nome} onChange={(e) => setModal({ ...modal, nome: e.target.value })} />
            </Campo>
            <Campo rotulo="Morada">
              <Input value={modal.morada} onChange={(e) => setModal({ ...modal, morada: e.target.value })} />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="NUIT">
                <Input value={modal.nuit} onChange={(e) => setModal({ ...modal, nuit: e.target.value })} />
              </Campo>
              <Campo rotulo="Contacto">
                <Input value={modal.contacto} onChange={(e) => setModal({ ...modal, contacto: e.target.value })} />
              </Campo>
            </div>
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
            Os documentos que citam este cliente guardam cópia dos dados e continuam a imprimir
            bem. O cadastro sai da lista. Em alternativa, desactiva-o (deixa de aparecer no editor).
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
