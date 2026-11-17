/**
 * grelha-papel.tsx - a grelha da escala em papel (mensal e semanal).
 *
 * Componente de SERVIDOR (sem "use client"): a mesma fonte de verdade
 * da lib (AREAS_ESCALA, contagensDe) desenhada para A4 paisagem.
 * Secções por área com o total de "Norm." por dia, como no mapa Excel,
 * e a coluna de folgas guardadas no fim de cada linha.
 */

import {
  AREAS_ESCALA,
  CODIGOS_ESCALA,
  contagensDe,
  diaSemanaCurto,
  fmtDiaCurto,
  type EscColab,
  type EscDia
} from "@/lib/escalas";

export type PropsGrelhaPapel = {
  colaboradores: EscColab[];
  dias: EscDia[];
  datas: string[];
  /** ISO -> feriado da semana/mês (para tintar a coluna). */
  feriados: Map<string, string>;
  /** ISO -> saldo de folgas guardadas da pessoa. */
  saldoPorPessoa: Map<string, number>;
  /** Mostrar a coluna de contacto (semana; a mensal também leva). */
  comContacto?: boolean;
};

export function GrelhaPapel({
  colaboradores,
  dias,
  datas,
  feriados,
  saldoPorPessoa,
  comContacto = true
}: PropsGrelhaPapel) {
  const linhaDe = new Map<string, Map<string, string>>();
  for (const d of dias) {
    let m = linhaDe.get(d.colaborador_id);
    if (!m) {
      m = new Map();
      linhaDe.set(d.colaborador_id, m);
    }
    m.set(d.data, d.codigo);
  }
  const linha = (id: string) => linhaDe.get(id) || new Map<string, string>();

  const cont = contagensDe(colaboradores, (id) => Object.fromEntries(linha(id)), datas);

  const cel = (id: string, data: string) => {
    const codigo = linha(id).get(data);
    return codigo ? codigo : "";
  };

  return (
    <div>
      <table className="grelha-esc w-full border-collapse" data-grelha-papel>
        <thead>
          <tr>
            <th className="cab">Código</th>
            <th className="cab">Nome</th>
            {comContacto ? <th className="cab">Contacto</th> : null}
            {datas.map((data) => {
              const feriado = feriados.get(data);
              const num = Number(data.slice(8, 10));
              const fds = [6, 0].includes(new Date(data + "T00:00:00Z").getUTCDay());
              return (
                <th
                  key={data}
                  className={`cab ${feriado ? "cab-feriado" : fds ? "cab-fds" : ""}`}
                  title={feriado || undefined}
                >
                  <div>{num}</div>
                  <div className="font-normal">{diaSemanaCurto(data)}</div>
                </th>
              );
            })}
            <th className="cab">Folgas</th>
          </tr>
        </thead>
        <tbody>
          {AREAS_ESCALA.map((area) => {
            const gente = colaboradores
              .filter((c) => c.ativo && (c.area || "Outros") === area)
              .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
            if (!gente.length) return null;
            return (
              <LinhasSecao
                key={area}
                area={area}
                gente={gente}
                datas={datas}
                cel={cel}
                saldoPorPessoa={saldoPorPessoa}
                totalArea={cont.porArea[area] || datas.map(() => ({}))}
                comContacto={comContacto}
              />
            );
          })}
        </tbody>
      </table>

      <table className="mt-3 w-full border-collapse text-[0.62rem]" data-contagens-papel>
        <thead>
          <tr>
            <th className="cab" colSpan={comContacto ? 3 : 2}>
              Contagens do dia
            </th>
            {datas.map((data) => (
              <th key={data} className="cab">
                {fmtDiaCurto(data)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CODIGOS_ESCALA.map((codigo) => {
            const alguma = cont.global.some((c) => (c[codigo] || 0) > 0);
            if (!alguma) return null;
            return (
              <tr key={codigo}>
                <td className="cel" colSpan={comContacto ? 3 : 2}>
                  {codigo}
                </td>
                {cont.global.map((c, i) => (
                  <td key={i} className="cel text-center font-semibold">
                    {c[codigo] || ""}
                  </td>
                ))}
              </tr>
            );
          })}
          <tr className="linha-total">
            <td className="cel font-bold" colSpan={comContacto ? 3 : 2}>
              TOTAL EM TRABALHO NO DIA
            </td>
            {cont.global.map((c, i) => {
              const total =
                (c["Norm."] || 0) +
                (c["07/19"] || 0) +
                (c["19/07"] || 0) +
                (c["Sup."] || 0) +
                (c["Esc."] || 0) +
                (c["CCIS"] || 0);
              return (
                <td key={i} className="cel text-center font-bold">
                  {total}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function LinhasSecao({
  area,
  gente,
  datas,
  cel,
  saldoPorPessoa,
  totalArea,
  comContacto
}: {
  area: string;
  gente: EscColab[];
  datas: string[];
  cel: (id: string, data: string) => string;
  saldoPorPessoa: Map<string, number>;
  totalArea: Partial<Record<string, number>>[];
  comContacto: boolean;
}) {
  const colSpan = (comContacto ? 3 : 2) + datas.length + 1;
  return (
    <>
      <tr className="secao">
        <td className="cel font-bold" colSpan={colSpan}>
          {area}
        </td>
      </tr>
      {gente.map((p) => (
        <tr key={p.id}>
          <td className="cel whitespace-nowrap">{p.codigo}</td>
          <td className="cel whitespace-nowrap">
            {p.nome}
            {p.grupo ? ` (G${p.grupo})` : ""}
          </td>
          {comContacto ? <td className="cel whitespace-nowrap">{p.contacto || "-"}</td> : null}
          {datas.map((data) => {
            const v = cel(p.id, data);
            return (
              <td key={data} className={`cel text-center ${v === "LD" ? "cel-ld" : v === "FRD" ? "cel-frd" : ""}`}>
                {v}
              </td>
            );
          })}
          <td className="cel text-center">
            {saldoPorPessoa.get(p.id) ? String(saldoPorPessoa.get(p.id)).replace(".", ",") : ""}
          </td>
        </tr>
      ))}
      <tr className="linha-total">
        <td className="cel font-semibold" colSpan={comContacto ? 3 : 2}>
          {area} - Norm.
        </td>
        {totalArea.map((c, i) => (
          <td key={i} className="cel text-center font-semibold">
            {c["Norm."] || ""}
          </td>
        ))}
        <td className="cel" />
      </tr>
    </>
  );
}
