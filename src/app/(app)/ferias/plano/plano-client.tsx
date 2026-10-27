/**
 * /ferias/plano - Folha anual editável (o "plano de Outubro").
 *
 * Clique num mês marca as férias; clique numa marca abre o editor com
 * os dias do RH, o início e a observação. O limite por setor/mês é
 * validado no servidor e pintado a vermelho nas células.
 *
 * Ceifa do hub (8 páginas -> 1 folha): os KPIs do index vivem aqui no
 * topo, o editor substitui o modal de força-edição e o lançamento do
 * rh-mensal, e o calendário visual morre (esta grelha É o ano inteiro).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  CalendarX2,
  Copy,
  Download,
  LoaderCircle,
  Printer,
  Rows3,
  Search
} from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { dataHojeISO } from "@/lib/rh";
import { semAcentos } from "@/lib/uso-comum";
import {
  MESES_FERIAS,
  ROTULO_ESTADO,
  estadoDaLinha,
  excedentes,
  fimDe,
  nomeMes,
  paraCSV,
  vivas,
  type AlteracaoFerias,
  type ColabFerias,
  type ConfigFerias,
  type EstadoLinha,
  type FeriadoFerias,
  type LinhaPlano,
  type LinhaViva
} from "@/lib/ferias";

type Dados = {
  ok: boolean;
  ano: number;
  plano: LinhaPlano[];
  colaboradores: ColabFerias[];
  config: ConfigFerias | null;
  feriados: FeriadoFerias[];
  alteracoes: AlteracaoFerias[];
};

const COR_ESTADO: Record<EstadoLinha, string> = {
  planeado: "bg-muted text-foreground border",
  aguardaRH: "bg-aviso-bg text-aviso border border-aviso/30",
  confirmado: "bg-sucesso-bg text-sucesso border border-sucesso/30",
  emCurso: "bg-primario text-white border border-primario",
  gozadas: "bg-muted/40 text-muted-foreground border border-border"
};

function anoDeEntrada(): number {
  const hoje = dataHojeISO();
  const ano = Number(hoje.slice(0, 4));
  /* Outubro em diante já se planeia o ano seguinte (mês 10 = folha nova). */
  return Number(hoje.slice(5, 7)) >= 10 ? ano + 1 : ano;
}

