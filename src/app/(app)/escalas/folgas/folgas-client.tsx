"use client";

/**
 * Folgas guardadas (cliente): mapa de saldos por pessoa + histórico com
 * gozo, cancelamento e reabertura. O saldo é contado pela lib (mesmo
 * juiz do ecrã, da API e das provas).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir, Rodar } from "@/components/oficina/ui-bits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { semAcentos } from "@/lib/uso-comum";
import { problemaFolga, saldoFolgas, type EscColab, type EscFolga } from "@/lib/escalas";

type Dados = {
  ok: boolean;
  hoje: string;
  sqlFalta?: boolean;
  folgas: EscFolga[];
  colaboradores: EscColab[];
};

export function FolgasClient({ podeMexer, podeApagar }: { podeMexer: boolean; podeApagar: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState("");
  const [busca, setBusca] = useState("");
  const [soGuardadas, setSoGuardadas] = useState(true);
  const [dialogNova, setDialogNova] = useState(false);
  const [novaPessoa, setNovaPessoa] = useState("");
  const [novaValor, setNovaValor] = useState("1");
  const [novaOrigem, setNovaOrigem] = useState("");
  const [novaObs, setNovaObs] = useState("");
  const [dialogGozo, setDialogGozo] = useState<EscFolga | null>(null);
  const [gozoData, setGozoData] = useState("");
  const [gozoEscala, setGozoEscala] = useState(true);
  const [ocupado, setOcupado] = useState("");

  useEffect(() => {
    let vivo = true;
    pedir<Dados>("/api/escalas/folgas")
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        setFalha("");
        if (d.sqlFalta) {
          setFalha("As tabelas da Escala ainda não existem na base. Cola o sql/fase9-escalas.sql no Supabase.");
        }
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const nomeDe = useMemo(
    () => new Map((dados?.colaboradores || []).map((c) => [c.id, c])),
    [dados]
  );

  const saldos = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const f of dados?.folgas || []) {
      if (f.estado !== "guardada") continue;
      mapa.set(f.colaborador_id, (mapa.get(f.colaborador_id) || 0) + (Number(f.valor) || 0));
    }
    return mapa;
  }, [dados]);

  const gente = useMemo(() => {
    const filtro = semAcentos(busca);
    return (dados?.colaboradores || [])
      .filter((c) => c.ativo && (!filtro || semAcentos(c.nome).includes(filtro) || semAcentos(c.codigo).includes(filtro)))
      .sort((a, b) => (saldos.get(b.id) || 0) - (saldos.get(a.id) || 0) || a.nome.localeCompare(b.nome));
  }, [dados, busca, saldos]);

  const lista = useMemo(() => {
    const filtro = semAcentos(busca);
    return (dados?.folgas || [])
      .filter((f) => {
        if (soGuardadas && f.estado !== "guardada") return false;
        const c = nomeDe.get(f.colaborador_id);
        return !filtro || (c && semAcentos(c.nome).includes(filtro));
      })
      .sort((a, b) => (a.data_gozo || "9999").localeCompare(b.data_gozo || "9999"));
  }, [dados, busca, soGuardadas, nomeDe]);

  const gravarNova = async () => {
    const problemas = problemaFolga({ valor: novaValor, data_origem: novaOrigem || undefined, obs: novaObs || undefined });
    if (problemas) {
      toast.error(problemas);
      return;
    }
    setOcupado("nova");
    try {
      await enviar(
        "/api/escalas/folgas",
        {
          colaborador_id: novaPessoa,
          valor: Number(novaValor),
          data_origem: novaOrigem || null,
          obs: novaObs || null
        },
        "Folga guardada."
      );
      setDialogNova(false);
      setNovaPessoa("");
      setNovaValor("1");
      setNovaOrigem("");
      setNovaObs("");
      const d = await pedir<Dados>("/api/escalas/folgas");
      setDados(d);
    } catch {
      // o enviar já mostra o erro
    } finally {
      setOcupado("");
    }
  };

  const marcarGozo = async () => {
    if (!dialogGozo) return;
    setOcupado("gozo");
    try {
      await enviar(
        "/api/escalas/folgas",
        {
          id: dialogGozo.id,
          acao: "gozo",
          data_gozo: gozoData,
          apontarEscala: gozoEscala
        },
        "Gozo marcado.",
        "PATCH"
      );
      setDialogGozo(null);
      const d = await pedir<Dados>("/api/escalas/folgas");
      setDados(d);
    } catch {
      // o enviar já mostra o erro
    } finally {
      setOcupado("");
    }
  };

  const accao = useCallback(
    async (id: string, acao: "cancelar" | "voltar" | "apagar") => {
      setOcupado(acao + id);
      try {
        await enviar("/api/escalas/folgas", { id, acao }, "Feito.", "PATCH");
        const d = await pedir<Dados>("/api/escalas/folgas");
        setDados(d);
      } catch {
        // o enviar já mostra o erro
      } finally {
        setOcupado("");
      }
    },
    []
  );

  if (falha) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{falha}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Cabeca titulo="Folgas Guardadas" subtitulo="Folgas acumuladas que a gente pediu para não gozar no dia por direito">
        {podeMexer ? (
          <Button size="sm" onClick={() => setDialogNova(true)}>
            <Plus className="size-4" aria-hidden /> Nova folga guardada
          </Button>
        ) : null}
      </Cabeca>

      {!dados ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Rodar /> A carregar...
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
          <Card>
            <CardContent className="p-4" data-saldos-folgas>
              <div className="mb-3 flex items-center gap-2">
                <Input
                  className="h-9 w-44"
                  placeholder="Buscar pessoa"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  aria-label="Buscar pessoa"
                />
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-1">Pessoa</th>
                    <th className="py-1 text-right">Saldo guardado</th>
                  </tr>
                </thead>
                <tbody>
                  {gente.map((c) => {
                    const s = saldos.get(c.id) || 0;
                    return (
                      <tr key={c.id} className="border-b">
                        <td className="py-1.5">
                          <span className="font-semibold">{c.nome}</span>
                          <span className="ml-1 text-xs text-muted-foreground">{c.codigo}</span>
                        </td>
                        <td className="py-1.5 text-right tabular-nums">
                          {s ? String(s).replace(".", ",") : "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4" data-lista-folgas>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold">Registos</h2>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={soGuardadas}
                    onChange={(e) => setSoGuardadas(e.target.checked)}
                  />
                  só guardadas
                </label>
              </div>
              {lista.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Sem folgas guardadas.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1">Pessoa</th>
                      <th className="py-1">Origem</th>
                      <th className="py-1">Valor</th>
                      <th className="py-1">Gozo</th>
                      <th className="py-1">Estado</th>
                      {podeMexer ? <th className="py-1 text-right">Acções</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((f) => {
                      const c = nomeDe.get(f.colaborador_id);
                      return (
                        <tr key={f.id} className="border-b">
                          <td className="py-1.5 font-semibold">{c?.nome || "?"}</td>
                          <td className="py-1.5 text-xs text-muted-foreground">
                            {f.data_origem || "-"}
                            {f.obs ? <div className="text-[0.65rem]">{f.obs}</div> : null}
                          </td>
                          <td className="py-1.5 tabular-nums">{String(f.valor).replace(".", ",")}</td>
                          <td className="py-1.5 text-xs">{f.data_gozo || "-"}</td>
                          <td className="py-1.5">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${
                                f.estado === "guardada"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                  : f.estado === "usada"
                                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                                    : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {f.estado === "guardada" ? "guardada" : f.estado === "usada" ? "gozada" : "cancelada"}
                            </span>
                          </td>
                          {podeMexer ? (
                            <td className="py-1.5 text-right">
                              {f.estado === "guardada" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setDialogGozo(f);
                                    setGozoData(f.data_origem || "");
                                  }}
                                >
                                  Marcar gozo
                                </Button>
                              ) : f.estado === "usada" ? (
                                <Button size="sm" variant="outline" onClick={() => void accao(f.id, "voltar")}>
                                  Voltar a guardar
                                </Button>
                              ) : null}
                              {podeApagar ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="ml-1 text-destructive"
                                  onClick={() => void accao(f.id, "apagar")}
                                >
                                  Apagar
                                </Button>
                              ) : null}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {dialogNova ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDialogNova(false)}>
          <div
            className="w-full max-w-md rounded-xl border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Nova folga guardada"
          >
            <h3 className="mb-2 text-base font-bold">Nova folga guardada</h3>
            <div className="space-y-2 text-sm">
              <div>
                <label className="text-xs font-semibold">Pessoa</label>
                <select
                  className="mt-1 h-9 w-full rounded-md border bg-background px-2"
                  value={novaPessoa}
                  onChange={(e) => setNovaPessoa(e.target.value)}
                >
                  <option value="">Escolher...</option>
                  {gente.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} ({c.codigo})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="w-28">
                  <label className="text-xs font-semibold">Valor (dias)</label>
                  <Input className="mt-1" value={novaValor} onChange={(e) => setNovaValor(e.target.value)} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-semibold">Dia por direito (origem)</label>
                  <Input type="date" className="mt-1" value={novaOrigem} onChange={(e) => setNovaOrigem(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold">Observação</label>
                <Input className="mt-1" value={novaObs} onChange={(e) => setNovaObs(e.target.value)} maxLength={200} />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogNova(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={gravarNova} disabled={ocupado === "nova"}>
                {ocupado === "nova" ? <Rodar /> : null} Guardar
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {dialogGozo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDialogGozo(null)}>
          <div
            className="w-full max-w-md rounded-xl border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Marcar gozo"
          >
            <h3 className="mb-2 text-base font-bold">
              Marcar gozo de {nomeDe.get(dialogGozo.colaborador_id)?.nome || ""}
            </h3>
            <div className="space-y-2 text-sm">
              <div>
                <label className="text-xs font-semibold">Dia do gozo</label>
                <Input type="date" className="mt-1" value={gozoData} onChange={(e) => setGozoData(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={gozoEscala} onChange={(e) => setGozoEscala(e.target.checked)} />
                apontar Folga na escala neste dia (pode ser sobrescrita à mão)
              </label>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDialogGozo(null)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={marcarGozo} disabled={ocupado === "gozo"}>
                {ocupado === "gozo" ? <LoaderCircle className="size-4 animate-spin" /> : null} Marcar
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
