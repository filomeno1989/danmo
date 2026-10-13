"use client";

/**
 * PreencherChecklist - Preenchimento do checklist (client).
 *
 * Cada item: Sim/Não (o trabalho foi executado?) e Bom/Danificado
 * (estado encontrado), com observação opcional. Tudo grava logo ao
 * clicar (flash verde), como no hub. Nos templates "diario" não há
 * Sim/Não: só o estado. Progresso geral e por secção sempre visíveis.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cabeca, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { cn } from "@/lib/utils";
import type {
  ChecklistPreenchido,
  ColaboradorLinha,
  Equipamento,
  ItemPreenchido,
  ItemTemplate,
  OrdemServico,
  SecaoTemplate,
  TemplateChecklist
} from "@/lib/oficina";

type Dados = {
  ok: boolean;
  checklist: ChecklistPreenchido;
  template: TemplateChecklist | null;
  secoes: SecaoTemplate[];
  itensTemplate: ItemTemplate[];
  itensResp: ItemPreenchido[];
  os: OrdemServico | null;
  equip: Equipamento | null;
  colaboradores: ColaboradorLinha[];
};

export function PreencherChecklist({
  checklistId,
  podeEditar
}: {
  checklistId: number;
  podeEditar: boolean;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(true);
  const [flash, setFlash] = useState(false);

  // dados gerais (cabeçalho)
  const [dataRevisao, setDataRevisao] = useState("");
  const [horasTrabalho, setHorasTrabalho] = useState("");
  const [folha, setFolha] = useState("");
  const [executante, setExecutante] = useState("");
  const [encarregado, setEncarregado] = useState("");
  const [comentarios, setComentarios] = useState("");

  const carregar = useCallback(async () => {
    try {
      const d = await pedir<Dados>(`/api/oficina/checklist/${checklistId}`);
      setDados(d);
      setDataRevisao((d.checklist.data_revisao || "").slice(0, 10));
      setHorasTrabalho(
        d.checklist.horas_trabalho != null ? String(d.checklist.horas_trabalho) : ""
      );
      setFolha(d.checklist.folha_numero || "");
      setExecutante(d.checklist.executante || "");
      setEncarregado(d.checklist.encarregado || "");
      setComentarios(d.checklist.observacoes_gerais || "");
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setACarregar(false);
    }
  }, [checklistId]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/oficina/checklist/${checklistId}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok || d?.ok === false) throw new Error(d?.erro || "Falha ao carregar");
        setDados(d);
        setDataRevisao((d.checklist.data_revisao || "").slice(0, 10));
        setHorasTrabalho(
          d.checklist.horas_trabalho != null ? String(d.checklist.horas_trabalho) : ""
        );
        setFolha(d.checklist.folha_numero || "");
        setExecutante(d.checklist.executante || "");
        setEncarregado(d.checklist.encarregado || "");
        setComentarios(d.checklist.observacoes_gerais || "");
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
  }, [checklistId]);

  // Mapas de respostas por item do template
  const respostas = useMemo(() => {
    const m = new Map<number, ItemPreenchido>();
    (dados?.itensResp || []).forEach((r) => m.set(r.template_item_id, r));
    return m;
  }, [dados]);

  function mostrarFlash() {
    setFlash(true);
    setTimeout(() => setFlash(false), 1200);
  }

  async function responder(
    templateItemId: number,
    campo: "executado" | "estado" | "observacao",
    valor: string | null
  ) {
    if (!podeEditar) {
      toast.error("Não tens permissão para preencher o checklist.");
      return;
    }
    try {
      const corpo: Record<string, unknown> = { action: "responder-item", templateItemId };
      if (campo === "executado") corpo.executado = valor as "sim" | "nao" | null;
      if (campo === "estado") corpo.estado = valor as "bom" | "danificado" | null;
      if (campo === "observacao") corpo.observacao = valor;
      await enviar(`/api/oficina/checklist/${checklistId}`, corpo);
      // Actualiza localmente (sem recarregar tudo)
      setDados((atual) => {
        if (!atual) return atual;
        const nova = { ...atual };
        const existente = nova.itensResp.find((r) => r.template_item_id === templateItemId);
        if (existente) {
          nova.itensResp = nova.itensResp.map((r) =>
            r.template_item_id === templateItemId
              ? ({
                  ...r,
                  ...(campo === "executado" ? { executado: valor } : {}),
                  ...(campo === "estado" ? { estado: valor } : {}),
                  ...(campo === "observacao" ? { observacao: valor } : {})
                } as ItemPreenchido)
              : r
          );
        } else {
          nova.itensResp = [
            ...nova.itensResp,
            {
              id: Date.now(),
              checklist_id: checklistId,
              template_item_id: templateItemId,
              executado: campo === "executado" ? (valor as "sim" | "nao" | null) : null,
              estado: campo === "estado" ? (valor as "bom" | "danificado" | null) : null,
              observacao: campo === "observacao" ? valor : null
            } as ItemPreenchido
          ];
        }
        return nova;
      });
      mostrarFlash();
    } catch {
      // aviso já mostrado
    }
  }

  async function guardarCabecalho() {
    if (!podeEditar) {
      toast.error("Não tens permissão para preencher o checklist.");
      return;
    }
    try {
      await enviar(
        `/api/oficina/checklist/${checklistId}`,
        {
          action: "guardar-cabecalho",
          cabecalho: {
            data_revisao: dataRevisao || null,
            horas_trabalho: horasTrabalho ? Number(horasTrabalho) : null,
            folha_numero: folha,
            executante,
            encarregado,
            observacoes_gerais: comentarios
          }
        },
        "Dados guardados."
      );
    } catch {
      // aviso já mostrado
    }
  }

  if (aCarregar) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Rodar /> A carregar o checklist...
      </div>
    );
  }
  if (erro || !dados || !dados.template) {
    return (
      <Card className="mx-auto max-w-md border-erro/40">
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-erro">{erro || "Checklist não encontrado."}</p>
          <Button asChild variant="outline">
            <Link href="/oficina/ordens">
              <ArrowLeft aria-hidden /> Voltar às Ordens
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { template, secoes, itensTemplate, os, equip } = dados;
  const tipoDiario = template.tipo === "diario";

  const totalItens = itensTemplate.length;
  const feitos = itensTemplate.filter((it) => {
    const r = respostas.get(it.id);
    return r && (r.executado || r.estado);
  }).length;

  const secosComEstado = secoes.map((sec) => {
    const meus = itensTemplate.filter((it) => it.secao_id === sec.id);
    const feitosSecao = meus.filter((it) => {
      const r = respostas.get(it.id);
      return r && (r.executado || r.estado);
    }).length;
    return { sec, total: meus.length, feitos: feitosSecao };
  });

  return (
    <div className="relative space-y-5">
      <Cabeca titulo="Checklist de Manutenção" subtitulo={`${equip?.code || ""} - Obra ${os ? os.numero_obra || "S/Nº" : "-"}`}>
        <Button variant="outline" size="sm" asChild>
          <a href={os ? `/oficina/ordens/${os.id}` : "/oficina/ordens"}>
            <ArrowLeft aria-hidden />
            Voltar à Obra
          </a>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/imprimir/checklist/${checklistId}`, "_blank")}
        >
          <Printer aria-hidden />
          Imprimir
        </Button>
      </Cabeca>

      {/* Cabeçalho do checklist */}
      <Card className="card-sombra">
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold">{template.nome}</p>
              <p className="text-sm text-muted-foreground">
                {equip?.code || ""} - Obra {os ? os.numero_obra || "S/Nº" : "-"}
              </p>
            </div>
            <span className="rounded-full bg-ambar-claro px-2.5 py-1 text-xs font-bold text-ambar-texto">
              {template.ref_versao || "-"}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progresso do preenchimento</span>
              <span className="font-semibold tabular-nums">
                {feitos} / {totalItens} itens
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primario transition-all"
                style={{ width: totalItens ? `${(feitos / totalItens) * 100}%` : "0%" }}
              />
            </div>
            <p className="text-[0.7rem] text-muted-foreground">
              <span className="font-semibold text-sucesso">Sim / Não</span> - o item foi executado?{" "}
              <span className="ml-3 font-semibold text-ambar-texto dark:text-ambar">Bom / Danificado</span> - estado
              encontrado
            </p>
          </div>

          <div className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Nº Obra (da OS)</Label>
              <Input disabled value={checklistNumeroObra(dados)} />
            </div>
            <div className="space-y-1.5">
              <Label>Horas Equip. (da OS)</Label>
              <Input disabled value={dados.checklist.horas_equipamento != null ? `${dados.checklist.horas_equipamento} h` : "-"} />
            </div>
            <div className="space-y-1.5">
              <Label>Data da Revisão</Label>
              <Input
                type="date"
                disabled={!podeEditar}
                value={dataRevisao}
                onChange={(e) => setDataRevisao(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Horas de Trabalho</Label>
              <Input
                type="number"
                step="0.1"
                disabled={!podeEditar}
                value={horasTrabalho}
                onChange={(e) => setHorasTrabalho(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Folha Nº</Label>
              <Input disabled={!podeEditar} value={folha} onChange={(e) => setFolha(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Executante</Label>
              <select
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
                disabled={!podeEditar}
                value={executante}
                onChange={(e) => setExecutante(e.target.value)}
              >
                <option value="">- Selecionar -</option>
                {dados.colaboradores.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Encarregado</Label>
              <select
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
                disabled={!podeEditar}
                value={encarregado}
                onChange={(e) => setEncarregado(e.target.value)}
              >
                <option value="">- Selecionar -</option>
                {dados.colaboradores.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                    {c.code ? ` (${c.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              {podeEditar && (
                <Button size="sm" onClick={guardarCabecalho} className="w-full">
                  <Save aria-hidden /> Guardar Dados
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-1.5 border-t pt-4">
            <Label htmlFor="ck-comentarios">Comentários Adicionais</Label>
            <textarea
              id="ck-comentarios"
              rows={3}
              disabled={!podeEditar}
              className="border-input bg-transparent w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              placeholder="Observações gerais sobre a revisão, para colegas que não acompanharam o trabalho..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Secções e itens */}
      <div className="space-y-4">
        {secosComEstado.length === 0 && (
          <Card className="card-sombra">
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              Este checklist não tem itens.
            </CardContent>
          </Card>
        )}
        {secosComEstado.map(({ sec, total, feitos: feitosSecao }) => {
          const completa = feitosSecao === total && total > 0;
          return (
            <Card key={sec.id} className="card-sombra">
              <CardContent className="space-y-1">
                <div className="flex items-center justify-between gap-2 border-b pb-2">
                  <p className="font-semibold">{sec.nome_secao}</p>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[0.68rem] font-bold tabular-nums",
                      total === 0
                        ? "bg-muted text-muted-foreground"
                        : completa
                          ? "bg-sucesso-bg text-sucesso"
                          : feitosSecao > 0
                            ? "bg-ambar-claro text-ambar-texto"
                            : "bg-muted text-muted-foreground"
                    )}
                  >
                    {feitosSecao}/{total}
                  </span>
                </div>
                {itensTemplate
                  .filter((it) => it.secao_id === sec.id)
                  .map((it) => {
                    const r = respostas.get(it.id);
                    return (
                      <ItemChecklist
                        key={it.id}
                        item={it}
                        resposta={r}
                        tipoDiario={tipoDiario}
                        podeEditar={podeEditar}
                        onResponder={responder}
                      />
                    );
                  })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Flash de guardado */}
      <div
        className={cn(
          "pointer-events-none fixed left-1/2 top-16 z-50 -translate-x-1/2 rounded-full bg-sucesso px-4 py-1.5 text-sm font-bold text-white shadow-lg transition-all",
          flash ? "opacity-100" : "opacity-0"
        )}
      >
        Guardado
      </div>
    </div>
  );
}

function checklistNumeroObra(dados: Dados): string {
  return dados.checklist.numero_obra || "-";
}

function ItemChecklist({
  item,
  resposta,
  tipoDiario,
  podeEditar,
  onResponder
}: {
  item: ItemTemplate;
  resposta?: ItemPreenchido;
  tipoDiario: boolean;
  podeEditar: boolean;
  onResponder: (
    templateItemId: number,
    campo: "executado" | "estado" | "observacao",
    valor: string | null
  ) => Promise<void>;
}) {
  const [obsAberta, setObsAberta] = useState(Boolean(resposta?.observacao));
  const [obs, setObs] = useState(resposta?.observacao || "");

  return (
    <div className="flex flex-col gap-2 border-b py-2.5 last:border-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-40 flex-1 text-sm leading-snug">
          {item.numero_item != null && (
            <span className="mr-1.5 font-bold tabular-nums text-muted-foreground">{item.numero_item}.</span>
          )}
          {item.descricao}
        </p>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {!tipoDiario && (
            <div className="flex overflow-hidden rounded-md border">
              <BotaoToggle
                activo={resposta?.executado === "sim"}
                classeActiva="bg-sucesso text-white"
                onClick={() => onResponder(item.id, "executado", resposta?.executado === "sim" ? null : "sim")}
                podeEditar={podeEditar}
              >
                Sim
              </BotaoToggle>
              <BotaoToggle
                activo={resposta?.executado === "nao"}
                classeActiva="bg-erro text-white"
                onClick={() => onResponder(item.id, "executado", resposta?.executado === "nao" ? null : "nao")}
                podeEditar={podeEditar}
              >
                Não
              </BotaoToggle>
            </div>
          )}
          <div className="flex overflow-hidden rounded-md border">
            <BotaoToggle
              activo={resposta?.estado === "bom"}
              classeActiva="bg-sucesso text-white"
              onClick={() => onResponder(item.id, "estado", resposta?.estado === "bom" ? null : "bom")}
              podeEditar={podeEditar}
            >
              Bom
            </BotaoToggle>
            <BotaoToggle
              activo={resposta?.estado === "danificado"}
              classeActiva="bg-ambar text-white"
              onClick={() => onResponder(item.id, "estado", resposta?.estado === "danificado" ? null : "danificado")}
              podeEditar={podeEditar}
            >
              Danificado
            </BotaoToggle>
          </div>
          <button
            type="button"
            aria-label="Observação"
            title="Observação"
            className={cn(
              "rounded-md border px-2 py-1 text-xs font-semibold transition-colors",
              obsAberta || resposta?.observacao
                ? "border-primario bg-primario/10 text-primario"
                : "text-muted-foreground hover:bg-accent"
            )}
            onClick={() => setObsAberta((v) => !v)}
          >
            Nota
          </button>
        </div>
      </div>
      {obsAberta && (
        <textarea
          rows={2}
          disabled={!podeEditar}
          className="border-input bg-transparent w-full rounded-md border px-3 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60 dark:bg-input/30"
          placeholder="Observação (opcional)"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          onBlur={() => {
            if (obs !== (resposta?.observacao || "")) {
              void onResponder(item.id, "observacao", obs || null);
            }
          }}
        />
      )}
    </div>
  );
}

function BotaoToggle({
  activo,
  classeActiva,
  onClick,
  podeEditar,
  children
}: {
  activo: boolean;
  classeActiva: string;
  onClick: () => void;
  podeEditar: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={!podeEditar}
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 text-xs font-semibold transition-colors first:border-r hover:bg-accent disabled:opacity-60",
        activo ? classeActiva : "text-muted-foreground"
      )}
    >
      {children}
    </button>
  );
}
