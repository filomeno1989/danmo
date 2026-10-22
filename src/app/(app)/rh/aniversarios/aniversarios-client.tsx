"use client";

/**
 * AniversariosClient - O mes navegavel + o estudio de cartazes.
 *
 * Duas listas do mes escolhido: quem faz ANOS (data de nascimento) e
 * quem completa ANOS DE CASA (inicio do servico, a mesma data que a
 * ficha mostra). Cada linha tem o botao Cartaz, que abre o estudio:
 * escolhe a ocasiao, escolhe um dos 3 modelos (Festivo, Elegante,
 * Danmo), o canvas 1080x1080 desenha o cartaz com a FOTO do avatar e
 * sai em PNG para descarregar ou partir para o WhatsApp (folha de
 * partilha do telemovel escolhe o contacto; no computador descarrega
 * e abre o WhatsApp Web para escolher a conversa).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Cake,
  CalendarHeart,
  ChevronLeft,
  ChevronRight,
  Download,
  Image as ImageIcon,
  LoaderCircle,
  Search,
  Share2,
  X
} from "lucide-react";
import { Cabeca, Etiqueta, pedir } from "@/components/oficina/ui-bits";
import {
  EMPRESA_LABEL,
  MESES,
  aniversariantesDoMes,
  anosDeCasaDoMes,
  iniciais,
  inicioServico,
  normalizar,
  type Colaborador
} from "@/lib/rh";
import {
  MODELOS_CARTAZ,
  linhaAnos,
  mensagemWhatsApp,
  nomeFicheiroCartaz,
  desenharCartaz,
  type OcasiaoCartaz
} from "@/lib/cartazes";

type Props = {
  hoje: string;
};

type Estudio = { id: number; ocasiao: OcasiaoCartaz } | null;

type LinhaApi = {
  id: number;
  name: string | null;
  empresa: string | null;
  active: boolean | null;
  data_nascimento: string | null;
  tipo_colaborador: string | null;
  estagio_data_inicio: string | null;
  data_admissao_danmo: string | null;
  data_admissao: string | null;
};

const CORES_AVATAR = [
  "bg-emerald-600/15 text-emerald-800 dark:text-emerald-200",
  "bg-amber-500/20 text-amber-800 dark:text-amber-200",
  "bg-sky-600/15 text-sky-800 dark:text-sky-200",
  "bg-red-600/12 text-red-800 dark:text-red-200",
  "bg-neutral-900/10 text-neutral-800 dark:bg-white/10 dark:text-neutral-100"
];

function corAvatar(nome: string): string {
  let h = 0;
  for (const letra of nome || "x") h = (h * 31 + letra.charCodeAt(0)) % 997;
  return CORES_AVATAR[h % CORES_AVATAR.length];
}

/** Canvas -> PNG (o toBlob com Promise). */
function paraBlob(c: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolver) => c.toBlob((b) => resolver(b), "image/png"));
}

