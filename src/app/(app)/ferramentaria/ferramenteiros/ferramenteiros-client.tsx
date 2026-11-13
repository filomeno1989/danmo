/**
 * /ferramentaria/ferramenteiros (cliente).
 */

"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Pencil, Plus, PowerOff } from "lucide-react";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { SelecionarColaborador } from "@/components/oficina/selecionar-colaborador";
import { type ColaboradorFerr, type Ferramenteiro } from "@/lib/ferramentaria";

type Resposta = {
  ferramenteiros: Ferramenteiro[];
  emprestimosPorNome: Record<string, number>;
};

export function FerramenteirosClient() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [colaboradores, setColaboradores] = useState<ColaboradorFerr[]>([]);
  const [falha, setFalha] = useState("");

  const [modal, setModal] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const [gravando, setGravando] = useState(false);

  async function carregar() {
    const d = await pedir<Resposta>("/api/ferramentaria/cadastros");
    setDados(d);
  }

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<Resposta>("/api/ferramentaria/cadastros"),
      pedir<{ colaboradores: ColaboradorFerr[] }>("/api/ferramentaria/listas")
        .then((l) => l.colaboradores)
        .catch(() => [])
    ])
      .then(([d, cols]) => {
        if (vivo) {
          setDados(d);
          setColaboradores(cols);
        }
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  function abrirNovo() {
    setEditandoId(null);
    setNome("");
    setCodigo("");
    setModal(true);
  }

  function abrirEdicao(s: Ferramenteiro) {
    setEditandoId(s.id);
    setNome(s.nome || "");
    setCodigo(s.codigo || "");
    setModal(true);
  }

  async function guardar() {
    if (gravando) return;
    setGravando(true);
    try {
      if (editandoId) {
        await enviar(
          `/api/ferramentaria/cadastros?id=${encodeURIComponent(editandoId)}`,
          { nome, codigo: codigo || null },
          "Ferramenteiro actualizado.",
          "PATCH"
        );
      } else {
        await enviar("/api/ferramentaria/cadastros", { nome, codigo: codigo || null }, "Ferramenteiro registado.");
      }
      setModal(false);
      setEditandoId(null);
      await carregar();
    } catch {
      // toast veio do enviar
    } finally {
      setGravando(false);
    }
  }

  async function desactivar(s: Ferramenteiro) {
    if (
      !window.confirm(
        `Desactivar ${s.nome}? Ele deixa de aparecer nas opções de entrega e recepção; o histórico mantém-se.`
      )
    ) {
      return;
    }
    try {
      await enviar(
        `/api/ferramentaria/cadastros?id=${encodeURIComponent(s.id)}`,
        { active: false },
        "Ferramenteiro desactivado.",
        "PATCH"
      );
      await carregar();
    } catch {
      // toast veio do enviar
    }
  }

  if (falha) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {falha}
      </div>
    );
  }

  const activos = (dados?.ferramenteiros || []).filter((s) => s.active === true);

  return (
    <div className="space-y-5">
      <Cabeca titulo="Ferramenteiros" subtitulo="Quem entrega e recebe as ferramentas na casa">
        <button
          type="button"
          onClick={abrirNovo}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte"
        >
          <Plus className="size-4" aria-hidden />
          Novo ferramenteiro
        </button>
      </Cabeca>

      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Equipa activa</h2>
            <span className="rounded-full bg-primario/10 px-3 py-1 text-xs font-bold text-primario" data-count-staff>
              {dados ? activos.length : "-"}
            </span>
          </div>
          {!dados ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <LoaderCircle className="mr-1 inline size-4 animate-spin" /> A carregar...
            </p>
          ) : activos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum ferramenteiro activo. Regista o primeiro para poder entregar e receber ferramentas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Nome</th>
                    <th className="py-2 pr-3 font-medium">Código</th>
                    <th className="py-2 pr-3 font-medium">Empréstimos entregues</th>
                    <th className="py-2 font-medium">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {activos.map((s) => (
                    <tr key={s.id} className="border-b last:border-0" data-linha-staff={s.nome}>
                      <td className="py-2 pr-3 font-semibold">{s.nome}</td>
                      <td className="py-2 pr-3">{s.codigo || "-"}</td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-[0.68rem] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                          {dados?.emprestimosPorNome[s.nome] || 0} empréstimos
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEdicao(s)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primario hover:underline"
                          >
                            <Pencil className="size-3.5" aria-hidden />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => desactivar(s)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                          >
                            <PowerOff className="size-3.5" aria-hidden />
                            Desactivar
                          </button>
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
        aberto={modal}
        fechar={() => setModal(false)}
        titulo={editandoId ? "Editar Ferramenteiro" : "Novo Ferramenteiro"}
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-nome">
              Nome *
            </label>
            <SelecionarColaborador
              colaboradores={colaboradores}
              value={nome}
              onChange={setNome}
              id="m-nome"
              placeholder="Pesquisar por nome ou código, ou escrever à mão..."
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-codigo">
              Código
            </label>
            <input
              id="m-codigo"
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ex: DM0011"
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setModal(false)}
            className="border-input bg-background h-9 rounded-md border px-4 text-sm font-semibold hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={gravando}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
          >
            {gravando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Guardar
          </button>
        </div>
      </Modal>
    </div>
  );
}
