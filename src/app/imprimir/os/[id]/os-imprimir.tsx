"use client";

/**
 * OsImprimir - Folha A4 da Ordem de Reparação (client).
 *
 * PORTO FIEL do impresso original do hub (oficina/os_print.html):
 * mesmo papel, mesma fonte (Times New Roman), mesmas cores verdes,
 * logos DANMO + Made in Mozambique + Grupo Mesquita, checkboxes de
 * tipo de intervenção e de funções, uma linha de mão de obra POR
 * técnico, assinaturas pelos registos de estado e o rodapé legal
 * com o código documental DAN_ADO_FR_023_REV03.
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pedir } from "@/components/oficina/ui-bits";
import { formatarData, type LogEstado, type OrdemServico } from "@/lib/oficina";

type DadosObra = {
  ok: boolean;
  os: OrdemServico;
  equip: { code?: string | null } | null;
  timeline: LogEstado[];
  intervencoes: {
    id: number;
    shift_date?: string | null;
    time_start?: string | null;
    time_end?: string | null;
    hours?: number | null;
    description?: string | null;
    tecnicos?: { id: number; name: string; code?: string | null }[];
    setores?: string[];
  }[];
  pecas: {
    id: number;
    peca: string;
    data?: string | null;
    quantidade?: number | null;
    unidade?: string | null;
    colaborador?: string | null;
  }[];
};

/** Data DD/MM/AAAA como o original (vazio quando não há data). */
function fData(s?: string | null): string {
  if (!s) return "";
  const [a, m, d] = String(s).slice(0, 10).split("-");
  if (!a || !m || !d) return String(s);
  return `${d}/${m}/${a}`;
}

/** Quantidade com a unidade gravada: "4 Kg", "4 Lt", "2 un" (Unidade abreviada). */
function qtdComUnidade(q?: number | null, u?: string | null): string {
  if (q == null || !q) return "";
  if (!u) return String(q);
  return `${q} ${u === "Unidade" ? "un" : u}`;
}

/** Só os dígitos do código do colaborador (coluna Nº, como no hub). */
function nrColab(code?: string | null): string {
  if (!code) return "";
  const n = parseInt(code.replace(/\D/g, ""), 10);
  return Number.isNaN(n) ? "" : String(n);
}

/** Arredonda para o inteiro: minutos >= 30 sobem (regra do hub). */
function arredondar(h: number): number {
  const hh = Math.floor(h);
  const mm = (h - hh) * 60;
  return mm >= 30 ? hh + 1 : hh;
}

type LinhaObra = { desc: string; nome: string; ini: string; fim: string; total: string; nr: string };

