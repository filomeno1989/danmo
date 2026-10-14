"use client";

/**
 * OrdensClient - Lista de Ordens de Serviço (client).
 *
 * Filtros combinados (estado, equipamento, estado físico, sector,
 * com/sem nº de obra e busca), tabela clicável que abre a ficha da
 * obra, criação de nova obra (com equipamento, sector, contador,
 * avaria, tipos de intervenção, estado físico, data e colaboradores)
 * e apagar (com confirmação) - permissões verificadas no servidor.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, RotateCcw, Search, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Cabeca, EtiquetaEstado, EtiquetaFisico, Rodar, enviar } from "@/components/oficina/ui-bits";
import { SelecionarEquipamento } from "@/components/oficina/selecionar-equipamento";
import {
  ESTADOS_FISICO,
  ESTADOS_WORKFLOW,
  SECTORES,
  TIPOS_INTERVENCAO,
  diasDesde,
  formatarData,
  truncar,
  type ColaboradorLinha,
  type Equipamento,
  type OrdemServico
} from "@/lib/oficina";

type Dados = {
  ok: boolean;
  equipamentos: Equipamento[];
  ordens: OrdemServico[];
  colaboradores: ColaboradorLinha[];
};

const BADGE_FISICO: Record<string, string> = {
  Avariada: "bg-erro-bg text-erro",
  Acidentada: "bg-erro-bg text-erro",
  Pneumático: "bg-info-bg text-info",
  "Revisão/Manutenção": "bg-ambar-claro text-ambar-texto",
  Inspeção: "bg-ambar-claro text-ambar-texto",
  "Aguarda Acessório": "bg-muted text-muted-foreground",
  Concluído: "bg-sucesso-bg text-sucesso"
};

export function OrdensClient({ podeCriar, podeApagar }: { podeCriar: boolean; podeApagar: boolean }) {
  const router = useRouter();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState("");
  const [aCarregar, setACarregar] = useState(true);

  // filtros
  const [fEstado, setFEstado] = useState("");
  const [fEquip, setFEquip] = useState("");
  const [fFisico, setFFisico] = useState("");
  const [fSector, setFSector] = useState("");
  const [fNr, setFNr] = useState("");
  const [fBusca, setFBusca] = useState("");

  // modal nova OS
  const [modalNova, setModalNova] = useState(false);
  const [aCriar, setACriar] = useState(false);
  const [fNumeroObra, setFNumeroObra] = useState("");
  const [fEquipamento, setFEquipamento] = useState("");
  const [fSectorNovo, setFSectorNovo] = useState("");
  const [fHorimetro, setFHorimetro] = useState("");
  const [fUnidade, setFUnidade] = useState("h");
  const [fAvaria, setFAvaria] = useState("");
  const [fTipos, setFTipos] = useState<string[]>([]);
  const [fFisicoNovo, setFFisicoNovo] = useState("");
  const [fDataAbertura, setFDataAbertura] = useState("");
  const [fObservacoes, setFObservacoes] = useState("");
  const [selecionados, setSelecionados] = useState<ColaboradorLinha[]>([]);
  const [buscaColab, setBuscaColab] = useState("");

  const carregar = useCallback(async () => {
    setACarregar(true);
    setErro("");
    try {
      const r = await fetch("/api/oficina/ordens", { cache: "no-store" });
      const d = await r.json();
      if (!r.ok || d?.ok === false) throw new Error(d?.erro || "Falha ao carregar");
      setDados(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setACarregar(false);
    }
  }, []);

  useEffect(() => {
    let vivo = true;
    fetch("/api/oficina/ordens", { cache: "no-store" })
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
  }, []);

  const mapaEquip = useMemo(
    () => new Map((dados?.equipamentos || []).map((e) => [e.id, e])),
    [dados]
  );

  const lista = useMemo(() => {
    if (!dados) return [];
    const busca = fBusca.trim().toLowerCase();
    let l = [...dados.ordens];
    if (fEstado) l = l.filter((o) => o.status_atual === fEstado);
    if (fEquip) l = l.filter((o) => String(o.equipment_id) === fEquip);
    if (fFisico) l = l.filter((o) => o.status_fisico === fFisico);
    if (fSector) l = l.filter((o) => o.sector === fSector);
    if (fNr === "sem") l = l.filter((o) => !o.numero_obra);
    if (fNr === "com") l = l.filter((o) => Boolean(o.numero_obra));
    if (busca) {
      l = l.filter((o) => {
        const eq = mapaEquip.get(o.equipment_id);
        return (
          (o.numero_obra || "").toLowerCase().includes(busca) ||
          (eq?.code || "").toLowerCase().includes(busca) ||
          (o.descricao_avaria || "").toLowerCase().includes(busca)
        );
      });
    }
    return l.sort((a, b) => (b.data_abertura || "").localeCompare(a.data_abertura || ""));
  }, [dados, fEstado, fEquip, fFisico, fSector, fNr, fBusca, mapaEquip]);

  /* ============ Nova OS ============ */

  function abrirModalNova() {
    setFNumeroObra("");
    setFEquipamento("");
    setFSectorNovo("");
    setFHorimetro("");
    setFUnidade("h");
    setFAvaria("");
    setFTipos([]);
    setFFisicoNovo("");
    setFDataAbertura(new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10));
    setFObservacoes("");
    setSelecionados([]);
    setBuscaColab("");
    setModalNova(true);
  }

  async function criarOS(e: React.FormEvent) {
    e.preventDefault();
    if (aCriar) return;
    if (!fEquipamento) {
      toast.error("Escolhe a máquina da obra (escreve o nº para encontrar depressa).");
      return;
    }
    if (!fSectorNovo) {
      toast.error("Escolhe o sector.");
      return;
    }
    setACriar(true);
    try {
      const r = await enviar<{ ok: boolean; id: number }>(
        "/api/oficina/ordens",
        {
          action: "criar",
          numero_obra: fNumeroObra.trim() || null,
          equipment_id: Number(fEquipamento),
          sector: fSectorNovo,
          hora_equipamento: fHorimetro ? Number(fHorimetro) : null,
          unidade_medida: fUnidade,
          descricao_avaria: fAvaria,
          tipo_intervencao: fTipos.length ? fTipos : null,
          data_abertura: fDataAbertura,
          status_fisico: fFisicoNovo,
          aberto_por: selecionados.length ? selecionados.map((c) => c.name) : null,
          observacoes: fObservacoes.trim() || null
        },
        "Obra criada."
      );
      setModalNova(false);
      router.push(`/oficina/ordens/${r.id}`);
    } catch {
      // o aviso já foi mostrado pelo enviar()
    } finally {
      setACriar(false);
    }
  }

  async function apagarOS(o: OrdemServico) {
    const confirmou = window.confirm(
      `ATENÇÃO: apagar a obra ${o.numero_obra || "s/nº"} e TUDO o que lhe pertence (intervenções, peças, checklists e histórico)? Esta acção é irreversível.`
    );
    if (!confirmou) return;
    try {
      await enviar("/api/oficina/ordens", { action: "apagar", id: o.id }, "Obra apagada.");
      await carregar();
    } catch {
      // aviso já mostrado
    }
  }

  const candidatosColab = (dados?.colaboradores || []).filter((c) => {
    if (selecionados.some((s) => s.id === c.id)) return false;
    const q = buscaColab.toLowerCase().trim();
    if (!q) return false;
    return (
      c.name.toLowerCase().includes(q) || (c.code || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-5">
      <Cabeca titulo="Ordens de Serviço" subtitulo="Todas as obras da oficina. Clica no nº de obra ou na máquina para abrir a ficha.">
        <Button variant="outline" size="sm" onClick={carregar} disabled={aCarregar}>
          {aCarregar ? <Rodar /> : <RotateCcw aria-hidden />}
          Actualizar
        </Button>
        {podeCriar && (
          <Button size="sm" onClick={abrirModalNova}>
            <Plus aria-hidden />
            Nova Obra
          </Button>
        )}
      </Cabeca>

      {erro && (
        <Card className="border-erro/40">
          <CardContent className="flex items-center gap-2 text-sm text-erro">
            <TriangleAlert className="size-4" aria-hidden />
            {erro}
            <Button variant="outline" size="sm" onClick={carregar} className="ml-auto">
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card className="card-sombra">
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="fil-estado">Estado da obra</Label>
            <select
              id="fil-estado"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fEstado}
              onChange={(e) => setFEstado(e.target.value)}
            >
              <option value="">Todos</option>
              {ESTADOS_WORKFLOW.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fil-equip">Equipamento</Label>
            {/* Campo com pesquisa: 200+ máquinas num select obrigavam a correr a lista toda */}
            <SelecionarEquipamento
              id="fil-equip"
              equipamentos={dados?.equipamentos || []}
              value={fEquip}
              onChange={setFEquip}
              placeholder="Todos"
              todosLabel="Todas as máquinas"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fil-fisico">Estado físico</Label>
            <select
              id="fil-fisico"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fFisico}
              onChange={(e) => setFFisico(e.target.value)}
            >
              <option value="">Todos</option>
              {ESTADOS_FISICO.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fil-sector">Sector</Label>
            <select
              id="fil-sector"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fSector}
              onChange={(e) => setFSector(e.target.value)}
            >
              <option value="">Todos</option>
              {SECTORES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fil-nr">Nº de obra</Label>
            <select
              id="fil-nr"
              className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fNr}
              onChange={(e) => setFNr(e.target.value)}
            >
              <option value="">Todas</option>
              <option value="sem">Sem nº de obra</option>
              <option value="com">Com nº de obra</option>
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="fil-busca">Buscar</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="fil-busca"
                className="pl-8"
                placeholder="Nº obra, máquina ou avaria..."
                value={fBusca}
                onChange={(e) => setFBusca(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="card-sombra">
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead>
                <tr className="border-b text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                  {["Nº Obra", "Equipamento", "Categoria", "Sector", "Avaria / Motivo", "Abertura", "Dias s/nº", "Estado Físico", "Estado Obra", ""].map((c) => (
                    <th key={c} className="px-2 py-2 font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {aCarregar ? (
                  <tr>
                    <td colSpan={10} className="px-2 py-8 text-center text-muted-foreground">
                      <span className="inline-flex items-center gap-2">
                        <Rodar /> A carregar ordens de serviço...
                      </span>
                    </td>
                  </tr>
                ) : lista.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-2 py-8 text-center text-muted-foreground">
                      Nenhuma obra encontrada com os filtros escolhidos.
                    </td>
                  </tr>
                ) : (
                  lista.map((o) => {
                    const eq = mapaEquip.get(o.equipment_id);
                    const diasSemNr =
                      !o.numero_obra && o.status_atual !== "Fechada" ? diasDesde(o.data_abertura) : null;
                    return (
                      <tr key={o.id} className="border-b transition-colors last:border-0 hover:bg-muted/50">
                        <td className="px-2 py-2">
                          <a
                            href={`/oficina/ordens/${o.id}`}
                            className="font-semibold text-primario hover:underline dark:text-primario-forte"
                          >
                            {o.numero_obra || <span className="text-xs text-muted-foreground">s/nº</span>}
                          </a>
                        </td>
                        <td className="px-2 py-2">
                          <a
                            href={`/oficina/ordens/${o.id}`}
                            className="font-semibold text-info hover:underline"
                          >
                            {eq?.code || "-"}
                          </a>
                        </td>
                        <td className="px-2 py-2">{eq?.fleet_type || "-"}</td>
                        <td className="px-2 py-2">{o.sector || "-"}</td>
                        <td className="max-w-52 px-2 py-2" title={o.descricao_avaria || ""}>
                          {truncar(o.descricao_avaria)}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">{formatarData(o.data_abertura)}</td>
                        <td className="px-2 py-2">
                          {diasSemNr !== null ? (
                            <span className={diasSemNr > 14 ? "font-bold text-erro" : diasSemNr > 7 ? "font-bold text-ambar-texto dark:text-ambar" : "font-semibold"}>
                              {diasSemNr}d
                            </span>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <EtiquetaFisico estado={o.status_fisico} />
                        </td>
                        <td className="px-2 py-2">
                          <EtiquetaEstado estado={o.status_atual} />
                        </td>
                        <td className="px-2 py-2 text-right">
                          {podeApagar && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="size-8 p-0 text-erro hover:text-erro"
                              title="Apagar obra"
                              onClick={() => apagarOS(o)}
                            >
                              <Trash2 aria-hidden />
                            </Button>
                          )}
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

      {/* Modal Nova Obra */}
      <Modal
        aberto={modalNova}
        fechar={() => setModalNova(false)}
        titulo="Nova Ordem de Serviço"
        subtitulo="Os campos com * são obrigatórios."
      >
        <form onSubmit={criarOS} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="n-numero">Nº Obra (fornecido pela CdM)</Label>
            <Input
              id="n-numero"
              value={fNumeroObra}
              onChange={(e) => setFNumeroObra(e.target.value)}
              placeholder="Deixar vazio se ainda não foi atribuído"
            />
            <p className="text-xs text-muted-foreground">Opcional - pode preencher-se depois.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="n-equip">
                Equipamento <span className="text-erro">*</span>
              </Label>
              {/* Campo com pesquisa: escreve o nº da máquina e a lista descarrega */}
              <SelecionarEquipamento
                id="n-equip"
                equipamentos={dados?.equipamentos || []}
                value={fEquipamento}
                onChange={setFEquipamento}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-sector">
                Sector <span className="text-erro">*</span>
              </Label>
              <select
                id="n-sector"
                required
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={fSectorNovo}
                onChange={(e) => setFSectorNovo(e.target.value)}
              >
                <option value="">- Selecionar -</option>
                {SECTORES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="n-horimetro">Contador do Equipamento</Label>
            <div className="flex gap-2">
              <Input
                id="n-horimetro"
                type="number"
                min="0"
                step="0.1"
                value={fHorimetro}
                onChange={(e) => setFHorimetro(e.target.value)}
                placeholder="Ex: 4521"
              />
              <select
                aria-label="Unidade de medida"
                className="border-input bg-transparent h-9 w-20 rounded-md border px-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={fUnidade}
                onChange={(e) => setFUnidade(e.target.value)}
              >
                <option value="h">h</option>
                <option value="km">km</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="n-avaria">
              Diagnóstico / Avaria / Motivo de Entrada <span className="text-erro">*</span>
            </Label>
            <textarea
              id="n-avaria"
              required
              rows={3}
              className="border-input bg-transparent w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fAvaria}
              onChange={(e) => setFAvaria(e.target.value)}
              placeholder="Ex: Falha no sistema de marcha, ruído no motor..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de Intervenção</Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {TIPOS_INTERVENCAO.map((t) => (
                <label key={t} className="flex items-center gap-2 text-xs font-normal">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-[var(--primario)]"
                    checked={fTipos.includes(t)}
                    onChange={(e) =>
                      setFTipos((atual) =>
                        e.target.checked ? [...atual, t] : atual.filter((x) => x !== t)
                      )
                    }
                  />
                  {t}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="n-fisico">
                Estado Físico <span className="text-erro">*</span>
              </Label>
              <select
                id="n-fisico"
                required
                className="border-input bg-transparent h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
                value={fFisicoNovo}
                onChange={(e) => setFFisicoNovo(e.target.value)}
              >
                <option value="">- Selecionar -</option>
                {ESTADOS_FISICO.filter((s) => s !== "Concluído").map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-data">
                Data de Abertura <span className="text-erro">*</span>
              </Label>
              <Input
                id="n-data"
                type="date"
                required
                value={fDataAbertura}
                onChange={(e) => setFDataAbertura(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Aberto por</Label>
            <Input
              value={buscaColab}
              onChange={(e) => setBuscaColab(e.target.value)}
              placeholder="Pesquisar por nome ou código..."
              autoComplete="off"
            />
            {buscaColab && (
              <div className="max-h-36 overflow-y-auto rounded-md border">
                {candidatosColab.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum resultado.</p>
                ) : (
                  candidatosColab.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent"
                      onClick={() => {
                        setSelecionados((atual) => [...atual, c]);
                        setBuscaColab("");
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
            {selecionados.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selecionados.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
                  >
                    {c.name}
                    <button
                      type="button"
                      aria-label={`Remover ${c.name}`}
                      className="text-muted-foreground hover:text-erro"
                      onClick={() => setSelecionados((atual) => atual.filter((x) => x.id !== c.id))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Podes selecionar mais de um colaborador.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="n-obs">Observações</Label>
            <textarea
              id="n-obs"
              rows={2}
              className="border-input bg-transparent w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
              value={fObservacoes}
              onChange={(e) => setFObservacoes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalNova(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={aCriar}>
              {aCriar && <Rodar />}
              Criar Obra
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
