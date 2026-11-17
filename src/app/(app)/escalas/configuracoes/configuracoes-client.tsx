"use client";

/**
 * Configurações (cliente): importador do Excel mensal + feriados +
 * composição dos grupos. O parser corre NO NAVEGADOR (xlsx já no
 * projeto): o Excel nunca sai da máquina do Filomeno.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, pedir, Rodar } from "@/components/oficina/ui-bits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MESES_ESCALA } from "@/lib/escalas";
import { lerEscalasDeBuffer, type ImportDados } from "@/lib/escalas-import";

type DadosConfig = {
  ok: boolean;
  hoje: string;
  ano: number;
  sqlFalta?: boolean;
  feriados: { data: string; descricao: string }[];
  totalAtivos: number;
  totalComContacto: number;
  turnos: Record<string, number>;
};

export function ConfiguracoesClient({ podeMexer }: { podeMexer: boolean }) {
  const [dados, setDados] = useState<DadosConfig | null>(null);
  const [falha, setFalha] = useState("");
  const [lido, setLido] = useState<ImportDados | null>(null);
  const [lerExcel, setLerExcel] = useState(false);
  const [importando, setImportando] = useState("");
  const [resultado, setResultado] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let vivo = true;
    pedir<DadosConfig>("/api/escalas/config")
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

  const lerFicheiro = useCallback(async (ficheiro: File) => {
    setLerExcel(true);
    setResultado(null);
    try {
      const buf = await ficheiro.arrayBuffer();
      const dados = lerEscalasDeBuffer(buf);
      setLido(dados);
      toast.success(
        `Excel lido: ${dados.colaboradores.length} pessoas, ${dados.meses.length} meses, ${dados.problemas.length} notas.`
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível ler o Excel.");
      setLido(null);
    } finally {
      setLerExcel(false);
    }
  }, []);

  const importar = useCallback(async () => {
    if (!lido) return;
    try {
      setImportando("registo");
      const r1 = await fetch("/api/escalas/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo: "registo", colaboradores: lido.colaboradores, folgas: lido.folgas })
      });
      const d1 = await r1.json().catch(() => ({}));
      if (!r1.ok || d1?.ok === false) {
        throw new Error(d1?.erro || "Falha a importar o registo.");
      }

      let gravadas = 0;
      for (const mes of lido.meses) {
        setImportando(`${MESES_ESCALA[mes.mes - 1]} de ${mes.ano}`);
        const r = await fetch("/api/escalas/importar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tipo: "mes", celulas: mes.celulas })
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d?.ok === false) {
          throw new Error(d?.erro || `Falha a importar ${MESES_ESCALA[mes.mes - 1]}.`);
        }
        gravadas += Number(d.gravadas) || 0;
      }

      setResultado(
        `Importado: ${d1.pessoas} pessoas, ${d1.folgas} folgas guardadas, ${gravadas} células de escala em ${lido.meses.length} meses.`
      );
      toast.success("Importação completa.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na importação.");
    } finally {
      setImportando("");
    }
  }, [lido]);

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
      <Cabeca titulo="Escalas - Configurações" subtitulo="Importação do Excel, feriados e composição dos grupos" />

      {!dados ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Rodar /> A carregar...
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardContent className="p-4" data-saude-registo>
                <h2 className="text-sm font-bold">Registo</h2>
                <p className="mt-2 text-2xl font-black">{dados.totalAtivos}</p>
                <p className="text-xs text-muted-foreground">pessoas activas na escala</p>
                <p className="mt-2 text-sm">
                  <span className="font-bold">{dados.totalComContacto}</span> com contacto (o cliente
                  liga por estes números)
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4" data-turnos-composicao>
                <h2 className="text-sm font-bold">Grupos de turno</h2>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                  {(["A", "B", "C", "D"] as string[]).map((g) => (
                    <div key={g} className="rounded-lg border p-2">
                      <p className="text-xl font-black">{dados.turnos[g] || 0}</p>
                      <p className="text-xs text-muted-foreground">Grupo {g}</p>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  4 por grupo é o número da casa (2 mecânicos + 2 electricistas); ajusta no registo
                  quando os turnos se reestruturam.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4" data-feriados-lista>
                <h2 className="text-sm font-bold">Feriados {dados.ano}</h2>
                <p className="text-xs text-muted-foreground">lidos do Plano de Férias (ferias_feriados)</p>
                <ul className="mt-2 max-h-32 space-y-0.5 overflow-auto text-xs">
                  {dados.feriados
                    .filter((f) => f.data.startsWith(String(dados.ano)))
                    .map((f) => (
                      <li key={f.data} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">{f.data.slice(5, 10)}</span>
                        <span className="text-right">{f.descricao}</span>
                      </li>
                    ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {podeMexer ? (
            <Card>
              <CardContent className="p-4" data-importador>
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <FileSpreadsheet className="size-4" aria-hidden /> Importar o Excel da escala mensal
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Lê o ficheiro ESCALA MENSAL no teu computador: o registo (Configuração), as
                  grelhas dos meses e o saldo de folgas guardadas. Nada é enviado antes de veres o
                  resumo. O ficheiro fica na tua máquina.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void lerFicheiro(f);
                    }}
                  />
                  <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={lerExcel || !!importando}>
                    {lerExcel ? <LoaderCircle className="size-4 animate-spin" /> : null} Escolher ficheiro
                  </Button>
                  {lido ? (
                    <Button size="sm" onClick={() => void importar()} disabled={!!importando}>
                      {importando ? <Rodar /> : null}
                      {importando ? `Importando ${importando}...` : "Importar na base"}
                    </Button>
                  ) : null}
                </div>

                {lido ? (
                  <div className="mt-4 rounded-lg border bg-muted/40 p-3 text-sm" data-resumo-importacao>
                    <p>
                      <span className="font-bold">{lido.colaboradores.length}</span> pessoas,{" "}
                      <span className="font-bold">{lido.meses.length}</span> meses,{" "}
                      <span className="font-bold">{lido.folgas.length}</span> folgas guardadas trazidas.
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {lido.meses
                        .map((m) => `${MESES_ESCALA[m.mes - 1].slice(0, 3)}: ${m.celulas.length}`)
                        .join(" | ")}
                    </p>
                    {lido.problemas.length ? (
                      <div className="mt-2">
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400">
                          Notas ({lido.problemas.length}):
                        </p>
                        <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-auto pl-5 text-xs">
                          {lido.problemas.map((p, i) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {resultado ? (
                  <p className="mt-3 rounded-lg border border-emerald-400 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300" data-resultado-importacao>
                    {resultado}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
