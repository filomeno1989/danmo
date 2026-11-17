"use client";

/**
 * Editor da ESCALA MENSAL (cliente).
 *
 * A grelha é um <table> com 117 linhas x dias: as linhas são memoizadas
 * para o React só redesenhar a linha editada. As gravações são
 * agrupadas (1.2 s de calma) e mandadas em lote a /api/escalas/dias:
 * células com código fazem upsert, células limpas apagam a linha.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Printer, Wand2, Sun, Umbrella, ChevronRight, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, pedir, Rodar } from "@/components/oficina/ui-bits";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { semAcentos } from "@/lib/uso-comum";
import {
  AREAS_ESCALA,
  avisoAuditoria,
  CODIGOS_ESCALA,
  contagensDe,
  COR_CODIGO,
  cicloDeGrupo,
  diaSemanaCurto,
  hojeEsc,
  MESES_ESCALA,
  mesDatas,
  propostaCiclo,
  semanaContendo,
  SIGNIFICADO,
  totalTrabalho,
  type CodigoEscala,
  type EscColab,
  type EscDia
} from "@/lib/escalas";

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
  ferias: { codigo: string; data_inicio: string; data_fim: string }[];
  folgasSaldo: { colaborador_id: string; saldo: number }[];
};

type Linha = Record<string, string>;
type Grelha = Record<string, Linha>;
type PendenciaLinha = Record<string, string | null>;
type Pendencias = Record<string, PendenciaLinha>;

export function MensalClient({
  anoInicial,
  mesInicial
}: {
  anoInicial?: number | null;
  mesInicial?: number | null;
}) {
  const hoje = hojeEsc();
  const [ano, setAno] = useState(anoInicial || Number(hoje.slice(0, 4)));
  const [mes, setMes] = useState(mesInicial || Number(hoje.slice(5, 7)));
  const [dados, setDados] = useState<DadosMes | null>(null);
  const [falha, setFalha] = useState("");
  const [grelha, setGrelha] = useState<Grelha>({});
  const [busca, setBusca] = useState("");
  const [sel, setSel] = useState<{ id: string; data: string } | null>(null);
  const [dialogCiclo, setDialogCiclo] = useState(false);
  const [ancoras, setAncoras] = useState({ A: "", B: "", C: "", D: "" });
  const [dialogIntervalo, setDialogIntervalo] = useState<{ id: string; data: string } | null>(null);
  const [intervaloCodigo, setIntervaloCodigo] = useState<CodigoEscala>("LD");
  const [intervaloFim, setIntervaloFim] = useState("");
  const [intervaloSobre, setIntervaloSobre] = useState(true);
  const [dialogNota, setDialogNota] = useState(false);
  const [notaTexto, setNotaTexto] = useState("");
  const [ocupado, setOcupado] = useState("");

  const pendentesRef = useRef<Pendencias>({});
  const [pendentes, setPendentes] = useState(0);
  const [gravando, setGravando] = useState(false);
  const [gravadoAs, setGravadoAs] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const carregadoKey = useRef<string>("");
  const [marcadorCarregado, setMarcadorCarregado] = useState("");

  const aCarregar = marcadorCarregado !== `${ano}-${mes}`;

  /* ---------- carregamento ---------- */

  useEffect(() => {
    let vivo = true;
    pedir<DadosMes>(`/api/escalas/mes?ano=${ano}&mes=${mes}`)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        const g: Grelha = {};
        for (const dia of d.dias || []) {
          if (!g[dia.colaborador_id]) g[dia.colaborador_id] = {};
          g[dia.colaborador_id][dia.data] = dia.codigo;
        }
        setGrelha(g);
        pendentesRef.current = {};
        setPendentes(0);
        setNotaTexto(d.nota || "");
        setFalha("");
        carregadoKey.current = `${ano}-${mes}`;
        setMarcadorCarregado(`${ano}-${mes}`);
        if (d.sqlFalta) {
          setFalha("As tabelas da Escala ainda não existem na base. Cola o sql/fase9-escalas.sql no Supabase e volta a abrir.");
        }
      })
      .catch((e: Error) => {
        if (vivo) {
          setFalha(e.message);
          carregadoKey.current = `${ano}-${mes}`;
          setMarcadorCarregado(`${ano}-${mes}`);
        }
      });
    return () => {
      vivo = false;
    };
  }, [ano, mes]);

  /* ---------- derivados ---------- */

  const datas = useMemo(() => mesDatas(ano, mes), [ano, mes]);
  const feriadoSet = useMemo(
    () => new Map((dados?.feriados || []).map((f) => [f.data, f.descricao])),
    [dados]
  );
  const saldoPorPessoa = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of dados?.folgasSaldo || []) m.set(s.colaborador_id, s.saldo);
    return m;
  }, [dados]);

  const gente = useMemo(() => {
    const filtro = semAcentos(busca);
    return (dados?.colaboradores || []).filter(
      (c) =>
        c.ativo &&
        (!filtro ||
          semAcentos(c.nome).includes(filtro) ||
          semAcentos(c.codigo).includes(filtro))
    );
  }, [dados, busca]);

  const linhasPorArea = useMemo(() => {
    const mapa = new Map<string, EscColab[]>();
    for (const area of AREAS_ESCALA) {
      mapa.set(
        area,
        gente
          .filter((c) => (c.area || "Outros") === area)
          .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome))
      );
    }
    return mapa;
  }, [gente]);

  const contagens = useMemo(
    () => contagensDe(dados?.colaboradores || [], (id) => grelha[id] || {}, datas),
    [dados, grelha, datas]
  );

  const avisos = useMemo(() => {
    const lista: { nome: string; aviso: string }[] = [];
    for (const c of dados?.colaboradores || []) {
      if (!c.ativo) continue;
      const a = avisoAuditoria(grelha[c.id] || {});
      if (a) lista.push({ nome: c.nome, aviso: a });
    }
    return lista;
  }, [dados, grelha]);

  const totalPendentes = pendentes;

  /* ---------- gravação ---------- */

  const gravar = useCallback(
    async (forcar = false) => {
      const pend = pendentesRef.current;
      const ids = Object.keys(pend);
      if (!ids.length && !forcar) return;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setGravando(true);
      try {
        const linhas = ids.map((id) => ({ id, celulas: pend[id] }));
        const r = await fetch("/api/escalas/dias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ano, mes, linhas })
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d?.ok === false) {
          throw new Error(d?.erro || "Não foi possível gravar a escala.");
        }
        pendentesRef.current = {};
        setPendentes(0);
        setGravadoAs(new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Falha ao gravar.");
      } finally {
        setGravando(false);
      }
    },
    [ano, mes]
  );

  const marcar = useCallback(
    (id: string, data: string, codigo: string | null) => {
      setGrelha((prev) => {
        const linha = { ...(prev[id] || {}) };
        if (codigo == null) {
          delete linha[data];
        } else {
          linha[data] = codigo;
        }
        return { ...prev, [id]: linha };
      });
      const pend = pendentesRef.current;
      pend[id] = { ...(pend[id] || {}) };
      pend[id][data] = codigo;
      setPendentes(Object.keys(pend).length);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void gravar(), 1200);
    },
    [gravar]
  );

  /* ---------- acções em lote ---------- */

  const aplicarEmLote = useCallback(
    async (rotulo: string, fn: (id: string, data: string, atual: string | undefined) => string | null) => {
      setOcupado(rotulo);
      try {
        let n = 0;
        for (const c of dados?.colaboradores || []) {
          if (!c.ativo) continue;
          for (const data of datas) {
            const atual = grelha[c.id]?.[data];
            const novo = fn(c.id, data, atual);
            if (novo !== null) {
              marcar(c.id, data, novo);
              n += 1;
            }
          }
        }
        toast.success(`${rotulo}: ${n} células preenchidas.`);
      } finally {
        setOcupado("");
      }
    },
    [dados, datas, grelha, marcar]
  );

  const trazerFerias = () =>
    aplicarEmLote("Férias do plano", (id, data, atual) => {
      if (atual) return null;
      const c = (dados?.colaboradores || []).find((x) => x.id === id);
      const f = (dados?.ferias || []).find(
        (x) => c && x.codigo === c.codigo && data >= x.data_inicio && data <= x.data_fim
      );
      return f ? "LD" : null;
    });

  const aplicarFeriados = () =>
    aplicarEmLote("Feriados", (id, data, atual) => {
      if (atual || !feriadoSet.has(data)) return null;
      return "FRD";
    });

  const preencherNorm = () =>
    aplicarEmLote("Norm. nas vazias", (_id, _data, atual) => (atual ? null : "Norm."));

  /* ---------- gerador do ciclo ---------- */

  const proposta = useMemo(() => {
    if (!dialogCiclo || !ancoras.A) return null;
    const grupos: Record<string, string[]> = { A: [], B: [], C: [], D: [] };
    for (const c of dados?.colaboradores || []) {
      if (c.ativo && c.grupo && grupos[c.grupo]) grupos[c.grupo].push(c.id);
    }
    const p = propostaCiclo(ancoras.A, grupos, grelha, datas);
    let n = 0;
    for (const id of Object.keys(p.celulas)) n += Object.keys(p.celulas[id]).length;
    return { ...p, total: n };
  }, [dialogCiclo, ancoras, dados, grelha, datas]);

  const aplicarCiclo = () => {
    if (!proposta) return;
    let n = 0;
    for (const [id, celulas] of Object.entries(proposta.celulas)) {
      for (const [data, codigo] of Object.entries(celulas)) {
        marcar(id, data, codigo);
        n += 1;
      }
    }
    toast.success(`Ciclo de turnos aplicado: ${n} células.`);
    if (proposta.avisos.length) {
      for (const a of proposta.avisos) toast.warning(a);
    }
    setDialogCiclo(false);
  };

  /* ---------- intervalo ---------- */

  const abrirIntervalo = (id: string, data: string) => {
    setDialogIntervalo({ id, data });
    setIntervaloFim(data);
  };

  const aplicarIntervalo = () => {
    if (!dialogIntervalo || !intervaloFim) return;
    const { id, data } = dialogIntervalo;
    if (intervaloFim < data) {
      toast.error("O dia final é anterior ao inicial.");
      return;
    }
    let n = 0;
    for (const d of datas) {
      if (d < data || d > intervaloFim) continue;
      if (!intervaloSobre && grelha[id]?.[d]) continue;
      marcar(id, d, intervaloCodigo);
      n += 1;
    }
    toast.success(`Intervalo marcado: ${n} dias com ${intervaloCodigo}.`);
    setDialogIntervalo(null);
  };

  /* ---------- nota ---------- */

  const gravarNota = async () => {
    try {
      const r = await fetch("/api/escalas/nota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ano, mes, texto: notaTexto })
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d?.ok === false) throw new Error(d?.erro || "Falha ao gravar a nota.");
      toast.success("Nota do mês gravada.");
      setDialogNota(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gravar a nota.");
    }
  };

  const escolherCelula = (id: string, data: string) => {
    setSel({ id, data });
  };

  const semanaAtual = semanaContendo(hoje)[0];
  const pessoaSel = sel ? (dados?.colaboradores || []).find((c) => c.id === sel.id) : null;

  if (falha) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-6 text-sm text-destructive">{falha}</CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Cabeca titulo="Escalas" subtitulo={`Escala mensal de ${MESES_ESCALA[mes - 1]} de ${ano}`}>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={mes}
          onChange={(e) => setMes(Number(e.target.value))}
          aria-label="Mês"
        >
          {MESES_ESCALA.map((nome, i) => (
            <option key={nome} value={i + 1}>
              {nome}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={ano}
          onChange={(e) => setAno(Number(e.target.value))}
          aria-label="Ano"
        >
          {[ano - 1, ano, ano + 1].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/escalas/semanal?inicio=${semanaAtual}`}>
            <CalendarDays className="size-4" aria-hidden /> Semanal
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/imprimir/escalas/mensal?ano=${ano}&mes=${mes}`}>
            <Printer className="size-4" aria-hidden /> Imprimir mensal
          </Link>
        </Button>
      </Cabeca>

      {aCarregar ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Rodar /> A carregar a escala...
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-3" data-ferramentas-mensal>
              <Button size="sm" variant="outline" onClick={trazerFerias} disabled={!!ocupado}>
                {ocupado === "Férias do plano" ? <Rodar /> : <Umbrella className="size-4" aria-hidden />}
                Férias do plano
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialogCiclo(true)} disabled={!!ocupado}>
                <Wand2 className="size-4" aria-hidden /> Gerar ciclo de turnos
              </Button>
              <Button size="sm" variant="outline" onClick={aplicarFeriados} disabled={!!ocupado}>
                {ocupado === "Feriados" ? <Rodar /> : <Sun className="size-4" aria-hidden />}
                Feriados
              </Button>
              <Button size="sm" variant="outline" onClick={preencherNorm} disabled={!!ocupado}>
                {ocupado === "Norm. nas vazias" ? <Rodar /> : null}
                Norm. nas vazias
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialogNota(true)}>
                Nota do mês
              </Button>
              <Input
                className="h-9 w-44"
                placeholder="Buscar nome ou código"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                aria-label="Buscar"
              />
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground" data-estado-gravacao>
                {gravando ? (
                  <span className="flex items-center gap-1">
                    <Rodar /> A gravar...
                  </span>
                ) : totalPendentes > 0 ? (
                  <span>{totalPendentes} linhas por gravar</span>
                ) : gravadoAs ? (
                  <span>Gravado às {gravadoAs}</span>
                ) : null}
                {totalPendentes > 0 ? (
                  <Button size="sm" onClick={() => void gravar(true)}>
                    Gravar agora
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {notaTexto ? (
            <p className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200" data-nota-mes>
              NOTA IMPORTANTE: {notaTexto}
            </p>
          ) : null}

          {avisos.length ? (
            <Card className="border-amber-400" data-aviso-auditoria>
              <CardContent className="p-3 text-sm text-amber-800 dark:text-amber-300">
                <p className="font-semibold">Auditoria (LD e turno no mesmo mês)</p>
                <ul className="mt-1 list-disc pl-5">
                  {avisos.map((a) => (
                    <li key={a.nome}>
                      {a.nome}: {a.aviso}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-1.5">
                {CODIGOS_ESCALA.map((c) => (
                  <span key={c} className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${COR_CODIGO[c]}`}>
                    {c} - {SIGNIFICADO[c]}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="overflow-auto p-0" data-grelha-mensal>
              <table className="w-full border-collapse text-[0.7rem]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 min-w-44 border-b bg-card px-2 py-1.5 text-left">Colaborador</th>
                    {datas.map((data) => {
                      const fds = [6, 0].includes(new Date(data + "T00:00:00Z").getUTCDay());
                      return (
                        <th
                          key={data}
                          className={`border-b px-0.5 py-1 text-center ${feriadoSet.has(data) ? "bg-red-100 dark:bg-red-950/60" : fds ? "bg-muted" : ""}`}
                          title={feriadoSet.get(data) || undefined}
                        >
                          <div className="font-bold">{Number(data.slice(8, 10))}</div>
                          <div className="text-[0.55rem] font-normal text-muted-foreground">
                            {diaSemanaCurto(data)}
                          </div>
                        </th>
                      );
                    })}
                    <th className="border-b px-2 py-1 text-center">Folgas</th>
                  </tr>
                </thead>
                <tbody>
                  {AREAS_ESCALA.map((area) => {
                    const lista = linhasPorArea.get(area) || [];
                    if (!lista.length) return null;
                    return (
                      <LinhaArea
                        key={area}
                        area={area}
                        lista={lista}
                        datas={datas}
                        grelha={grelha}
                        saldoPorPessoa={saldoPorPessoa}
                        sel={sel}
                        onSel={escolherCelula}
                        onIntervalo={abrirIntervalo}
                      />
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardContent className="p-4">
                <h2 className="mb-2 text-sm font-bold">Norm. por área (por dia)</h2>
                <div className="overflow-auto">
                  <table className="w-full text-[0.7rem]">
                    <tbody>
                      {AREAS_ESCALA.map((area) => {
                        const linha = contagens.porArea[area] || [];
                        const alguma = linha.some((c) => (c["Norm."] || 0) > 0);
                        if (!alguma) return null;
                        return (
                          <tr key={area}>
                            <td className="py-0.5 pr-3 whitespace-nowrap text-muted-foreground">{area}</td>
                            {linha.map((c, i) => (
                              <td key={i} className="text-center tabular-nums">
                                {c["Norm."] || ""}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4" data-contagens-dia>
                <h2 className="mb-2 text-sm font-bold">Contagens do dia</h2>
                <div className="overflow-auto">
                  <table className="w-full text-[0.7rem]">
                    <tbody>
                      {CODIGOS_ESCALA.map((codigo) => {
                        const alguma = contagens.global.some((c) => (c[codigo] || 0) > 0);
                        if (!alguma) return null;
                        return (
                          <tr key={codigo}>
                            <td className="py-0.5 pr-3 whitespace-nowrap text-muted-foreground">{codigo}</td>
                            {contagens.global.map((c, i) => (
                              <td key={i} className="text-center tabular-nums">
                                {c[codigo] || ""}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                      <tr className="font-bold">
                        <td className="py-0.5 pr-3 whitespace-nowrap">Em trabalho</td>
                        {contagens.global.map((c, i) => (
                          <td key={i} className="text-center tabular-nums" data-total-dia={i}>
                            {totalTrabalho(c)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {sel ? (
        <div
          className="sticky bottom-2 z-30 mx-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl border bg-card p-2 shadow-lg"
          data-barra-codigo
        >
          <span className="px-2 text-xs text-muted-foreground">
            {pessoaSel?.nome} - {Number(sel.data.slice(8, 10))}/{sel.data.slice(5, 7)}
          </span>
          {CODIGOS_ESCALA.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                marcar(sel.id, sel.data, c);
                setSel(null);
              }}
              className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${COR_CODIGO[c]}`}
            >
              {c}
            </button>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              marcar(sel.id, sel.data, null);
              setSel(null);
            }}
          >
            Limpar
          </Button>
          <Button size="sm" variant="outline" onClick={() => abrirIntervalo(sel.id, sel.data)}>
            <ChevronRight className="size-4" aria-hidden /> Intervalo
          </Button>
        </div>
      ) : null}

      {dialogCiclo ? (
        <DialogSimples titulo="Gerar ciclo de turnos A-D" fechar={() => setDialogCiclo(false)}>
          <p className="text-sm text-muted-foreground">
            Indica o dia do 1º 07/19 do Grupo A: B começa 2 dias depois, C a 4 e D a 6. Escreve só
            em células vazias ou já de turno; nunca toca em LD, Sup., Esc., FRD, CCIS ou TDP.
          </p>
          <div className="mt-3">
            <label className="text-xs font-semibold">Dia do 1º 07/19 do Grupo A</label>
            <Input
              type="date"
              className="mt-1"
              value={ancoras.A}
              onChange={(e) => setAncoras({ A: e.target.value, B: e.target.value, C: e.target.value, D: e.target.value })}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            B, C e D nascem da âncora do A com o desfasamento da casa. Se algum grupo começar
            noutro dia, acerta à mão nas células depois de aplicar.
          </p>
          {proposta ? (
            <div className="mt-3 rounded-lg border bg-muted/40 p-3 text-sm" data-preview-ciclo>
              <p>
                <span className="font-semibold">{proposta.total}</span> células vão ser escritas.
              </p>
              {(["A", "B", "C", "D"] as const).map((g) => {
                const amostra = cicloDeGrupo(g, ancoras.A, datas).slice(0, 8);
                return (
                  <p key={g} className="mt-1 text-xs text-muted-foreground">
                    Grupo {g}: manhã em {amostra.filter((x) => x.codigo === "07/19").map((x) => x.data.slice(8, 10)).join(", ") || "-"} /
                    noite em {amostra.filter((x) => x.codigo === "19/07").map((x) => x.data.slice(8, 10)).join(", ") || "-"}
                  </p>
                );
              })}
              {proposta.avisos.length ? (
                <ul className="mt-2 list-disc pl-5 text-xs text-amber-700 dark:text-amber-400">
                  {proposta.avisos.slice(0, 6).map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogCiclo(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={aplicarCiclo} disabled={!proposta || proposta.total === 0}>
              Aplicar
            </Button>
          </div>
        </DialogSimples>
      ) : null}

      {dialogIntervalo ? (
        <DialogSimples titulo="Marcar intervalo de dias" fechar={() => setDialogIntervalo(null)}>
          <p className="text-sm text-muted-foreground">
            {(dados?.colaboradores || []).find((c) => c.id === dialogIntervalo.id)?.nome} de{" "}
            {dialogIntervalo.data.slice(8, 10)}/{dialogIntervalo.data.slice(5, 7)} até:
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs font-semibold">Código</label>
              <select
                className="mt-1 h-9 rounded-md border bg-background px-2 text-sm"
                value={intervaloCodigo}
                onChange={(e) => setIntervaloCodigo(e.target.value as CodigoEscala)}
              >
                {CODIGOS_ESCALA.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold">Dia final</label>
              <Input
                type="date"
                className="mt-1"
                value={intervaloFim}
                onChange={(e) => setIntervaloFim(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={intervaloSobre}
                onChange={(e) => setIntervaloSobre(e.target.checked)}
              />
              Sobrescrever existentes
            </label>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogIntervalo(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={aplicarIntervalo}>
              Aplicar
            </Button>
          </div>
        </DialogSimples>
      ) : null}

      {dialogNota ? (
        <DialogSimples titulo="Nota importante do mês" fechar={() => setDialogNota(false)}>
          <p className="text-sm text-muted-foreground">
            Vai no pé do papel afixado, como a nota da operação de granito.
          </p>
          <textarea
            className="mt-2 min-h-24 w-full rounded-md border bg-background p-2 text-sm"
            maxLength={400}
            value={notaTexto}
            onChange={(e) => setNotaTexto(e.target.value)}
          />
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setDialogNota(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={gravarNota}>
              Gravar nota
            </Button>
          </div>
        </DialogSimples>
      ) : null}
    </div>
  );
}

/* ============ secção de linhas (o compilador React memoiza) ============ */

function LinhaArea({
  area,
  lista,
  datas,
  grelha,
  saldoPorPessoa,
  sel,
  onSel,
  onIntervalo
}: {
  area: string;
  lista: EscColab[];
  datas: string[];
  grelha: Grelha;
  saldoPorPessoa: Map<string, number>;
  sel: { id: string; data: string } | null;
  onSel: (id: string, data: string) => void;
  onIntervalo: (id: string, data: string) => void;
}) {
  const colSpan = 2 + datas.length;
  return (
    <>
      <tr>
        <td colSpan={colSpan} className="bg-slate-900 px-2 py-1 text-[0.65rem] font-bold tracking-wide text-white">
          {area}
        </td>
        <td className="bg-slate-900 px-2 py-1 text-[0.65rem] font-bold tracking-wide text-white" />
      </tr>
      {lista.map((p) => {
        const linha = grelha[p.id] || {};
        return (
          <tr key={p.id} className="border-b">
            <td className="sticky left-0 z-10 bg-card px-2 py-1">
              <div className="flex items-baseline gap-1">
                <span className="truncate font-semibold" title={`${p.nome} - ${p.categoria}`}>
                  {p.nome}
                </span>
                <span className="text-[0.6rem] text-muted-foreground">{p.codigo}</span>
                {p.grupo ? <span className="text-[0.6rem] font-bold text-sky-600 dark:text-sky-400">G{p.grupo}</span> : null}
              </div>
              <div className="truncate text-[0.6rem] text-muted-foreground">{p.contacto || "-"}</div>
            </td>
            {datas.map((data) => {
              const v = linha[data];
              const escolhida = sel?.id === p.id && sel?.data === data;
              return (
                <td key={data} className="p-0 text-center">
                  <button
                    type="button"
                    onClick={() => onSel(p.id, data)}
                    onDoubleClick={() => onIntervalo(p.id, data)}
                    className={`h-7 w-full text-[0.62rem] font-semibold ${v ? COR_CODIGO[v] || "" : "text-transparent hover:bg-muted"} ${escolhida ? "outline outline-2 outline-primario" : ""}`}
                    title={`${p.nome} - ${Number(data.slice(8, 10))}/${data.slice(5, 7)}`}
                    aria-label={`${p.nome} dia ${data}`}
                  >
                    {v || "."}
                  </button>
                </td>
              );
            })}
            <td className="px-2 text-center tabular-nums">
              {saldoPorPessoa.get(p.id) ? String(saldoPorPessoa.get(p.id)).replace(".", ",") : ""}
            </td>
          </tr>
        );
      })}
    </>
  );
}

/* ============ dialog básico ============ */

function DialogSimples({
  titulo,
  fechar,
  children
}: {
  titulo: string;
  fechar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={fechar}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border bg-card p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={titulo}
      >
        <h3 className="mb-2 text-base font-bold">{titulo}</h3>
        {children}
      </div>
    </div>
  );
}
