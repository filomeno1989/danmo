"use client";

/**
 * OsClient - Ficha completa da obra (client).
 *
 * Blocos (iguais ao os_detalhe.html do hub):
 * - dados da obra + equipamento, com edição de dados base, avaria e
 *   tipos de intervenção;
 * - checklist digital (só em obras de revisão): iniciar, abrir,
 *   imprimir e trocar revisão (com histórico de trocas);
 * - atualizar estado da obra (com responsável) e estado físico (+ nº);
 * - histórico: timeline de estados (editável/apagável) e de físico;
 * - intervenções (mão de obra) com técnicos;
 * - peças aplicadas, com opção de retirar material do Stock.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  X
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Cabeca, EtiquetaEstado, EtiquetaFisico, Rodar, enviar, pedir } from "@/components/oficina/ui-bits";
import { SelecionarColaborador } from "@/components/oficina/selecionar-colaborador";
import {
  ESTADOS_FISICO,
  ESTADOS_WORKFLOW,
  MATERIAIS_FECHO,
  TIPOS_INTERVENCAO,
  UNIDADES_PECA,
  UNIDADES_PRECO,
  arredondarHoras,
  calcularHorasExcluindoAlmoco,
  dataHojeISO,
  formatarData,
  formatarDataHora,
  truncar,
  type ChecklistPreenchido,
  type ColaboradorLinha,
  type Equipamento,
  type Intervencao,
  type LogEstado,
  type LogFisico,
  type OrdemServico,
  type PecaOS,
  type PrecoCatalogo,
  type TrocaRevisao
} from "@/lib/oficina";

/** Mostra um valor em Meticais: "1 234,56 MT" */
function fmtMt(n: number): string {
  return (
    new Intl.NumberFormat("pt-PT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(n || 0) + " MT"
  );
}

type DadosObra = {
  ok: boolean;
  os: OrdemServico;
  equip: Equipamento | null;
  colaboradores: ColaboradorLinha[];
  materiais: { id: string; nome: string; referencia: string | null; unidade: string | null }[];
  materiaisSugeridos: string[];
  timeline: LogEstado[];
  timelineFisico: LogFisico[];
  intervencoes: Intervencao[];
  pecas: PecaOS[];
  checklists: {
    eObraRevisao: boolean;
    ativo: { id: number; templateId: number; nome: string; ref: string; feitos: number; total: number } | null;
    templatesDaCategoria: { id: number; nome: string; label: string }[];
    trocas: TrocaRevisao[];
  };
};

export function OsClient({
  osId,
  podeCriar,
  podeEditar,
  podeApagar
}: {
  osId: number;
  podeCriar: boolean;
  podeEditar: boolean;
  podeApagar: boolean;
}) {
  const router = useRouter();
  const [dados, setDados] = useState<DadosObra | null>(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(true);

  const carregar = useCallback(async () => {
    try {
      const d = await pedir<DadosObra>(`/api/oficina/ordens/${osId}`);
      setDados(d);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setACarregar(false);
    }
  }, [osId]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/oficina/ordens/${osId}`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok || d?.ok === false) throw new Error(d?.erro || "Falha ao carregar");
        setDados(d);
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
  }, [osId]);

  if (aCarregar) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
        <Rodar /> A carregar a obra...
      </div>
    );
  }
  if (erro || !dados) {
    return (
      <Card className="mx-auto max-w-md border-erro/40">
        <CardContent className="space-y-3 p-6 text-center">
          <p className="text-sm text-erro">{erro || "Obra não encontrada."}</p>
          <Button asChild variant="outline">
            <Link href="/oficina/ordens">
              <ArrowLeft aria-hidden /> Voltar às Ordens
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { os, equip } = dados;
  const titulo = os.numero_obra ? `Obra ${os.numero_obra}` : `Obra s/nº - ${equip?.code || ""}`;

  return (
    <div className="space-y-5">
      <Cabeca titulo={titulo} subtitulo={`${equip?.code || "-"} - ${equip?.fleet_type || "-"} - Aberta em ${formatarData(os.data_abertura)}`}>
        <Button variant="outline" size="sm" asChild>
          <Link href="/oficina/ordens">
            <ArrowLeft aria-hidden />
            Voltar
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/imprimir/os/${osId}`, "_blank")}
        >
          <Printer aria-hidden />
          Imprimir Folha
        </Button>
      </Cabeca>

      <DadosBase dados={dados} recarregar={carregar} podeEditar={podeEditar} />

      {dados.checklists.eObraRevisao && (
        <ChecklistDigital
          dados={dados}
          recarregar={carregar}
          podeCriar={podeCriar}
          router={router}
        />
      )}

      <AtualizarEstado
        key={`${os.id}-${os.atualizado_em || ""}`}
        dados={dados}
        recarregar={carregar}
        podeEditar={podeEditar}
      />

      <HistoricoObra
        dados={dados}
        recarregar={carregar}
        podeEditar={podeEditar}
        podeApagar={podeApagar}
      />

      <Intervencoes dados={dados} recarregar={carregar} podeCriar={podeCriar} podeApagar={podeApagar} />

      <Pecas dados={dados} recarregar={carregar} podeCriar={podeCriar} podeApagar={podeApagar} />
    </div>
  );
}

/* ================================================================
   BLOCO 1: dados base + avaria + tipos
   ================================================================ */

