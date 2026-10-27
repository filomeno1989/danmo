/**
 * /aquisicao/configuracoes - Configurações (cliente).
 *
 * Migração das configuracoes.html do hub (3 abas: Fornecedores,
 * Denominações e Numeração), com melhorias:
 * - o servidor RECUSA apagar fornecedor/denominação que já tem pedidos
 *   (no hub a trava era só no navegador);
 * - a numeração mostra a AMBAS as fontes (contador e último gravado) e
 *   avisa de qual das duas manda, para ninguém se surpreender.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { numeroFmt, type ContadorAq, type DenominacaoAq, type FornecedorAq } from "@/lib/aquisicao";

type Aba = "fornecedores" | "denominacoes" | "numeracao";

const ABAS: { id: Aba; label: string }[] = [
  { id: "fornecedores", label: "Fornecedores" },
  { id: "denominacoes", label: "Denominações" },
  { id: "numeracao", label: "Numeração" }
];

const VAZIO_FORN = { id: "", nome: "", contacto: "", morada: "", nuit: "", observacao: "" };

export function ConfiguracoesClient({ podeMexer, podeApagar }: { podeMexer: boolean; podeApagar: boolean }) {
  const [aba, setAba] = useState<Aba>("fornecedores");

  const [fornecedores, setFornecedores] = useState<FornecedorAq[]>([]);
  const [usoFornecedores, setUsoFornecedores] = useState<Record<string, number>>({});
  const [denominacoes, setDenominacoes] = useState<DenominacaoAq[]>([]);
  const [usoDenominacoes, setUsoDenominacoes] = useState<Record<string, number>>({});
  const [contadores, setContadores] = useState<ContadorAq[]>([]);
  const [ultimoPorAno, setUltimoPorAno] = useState<Record<number, number>>({});

  const [aCarregar, setACarregar] = useState(true);
  const [falha, setFalha] = useState("");

  const [modalForn, setModalForn] = useState<typeof VAZIO_FORN | null>(null);
  const [modalDenom, setModalDenom] = useState<{ id: string; nome: string; ordem: number } | null>(null);

  const [nAno, setNAno] = useState(String(new Date().getFullYear()));
  const [nProximo, setNProximo] = useState("");

  /* Carga inicial: setters só em callbacks (regra react-hooks), como nas
     restantes páginas do portal; `carregar` fica para refrescar depois
     de gravações e apagamentos. */
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [f, d, p, c] = await Promise.all([
          pedir<{ fornecedores: FornecedorAq[] }>("/api/aquisicao/fornecedores"),
          pedir<{ denominacoes: DenominacaoAq[] }>("/api/aquisicao/denominacoes"),
          pedir<{ pedidos: { id: string; fornecedor_id: string; tipo_documento: string }[] }>("/api/aquisicao/pedidos"),
          pedir<{ contadores: ContadorAq[]; ultimoPorAno: Record<number, number> }>("/api/aquisicao/contadores")
        ]);
        if (!vivo) return;
        setFornecedores(f.fornecedores || []);
        setDenominacoes(d.denominacoes || []);
        setContadores(c.contadores || []);
        setUltimoPorAno(c.ultimoPorAno || {});
        const uf: Record<string, number> = {};
        const ud: Record<string, number> = {};
        for (const x of p.pedidos || []) {
          uf[x.fornecedor_id] = (uf[x.fornecedor_id] || 0) + 1;
          ud[x.tipo_documento] = (ud[x.tipo_documento] || 0) + 1;
        }
        setUsoFornecedores(uf);
        setUsoDenominacoes(ud);
      } catch (e) {
        if (vivo) setFalha((e as Error).message);
      } finally {
        if (vivo) setACarregar(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  /** Refrescamento silencioso depois de gravar/apagar (fora de efeitos). */
  const carregar = useCallback(async () => {
    try {
      const [f, d, p, c] = await Promise.all([
        pedir<{ fornecedores: FornecedorAq[] }>("/api/aquisicao/fornecedores"),
        pedir<{ denominacoes: DenominacaoAq[] }>("/api/aquisicao/denominacoes"),
        pedir<{ pedidos: { id: string; fornecedor_id: string; tipo_documento: string }[] }>("/api/aquisicao/pedidos"),
        pedir<{ contadores: ContadorAq[]; ultimoPorAno: Record<number, number> }>("/api/aquisicao/contadores")
      ]);
      setFornecedores(f.fornecedores || []);
      setDenominacoes(d.denominacoes || []);
      setContadores(c.contadores || []);
      setUltimoPorAno(c.ultimoPorAno || {});
      const uf: Record<string, number> = {};
      const ud: Record<string, number> = {};
      for (const x of p.pedidos || []) {
        uf[x.fornecedor_id] = (uf[x.fornecedor_id] || 0) + 1;
        ud[x.tipo_documento] = (ud[x.tipo_documento] || 0) + 1;
      }
      setUsoFornecedores(uf);
      setUsoDenominacoes(ud);
      setFalha("");
    } catch (e) {
      setFalha((e as Error).message);
    }
  }, []);

  /* ---------- Fornecedores ---------- */

  const gravarFornecedor = async () => {
    if (!modalForn) return;
    if (!modalForn.nome.trim()) {
      toast.error("Indica o nome do fornecedor.");
      return;
    }
    try {
      if (modalForn.id) {
        await enviar("/api/aquisicao/fornecedores", { id: modalForn.id, dados: modalForn }, "Fornecedor gravado.", "PATCH");
      } else {
        await enviar("/api/aquisicao/fornecedores", { accao: "criar", dados: modalForn }, "Fornecedor gravado.");
      }
      setModalForn(null);
      carregar();
    } catch {
      /* toast já saiu */
    }
  };

  const alternarFornecedor = async (f: FornecedorAq) => {
    try {
      await enviar("/api/aquisicao/fornecedores", { id: f.id, dados: { ativo: !f.ativo } }, undefined, "PATCH");
      toast.success(`Fornecedor ${f.ativo ? "arquivado" : "reactivado"}.`);
      carregar();
    } catch {
      /* toast já saiu */
    }
  };

  const apagarFornecedor = async (f: FornecedorAq) => {
    if (usoFornecedores[f.id]) {
      toast.error("Este fornecedor já tem pedidos associados. Arquiva-o em vez de apagar.");
      return;
    }
    try {
      await enviar(`/api/aquisicao/fornecedores?id=${f.id}`, null, "Fornecedor apagado.", "DELETE");
      carregar();
    } catch {
      /* toast já saiu */
    }
  };

  /* ---------- Denominações ---------- */

  const gravarDenominacao = async () => {
    if (!modalDenom) return;
    if (!modalDenom.nome.trim()) {
      toast.error("Indica o nome da denominação.");
      return;
    }
    try {
      if (modalDenom.id) {
        await enviar("/api/aquisicao/denominacoes", { id: modalDenom.id, dados: modalDenom }, "Denominação gravada.", "PATCH");
      } else {
        await enviar("/api/aquisicao/denominacoes", { accao: "criar", dados: modalDenom }, "Denominação gravada.");
      }
      setModalDenom(null);
      carregar();
    } catch {
      /* toast já saiu */
    }
  };

  const alternarDenominacao = async (d: DenominacaoAq) => {
    try {
      await enviar("/api/aquisicao/denominacoes", { id: d.id, dados: { ativo: !d.ativo } }, undefined, "PATCH");
      toast.success(`Denominação ${d.ativo ? "arquivada" : "reactivada"}.`);
      carregar();
    } catch {
      /* toast já saiu */
    }
  };

  const apagarDenominacao = async (d: DenominacaoAq) => {
    if (usoDenominacoes[d.nome]) {
      toast.error("Esta denominação já tem pedidos associados. Arquiva-a em vez de apagar.");
      return;
    }
    try {
      await enviar(`/api/aquisicao/denominacoes?id=${d.id}`, null, "Denominação apagada.", "DELETE");
      carregar();
    } catch {
      /* toast já saiu */
    }
  };

  /* ---------- Numeração ---------- */

  const gravarContador = async () => {
    const ano = Number(nAno);
    const proximo = Number(nProximo);
    if (!ano || !proximo || proximo < 1) {
      toast.error("Indica o ano e o próximo número (mínimo 1).");
      return;
    }
    try {
      await enviar("/api/aquisicao/contadores", { accao: "fixar", ano, proximo_numero: proximo }, `Próximo pedido de ${ano} passa a ser o nº ${String(proximo).padStart(3, "0")}.`);
      setNProximo("");
      carregar();
    } catch {
      /* toast já saiu */
    }
  };

  const anosNumeracao = [...new Set([...contadores.map((c) => c.ano), ...Object.keys(ultimoPorAno).map(Number)])].sort((a, b) => b - a);

  return (
    <div className="space-y-5">
      <Cabeca titulo="Configurações" subtitulo="Fornecedores, denominações e numeração usados nos pedidos de aquisição" />

      {falha ? (
        <Card className="border-destructive">
          <CardContent className="p-4 text-sm text-destructive">{falha}</CardContent>
        </Card>
      ) : null}

      <div className="flex gap-2 border-b">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`-mb-px border-b-[3px] px-4 py-2.5 text-sm font-semibold transition-colors ${
              aba === a.id
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setAba(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>

      {aCarregar ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar...
        </div>
      ) : null}

      {/* ---------- ABA FORNECEDORES ---------- */}
      {aba === "fornecedores" && !aCarregar ? (
        <Card className="card-sombra">
          <CardContent className="p-4">
            <div className="mb-3 flex justify-end">
              {podeMexer ? (
                <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setModalForn({ ...VAZIO_FORN })}>
                  <Plus className="size-4" aria-hidden /> Novo Fornecedor
                </Button>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">Contacto</th>
                    <th className="py-2 pr-3">NUIT</th>
                    <th className="py-2 pr-3 text-center">Nº Pedidos</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {fornecedores.length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum fornecedor encontrado.</td></tr>
                  ) : (
                    fornecedores.map((f) => (
                      <tr key={f.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{f.nome}</td>
                        <td className="py-2 pr-3">{f.contacto || "-"}</td>
                        <td className="py-2 pr-3">{f.nuit || "-"}</td>
                        <td className="py-2 pr-3 text-center">{usoFornecedores[f.id] || 0}</td>
                        <td className="py-2 pr-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${f.ativo ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                            {f.ativo ? "Activo" : "Arquivado"}
                          </span>
                        </td>
                        <td className="py-2">
                          {podeMexer ? (
                            <>
                              <button className="mr-3 inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-emerald-700 dark:text-blue-400" onClick={() => setModalForn({ id: f.id, nome: f.nome, contacto: f.contacto || "", morada: f.morada || "", nuit: f.nuit || "", observacao: f.observacao || "" })}>
                                <Pencil className="size-3.5" aria-hidden /> Editar
                              </button>
                              <button className="mr-3 font-semibold text-blue-600 hover:text-emerald-700 dark:text-blue-400" onClick={() => alternarFornecedor(f)}>
                                {f.ativo ? "Arquivar" : "Reactivar"}
                              </button>
                            </>
                          ) : null}
                          {podeApagar ? (
                            <button className="inline-flex items-center gap-1 font-semibold text-red-600 hover:opacity-80" onClick={() => apagarFornecedor(f)}>
                              <Trash2 className="size-3.5" aria-hidden /> Apagar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- ABA DENOMINAÇÕES ---------- */}
      {aba === "denominacoes" && !aCarregar ? (
        <Card className="card-sombra">
          <CardContent className="p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">Denominações Disponíveis</h2>
              {podeMexer ? (
                <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={() => setModalDenom({ id: "", nome: "", ordem: denominacoes.length + 1 })}>
                  <Plus className="size-4" aria-hidden /> Nova Denominação
                </Button>
              ) : null}
            </div>
            <p className="mb-3 text-sm text-muted-foreground">
              Ex: Cotação, Pro-forma, Venda a Dinheiro. Aparecem no formulário de Novo Pedido.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3 text-center">Nº Pedidos</th>
                    <th className="py-2 pr-3">Estado</th>
                    <th className="py-2">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {denominacoes.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Nenhuma denominação encontrada.</td></tr>
                  ) : (
                    denominacoes.map((d) => (
                      <tr key={d.id} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{d.nome}</td>
                        <td className="py-2 pr-3 text-center">{usoDenominacoes[d.nome] || 0}</td>
                        <td className="py-2 pr-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${d.ativo ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                            {d.ativo ? "Activa" : "Arquivada"}
                          </span>
                        </td>
                        <td className="py-2">
                          {podeMexer ? (
                            <>
                              <button className="mr-3 inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-emerald-700 dark:text-blue-400" onClick={() => setModalDenom({ id: d.id, nome: d.nome, ordem: d.ordem })}>
                                <Pencil className="size-3.5" aria-hidden /> Editar
                              </button>
                              <button className="mr-3 font-semibold text-blue-600 hover:text-emerald-700 dark:text-blue-400" onClick={() => alternarDenominacao(d)}>
                                {d.ativo ? "Arquivar" : "Reactivar"}
                              </button>
                            </>
                          ) : null}
                          {podeApagar ? (
                            <button className="inline-flex items-center gap-1 font-semibold text-red-600 hover:opacity-80" onClick={() => apagarDenominacao(d)}>
                              <Trash2 className="size-3.5" aria-hidden /> Apagar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- ABA NUMERAÇÃO ---------- */}
      {aba === "numeracao" && !aCarregar ? (
        <Card className="card-sombra">
          <CardContent className="p-4">
            <h2 className="text-base font-bold">Ajustar Numeração dos Pedidos</h2>
            <p className="mb-4 mt-1 max-w-2xl text-sm text-muted-foreground">
              Define o próximo número a atribuir em cada ano. Útil ao começar a usar o sistema
              (para continuar a partir dos pedidos já feitos em papel) ou para corrigir a numeração.
              O sistema nunca deixa repetir um número já usado: usa sempre o MAIOR valor entre o que
              aqui defines e o último pedido já gravado nesse ano.
            </p>
            {podeMexer ? (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="n-ano">Ano</Label>
                  <Input id="n-ano" type="number" min={2000} step={1} className="w-28" value={nAno} onChange={(e) => setNAno(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="n-proximo">Próximo Número a Atribuir</Label>
                  <Input id="n-proximo" type="number" min={1} step={1} className="w-40" value={nProximo} onChange={(e) => setNProximo(e.target.value)} />
                </div>
                <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={gravarContador}>Gravar</Button>
              </div>
            ) : null}
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Ano</th>
                    <th className="py-2 pr-3">Próximo Número Configurado</th>
                    <th className="py-2 pr-3">Último Pedido Gravado</th>
                    <th className="py-2">O que manda</th>
                  </tr>
                </thead>
                <tbody>
                  {anosNumeracao.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Ainda não há pedidos nem contadores configurados.</td></tr>
                  ) : (
                    anosNumeracao.map((ano) => {
                      const c = contadores.find((x) => x.ano === ano);
                      const ultimo = ultimoPorAno[ano];
                      const manda = Math.max(c?.proximo_numero || 1, (ultimo || 0) + 1);
                      return (
                        <tr key={ano} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-bold">{ano}</td>
                          <td className="py-2 pr-3">{c ? c.proximo_numero : <span className="text-muted-foreground">não definido</span>}</td>
                          <td className="py-2 pr-3">{ultimo ? String(ultimo).padStart(3, "0") : "-"}</td>
                          <td className="py-2 pr-3">
                            <span className="font-semibold">{String(manda).padStart(3, "0")}</span>
                            {c && manda > c.proximo_numero ? <span className="text-muted-foreground"> (pelo histórico)</span> : null}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- MODAL FORNECEDOR ---------- */}
      <Modal
        aberto={!!modalForn}
        fechar={() => setModalForn(null)}
        titulo={modalForn?.id ? "Editar Fornecedor" : "Novo Fornecedor"}
      >
        {modalForn ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="m-nome">Nome *</Label>
              <Input id="m-nome" value={modalForn.nome} onChange={(e) => setModalForn({ ...modalForn, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-contacto">Contacto</Label>
              <Input id="m-contacto" placeholder="Telefone / email" value={modalForn.contacto} onChange={(e) => setModalForn({ ...modalForn, contacto: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-morada">Morada</Label>
              <Input id="m-morada" value={modalForn.morada} onChange={(e) => setModalForn({ ...modalForn, morada: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-nuit">NUIT</Label>
              <Input id="m-nuit" value={modalForn.nuit} onChange={(e) => setModalForn({ ...modalForn, nuit: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-observacao">Observação</Label>
              <textarea
                id="m-observacao"
                className="min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-sm dark:bg-input/30"
                value={modalForn.observacao}
                onChange={(e) => setModalForn({ ...modalForn, observacao: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setModalForn(null)}>Cancelar</Button>
              <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={gravarFornecedor}>Gravar</Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ---------- MODAL DENOMINAÇÃO ---------- */}
      <Modal
        aberto={!!modalDenom}
        fechar={() => setModalDenom(null)}
        titulo={modalDenom?.id ? "Editar Denominação" : "Nova Denominação"}
      >
        {modalDenom ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-nome">Nome *</Label>
              <Input id="d-nome" placeholder="Ex: Venda a Dinheiro" value={modalDenom.nome} onChange={(e) => setModalDenom({ ...modalDenom, nome: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-ordem">Ordem de Exibição</Label>
              <Input id="d-ordem" type="number" min={0} step={1} value={modalDenom.ordem} onChange={(e) => setModalDenom({ ...modalDenom, ordem: Number(e.target.value) || 0 })} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setModalDenom(null)}>Cancelar</Button>
              <Button className="bg-emerald-700 hover:bg-emerald-800" onClick={gravarDenominacao}>Gravar</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
