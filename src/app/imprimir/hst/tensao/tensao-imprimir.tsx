"use client";

/**
 * Papel A4 do Controlo de Tensão Arterial (cliente).
 *
 * COLETIVO (sem colab): indicadores do período, resumo por pessoa
 * (mediações, última leitura, classificação, médias) e a lista completa
 * de medições do período, por ordem cronológica. INDIVIDUAL (com colab):
 * os mesmos números só desta pessoa e a lista completa. As contagens
 * correm com as funções puras da lib (resumoTensaoPeriodo,
 * medicoesNoPeriodo, resumoTensao) - o mesmo juiz das provas.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { pedir } from "@/components/oficina/ui-bits";
import {
  classificarTensao,
  estatisticaMedicacao,
  fmtDataHst,
  medicoesNoPeriodo,
  resumoTensaoPeriodo,
  rotuloCampanha,
  type CampanhaHST,
  type ColaboradorHST,
  type LinhaCampanhaHST,
  type MedicacaoTensaoHST,
  type MedicaoTensaoHST
} from "@/lib/hst";
import { BotaoImprimirHst } from "../botao-imprimir";

type Props = { colab: string; de: string; ate: string; campanha: string };

export function TensaoImprimir({ colab, de, ate, campanha: campanhaId }: Props) {
  const [medicoes, setMedicoes] = useState<MedicaoTensaoHST[] | null>(null);
  const [colabs, setColabs] = useState<ColaboradorHST[]>([]);
  const [medicacao, setMedicacao] = useState<MedicacaoTensaoHST[]>([]);
  const [campanha, setCampanha] = useState<CampanhaHST | null>(null);
  const [membrosCampanha, setMembrosCampanha] = useState<LinhaCampanhaHST[]>([]);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<{ medicoes: MedicaoTensaoHST[] }>("/api/hst/medicoes"),
      pedir<{ colaboradores: ColaboradorHST[] }>("/api/hst/colaboradores"),
      pedir<{ medicacao: MedicacaoTensaoHST[] }>("/api/hst/medicacao").catch(() => ({ medicacao: [] as MedicacaoTensaoHST[] })),
      campanhaId
        ? pedir<{ campanha: CampanhaHST; membros: LinhaCampanhaHST[] }>(`/api/hst/campanha?id=${campanhaId}`)
        : Promise.resolve({ campanha: null as CampanhaHST | null, membros: [] as LinhaCampanhaHST[] })
    ])
      .then(([med, col, med2, camp]) => {
        if (!vivo) return;
        setMedicoes(med.medicoes || []);
        setColabs(col.colaboradores || []);
        setMedicacao((med2.medicacao || []).filter((m) => m.activo));
        setCampanha(camp.campanha || null);
        setMembrosCampanha(camp.membros || []);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [colab, campanhaId]);

  /** Hoje local (YYYY-MM-DD): o fim da campanha aberta é hoje. */
  const hojeLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  const modoCampanha = Boolean(campanhaId && campanha);
  const nomesCampanha = useMemo(
    () => new Set(membrosCampanha.map((m) => m.colaborador_nome || "").filter(Boolean)),
    [membrosCampanha]
  );
  const inicioCampanha = modoCampanha ? campanha?.inicio || "" : de;
  const fimCampanha = modoCampanha ? campanha?.fim || hojeLocal : ate;

  const dentro = useMemo(() => {
    const base = medicoes ? medicoesNoPeriodo(medicoes, inicioCampanha, fimCampanha) : [];
    if (modoCampanha) return base.filter((m) => nomesCampanha.has(m.colaborador_nome || ""));
    return base.filter((m) => !colab || m.colaborador_nome === colab);
  }, [medicoes, inicioCampanha, fimCampanha, modoCampanha, nomesCampanha, colab]);
  const resumo = useMemo(() => resumoTensaoPeriodo(dentro), [dentro]);

  const medicacaoVisivel = useMemo(() => {
    let lista = medicacao;
    if (colab) lista = lista.filter((m) => m.colaborador_nome === colab);
    if (modoCampanha) lista = lista.filter((m) => nomesCampanha.has(m.colaborador_nome || ""));
    return lista;
  }, [medicacao, colab, modoCampanha, nomesCampanha]);

  const porPessoa = useMemo(() => {
    const mapa: Record<string, { nome: string; ultima: MedicaoTensaoHST; total: number; somaSys: number; somaDia: number; hta: number }> = {};
    for (const m of dentro) {
      const nome = m.colaborador_nome || "";
      if (!mapa[nome]) mapa[nome] = { nome, ultima: m, total: 0, somaSys: 0, somaDia: 0, hta: 0 };
      mapa[nome].total += 1;
      mapa[nome].somaSys += Number(m.sistolica) || 0;
      mapa[nome].somaDia += Number(m.diastolica) || 0;
      if (classificarTensao(Number(m.sistolica), Number(m.diastolica)).cls === "alta") {
        mapa[nome].hta += 1;
      }
      if (String(m.data_medicao) > String(mapa[nome].ultima.data_medicao)) {
        mapa[nome].ultima = m;
      }
    }
    return Object.values(mapa).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [dentro]);

  const cronologica = useMemo(
    () => [...dentro].sort((a, b) => String(a.data_medicao).localeCompare(String(b.data_medicao))),
    [dentro]
  );

  const codigoDe = useMemo(() => {
    const mapa: Record<string, string> = {};
    for (const c of colabs) mapa[c.name || ""] = c.code || "";
    return mapa;
  }, [colabs]);

  /* Uma linha por pessoa da campanha: entrada, saída, números e medicação. */
  const linhasCampanha = useMemo(() => {
    if (!modoCampanha) return [];
    return [...membrosCampanha]
      .sort((a, b) => (a.colaborador_nome || "").localeCompare(b.colaborador_nome || ""))
      .map((m) => {
        const nome = m.colaborador_nome || "";
        const proprias = dentro.filter((x) => x.colaborador_nome === nome);
        const total = proprias.length;
        const somaSys = proprias.reduce((s, x) => s + (Number(x.sistolica) || 0), 0);
        const somaDia = proprias.reduce((s, x) => s + (Number(x.diastolica) || 0), 0);
        const altas = proprias.filter((x) => classificarTensao(Number(x.sistolica), Number(x.diastolica)).cls === "alta").length;
        const ultima = proprias[0];
        const meds = medicacaoVisivel
          .filter((x) => x.colaborador_nome === nome)
          .map((x) => x.medicamento)
          .join(", ");
        return {
          nome,
          codigo: codigoDe[nome] || "",
          entrada: fmtDataHst(m.inicio || "", true),
          saida: m.ativo ? "" : fmtDataHst(m.fim || "", true),
          total: String(total),
          ultima: ultima ? `${ultima.sistolica}/${ultima.diastolica} em ${fmtDataHst(ultima.data_medicao, true)}` : "-",
          media: total ? `${Math.round(somaSys / total)}/${Math.round(somaDia / total)}` : "-",
          altas: total ? `${altas} de ${total} (${Math.round((altas / total) * 100)}%)` : "-",
          med: meds || "-"
        };
      });
  }, [modoCampanha, membrosCampanha, dentro, codigoDe, medicacaoVisivel]);

  if (falha) {
    return (
      <div className="p-10 text-center text-sm text-destructive">
        {falha}
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/hst/tensao">Voltar à Tensão Arterial</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (!medicoes) {
    return <div className="p-10 text-center text-sm text-muted-foreground">A carregar medições...</div>;
  }

  const individual = Boolean(colab);
  const volta = individual
    ? `/hst/tensao/pessoa?colab=${encodeURIComponent(colab)}`
    : "/hst/tensao";
  const periodo = modoCampanha
    ? `Período da ${rotuloCampanha(campanha?.numero || 1)}: ${inicioCampanha ? fmtDataHst(inicioCampanha) : "início"} a ${campanha?.fim ? fmtDataHst(campanha.fim) : "hoje (em curso)"}`
    : de || ate
      ? `Período: ${de ? fmtDataHst(de) : "início"} a ${ate ? fmtDataHst(ate) : "hoje"}`
      : "Período: todos os registos";

  const linha = (rotulo: string, valor: string, vermelho = false) => (
    <tr>
      <td className="border border-slate-300 px-2 py-1.5">{rotulo}</td>
      <td className={`border border-slate-300 px-2 py-1.5 text-right font-bold ${vermelho ? "text-red-700" : ""}`}>
        {valor}
      </td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-black">
      <div className="mx-auto bg-white" style={{ maxWidth: "210mm", padding: "15mm" }} data-papel-tensao>
        <BotaoImprimirHst deVolta={volta} />

        <header className="flex items-start justify-between border-b-4 border-slate-900 pb-3" style={{ printColorAdjust: "exact" }}>
          <img src="/logos/DANMO.png" alt="DANMO" className="h-11" />
          <div className="text-center">
            <p className="text-[0.65rem] uppercase tracking-widest text-slate-500">Relatório HST</p>
            <p className="text-sm font-bold">DANMO SERVICE SYSTEM, LDA</p>
            <p className="text-[0.65rem] text-slate-500">Porto da Beira, Moçambique</p>
          </div>
          <img src="/logos/MMM.png" alt="Made in Mozambique" className="h-9" />
        </header>

        <h1 className="mt-4 rounded border border-slate-300 bg-slate-100 py-2 text-center text-base font-black">
          {individual
            ? `Controlo de Tensão Arterial - ${colab}`
            : modoCampanha
              ? `${rotuloCampanha(campanha?.numero || 1)} de Controle da Tensão Arterial`
              : "Controlo de Tensão Arterial (Campanha)"}
        </h1>
        <p className="mt-1 text-center text-[0.72rem] text-slate-600">
          {periodo}
          {individual && codigoDe[colab] ? ` | Colaborador: ${codigoDe[colab]}` : ""}
          {modoCampanha
            ? ` | ${membrosCampanha.length} pessoa(s) na campanha | Estado: ${campanha?.estado === "arquivada" ? "Arquivada" : "Aberta"}`
            : ""}
        </p>

        <section className="mt-4">
          <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
            Indicadores do Período
          </h2>
          <table className="w-full border-collapse text-[0.78rem]" data-tensao-indicadores>
            <tbody>
              {linha("Medições registadas", String(resumo.total))}
              {!individual && linha("Pessoas medidas", String(resumo.pessoas))}
              {linha("Média da tensão", resumo.total ? `${resumo.mediaSys}/${resumo.mediaDia} mmHg` : "-")}
              {linha("Medições com tensão alta", `${resumo.medicoesHta} (${resumo.pctHta}%)`, resumo.medicoesHta > 0)}
              {linha("Dias com registo", String(resumo.diasComMedicao))}
            </tbody>
          </table>
        </section>

        {modoCampanha && linhasCampanha.length > 0 && (
          <section className="mt-5" data-campanha-pessoal>
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
              Pessoal da {rotuloCampanha(campanha?.numero || 1)}
            </h2>
            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Código</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Entrada</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Saída</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Medições</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Última</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Média</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Altas</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Medicação</th>
                </tr>
              </thead>
              <tbody>
                {linhasCampanha.map((l) => (
                  <tr key={l.nome}>
                    <td className="border border-slate-300 px-2 py-1 font-bold">{l.nome}</td>
                    <td className="border border-slate-300 px-2 py-1">{l.codigo || "-"}</td>
                    <td className="border border-slate-300 px-2 py-1">{l.entrada}</td>
                    <td className="border border-slate-300 px-2 py-1">{l.saida || "-"}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center">{l.total}</td>
                    <td className="border border-slate-300 px-2 py-1">{l.ultima}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center">{l.media}</td>
                    <td className="border border-slate-300 px-2 py-1 text-center">{l.altas}</td>
                    <td className="border border-slate-300 px-2 py-1">{l.med}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {(individual || modoCampanha) && medicacaoVisivel.length > 0 && (
          <section className="mt-5" data-tensao-medicacao>
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
              Medicação em Curso
            </h2>
            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  {modoCampanha && <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>}
                  <th className="border border-slate-900 px-2 py-1 text-left">Medicamento</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Dosagem</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Desde</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Tomada</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Estatística desde o início</th>
                </tr>
              </thead>
              <tbody>
                {medicacaoVisivel.map((m) => {
                  const pessoa = modoCampanha ? m.colaborador_nome : colab;
                  const est = estatisticaMedicacao(
                    (medicoes || []).filter((x) => x.colaborador_nome === pessoa),
                    String(m.desde || "")
                  );
                  return (
                    <tr key={m.id}>
                      {modoCampanha && (
                        <td className="border border-slate-300 px-2 py-1 font-bold">{m.colaborador_nome}</td>
                      )}
                      <td className="border border-slate-300 px-2 py-1 font-bold">{m.medicamento}</td>
                      <td className="border border-slate-300 px-2 py-1">{m.dosagem || "-"}</td>
                      <td className="border border-slate-300 px-2 py-1">{fmtDataHst(m.desde || "", true)}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center">{m.regular ? "Regular" : "Irregular"}</td>
                      <td className="border border-slate-300 px-2 py-1">
                        {est
                          ? `média ${est.desde.mediaSys}/${est.desde.mediaDia} | altas ${est.desde.alta} de ${est.desde.total} (${est.desde.pctAlta}%)${est.antes.total > 0 ? ` | antes: média ${est.antes.mediaSys}/${est.antes.mediaDia}, altas ${est.antes.pctAlta}%` : ""}`
                          : "sem medições desde o início"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {!individual && porPessoa.length > 0 && (
          <section className="mt-5">
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
              Resumo por Colaborador
            </h2>
            <table className="w-full border-collapse text-[0.75rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Código</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Medições</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Última leitura</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Última data</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Média</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Classificação</th>
                </tr>
              </thead>
              <tbody>
                {porPessoa.map((p) => {
                  const cla = classificarTensao(Number(p.ultima.sistolica), Number(p.ultima.diastolica));
                  return (
                    <tr key={p.nome}>
                      <td className="border border-slate-300 px-2 py-1">{p.nome}</td>
                      <td className="border border-slate-300 px-2 py-1">{codigoDe[p.nome] || "-"}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center">{p.total}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-bold">
                        {p.ultima.sistolica}/{p.ultima.diastolica}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">{fmtDataHst(p.ultima.data_medicao, true)}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center">
                        {Math.round(p.somaSys / p.total)}/{Math.round(p.somaDia / p.total)}
                      </td>
                      <td className={`border border-slate-300 px-2 py-1 ${cla.cls === "alta" ? "text-red-700 font-bold" : ""}`}>
                        {cla.texto}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {cronologica.length > 0 ? (
          <section className="mt-5">
            <h2 className="mb-2 border-b border-slate-300 pb-1 text-[0.7rem] font-bold uppercase tracking-wide">
              Medições do Período (por ordem de data)
            </h2>
            <table className="w-full border-collapse text-[0.72rem]">
              <thead>
                <tr className="bg-slate-900 text-white" style={{ printColorAdjust: "exact" }}>
                  {!individual && <th className="border border-slate-900 px-2 py-1 text-left">Colaborador</th>}
                  <th className="border border-slate-900 px-2 py-1 text-left">Data</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Hora</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Sistólica</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">Diastólica</th>
                  <th className="border border-slate-900 px-2 py-1 text-center">FC</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Classificação</th>
                  <th className="border border-slate-900 px-2 py-1 text-left">Observações</th>
                </tr>
              </thead>
              <tbody>
                {cronologica.map((m) => {
                  const cla = classificarTensao(Number(m.sistolica), Number(m.diastolica));
                  const iso = String(m.data_medicao || "");
                  return (
                    <tr key={m.id}>
                      {!individual && <td className="border border-slate-300 px-2 py-1">{m.colaborador_nome}</td>}
                      <td className="border border-slate-300 px-2 py-1">{fmtDataHst(iso)}</td>
                      <td className="border border-slate-300 px-2 py-1">{iso.length >= 16 ? iso.slice(11, 16) : "-"}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-bold">{m.sistolica}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center font-bold">{m.diastolica}</td>
                      <td className="border border-slate-300 px-2 py-1 text-center">{m.frequencia_cardiaca ?? "-"}</td>
                      <td className={`border border-slate-300 px-2 py-1 ${cla.cls === "alta" ? "text-red-700 font-bold" : ""}`}>
                        {cla.texto}
                      </td>
                      <td className="border border-slate-300 px-2 py-1">{m.observacoes || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ) : (
          <section className="mt-5">
            <p className="border border-slate-300 bg-slate-50 px-3 py-4 text-center text-[0.78rem] text-slate-600">
              Sem medições no período escolhido.
            </p>
          </section>
        )}

        <section className="mt-6 flex justify-center text-[0.7rem]">
          <div className="w-56 border-t border-slate-400 pt-1 text-center">O Técnico de HST</div>
        </section>

        <footer className="mt-8 flex items-center justify-between border-t border-slate-300 pt-2 text-[0.62rem] text-slate-500">
          <span>DANMO SERVICE SYSTEM, LDA</span>
          <span>Documento gerado em {fmtDataHst(new Date().toISOString(), true)}</span>
          <img src="/logos/MESQUITA.png" alt="Grupo Mesquita" className="h-5" />
        </footer>
      </div>
    </div>
  );
}
