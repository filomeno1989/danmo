/**
 * papeis-comuns.tsx - peças partilhadas dos papéis da Escala.
 *
 * O CSS do A4 paisagem, o cabeçalho com os logos, a legenda e a nota
 * importante vivem aqui uma vez só: o papel mensal e o semanal são
 * iguais no estilo (o que muda é a grelha e o título).
 */

import { fmtDiaCurto, labelSemana } from "@/lib/escalas";

export const CSS_PAPEL_ESC = `
  @page { size: A4 landscape; margin: 6mm; }
  @media print { body { background: white; } .papel-esc { box-shadow: none !important; } }
  .grelha-esc { font-size: 0.58rem; }
  .grelha-esc .cab {
    border: 1px solid #334155; background: #f1f5f9; padding: 1px 2px;
    font-weight: 700; text-align: center;
  }
  .grelha-esc .cab-feriado { background: #fee2e2; }
  .grelha-esc .cab-fds { background: #e2e8f0; }
  .grelha-esc .cel { border: 0.5px solid #94a3b8; padding: 0.5px 2px; }
  .grelha-esc .secao .cel {
    background: #0f172a; color: white; font-size: 0.6rem; letter-spacing: 0.06em;
  }
  .grelha-esc .linha-total .cel { background: #f1f5f9; }
  .grelha-esc .cel-ld { background: #ffe4e6; }
  .grelha-esc .cel-frd { background: #fee2e2; }
  .grelha-esc td, .grelha-esc th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .bloco-turnos { font-size: 0.6rem; }
  .bloco-turnos .cab { border: 1px solid #334155; background: #f1f5f9; padding: 1px 3px; font-weight: 700; }
  .bloco-turnos .cel { border: 0.5px solid #94a3b8; padding: 1px 3px; vertical-align: top; }
  .bloco-turnos td, .bloco-turnos th { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
`;

export function CabecalhoPapel({ tipo, titulo }: { tipo: string; titulo: string }) {
  return (
    <>
      <header className="flex items-start justify-between border-b-4 border-slate-900 pb-2" style={{ printColorAdjust: "exact" }} data-cabecalho-papel>
        <img src="/logos/DANMO.png" alt="DANMO" className="h-10" />
        <div className="text-center">
          <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">{tipo}</p>
          <p className="text-sm font-bold">DANMO SERVICE SYSTEM, LDA</p>
          <p className="text-[0.65rem] text-slate-500">Porto da Beira, Moçambique</p>
        </div>
        <img src="/logos/MMM.png" alt="Made in Mozambique" className="h-9" />
      </header>
      <h1 className="mt-3 rounded border border-slate-300 bg-slate-100 py-1.5 text-center text-sm font-black">
        {titulo}
      </h1>
    </>
  );
}

export function LegendaENotaPapel({ nota }: { nota: string }) {
  return (
    <div className="mt-3 flex flex-wrap items-start justify-between gap-4" data-legenda-papel>
      <div className="text-[0.62rem]">
        <p className="font-bold uppercase tracking-wide">Legenda</p>
        <div className="mt-1 grid grid-cols-2 gap-x-6">
          <p>07/19 - Turno da Manhã</p>
          <p>19/07 - Turno da Noite</p>
          <p>Norm. - Horário Normal (07/17)</p>
          <p>Folga - Folga do Dia</p>
          <p>Sup. - Supervisão</p>
          <p>Esc. - Escalados para o Dia</p>
          <p>LD - Férias / Licença</p>
          <p>FRD - Feriados</p>
          <p>CCIS - Trabalhos na CCIS</p>
          <p>TDP - Tolerância de Ponto</p>
        </div>
      </div>
      {nota ? (
        <p className="max-w-[45%] rounded border border-amber-400 bg-amber-50 p-2 text-[0.68rem] font-semibold">
          NOTA IMPORTANTE: {nota}
        </p>
      ) : null}
    </div>
  );
}

/** Título do papel semanal: "ESCALA SEMANAL - Sáb 22/11 a Sex 28/11 AAAA". */
export function tituloSemanal(inicio: string, fim: string): string {
  return `ESCALA SEMANAL - ${labelSemana(inicio)} ${fim.slice(0, 4)}`;
}

/** Formata DD/MM/AAAA para o rodapé do papel. */
export function fmtDataPapel(iso: string): string {
  if (!iso || iso.length < 10) return fmtDiaCurto(iso);
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