function DadosBase({
  dados,
  recarregar,
  podeEditar
}: {
  dados: DadosObra;
  recarregar: () => Promise<void>;
  podeEditar: boolean;
}) {
  const { os, equip } = dados;
  const [editandoBase, setEditandoBase] = useState(false);
  const [editandoAvaria, setEditandoAvaria] = useState(false);
  const [editandoTipo, setEditandoTipo] = useState(false);

  // campos
  const [novoEquip, setNovoEquip] = useState("");
  const [novaData, setNovaData] = useState("");
  const [novoHorimetro, setNovoHorimetro] = useState("");
  const [novaUnidade, setNovaUnidade] = useState("h");
  const [avaria, setAvaria] = useState("");
  const [tipos, setTipos] = useState<string[]>([]);
  const [aGravar, setAGravar] = useState(false);
  const [equips, setEquips] = useState<Equipamento[]>([]);

  async function abrirBase() {
    setNovoEquip(String(os.equipment_id));
    setNovaData((os.data_abertura || "").slice(0, 10));
    setNovoHorimetro(os.hora_equipamento != null ? String(os.hora_equipamento) : "");
    setNovaUnidade(os.unidade_medida || "h");
    if (!equips.length) {
      try {
        const r = await fetch("/api/oficina/ordens", { cache: "no-store" });
        const d = await r.json();
        if (d?.ok) setEquips(d.equipamentos || []);
      } catch {
        toast.error("Não foi possível carregar os equipamentos.");
      }
    }
    setEditandoBase(true);
  }

  async function gravarBase() {
    if (aGravar) return;
    setAGravar(true);
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        {
          action: "editar-dados-base",
          equipment_id: Number(novoEquip),
          data_abertura: novaData,
          hora_equipamento: novoHorimetro ? Number(novoHorimetro) : null,
          unidade_medida: novaUnidade
        },
        "Dados da obra actualizados."
      );
      setEditandoBase(false);
      await recarregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravar(false);
    }
  }

  async function gravarAvaria() {
    if (aGravar) return;
    setAGravar(true);
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        { action: "editar-avaria", descricao_avaria: avaria },
        "Avaria actualizada."
      );
      setEditandoAvaria(false);
      await recarregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravar(false);
    }
  }

  async function gravarTipo() {
    if (aGravar) return;
    setAGravar(true);
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        { action: "editar-tipo", tipo_intervencao: tipos },
        "Tipos actualizados."
      );
      setEditandoTipo(false);
      await recarregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravar(false);
    }
  }

  return (
    <Card className="card-sombra">
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <InfoRotulo rotulo="Equipamento" valor={equip?.code || "-"} extra={equip?.fleet_type || ""} />
          <InfoRotulo rotulo="Sector" valor={os.sector || "-"} />
          <InfoRotulo rotulo="Abertura" valor={formatarData(os.data_abertura)} />
          <InfoRotulo rotulo="Fecho" valor={os.data_fecho ? formatarData(os.data_fecho) : "-"} />
          <InfoRotulo
            rotulo="Contador"
            valor={os.hora_equipamento != null ? `${os.hora_equipamento} ${os.unidade_medida || "h"}` : "-"}
          />
          <InfoRotulo
            rotulo="Estado da Obra"
            valor={<EtiquetaEstado estado={os.status_atual} />}
          />
          <InfoRotulo rotulo="Estado Físico" valor={<EtiquetaFisico estado={os.status_fisico} />} />
          <InfoRotulo rotulo="Cliente" valor={os.nome_cliente || "CdM"} />
        </div>

        <div className="border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Avaria / Motivo</p>
            {podeEditar && !editandoAvaria && (
              <Button size="sm" variant="ghost" onClick={() => { setAvaria(os.descricao_avaria || ""); setEditandoAvaria(true); }}>
                <Pencil aria-hidden /> Editar
              </Button>
            )}
          </div>
          {editandoAvaria ? (
            <div className="mt-2 space-y-2">
              <textarea
                rows={3}
                className="border-input bg-transparent w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={avaria}
                onChange={(e) => setAvaria(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditandoAvaria(false)}>Cancelar</Button>
                <Button size="sm" onClick={gravarAvaria} disabled={aGravar}>
                  {aGravar ? <Rodar /> : <Save aria-hidden />} Guardar
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-sm leading-relaxed">{os.descricao_avaria || "-"}</p>
          )}
        </div>

        <div className="border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Tipo de Intervenção</p>
            {podeEditar && !editandoTipo && (
              <Button size="sm" variant="ghost" onClick={() => { setTipos(os.tipo_intervencao || []); setEditandoTipo(true); }}>
                <Pencil aria-hidden /> Adicionar / Editar
              </Button>
            )}
          </div>
          {editandoTipo ? (
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {TIPOS_INTERVENCAO.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-xs font-normal">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--primario)]"
                      checked={tipos.includes(t)}
                      onChange={(e) =>
                        setTipos((atual) => (e.target.checked ? [...atual, t] : atual.filter((x) => x !== t)))
                      }
                    />
                    {t}
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => setEditandoTipo(false)}>Cancelar</Button>
                <Button size="sm" onClick={gravarTipo} disabled={aGravar}>
                  {aGravar ? <Rodar /> : <Save aria-hidden />} Guardar
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {(os.tipo_intervencao || []).length ? (
                os.tipo_intervencao!.map((t) => (
                  <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    {t}
                  </span>
                ))
              ) : (
                <span className="text-xs text-muted-foreground">Nenhum tipo definido.</span>
              )}
            </div>
          )}
        </div>

        {os.observacoes && (
          <div className="border-t pt-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Observações</p>
            <p className="mt-1 text-sm leading-relaxed">{os.observacoes}</p>
          </div>
        )}

        {podeEditar && (
          <div className="border-t pt-3">
            {!editandoBase ? (
              <Button size="sm" variant="outline" onClick={abrirBase}>
                <Pencil aria-hidden /> Editar dados base (equipamento, data, contador)
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label>Equipamento</Label>
                    <select
                      className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                      value={novoEquip}
                      onChange={(e) => setNovoEquip(e.target.value)}
                    >
                      {equips.map((e) => (
                        <option key={e.id} value={String(e.id)}>
                          {e.code} - {e.fleet_type || ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Data de abertura</Label>
                    <Input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Contador</Label>
                    <Input type="number" step="0.1" value={novoHorimetro} onChange={(e) => setNovoHorimetro(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Unidade</Label>
                    <select
                      className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                      value={novaUnidade}
                      onChange={(e) => setNovaUnidade(e.target.value)}
                    >
                      <option value="h">h</option>
                      <option value="km">km</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditandoBase(false)}>Cancelar</Button>
                  <Button size="sm" onClick={gravarBase} disabled={aGravar}>
                    {aGravar ? <Rodar /> : <Save aria-hidden />} Guardar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function InfoRotulo({
  rotulo,
  valor,
  extra
}: {
  rotulo: string;
  valor: React.ReactNode;
  extra?: string;
}) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="mt-0.5 text-sm font-medium">{valor}</p>
      {extra && <p className="text-xs text-muted-foreground">{extra}</p>}
    </div>
  );
}

/* ================================================================
   BLOCO 2: checklist digital
   ================================================================ */

function ChecklistDigital({
  dados,
  recarregar,
  podeCriar,
  router
}: {
  dados: DadosObra;
  recarregar: () => Promise<void>;
  podeCriar: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const { os, checklists } = dados;
  const [templateId, setTemplateId] = useState("");
  const [aIniciar, setAIniciar] = useState(false);
  const [modalTroca, setModalTroca] = useState(false);
  const [novoTpl, setNovoTpl] = useState("");
  const [motivo, setMotivo] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [aTrocar, setATrocar] = useState(false);

  async function iniciar() {
    if (!templateId) {
      toast.error("Escolhe o checklist.");
      return;
    }
    if (aIniciar) return;
    setAIniciar(true);
    try {
      const r = await enviar<{ ok: boolean; checklistId: number }>(
        `/api/oficina/ordens/${os.id}`,
        { action: "iniciar-checklist", templateId: Number(templateId) },
        "Checklist criado."
      );
      router.push(`/oficina/checklist/${r.checklistId}`);
    } catch {
      setAIniciar(false);
    }
  }

  async function confirmarTroca() {
    if (aTrocar) return;
    if (!novoTpl) {
      toast.error("Escolhe a nova revisão.");
      return;
    }
    if (!motivo.trim()) {
      toast.error("Escreve o motivo da troca.");
      return;
    }
    setATrocar(true);
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        {
          action: "trocar-revisao",
          novoTemplateId: Number(novoTpl),
          motivoTroca: motivo,
          responsavel
        },
        "Revisão trocada. O checklist anterior ficou no histórico."
      );
      setModalTroca(false);
      setMotivo("");
      setResponsavel("");
      await recarregar();
    } catch {
      // aviso já mostrado
    } finally {
      setATrocar(false);
    }
  }

  const ativo = checklists.ativo;

  return (
    <Card className="card-sombra">
      <CardContent className="space-y-4">
        <p className="font-semibold">Checklist de Manutenção</p>

        {!ativo ? (
          podeCriar ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 space-y-1.5">
                <Label htmlFor="ck-tpl">Selecionar Checklist</Label>
                <select
                  id="ck-tpl"
                  className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                >
                  <option value="">- Selecionar -</option>
                  {checklists.templatesDaCategoria.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.nome} ({t.label})
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={iniciar} disabled={aIniciar}>
                {aIniciar && <Rodar />}
                Iniciar Checklist
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Ainda sem checklist iniciado nesta obra.</p>
          )
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{ativo.nome}</p>
                <p className="text-xs text-muted-foreground">{ativo.ref}</p>
              </div>
              <EtiquetaEstado estado={`${ativo.feitos}/${ativo.total}`} />
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-ambar transition-all"
                style={{ width: ativo.total ? `${(ativo.feitos / ativo.total) * 100}%` : "0%" }}
              />
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setModalTroca(true)} disabled={!podeCriar}>
                <RotateCcw aria-hidden />
                Trocar Revisão
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.open(`/imprimir/checklist/${ativo.id}`, "_blank")}>
                <Printer aria-hidden />
                Imprimir
              </Button>
              <Button size="sm" asChild>
                <Link href={`/oficina/checklist/${ativo.id}`}>Abrir Checklist</Link>
              </Button>
            </div>
          </div>
        )}

        {checklists.trocas.length > 0 && (
          <div className="border-t pt-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Histórico de Trocas de Revisão
            </p>
            <ul className="space-y-2">
              {checklists.trocas.map((t) => (
                <li key={t.id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  <p className="font-semibold">
                    {t.template_anterior_nome || "-"} → {t.template_novo_nome || "-"}
                  </p>
                  <p className="text-xs leading-relaxed">{t.motivo}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.responsavel ? `${t.responsavel} · ` : ""}
                    {formatarDataHora(t.criado_em)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <Modal
        aberto={modalTroca}
        fechar={() => setModalTroca(false)}
        titulo="Trocar Revisão do Checklist"
        subtitulo="O checklist actual fica arquivado no histórico e um novo começa do zero."
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nova Revisão *</Label>
            <select
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={novoTpl}
              onChange={(e) => setNovoTpl(e.target.value)}
            >
              <option value="">- Selecionar -</option>
              {checklists.templatesDaCategoria.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.nome} ({t.label})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo da Troca *</Label>
            <textarea
              rows={3}
              className="border-input bg-transparent w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex: Ao verificar o óleo notou-se desgaste avançado, avança-se para revisão de 2000h..."
            />
          </div>
          <div className="space-y-1.5">
            <Label>Responsável</Label>
            {/* Pesquisa por nome OU código (ex: Filomeno ou 69) */}
            <SelecionarColaborador
              colaboradores={dados.colaboradores}
              value={responsavel}
              onChange={setResponsavel}
              placeholder="Nome do responsável (opcional)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalTroca(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarTroca} disabled={aTrocar}>
              {aTrocar && <Rodar />}
              Confirmar Troca
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

/* ================================================================
   BLOCO 3: atualizar estados
   ================================================================ */

function AtualizarEstado({
  dados,
  recarregar,
  podeEditar
}: {
  dados: DadosObra;
  recarregar: () => Promise<void>;
  podeEditar: boolean;
}) {
  const { os } = dados;
  const [novoEstado, setNovoEstado] = useState(os.status_atual);
  const [responsavel, setResponsavel] = useState("");
  const [aGravarEstado, setAGravarEstado] = useState(false);

  const [novoFisico, setNovoFisico] = useState(os.status_fisico || "");
  const [numeroObra, setNumeroObra] = useState(os.numero_obra || "");
  const [aGravarFisico, setAGravarFisico] = useState(false);
  // O estado inicial vem da obra; o pai remonta este bloco (key) quando
  // a obra muda, por isso não precisa de efeito de sincronização.

  async function mudarStatus() {
    if (aGravarEstado) return;
    if (novoEstado === os.status_atual) {
      toast.error("Este já é o estado actual.");
      return;
    }
    if (!responsavel.trim()) {
      toast.error("Escolhe o responsável antes de actualizar o estado da obra.");
      return;
    }
    // Fecho da obra: abre o formulário de faturação CdM antes de gravar
    if (novoEstado === "Fechada") {
      await abrirFecho();
      return;
    }
    setAGravarEstado(true);
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        { action: "mudar-status", status_atual: novoEstado, responsavel },
        "Estado da obra actualizado."
      );
      setResponsavel("");
      await recarregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravarEstado(false);
    }
  }

  /* ---- Fecho com faturação CdM (abre ao escolher "Fechada") ---- */
  const [modalFecho, setModalFecho] = useState(false);
  const [fechoData, setFechoData] = useState(dataHojeISO());
  const [fechoHoras, setFechoHoras] = useState("");
  const [fechoValor, setFechoValor] = useState("");
  const [fechoMats, setFechoMats] = useState([
    { material: "", quantidade: "", valor_unitario: "", livre: false }
  ]);
  const [fechoObs, setFechoObs] = useState("");
  // Tabela de Preços: o fecho assume daqui os valores (mão de obra e materiais)
  const [precos, setPrecos] = useState<PrecoCatalogo[]>([]);

  async function abrirFecho() {
    // Busca a Tabela de Preços ao abrir o pop-up; se falhar (ex: tabela
    // ainda não criada), o fecho continua a funcionar com campos manuais
    try {
      const d = await pedir<{ ok: boolean; precos: PrecoCatalogo[] }>("/api/oficina/precos");
      setPrecos(d.precos || []);
    } catch {
      setPrecos([]);
    }
    fecharFormFecho();
    setModalFecho(true);
  }

  const precosMaoObra = precos.filter((p) => p.tipo === "mao_obra");
  const precosMaterial = precos.filter((p) => p.tipo === "material");

  function fecharFormFecho() {
    setFechoData(dataHojeISO());
    setFechoHoras("");
    setFechoValor("");
    setFechoMats([{ material: "", quantidade: "", valor_unitario: "", livre: false }]);
    setFechoObs("");
  }

  const totalMao =
    (Number(fechoHoras) || 0) * (Number(fechoValor) || 0);
  const totalMat = fechoMats.reduce(
    (s, m) => s + (Number(m.quantidade) || 0) * (Number(m.valor_unitario) || 0),
    0
  );

  async function confirmarFecho() {
    if (aGravarEstado) return;
    const horas = Number(fechoHoras);
    const valor = Number(fechoValor);
    if (fechoHoras === "" || !Number.isFinite(horas) || horas < 0) {
      toast.error("Escreve as horas que a CdM considerou para o trabalho.");
      return;
    }
    if (fechoValor === "" || !Number.isFinite(valor) || valor < 0) {
      toast.error("Escreve o valor que a CdM paga por hora.");
      return;
    }
    const mats = fechoMats
      .map((m) => ({
        material: m.material.trim(),
        quantidade: Number(m.quantidade) || 0,
        valor_unitario: Number(m.valor_unitario) || 0
      }))
      .filter((m) => m.material && m.quantidade > 0);
    setAGravarEstado(true);
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        {
          action: "mudar-status",
          status_atual: "Fechada",
          responsavel,
          fecho: {
            data_fecho: fechoData,
            horas_cdm: horas,
            valor_hora: valor,
            materiais: mats,
            observacao: fechoObs.trim() || null
          }
        },
        "Obra fechada e registada na Faturação CdM."
      );
      setModalFecho(false);
      setResponsavel("");
      await recarregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravarEstado(false);
    }
  }

  async function gravarFisico() {
    if (aGravarFisico) return;
    setAGravarFisico(true);
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        {
          action: "atualizar-fisico",
          status_fisico: novoFisico,
          numero_obra: numeroObra.trim() || null
        },
        "Alterações guardadas."
      );
      await recarregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravarFisico(false);
    }
  }

  if (!podeEditar) return null;

  return (
    <Card className="card-sombra">
      <CardContent className="space-y-4">
        <p className="font-semibold">Actualizar Estado</p>
        <div className="grid items-end gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Estado da Obra</Label>
            <select
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={novoEstado}
              onChange={(e) => setNovoEstado(e.target.value)}
            >
              {ESTADOS_WORKFLOW.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Responsável *</Label>
            {/* Pesquisa por nome OU código (ex: Filomeno ou 69) */}
            <SelecionarColaborador
              colaboradores={dados.colaboradores}
              value={responsavel}
              onChange={setResponsavel}
            />
          </div>
          <Button onClick={mudarStatus} disabled={aGravarEstado}>
            {aGravarEstado && <Rodar />}
            Actualizar Estado da Obra
          </Button>
        </div>

        <div className="grid items-end gap-3 border-t pt-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Estado Físico</Label>
            <select
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={novoFisico}
              onChange={(e) => setNovoFisico(e.target.value)}
            >
              {ESTADOS_FISICO.filter((s) => s !== "Concluído").map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Nº de Obra (se ainda não atribuído)</Label>
            <Input
              value={numeroObra}
              onChange={(e) => setNumeroObra(e.target.value)}
              placeholder="Preencher quando a CdM atribuir"
            />
          </div>
          <Button variant="outline" onClick={gravarFisico} disabled={aGravarFisico}>
            {aGravarFisico && <Rodar />}
            Guardar Alterações
          </Button>
        </div>
      </CardContent>

      {/* ---- Pop-up de Fecho: faturação CdM (abre ao escolher "Fechada") ---- */}
      <Modal
        aberto={modalFecho}
        fechar={() => setModalFecho(false)}
        titulo="Fechar Obra - Faturação CdM"
        subtitulo="A obra vai para o módulo Faturação CdM com estes valores."
        largura="max-w-2xl"
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Data de Fecho</Label>
              <Input
                type="date"
                value={fechoData}
                onChange={(e) => setFechoData(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Horas consideradas pela CdM *</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={fechoHoras}
                onChange={(e) => setFechoHoras(e.target.value)}
                placeholder="Ex: 12"
              />
            </div>
            <div className="space-y-1.5">
              {precosMaoObra.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs">Da Tabela de Preços</Label>
                  <select
                    className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                    value=""
                    onChange={(e) => {
                      const p = precosMaoObra.find((x) => String(x.id) === e.target.value);
                      if (p) setFechoValor(String(p.valor));
                    }}
                  >
                    <option value="">- Escolher da Tabela -</option>
                    {precosMaoObra.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.nome} - {p.valor} MT/{UNIDADES_PRECO[p.unidade] || p.unidade}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <Label>Valor por hora (MT) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={fechoValor}
                onChange={(e) => setFechoValor(e.target.value)}
                placeholder="Ex: 850"
              />
            </div>
          </div>

          <div className="bg-accent/40 flex items-center justify-between rounded-md px-3 py-2 text-sm">
            <span className="font-medium">Total de mão de obra</span>
            <span className="font-semibold">
              {fmtMt(totalMao)}
              <span className="text-muted-foreground ml-2 font-normal">
                ({fechoHoras || 0} h x {fechoValor || 0} MT)
              </span>
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Material usado (do nosso stock)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFechoMats((atual) => [
                    ...atual,
                    { material: "", quantidade: "", valor_unitario: "", livre: false }
                  ])
                }
              >
                <Plus aria-hidden /> Adicionar material
              </Button>
            </div>
            {precosMaterial.length > 0 && (
              <p className="text-muted-foreground text-xs">
                Os materiais vêm da Tabela de Preços com o valor registado - podes ajustar o valor
                neste fecho, se a CdM acordar outro preço.
              </p>
            )}
            {fechoMats.map((m, i) => {
              const totalLinha =
                (Number(m.quantidade) || 0) * (Number(m.valor_unitario) || 0);
              return (
                <div key={i} className="grid grid-cols-[1fr_5rem_6.5rem_6rem_2rem] items-end gap-2">
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Material</Label>}
                    {!m.livre && precosMaterial.length > 0 ? (
                      <select
                        className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                        value={m.material}
                        onChange={(e) => {
                          if (e.target.value === "__livre__") {
                            setFechoMats((atual) =>
                              atual.map((x, j) =>
                                j === i ? { ...x, material: "", livre: true } : x
                              )
                            );
                            return;
                          }
                          const p = precosMaterial.find((x) => x.nome === e.target.value);
                          setFechoMats((atual) =>
                            atual.map((x, j) =>
                              j === i
                                ? {
                                    ...x,
                                    material: p?.nome || "",
                                    valor_unitario: p ? String(p.valor) : x.valor_unitario
                                  }
                                : x
                            )
                          );
                        }}
                      >
                        <option value="">- Selecionar material -</option>
                        {precosMaterial.map((p) => (
                          <option key={p.id} value={p.nome}>
                            {p.nome} - {fmtMt(p.valor)}/{UNIDADES_PRECO[p.unidade] || p.unidade}
                          </option>
                        ))}
                        <option value="__livre__">Outro material (escrever)...</option>
                      </select>
                    ) : (
                      <Input
                        list="lista-gases-fecho"
                        value={m.material}
                        onChange={(e) =>
                          setFechoMats((atual) =>
                            atual.map((x, j) => (j === i ? { ...x, material: e.target.value } : x))
                          )
                        }
                        placeholder="Ex: Oxigênio"
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Qtd</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={m.quantidade}
                      onChange={(e) =>
                        setFechoMats((atual) =>
                          atual.map((x, j) => (j === i ? { ...x, quantidade: e.target.value } : x))
                        )
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="space-y-1">
                    {i === 0 && <Label className="text-xs">Valor/un. (MT)</Label>}
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={m.valor_unitario}
                      onChange={(e) =>
                        setFechoMats((atual) =>
                          atual.map((x, j) =>
                            j === i ? { ...x, valor_unitario: e.target.value } : x
                          )
                        )
                      }
                      placeholder="0"
                    />
                  </div>
                  <div className="pb-2 text-right text-xs font-semibold">
                    {totalLinha ? fmtMt(totalLinha) : ""}
                  </div>
                  <div className="pb-1">
                    {fechoMats.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-8 text-erro"
                        aria-label="Remover material"
                        onClick={() => setFechoMats((atual) => atual.filter((_, j) => j !== i))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
            <datalist id="lista-gases-fecho">
              {MATERIAIS_FECHO.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
          </div>

          <div className="space-y-1.5">
            <Label>Observação (opcional)</Label>
            <Input
              value={fechoObs}
              onChange={(e) => setFechoObs(e.target.value)}
              placeholder="Ex: obra autorizada pela CdM, folha 23..."
            />
          </div>

          <div className="flex items-center justify-between rounded-md border-2 border-[var(--primario)] px-3 py-2.5">
            <span className="font-semibold">TOTAL GERAL A FACTURAR</span>
            <span className="text-lg font-bold">{fmtMt(totalMao + totalMat)}</span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setModalFecho(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarFecho} disabled={aGravarEstado}>
              {aGravarEstado && <Rodar />}
              Fechar e Registar na Faturação
            </Button>
          </div>
        </div>
      </Modal>
      </Card>
  );
}

/* ================================================================
   BLOCO 4: histórico (timelines)
   ================================================================ */

function HistoricoObra({
  dados,
  recarregar,
  podeEditar,
  podeApagar
}: {
  dados: DadosObra;
  recarregar: () => Promise<void>;
  podeEditar: boolean;
  podeApagar: boolean;
}) {
  const { timeline, timelineFisico } = dados;
  const [aEditar, setAEditar] = useState<number | null>(null);
  const [novoNome, setNovoNome] = useState("");

  async function guardarNome(logId: number) {
    if (!novoNome.trim()) {
      toast.error("O responsável não pode ficar vazio.");
      return;
    }
    try {
      await enviar(
        `/api/oficina/ordens/${dados.os.id}`,
        { action: "editar-log-responsavel", logId, novoResponsavel: novoNome },
        "Responsável corrigido."
      );
      setAEditar(null);
      await recarregar();
    } catch {
      // aviso já mostrado
    }
  }

  async function apagarLog(logId: number) {
    const ok = window.confirm("Apagar este registo do histórico? Usa isto só para corrigir um erro de lançamento.");
    if (!ok) return;
    try {
      await enviar(`/api/oficina/ordens/${dados.os.id}`, { action: "apagar-log", logId }, "Registo apagado.");
      await recarregar();
    } catch {
      // aviso já mostrado
    }
  }

  return (
    <Card className="card-sombra">
      <CardContent className="space-y-4">
        <p className="font-semibold">Histórico da Obra</p>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ambar-texto dark:text-ambar">
              Estado da Obra
            </p>
            <p className="mb-2 text-[0.7rem] text-muted-foreground">
              Errou o responsável? Edite ou apague o registo abaixo.
            </p>
            <ul className="space-y-2">
              {timeline.length === 0 && <li className="text-sm text-muted-foreground">Sem registos.</li>}
              {timeline.map((ev) => (
                <li key={ev.id} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">
                        {ev.status_anterior ? `${ev.status_anterior} → ` : ""}
                        {ev.status_novo}
                        {ev.observacao ? ` - ${ev.observacao}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ev.responsavel ? (
                          ev.responsavel
                        ) : (
                          <span className="text-erro">sem responsável</span>
                        )}
                        {" · "}
                        {formatarDataHora(ev.data_mudanca)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {podeEditar && aEditar !== ev.id && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-7 p-0"
                          title="Editar responsável"
                          onClick={() => {
                            setAEditar(ev.id);
                            setNovoNome(ev.responsavel || "");
                          }}
                        >
                          <Pencil className="size-3.5" aria-hidden />
                        </Button>
                      )}
                      {podeApagar && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="size-7 p-0 text-erro hover:text-erro"
                          title="Apagar registo"
                          onClick={() => apagarLog(ev.id)}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </div>
                  {aEditar === ev.id && (
                    <div className="mt-2 flex gap-2">
                      <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Responsável correcto" />
                      <Button size="sm" onClick={() => guardarNome(ev.id)}>
                        <Check aria-hidden /> Ok
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAEditar(null)}>
                        <X aria-hidden />
                      </Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-info">Estado Físico</p>
            <ul className="space-y-2">
              {timelineFisico.length === 0 && <li className="text-sm text-muted-foreground">Sem registos.</li>}
              {timelineFisico.map((ev) => (
                <li key={ev.id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-semibold">{ev.status_fisico}</p>
                  <p className="text-xs text-muted-foreground">{formatarDataHora(ev.data_mudanca)}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ================================================================
   BLOCO 5: intervenções (mão de obra)
   ================================================================ */

function Intervencoes({
  dados,
  recarregar,
  podeCriar,
  podeApagar
}: {
  dados: DadosObra;
  recarregar: () => Promise<void>;
  podeCriar: boolean;
  podeApagar: boolean;
}) {
  const { intervencoes, colaboradores, os } = dados;
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const [fData, setFData] = useState(dataHojeISO());
  const [fInicio, setFInicio] = useState("");
  const [fFim, setFFim] = useState("");
  const [fDescricao, setFDescricao] = useState("");
  const [fStatus, setFStatus] = useState("em_curso");
  const [tecnicos, setTecnicos] = useState<ColaboradorLinha[]>([]);
  const [busca, setBusca] = useState("");

  function abrirNova() {
    setEditando(null);
    setFData(dataHojeISO());
    setFInicio("");
    setFFim("");
    setFDescricao("");
    setFStatus("em_curso");
    setTecnicos([]);
    setBusca("");
    setModal(true);
  }

  function abrirEdicao(iv: Intervencao) {
    setEditando(iv.id);
    setFData((iv.shift_date || "").slice(0, 10));
    setFInicio((iv.time_start || "").slice(0, 5));
    setFFim((iv.time_end || "").slice(0, 5));
    setFDescricao(iv.description || "");
    setFStatus(iv.status || "em_curso");
    setTecnicos(
      (iv.tecnicos || []).map((t) => ({ id: t.id, name: t.name, code: t.code }))
    );
    setBusca("");
    setModal(true);
  }

  async function gravar(e: React.FormEvent) {
    e.preventDefault();
    if (aGravar) return;
    setAGravar(true);
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        {
          action: "registrar-intervencao",
          intervencao: {
            id: editando || undefined,
            data: fData,
            inicio: fInicio,
            fim: fFim,
            descricao: fDescricao,
            status: fStatus,
            tecnicos: tecnicos.map((t) => t.id)
          }
        },
        "Intervenção guardada com sucesso."
      );
      setModal(false);
      await recarregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravar(false);
    }
  }

  async function apagar(iv: Intervencao) {
    const ok = window.confirm("Apagar esta intervenção?");
    if (!ok) return;
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        { action: "apagar-intervencao", intervencao: { id: iv.id } },
        "Intervenção apagada."
      );
      await recarregar();
    } catch {
      // aviso já mostrado
    }
  }

  const totalIntervencoes = intervencoes.reduce((s, r) => s + (r.hours || 0), 0);
  const totalTecnicos = intervencoes.reduce(
    (s, r) => s + (r.hours || 0) * Math.max(1, r.tecnicos?.length || 1),
    0
  );

  const candidatos = colaboradores.filter((c) => {
    if (tecnicos.some((t) => t.id === c.id)) return false;
    const q = busca.toLowerCase().trim();
    if (!q) return false;
    return c.name.toLowerCase().includes(q) || (c.code || "").toLowerCase().includes(q);
  });

  return (
    <Card className="card-sombra">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">Descrição da Mão de Obra</p>
          {podeCriar && (
            <Button size="sm" onClick={abrirNova}>
              <Plus aria-hidden /> Registar Intervenção
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                {["Data", "Início", "Fim", "Horas", "Técnicos", "Sectores", "Descrição", "Estado", ""].map((c) => (
                  <th key={c} className="px-2 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {intervencoes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 py-6 text-center text-muted-foreground">
                    Ainda sem intervenções registadas.
                  </td>
                </tr>
              ) : (
                intervencoes.map((iv) => {
                  const nTec = Math.max(1, iv.tecnicos?.length || 1);
                  return (
                    <tr key={iv.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-2 py-2">{formatarData(iv.shift_date)}</td>
                      <td className="px-2 py-2">{(iv.time_start || "-").slice(0, 5)}</td>
                      <td className="px-2 py-2">{(iv.time_end || "-").slice(0, 5)}</td>
                      <td className="px-2 py-2 font-semibold tabular-nums">
                        {iv.hours ?? 0}h{nTec > 1 ? ` × ${nTec}` : ""}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col">
                          {(iv.tecnicos || []).map((t) => (
                            <span key={t.id}>
                              {t.name}
                              {t.code ? ` (${t.code})` : ""}
                            </span>
                          ))}
                          {!iv.tecnicos?.length && <span className="text-muted-foreground">-</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-col">
                          {(iv.setores || []).map((s) => (
                            <span key={s}>{s}</span>
                          ))}
                          {!iv.setores?.length && <span className="text-muted-foreground">-</span>}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="max-w-72 whitespace-pre-line leading-snug">
                          {(iv.description || "-").split(";").map((parte, i) => (
                            <span key={i}>
                              {i > 0 && <br />}
                              {parte.trim()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <EtiquetaEstado
                          estado={iv.status === "concluida" ? "Fechada" : "Supervisão"}
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {podeCriar && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-7 p-0"
                              title="Editar"
                              onClick={() => abrirEdicao(iv)}
                            >
                              <Pencil className="size-3.5" aria-hidden />
                            </Button>
                          )}
                          {podeApagar && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-7 p-0 text-erro hover:text-erro"
                              title="Apagar"
                              onClick={() => apagar(iv)}
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Total Horas (por técnico)
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{Math.round(totalTecnicos * 100) / 100}h</p>
          </div>
          <div className="rounded-xl border bg-muted/40 p-3">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              Total Horas (intervenções)
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums">{Math.round(totalIntervencoes * 100) / 100}h</p>
          </div>
        </div>
      </CardContent>

      <Modal
        aberto={modal}
        fechar={() => setModal(false)}
        titulo={editando ? "Editar Intervenção" : "Registar Intervenção"}
      >
        <form onSubmit={gravar} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>
                Data <span className="text-erro">*</span>
              </Label>
              <Input type="date" required value={fData} onChange={(e) => setFData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>
                Hora Início <span className="text-erro">*</span>
              </Label>
              <Input type="time" required value={fInicio} onChange={(e) => setFInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>
                Hora Fim <span className="text-erro">*</span>
              </Label>
              <Input type="time" required value={fFim} onChange={(e) => setFFim(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>
              Descrição do Trabalho <span className="text-erro">*</span>
            </Label>
            <textarea
              required
              rows={3}
              className="border-input bg-transparent w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fDescricao}
              onChange={(e) => setFDescricao(e.target.value)}
              placeholder="O que foi feito... (usa ; para separar tarefas em linhas diferentes)"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Estado</Label>
            <select
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
            >
              <option value="em_curso">Em curso</option>
              <option value="concluida">Concluída</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Técnicos Envolvidos</Label>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pesquisar por nome ou código..."
              autoComplete="off"
            />
            {busca && (
              <div className="max-h-36 overflow-y-auto rounded-md border">
                {candidatos.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado.</p>
                ) : (
                  candidatos.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setTecnicos((atual) => [...atual, c]);
                        setBusca("");
                      }}
                    >
                      {c.name}
                      {c.code ? ` (${c.code})` : ""}
                      {c.setor ? ` - ${c.setor}` : ""}
                    </button>
                  ))
                )}
              </div>
            )}
            {tecnicos.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tecnicos.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {t.name}
                    <button
                      type="button"
                      aria-label={`Remover ${t.name}`}
                      className="text-muted-foreground hover:text-erro"
                      onClick={() => setTecnicos((atual) => atual.filter((x) => x.id !== t.id))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={aGravar}>
              {aGravar && <Rodar />}
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}

/* ================================================================
   BLOCO 6: peças aplicadas
   ================================================================ */

function Pecas({
  dados,
  recarregar,
  podeCriar,
  podeApagar
}: {
  dados: DadosObra;
  recarregar: () => Promise<void>;
  podeCriar: boolean;
  podeApagar: boolean;
}) {
  const { pecas, os, materiais, materiaisSugeridos } = dados;
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<number | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const [usarStock, setUsarStock] = useState(false);
  const [linhas, setLinhas] = useState([{ nome: "", materialId: "", qtd: 1, unidade: "Unidade" }]);
  const [fData, setFData] = useState(dataHojeISO());
  const [colaborador, setColaborador] = useState("");

  function abrirNova() {
    setEditando(null);
    setUsarStock(false);
    setLinhas([{ nome: "", materialId: "", qtd: 1, unidade: "Unidade" }]);
    setFData(dataHojeISO());
    setColaborador("");
    setModal(true);
  }

  function abrirEdicao(p: PecaOS) {
    setEditando(p.id);
    setUsarStock(Boolean(p.material_id));
    setLinhas([
      {
        nome: p.material_id ? "" : p.peca || "",
        materialId: p.material_id ? String(p.material_id) : "",
        qtd: p.quantidade || 1,
        unidade: p.unidade || "Unidade"
      }
    ]);
    setFData(p.data || dataHojeISO());
    setColaborador(p.colaborador || "");
    setModal(true);
  }

  async function gravar(e: React.FormEvent) {
    e.preventDefault();
    if (aGravar) return;
    setAGravar(true);
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        {
          action: "registrar-pecas",
          peca: {
            id: editando || undefined,
            usarStock,
            data: fData || null,
            colaborador: colaborador.trim() || null,
            linhas: linhas.map((l) => ({
              nome: l.nome,
              materialId: l.materialId || undefined,
              qtd: Number(l.qtd) || 1,
              unidade: l.unidade
            }))
          }
        },
        usarStock
          ? "Peça(s) registada(s) e saída pendente criada no Stock."
          : "Peça(s) guardada(s) com sucesso."
      );
      setModal(false);
      await recarregar();
    } catch {
      // aviso já mostrado
    } finally {
      setAGravar(false);
    }
  }

  async function apagar(p: PecaOS) {
    const ok = window.confirm("Apagar esta peça?");
    if (!ok) return;
    try {
      await enviar(
        `/api/oficina/ordens/${os.id}`,
        { action: "apagar-peca", peca: { id: p.id } },
        "Peça apagada."
      );
      await recarregar();
    } catch {
      // aviso já mostrado
    }
  }

  return (
    <Card className="card-sombra">
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold">Peças Aplicadas</p>
          {podeCriar && (
            <Button size="sm" onClick={abrirNova}>
              <Plus aria-hidden /> Adicionar Peça
            </Button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead>
              <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                {["Peça / Material", "Data", "Qtd", "Unidade", "Colaborador", ""].map((c) => (
                  <th key={c} className="px-2 py-2 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pecas.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-2 py-6 text-center text-muted-foreground">
                    Sem peças registadas.
                  </td>
                </tr>
              ) : (
                pecas.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="px-2 py-2">{p.peca}</td>
                    <td className="whitespace-nowrap px-2 py-2">{formatarData(p.data)}</td>
                    <td className="px-2 py-2 tabular-nums">{p.quantidade || 1}</td>
                    <td className="px-2 py-2">{p.unidade || "Unidade"}</td>
                    <td className="px-2 py-2">{p.colaborador || "-"}</td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex justify-end gap-1">
                        {podeCriar && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-7 p-0"
                            title="Editar"
                            onClick={() => abrirEdicao(p)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                        )}
                        {podeApagar && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="size-7 p-0 text-erro hover:text-erro"
                            title="Apagar"
                            onClick={() => apagar(p)}
                          >
                            <Trash2 className="size-3.5" aria-hidden />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Modal
        aberto={modal}
        fechar={() => setModal(false)}
        titulo={editando ? "Editar Peça" : "Adicionar Peça(s) Aplicada(s)"}
      >
        <form onSubmit={gravar} className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-normal">
            <input
              type="checkbox"
              className="size-4 accent-[var(--primario)]"
              checked={usarStock}
              onChange={(e) => setUsarStock(e.target.checked)}
            />
            Material da Danmo (retirar do Stock)
          </label>

          <datalist id="lista-materiais-sugeridos">
            {materiaisSugeridos.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>

          {linhas.map((linha, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-3">
              {linhas.length > 1 && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="size-7 p-0 text-erro"
                    aria-label="Remover linha"
                    onClick={() => setLinhas((atual) => atual.filter((_, j) => j !== i))}
                  >
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </div>
              )}
              {usarStock ? (
                <div className="space-y-1.5">
                  <Label>Material do Stock *</Label>
                  <select
                    className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                    value={linha.materialId}
                    onChange={(e) =>
                      setLinhas((atual) =>
                        atual.map((l, j) => (j === i ? { ...l, materialId: e.target.value } : l))
                      )
                    }
                  >
                    <option value="">- Selecionar -</option>
                    {materiais.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nome}
                        {m.referencia ? ` (${m.referencia})` : ""} - {m.unidade || "Und"}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>Peça / Material *</Label>
                  <Input
                    list="lista-materiais-sugeridos"
                    value={linha.nome}
                    onChange={(e) =>
                      setLinhas((atual) =>
                        atual.map((l, j) => (j === i ? { ...l, nome: e.target.value } : l))
                      )
                    }
                    placeholder="Ex: Correia de comando, Óleo 15W40..."
                  />
                </div>
              )}
              <div className="flex gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={linha.qtd}
                    onChange={(e) =>
                      setLinhas((atual) =>
                        atual.map((l, j) => (j === i ? { ...l, qtd: Number(e.target.value) } : l))
                      )
                    }
                  />
                </div>
                <div className="w-36 space-y-1.5">
                  <Label>Unidade</Label>
                  <select
                    className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                    value={linha.unidade}
                    onChange={(e) =>
                      setLinhas((atual) =>
                        atual.map((l, j) => (j === i ? { ...l, unidade: e.target.value } : l))
                      )
                    }
                  >
                    {UNIDADES_PECA.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}

          {!editando && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setLinhas((atual) => [...atual, { nome: "", materialId: "", qtd: 1, unidade: "Unidade" }])}
            >
              <Plus aria-hidden /> Adicionar outra peça
            </Button>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Data de Aplicação</Label>
              <Input type="date" value={fData} onChange={(e) => setFData(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Colaborador que Aplicou</Label>
              {/* Pesquisa por nome OU código */}
              <SelecionarColaborador
                colaboradores={dados.colaboradores}
                value={colaborador}
                onChange={setColaborador}
                placeholder="Nome do colaborador"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={aGravar}>
              {aGravar && <Rodar />}
              Guardar
            </Button>
          </div>
        </form>
      </Modal>
    </Card>
  );
}
