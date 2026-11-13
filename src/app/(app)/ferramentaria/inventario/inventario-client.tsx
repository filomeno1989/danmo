/**
 * /ferramentaria/inventario (cliente).
 *
 * Pesquisa sem acentos por código/nome, filtros categoria e estado,
 * modal nova/editar (POST/PATCH) e modal histórico (GET movimentos com
 * ?tool_id=). Sem acentos: "chave" acha "Chave de Fenda", "CAV" acha
 * "cavilha".
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { History, LoaderCircle, Pencil, Plus } from "lucide-react";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { semAcentos } from "@/lib/uso-comum";
import {
  corEstadoFerramenta,
  ESTADOS_FERRAMENTA,
  fmtMTn,
  type Categoria,
  type Ferramenta,
  type MovimentoVisao
} from "@/lib/ferramentaria";

type RespostaFerramentas = {
  ok: boolean;
  ferramentas: Ferramenta[];
  categoriaNome: Record<string, string>;
};

type FormFerramenta = {
  code: string;
  nome: string;
  category_id: string;
  marca: string;
  estado: string;
  localizacao: string;
  quantidade: string;
  unidade: string;
  valor_unitario: string;
};

const FORM_VAZIO: FormFerramenta = {
  code: "",
  nome: "",
  category_id: "",
  marca: "",
  estado: "novo",
  localizacao: "",
  quantidade: "1",
  unidade: "unidade",
  valor_unitario: ""
};

export function InventarioClient() {
  const [dados, setDados] = useState<RespostaFerramentas | null>(null);
  const [falha, setFalha] = useState("");
  const [busca, setBusca] = useState("");
  const [catFiltro, setCatFiltro] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");

  const [modal, setModal] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [form, setForm] = useState<FormFerramenta>(FORM_VAZIO);
  const [gravando, setGravando] = useState(false);

  const [histId, setHistId] = useState<string | null>(null);
  const [histTitulo, setHistTitulo] = useState("");
  const [historico, setHistorico] = useState<MovimentoVisao[] | null>(null);

  async function carregar() {
    const d = await pedir<RespostaFerramentas>("/api/ferramentaria/ferramentas");
    setDados(d);
  }

  useEffect(() => {
    let vivo = true;
    pedir<RespostaFerramentas>("/api/ferramentaria/ferramentas")
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

  const categorias = useMemo<Categoria[]>(() => {
    if (!dados) return [];
    const nomes = new Map<string, string>();
    for (const [id, nome] of Object.entries(dados.categoriaNome)) nomes.set(id, nome);
    return [...nomes.entries()]
      .map(([id, nome]) => ({ id, nome, active: true }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dados]);

  const filtradas = useMemo(() => {
    if (!dados) return [];
    const q = semAcentos(busca.trim()).toLowerCase();
    return dados.ferramentas.filter((t) => {
      if (q) {
        const alvo = `${semAcentos(t.code).toLowerCase()} ${semAcentos(t.nome).toLowerCase()} ${semAcentos(t.marca || "").toLowerCase()}`;
        if (!alvo.includes(q)) return false;
      }
      if (catFiltro && t.category_id !== catFiltro) return false;
      if (estadoFiltro && (t.estado || "").toLowerCase() !== estadoFiltro) return false;
      return true;
    });
  }, [dados, busca, catFiltro, estadoFiltro]);

  function abrirNova() {
    setEditandoId(null);
    setForm(FORM_VAZIO);
    setModal(true);
  }

  function abrirEdicao(t: Ferramenta) {
    setEditandoId(t.id);
    setForm({
      code: t.code || "",
      nome: t.nome || "",
      category_id: t.category_id || "",
      marca: t.marca || "",
      estado: t.estado || "novo",
      localizacao: t.localizacao || "",
      quantidade: String(t.quantidade ?? 1),
      unidade: t.unidade || "unidade",
      valor_unitario: t.valor_unitario ? String(t.valor_unitario) : ""
    });
    setModal(true);
  }

  async function guardar() {
    if (gravando) return;
    setGravando(true);
    try {
      const corpo = {
        code: form.code,
        nome: form.nome,
        category_id: form.category_id,
        marca: form.marca || undefined,
        estado: form.estado,
        localizacao: form.localizacao || undefined,
        quantidade: Number(form.quantidade) || 1,
        unidade: form.unidade || "unidade",
        valor_unitario: Number(form.valor_unitario) || 0
      };
      if (editandoId) {
        await enviar(
          `/api/ferramentaria/ferramentas?id=${encodeURIComponent(editandoId)}`,
          corpo,
          "Ferramenta actualizada.",
          "PATCH"
        );
      } else {
        await enviar("/api/ferramentaria/ferramentas", corpo, "Ferramenta criada.");
      }
      setModal(false);
      setEditandoId(null);
      await carregar();
    } catch {
      // o toast veio do enviar
    } finally {
      setGravando(false);
    }
  }

  async function abrirHistorico(t: Ferramenta) {
    setHistId(t.id);
    setHistTitulo(`${t.code} - ${t.nome}`);
    setHistorico(null);
    try {
      const d = await pedir<{ movimentos: MovimentoVisao[] }>(
        `/api/ferramentaria/movimentos?tool_id=${encodeURIComponent(t.id)}`
      );
      setHistorico(d.movimentos);
    } catch (e: unknown) {
      setHistorico([]);
      toast.error(e instanceof Error ? e.message : "Erro ao carregar histórico.");
    }
  }

  if (falha) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {falha}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo="Inventário" subtitulo="Catálogo de ferramentas da casa">
        <button
          type="button"
          onClick={abrirNova}
          className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte"
        >
          <Plus className="size-4" aria-hidden />
          Nova ferramenta
        </button>
      </Cabeca>

      {/* Filtros */}
      <Card className="card-sombra">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="inv-busca">
              Pesquisar (código, nome, marca)
            </label>
            <input
              id="inv-busca"
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Ex: chave, CBL, Bosch..."
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="inv-cat">
              Categoria
            </label>
            <select
              id="inv-cat"
              value={catFiltro}
              onChange={(e) => setCatFiltro(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
            >
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="inv-estado">
              Estado
            </label>
            <select
              id="inv-estado"
              value={estadoFiltro}
              onChange={(e) => setEstadoFiltro(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
            >
              <option value="">Todos os estados</option>
              {ESTADOS_FERRAMENTA.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="card-sombra" data-inventario-tabela>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Ferramentas</h2>
            <span className="rounded-full bg-primario/10 px-3 py-1 text-xs font-bold text-primario" data-inventario-count>
              {filtradas.length}
            </span>
          </div>
          {!dados ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <LoaderCircle className="mr-1 inline size-4 animate-spin" /> A carregar inventário...
            </p>
          ) : filtradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma ferramenta encontrada com estes filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Código</th>
                    <th className="py-2 pr-3 font-medium">Nome</th>
                    <th className="py-2 pr-3 font-medium">Categoria</th>
                    <th className="py-2 pr-3 font-medium">Marca</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 pr-3 font-medium">Localização</th>
                    <th className="py-2 pr-3 font-medium">Qtd</th>
                    <th className="py-2 pr-3 font-medium">Valor unit.</th>
                    <th className="py-2 font-medium">Acções</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((t) => (
                    <tr key={t.id} className="border-b last:border-0" data-linha-ferramenta={t.code}>
                      <td className="py-2 pr-3 font-semibold">{t.code}</td>
                      <td className="py-2 pr-3">{t.nome}</td>
                      <td className="py-2 pr-3">{dados.categoriaNome[t.category_id || ""] || "-"}</td>
                      <td className="py-2 pr-3">{t.marca || "-"}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${corEstadoFerramenta(t.estado)}`}>
                          {t.estado || "-"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{t.localizacao || "-"}</td>
                      <td className="py-2 pr-3 tabular-nums">{t.quantidade ?? 1}</td>
                      <td className="py-2 pr-3 tabular-nums">{fmtMTn(t.valor_unitario || 0)}</td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => abrirEdicao(t)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primario hover:underline"
                          >
                            <Pencil className="size-3.5" aria-hidden />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirHistorico(t)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400"
                          >
                            <History className="size-3.5" aria-hidden />
                            Histórico
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

      {/* Modal nova/edição */}
      <Modal
        aberto={modal}
        fechar={() => setModal(false)}
        titulo={editandoId ? "Editar Ferramenta" : "Nova Ferramenta"}
        largura="max-w-2xl"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-code">
              Código *
            </label>
            <input
              id="m-code"
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              disabled={editandoId !== null}
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-nome">
              Nome *
            </label>
            <input
              id="m-nome"
              type="text"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-cat">
              Categoria *
            </label>
            <select
              id="m-cat"
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
            >
              <option value="">Seleccionar...</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-marca">
              Marca
            </label>
            <input
              id="m-marca"
              type="text"
              value={form.marca}
              onChange={(e) => setForm({ ...form, marca: e.target.value })}
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-estado">
              Estado
            </label>
            <select
              id="m-estado"
              value={form.estado}
              onChange={(e) => setForm({ ...form, estado: e.target.value })}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
            >
              {ESTADOS_FERRAMENTA.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-loc">
              Localização
            </label>
            <input
              id="m-loc"
              type="text"
              value={form.localizacao}
              onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-qtd">
              Quantidade *
            </label>
            <input
              id="m-qtd"
              type="number"
              min={1}
              value={form.quantidade}
              onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-unidade">
              Unidade
            </label>
            <input
              id="m-unidade"
              type="text"
              value={form.unidade}
              onChange={(e) => setForm({ ...form, unidade: e.target.value })}
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="m-valor">
              Valor unitário (MTn)
            </label>
            <input
              id="m-valor"
              type="number"
              min={0}
              step="0.01"
              value={form.valor_unitario}
              onChange={(e) => setForm({ ...form, valor_unitario: e.target.value })}
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

      {/* Modal histórico */}
      <Modal
        aberto={histId !== null}
        fechar={() => setHistId(null)}
        titulo={`Histórico - ${histTitulo}`}
        largura="max-w-3xl"
      >
        {!historico ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-1 inline size-4 animate-spin" /> A carregar...
          </p>
        ) : historico.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Esta ferramenta ainda não tem movimentos.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Tipo</th>
                  <th className="py-2 pr-3 font-medium">Colaborador</th>
                  <th className="py-2 pr-3 font-medium">Por</th>
                  <th className="py-2 pr-3 font-medium">Data</th>
                  <th className="py-2 pr-3 font-medium">Estado</th>
                  <th className="py-2 font-medium">Observações</th>
                </tr>
              </thead>
              <tbody>
                {historico.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">
                      <span
                        className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${
                          m.tipo === "emprestimo"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                        }`}
                      >
                        {m.tipo}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{m.colaborador || "-"}</td>
                    <td className="py-2 pr-3">
                      {m.tipo === "emprestimo" ? m.entregue_por || "-" : m.recebido_por || m.entregue_por || "-"}
                    </td>
                    <td className="py-2 pr-3">
                      {(m.tipo === "emprestimo" ? m.data_saida : m.data_devolucao)?.slice(0, 10) || "-"}
                    </td>
                    <td className="py-2 pr-3">
                      {m.tipo === "emprestimo" ? m.estado_ao_sair || "-" : m.estado_ao_voltar || "-"}
                    </td>
                    <td className="max-w-40 truncate py-2" title={m.observacoes_devolucao || m.observacoes_saida || ""}>
                      {m.observacoes_devolucao || m.observacoes_saida || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
