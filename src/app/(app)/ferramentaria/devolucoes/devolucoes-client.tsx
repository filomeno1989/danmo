/**
 * /ferramentaria/devolucoes (cliente).
 *
 * Sem filtros mostra as últimas 50; com filtros mostra tudo do filtro.
 * O colaborador filtra por nome OU código (o mesmo componente dos
 * empréstimos, aprovado pelo Filomeno).
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { Filter, LoaderCircle, X } from "lucide-react";
import { Cabeca, pedir } from "@/components/oficina/ui-bits";
import { Card, CardContent } from "@/components/ui/card";
import { SelecionarColaborador } from "@/components/oficina/selecionar-colaborador";
import {
  corEstadoVoltar,
  ESTADOS_VOLTAR,
  type ColaboradorFerr,
  type MovimentoVisao
} from "@/lib/ferramentaria";

type Listas = { colaboradores: ColaboradorFerr[] };

export function DevolucoesClient() {
  const [movimentos, setMovimentos] = useState<MovimentoVisao[] | null>(null);
  const [colaboradores, setColaboradores] = useState<ColaboradorFerr[]>([]);
  const [falha, setFalha] = useState("");

  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [estado, setEstado] = useState("");
  const [colaborador, setColaborador] = useState("");

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<{ movimentos: MovimentoVisao[] }>("/api/ferramentaria/movimentos?tipo=devolucao"),
      pedir<Listas>("/api/ferramentaria/listas")
        .then((l) => ({ colaboradores: l.colaboradores || [] }))
        .catch(() => ({ colaboradores: [] }))
    ])
      .then(([m, l]) => {
        if (!vivo) return;
        setMovimentos(m.movimentos);
        setColaboradores(l.colaboradores);
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const filtradas = useMemo(() => {
    if (!movimentos) return [];
    const colabBusca = colaborador.trim().toLowerCase();
    // Quem escolhe por CÓDIGO (DM0011) no seletor filtra pelo NOME da
    // pessoa resolvida; texto livre continua a procurar na substring.
    const pessoa = colabBusca
      ? colaboradores.find(
          (c) =>
            (c.code || "").toLowerCase() === colabBusca ||
            (c.name || "").toLowerCase() === colabBusca
        )
      : undefined;
    const termos = [colabBusca];
    if (pessoa?.name) termos.push(pessoa.name.toLowerCase());
    return movimentos.filter((m) => {
      const data = (m.data_devolucao || "").slice(0, 10);
      if (de && data && data < de) return false;
      if (ate && data && data > ate) return false;
      if (estado && (m.estado_ao_voltar || "").toLowerCase() !== estado) return false;
      if (colabBusca) {
        const nome = (m.colaborador || "").toLowerCase();
        if (!termos.some((t) => t && nome.includes(t))) return false;
      }
      return true;
    });
  }, [movimentos, de, ate, estado, colaborador, colaboradores]);

  const temFiltros = de || ate || estado || colaborador;

  if (falha) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {falha}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo="Devoluções" subtitulo="Histórico das ferramentas que voltaram" />

      {/* Filtros */}
      <Card className="card-sombra">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4" data-filtros-devolucoes>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-de">
              De
            </label>
            <input
              id="f-de"
              type="date"
              value={de}
              onChange={(e) => setDe(e.target.value)}
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-ate">
              Até
            </label>
            <input
              id="f-ate"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
              className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-estado">
              Estado ao voltar
            </label>
            <select
              id="f-estado"
              value={estado}
              onChange={(e) => setEstado(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
            >
              <option value="">Todos os estados</option>
              {ESTADOS_VOLTAR.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-colab">
              Colaborador
            </label>
            <SelecionarColaborador
              colaboradores={colaboradores}
              value={colaborador}
              onChange={setColaborador}
              id="f-colab"
              placeholder="Nome ou código (ex: DM0011)..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Relatório de ferramentas devolvidas</h2>
            <div className="flex items-center gap-2">
              {temFiltros && (
                <button
                  type="button"
                  onClick={() => {
                    setDe("");
                    setAte("");
                    setEstado("");
                    setColaborador("");
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:underline"
                >
                  <X className="size-3.5" aria-hidden />
                  Limpar filtros
                </button>
              )}
              <span className="inline-flex items-center gap-1 rounded-full bg-primario/10 px-3 py-1 text-xs font-bold text-primario" data-count-devolucoes>
                <Filter className="size-3" aria-hidden />
                {temFiltros ? filtradas.length : Math.min(filtradas.length, 50)}
              </span>
            </div>
          </div>
          {!movimentos ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <LoaderCircle className="mr-1 inline size-4 animate-spin" /> A carregar histórico...
            </p>
          ) : filtradas.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhuma devolução encontrada com estes filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Código</th>
                    <th className="py-2 pr-3 font-medium">Ferramenta</th>
                    <th className="py-2 pr-3 font-medium">Colaborador</th>
                    <th className="py-2 pr-3 font-medium">Departamento</th>
                    <th className="py-2 pr-3 font-medium">Estado ao voltar</th>
                    <th className="py-2 pr-3 font-medium">Recebido por</th>
                    <th className="py-2 pr-3 font-medium">Data e hora</th>
                    <th className="py-2 font-medium">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {(temFiltros ? filtradas : filtradas.slice(0, 50)).map((m) => (
                    <tr key={m.id} className="border-b last:border-0" data-linha-devolucao={m.code || ""}>
                      <td className="py-2 pr-3 font-semibold">{m.code || "-"}</td>
                      <td className="py-2 pr-3">{m.nome || "-"}</td>
                      <td className="py-2 pr-3">{m.colaborador || "-"}</td>
                      <td className="py-2 pr-3">{m.departamento || "-"}</td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${corEstadoVoltar(m.estado_ao_voltar)}`}>
                          {m.estado_ao_voltar || "-"}
                        </span>
                      </td>
                      <td className="py-2 pr-3">{m.recebido_por || "-"}</td>
                      <td className="py-2 pr-3">{(m.data_devolucao || "").replace("T", " ").slice(0, 16)}</td>
                      <td className="max-w-40 truncate py-2" title={m.observacoes_devolucao || ""}>
                        {m.observacoes_devolucao || "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
