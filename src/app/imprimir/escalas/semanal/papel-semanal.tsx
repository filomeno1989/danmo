"use client";

/**
 * Papel A4 da ESCALA SEMANAL (cliente): dados da API semanal, bloco
 * dos turnos no topo e a grelha completa com contactos.
 */

import { useEffect, useState } from "react";
import { pedir } from "@/components/oficina/ui-bits";
import {
  diaSemanaCurto,
  fmtDiaCurto,
  hojeEsc,
  nomesPorCodigo,
  semanaContendo,
  somaDiasISO,
  type CodigoEscala,
  type EscColab,
  type EscDia
} from "@/lib/escalas";
import { BotaoImprimirEsc } from "../botao-imprimir";
import { GrelhaPapel } from "../grelha-papel";
import { CabecalhoPapel, CSS_PAPEL_ESC, LegendaENotaPapel, tituloSemanal } from "../papeis-comuns";

type DadosSemana = {
  ok: boolean;
  hoje: string;
  inicio: string;
  fim: string;
  sqlFalta?: boolean;
  colaboradores: EscColab[];
  dias: EscDia[];
  nota: string;
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

export function PapelSemanal({ inicio: inicioPedida }: { inicio: string }) {
  const hoje = hojeEsc();
  const inicio = semanaContendo(inicioPedida || hoje)[0];
  const fim = somaDiasISO(inicio, 6);
  const [dados, setDados] = useState<DadosSemana | null>(null);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    pedir<DadosSemana>(`/api/escalas/semanal?inicio=${inicio}`)
      .then((d) => {
        if (vivo) setDados(d);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [inicio]);

  const datas = semanaContendo(inicio);
  const feriados = new Map((dados?.feriados || []).map((f) => [f.data, f.descricao]));
  const saldoPorPessoa = new Map<string, number>();

  const linhas = new Map<string, Map<string, string>>();
  for (const d of dados?.dias || []) {
    let m = linhas.get(d.colaborador_id);
    if (!m) {
      m = new Map();
      linhas.set(d.colaborador_id, m);
    }
    m.set(d.data, d.codigo);
  }
  const linhaDe = (id: string) => linhas.get(id) || new Map<string, string>();

  if (falha) {
    return <div className="p-10 text-center text-sm text-destructive">{falha}</div>;
  }
  if (!dados) {
    return <div className="p-10 text-center text-sm text-muted-foreground">A preparar o papel...</div>;
  }
  if (dados.sqlFalta) {
    return (
      <div className="p-10 text-center text-sm">
        As tabelas da Escala ainda não existem na base. Cola o
        sql/fase9-escalas.sql no Supabase e volta a abrir este papel.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-black">
      <style>{CSS_PAPEL_ESC}</style>
      <div
        className="papel-esc mx-auto bg-white p-6 shadow-lg"
        style={{ maxWidth: "297mm" }}
        data-papel-escalas-semanal
      >
        <BotaoImprimirEsc deVolta="/escalas/semanal" />
        <CabecalhoPapel tipo="Escala Semanal" titulo={tituloSemanal(inicio, fim)} />

        <table className="bloco-turnos mt-3 w-full border-collapse" data-bloco-turnos-papel>
          <thead>
            <tr>
              <th className="cab w-32">Turnos</th>
              {datas.map((data) => (
                <th key={data} className={`cab ${feriados.get(data) ? "cab-feriado" : ""}`}>
                  {diaSemanaCurto(data)} {fmtDiaCurto(data)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BLOCO.map((b) => (
              <tr key={b.codigo}>
                <td className="cel font-bold">{b.rotulo}</td>
                {datas.map((data) => {
                  const grupos = nomesPorCodigo(
                    dados.colaboradores,
                    (id) => Object.fromEntries(linhaDe(id)),
                    data,
                    b.codigo
                  );
                  return (
                    <td key={data} className="cel">
                      {grupos.map((g) => (
                        <p key={g.area} className="whitespace-nowrap">
                          <span className="font-semibold text-slate-500">{ROTULO_AREA[g.area] || "Out"}:</span>{" "}
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

        <div className="mt-4">
          <GrelhaPapel
            colaboradores={dados.colaboradores}
            dias={dados.dias}
            datas={datas}
            feriados={feriados}
            saldoPorPessoa={saldoPorPessoa}
          />
        </div>
        <LegendaENotaPapel nota={dados.nota || ""} />
      </div>
    </div>
  );
}
