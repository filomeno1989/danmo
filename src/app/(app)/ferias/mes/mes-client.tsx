/**
 * /ferias/mes - O ciclo mensal do RH central (cliente).
 *
 * 1. Copiar o texto do email com a lista do mês;
 * 2. Marcar como enviado ao RH (fica Aguarda RH);
 * 3. O RH responde: lançam-se os dias de direito e o início (o fim sai
 *    sozinho, dias corridos);
 * 4. Imprimir a folha de afixação (rota /imprimir/ferias/mes/...).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, Download, LoaderCircle, MailCheck, Printer, Save } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { dataHojeISO } from "@/lib/rh";
import {
  ROTULO_ESTADO,
  diasAtePrazoEnvio,
  estadoDaLinha,
  fimDe,
  nomeMes,
  paraCSV,
  textoEmailRh,
  vivas,
  type AlteracaoFerias,
  type ColabFerias,
  type ConfigFerias,
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

export function MesClient() {
  const hoje = dataHojeISO();
  const [ano, setAno] = useState(Number(hoje.slice(0, 4)));
  const [mes, setMes] = useState(Number(hoje.slice(5, 7)));
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState("");
  const [ocupado, setOcupado] = useState(false);
  /* Rascunho dos dias/início/obs por linha (grava linha a linha). */
  const [rascunho, setRascunho] = useState<
    Record<string, { dias: string; inicio: string; obs: string }>
  >({});

  async function carrega(anoNovo = ano) {
    try {
      const d = await pedir<Dados>(`/api/ferias/plano?ano=${anoNovo}`);
      setDados(d);
      setFalha("");
    } catch (e) {
      setFalha(e instanceof Error ? e.message : "Falha a carregar a folha do mês.");
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
        setFalha(e instanceof Error ? e.message : "Falha a carregar a folha do mês.");
      });
    return () => {
      vivo = false;
    };
  }, [ano]);

  const linhas = useMemo(() => {
    if (!dados) return [] as LinhaViva[];
    return vivas(dados.plano, dados.colaboradores)
      .filter((l) => l.mes_previsto === mes)
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dados, mes]);

  const porEnviar = linhas.filter((l) => !l.enviado_rh_em).length;
  const config = dados?.config || null;
  const faltam = diasAtePrazoEnvio(hoje, mes, config?.dias_antes_envio_rh ?? 10);
  const prazoVisivel = porEnviar > 0 && faltam <= (config?.dias_antes_envio_rh ?? 10);

  function rascunhoDe(l: LinhaViva) {
    return (
      rascunho[l.id] || {
        dias: l.dias_rh ? String(l.dias_rh) : "",
        inicio: l.data_inicio || "",
        obs: l.obs_rh || ""
      }
    );
  }

  function mudaRascunho(id: string, campo: "dias" | "inicio" | "obs", valor: string) {
    setRascunho((r) => ({
      ...r,
      [id]: { ...rascunhoDe(linhas.find((l) => l.id === id)!), [campo]: valor }
    }));
  }

  async function gravarLinha(l: LinhaViva) {
    const r = rascunhoDe(l);
    if (r.dias !== "" && !(Number(r.dias) > 0)) {
      toast.error("Os dias de direito devem ser um número maior que zero.");
      return;
    }
    if (r.inicio && r.dias === "") {
      toast.error("Lançou a data de início sem os dias de direito.");
      return;
    }
    setOcupado(true);
    try {
      await enviar(
        "/api/ferias/plano",
        {
          accao: "gravar",
          colaborador_id: l.collaborator_id,
          ano,
          mes: l.mes_previsto,
          dias_rh: r.dias === "" ? null : Number(r.dias),
          data_inicio: r.inicio || null,
          obs_rh: r.obs || null
        },
        `Dias de ${l.nome} gravados.`
      );
      await carrega();
    } catch {
      /* toast já mostrado */
    } finally {
      setOcupado(false);
    }
  }

  async function marcarEnviado() {
    setOcupado(true);
    try {
      await enviar(
        "/api/ferias/plano",
        { accao: "marcar_enviado", ano, mes },
        "Lista marcada como enviada ao RH central."
      );
      await carrega();
    } catch {
      /* toast já mostrado */
    } finally {
      setOcupado(false);
    }
  }

  async function copiarEmail() {
    if (!linhas.length) {
      toast.info("Ninguém marcado neste mês.");
      return;
    }
    const txt = textoEmailRh(
      ano,
      mes,
      linhas.map((l) => ({ nome: l.nome, codigo: l.codigo, categoria: l.categoria, setor: l.setor })),
      "Administração Oficinal"
    );
    try {
      await navigator.clipboard.writeText(txt);
      toast.success("Texto copiado - cole no email para o RH central.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast.success("Texto copiado - cole no email para o RH central.");
    }
  }

  function descarregaCSV() {
    if (!linhas.length) {
      toast.info("Ninguém marcado neste mês.");
      return;
    }
    const csv = paraCSV(
      ["Nome", "Código", "Setor", "Dias (RH)", "Início", "Fim", "Estado", "Enviado ao RH", "Obs."],
      linhas.map((l) => [
        l.nome,
        l.codigo,
        l.setor,
        l.dias_rh,
        l.data_inicio,
        l.data_fim,
        ROTULO_ESTADO[estadoDaLinha(l, hoje)],
        l.enviado_rh_em,
        l.obs_rh
      ])
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `ferias-${nomeMes(mes).toLowerCase()}-${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5" data-ferias-mes>
      <Cabeca
        titulo="Folha do Mês"
        subtitulo="O ciclo do RH central: copiar a lista, enviar, lançar os dias e afixar."
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
        <select
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          className="h-9 rounded-md border border-input bg-background px-2 text-sm font-semibold"
          aria-label="Mês"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              {nomeMes(i + 1)}
            </option>
          ))}
        </select>
        <Button variant="outline" size="sm" onClick={copiarEmail}>
          <Copy className="size-4" aria-hidden /> Copiar texto p/ RH
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={ocupado || porEnviar === 0}
          onClick={marcarEnviado}
        >
          <MailCheck className="size-4" aria-hidden /> Marcar como enviado
        </Button>
        <Button variant="outline" size="sm" onClick={descarregaCSV}>
          <Download className="size-4" aria-hidden /> CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.open(`/imprimir/ferias/mes/${ano}/${mes}`, "_blank")}
        >
          <Printer className="size-4" aria-hidden /> Afixação
        </Button>
      </Cabeca>

      {falha ? (
        <Card className="card-sombra border-red-300">
          <CardContent className="p-4 text-sm text-red-600">{falha}</CardContent>
        </Card>
      ) : null}

      {prazoVisivel ? (
        <div
          data-ferias-prazo
          className={
            "card-sombra rounded-lg border p-4 text-sm " +
            (faltam < 0
              ? "border-red-300 bg-erro-bg text-red-700"
              : "border-amber-300 bg-aviso-bg text-amber-700")
          }
        >
          {faltam < 0
            ? `Prazo de envio ao RH já passou (${Math.abs(faltam)} dia(s)): ${porEnviar} colaborador(es) de ${nomeMes(mes)} ainda sem envio.`
            : `Faltam ${faltam} dia(s) para o prazo de envio ao RH: ${porEnviar} colaborador(es) por enviar.`}
        </div>
      ) : null}

      <Card className="card-sombra">
        <CardContent className="p-4">
          {!dados ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar...
            </div>
          ) : linhas.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground" data-ferias-mes-vazio>
              Ninguém com férias marcadas em {nomeMes(mes)} de {ano}. Marca na{" "}
              <a href="/ferias/plano" className="font-semibold text-emerald-700 underline">
                folha anual
              </a>
              .
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm" data-ferias-mes-tabela>
                <thead>
                  <tr className="border-b-2 border-emerald-600 text-left text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-2">Colaborador</th>
                    <th className="w-20 py-2 pr-2">Dias (RH)</th>
                    <th className="w-36 py-2 pr-2">Início</th>
                    <th className="w-32 py-2 pr-2">Fim</th>
                    <th className="min-w-36 py-2 pr-2">Obs.</th>
                    <th className="w-28 py-2 pr-2">Estado</th>
                    <th className="w-14 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, idx) => {
                    const r = rascunhoDe(l);
                    const estado = estadoDaLinha(l, hoje);
                    const fim = r.inicio && Number(r.dias) > 0 ? fimDe(r.inicio, Number(r.dias)) : l.data_fim;
                    return (
                      <tr key={l.id} className="border-b last:border-0">
                        <td className="py-1.5 pr-2">
                          <div className="text-[0.82rem] font-semibold">{idx + 1}. {l.nome}</div>
                          <div className="text-[0.65rem] text-muted-foreground">
                            {l.codigo ? `${l.codigo} · ` : ""}
                            {l.setor}
                            {l.enviado_rh_em ? ` · enviado ${l.enviado_rh_em}` : ""}
                          </div>
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            type="number"
                            min="1"
                            max="366"
                            value={r.dias}
                            onChange={(e) => mudaRascunho(l.id, "dias", e.target.value)}
                            aria-label={`Dias de direito de ${l.nome}`}
                            className="h-8"
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <Input
                            type="date"
                            value={r.inicio}
                            onChange={(e) => mudaRascunho(l.id, "inicio", e.target.value)}
                            aria-label={`Início de ${l.nome}`}
                            className="h-8"
                          />
                        </td>
                        <td className="py-1.5 pr-2 text-[0.78rem] tabular-nums">{fim || "-"}</td>
                        <td className="py-1.5 pr-2">
                          <Input
                            value={r.obs}
                            onChange={(e) => mudaRascunho(l.id, "obs", e.target.value)}
                            aria-label={`Observação de ${l.nome}`}
                            className="h-8"
                          />
                        </td>
                        <td className="py-1.5 pr-2">
                          <span
                            className={
                              "inline-block rounded-full px-2 py-0.5 text-[0.65rem] font-bold " +
                              (estado === "confirmado" || estado === "emCurso"
                                ? "bg-sucesso-bg text-sucesso"
                                : estado === "aguardaRH"
                                  ? "bg-aviso-bg text-aviso"
                                  : "bg-muted text-muted-foreground")
                            }
                          >
                            {ROTULO_ESTADO[estado]}
                          </span>
                        </td>
                        <td className="py-1.5 text-center">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            disabled={ocupado}
                            aria-label={`Gravar dias de ${l.nome}`}
                            onClick={() => gravarLinha(l)}
                          >
                            <Save className="size-4" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[0.7rem] text-muted-foreground">
            Fim calculado em dias CORRIDOS (sábado e domingo contam): fim = início + dias − 1. Os
            dias de direito são sempre os que o RH central devolve.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