export function AniversariosClient({ hoje }: Props) {
  const anoActual = Number(hoje.slice(0, 4));
  const mesActual = Number(hoje.slice(5, 7));

  const [cols, setCols] = useState<LinhaApi[] | null>(null);
  const [mes, setMes] = useState(mesActual);
  const [aba, setAba] = useState<"aniversarios" | "anosCasa">("aniversarios");
  const [busca, setBusca] = useState("");
  const [estudio, setEstudio] = useState<Estudio>(null);
  const [modelo, setModelo] = useState<"festivo" | "elegante" | "danmo">("festivo");
  const [foto, setFoto] = useState<HTMLImageElement | null>(null);
  const [aPartilhar, setAPartilhar] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let morto = false;
    pedir<{ ok: boolean; colaboradores: LinhaApi[] }>("/api/rh/aniversarios")
      .then((d) => {
        if (!morto) setCols(d.colaboradores || []);
      })
      .catch(() => {
        if (!morto) setCols([]);
      });
    return () => {
      morto = true;
    };
  }, []);

  const listaAniv = useMemo(
    () => aniversariantesDoMes(cols || [], hoje, mes),
    [cols, hoje, mes]
  );
  const listaCasa = useMemo(
    () => anosDeCasaDoMes(cols || [], hoje, mes),
    [cols, hoje, mes]
  );

  const resultados = useMemo(() => {
    const q = normalizar(busca);
    if (!q || !cols) return [];
    return cols
      .filter(
        (c) =>
          c.active !== false &&
          (c.data_nascimento || inicioServico(c)) &&
          normalizar(c.name).includes(q)
      )
      .slice(0, 8);
  }, [cols, busca]);

  /** Anos de casa que a pessoa completa este ano (0 = ainda nao fez 1). */
  const anosDeCasaDe = useCallback(
    (c: LinhaApi): number => {
      const inicio = inicioServico(c);
      return inicio ? anoActual - Number(inicio.slice(0, 4)) : 0;
    },
    [anoActual]
  );

  const pessoa = useMemo(() => (cols || []).find((c) => c.id === estudio?.id) || null, [cols, estudio]);

  /** Data do aniversario celebrado, no ano actual (para o rodape). */
  const dataFesta = useMemo(() => {
    if (!pessoa || !estudio) return "";
    const base =
      estudio.ocasiao === "aniversario" ? pessoa.data_nascimento : inicioServico(pessoa);
    if (!base || !/^\d{4}-\d{2}-\d{2}/.test(base)) return "";
    return `${hoje.slice(0, 4)}${base.slice(4, 10)}`;
  }, [pessoa, estudio, hoje]);

  /** Anos que a pessoa faz / de casa, do ano da data de ORIGEM. */
  const anosPessoa = useMemo(() => {
    if (!pessoa || !estudio) return 0;
    const base =
      estudio.ocasiao === "aniversario" ? pessoa.data_nascimento : inicioServico(pessoa);
    if (!base) return 0;
    return anoActual - Number(base.slice(0, 4));
  }, [pessoa, estudio, anoActual]);

  /** Abre o estudio com a foto limpa (a nova entra por efeito). */
  const abrirEstudio = useCallback(
    (id: number, ocasiao: OcasiaoCartaz) => {
      setFoto(null);
      setAPartilhar(false);
      setEstudio({ id, ocasiao });
    },
    []
  );

  /* A FOTO GRANDE de quem esta no estudio (rota propria, so ela). */
  const pessoaId = pessoa?.id ?? 0;
  useEffect(() => {
    if (!pessoaId || !estudio) return;
    let morto = false;
    pedir<{ ok: boolean; foto: string }>(`/api/rh/quadro/foto?id=${pessoaId}`)
      .then((d) => {
        if (morto || !d.foto) return;
        const img = new Image();
        img.onload = () => {
          if (!morto) setFoto(img);
        };
        img.src = d.foto;
      })
      .catch(() => undefined);
    return () => {
      morto = true;
    };
  }, [pessoaId, estudio]);

  /* O cartaz redesenha a cada mudanca de pessoa, ocasiao, modelo ou foto. */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !pessoa || !estudio || anosPessoa < 1) return;
    desenharCartaz(canvas, {
      ocasiao: estudio.ocasiao,
      modelo,
      nome: pessoa.name || "?",
      anos: anosPessoa,
      dataISO: dataFesta,
      empresa: pessoa.empresa || null,
      foto
    });
  }, [pessoa, estudio, modelo, anosPessoa, dataFesta, foto]);

  async function descarregar() {
    const canvas = canvasRef.current;
    if (!canvas || !pessoa || !estudio) return;
    const blob = await paraBlob(canvas);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nomeFicheiroCartaz(estudio.ocasiao, pessoa.name || "");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function partilhar() {
    const canvas = canvasRef.current;
    if (!canvas || !pessoa || !estudio) return;
    setAPartilhar(true);
    try {
      const blob = await paraBlob(canvas);
      if (!blob) return;
      const ficheiro = new File([blob], nomeFicheiroCartaz(estudio.ocasiao, pessoa.name || ""), {
        type: "image/png"
      });
      const mensagem = mensagemWhatsApp(estudio.ocasiao, pessoa.name || "?", anosPessoa);
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [ficheiro] })) {
        await navigator.share({ files: [ficheiro], text: mensagem });
      } else {
        // Sem folha de partilha (computador): descarrega e abre o
        // WhatsApp Web, onde se escolhe o contacto e anexa o PNG.
        await descarregar();
        window.open(
          `https://wa.me/?text=${encodeURIComponent(mensagem)}`,
          "_blank",
          "noopener"
        );
      }
    } catch {
      /* partilha cancelada pelo utilizador */
    } finally {
      setAPartilhar(false);
    }
  }

  const mesAnterior = () => setMes((m) => (m === 1 ? 12 : m - 1));
  const mesSeguinte = () => setMes((m) => (m === 12 ? 1 : m + 1));

  const linhaDaLista = (id: number, ocasiao: OcasiaoCartaz) => (
    <button
      type="button"
      onClick={() => abrirEstudio(id, ocasiao)}
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-primario/30 px-2.5 text-xs font-semibold text-primario hover:bg-primario/10"
      aria-label="Fazer o cartaz"
    >
      <ImageIcon className="size-3.5" aria-hidden />
      Cartaz
    </button>
  );

  return (
    <div className="space-y-5">
      <Cabeca
        titulo="Aniversários & Cartazes"
        subtitulo={cols ? `${cols.filter((c) => c.active !== false).length} activos nas duas listas` : undefined}
      />

      {/* Mes navegavel */}
      <div className="flex flex-wrap items-center gap-2" data-navegacao-mes>
        <button
          type="button"
          onClick={mesAnterior}
          aria-label="Mês anterior"
          className="flex size-9 items-center justify-center rounded-md border bg-background hover:bg-accent"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <span className="min-w-44 text-center text-sm font-bold tabular-nums" data-mes-actual>
          {MESES[mes - 1]} de {anoActual}
        </span>
        <button
          type="button"
          onClick={mesSeguinte}
          aria-label="Mês seguinte"
          className="flex size-9 items-center justify-center rounded-md border bg-background hover:bg-accent"
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
        {mes !== mesActual && (
          <button
            type="button"
            onClick={() => setMes(mesActual)}
            className="inline-flex h-9 items-center rounded-md border bg-background px-3 text-sm font-semibold hover:bg-accent"
          >
            Hoje
          </button>
        )}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.15fr,1fr]">
        {/* Listas do mes */}
        <div className="space-y-4">
          {cols === null ? (
            <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground" data-a-carregar>
              <LoaderCircle className="size-4 animate-spin" /> A carregar as listas...
            </p>
          ) : (
            <>
          <div className="flex gap-2" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={aba === "aniversarios"}
              onClick={() => setAba("aniversarios")}
              className={
                "inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-semibold " +
                (aba === "aniversarios"
                  ? "bg-primario text-white"
                  : "border bg-background hover:bg-accent")
              }
            >
              <Cake className="size-4" aria-hidden />
              Aniversários ({listaAniv.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={aba === "anosCasa"}
              onClick={() => setAba("anosCasa")}
              className={
                "inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-semibold " +
                (aba === "anosCasa"
                  ? "bg-primario text-white"
                  : "border bg-background hover:bg-accent")
              }
            >
              <CalendarHeart className="size-4" aria-hidden />
              Anos de casa ({listaCasa.length})
            </button>
          </div>

          {aba === "aniversarios" ? (
            listaAniv.length === 0 ? (
              <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-lista-vazia>
                Ninguém faz anos neste mês.
              </p>
            ) : (
              <ul className="card-sombra divide-y rounded-xl" data-lista-aniversarios>
                {listaAniv.map((an) => (
                  <li key={an.id} data-aniversario-row className="flex items-center gap-3 px-3.5 py-2.5">
                    <span className={"flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold " + corAvatar(an.nome)}>
                      {iniciais(an.nome)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight">{an.nome}</p>
                      <p className="text-[0.7rem] text-muted-foreground">
                        {an.empresa ? EMPRESA_LABEL[an.empresa] : "Sem classificar"} · {linhaAnos("aniversario", an.idadeFaz)}
                      </p>
                    </div>
                    {an.hoje ? (
                      <Etiqueta cor="bg-red-600/12 text-red-700 dark:text-red-300">Hoje!</Etiqueta>
                    ) : (
                      <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-muted-foreground">
                        Dia {an.dia}
                      </span>
                    )}
                    {linhaDaLista(an.id, "aniversario")}
                  </li>
                ))}
              </ul>
            )
          ) : listaCasa.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground" data-lista-vazia>
              Ninguém completa anos de casa neste mês.
            </p>
          ) : (
            <ul className="card-sombra divide-y rounded-xl" data-lista-anos-casa>
              {listaCasa.map((a) => (
                <li key={a.id} data-casa-row className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className={"flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold " + corAvatar(a.nome)}>
                    {iniciais(a.nome)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">{a.nome}</p>
                    <p className="text-[0.7rem] text-muted-foreground">
                      {a.empresa ? EMPRESA_LABEL[a.empresa] : "Sem classificar"} · {linhaAnos("anosCasa", a.anosFaz)}
                    </p>
                  </div>
                  {a.hoje ? (
                    <Etiqueta cor="bg-red-600/12 text-red-700 dark:text-red-300">Hoje!</Etiqueta>
                  ) : (
                    <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-muted-foreground">
                      Dia {a.dia}
                    </span>
                  )}
                  {linhaDaLista(a.id, "anosCasa")}
                </li>
              ))}
            </ul>
          )}

          {/* Fazer cartaz de quem nao esta no mes */}
          <div className="card-sombra rounded-xl p-3.5" data-busca-cartaz>
            <p className="mb-2 text-[0.72rem] font-bold uppercase tracking-wider text-primario">
              Cartaz de qualquer colaborador
            </p>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar por nome..."
                aria-label="Pesquisar colaborador para o cartaz"
                className="h-9 w-full rounded-md border bg-background pl-8 pr-8 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
              />
              {busca && (
                <button
                  type="button"
                  onClick={() => setBusca("")}
                  aria-label="Limpar pesquisa"
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            {resultados.length > 0 && (
              <ul className="mt-2 divide-y">
                {resultados.map((c) => (
                  <li key={c.id} data-resultado-row className="flex items-center gap-2.5 py-2">
                    <span className={"flex size-8 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold " + corAvatar(c.name || "")}>
                      {iniciais(c.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold leading-tight">{c.name}</p>
                      <p className="truncate text-[0.68rem] text-muted-foreground">
                        {c.empresa ? EMPRESA_LABEL[c.empresa] : "Sem classificar"}
                      </p>
                    </div>
                    {c.data_nascimento && linhaDaLista(c.id, "aniversario")}
                    {anosDeCasaDe(c) >= 1 && linhaDaLista(c.id, "anosCasa")}
                  </li>
                ))}
              </ul>
            )}
          </div>
            </>
          )}
        </div>

        {/* Estudio do cartaz */}
        {estudio && pessoa && (
          <div className="card-sombra space-y-4 rounded-xl p-4 lg:sticky lg:top-4" data-estudio>
            <div className="flex items-center gap-3">
              <span className={"flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold " + corAvatar(pessoa.name || "")}>
                {iniciais(pessoa.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold leading-tight">{pessoa.name}</p>
                <p className="text-[0.7rem] text-muted-foreground">
                  {pessoa.empresa ? EMPRESA_LABEL[pessoa.empresa] : "Sem classificar"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEstudio(null)}
                aria-label="Fechar o estudio"
                className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="size-4.5" aria-hidden />
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Ocasião</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => pessoa.data_nascimento && setEstudio({ id: pessoa.id, ocasiao: "aniversario" })}
                  disabled={!pessoa.data_nascimento}
                  aria-pressed={estudio.ocasiao === "aniversario"}
                  className={
                    "inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold disabled:opacity-40 " +
                    (estudio.ocasiao === "aniversario"
                      ? "bg-primario text-white"
                      : "border bg-background hover:bg-accent")
                  }
                >
                  Aniversário
                </button>
                <button
                  type="button"
                  onClick={() => inicioServico(pessoa) && setEstudio({ id: pessoa.id, ocasiao: "anosCasa" })}
                  disabled={!inicioServico(pessoa)}
                  aria-pressed={estudio.ocasiao === "anosCasa"}
                  className={
                    "inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold disabled:opacity-40 " +
                    (estudio.ocasiao === "anosCasa"
                      ? "bg-primario text-white"
                      : "border bg-background hover:bg-accent")
                  }
                >
                  Anos de casa
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-[0.7rem] font-bold uppercase tracking-wider text-muted-foreground">Modelo</p>
              <div className="flex gap-2">
                {MODELOS_CARTAZ.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setModelo(m.id)}
                    aria-pressed={modelo === m.id}
                    className={
                      "inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold " +
                      (modelo === m.id ? "bg-primario text-white" : "border bg-background hover:bg-accent")
                    }
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border bg-muted/30">
              <canvas ref={canvasRef} className="aspect-square w-full" data-cartaz-canvas aria-label="Pré-visualização do cartaz" />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={descarregar}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-background text-sm font-semibold hover:bg-accent"
              >
                <Download className="size-4" aria-hidden />
                Descarregar PNG
              </button>
              <button
                type="button"
                onClick={partilhar}
                disabled={aPartilhar}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primario text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
              >
                {aPartilhar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Share2 className="size-4" aria-hidden />}
                Partilhar no WhatsApp
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
