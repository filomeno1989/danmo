"use client";

/**
 * Catálogo de materiais: formulário de criar/editar, posição de stock
 * calculada no servidor, alertas de mínimo e busca sem acentos.
 * O toggle Inactivas traz de volta os materiais desactivados (no hub
 * antigo desapareciam sem forma de voltar).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, Etiqueta, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import {
  COR_POSICAO,
  fmtNum,
  normalizar,
  rotuloMaterial,
  UNIDADES_BASE
} from "@/lib/stock";
import type { CategoriaMaterial, Material } from "@/lib/stock";

type Dados = {
  ok: boolean;
  materiais: Material[];
  categorias: CategoriaMaterial[];
  unidades: string[];
  posicoes: Record<string, number>;
};

type Form = {
  referencia: string;
  nome: string;
  categoria: string;
  unidade: string;
  stock_minimo: string;
  localizacao: string;
  preco_mzn: string;
};

const FORM_VAZIO: Form = {
  referencia: "",
  nome: "",
  categoria: "",
  unidade: "",
  stock_minimo: "",
  localizacao: "",
  preco_mzn: ""
};

export function MateriaisClient({ podeCriar, podeEditar }: { podeCriar: boolean; podeEditar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [verInactivas, setVerInactivas] = useState(false);
  const [aGravar, setAGravar] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(FORM_VAZIO);
  const [aDesactivar, setADesactivar] = useState<Material | null>(null);

  const carregar = useCallback(() => {
    setACarregar(true);
    setFalha("");
    pedir<Dados>("/api/stock/materiais")
      .then(setDados)
      .catch((e: Error) => setFalha(e.message))
      .finally(() => setACarregar(false));
  }, []);

  useEffect(() => {
    // Primeira carga sem setState sincrono no efeito (regra react-hooks)
    let vivo = true;
    pedir<Dados>("/api/stock/materiais")
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

  const unidades = dados?.unidades?.length ? dados.unidades : UNIDADES_BASE;
  const posicoes = dados?.posicoes || {};

  const lista = useMemo(() => {
    let l = dados?.materiais || [];
    if (!verInactivas) l = l.filter((m) => m.ativo !== false);
    if (filtroCat) l = l.filter((m) => m.categoria === filtroCat);
    const q = normalizar(busca);
    if (q) {
      l = l.filter(
        (m) => normalizar(m.referencia).includes(q) || normalizar(m.nome).includes(q)
      );
    }
    return l;
  }, [dados, verInactivas, filtroCat, busca]);

  const alertas = useMemo(() => {
    return (dados?.materiais || [])
      .filter((m) => m.ativo !== false)
      .map((m) => ({
        m,
        stock: posicoes[m.id] || 0,
        minimo: Number(m.stock_minimo) || 0
      }))
      .filter((x) => x.stock <= 0 || x.stock <= x.minimo);
  }, [dados, posicoes]);

  function abrirNovo() {
    setEditId(null);
    setForm({ ...FORM_VAZIO, unidade: unidades[0] || "" });
  }

  function abrirEdicao(m: Material) {
    setEditId(m.id);
    setForm({
      referencia: m.referencia || "",
      nome: m.nome || "",
      categoria: m.categoria || "",
      unidade: m.unidade || "",
      stock_minimo: m.stock_minimo !== null && m.stock_minimo !== undefined ? String(m.stock_minimo) : "",
      localizacao: m.localizacao || "",
      preco_mzn: m.preco_mzn !== null && m.preco_mzn !== undefined ? String(m.preco_mzn) : ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function gravar() {
    if (!form.referencia.trim() || !form.nome.trim() || !form.unidade) {
      toast.error("Referência, Nome e Unidade são obrigatórios.");
      return;
    }
    setAGravar(true);
    try {
      await enviar(
        "/api/stock/materiais",
        {
          action: editId ? "editar" : "criar",
          id: editId || undefined,
          referencia: form.referencia,
          nome: form.nome,
          categoria: form.categoria,
          unidade: form.unidade,
          stock_minimo: form.stock_minimo,
          localizacao: form.localizacao,
          preco_mzn: form.preco_mzn
        },
        editId ? "Material actualizado." : "Material criado."
      );
      setEditId(null);
      setForm(FORM_VAZIO);
      carregar();
    } catch {
      /* o enviar já avisa */
    } finally {
      setAGravar(false);
    }
  }

  async function desactivar() {
    if (!aDesactivar) return;
    setAGravar(true);
    try {
      await enviar(
        "/api/stock/materiais",
        { action: "desactivar", id: aDesactivar.id },
        "Material desactivado. Os registos já criados mantêm-se."
      );
      setADesactivar(null);
      carregar();
    } catch {
      /* o enviar já avisa */
    } finally {
      setAGravar(false);
    }
  }

  const campo =
    "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
  const rotulo = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <div className="space-y-4">
      <Cabeca
        titulo="Stock - Materiais"
        subtitulo="Catálogo, posição actual e alertas de stock mínimo"
      >
        {podeCriar && (
          <button
            onClick={abrirNovo}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte"
          >
            Novo Material
          </button>
        )}
      </Cabeca>

      {falha && (
        <div className="card-sombra border border-erro/30 bg-erro-bg p-4 text-sm text-erro">{falha}</div>
      )}
      {aCarregar && !dados && (
        <div className="card-sombra flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Rodar /> A carregar o catálogo...
        </div>
      )}

      {dados && (
        <>
          {(podeCriar || podeEditar) && (
            <div className="card-sombra p-4">
              <div className="mb-3 flex items-center justify-between text-sm font-semibold">
                <span>{editId ? "Editar material" : "Novo material"}</span>
                {editId && (
                  <button
                    onClick={() => {
                      setEditId(null);
                      setForm(FORM_VAZIO);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" /> Cancelar edição
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                <div>
                  <label className={rotulo}>Referência *</label>
                  <input
                    className={campo}
                    value={form.referencia}
                    placeholder="ex.: DAN_LUB_001"
                    onChange={(e) => setForm({ ...form, referencia: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className={rotulo}>Nome *</label>
                  <input
                    className={campo}
                    value={form.nome}
                    placeholder="ex.: Óleo DX3"
                    onChange={(e) => setForm({ ...form, nome: e.target.value })}
                  />
                </div>
                <div>
                  <label className={rotulo}>Categoria</label>
                  <select
                    className={campo}
                    value={form.categoria}
                    onChange={(e) => setForm({ ...form, categoria: e.target.value })}
                  >
                    <option value="">Sem categoria</option>
                    {(dados.categorias || []).map((c) => (
                      <option key={c.id} value={c.nome}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={rotulo}>Unidade *</label>
                  <select
                    className={campo}
                    value={form.unidade}
                    onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                  >
                    <option value="">Seleccione</option>
                    {unidades.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={rotulo}>Stock mínimo</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={campo}
                    value={form.stock_minimo}
                    onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
                  />
                </div>
                <div>
                  <label className={rotulo}>Preço unitário (MZN)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className={campo}
                    value={form.preco_mzn}
                    onChange={(e) => setForm({ ...form, preco_mzn: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className={rotulo}>Localização</label>
                  <input
                    className={campo}
                    value={form.localizacao}
                    placeholder="ex.: Armazém, Prateleira A2"
                    onChange={(e) => setForm({ ...form, localizacao: e.target.value })}
                  />
                </div>
              </div>
              <div className="mt-3">
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
          )}

          {alertas.length > 0 && (
            <div className="card-sombra border border-ambar/30 p-4">
              <div className="mb-2 text-sm font-semibold">Alertas de stock mínimo ({alertas.length})</div>
              <div className="divide-y">
                {alertas.map(({ m, stock, minimo }) => (
                  <div key={m.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                    <Etiqueta cor={COR_POSICAO[stock <= 0 ? "Esgotado" : "Stock Baixo"]}>
                      {stock <= 0 ? "Esgotado" : "Stock Baixo"}
                    </Etiqueta>
                    <span className="font-semibold">{m.referencia} - {m.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      Stock: {fmtNum(stock)} {m.unidade} · Mínimo: {fmtNum(minimo)} {m.unidade}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="card-sombra p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar referência ou nome..."
                  className="h-9 w-64 rounded-md border border-input bg-background pl-8 pr-2 text-sm"
                />
              </div>
              <select
                aria-label="Filtrar por categoria"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                value={filtroCat}
                onChange={(e) => setFiltroCat(e.target.value)}
              >
                <option value="">Todas as categorias</option>
                {(dados.categorias || []).map((c) => (
                  <option key={c.id} value={c.nome}>{c.nome}</option>
                ))}
              </select>
              <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <input
                  type="checkbox"
                  checked={verInactivas}
                  onChange={(e) => setVerInactivas(e.target.checked)}
                  className="size-3.5"
                />
                Mostrar inactivas
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-2 font-medium">Referência</th>
                    <th className="px-2 py-2 font-medium">Nome</th>
                    <th className="px-2 py-2 font-medium">Categoria</th>
                    <th className="px-2 py-2 text-right font-medium">Mínimo</th>
                    <th className="px-2 py-2 text-right font-medium">Stock</th>
                    <th className="px-2 py-2 font-medium">Estado</th>
                    <th className="px-2 py-2 font-medium">Localização</th>
                    {podeEditar && <th className="px-2 py-2 text-right font-medium">Acções</th>}
                  </tr>
                </thead>
                <tbody>
                  {lista.length === 0 && (
                    <tr>
                      <td colSpan={podeEditar ? 8 : 7} className="py-6 text-center text-muted-foreground">
                        Nenhum material encontrado.
                      </td>
                    </tr>
                  )}
                  {lista.map((m) => {
                    const stock = posicoes[m.id] || 0;
                    const estado =
                      stock <= 0 ? "Esgotado" : stock <= (Number(m.stock_minimo) || 0) ? "Stock Baixo" : "OK";
                    return (
                      <tr key={m.id} className={cn("border-b last:border-0", m.ativo === false && "opacity-55")}>
                        <td className="px-2 py-1.5 font-mono text-xs font-semibold text-ambar-texto">{m.referencia}</td>
                        <td className="px-2 py-1.5 font-semibold">
                          {m.nome}
                          {m.ativo === false && <span className="ml-1 text-xs font-normal">(inactiva)</span>}
                        </td>
                        <td className="px-2 py-1.5">{m.categoria || "-"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(Number(m.stock_minimo) || 0)}</td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right font-bold tabular-nums",
                            stock <= 0 ? "text-erro" : stock <= (Number(m.stock_minimo) || 0) ? "text-ambar-texto" : "text-sucesso"
                          )}
                        >
                          {fmtNum(stock)} {m.unidade}
                        </td>
                        <td className="px-2 py-1.5">
                          <Etiqueta cor={COR_POSICAO[estado]}>{estado}</Etiqueta>
                        </td>
                        <td className="px-2 py-1.5">{m.localizacao || "-"}</td>
                        {podeEditar && (
                          <td className="px-2 py-1.5 text-right">
                            <button
                              onClick={() => abrirEdicao(m)}
                              className="rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted"
                            >
                              Editar
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
        aberto={Boolean(aDesactivar)}
        fechar={() => setADesactivar(null)}
        titulo="Desactivar material"
        largura="max-w-md"
      >
        <p className="text-sm text-muted-foreground">
          Desactivar {aDesactivar ? rotuloMaterial(aDesactivar) : ""}? Deixa de aparecer nos
          formulários e nos relatórios; os registos já criados mantêm-se. Podes reactivá-lo
          com o toggle Mostrar inactivas.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => setADesactivar(null)}
            className="h-9 rounded-md border border-input px-3 text-sm font-medium hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            onClick={desactivar}
            disabled={aGravar}
            className="h-9 rounded-md bg-erro px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {aGravar ? <Rodar className="size-4" /> : "Desactivar"}
          </button>
        </div>
      </Modal>

    </div>
  );
}