export function OsImprimir({ osId }: { osId: number }) {
  const [dados, setDados] = useState<DadosObra | null>(null);
  const [falhou, setFalhou] = useState<string | null>(null);
  const [alturas, setAlturas] = useState<{ cab: number; rod: number } | null>(null);
  const cabRef = useRef<HTMLDivElement | null>(null);
  const rodRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!osId) return;
    pedir<DadosObra>(`/api/oficina/ordens/${osId}`)
      .then(setDados)
      .catch((e: Error) => setFalhou(e.message || "Obra não encontrada."));
  }, [osId]);

  /**
   * Mede o cabeçalho e o rodapé fixos e define a altura dos espaços
   * que se repetem em cada página impressa (tabela mágica do hub,
   * com folga de +25px como no original).
   */
  const medir = useCallback(() => {
    if (cabRef.current && rodRef.current) {
      setAlturas({ cab: cabRef.current.offsetHeight + 25, rod: rodRef.current.offsetHeight + 25 });
    }
  }, []);

  useEffect(() => {
    if (!dados) return;
    medir();
    const t = setTimeout(medir, 200);
    window.addEventListener("beforeprint", medir);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeprint", medir);
    };
  }, [dados, medir]);

  if (falhou) {
    return (
      <div className="p-8 text-sm" style={{ fontFamily: "Arial, sans-serif" }}>
        <p className="mb-2 font-bold">Não foi possível abrir o impresso.</p>
        <p className="mb-4 text-neutral-600">{falhou}</p>
        <Link href="/oficina/ordens" className="underline">
          Voltar às Ordens de Serviço
        </Link>
      </div>
    );
  }

  if (!dados) {
    return (
      <p className="p-8 text-sm" style={{ fontFamily: "Arial, sans-serif" }}>
        A preparar a folha de impressão...
      </p>
    );
  }

  const { os, equip, intervencoes, pecas } = dados;

  /* ---------- Tipo de Intervenção (ordem e marcas como no hub) ---------- */
  const tiposPainel: { id: string; nome: string }[] = [
    { id: "cb-ig", nome: "Inspeção Geral" },
    { id: "cb-rm", nome: "Rep. Sis. Mecânico" },
    { id: "cb-rp", nome: "Reparação Pneus" },
    { id: "cb-rh", nome: "Rep. Sis. Hidráulico" },
    { id: "cb-lb", nome: "Lubrificação" },
    { id: "cb-rel", nome: "Rep. Sis. Elétrico" },
    { id: "cb-rv", nome: "Revisão" },
    { id: "cb-re", nome: "Rep. Estrutura" },
    { id: "cb-ot", nome: "Outros" }
  ];
  const mapaTipo: Record<string, string> = {
    "Inspeção Geral": "cb-ig",
    "Reparação Pneus": "cb-rp",
    Lubrificação: "cb-lb",
    "Rep. Sis. Mecânico": "cb-rm",
    "Rep. Sis. Hidráulico": "cb-rh",
    "Rep. Sis. Elétrico": "cb-rel",
    Revisão: "cb-rv",
    "Rep. Estrutura": "cb-re",
    Outros: "cb-ot"
  };
  const marcados = new Set((os.tipo_intervencao || []).map((t) => mapaTipo[t]).filter(Boolean));

  /* ---------- Mão de obra: uma linha POR técnico, como no hub ---------- */
  const linhas: LinhaObra[] = [];
  const setoresUsados = new Set<string>();
  let totalHoras = 0;
  intervencoes.forEach((r) => {
    const tecnicos = r.tecnicos || [];
    tecnicos.forEach(() => {
      if (r.setores) r.setores.forEach((s) => setoresUsados.add(s));
    });
    const hArr = arredondar(r.hours != null ? parseFloat(String(r.hours)) : 0);
    totalHoras += hArr * (tecnicos.length || 1);
    const descBase = r.shift_date ? `${fData(r.shift_date)} - ${r.description || ""}` : r.description || "";
    if (tecnicos.length === 0) {
      linhas.push({ desc: descBase, nome: "", ini: r.time_start || "", fim: r.time_end || "", total: hArr > 0 ? `${hArr}h` : "", nr: "" });
    } else {
      tecnicos.forEach((c) => {
        linhas.push({
          desc: descBase,
          nome: c.name,
          ini: r.time_start || "",
          fim: r.time_end || "",
          total: hArr > 0 ? `${hArr}h` : "",
          nr: nrColab(c.code)
        });
      });
    }
  });

  const funcoesBar: { id: string; nome: string }[] = [
    { id: "cb-mec", nome: "Mecânico" },
    { id: "cb-ele", nome: "Eletricista" },
    { id: "cb-lub", nome: "Lubrificador" },
    { id: "cb-piq", nome: "Piquete" },
    { id: "cb-pne", nome: "Pneumático" },
    { id: "cb-ser", nome: "Serralheiro" },
    { id: "cb-tor", nome: "Torneiro" },
    { id: "cb-out", nome: "Outro" }
  ];
  const mapaFuncao: Record<string, string> = {
    Mecânica: "cb-mec",
    Elétrica: "cb-ele",
    Lubrificação: "cb-lub",
    Piquete: "cb-piq",
    Pneumática: "cb-pne",
    Serralharia: "cb-ser",
    Torneiro: "cb-tor"
  };
  const funcoesMarcadas = new Set([...setoresUsados].map((s) => mapaFuncao[s]).filter(Boolean));

  /* ---------- Assinaturas: primeiro evento de cada estado (hub) ---------- */
  const statusLog = [...(dados.timeline || [])].sort(
    (a, b) => new Date(a.data_mudanca).getTime() - new Date(b.data_mudanca).getTime()
  );
  function assinaturaDe(statusAlvo: string): { nome: string; data: string } {
    const evento = statusLog.find((ev) => ev.status_novo === statusAlvo);
    if (evento && evento.responsavel) {
      return { nome: evento.responsavel, data: `Data: ${formatarData(String(evento.data_mudanca).split("T")[0])}` };
    }
    return { nome: "", data: "Data: ___/___/_____" };
  }
  const assAbertura = assinaturaDe("Supervisão");
  const assSupervisor = assinaturaDe("Chefe da Oficina");
  const assChefe = assinaturaDe("Departamento Técnico");

  return (
    <div className="folha-fundo">
      <style jsx global>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .folha-fundo {
          font-family: "Times New Roman", Times, serif;
          font-size: 10.5px;
          background: #dcdcdc;
          color: #1a1a1a;
          min-height: 100vh;
        }
        .btn-bar { display: flex; justify-content: center; gap: 10px; margin: 16px auto; }
        .btn-print {
          padding: 10px 30px;
          background: #92D050;
          color: #12210a;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: bold;
          cursor: pointer;
          font-family: "Times New Roman", serif;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        .folha {
          width: 210mm;
          margin: 0 auto 40px;
          background: #fff;
          box-shadow: 0 4px 30px rgba(0,0,0,0.3);
          padding: 9mm 12mm 12mm;
        }
        .cabecalho {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 8px;
          border-bottom: 3px solid #92D050;
          margin-bottom: 10px;
        }
        .cab-esq { display: flex; align-items: center; gap: 10px; }
        .cab-esq img { height: 40px; }
        .empresa-nome { font-size: 12px; font-weight: bold; letter-spacing: .3px; }
        .empresa-sub { font-size: 8.5px; color: #555; line-height: 1.5; margin-top: 1px; }
        .cab-centro { text-align: center; }
        .doc-tipo {
          font-size: 8.5px; letter-spacing: 2px; text-transform: uppercase;
          color: #4a7c2e; font-weight: bold; margin-bottom: 2px;
        }
        .doc-titulo { font-size: 18px; font-weight: bold; letter-spacing: .5px; }
        .cab-dir { display: flex; align-items: center; gap: 12px; }
        .id-box { text-align: right; }
        .id-box .lbl { font-size: 7.5px; text-transform: uppercase; letter-spacing: 1px; color: #666; }
        .id-box .val { font-size: 14px; font-weight: bold; }
        .cab-dir img { height: 38px; }
        .painel {
          display: grid;
          grid-template-columns: 1.3fr 1fr;
          gap: 8px;
          margin-bottom: 8px;
        }
        .info-block { border: 1px solid #ccc; border-radius: 5px; overflow: hidden; }
        .info-block-title {
          background: #92D050;
          color: #12210a;
          font-size: 8.5px;
          font-weight: bold;
          text-transform: uppercase;
          letter-spacing: 1px;
          padding: 3px 8px;
        }
        .info-row { display: flex; border-top: 1px solid #e5e5e5; font-size: 10.5px; }
        .info-row:first-of-type { border-top: none; }
        .info-key {
          width: 96px; flex-shrink: 0;
          padding: 4px 8px;
          color: #666; font-size: 9px;
          text-transform: uppercase; letter-spacing: .3px;
          display: flex; align-items: center;
        }
        .info-val {
          padding: 4px 8px;
          flex: 1;
          font-weight: 500;
          display: flex; align-items: center;
          border-left: 1px solid #e5e5e5;
        }
        .cb-panel { padding: 6px 8px; }
        .cb-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 10px; }
        .cb-item { display: flex; align-items: center; gap: 5px; font-size: 9.5px; padding: 1px 0; }
        .cb {
          width: 10px; height: 10px; border: 1.3px solid #333;
          border-radius: 2px; flex-shrink: 0;
          display: inline-flex; align-items: center; justify-content: center;
          font-size: 8px; font-weight: bold; color: #fff;
        }
        .cb.on { background: #4a7c2e; border-color: #4a7c2e; }
        .diag-box {
          border: 1px solid #ccc; border-radius: 5px;
          padding: 6px 10px; margin-bottom: 8px;
          background: #fafcf8;
        }
        .diag-lbl { font-size: 8px; text-transform: uppercase; letter-spacing: 1px; color: #4a7c2e; font-weight: bold; margin-bottom: 2px; }
        .diag-txt { font-size: 11px; }
        .funcoes-bar {
          display: flex; flex-wrap: wrap; gap: 4px 14px;
          border: 1px solid #ccc; border-radius: 5px;
          padding: 6px 10px; margin-bottom: 10px;
          background: #fafcf8;
        }
        .funcoes-bar .cb-item { font-size: 9.5px; }
        .tabela-obra, .tabela-pecas {
          width: 100%; border-collapse: collapse;
          font-size: 9.5px; margin-bottom: 10px;
        }
        .tabela-obra caption, .tabela-pecas caption {
          text-align: left; font-size: 9px; font-weight: bold; text-transform: uppercase;
          letter-spacing: 1px; color: #4a7c2e; padding-bottom: 4px; caption-side: top;
        }
        .tabela-obra thead th, .tabela-pecas thead th {
          background: #1f2d17; color: #fff; font-weight: bold; font-size: 8.3px;
          text-transform: uppercase; letter-spacing: .4px; padding: 5px 6px;
          text-align: left; font-family: "Times New Roman", serif;
          border-bottom: 2px solid #92D050;
        }
        .tabela-obra tbody td, .tabela-pecas tbody td {
          padding: 4px 6px; border-bottom: 1px solid #e8e8e8; vertical-align: top;
        }
        .tabela-obra tbody tr:nth-child(even),
        .tabela-pecas tbody tr:nth-child(even) { background: #f7faf5; }
        .tabela-obra tfoot td {
          padding: 5px 6px; background: #eaf3e2; font-weight: bold;
          font-size: 9px; text-transform: uppercase; border-top: 2px solid #92D050;
        }
        .col-desc { width: 43%; } .col-nome { width: 17%; }
        .col-hora { width: 16%; text-align: center; } .col-total { width: 12%; text-align: center; }
        .col-nr { width: 6%; text-align: center; }
        .col-pp { width: 50%; } .col-dp { width: 16%; text-align: center; }
        .col-qp { width: 10%; text-align: center; } .col-cp { width: 24%; }
        .assinaturas-wrap { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; margin-top: 6px; }
        .ass-box { border: 1px solid #ccc; border-radius: 5px; padding: 8px; text-align: center; min-height: 56px; display: flex; flex-direction: column; justify-content: flex-end; }
        .ass-linha { border-bottom: 1px solid #999; height: 26px; font-size: 10px; font-style: italic; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 2px; color: #333; }
        .ass-cargo { font-size: 8px; text-transform: uppercase; letter-spacing: .6px; color: #666; margin-top: 4px; }
        .ass-data { font-size: 8px; color: #999; margin-top: 1px; }
        .rodape-legal {
          display: flex; justify-content: space-between; align-items: flex-end;
          border-top: 1px solid #ccc; padding-top: 5px; margin-top: 12px;
        }
        .rodape-texto { font-size: 6.8px; color: #777; line-height: 1.5; }
        .rodape-logo img { height: 22px; }
        .tabela-layout-impressao { width: 100%; border-collapse: collapse; border: none; }
        .tabela-layout-impressao td, .tabela-layout-impressao th { padding: 0; border: none; }
        @media screen {
          .print-header-space, .print-footer-space { display: none; }
        }
        @media print {
          .folha-fundo { background: #fff; }
          .btn-bar { display: none !important; }
          .folha { width: 100%; margin: 0; box-shadow: none; padding: 0; }
          @page { size: A4; margin: 0; }
          .cabecalho {
            position: fixed;
            top: 0; left: 0; right: 0;
            background: #fff;
            padding: 8mm 10mm 0px;
            margin-bottom: 0;
            z-index: 1000;
          }
          .rodape-legal {
            position: fixed;
            bottom: 0; left: 0; right: 0;
            background: #fff;
            padding: 0px 10mm 6mm;
            margin-top: 0;
            z-index: 1000;
          }
          .conteudo { padding: 0 10mm; }
          .painel, .diag-box, .funcoes-bar { page-break-inside: avoid; }
          .tabela-obra tbody tr { page-break-inside: avoid; }
          .tabela-pecas tbody tr { page-break-inside: avoid; }
          .assinaturas-wrap { page-break-inside: avoid; }
          /* Medido no navegador (+25px de folga, como no hub) */
          .print-header-space { height: ${alturas ? alturas.cab : 40}px !important; }
          .print-footer-space { height: ${alturas ? alturas.rod : 30}px !important; }
        }
      `}</style>

      <div className="btn-bar">
        <button type="button" className="btn-print" onClick={() => window.print()}>
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      <div className="folha">
        {/* CABEÇALHO REAL (FIXO) */}
        <div className="cabecalho" ref={cabRef}>
          <div className="cab-esq">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/DANMO.png" alt="Danmo" />
            <div>
              <div className="empresa-nome">Danmo Service System, Lda</div>
              <div className="empresa-sub">Porto da Beira · Nuit: 400024022</div>
            </div>
          </div>
          <div className="cab-centro">
            <div className="doc-tipo">Documento Técnico</div>
            <div className="doc-titulo">Ordem de Reparação</div>
          </div>
          <div className="cab-dir">
            <div className="id-box">
              <div className="lbl">Nº Ordem</div>
              <div className="val">{os.numero_obra || "S/Nº"}</div>
            </div>
            <div className="id-box">
              <div className="lbl">Data</div>
              <div className="val">{fData(os.data_abertura)}</div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/MMM.png" alt="Made in Mozambique" />
          </div>
        </div>

        {/* TABELA DE LAYOUT: repete o espaço do cabeçalho/rodapé em cada página */}
        <table className="tabela-layout-impressao">
          <thead>
            <tr>
              <td>
                <div className="print-header-space" />
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="conteudo">
                  <div className="painel">
                    <div className="info-block">
                      <div className="info-block-title">Identificação</div>
                      <div className="info-row">
                        <div className="info-key">Cliente</div>
                        <div className="info-val">{os.nome_cliente || "CdM"}</div>
                      </div>
                      <div className="info-row">
                        <div className="info-key">Equipamento</div>
                        <div className="info-val">{equip?.code || "-"}</div>
                      </div>
                      <div className="info-row">
                        <div className="info-key">Sector</div>
                        <div className="info-val">{os.sector || "-"}</div>
                      </div>
                      <div className="info-row">
                        <div className="info-key">Conta Horas</div>
                        <div className="info-val">
                          {os.hora_equipamento != null ? `${os.hora_equipamento} ${os.unidade_medida || "h"}` : ""}
                        </div>
                      </div>
                      <div className="info-row">
                        <div className="info-key">Abertura</div>
                        <div className="info-val">{fData(os.data_abertura)}</div>
                      </div>
                      <div className="info-row">
                        <div className="info-key">Colaborador</div>
                        <div className="info-val">
                          {Array.isArray(os.aberto_por) ? os.aberto_por.join(", ") : os.aberto_por || "-"}
                        </div>
                      </div>
                    </div>

                    <div className="info-block">
                      <div className="info-block-title">Tipo de Intervenção</div>
                      <div className="cb-panel">
                        <div className="cb-grid">
                          {tiposPainel.map((t) => (
                            <div className="cb-item" key={t.id}>
                              <span className={"cb" + (marcados.has(t.id) ? " on" : "")}>{marcados.has(t.id) ? "✓" : ""}</span>
                              {t.nome}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="diag-box">
                    <div className="diag-lbl">Diagnóstico / Motivo de Entrada</div>
                    <div className="diag-txt">{os.descricao_avaria || "-"}</div>
                  </div>

                  <div className="funcoes-bar">
                    {funcoesBar.map((f) => (
                      <div className="cb-item" key={f.id}>
                        <span className={"cb" + (funcoesMarcadas.has(f.id) ? " on" : "")}>
                          {funcoesMarcadas.has(f.id) ? "✓" : ""}
                        </span>
                        {f.nome}
                      </div>
                    ))}
                  </div>

                  <table className="tabela-obra">
                    <caption>Descrição da Mão de Obra</caption>
                    <thead>
                      <tr>
                        <th className="col-desc">Descrição do Trabalho</th>
                        <th className="col-nome">Técnico</th>
                        <th className="col-hora">Hora (Início - Fim)</th>
                        <th className="col-total">Tempo Total</th>
                        <th className="col-nr">Nº</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: Math.max(linhas.length, 6) }).map((_, i) => {
                        const l = linhas[i];
                        return (
                          <tr key={i}>
                            <td className="col-desc">{l ? l.desc : ""}</td>
                            <td className="col-nome">{l ? l.nome : ""}</td>
                            <td className="col-hora">{l && l.ini && l.fim ? `${l.ini} - ${l.fim}` : ""}</td>
                            <td className="col-total">{l ? l.total : ""}</td>
                            <td className="col-nr">{l ? l.nr : ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3} style={{ textAlign: "right" }}>
                          Tempo Total Mão de Obra
                        </td>
                        <td style={{ textAlign: "center" }}>{totalHoras > 0 ? `${totalHoras}h` : ""}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>

                  <table className="tabela-pecas">
                    <caption>Peças Aplicadas</caption>
                    <thead>
                      <tr>
                        <th className="col-pp">Peça / Material</th>
                        <th className="col-dp">Data</th>
                        <th className="col-qp">Qtd</th>
                        <th className="col-cp">Aplicado por</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: Math.max(pecas.length, 4) }).map((_, i) => {
                        const p = pecas[i];
                        return (
                          <tr key={i}>
                            <td className="col-pp">{p ? p.peca : ""}</td>
                            <td className="col-dp">{p && p.data ? fData(p.data) : ""}</td>
                            <td className="col-qp">{p ? qtdComUnidade(p.quantidade, p.unidade) : ""}</td>
                            <td className="col-cp">{p ? p.colaborador || "" : ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="assinaturas-wrap">
                    <div className="ass-box">
                      <div className="ass-linha">{assAbertura.nome}</div>
                      <div className="ass-cargo">Responsável Abertura</div>
                      <div className="ass-data">{assAbertura.data}</div>
                    </div>
                    <div className="ass-box">
                      <div className="ass-linha">{assSupervisor.nome}</div>
                      <div className="ass-cargo">Supervisor</div>
                      <div className="ass-data">{assSupervisor.data}</div>
                    </div>
                    <div className="ass-box">
                      <div className="ass-linha">{assChefe.nome}</div>
                      <div className="ass-cargo">Chefe da Oficina</div>
                      <div className="ass-data">{assChefe.data}</div>
                    </div>
                    <div className="ass-box">
                      <div className="ass-linha"></div>
                      <div className="ass-cargo">Cliente (CdM)</div>
                      <div className="ass-data">Data: ___/___/_____</div>
                    </div>
                  </div>
                </div>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>
                <div className="print-footer-space" />
              </td>
            </tr>
          </tfoot>
        </table>

        {/* RODAPÉ REAL (FIXO) */}
        <div className="rodape-legal" ref={rodRef}>
          <div className="rodape-texto">
            Código: DAN_ADO_FR_023_REV03_06.06.25
            <br />
            Este documento é propriedade da DANMO. Não é permitida sua reprodução sem autorização.
            <br />
            Depois de impresso este documento é considerado cópia não controlado
          </div>
          <div className="rodape-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logos/MESQUITA.png" alt="Grupo Mesquita" />
          </div>
        </div>
      </div>
    </div>
  );
}
