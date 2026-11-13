/**
 * /ferramentaria/emprestimos (cliente).
 *
 * POST de empréstimo: 409 com "indisponivel" abre o popup "Está com..."
 * com quem tem a ferramenta. POST de devolução: estado escolhido na
 * lista oficial (ESTADOS_VOLTAR); o servidor decide o estado do
 * inventário e o dano.
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, LoaderCircle } from "lucide-react";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Modal } from "@/components/ui/modal";
import { Card, CardContent } from "@/components/ui/card";
import { SelecionarColaborador } from "@/components/oficina/selecionar-colaborador";
import { semAcentos } from "@/lib/uso-comum";
import {
  amanhaISO,
  corEstadoVoltar,
  diasFora,
  ESTADOS_VOLTAR,
  estaAtrasada,
  fmtDias,
  type ColaboradorFerr,
  type Departamento,
  type Ferramenteiro,
  type MovimentoVisao
} from "@/lib/ferramentaria";

type Listas = {
  ferramenteiros: Ferramenteiro[];
  departamentos: Departamento[];
  colaboradores: ColaboradorFerr[];
  ferramentas: { id: string; code: string; nome: string; estado: string | null; quantidade: number | null }[];
};

type Indisponivel = {
  code: string;
  nome: string;
  total: number;
  emprestadas: number;
  com: {
    id: string;
    colaborador: string;
    departamento: string;
    os_id: string | null;
    equipamento_id: string | null;
    data_saida: string | null;
  }[];
};

export function EmprestimosClient() {
  const [listas, setListas] = useState<Listas | null>(null);
  const [movimentos, setMovimentos] = useState<MovimentoVisao[] | null>(null);
  const [falha, setFalha] = useState("");

  const [code, setCode] = useState("");
  const [colaborador, setColaborador] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [osId, setOsId] = useState("");
  const [equipamento, setEquipamento] = useState("");
  const [osEstado, setOsEstado] = useState("");
  const [equipTravado, setEquipTravado] = useState(false);
  const [prazo, setPrazo] = useState(amanhaISO());
  const [entreguePor, setEntreguePor] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [gravando, setGravando] = useState(false);

  const [autoAberta, setAutoAberta] = useState(false);
  const [autoIndice, setAutoIndice] = useState(-1);

  const [devolMov, setDevolMov] = useState<MovimentoVisao | null>(null);
  const [devolEstado, setDevolEstado] = useState("");
  const [devolRecebido, setDevolRecebido] = useState("");
  const [devolObs, setDevolObs] = useState("");
  const [devolGravando, setDevolGravando] = useState(false);

  const [indisp, setIndisp] = useState<Indisponivel | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      pedir<Listas>("/api/ferramentaria/listas"),
      pedir<{ movimentos: MovimentoVisao[] }>("/api/ferramentaria/movimentos?tipo=emprestimo")
    ])
      .then(([l, m]) => {
        if (!vivo) return;
        setListas(l);
        setMovimentos(
          m.movimentos.filter((x) => x.tipo === "emprestimo" && !x.data_devolucao)
        );
      })
      .catch((e: Error) => {
        if (vivo) setFalha(e.message);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function recarregarMovimentos() {
    const m = await pedir<{ movimentos: MovimentoVisao[] }>(
      "/api/ferramentaria/movimentos?tipo=emprestimo"
    );
    setMovimentos(m.movimentos.filter((x) => x.tipo === "emprestimo" && !x.data_devolucao));
  }

  const sugestoes = useMemo(() => {
    if (!listas) return [];
    const q = semAcentos(code.trim()).toLowerCase();
    if (!q) return [];
    return listas.ferramentas
      .filter(
        (t) =>
          semAcentos(t.code).toLowerCase().includes(q) ||
          semAcentos(t.nome).toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [listas, code]);

  async function procurarOs(numero: string) {
    setOsEstado("");
    setEquipTravado(false);
    if (!numero.trim()) {
      setEquipamento("");
      return;
    }
    setOsEstado("A procurar OS...");
    try {
      const d = await pedir<{ equipamento: string | null }>(
        `/api/ferramentaria/os?numero=${encodeURIComponent(numero.trim())}`
      );
      if (d.equipamento) {
        setEquipamento(d.equipamento);
        setEquipTravado(true);
        setOsEstado("OS reconhecida: equipamento preenchido.");
      } else {
        setEquipamento("");
        setOsEstado("OS não reconhecida: preenche o equipamento à mão.");
      }
    } catch {
      setOsEstado("Erro ao procurar OS: preenche o equipamento à mão.");
    }
  }

  // Lookup de OS com debounce: procura ~500ms depois de parar de
  // escrever (igual ao hub); reconhecida, o equipamento trava. O campo
  // vazio limpa no onChange, nunca aqui (regra react-hooks).
  useEffect(() => {
    const numero = osId.trim();
    if (!numero) return;
    const t = window.setTimeout(() => {
      procurarOs(numero);
    }, 500);
    return () => window.clearTimeout(t);
  }, [osId]);

  async function registarEmprestimoComIndisponivel() {
    if (gravando) return;
    setGravando(true);
    try {
      const r = await fetch("/api/ferramentaria/emprestimos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ferramentaCode: code,
          colaborador,
          departamento,
          os_id: osId || undefined,
          equipamento_id: equipamento || undefined,
          prazo,
          entreguePorId: entreguePor,
          observacoes: observacoes || undefined
        })
      });
      const d = (await r.json().catch(() => ({}))) as {
        ok?: boolean;
        erro?: string;
        indisponivel?: Indisponivel;
      };
      if (!r.ok || d.ok === false) {
        if (d.indisponivel) {
          setIndisp(d.indisponivel);
        } else {
          toast.error(d.erro || "Não foi possível registar o empréstimo.");
        }
        return;
      }
      toast.success("Empréstimo registado.");
      setCode("");
      setColaborador("");
      setDepartamento("");
      setOsId("");
      setEquipamento("");
      setOsEstado("");
      setEquipTravado(false);
      setObservacoes("");
      setPrazo(amanhaISO());
      setEntreguePor("");
      await recarregarMovimentos();
    } finally {
      setGravando(false);
    }
  }

  async function confirmarDevolucao() {
    if (!devolMov || devolGravando) return;
    setDevolGravando(true);
    try {
      await enviar(
        "/api/ferramentaria/devolucoes",
        {
          movimentoId: devolMov.id,
          estadoVoltar: devolEstado,
          recebidoPorId: devolRecebido,
          observacoes: devolObs || undefined
        },
        "Devolução registada."
      );
      setDevolMov(null);
      setDevolEstado("");
      setDevolRecebido("");
      setDevolObs("");
      await recarregarMovimentos();
    } catch {
      // toast veio do enviar
    } finally {
      setDevolGravando(false);
    }
  }

  if (falha) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
        {falha}
      </div>
    );
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <Cabeca titulo="Empréstimos" subtitulo="Ferramentas que saem da casa e voltam com controlo" />

      {/* Formulário */}
      <Card className="card-sombra" data-form-emprestimo>
        <CardContent className="p-4">
          <h2 className="mb-3 text-sm font-bold">Registar Empréstimo</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="relative">
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-ferramenta">
                Ferramenta (código ou nome) *
              </label>
              <input
                id="f-ferramenta"
                type="text"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setAutoAberta(true);
                  setAutoIndice(-1);
                }}
                onKeyDown={(e) => {
                  if (!autoAberta || sugestoes.length === 0) return;
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setAutoIndice((i) => Math.min(i + 1, sugestoes.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setAutoIndice((i) => Math.max(i - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (autoIndice >= 0) {
                      setCode(sugestoes[autoIndice].code);
                      setAutoAberta(false);
                    }
                  } else if (e.key === "Escape") {
                    setAutoAberta(false);
                  }
                }}
                onBlur={() => {
                  // deixa o clique da sugestão passar antes de fechar
                  window.setTimeout(() => setAutoAberta(false), 150);
                }}
                placeholder="Ex: CBL-10 ou chave"
                autoComplete="off"
                className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
              />
              {autoAberta && sugestoes.length > 0 && (
                <ul className="bg-popover absolute z-40 mt-1 max-h-52 w-full overflow-y-auto rounded-md border shadow-lg" data-autocomplete>
                  {sugestoes.map((t, i) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setCode(t.code);
                          setAutoAberta(false);
                        }}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === autoIndice ? "bg-accent/60" : "hover:bg-accent"}`}
                      >
                        <span className="font-semibold">{t.code}</span>
                        <span className="text-muted-foreground truncate text-xs">
                          {t.nome} ({t.estado})
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-colaborador">
                Quem leva *
              </label>
              <SelecionarColaborador
                colaboradores={listas?.colaboradores || []}
                value={colaborador}
                onChange={setColaborador}
                id="f-colaborador"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-departamento">
                Departamento *
              </label>
              <select
                id="f-departamento"
                value={departamento}
                onChange={(e) => setDepartamento(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
              >
                <option value="">Seleccionar departamento...</option>
                {(listas?.departamentos || []).map((d) => (
                  <option key={d.id} value={d.nome}>
                    {d.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-os">
                Nº da Obra / OS
              </label>
              <input
                id="f-os"
                type="text"
                value={osId}
                onChange={(e) => {
                  setOsId(e.target.value);
                  if (!e.target.value.trim()) {
                    setOsEstado("");
                    setEquipTravado(false);
                    setEquipamento("");
                  }
                }}
                placeholder="Opcional; traz o equipamento sozinho"
                className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
              />
              {osEstado && <p className="mt-1 text-[0.7rem] text-muted-foreground" data-os-estado>{osEstado}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-equip">
                Equipamento
              </label>
              <input
                id="f-equip"
                type="text"
                value={equipamento}
                onChange={(e) => setEquipamento(e.target.value)}
                disabled={equipTravado}
                placeholder="Opcional"
                className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-prazo">
                Prazo de devolução *
              </label>
              <input
                id="f-prazo"
                type="date"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                className="border-input bg-transparent dark:bg-input/30 h-9 w-full rounded-md border px-3 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-entregue">
                Entregue por *
              </label>
              <select
                id="f-entregue"
                value={entreguePor}
                onChange={(e) => setEntreguePor(e.target.value)}
                className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
              >
                <option value="">Seleccionar ferramenteiro...</option>
                {(listas?.ferramenteiros || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2 xl:col-span-3">
              <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="f-obs">
                Observações
              </label>
              <textarea
                id="f-obs"
                rows={2}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                placeholder="Opcional"
                className="border-input bg-transparent dark:bg-input/30 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-between">
            <button
              type="button"
              onClick={() => {
                setCode("");
                setColaborador("");
                setDepartamento("");
                setOsId("");
                setEquipamento("");
                setOsEstado("");
                setEquipTravado(false);
                setObservacoes("");
                setPrazo(amanhaISO());
                setEntreguePor("");
              }}
              className="border-input bg-background h-9 rounded-md border px-4 text-sm font-semibold hover:bg-accent"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={registarEmprestimoComIndisponivel}
              disabled={gravando}
              data-acao="registar-emprestimo"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
            >
              {gravando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              Registar Empréstimo
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Empréstimos activos */}
      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold">Empréstimos activos</h2>
            <span className="rounded-full bg-primario/10 px-3 py-1 text-xs font-bold text-primario" data-count-activos>
              {movimentos ? movimentos.length : "-"}
            </span>
          </div>
          {!movimentos ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              <LoaderCircle className="mr-1 inline size-4 animate-spin" /> A carregar empréstimos...
            </p>
          ) : movimentos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum empréstimo activo neste momento.
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
                    <th className="py-2 pr-3 font-medium">Data saída</th>
                    <th className="py-2 pr-3 font-medium">Prazo</th>
                    <th className="py-2 pr-3 font-medium">Dias</th>
                    <th className="py-2 pr-3 font-medium">Estado</th>
                    <th className="py-2 font-medium">Acção</th>
                  </tr>
                </thead>
                <tbody>
                  {movimentos.map((m) => {
                    const atrasada = estaAtrasada(m.prazo_devolucao, hoje);
                    return (
                      <tr key={m.id} className="border-b last:border-0" data-linha-emprestimo={m.code || ""}>
                        <td className="py-2 pr-3 font-semibold">{m.code || "-"}</td>
                        <td className="py-2 pr-3">{m.nome || "-"}</td>
                        <td className="py-2 pr-3">{m.colaborador || "-"}</td>
                        <td className="py-2 pr-3">{m.departamento || "-"}</td>
                        <td className="py-2 pr-3">{(m.data_saida || "").slice(0, 10)}</td>
                        <td className="py-2 pr-3">{m.prazo_devolucao || "-"}</td>
                        <td className={`py-2 pr-3 ${atrasada ? "font-bold text-red-600 dark:text-red-400" : ""}`}>
                          {fmtDias(diasFora(m.data_saida, hoje))}
                        </td>
                        <td className="py-2 pr-3">
                          {atrasada ? (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-red-600 px-2 py-0.5 text-[0.68rem] font-semibold text-white">
                              ATRASADA
                            </span>
                          ) : (
                            <span className="inline-flex items-center whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[0.68rem] font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                              Pendente
                            </span>
                          )}
                        </td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={() => {
                              setDevolMov(m);
                              setDevolEstado("");
                              setDevolRecebido("");
                              setDevolObs("");
                            }}
                            data-acao="devolver"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-primario hover:underline"
                          >
                            <Check className="size-3.5" aria-hidden />
                            Devolver
                          </button>
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

      {/* Modal devolução */}
      <Modal
        aberto={devolMov !== null}
        fechar={() => setDevolMov(null)}
        titulo="Registar Devolução"
      >
        {devolMov && (
          <p className="mb-3 text-sm font-semibold" data-devol-info>
            {devolMov.code} - {devolMov.nome} | Colaborador: {devolMov.colaborador || "-"}
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="d-estado">
              Estado ao voltar *
            </label>
            <select
              id="d-estado"
              value={devolEstado}
              onChange={(e) => setDevolEstado(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
              data-devol-estado
            >
              <option value="">Seleccionar estado...</option>
              {ESTADOS_VOLTAR.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="d-recebido">
              Quem recebeu *
            </label>
            <select
              id="d-recebido"
              value={devolRecebido}
              onChange={(e) => setDevolRecebido(e.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-2 text-sm dark:bg-input/30"
              data-devol-recebido
            >
              <option value="">Seleccionar ferramenteiro...</option>
              {(listas?.ferramenteiros || []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted-foreground" htmlFor="d-obs">
              Observações
            </label>
            <textarea
              id="d-obs"
              rows={2}
              value={devolObs}
              onChange={(e) => setDevolObs(e.target.value)}
              placeholder="Opcional"
              className="border-input bg-transparent dark:bg-input/30 w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDevolMov(null)}
            className="border-input bg-background h-9 rounded-md border px-4 text-sm font-semibold hover:bg-accent"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmarDevolucao}
            disabled={devolGravando}
            data-acao="confirmar-devolucao"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
          >
            {devolGravando && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            Confirmar Devolução
          </button>
        </div>
      </Modal>

      {/* Modal indisponível */}
      <Modal
        aberto={indisp !== null}
        fechar={() => setIndisp(null)}
        titulo="Ferramenta indisponível"
        largura="max-w-lg"
      >
        {indisp && (
          <div data-indisponivel>
            <p className="text-sm font-bold">{indisp.code} - {indisp.nome}</p>
            <p className="text-muted-foreground mb-3 text-sm">
              Sem unidades disponíveis ({indisp.emprestadas}/{indisp.total} emprestadas). Está com:
            </p>
            <div className="space-y-2">
              {indisp.com.map((c) => (
                <div key={c.id} className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <p className="font-bold text-red-700 dark:text-red-300">{c.colaborador}</p>
                  <p className="text-muted-foreground text-xs">Departamento: {c.departamento}</p>
                  {c.os_id && <p className="text-muted-foreground text-xs">Nº da Obra/OS: {c.os_id}</p>}
                  {c.equipamento_id && (
                    <p className="text-muted-foreground text-xs">Máquina/Equipamento: {c.equipamento_id}</p>
                  )}
                  <p className="text-muted-foreground text-xs">
                    Levantou em: {(c.data_saida || "").slice(0, 10)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => setIndisp(null)}
            className="border-input bg-background h-9 rounded-md border px-4 text-sm font-semibold hover:bg-accent"
          >
            Entendi
          </button>
        </div>
      </Modal>
    </div>
  );
}
