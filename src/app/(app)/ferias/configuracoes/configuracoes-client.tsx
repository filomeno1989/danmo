/**
 * /ferias/configuracoes - Cliente.
 *
 * Três cartões: REGRAS do ciclo (limite por setor/mês, exceção, aviso
 * prévio, dias antes do envio, mês da folha), FERIADOS (fixos que
 * repetem todos os anos e pontuais/móveis, como o Eid) e MANUTENÇÃO
 * (backup do ano em JSON + limpezas com dupla confirmação, só quem
 * tem permissão de apagar).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, Download, LoaderCircle, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataHojeISO } from "@/lib/rh";
import {
  MESES_FERIAS,
  feriadosDoAno,
  nomeMes,
  type ConfigFerias,
  type FeriadoFerias,
  type LinhaPlano
} from "@/lib/ferias";

type LinhaBackup = { collaborator_id: number; mes_previsto: number | null };

export function ConfiguracoesClient({ podeApagar }: { podeApagar: boolean }) {
  const hoje = dataHojeISO();
  const [config, setConfig] = useState<ConfigFerias | null>(null);
  const [feriados, setFeriados] = useState<FeriadoFerias[]>([]);
  const [carregou, setCarregou] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [novoFeriado, setNovoFeriado] = useState({ data: "", descricao: "", recorrente: true });
  const [anoManutencao, setAnoManutencao] = useState(Number(hoje.slice(0, 4)));

  async function carrega() {
    try {
      const d = await pedir<{ ok: boolean; config: ConfigFerias | null; feriados: FeriadoFerias[] }>(
        "/api/ferias/configuracoes"
      );
      setConfig(d.config);
      setFeriados(d.feriados);
      setCarregou(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha a carregar a configuração.");
      setCarregou(true);
    }
  }

  useEffect(() => {
    let vivo = true;
    pedir<{ ok: boolean; config: ConfigFerias | null; feriados: FeriadoFerias[] }>(
      "/api/ferias/configuracoes"
    )
      .then((d) => {
        if (!vivo) return;
        setConfig(d.config);
        setFeriados(d.feriados);
        setCarregou(true);
      })
      .catch(() => {
        if (!vivo) return;
        toast.error("Falha a carregar a configuração.");
        setCarregou(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  function muda(campo: keyof ConfigFerias, valor: string | boolean | number) {
    setConfig((c) => (c ? { ...c, [campo]: valor } : c));
  }

  async function gravaRegras() {
    if (!config) return;
    setOcupado("regras");
    try {
      await enviar(
        "/api/ferias/configuracoes",
        {
          limite_departamento: Number(config.limite_departamento),
          permitir_excedente: config.permitir_excedente,
          dias_aviso_alteracao: Number(config.dias_aviso_alteracao),
          dias_antes_envio_rh: Number(config.dias_antes_envio_rh),
          mes_planeamento: Number(config.mes_planeamento)
        },
        "Regras gravadas.",
        "PUT"
      );
      await carrega();
    } catch {
      /* toast já mostrado */
    } finally {
      setOcupado("");
    }
  }

  async function feriadoNovo() {
    if (!novoFeriado.data || !novoFeriado.descricao.trim()) {
      toast.error("Feriado precisa de data e descrição.");
      return;
    }
    setOcupado("feriado");
    try {
      await enviar(
        "/api/ferias/configuracoes",
        { accao: "feriado_novo", ...novoFeriado, descricao: novoFeriado.descricao.trim() },
        "Feriado acrescentado."
      );
      setNovoFeriado({ data: "", descricao: "", recorrente: true });
      await carrega();
    } catch {
      /* toast já mostrado */
    } finally {
      setOcupado("");
    }
  }

  async function feriadoApaga(f: FeriadoFerias) {
    if (!window.confirm(`Apagar o feriado "${f.descricao}"?`)) return;
    setOcupado("feriado");
    try {
      await enviar("/api/ferias/configuracoes", { accao: "feriado_apagar", id: f.id }, "Feriado apagado.");
      await carrega();
    } catch {
      /* toast já mostrado */
    } finally {
      setOcupado("");
    }
  }

  const doAno = useMemo(() => feriadosDoAno(feriados, anoManutencao), [feriados, anoManutencao]);

  async function backup() {
    setOcupado("backup");
    try {
      const plano = await pedir<{ plano: LinhaPlano[]; alteracoes: unknown[] }>(
        `/api/ferias/plano?ano=${anoManutencao}`
      );
      const corpo = {
        modulo: "plano-de-ferias",
        ano: anoManutencao,
        gerado_em: new Date().toISOString(),
        config,
        feriados,
        plano: plano.plano,
        alteracoes: plano.alteracoes
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(corpo, null, 2)], { type: "application/json" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup-ferias-${anoManutencao}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Backup de ${anoManutencao} descarregado.`);
    } catch {
      toast.error("Falha a gerar o backup.");
    } finally {
      setOcupado("");
    }
  }

  async function limpar(accao: "limpar_plano" | "limpar_alteracoes") {
    const oQue = accao === "limpar_plano" ? "a folha (plano)" : "o histórico de alterações";
    if (!window.confirm(`APAGAR ${oQue} de ${anoManutencao}? Esta limpeza não volta atrás.`)) return;
    if (!window.confirm(`Última confirmação: apagar ${oQue} de ${anoManutencao}?`)) return;
    setOcupado(accao);
    try {
      await enviar("/api/ferias/configuracoes", { accao, ano: anoManutencao }, "Limpeza feita.");
    } catch {
      /* toast já mostrado */
    } finally {
      setOcupado("");
    }
  }

  return (
    <div className="space-y-5" data-ferias-config>
      <Cabeca
        titulo="Configurações de Férias"
        subtitulo="As regras do ciclo, os feriados e a manutenção da folha."
      />

      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-3 text-base font-bold">Regras do ciclo</h2>
          {!carregou ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar...
            </div>
          ) : !config ? (
            <p className="py-6 text-sm text-muted-foreground">
              A configuração ainda não existe na base (tabela ferias_config): grava uma vez para a
              criar.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <Label>Limite por setor/mês</Label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={config.limite_departamento}
                    onChange={(e) => muda("limite_departamento", e.target.value)}
                    aria-label="Limite por setor e mês"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Aviso prévio p/ alterações (dias)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="365"
                    value={config.dias_aviso_alteracao}
                    onChange={(e) => muda("dias_aviso_alteracao", e.target.value)}
                    aria-label="Aviso prévio em dias"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Dias antes do envio ao RH</Label>
                  <Input
                    type="number"
                    min="0"
                    max="180"
                    value={config.dias_antes_envio_rh}
                    onChange={(e) => muda("dias_antes_envio_rh", e.target.value)}
                    aria-label="Dias antes do envio ao RH"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Mês da folha anual</Label>
                  <select
                    value={config.mes_planeamento}
                    onChange={(e) => muda("mes_planeamento", Number(e.target.value))}
                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                    aria-label="Mês do planeamento"
                  >
                    {MESES_FERIAS.map((m, i) => (
                      <option key={m} value={i + 1}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex cursor-pointer items-center gap-2 text-sm" data-ferias-excedente>
                    <input
                      type="checkbox"
                      checked={config.permitir_excedente}
                      onChange={(e) => muda("permitir_excedente", e.target.checked)}
                      className="size-4 accent-emerald-600"
                    />
                    Permitir exceção ao limite (aviso, não bloqueio)
                  </label>
                </div>
              </div>
              <div className="mt-4 flex justify-end border-t pt-4">
                <Button size="sm" disabled={ocupado === "regras"} onClick={gravaRegras}>
                  {ocupado === "regras" ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
                  Gravar regras
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-3 text-base font-bold">Feriados</h2>
          <div className="mb-4 grid gap-2 sm:grid-cols-[150px_1fr_auto_auto]">
            <Input
              type="date"
              value={novoFeriado.data}
              onChange={(e) => setNovoFeriado((f) => ({ ...f, data: e.target.value }))}
              aria-label="Data do feriado"
            />
            <Input
              value={novoFeriado.descricao}
              onChange={(e) => setNovoFeriado((f) => ({ ...f, descricao: e.target.value }))}
              placeholder="Descrição (ex.: Eid al-Fitr)"
              aria-label="Descrição do feriado"
            />
            <label className="flex cursor-pointer items-center gap-1.5 text-[0.78rem]">
              <input
                type="checkbox"
                checked={novoFeriado.recorrente}
                onChange={(e) => setNovoFeriado((f) => ({ ...f, recorrente: e.target.checked }))}
                className="size-4 accent-emerald-600"
              />
              Repete todos os anos
            </label>
            <Button size="sm" disabled={ocupado === "feriado"} onClick={feriadoNovo}>
              <CalendarPlus className="size-4" aria-hidden /> Acrescentar
            </Button>
          </div>
          {feriados.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem feriados registados.</p>
          ) : (
            <ul className="divide-y" data-ferias-feriados>
              {feriados.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-1.5 text-sm">
                  <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                    {f.recorrente ? f.data.slice(5) : f.data}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{f.descricao}</span>
                  <span className="shrink-0 text-[0.65rem] text-muted-foreground">
                    {f.recorrente ? "fixo" : "pontual"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-red-600"
                    aria-label={`Apagar feriado ${f.descricao}`}
                    onClick={() => feriadoApaga(f)}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[0.7rem] text-muted-foreground">
            {doAno.length} feriado(s) em {anoManutencao}. Os fixos repetem pelo dia e mês; os
            pontuais (Eid, pontes) valem só no ano em que caem.
          </p>
        </CardContent>
      </Card>

      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-3 text-base font-bold">Manutenção</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={anoManutencao}
              onChange={(e) => setAnoManutencao(Number(e.target.value))}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm font-semibold"
              aria-label="Ano da manutenção"
            >
              {[anoManutencao - 2, anoManutencao - 1, anoManutencao, anoManutencao + 1].map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" disabled={ocupado === "backup"} onClick={backup}>
              <Download className="size-4" aria-hidden /> Backup do ano (JSON)
            </Button>
            {podeApagar ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600"
                  disabled={ocupado === "limpar_plano"}
                  onClick={() => limpar("limpar_plano")}
                >
                  <Trash2 className="size-4" aria-hidden /> Limpar plano de {anoManutencao}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600"
                  disabled={ocupado === "limpar_alteracoes"}
                  onClick={() => limpar("limpar_alteracoes")}
                >
                  <Trash2 className="size-4" aria-hidden /> Limpar alterações de {anoManutencao}
                </Button>
              </>
            ) : (
              <span className="text-[0.72rem] text-muted-foreground">
                As limpezas só para quem tem permissão de apagar aqui.
              </span>
            )}
          </div>
          <p className="mt-3 text-[0.72rem] text-muted-foreground">
            Antes de limpar um ano antigo, faz o backup: o JSON guarda a folha, as alterações, os
            feriados e as regras daquele momento.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
