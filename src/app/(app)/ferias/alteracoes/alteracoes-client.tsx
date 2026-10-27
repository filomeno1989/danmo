/**
 * /ferias/alteracoes - Mudanças de mês com auditoria (cliente).
 *
 * Regista adiamentos/antecipações com MOTIVO obrigatório e valida o
 * aviso prévio configurado (o servidor mede outra vez: o navegador não
 * manda). O histórico fica imutável, com badge ⚠ quando o aviso era
 * insuficiente. Novidade face ao hub: Dez -> Jan do ano seguinte (e o
 * inverso) entra na folha do outro ano, como as pessoas esperam.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRightLeft, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataHojeISO } from "@/lib/rh";
import {
  MESES_FERIAS,
  anoDoMesNovo,
  avaliarAviso,
  baseAviso,
  nomeMes,
  problemaAlteracao,
  vivas,
  type AlteracaoFerias,
  type ColabFerias,
  type ConfigFerias,
  type LinhaPlano,
  type LinhaViva
} from "@/lib/ferias";

type Dados = {
  ok: boolean;
  ano: number;
  alteracoes: AlteracaoFerias[];
  plano: LinhaPlano[];
  colaboradores: ColabFerias[];
};

const VAZIO_FORM = { colaborador_id: "", tipo: "Adiamento", mes_novo: "", data_inicio_nova: "", motivo: "" };

export function AlteracoesClient() {
  const hoje = dataHojeISO();
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
  const [dados, setDados] = useState<Dados | null>(null);
  const [config, setConfig] = useState<ConfigFerias | null>(null);
  const [form, setForm] = useState(VAZIO_FORM);
  const [ocupado, setOcupado] = useState(false);
  const [falha, setFalha] = useState("");

  async function carrega(anoNovo = ano) {
    try {
      const d = await pedir<Dados>(`/api/ferias/alteracoes?ano=${anoNovo}`);
      setDados(d);
      setFalha("");
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Falha a carregar o histórico.");
    }
    try {
      const c = await pedir<{ ok: boolean; config: ConfigFerias | null }>(
        "/api/ferias/configuracoes"
      );
      setConfig(c.config);
    } catch {
      setConfig(null);
    }
  }

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<Dados>(`/api/ferias/alteracoes?ano=${ano}`),
      pedir<{ ok: boolean; config: ConfigFerias | null }>("/api/ferias/configuracoes")
    ])
      .then(([d, c]) => {
        if (!vivo) return;
        setDados(d);
        setConfig(c.config);
        setFalha("");
      })
      .catch((e) => {
        if (!vivo) return;
        setDados(null);
        setFalha(e instanceof Error ? e.message : "Falha a carregar o histórico.");
      });
    return () => {
      vivo = false;
    };
  }, [ano]);

  const linhas = useMemo(
    () => (dados ? vivas(dados.plano, dados.colaboradores) : []),
    [dados]
  );
  const comMes = linhas.filter((l) => l.mes_previsto);
  const escolhida = comMes.find((l) => String(l.collaborator_id) === form.colaborador_id) || null;

  const aviso = useMemo(() => {
    if (!escolhida?.mes_previsto || !form.mes_novo) return null;
    const min = config?.dias_aviso_alteracao ?? 30;
    const base = baseAviso(ano, escolhida.mes_previsto, escolhida.data_inicio);
    return { ...avaliarAviso(hoje, base, min), min };
  }, [escolhida, form.mes_novo, config, ano, hoje]);

  const destino = useMemo(() => {
    if (!escolhida?.mes_previsto || !form.mes_novo) return null;
    const novoAno = anoDoMesNovo(ano, form.tipo, escolhida.mes_previsto, Number(form.mes_novo));
    return novoAno === ano ? null : novoAno;
  }, [escolhida, form.mes_novo, form.tipo, ano]);

  const problema = useMemo(
    () =>
      problemaAlteracao({
        tipo: form.tipo,
        mesAnterior: escolhida?.mes_previsto || null,
        mesNovo: form.mes_novo ? Number(form.mes_novo) : 0,
        motivo: form.motivo,
        temMes: Boolean(escolhida?.mes_previsto)
      }),
    [form, escolhida]
  );

  async function grava(aceitas: Record<string, unknown> = {}) {
    if (problema) {
      toast.error(problema);
      return;
    }
    setOcupado(true);
    try {
      await enviar(
        "/api/ferias/alteracoes",
        {
          ano,
          colaborador_id: Number(form.colaborador_id),
          tipo: form.tipo,
          mes_novo: Number(form.mes_novo),
          data_inicio_nova: form.data_inicio_nova || null,
          motivo: form.motivo.trim(),
          ...aceitas
        },
        "Alteração registada na folha e no histórico."
      );
      setForm(VAZIO_FORM);
      await carrega();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (msg.includes("Registar na mesma?") || msg.includes("Confirmar na mesma?")) {
        if (window.confirm(msg)) {
          await grava({ aceita_aviso: true, aceita_excedente: true });
        }
        setOcupado(false);
        return;
      }
      /* toast já mostrado pelo enviar */
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="space-y-5" data-ferias-alteracoes>
      <Cabeca
        titulo="Alterações de Férias"
        subtitulo="Adiamentos e antecipações com motivo obrigatório; o histórico fica guardado."
      >
        <select
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-semibold"
          aria-label="Ano"
        >
          {[ano - 1, ano, ano + 1].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </Cabeca>

      {falha ? (
        <Card className="card-sombra border-red-300">
          <CardContent className="p-4 text-sm text-red-600">{falha}</CardContent>
        </Card>
      ) : null}

      <Card className="card-sombra">
        <CardContent className="space-y-4 p-4">
          {!dados ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar...
            </div>
          ) : comMes.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Ninguém com mês marcado na folha de {ano}. Marca primeiro na{" "}
              <a href="/ferias/plano" className="font-semibold text-emerald-700 underline">
                folha anual
              </a>
              .
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Colaborador (com mês marcado)</Label>
                  <select
                    value={form.colaborador_id}
                    onChange={(e) => setForm((f) => ({ ...f, colaborador_id: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    aria-label="Colaborador"
                  >
                    <option value="">Escolher...</option>
                    {comMes.map((l) => (
                      <option key={l.id} value={l.collaborator_id}>
                        {l.nome} · {nomeMes(l.mes_previsto)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Tipo</Label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    aria-label="Tipo de alteração"
                  >
                    <option>Adiamento</option>
                    <option>Antecipação</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Mês novo</Label>
                  <select
                    value={form.mes_novo}
                    onChange={(e) => setForm((f) => ({ ...f, mes_novo: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    aria-label="Mês novo"
                  >
                    <option value="">Escolher...</option>
                    {MESES_FERIAS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {destino ? (
                    <p className="text-[0.68rem] text-amber-600">
                      Atravessa o ano: a linha entra na folha de {destino}.
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <Label>Nova data de início (opcional)</Label>
                  <Input
                    type="date"
                    value={form.data_inicio_nova}
                    onChange={(e) => setForm((f) => ({ ...f, data_inicio_nova: e.target.value }))}
                    aria-label="Nova data de início"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Motivo (obrigatório, fica no histórico)</Label>
                <textarea
                  value={form.motivo}
                  onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
                  rows={2}
                  placeholder="ex.: obra da Baixa atrasou, o chefe pediu para depois"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  aria-label="Motivo da alteração"
                />
              </div>
              {aviso ? (
                <p
                  className={
                    "text-[0.72rem] font-semibold " +
                    (aviso.ok ? "text-sucesso" : "text-aviso")
                  }
                  data-ferias-aviso
                >
                  Aviso prévio: {aviso.dias} dia(s){" "}
                  {aviso.ok
                    ? `(ok, mínimo ${aviso.min})`
                    : `(INSUFICIENTE, mínimo ${aviso.min}) - regista só se a direcção souber.`}
                </p>
              ) : null}
              <div className="flex justify-end border-t pt-4">
                <Button size="sm" disabled={ocupado || !!problema} onClick={() => grava()}>
                  {ocupado ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ArrowRightLeft className="size-4" aria-hidden />}
                  Registar alteração
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-3 text-base font-bold">Histórico de {ano}</h2>
          {!dados?.alteracoes.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground" data-ferias-hist-vazio>
              Sem alterações registadas em {ano}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm" data-ferias-hist>
                <thead>
                  <tr className="border-b-2 border-emerald-600 text-left text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2">Quando</th>
                    <th className="py-2 pr-2">Colaborador</th>
                    <th className="py-2 pr-2">Mudança</th>
                    <th className="py-2 pr-2">Motivo</th>
                    <th className="w-28 py-2 pr-2">Aviso prévio</th>
                    <th className="w-40 py-2">Por</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.alteracoes.map((a) => {
                    const nome =
                      dados.colaboradores.find((c) => c.id === a.collaborator_id)?.name ||
                      `(colaborador ${a.collaborator_id})`;
                    return (
                      <tr key={a.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2 text-[0.78rem] tabular-nums">
                          {(a.criado_em || "").slice(0, 10)}
                        </td>
                        <td className="py-1.5 pr-2 font-semibold">{nome}</td>
                        <td className="py-1.5 pr-2 text-[0.8rem]">
                          {a.tipo}: {nomeMes(a.mes_anterior)} → {nomeMes(a.mes_novo)}
                        </td>
                        <td className="max-w-64 py-1.5 pr-2 text-[0.78rem]" title={a.motivo}>
                          <span className="line-clamp-2">{a.motivo}</span>
                        </td>
                        <td className="py-1.5 pr-2">
                          {a.aviso_ok ? (
                            <span className="text-[0.72rem] font-bold text-sucesso">{a.aviso_dias}d ok</span>
                          ) : (
                            <span
                              className="rounded bg-aviso-bg px-1.5 py-0.5 text-[0.72rem] font-bold text-aviso"
                              title="Aviso prévio insuficiente no dia do registo"
                            >
                              ⚠ {a.aviso_dias}d
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 text-[0.72rem] text-muted-foreground">{a.registado_por}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
