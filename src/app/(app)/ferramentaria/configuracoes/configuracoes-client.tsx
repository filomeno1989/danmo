/**
 * /ferramentaria/configuracoes (cliente).
 */

"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, Pencil, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";

type Lista = { id: string; tipo: "categoria" | "departamento"; nome: string; active: boolean; count: number };

type Resposta = { categorias: Lista[]; departamentos: Lista[] };

type PropsTabela = {
  titulo: string;
  lista: Lista[];
  idPrefix: "cat" | "dep";
  aCarregar: boolean;
  aoNovo: (t: "categoria" | "departamento") => void;
  aoEditar: (t: "categoria" | "departamento", item: Lista) => void;
  aoAlternar: (t: "categoria" | "departamento", item: Lista) => void;
};

function TabelaListas({ titulo, lista, idPrefix, aCarregar, aoNovo, aoEditar, aoAlternar }: PropsTabela) {
  const t = idPrefix === "cat" ? "categoria" : "departamento";
  return (
    <Card className="card-sombra">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold">{titulo}</h2>
          <button
            type="button"
            onClick={() => aoNovo(t)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primario px-2.5 text-xs font-semibold text-white hover:bg-primario-forte"
          >
            <Plus className="size-3.5" aria-hidden />
            Novo
          </button>
        </div>
        {aCarregar ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-1 inline size-4 animate-spin" /> A carregar...
          </p>
        ) : lista.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Lista vazia.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Nome</th>
                  <th className="py-2 pr-3 font-medium">Em uso</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium">Acções</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((item) => (
                  <tr key={item.nome} className="border-b last:border-0" data-linha-config={`${idPrefix}-${item.nome}`}>
                    <td className="py-2 pr-3 font-semibold">{item.nome}</td>
                    <td className="py-2 pr-3">
                      <span className="inline-flex items-center whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-[0.68rem] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                        {item.count}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${
                          item.active
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {item.active ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => aoEditar(t, item)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-primario hover:underline"
                        >
                          <Pencil className="size-3.5" aria-hidden />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => aoAlternar(t, item)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                        >
                          <RefreshCw className="size-3.5" aria-hidden />
                          {item.active ? "Desactivar" : "Reactivar"}
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
  );
}

export function ConfiguracoesClient() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [falha, setFalha] = useState("");

  const [modal, setModal] = useState(false);
  const [tipo, setTipo] = useState<"categoria" | "departamento">("categoria");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [gravando, setGravando] = useState(false);

  async function carregar() {
    const d = await pedir<Resposta>("/api/ferramentaria/config");
    setDados(d);
  }

  useEffect(() => {
    let vivo = true;
    pedir<Resposta>("/api/ferramentaria/config")
      .then((d) => {
        if (vivo) setDados(d);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  function abrirNovo(t: "categoria" | "departamento") {
    setTipo(t);
    setEditandoId(null);
    setNome("");
    setModal(true);
  }

  function abrirEdicao(t: "categoria" | "departamento", item: Lista) {
    setTipo(t);
    setEditandoId(item.id);
    setNome(item.nome);
    setModal(true);
  }

  async function guardar() {
    if (gravando) return;
    setGravando(true);
    try {
      if (editandoId) {
        await enviar(
          `/api/ferramentaria/config?id=${encodeURIComponent(editandoId)}`,
          { tipo, nome },
          "Actualizado.",
          "PATCH"
        );
      } else {
        await enviar("/api/ferramentaria/config", { tipo, nome }, "Criado.");
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

  async function alternar(t: "categoria" | "departamento", item: Lista) {
    const msg = item.active
      ? `Desactivar "${item.nome}"? Deixa de aparecer nos formulários (os registos já criados mantêm-se).`
      : `Reactivar "${item.nome}"? Volta a aparecer nos formulários.`;
    if (!window.confirm(msg)) return;
    try {
      await enviar(
        `/api/ferramentaria/config?id=${encodeURIComponent(item.id)}`,
        { tipo: t, active: !item.active },
        item.active ? "Desactivado." : "Reactivado.",
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

  function Tabela({ titulo, lista, idPrefix }: { titulo: string; lista: Lista[]; idPrefix: string }) {
    const t = idPrefix === "cat" ? "categoria" : "departamento";
    return (
      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">{titulo}</h2>
            <button
              type="button"
              onClick={() => abrirNovo(t)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primario px-2.5 text-xs font-semibold text-white hover:bg-primario-forte"
            >
              <Plus className="size-3.5" aria-hidden />
              Novo
            </button>
          </div>
          {!dados ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              <LoaderCircle className="mr-1 inline size-4 animate-spin" /> A carregar...
            </p>
          ) : lista.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Lista vazia.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Nome</th>
                    <th className="py-2 pr-3 font-medium">Em uso</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((item) => (
                    <tr key={item.nome} className="border-b last:border-0" data-linha-config={`${idPrefix}-${item.nome}`}>
                      <td className="py-2 pr-3 font-semibold">{item.nome}</td>
                      <td className="py-2 pr-3">
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-sky-100 px-2 py-0.5 text-[0.68rem] font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                          {item.count}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${
                            item.active
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {item.active ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEdicao(t, item)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primario hover:underline"
                          >
                            <Pencil className="size-3.5" aria-hidden />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => alternar(t, item)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                          >
                            <RefreshCw className="size-3.5" aria-hidden />
                            {item.active ? "Desactivar" : "Reactivar"}
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
    );
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo="Configurações" subtitulo="Categorias de ferramenta e departamentos do módulo" />

      <div className="grid gap-4 lg:grid-cols-2">
        <TabelaListas
          titulo="Categorias de ferramenta"
          lista={dados?.categorias || []}
          idPrefix="cat"
          aCarregar={!dados}
          aoNovo={abrirNovo}
          aoEditar={abrirEdicao}
          aoAlternar={alternar}
        />
        <TabelaListas
          titulo="Departamentos"
          lista={dados?.departamentos || []}
          idPrefix="dep"
          aCarregar={!dados}
          aoNovo={abrirNovo}
          aoEditar={abrirEdicao}
          aoAlternar={alternar}
        />
      </div>

      <Modal
        aberto={modal}
        fechar={() => setModal(false)}
        titulo={`${editandoId ? "Editar" : "Novo"} ${tipo === "categoria" ? "Categoria" : "Departamento"}`}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="cfg-nome">
            Nome *
          </label>
          <input
            id="cfg-nome"
            type="text"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder={tipo === "categoria" ? "Ex: Elétricas" : "Ex: Máquinas e Ferramentas"}
            className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
          />
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
