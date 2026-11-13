/**
 * /hst - Painel do Portal HST (cliente).
 *
 * Migração do dashboard.html do hub com melhorias:
 * - KPIs clicáveis que abrem a página certa (como no hub);
 * - alertas com as cores do portal e juiz partilhado (lib/hst.ts);
 * - dois gráficos de barras CSS (sem lib nova, mesma receita do painel
 *   da Aquisição);
 * - últimas medições de tensão com a classificação correcta (a lib
 *   recalcula a partir do valor: linhas antigas guardadas com grau
 *   trocado mostram o grau certo).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Activity,
  HeartPulse,
  LoaderCircle,
  MapPin,
  Shirt,
  Siren
} from "lucide-react";
import { Cabeca, pedir } from "@/components/oficina/ui-bits";
import { Card, CardContent } from "@/components/ui/card";
import {
  acidentesPorTipo,
  alertasPainelHst,
  areasPorNivel,
  classificarTensao,
  fmtDataHst,
  statsPainelHst,
  type AccaoHST,
  type AcidenteVisao,
  type AreaRiscoHST,
  type EntregaEpiHST,
  type MedicaoTensaoHST
} from "@/lib/hst";

type Dados = {
  ok: boolean;
  acidentes: AcidenteVisao[];
  acoes: AccaoHST[];
  areas: AreaRiscoHST[];
};

function Kpi({
  icone: Icone,
  label,
  valor,
  cor,
  href
}: {
  icone: typeof Siren;
  label: string;
  valor: React.ReactNode;
  cor: string;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="card-sombra transition-transform hover:-translate-y-0.5">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-white ${cor}`}>
              <Icone className="size-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-muted-foreground">{label}</div>
              <div className="truncate text-xl font-bold">{valor}</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function Barras({
  dados,
  corClasse
}: {
  dados: { label: string; count: number; cls?: string }[];
  corClasse?: string;
}) {
  if (!dados.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Sem dados.</p>;
  }
  const max = dados[0].count;
  return (
    <div>
      {dados.map((d) => (
        <div key={d.label} className="mb-2 flex items-center gap-2">
          <div className="w-40 truncate text-xs font-semibold text-muted-foreground" title={d.label}>
            {d.label}
          </div>
          <div className="h-3.5 flex-1 overflow-hidden rounded bg-muted">
            <div
              className={`h-full rounded ${corClasse || d.cls || "bg-sky-500"}`}
              style={{ width: `${max > 0 ? (d.count / max) * 100 : 0}%` }}
            />
          </div>
          <div className="w-8 text-right text-xs font-bold">{d.count}</div>
        </div>
      ))}
    </div>
  );
}

const CORES_CLS: Record<string, string> = {
  normal: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300",
  limitrofe: "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  alta: "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300"
};

export function HstClient() {
  const [dados, setDados] = useState<Dados | null>(null);
  const [falha, setFalha] = useState("");

  useEffect(() => {
    let vivo = true;
    pedir<Dados>("/api/hst/acidentes")
      .then((d) => {
        if (vivo) setDados(d);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  // As entregas de EPI e as medições de tensão chegam por rotas próprias
  // (cada uma só para quem vê a página dela).
  const [entregas, setEntregas] = useState<EntregaEpiHST[] | null>(null);
  const [medicoes, setMedicoes] = useState<MedicaoTensaoHST[] | null>(null);
  const [medFalha, setMedFalha] = useState(false);
  useEffect(() => {
    let vivo = true;
    pedir<{ entregas: EntregaEpiHST[] }>("/api/hst/epis")
      .then((d) => {
        if (vivo) setEntregas(d.entregas || []);
      })
      .catch(() => {
        if (vivo) setEntregas([]);
      });
    pedir<{ medicoes: MedicaoTensaoHST[] }>("/api/hst/medicoes")
      .then((d) => {
        if (vivo) setMedicoes(d.medicoes || []);
      })
      .catch(() => {
        if (vivo) setMedFalha(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const stats = useMemo(() => {
    if (!dados || !entregas || !medicoes) return null;
    const hoje = new Date().toISOString().slice(0, 10);
    return statsPainelHst(dados.acidentes, entregas, medicoes, dados.areas, hoje);
  }, [dados, entregas, medicoes]);

  const alertas = useMemo(() => {
    if (!dados || !medicoes) return [];
    const hoje = new Date().toISOString().slice(0, 10);
    return alertasPainelHst(medicoes, dados.acoes, dados.areas, hoje);
  }, [dados, medicoes]);

  const corAlerta: Record<string, string> = {
    erro: "border-l-4 border-red-600 bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200",
    aviso: "border-l-4 border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    ok: "border-l-4 border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
  };

  if (falha) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {falha}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo="Painel HST" subtitulo="Higiene e Segurança do Trabalho, visão geral" />

      {/* KPIs */}
      <section aria-label="Indicadores" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          icone={Siren}
          label="Acidentes este mês"
          cor="bg-red-600"
          href="/hst/acidentes"
          valor={stats ? String(stats.acidentesMes) : <LoaderCircle className="size-5 animate-spin" />}
        />
        <Kpi
          icone={AlertTriangle}
          label="Em investigação"
          cor="bg-amber-500"
          href="/hst/acidentes"
          valor={stats ? String(stats.emInvestigacao) : <LoaderCircle className="size-5 animate-spin" />}
        />
        <Kpi
          icone={Shirt}
          label="Entregas de EPIs (mês)"
          cor="bg-sky-600"
          href="/hst/epis"
          valor={stats ? String(stats.entregasMes) : <LoaderCircle className="size-5 animate-spin" />}
        />
        <Kpi
          icone={HeartPulse}
          label="Medições de tensão (mês)"
          cor="bg-emerald-600"
          href="/hst/tensao"
          valor={
            medFalha ? "-" : stats ? String(stats.medicoesMes) : <LoaderCircle className="size-5 animate-spin" />
          }
        />
        <Kpi
          icone={MapPin}
          label="Áreas de risco activas"
          cor="bg-slate-600"
          href="/hst/areas"
          valor={stats ? String(stats.areasAtivas) : <LoaderCircle className="size-5 animate-spin" />}
        />
        <Kpi
          icone={Activity}
          label="Colaboradores com tensão alta"
          cor="bg-red-700"
          href="/hst/tensao"
          valor={stats ? String(stats.colabsHta) : <LoaderCircle className="size-5 animate-spin" />}
        />
      </section>

      {/* Alertas */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-bold">Alertas</h2>
          <div className="space-y-2">
            {(alertas.length ? alertas : [{ nivel: "ok", texto: "A verificar alertas...", badge: "..." }]).map(
              (a, i) => (
                <div key={i} className={`flex items-center gap-3 rounded px-3 py-2 text-sm ${corAlerta[a.nivel]}`}>
                  <span className="flex-1">{a.texto}</span>
                  <span className="shrink-0 text-[0.72rem] font-bold">{a.badge}</span>
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Gráficos */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="card-sombra">
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-bold">Acidentes por tipo</h2>
            {dados ? (
              <Barras dados={acidentesPorTipo(dados.acidentes)} corClasse="bg-red-500" />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">A processar...</p>
            )}
          </CardContent>
        </Card>
        <Card className="card-sombra">
          <CardContent className="p-4">
            <h2 className="mb-3 text-sm font-bold">Áreas por nível de risco</h2>
            {dados ? (
              <Barras dados={areasPorNivel(dados.areas)} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">A processar...</p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Últimas medições */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Últimas medições de tensão</h2>
            <Link href="/hst/tensao" className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400">
              Ver todas
            </Link>
          </div>
          {medFalha ? (
            <p className="text-sm text-muted-foreground">Medições não disponíveis para esta pessoa.</p>
          ) : !medicoes ? (
            <p className="py-4 text-center text-sm text-muted-foreground">A carregar...</p>
          ) : medicoes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem medições registadas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Colaborador</th>
                    <th className="py-2 pr-3 font-medium">Data</th>
                    <th className="py-2 pr-3 font-medium">Tensão</th>
                    <th className="py-2 pr-3 font-medium">FC</th>
                    <th className="py-2 font-medium">Classificação</th>
                  </tr>
                </thead>
                <tbody>
                  {medicoes.slice(0, 10).map((m) => {
                    const cla = classificarTensao(m.sistolica, m.diastolica);
                    return (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="py-2 pr-3">
                          <Link
                            href={`/hst/tensao/pessoa?colab=${encodeURIComponent(m.colaborador_nome)}`}
                            className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
                          >
                            {m.colaborador_nome}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">{fmtDataHst(m.data_medicao, true)}</td>
                        <td className="py-2 pr-3 font-bold">{m.sistolica}/{m.diastolica}</td>
                        <td className="py-2 pr-3">{m.frequencia_cardiaca || "-"}</td>
                        <td className="py-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-[0.72rem] font-bold ${CORES_CLS[cla.cls]}`}>
                            {cla.texto}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
