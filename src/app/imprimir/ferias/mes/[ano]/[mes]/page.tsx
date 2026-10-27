/**
 * /imprimir/ferias/mes/[ano]/[mes] - Folha de afixação (A4 retrato).
 *
 * O quadro que vai para a parede: quem goza férias no mês, os dias de
 * direito, o período e a coluna de assinatura. Fora do shell do portal,
 * lido pelo SERVIDOR: sem sessão nem permissão, nem chega a ver os dados.
 */

import { redirect } from "next/navigation";
import { obterSessao, pode } from "@/lib/auth";
import { queryTudo } from "@/lib/supabase";
import { dataHojeISO } from "@/lib/rh";
import { nomeMes, vivas, type LinhaPlano } from "@/lib/ferias";
import { BotaoImprimir } from "../../../botao-imprimir";

export const metadata = { title: "Folha de Afixação de Férias | Portal Danmo" };

export default async function PaginaAfixacao({
  params
}: {
  params: Promise<{ ano: string; mes: string }>;
}) {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login?motivo=sem_sessao");
  const verAlgum =
    pode(sessao, "ferias.mes", "ver") ||
    pode(sessao, "ferias.plano", "ver") ||
    pode(sessao, "ferias.alteracoes", "ver");
  if (!verAlgum) redirect("/");

  const { ano: anoP, mes: mesP } = await params;
  const ano = Number(anoP);
  const mes = Number(mesP);
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) redirect("/");

  const hoje = dataHojeISO();
  let linhas: ReturnType<typeof vivas> = [];
  try {
    const plano = await queryTudo<LinhaPlano>(
      "ferias_plano",
      `select=*&ano=eq.${ano}&mes_previsto=eq.${mes}`
    );
    const cols = await queryTudo<{
      id: number;
      name: string;
      code: string | null;
      categoria: string | null;
      setor: string | null;
      active: boolean | null;
    }>(
      "collaborators",
      "select=id,name,code,categoria,setor,active&order=name.asc"
    );
    linhas = vivas(plano, cols.filter((c) => c.active !== false)).sort((a, b) =>
      a.nome.localeCompare(b.nome)
    );
  } catch {
    linhas = [];
  }

  return (
    <div className="min-h-screen bg-white text-black" data-afixacao>
      <div className="mx-auto max-w-[210mm] px-[12mm] py-[10mm] print:px-0 print:py-0">
        {/* Botões só no ecrã */}
        <div className="mb-4 flex justify-end gap-2 print:hidden">
          <BotaoImprimir />
        </div>

        <header className="border-b-2 border-black pb-2" data-afixacao-cabeca style={{ printColorAdjust: "exact" }}>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-lg font-black tracking-tight">DANMO</p>
              <p className="text-[0.7rem] font-semibold">Danmo Service System, Lda</p>
            </div>
            <div className="text-right text-[0.7rem]">
              <p className="font-bold">Administração Oficinal</p>
              <p className="tabular-nums">Impresso em {hoje.split("-").reverse().join("/")}</p>
            </div>
          </div>
        </header>

        <h1 className="mt-4 text-center text-base font-black uppercase tracking-wide">
          Folha de Férias - {nomeMes(mes)} de {ano}
        </h1>

        <table className="mt-3 w-full border-collapse text-[0.78rem]" data-afixacao-tabela>
          <thead>
            <tr className="bg-black text-white" style={{ printColorAdjust: "exact" }}>
              <th className="border border-black px-2 py-1.5 text-left">Nº</th>
              <th className="border border-black px-2 py-1.5 text-left">Colaborador</th>
              <th className="border border-black px-2 py-1.5 text-left">Setor</th>
              <th className="border border-black px-2 py-1.5 text-center">Dias</th>
              <th className="border border-black px-2 py-1.5 text-center">Início</th>
              <th className="border border-black px-2 py-1.5 text-center">Fim</th>
              <th className="border border-black px-2 py-1.5 text-left">Assinatura</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={7} className="border border-black px-2 py-6 text-center text-[0.75rem] text-gray-500">
                  Sem colaboradores marcados neste mês.
                </td>
              </tr>
            ) : (
              linhas.map((l, i) => (
                <tr key={l.id}>
                  <td className="border border-black px-2 py-2">{i + 1}</td>
                  <td className="border border-black px-2 py-2 font-semibold">
                    {l.nome}
                    {l.codigo ? <span className="font-normal text-gray-500"> ({l.codigo})</span> : null}
                  </td>
                  <td className="border border-black px-2 py-2">{l.setor}</td>
                  <td className="border border-black px-2 py-2 text-center tabular-nums">{l.dias_rh || ""}</td>
                  <td className="border border-black px-2 py-2 text-center tabular-nums">
                    {l.data_inicio ? l.data_inicio.split("-").reverse().join("/") : ""}
                  </td>
                  <td className="border border-black px-2 py-2 text-center tabular-nums">
                    {l.data_fim ? l.data_fim.split("-").reverse().join("/") : ""}
                  </td>
                  <td className="border border-black px-2 py-2"></td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="mt-10 flex justify-between text-[0.72rem]">
          <div className="border-t border-black px-10 pt-1">Administração Oficinal</div>
          <div className="border-t border-black px-10 pt-1">Data: ____ / ____ / ______</div>
        </div>
        <p className="mt-6 text-center text-[0.6rem] text-gray-400">
          Documento interno - não controlado quando impresso
        </p>
      </div>
    </div>
  );
}