export function PlanoClient() {
  const [ano, setAno] = useState(anoDeEntrada());
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [pesquisa, setPesquisa] = useState("");
  const [setorFiltro, setSetorFiltro] = useState("");
  const [editada, setEditada] = useState<LinhaViva | null>(null);

  async function carrega(anoNovo = ano) {
    try {
      const d = await pedir<Dados>(`/api/ferias/plano?ano=${anoNovo}`);
      setDados(d);
      setFalha("");
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Falha a carregar o plano.");
    }
  }

  useEffect(() => {
    let vivo = true;
    pedir<Dados>(`/api/ferias/plano?ano=${ano}`)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        setFalha("");
      })
      .catch((e) => {
        if (!vivo) return;
        setFalha(e instanceof Error ? e.message : "Falha a carregar o plano.");
      });
    return () => {
      vivo = false;
    };
  }, [ano]);

  const linhas = useMemo(
    () => (dados ? vivas(dados.plano, dados.colaboradores) : []),
    [dados]
  );
  const excedido = useMemo(() => {
    const limite = dados?.config?.limite_departamento ?? 2;
    return new Set(excedentes(linhas, limite).map((e) => `${e.setor}|${e.mes}`));
  }, [linhas, dados]);

  const setores = useMemo(
    () => [...new Set((dados?.colaboradores || []).map((c) => c.setor?.trim() || "Sem setor"))].sort(),
    [dados]
  );

  const visiveis = useMemo(() => {
    const q = semAcentos(pesquisa.trim().toLowerCase());
    return (dados?.colaboradores || []).filter((c) => {
      const setor = c.setor?.trim() || "Sem setor";
      if (setorFiltro && setor !== setorFiltro) return false;
      if (!q) return true;
      const linha = linhas.find((l) => l.collaborator_id === c.id);
      const alvo = `${c.name} ${c.code || ""} ${setor} ${linha?.mes_previsto ? nomeMes(linha.mes_previsto) : ""}`;
      return semAcentos(alvo.toLowerCase()).includes(q);
    });
  }, [dados, linhas, pesquisa, setorFiltro]);

  const hoje = dataHojeISO();
  const comMes = linhas.filter((l) => l.mes_previsto).length;
  const confirmados = linhas.filter((l) =>
    ["confirmado", "emCurso", "gozadas"].includes(estadoDaLinha(l, hoje))
  ).length;
  const emCurso = linhas.filter((l) => estadoDaLinha(l, hoje) === "emCurso").length;
  const limite = dados?.config?.limite_departamento ?? 2;

  async function acao(corpo: Record<string, unknown>, msgOk?: string) {
    setOcupado(String(corpo.accao || ""));
    try {
      const r = await enviar<{ ok: boolean; enviadas?: number; criadas?: number; copiadas?: number }>(
        "/api/ferias/plano",
        corpo,
        msgOk
      );
      await carrega();
      return r;
    } finally {
      setOcupado("");
    }
  }

  async function marca(colab: ColabFerias, mes: number) {
    try {
      await acao({ accao: "marcar", colaborador_id: colab.id, ano, mes }, "Mês marcado.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha a marcar.";
      if (msg.includes("Confirmar na mesma?")) {
        if (!window.confirm(msg)) return;
        try {
          await acao(
            { accao: "marcar", colaborador_id: colab.id, ano, mes, aceita_excedente: true },
            "Mês marcado (exceção registada na folha)."
          );
        } catch {
          /* toast já mostrado pelo enviar */
        }
        return;
      }
      /* enviar() já mostra o toast de erro */
    }
  }

  async function desmarca(colaboradorId: number, nome: string) {
    if (!window.confirm(`Tirar ${nome} do plano de ${ano}?`)) return;
    try {
      await acao({ accao: "desmarcar", colaborador_id: colaboradorId, ano }, "Mês retirado.");
    } catch {
      /* toast já mostrado */
    }
    setEditada(null);
  }

  async function gravaEdicao(form: {
    colaborador_id: number;
    mes: number | null;
    dias_rh: string;
    data_inicio: string;
    obs_rh: string;
  }) {
    try {
      await acao(
        {
          accao: "gravar",
          colaborador_id: form.colaborador_id,
          ano,
          mes: form.mes,
          dias_rh: form.dias_rh === "" ? null : Number(form.dias_rh),
          data_inicio: form.data_inicio || null,
          obs_rh: form.obs_rh || null
        },
        "Linha gravada."
      );
      setEditada(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha a gravar.";
      if (msg.includes("Confirmar na mesma?")) {
        if (!window.confirm(msg)) return;
        try {
          await acao(
            {
              accao: "gravar",
              colaborador_id: form.colaborador_id,
              ano,
              mes: form.mes,
              dias_rh: form.dias_rh === "" ? null : Number(form.dias_rh),
              data_inicio: form.data_inicio || null,
              obs_rh: form.obs_rh || null,
              aceita_excedente: true
            },
            "Linha gravada (exceção registada na folha)."
          );
          setEditada(null);
        } catch {
          /* toast já mostrado */
        }
        return;
      }
      /* toast já mostrado */
    }
  }

  function descarregaCSV() {
    if (!linhas.length) {
      toast.info("Sem linhas para exportar.");
      return;
    }
    const csv = paraCSV(
      ["Nome", "Código", "Setor", "Mês", "Estado", "Dias (RH)", "Início", "Fim", "Obs."],
      [...linhas]
        .sort((a, b) => a.nome.localeCompare(b.nome))
        .map((l) => [
          l.nome,
          l.codigo,
          l.setor,
          l.mes_previsto ? `${nomeMes(l.mes_previsto)} ${ano}` : "",
          ROTULO_ESTADO[estadoDaLinha(l, hoje)],
          l.dias_rh,
          l.data_inicio,
          l.data_fim,
          l.obs_rh
        ])
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `plano-ferias-${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function celula(colab: ColabFerias, mes: number) {
    const linha = linhas.find((l) => l.collaborator_id === colab.id);
    const marcado = linha?.mes_previsto === mes;
    const setor = colab.setor?.trim() || "Sem setor";
    const cheio = excedido.has(`${setor}|${mes}`);
    if (!marcado) {
      return (
        <button
          type="button"
          aria-label={`Marcar ${nomeMes(mes)} para ${colab.name}`}
          disabled={ocupado === "marcar"}
          onClick={() => marca(colab, mes)}
          className="h-8 w-full rounded border border-dashed border-border text-muted-foreground/30 transition-colors hover:border-emerald-500/60 hover:bg-emerald-500/5 hover:text-emerald-600"
        />
      );
    }
    const estado = estadoDaLinha(linha, hoje);
    return (
      <button
        type="button"
        data-celula-ferias={estado}
        aria-label={`${nomeMes(mes)} de ${colab.name}: ${ROTULO_ESTADO[estado]}`}
        onClick={() => setEditada(linha)}
        className={
          "h-8 w-full rounded px-1 text-[0.62rem] font-bold leading-tight " +
          COR_ESTADO[estado] +
          (cheio ? " ring-2 ring-red-500" : "")
        }
        title={cheio ? `Setor "${setor}" acima do limite de ${limite}` : ROTULO_ESTADO[estado]}
      >
        {estado === "confirmado" || estado === "emCurso" || estado === "gozadas"
          ? `${linha.dias_rh || 0}d`
          : estado === "aguardaRH"
            ? "RH"
            : "✓"}
      </button>
    );
  }

  return (
    <div className="space-y-5" data-ferias-plano>
      <Cabeca
        titulo="Plano de Férias"
        subtitulo="Folha anual: clica no mês para marcar; clica na marca para lançar os dias do RH."
      >
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-semibold"
          aria-label="Ano do plano"
        >
          {[ano - 2, ano - 1, ano, ano + 1, ano + 2].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Button
          variant="outline"
          size="sm"
          disabled={ocupado === "carregar_todos"}
          onClick={async () => {
            if (!window.confirm(`Criar linha para todos os colaboradores activos em ${ano}?`)) return;
            try {
              const r = await acao({ accao: "carregar_todos", ano }, "Linhas criadas.");
              if (r?.criadas === 0) toast.info("Todos já tinham linha.");
            } catch {
              /* toast já mostrado */
            }
          }}
        >
          <Rows3 className="size-4" aria-hidden /> Carregar todos
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={ocupado === "duplicar_ano"}
          onClick={async () => {
            if (!window.confirm(`Copiar os meses de ${ano - 1} para ${ano}? (só os meses, sem dias)`)) return;
            try {
              const r = await acao({ accao: "duplicar_ano", de: ano - 1, ano }, "Plano duplicado.");
              if (r?.copiadas === 0) toast.info("Nada a copiar (linhas já existem ou origem vazia).");
            } catch {
              /* toast já mostrado */
            }
          }}
        >
          <Copy className="size-4" aria-hidden /> Duplicar {ano - 1}
        </Button>
        <Button variant="outline" size="sm" onClick={descarregaCSV}>
          <Download className="size-4" aria-hidden /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> Imprimir
        </Button>
      </Cabeca>

      {falha ? (
        <Card className="card-sombra border-red-300">
          <CardContent className="p-4 text-sm text-red-600">{falha}</CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-ferias-kpis>
        {[
          { label: "Colaboradores activos", valor: dados?.colaboradores.length ?? "..." },
          { label: "Com mês marcado", valor: `${comMes} de ${dados?.colaboradores.length ?? 0}` },
          { label: "Dias já do RH", valor: confirmados },
          { label: "De férias hoje", valor: emCurso }
        ].map((k) => (
          <Card key={k.label} className="card-sombra">
            <CardContent className="p-3.5">
              <div className="text-[0.7rem] font-medium text-muted-foreground">{k.label}</div>
              <div className="text-xl font-bold">{k.valor}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
            <div className="relative">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={pesquisa}
                onChange={(e) => setPesquisa(e.target.value)}
                placeholder="Pesquisar nome, código, setor..."
                className="w-56 pl-8"
                aria-label="Pesquisar colaborador"
              />
            </div>
            <select
              value={setorFiltro}
              onChange={(e) => setSetorFiltro(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              aria-label="Filtrar por setor"
            >
              <option value="">Todos os setores</option>
              {setores.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className="ml-auto text-xs text-muted-foreground">
              Limite por setor/mês: <b>{limite}</b>
              {dados?.config?.permitir_excedente ? " (exceção permitida)" : " (bloqueado)"} · células
              a vermelho passaram
            </span>
          </div>

          {!dados ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar a folha...
            </div>
          ) : visiveis.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              Ninguém com estes filtros.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm" data-ferias-grelha>
                <thead>
                  <tr className="border-b-2 border-emerald-600 text-left text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                    <th className="w-56 py-2 pr-2">Colaborador</th>
                    {MESES_FERIAS.map((m, i) => (
                      <th key={m} className="px-0.5 py-2 text-center">
                        {m.slice(0, 3)}
                        {i + 1 === Number(hoje.slice(5, 7)) ? " •" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((c) => {
                    const setor = c.setor?.trim() || "Sem setor";
                    return (
                      <tr key={c.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2">
                          <div className="truncate text-[0.8rem] font-semibold" title={c.name}>
                            {c.name}
                          </div>
                          <div className="truncate text-[0.65rem] text-muted-foreground">
                            {c.code ? `${c.code} · ` : ""}
                            {setor}
                          </div>
                        </td>
                        {MESES_FERIAS.map((_, i) => (
                          <td key={i} className="px-0.5 py-1.5">
                            {celula(c, i + 1)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 hidden print:block" data-ferias-assinaturas>
            <div className="mt-16 flex justify-between text-sm">
              <div className="border-t border-black px-10 pt-1">Feito por: Administração Oficinal</div>
              <div className="border-t border-black px-10 pt-1">Visto Direcção</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Modal
        aberto={!!editada}
        fechar={() => setEditada(null)}
        titulo={editada ? `Férias de ${editada.nome}` : ""}
        subtitulo={
          editada
            ? `${editada.setor} · ${nomeMes(editada.mes_previsto)} de ${ano}`
            : undefined
        }
      >
        {editada ? (
          <EditorLinha
            linha={editada}
            ano={ano}
            ocupado={ocupado === "gravar"}
            onGrava={gravaEdicao}
            onTira={() => desmarca(editada.collaborator_id, editada.nome)}
          />
        ) : null}
      </Modal>
    </div>
  );
}

function EditorLinha({
  linha,
  ano,
  ocupado,
  onGrava,
  onTira
}: {
  linha: LinhaViva;
  ano: number;
  ocupado: boolean;
  onGrava: (form: {
    colaborador_id: number;
    mes: number | null;
    dias_rh: string;
    data_inicio: string;
    obs_rh: string;
  }) => void;
  onTira: () => void;
}) {
  const [mes, setMes] = useState<number | null>(linha.mes_previsto);
  const [dias, setDias] = useState(linha.dias_rh ? String(linha.dias_rh) : "");
  const [inicio, setInicio] = useState(linha.data_inicio || "");
  const [obs, setObs] = useState(linha.obs_rh || "");

  const fim = inicio && Number(dias) > 0 ? fimDe(inicio, Number(dias)) : "";
  return (
    <div className="space-y-4 px-5 pb-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Mês</Label>
          <select
            value={mes || ""}
            onChange={(e) => setMes(e.target.value ? Number(e.target.value) : null)}
            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            aria-label="Mês de férias"
          >
            <option value="">Sem mês</option>
            {MESES_FERIAS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Dias de direito (RH central)</Label>
          <Input
            type="number"
            min="1"
            max="366"
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            placeholder="ex.: 22"
            aria-label="Dias de direito"
          />
        </div>
        <div className="space-y-1">
          <Label>Início</Label>
          <Input
            type="date"
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
            aria-label="Data de início"
          />
        </div>
        <div className="space-y-1">
          <Label>Fim (dias corridos)</Label>
          <Input value={fim} readOnly aria-label="Data de fim calculada" className="bg-muted" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Observação</Label>
        <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="ex.: confirmado pelo RH por email" aria-label="Observação" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <Button variant="outline" size="sm" onClick={onTira} className="text-red-600">
          <CalendarX2 className="size-4" aria-hidden /> Tirar do plano
        </Button>
        <Button size="sm" disabled={ocupado} onClick={() => onGrava({ colaborador_id: linha.collaborator_id, mes, dias_rh: dias, data_inicio: inicio, obs_rh: obs })}>
          {ocupado ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <CalendarCheck className="size-4" aria-hidden />}
          Gravar
        </Button>
      </div>
      <p className="text-[0.7rem] text-muted-foreground">
        Ao mudar o mês, os dias e o início do RH são limpos: o mês mudou, os dias têm de ser
        revalidados pelo RH central.
      </p>
    </div>
  );
}
