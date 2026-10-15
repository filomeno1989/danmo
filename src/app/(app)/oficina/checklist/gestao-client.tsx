"use client";

/**
 * GestaoChecklist - Gestão dos templates de checklist (client).
 *
 * Escolher categoria > escolher template > editar tudo: dados gerais,
 * secções (criar, renomear, apagar) e itens (número, descrição, ordem,
 * visível). Itens já respondidos em checklists preenchidos aparecem com
 * a contagem de usos e NÃO podem ser apagados (o servidor também
 * recusa): oculta-se em vez de apagar, para não perder histórico.
 */

import { useCallback, useEffect, useState } from "react";
import { Plus, RotateCcw, Save, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Cabeca, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import type {
  CategoriaEquip,
  ItemTemplate,
  SecaoTemplate,
  TemplateChecklist
} from "@/lib/oficina";

type Conteudo = {
  template: TemplateChecklist | null;
  secoes: SecaoTemplate[];
  itens: (ItemTemplate & { usos: number })[];
};

type Dados = {
  ok: boolean;
  categorias: CategoriaEquip[];
  templates: TemplateChecklist[];
  conteudo: Conteudo;
};

export function GestaoChecklist({
  podeCriar,
  podeEditar,
  podeApagar
}: {
  podeCriar: boolean;
  podeEditar: boolean;
  podeApagar: boolean;
}) {
  const [categoria, setCategoria] = useState("");
  const [inativos, setInativos] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(false);

  // campos do template
  const [tplNome, setTplNome] = useState("");
  const [tplRef, setTplRef] = useState("");
  const [tplTipo, setTplTipo] = useState("mecanica");
  const [tplHoras, setTplHoras] = useState("");
  const [tplLabel, setTplLabel] = useState("");
  const [tplAtivo, setTplAtivo] = useState(true);

  // Preenche os campos gerais com o template carregado (usado pela carga
  // inicial e pelo botão Actualizar - os setters são estáveis).
  const aplicarConteudo = useCallback((t?: TemplateChecklist | null) => {
    setTplNome(t?.nome || "");
    setTplRef(t?.ref_versao || "");
    setTplTipo(t?.tipo || "mecanica");
    setTplHoras(t?.intervalo_horas != null ? String(t.intervalo_horas) : "");
    setTplLabel(t?.intervalo_label || "");
    setTplAtivo(Boolean(t?.ativo));
  }, []);

  const [modalNovo, setModalNovo] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState("mecanica");
  const [novoHoras, setNovoHoras] = useState("");
  const [novoLabel, setNovoLabel] = useState("");
  const [novaRef, setNovaRef] = useState("Ref. 01");
  const [aCriar, setACriar] = useState(false);

  const [nomeNovaSecao, setNomeNovaSecao] = useState("");
  const [aGravarSecao, setAGravarSecao] = useState(false);

  // itens novos
  const [novosItens, setNovosItens] = useState<Record<number, { numero: string; descricao: string }>>({});

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro("");
    try {
      const params = new URLSearchParams();
      if (categoria) params.set("categoria", categoria);
      if (inativos) params.set("inativos", "1");
      if (templateId) params.set("templateId", templateId);
      const d = await pedir<Dados>(`/api/oficina/checklist-gestao?${params.toString()}`);
      setDados(d);
      aplicarConteudo(d.conteudo.template);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setACarregar(false);
    }
  }, [categoria, inativos, templateId, aplicarConteudo]);

  // Carga automática: categoria E template escolhidos (antes o conteúdo
  // só chegava pelo botão Actualizar: escolher um checklist no dropdown
  // não fazia NADA e a página parecia não funcionar).
  useEffect(() => {
    let vivo = true;
    const params = new URLSearchParams();
    if (categoria) params.set("categoria", categoria);
    if (inativos) params.set("inativos", "1");
    if (templateId) params.set("templateId", templateId);
    const url = `/api/oficina/checklist-gestao?${params.toString()}`;
    fetch(url, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok || d?.ok === false) throw new Error(d?.erro || "Falha ao carregar");
        setDados(d);
        aplicarConteudo(d.conteudo?.template);
        setErro("");
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Erro inesperado");
      })
      .finally(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, [categoria, inativos, templateId, aplicarConteudo]);

  async function criarTemplate() {
    if (aCriar) return;
    setACriar(true);
    try {
      const r = await enviar<{ ok: boolean; id: number }>(
        "/api/oficina/checklist-gestao",
        {
          action: "criar-template",
          categoria_equipamento: categoria,
          nome: novoNome,
          tipo: novoTipo,
          intervalo_horas: novoHoras ? Number(novoHoras) : null,
          intervalo_label: novoLabel,
          ref_versao: novaRef
        },
        "Checklist criado."
      );
      setModalNovo(false);
      setNovoNome("");
      setNovoHoras("");
      setNovoLabel("");
      setNovaRef("Ref. 01");
      setTemplateId(String(r.id));
      await carregar();
    } catch {
      // aviso já mostrado
    } finally {
      setACriar(false);
    }
  }

  async function guardarTemplate() {
    try {
      await enviar(
        "/api/oficina/checklist-gestao",
        {
          action: "guardar-template",
          id: Number(templateId),
          nome: tplNome,
          ref_versao: tplRef,
          tipo: tplTipo,
          intervalo_horas: tplHoras ? Number(tplHoras) : null,
          intervalo_label: tplLabel,
          ativo: tplAtivo
        },
        "Dados do checklist guardados."
      );
      await carregar();
    } catch {
      // aviso já mostrado
    }
  }

  async function criarSecao() {
    if (!nomeNovaSecao.trim()) {
      return;
    }
    if (aGravarSecao) return;
    setAGravarSecao(true);
    try {
      await enviar(
        "/api/oficina/checklist-gestao",
        {
          action: "criar-secao",
          templateId: Number(templateId),
          nome_secao: nomeNovaSecao
        },
        "Secção criada."
      );
      setNomeNovaSecao("");
      await carregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravarSecao(false);
    }
  }

  async function renomearSecao(secaoId: number, nome: string) {
    if (!nome.trim()) return;
    try {
      await enviar(
        "/api/oficina/checklist-gestao",
        { action: "renomear-secao", secaoId, nome_secao: nome },
        "Nome da secção actualizado."
      );
      await carregar();
    } catch {
      // aviso já mostrado
    }
  }

  async function apagarSecao(secaoId: number) {
    const ok = window.confirm("Apagar esta secção e todos os seus itens? Esta acção não pode ser desfeita.");
    if (!ok) return;
    try {
      await enviar("/api/oficina/checklist-gestao", { action: "apagar-secao", secaoId }, "Secção apagada.");
      await carregar();
    } catch {
      // aviso já mostrado
    }
  }

  async function guardarItem(item: ItemTemplate & { usos: number }, linha: LinhaItem) {
    try {
      await enviar(
        "/api/oficina/checklist-gestao",
        {
          action: "guardar-item",
          itemId: item.id,
          numero_item: linha.numero ? Number(linha.numero) : null,
          descricao: linha.descricao,
          ordem: item.ordem
        },
        "Item actualizado."
      );
      await carregar();
    } catch {
      // aviso já mostrado
    }
  }

  async function apagarItem(itemId: number, usos: number) {
    if (usos > 0) {
      window.alert(
        `Este item já foi respondido em ${usos} checklist(s). Não pode ser apagado para proteger o histórico.`
      );
      return;
    }
    const ok = window.confirm("Apagar este item definitivamente?");
    if (!ok) return;
    try {
      await enviar("/api/oficina/checklist-gestao", { action: "apagar-item", itemId }, "Item apagado.");
      await carregar();
    } catch {
      // aviso já mostrado
    }
  }

  async function adicionarItem(secaoId: number) {
    const novo = novosItens[secaoId];
    if (!novo?.descricao.trim()) {
      window.alert("Escreve a descrição do item.");
      return;
    }
    try {
      await enviar(
        "/api/oficina/checklist-gestao",
        {
          action: "adicionar-item",
          secaoIdNovoItem: secaoId,
          numero_item: novo.numero ? Number(novo.numero) : null,
          descricao: novo.descricao
        },
        "Item adicionado."
      );
      setNovosItens((atual) => ({ ...atual, [secaoId]: { numero: "", descricao: "" } }));
      await carregar();
    } catch {
      // aviso já mostrado
    }
  }

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Checklist de Manutenção - Gestão"
        subtitulo="Templates por categoria de equipamento: secções, itens e revisões."
      >
        <Button variant="outline" size="sm" onClick={carregar} disabled={aCarregar}>
          {aCarregar ? <Rodar /> : <RotateCcw aria-hidden />}
          Actualizar
        </Button>
        {podeCriar && categoria && (
          <Button size="sm" onClick={() => setModalNovo(true)}>
            <Plus aria-hidden />
            Novo Checklist
          </Button>
        )}
      </Cabeca>

      {erro && (
        <Card className="border-erro/40">
          <CardContent className="flex items-center gap-2 text-sm text-erro">
            <TriangleAlert className="size-4" aria-hidden />
            {erro}
          </CardContent>
        </Card>
      )}

      {/* Escolhas */}
      <Card className="card-sombra">
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ck-cat">Categoria de Equipamento</Label>
            <select
              id="ck-cat"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={categoria}
              onChange={(e) => {
                setCategoria(e.target.value);
                setTemplateId("");
              }}
            >
              <option value="">- Selecionar -</option>
              {(dados?.categorias || []).map((c) => (
                <option key={c.id} value={c.nome}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ck-tpl">Checklist</Label>
            <select
              id="ck-tpl"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={!categoria}
            >
              <option value="">- Selecionar -</option>
              {(dados?.templates || []).map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.nome} ({t.intervalo_label || t.tipo})
                  {!t.ativo ? " - OCULTO" : ""}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <input
                type="checkbox"
                className="size-3.5 accent-[var(--primario)]"
                checked={inativos}
                onChange={(e) => setInativos(e.target.checked)}
              />
              Mostrar checklists ocultos
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Conteúdo do template */}
      {dados?.conteudo.template && (
        <Card className="card-sombra">
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input value={tplNome} onChange={(e) => setTplNome(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Ref. / Versão</Label>
                <Input value={tplRef} onChange={(e) => setTplRef(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <select
                  className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                  value={tplTipo}
                  onChange={(e) => setTplTipo(e.target.value)}
                >
                  <option value="mecanica">Mecânica</option>
                  <option value="eletrica">Eléctrica</option>
                  <option value="diario">Diário</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Intervalo (horas)</Label>
                <Input type="number" value={tplHoras} onChange={(e) => setTplHoras(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Intervalo (texto)</Label>
                <Input value={tplLabel} onChange={(e) => setTplLabel(e.target.value)} placeholder="Ex: 250 horas" />
              </div>
              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 text-sm font-normal">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--primario)]"
                    checked={tplAtivo}
                    onChange={(e) => setTplAtivo(e.target.checked)}
                  />
                  Visível para iniciar obras
                </label>
              </div>
            </div>
            {podeEditar && (
              <div className="flex justify-end">
                <Button size="sm" onClick={guardarTemplate}>
                  <Save aria-hidden /> Guardar Dados
                </Button>
              </div>
            )}

            {/* Secções */}
            <div className="space-y-4 border-t pt-4">
              {dados.conteudo.secoes.length === 0 && (
                <p className="text-sm text-muted-foreground">Sem secções. Cria a primeira abaixo.</p>
              )}
              {dados.conteudo.secoes.map((sec) => {
                const itensSecao = dados.conteudo.itens.filter((i) => i.secao_id === sec.id);
                const novo = novosItens[sec.id] || { numero: "", descricao: "" };
                return (
                  <div key={sec.id} className="rounded-xl border">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                      <Input
                        className="h-8 max-w-64"
                        defaultValue={sec.nome_secao}
                        onBlur={(e) => {
                          if (e.target.value.trim() && e.target.value.trim() !== sec.nome_secao) {
                            void renomearSecao(sec.id, e.target.value.trim());
                          }
                        }}
                        aria-label="Nome da secção"
                      />
                      {podeApagar && (
                        <Button size="sm" variant="ghost" className="text-erro hover:text-erro" onClick={() => apagarSecao(sec.id)}>
                          <Trash2 aria-hidden /> Apagar Secção
                        </Button>
                      )}
                    </div>

                    <div className="divide-y">
                      {itensSecao.map((it) => (
                        <LinhaItemComponente
                          key={it.id}
                          item={it}
                          podeEditar={podeEditar}
                          podeApagar={podeApagar}
                          onGuardar={guardarItem}
                          onApagar={apagarItem}
                        />
                      ))}
                    </div>

                    {podeCriar && (
                      <div className="flex flex-wrap items-end gap-2 border-t px-3 py-2">
                        <Input
                          type="number"
                          className="h-8 w-16"
                          placeholder="Nº"
                          value={novo.numero}
                          onChange={(e) =>
                            setNovosItens((atual) => ({ ...atual, [sec.id]: { ...novo, numero: e.target.value } }))
                          }
                          aria-label="Número do novo item"
                        />
                        <Input
                          className="h-8 flex-1"
                          placeholder="Descrição do novo item..."
                          value={novo.descricao}
                          onChange={(e) =>
                            setNovosItens((atual) => ({ ...atual, [sec.id]: { ...novo, descricao: e.target.value } }))
                          }
                        />
                        <Button size="sm" variant="outline" onClick={() => adicionarItem(sec.id)}>
                          <Plus aria-hidden /> Adicionar Item
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}

              {podeCriar && (
                <div className="flex items-end gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="nova-secao">Nova secção</Label>
                    <Input
                      id="nova-secao"
                      value={nomeNovaSecao}
                      onChange={(e) => setNomeNovaSecao(e.target.value)}
                      placeholder="Ex: Motor, Hidráulica, Travagens..."
                    />
                  </div>
                  <Button onClick={criarSecao} disabled={aGravarSecao || !templateId}>
                    {aGravarSecao && <Rodar />}
                    <Plus aria-hidden /> Criar Secção
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal novo template */}
      <Modal
        aberto={modalNovo}
        fechar={() => setModalNovo(false)}
        titulo="Novo Checklist"
        subtitulo={`Categoria: ${categoria}`}
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome do Checklist *</Label>
            <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: MM RS 250h" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <select
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={novoTipo}
                onChange={(e) => setNovoTipo(e.target.value)}
              >
                <option value="mecanica">Mecânica</option>
                <option value="eletrica">Eléctrica</option>
                <option value="diario">Diário</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Ref. / Versão</Label>
              <Input value={novaRef} onChange={(e) => setNovaRef(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Intervalo (horas)</Label>
              <Input type="number" value={novoHoras} onChange={(e) => setNovoHoras(e.target.value)} placeholder="Ex: 250" />
            </div>
            <div className="space-y-1.5">
              <Label>Intervalo (texto)</Label>
              <Input value={novoLabel} onChange={(e) => setNovoLabel(e.target.value)} placeholder="Ex: 250 horas" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalNovo(false)}>
              Cancelar
            </Button>
            <Button onClick={criarTemplate} disabled={aCriar}>
              {aCriar && <Rodar />}
              Criar Checklist
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* Linha editável de item (estado local por linha) */

type LinhaItem = { numero: string; descricao: string };

function LinhaItemComponente({
  item,
  podeEditar,
  podeApagar,
  onGuardar,
  onApagar
}: {
  item: ItemTemplate & { usos: number };
  podeEditar: boolean;
  podeApagar: boolean;
  onGuardar: (item: ItemTemplate & { usos: number }, linha: LinhaItem) => Promise<void>;
  onApagar: (itemId: number, usos: number) => Promise<void>;
}) {
  const [linha, setLinha] = useState<LinhaItem>({
    numero: item.numero_item != null ? String(item.numero_item) : "",
    descricao: item.descricao || ""
  });

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <Input
        type="number"
        className="h-8 w-16 shrink-0"
        value={linha.numero}
        onChange={(e) => setLinha({ ...linha, numero: e.target.value })}
        aria-label="Número do item"
      />
      <Input
        className="h-8 min-w-48 flex-1"
        value={linha.descricao}
        onChange={(e) => setLinha({ ...linha, descricao: e.target.value })}
        aria-label="Descrição do item"
      />
      {item.usos > 0 && (
        <span
          className="shrink-0 rounded-full bg-info-bg px-2 py-0.5 text-[0.68rem] font-semibold text-info"
          title={`Já respondido em ${item.usos} checklist(s)`}
        >
          {item.usos} uso(s)
        </span>
      )}
      {podeEditar && (
        <Button size="sm" variant="outline" className="h-8" onClick={() => onGuardar(item, linha)}>
          <Save aria-hidden /> Guardar
        </Button>
      )}
      {podeApagar && (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-erro hover:text-erro"
          onClick={() => onApagar(item.id, item.usos)}
        >
          <Trash2 aria-hidden /> Apagar
        </Button>
      )}
    </div>
  );
}
