"use client";

/**
 * Configurações do Stock: as listas que alimentam os formulários do
 * módulo. O mesmo cartão serve as 7 listas (aba escolhida no topo):
 * Fornecedores, Departamentos, Finalidades, Categorias, Compradores,
 * Receptores e Unidades de medida.
 *
 * As unidades são a novidade sobre o hub: as 8 de sempre continuam lá
 * e agora se podem acrescentar mais (tabela unidades_medida). Enquanto
 * o SQL não correr, a página avisa e usa as 8 base.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, X } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { cn } from "@/lib/utils";
import { normalizar } from "@/lib/stock";
import type {
  CategoriaMaterial,
  Departamento,
  Fornecedor,
  Finalidade,
  Responsavel,
  UnidadeMedida
} from "@/lib/stock";

type DadosConfig = {
  ok: boolean;
  fornecedores: Fornecedor[];
  departamentos: Departamento[];
  finalidades: Finalidade[];
  categorias: CategoriaMaterial[];
  responsaveis: Responsavel[];
  unidades: UnidadeMedida[];
  unidadesOk: boolean;
};

type TipoAba =
  | "fornecedor"
  | "departamento"
  | "finalidade"
  | "categoria"
  | "comprador"
  | "receptor"
  | "unidade";

type Linha = {
  id: string;
  nome: string;
  contacto?: string | null;
  activo: boolean;
};

const ABAS: { tipo: TipoAba; label: string; dica: string }[] = [
  { tipo: "fornecedor", label: "Fornecedores", dica: "Quem vende à Danmo. O contacto fica a cargo de quem compra." },
  { tipo: "departamento", label: "Departamentos", dica: "Departamentos que pedem material ao armazém." },
  { tipo: "finalidade", label: "Finalidades", dica: "Motivos das saídas: Manutenção Corretiva, Obra, Consumo interno..." },
  { tipo: "categoria", label: "Categorias", dica: "Categorias do catálogo de materiais." },
  { tipo: "comprador", label: "Compradores", dica: "Quem foi comprar às entradas." },
  { tipo: "receptor", label: "Receptores", dica: "Quem recebe no armazém às entradas." },
  { tipo: "unidade", label: "Unidades", dica: "Unidades de medida do stock (Un, Kg, Lt...). Acrescenta aqui as que faltarem." }
];

const COR_INACTIVO = "bg-muted text-muted-foreground";
const COR_ACTIVO = "bg-sucesso-bg text-sucesso";

export function ConfigClient({ podeCriar, podeEditar }: { podeCriar: boolean; podeEditar: boolean }) {
  const [dados, setDados] = useState<DadosConfig | null>(null);
  const [falha, setFalha] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [aba, setAba] = useState<TipoAba>("fornecedor");
  const [aGravar, setAGravar] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [fNome, setFNome] = useState("");
  const [fContacto, setFContacto] = useState("");

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    pedir<DadosConfig>("/api/stock/config")
      .then(setDados)
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    // Primeira carga sem setState sincrono no efeito (regra react-hooks)
    let vivo = true;
    pedir<DadosConfig>("/api/stock/config")
      .then((d) => {
        if (vivo) setDados(d);
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

  const linhas: Linha[] = useMemo(() => {
    if (!dados) return [];
    const campo = (l: { ativo?: boolean; active?: boolean }) => (aba === "departamento" ? l.active !== false : l.ativo !== false);
    switch (aba) {
      case "fornecedor":
        return (dados.fornecedores || []).map((l) => ({ id: l.id, nome: l.nome, contacto: l.contacto, activo: campo(l) }));
      case "departamento":
        return (dados.departamentos || []).map((l) => ({ id: l.id, nome: l.nome, activo: campo(l) }));
      case "finalidade":
        return (dados.finalidades || []).map((l) => ({ id: l.id, nome: l.nome, activo: campo(l) }));
      case "categoria":
        return (dados.categorias || []).map((l) => ({ id: l.id, nome: l.nome, activo: campo(l) }));
      case "comprador":
        return (dados.responsaveis || [])
          .filter((l) => l.funcao === "comprador" || l.funcao === "ambos")
          .map((l) => ({ id: l.id, nome: l.nome, activo: campo(l) }));
      case "receptor":
        return (dados.responsaveis || [])
          .filter((l) => l.funcao === "receptor" || l.funcao === "ambos")
          .map((l) => ({ id: l.id, nome: l.nome, activo: campo(l) }));
      case "unidade":
        return (dados.unidades || []).map((l) => ({ id: l.id, nome: l.nome, activo: campo(l) }));
    }
  }, [dados, aba]);

  const dica = ABAS.find((a) => a.tipo === aba)?.dica || "";
  const podeNestaAba = podeCriar || podeEditar;

  function abrirNovo() {
    setEditId(null);
    setFNome("");
    setFContacto("");
  }

  function abrirEdicao(l: Linha) {
    setEditId(l.id);
    setFNome(l.nome);
    setFContacto(l.contacto || "");
  }

  async function gravar() {
    const nome = fNome.trim();
    if (!nome) {
      toast.error("Escreve o nome.");
      return;
    }
    const duplicada = linhas.find(
      (l) => normalizar(l.nome) === normalizar(nome) && l.id !== editId
    );
    if (duplicada) {
      toast.error(`Já existe "${duplicada.nome}" nesta lista.`);
      return;
    }
    setAGravar(true);
    try {
      await enviar(
        "/api/stock/config",
        { action: editId ? "editar" : "criar", tipo: aba, id: editId || undefined, nome, contacto: fContacto },
        editId ? "Registo actualizado." : "Registo criado."
      );
      abrirNovo();
      carregar();
    } catch {
      /* o enviar já avisa */
    } finally {
      setAGravar(false);
    }
  }

  async function alternar(l: Linha) {
    setAGravar(true);
    try {
      await enviar(
        "/api/stock/config",
        { action: "alternar", tipo: aba, id: l.id },
        l.activo ? `"${l.nome}" desactivado. Os registos já feitos mantêm-se.` : `"${l.nome}" activado.`
      );
      carregar();
    } catch {
      /* o enviar já avisa */
    } finally {
      setAGravar(false);
    }
  }

  const campo = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const rotulo = "mb-1 block text-xs font-medium text-muted-foreground";
  const temContacto = aba === "fornecedor";

  return (
    <div className="space-y-4">
      <Cabeca
        titulo="Stock - Configurações"
        subtitulo="As listas que alimentam materiais, entradas e saídas"
      />

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}
      {aCarregar && !dados && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar as configurações...
        </div>
      )}

      {dados && (
        <>
          {aba === "unidade" && !dados.unidadesOk && (
            <div className="card-sombra border border-ambar/30 bg-ambar-claro/40 p-4 text-sm text-ambar-texto">
              As unidades ainda usam as 8 do hub antigo (fica tudo a funcionar). Para poderes
              acrescentar unidades novas nesta lista, corre o ficheiro
              <span className="mx-1 font-mono font-semibold">sql/fase4-stock-unidades.sql</span>
              no Supabase (SQL Editor) e recarrega esta página.
            </div>
          )}

          <div className="card-sombra p-4">
            <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Listas de configuração">
              {ABAS.map((a) => {
                const n =
                  a.tipo === "fornecedor" ? dados.fornecedores?.length || 0
                  : a.tipo === "departamento" ? dados.departamentos?.length || 0
                  : a.tipo === "finalidade" ? dados.finalidades?.length || 0
                  : a.tipo === "categoria" ? dados.categorias?.length || 0
                  : a.tipo === "comprador"
                    ? (dados.responsaveis || []).filter((l) => l.funcao === "comprador" || l.funcao === "ambos").length
                  : a.tipo === "receptor"
                    ? (dados.responsaveis || []).filter((l) => l.funcao === "receptor" || l.funcao === "ambos").length
                  : dados.unidades?.length || 0;
                return (
                  <button
                    key={a.tipo}
                    role="tab"
                    aria-selected={aba === a.tipo}
                    onClick={() => {
                      setAba(a.tipo);
                      abrirNovo();
                    }}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      aba === a.tipo
                        ? "bg-primario text-white"
                        : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                    )}
                  >
                    {a.label} ({n})
                  </button>
                );
              })}
            </div>

            <p className="mb-3 text-xs text-muted-foreground">{dica}</p>

            {podeNestaAba && (
              <div className="mb-4 rounded-md border border-input p-3">
                <div className="mb-2 flex items-center justify-between text-sm font-semibold">
                  <span>{editId ? "Editar registo" : "Novo registo"}</span>
                  {editId && (
                    <button
                      onClick={abrirNovo}
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3.5" /> Cancelar edição
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className={rotulo}>Nome *</label>
                    <input
                      className={campo}
                      value={fNome}
                      placeholder={`ex.: ${aba === "unidade" ? "Pacote" : "Nome"}`}
                      onChange={(e) => setFNome(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && gravar()}
                    />
                  </div>
                  {temContacto && (
                    <div>
                      <label className={rotulo}>Contacto</label>
                      <input
                        className={campo}
                        value={fContacto}
                        placeholder="Telefone ou email"
                        onChange={(e) => setFContacto(e.target.value)}
                      />
                    </div>
                  )}
                  <div className="flex items-end">
                    <button
                      onClick={gravar}
                      disabled={aGravar}
                      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
                    >
                      {aGravar ? <Rodar className="size-4" /> : <Save className="size-4" />}
                      {editId ? "Actualizar" : "Guardar"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Nome</th>
                    {temContacto && <th className="px-2 py-2 font-medium">Contacto</th>}
                    <th className="px-2 py-2 font-medium">Estado</th>
                    {podeEditar && <th className="px-2 py-2 text-right font-medium">Acções</th>}
                  </tr>
                </thead>
                <tbody>
                  {linhas.length === 0 && (
                    <tr>
                      <td colSpan={temContacto ? 4 : 3} className="py-6 text-center text-muted-foreground">
                        A lista está vazia.
                      </td>
                    </tr>
                  )}
                  {linhas.map((l) => (
                    <tr key={l.id} className={cn("border-b last:border-0", !l.activo && "opacity-55")}>
                      <td className="px-2 py-1.5 font-semibold">
                        {l.nome}
                        {!l.activo && <span className="ml-1 text-xs font-normal">(inactivo)</span>}
                      </td>
                      {temContacto && <td className="px-2 py-1.5">{l.contacto || "-"}</td>}
                      <td className="px-2 py-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold",
                            l.activo ? COR_ACTIVO : COR_INACTIVO
                          )}
                        >
                          {l.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      {podeEditar && (
                        <td className="px-2 py-1.5 text-right">
                          <span className="inline-flex gap-1.5">
                            <button
                              onClick={() => abrirEdicao(l)}
                              className="rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => alternar(l)}
                              disabled={aGravar}
                              className={cn(
                                "rounded-md px-2 py-1 text-xs font-medium disabled:opacity-50",
                                l.activo
                                  ? "border border-input text-erro hover:bg-muted"
                                  : "bg-sucesso text-white hover:opacity-90"
                              )}
                            >
                              {l.activo ? "Desactivar" : "Activar"}
                            </button>
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
