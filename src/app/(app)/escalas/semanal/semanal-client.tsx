"use client";

/**
 * Vista da SEMANA (Sáb a Sex) derivada da escala mensal.
 * Seletor de semana (sábados que tocam o mês corrente + setas), bloco
 * dos turnos, grelha com contactos e o atalho para o papel A4.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { Cabeca, pedir, Rodar } from "@/components/oficina/ui-bits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  diaSemanaCurto,
  fmtDiaCurto,
  hojeEsc,
  labelSemana,
  nomesPorCodigo,
  semanaContendo,
  somaDiasISO,
  type CodigoEscala,
  type EscColab,
  type EscDia
} from "@/lib/escalas";

type DadosSemana = {
  ok: boolean;
  hoje: string;
  inicio: string;
  fim: string;
  sqlFalta?: boolean;
  colaboradores: EscColab[];
  dias: EscDia[];
  feriados: { data: string; descricao: string }[];
};

const ROTULO_AREA: Record<string, string> = {
  Supervisores: "Sup",
  "Grupos de Turno": "Tur",
  "Pneumáticos": "Pne",
  "Mecânica": "Mec",
  "Eléctrica": "Ele",
  Serralharia: "Ser",
  Outros: "Out"
};

const BLOCO: { codigo: CodigoEscala; rotulo: string }[] = [
  { codigo: "07/19", rotulo: "Turno 07/19" },
  { codigo: "19/07", rotulo: "Turno 19/07" },
  { codigo: "Esc.", rotulo: "Escalados" },
  { codigo: "CCIS", rotulo: "CCIS" },
  { codigo: "Sup.", rotulo: "Supervisão" }
];

export function SemanalClient({ inicioInicial }: { inicioInicial?: string }) {
  const hoje = hojeEsc();
  const [inicio, setInicio] = useState(
    /^\d{4}-\d{2}-\d{2}$/.test(inicioInicial || "") ? semanaContendo(inicioInicial!)[0] : semanaContendo(hoje)[0]
  );
  const [dados, setDados] = useState<DadosSemana | null>(null);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    pedir<DadosSemana>(`/api/escalas/semanal?inicio=${inicio}`)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        setFalha("");
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [inicio]);

  const mudarSemana = useCallback((delta: number) => {
    setInicio((p) => somaDiasISO(semanaContendo(p)[0], delta * 7));
  }, []);

  const linhas = useMemo(() => {
    const mapa = new Map<string, Map<string, string>>();
    for (const d of dados?.dias || []) {
      let m = mapa.get(d.colaborador_id);
      if (!m) {
        m = new Map();
        mapa.set(d.colaborador_id, m);
      }
      m.set(d.data, d.codigo);
    }
    return mapa;
  }, [dados]);

  const datas = useMemo(() => semanaContendo(inicio), [inicio]);
  const feriadoSet = useMemo(
    () => new Map((dados?.feriados || []).map((f) => [f.data, f.descricao])),
    [dados]
  );

  const gente = (dados?.colaboradores || []).filter((c) => c.ativo);
  const linha = (id: string) => linhas.get(id) || new Map<string, string>();

  return (
    <div className="space-y-4">
      <Cabeca titulo="Escala Semanal" subtitulo={labelSemana(inicio)}>
        <Button size="sm" variant="outline" onClick={() => mudarSemana(-1)} aria-label="Semana anterior">
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button size="sm" variant="outline" onClick={() => setInicio(semanaContendo(hoje)[0])}>
          Esta semana
        </Button>
        <Button size="sm" variant="outline" onClick={() => mudarSemana(1)} aria-label="Semana seguinte">
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/imprimir/escalas/semanal?inicio=${inicio}`}>
            <Printer className="size-4" aria-hidden /> Imprimir semana
          </Link>
        </Button>
      </Cabeca>

      {falha ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{falha}</CardContent>
        </Card>
      ) : !dados ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Rodar /> A carregar a semana...
          </CardContent>
        </Card>
      ) : dados.sqlFalta ? (
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            As tabelas da Escala ainda não existem na base. Cola o sql/fase9-escalas.sql no Supabase.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="overflow-auto p-0" data-bloco-turnos>
              <table className="w-full border-collapse text-[0.75rem]">
                <thead>
                  <tr>
                    <th className="border-b px-2 py-1.5 text-left">Turnos</th>
                    {datas.map((data) => (
                      <th
                        key={data}
                        className={`border-b px-2 py-1.5 text-center ${feriadoSet.get(data) ? "bg-red-100 dark:bg-red-950/60" : ""}`}
                        title={feriadoSet.get(data) || undefined}
                      >
                        {diaSemanaCurto(data)} {fmtDiaCurto(data)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {BLOCO.map((b) => (
                    <tr key={b.codigo} className="border-b">
                      <td className="px-2 py-1.5 font-bold">{b.rotulo}</td>
                      {datas.map((data) => {
                        const grupos = nomesPorCodigo(
                          gente,
                          (id) => Object.fromEntries(linha(id)),
                          data,
                          b.codigo
                        );
                        return (
                          <td key={data} className="px-2 py-1 align-top">
                            {grupos.map((g) => (
                              <p key={g.area}>
                                <span className="text-muted-foreground">{ROTULO_AREA[g.area] || "Out"}:</span>{" "}
                                {g.nomes.join(", ")}
                              </p>
                            ))}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="overflow-auto p-0" data-grelha-semanal>
              <table className="w-full border-collapse text-[0.72rem]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 min-w-40 border-b bg-card px-2 py-1.5 text-left">Colaborador</th>
                    <th className="border-b px-2 py-1.5 text-left">Contacto</th>
                    {datas.map((data) => (
                      <th
                        key={data}
                        className={`border-b px-1 py-1.5 text-center ${feriadoSet.get(data) ? "bg-red-100 dark:bg-red-950/60" : ""}`}
                      >
                        {diaSemanaCurto(data)}
                        <div className="text-[0.6rem] font-normal text-muted-foreground">
                          {fmtDiaCurto(data)}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gente.map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="sticky left-0 z-10 bg-card px-2 py-1 whitespace-nowrap">
                        <span className="font-semibold">{p.nome}</span>
                        <span className="ml-1 text-[0.6rem] text-muted-foreground">{p.codigo}</span>
                      </td>
                      <td className="px-2 py-1 whitespace-nowrap text-muted-foreground">{p.contacto || "-"}</td>
                      {datas.map((data) => {
                        const v = linha(p.id).get(data);
                        return (
                          <td key={data} className="px-1 py-1 text-center">
                            {v || ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
