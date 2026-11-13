/**
 * /hst/relatorios - Relatórios (cliente).
 *
 * 4 cartões com os períodos escolhidos à mão (mês para o resumo,
 * intervalo de datas para as listagens) e a lista de acidentes com o
 * link directo para o relatório de investigação A4. Links em nova aba:
 * o papel A4 é a cara do que sai da impressora.
 */

"use client";

import { useEffect, useState } from "react";
import { ClipboardList, FileBarChart, Printer, Shirt, Siren } from "lucide-react";
import { Cabeca, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fmtDataHst, STATUS_ACIDENTE, type AcidenteVisao } from "@/lib/hst";

const CORES_STATUS: Record<string, string> = {
  "Em Investigacao": "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  Investigado: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300",
  Encerrado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
};

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

function Cartao({
  icone: Icone,
  corIcone,
  titulo,
  descricao,
  nota,
  children
}: {
  icone: typeof Siren;
  corIcone: string;
  titulo: string;
  descricao: string;
  nota: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="card-sombra">
      <CardContent className="p-5">
        <div className="mb-3 flex items-center gap-3">
          <span className={`flex size-12 items-center justify-center rounded-lg text-white ${corIcone}`}>
            <Icone className="size-6" aria-hidden />
          </span>
          <div>
            <div className="font-bold">{titulo}</div>
            <div className="text-xs text-muted-foreground">{descricao}</div>
          </div>
        </div>
        {children}
        <p className="mt-2 text-xs text-muted-foreground">{nota}</p>
      </CardContent>
    </Card>
  );
}

export function RelatoriosClient() {
  const hoje = new Date();
  const [mes, setMes] = useState(hoje.getMonth() + 1);
  const [ano, setAno] = useState(hoje.getFullYear());
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");

  const [acidentes, setAcidentes] = useState<AcidenteVisao[] | null>(null);
  useEffect(() => {
    pedir<{ acidentes: AcidenteVisao[] }>("/api/hst/acidentes")
      .then((d) => setAcidentes(d.acidentes))
      .catch(() => setAcidentes([]));
  }, []);

  const qsPeriodo = de || ate ? `&de=${de || ""}&ate=${ate || ""}` : "";

  return (
    <div className="space-y-5">
      <Cabeca titulo="Relatórios HST" subtitulo="Gerar e consultar relatórios do Portal HST" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao
          icone={FileBarChart}
          corIcone="bg-emerald-600"
          titulo="Resumo Mensal HST"
          descricao="Visão geral do mês: acidentes, entregas de EPIs, medições de tensão, acções pendentes."
          nota="Abre o papel A4 com os indicadores do mês escolhido."
        >
          <div className="flex flex-wrap items-center gap-2">
            <select aria-label="Mês do resumo" className="h-9 rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
              value={mes} onChange={(e) => setMes(Number(e.target.value))}>
              {MESES.map((n, i) => (
                <option key={n} value={i + 1}>{n}</option>
              ))}
            </select>
            <Input type="number" className="w-24" min={2000} max={2100} value={ano}
              onChange={(e) => setAno(Number(e.target.value) || hoje.getFullYear())} aria-label="Ano do resumo" />
            <Button asChild>
              <a href={`/imprimir/hst/resumo?ano=${ano}&mes=${mes}`} target="_blank" rel="noopener noreferrer">
                <Printer className="size-4" aria-hidden /> Abrir
              </a>
            </Button>
          </div>
        </Cartao>

        <Cartao
          icone={Siren}
          corIcone="bg-red-600"
          titulo="Relatório de Acidentes"
          descricao="Lista de acidentes e incidentes num período, com tipo, status e dias de afastamento."
          nota="Datas vazias = todos os registos."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="w-40" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Data inicial" />
            <span className="text-sm text-muted-foreground">a</span>
            <Input type="date" className="w-40" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Data final" />
            <Button asChild>
              <a href={`/imprimir/hst/lista?tipo=acidentes${qsPeriodo}`} target="_blank" rel="noopener noreferrer">
                <Printer className="size-4" aria-hidden /> Abrir
              </a>
            </Button>
          </div>
        </Cartao>

        <Cartao
          icone={Shirt}
          corIcone="bg-amber-600"
          titulo="Relatório de Entregas de EPIs"
          descricao="Registo de entregas de equipamentos de protecção individual por período."
          nota="Datas vazias = todas as entregas."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" className="w-40" value={de} onChange={(e) => setDe(e.target.value)} aria-label="Data inicial" />
            <span className="text-sm text-muted-foreground">a</span>
            <Input type="date" className="w-40" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Data final" />
            <Button asChild>
              <a href={`/imprimir/hst/lista?tipo=epis${qsPeriodo}`} target="_blank" rel="noopener noreferrer">
                <Printer className="size-4" aria-hidden /> Abrir
              </a>
            </Button>
          </div>
        </Cartao>

        <Cartao
          icone={ClipboardList}
          corIcone="bg-sky-600"
          titulo="Relatório de Tensão Arterial"
          descricao="Última medição por colaborador, com classificação e colaboradores com HTA identificada."
          nota="A lista nasce ordenada do grau mais alto para o mais leve."
        >
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild>
              <a href={`/imprimir/hst/lista?tipo=tensao${qsPeriodo}`} target="_blank" rel="noopener noreferrer">
                <Printer className="size-4" aria-hidden /> Abrir
              </a>
            </Button>
          </div>
        </Cartao>
      </div>

      {/* Relatórios de investigação por acidente */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-1 text-sm font-bold">Relatórios de Investigação de Acidentes</h2>
          <p className="mb-3 text-xs text-muted-foreground">Clica num acidente para abrir o relatório completo de investigação (A4).</p>
          {!acidentes ? (
            <p className="py-4 text-center text-sm text-muted-foreground">A carregar...</p>
          ) : acidentes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum acidente registado.</p>
          ) : (
            <div className="divide-y divide-border">
              {acidentes.map((a) => (
                <div key={a.id} className="flex items-center gap-3 py-2.5">
                  <span className="w-40 shrink-0 font-bold">{a.numero || "Registo antigo"}</span>
                  <span className="flex-1 text-sm text-muted-foreground">
                    {fmtDataHst(a.dataDisplay, true)} - {a.nomeDisplay}
                  </span>
                  <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${CORES_STATUS[a.status || ""] || ""}`}>
                    {a.status || "-"}
                  </span>
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/imprimir/hst/acidente?id=${a.id}`} target="_blank" rel="noopener noreferrer">
                      <Printer className="size-3.5" aria-hidden /> Ver
                    </a>
                  </Button>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[0.68rem] text-muted-foreground">
            Status possíveis: {STATUS_ACIDENTE.join(", ")}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
