"use client";

/**
 * Papel A4 da ESCALA MENSAL (cliente): busca os dados do mês à API e
 * desenha a grelha com secções, contagens, legenda e nota importante.
 */

import { useEffect, useState } from "react";
import { pedir } from "@/components/oficina/ui-bits";
import { MESES_ESCALA, mesDatas, hojeEsc, type EscColab, type EscDia } from "@/lib/escalas";
import { BotaoImprimirEsc } from "../botao-imprimir";
import { GrelhaPapel } from "../grelha-papel";
import { CabecalhoPapel, CSS_PAPEL_ESC, LegendaENotaPapel } from "../papeis-comuns";

type DadosMes = {
  ok: boolean;
  hoje: string;
  ano: number;
  mes: number;
  sqlFalta?: boolean;
  colaboradores: EscColab[];
  dias: EscDia[];
  nota: string;
  feriados: { data: string; descricao: string }[];
  folgasSaldo: { colaborador_id: string; saldo: number }[];
};

export function PapelMensal({ ano, mes }: { ano: number | null; mes: number | null }) {
  const hoje = hojeEsc();
  const anoEfetivo = ano || Number(hoje.slice(0, 4));
  const mesEfetivo = mes || Number(hoje.slice(5, 7));
  const [dados, setDados] = useState<DadosMes | null>(null);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    pedir<DadosMes>(`/api/escalas/mes?ano=${anoEfetivo}&mes=${mesEfetivo}`)
      .then((d) => {
        if (vivo) setDados(d);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [anoEfetivo, mesEfetivo]);

  const datas = mesDatas(anoEfetivo, mesEfetivo);
  const feriados = new Map((dados?.feriados || []).map((f) => [f.data, f.descricao]));
  const saldoPorPessoa = new Map<string, number>();
  for (const s of dados?.folgasSaldo || []) saldoPorPessoa.set(s.colaborador_id, s.saldo);

  if (falha) {
    return (
      <div className="p-10 text-center text-sm text-destructive">
        {falha}
      </div>
    );
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
        data-papel-escalas-mensal
      >
        <BotaoImprimirEsc deVolta="/escalas" />
        <CabecalhoPapel
          tipo="Escala Mensal"
          titulo={`ESCALA MENSAL - ${MESES_ESCALA[mesEfetivo - 1]?.toUpperCase()} ${anoEfetivo}`}
        />
        <div className="mt-3">
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
