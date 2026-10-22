"use client";

/**
 * FichaForm - Formulario da ficha (novo e editar).
 *
 * Organizado por seccoes como a ficha do hub, com as melhorias pedidas:
 * - Empresa em vista: Danmo Porto ou Danmo (TCM), escolha obrigatoria;
 * - Estagiario: registo rapido (instituicao, orientador, inicio e fim
 *   previsto); sem data de admissao, o inicio do estagio conta;
 * - Transferido: empresa de origem e data no grupo, com os tempos
 *   calculados a vista (antes da Danmo e total);
 * - Codigo com sugestao automatica (DM#### / EST###);
 * - Foto da ficha (so em ficha ja gravada), comprimida no navegador.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RefreshCw, Trash2, UserRound } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { enviar } from "@/components/oficina/ui-bits";
import { comprimirFoto, comprimirMiniFoto } from "@/lib/comprimir-foto";
import {
  AREAS,
  ESTADOS_CIVIS,
  GRUPOS_SANGUINEOS,
  MESES,
  idadeAnos,
  mesLabel,
  problemaDaFicha,
  proximoCodigo,
  tempoLongo,
  type Colaborador,
  type DadosFicha
} from "@/lib/rh";

type Props = {
  modo: "novo" | "editar";
  inicial: Colaborador | null;
  codigos: string[];
  onGuardada: (c: Colaborador) => void;
  onApagada?: () => void;
  podeApagar?: boolean;
  /** Avisado quando a foto muda (gravada ou removida), para a grelha buscar a mini nova. */
  onFotoMudou?: () => void;
  onFechar: () => void;
};

function fichaVazia(codigos: string[]): DadosFicha {
  return {
    code: proximoCodigo(codigos, "efetivo"),
    name: "",
    categoria: "",
    setor: "",
    empresa: "",
    tipo_colaborador: "efetivo",
    tipo_vinculo: "contratado",
    empresa_origem: "",
    data_admissao_danmo: "",
    data_admissao_grupo: "",
    estagio_instituicao: "",
    estagio_orientador: "",
    estagio_data_inicio: "",
    estagio_data_fim: "",
    active: true,
    data_inativo: "",
    data_nascimento: "",
    naturalidade: "",
    estado_civil: "",
    endereco: "",
    num_dependentes: "",
    mes_ferias: "",
    bi_numero: "",
    bi_validade: "",
    carta_conducao: "",
    carta_conducao_validade: "",
    inss_numero: "",
    nuit_numero: "",
    contacto_1: "",
    contacto_2: "",
    email: "",
    grupo_sanguineo: "",
    doenca_cronica: "",
    altura_cm: "",
    observacoes_gerais: ""
  };
}

function fichaDe(c: Colaborador): DadosFicha {
  return {
    code: c.code || "",
    name: c.name || "",
    categoria: c.categoria || "",
    setor: c.setor || "",
    empresa: c.empresa || "",
    tipo_colaborador: c.tipo_colaborador === "estagiario" ? "estagiario" : "efetivo",
    tipo_vinculo: c.tipo_vinculo === "transferido" ? "transferido" : "contratado",
    empresa_origem: c.empresa_origem || "",
    data_admissao_danmo: (c.data_admissao_danmo || "").slice(0, 10),
    data_admissao_grupo: (c.data_admissao_grupo || "").slice(0, 10),
    estagio_instituicao: c.estagio_instituicao || "",
    estagio_orientador: c.estagio_orientador || "",
    estagio_data_inicio: (c.estagio_data_inicio || "").slice(0, 10),
    estagio_data_fim: (c.estagio_data_fim || "").slice(0, 10),
    active: c.active !== false,
    data_inativo: (c.data_inativo || "").slice(0, 10),
    data_nascimento: (c.data_nascimento || "").slice(0, 10),
    naturalidade: c.naturalidade || "",
    estado_civil: c.estado_civil || "",
    endereco: c.endereco || "",
    num_dependentes: c.num_dependentes ? String(c.num_dependentes) : "",
    mes_ferias: c.mes_ferias || "",
    bi_numero: c.bi_numero || "",
    bi_validade: (c.bi_validade || "").slice(0, 10),
    carta_conducao: c.carta_conducao || "",
    carta_conducao_validade: (c.carta_conducao_validade || "").slice(0, 10),
    inss_numero: c.inss_numero || "",
    nuit_numero: c.nuit_numero || "",
    contacto_1: c.contacto_1 || c.contacto || "",
    contacto_2: c.contacto_2 || "",
    email: c.email || "",
    grupo_sanguineo: c.grupo_sanguineo || "",
    doenca_cronica: c.doenca_cronica || "",
    altura_cm: c.altura_cm ? String(c.altura_cm) : "",
    observacoes_gerais: c.observacoes_gerais || ""
  };
}

const classeInput =
  "border-input bg-transparent dark:bg-input/30 flex h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";
const classeLabel = "text-xs font-semibold text-muted-foreground";

function Seccao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <p className="text-[0.72rem] font-bold uppercase tracking-wider text-primario">{titulo}</p>
      {children}
    </section>
  );
}

function RadioCard({
  activo,
  aoClicar,
  titulo,
  descricao
}: {
  activo: boolean;
  aoClicar: () => void;
  titulo: string;
  descricao?: string;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={activo}
      className={
        "rounded-lg border px-3 py-2 text-left text-sm transition-colors " +
        (activo
          ? "border-primario bg-primario/10 font-semibold text-primario"
          : "border-input hover:bg-accent")
      }
    >
      {titulo}
      {descricao && (
        <span className="block text-[0.68rem] font-normal text-muted-foreground">{descricao}</span>
      )}
    </button>
  );
}

export function FichaForm({
  modo,
  inicial,
  codigos,
  onGuardada,
  onApagada,
  podeApagar,
  onFotoMudou,
  onFechar
}: Props) {
  const [f, setF] = useState<DadosFicha>(() => (modo === "editar" && inicial ? fichaDe(inicial) : fichaVazia(codigos)));
  const [codigoAuto, setCodigoAuto] = useState(modo === "novo");
  const [erro, setErro] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [aApagar, setAApagar] = useState(false);

  const [foto, setFoto] = useState<string | null>(null);
  const [aFoto, setAFoto] = useState(false);
  const inputFoto = useRef<HTMLInputElement>(null);

  // A foto vive numa tabela à parte e só vem quando a ficha abre
  useEffect(() => {
    if (modo !== "editar" || !inicial) return;
    let vivo = true;
    fetch(`/api/rh/quadro/${inicial.id}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { foto?: string }) => {
        if (vivo) setFoto(d.foto || "");
      })
      .catch(() => {
        if (vivo) setFoto("");
      });
    return () => {
      vivo = false;
    };
  }, [modo, inicial]);

  const estagiario = f.tipo_colaborador === "estagiario";
  const transferido = !estagiario && f.tipo_vinculo === "transferido";
  const inactivo = !f.active;

  const set = (campo: keyof DadosFicha, valor: string | boolean) =>
    setF((atual) => ({ ...atual, [campo]: valor }));

  const tempos = useMemo(() => {
    const fim = inactivo && f.data_inativo ? f.data_inativo : undefined;
    const naDanmo = estagiario
      ? tempoLongo(f.estagio_data_inicio, fim)
      : tempoLongo(f.data_admissao_danmo, fim);
    const antes = transferido && f.data_admissao_grupo
      ? tempoLongo(f.data_admissao_grupo, estagiario ? f.estagio_data_inicio : f.data_admissao_danmo)
      : "";
    const total = transferido && f.data_admissao_grupo
      ? tempoLongo(f.data_admissao_grupo, fim)
      : "";
    return { naDanmo, antes, total };
  }, [estagiario, transferido, inactivo, f.data_inativo, f.data_admissao_danmo, f.data_admissao_grupo, f.estagio_data_inicio]);

  function mudarTipo(tipo: "efetivo" | "estagiario") {
    setF((atual) => ({
      ...atual,
      tipo_colaborador: tipo,
      code: codigoAuto ? proximoCodigo(codigos, tipo) : atual.code
    }));
  }

  async function gravar() {
    const problema = problemaDaFicha(f);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    setAGravar(true);
    try {
      if (modo === "novo") {
        const d = await enviar<{ ok: boolean; colaborador: Colaborador }>(
          "/api/rh/quadro",
          { accao: "criar", dados: f },
          "Colaborador adicionado."
        );
        onGuardada(d.colaborador);
      } else if (inicial) {
        const d = await enviar<{ ok: boolean; colaborador: Colaborador }>(
          `/api/rh/quadro/${inicial.id}`,
          { accao: "editar", dados: f },
          "Ficha actualizada."
          , "PATCH"
        );
        onGuardada(d.colaborador);
      }
      onFechar();
    } catch {
      /* o toast do enviar ja mostra a causa */
    } finally {
      setAGravar(false);
    }
  }

  async function apagar() {
    if (!inicial) return;
    if (!window.confirm(`Apagar permanentemente "${inicial.name}"? Esta acção não pode ser desfeita.`)) {
      return;
    }
    setAApagar(true);
    try {
      await enviar(`/api/rh/quadro/${inicial.id}`, undefined, "Ficha apagada.", "DELETE");
      onApagada?.();
      onFechar();
    } catch {
      /* o toast do enviar ja mostra a causa */
    } finally {
      setAApagar(false);
    }
  }

  async function escolherFoto(ficheiro: File | undefined) {
    if (!ficheiro || !inicial) return;
    setAFoto(true);
    try {
      const [dataUrl, mini] = await Promise.all([
        comprimirFoto(ficheiro),
        comprimirMiniFoto(ficheiro)
      ]);
      const d = await enviar<{ ok: boolean; foto: string }>(
        `/api/rh/quadro/${inicial.id}`,
        { accao: "foto", foto: dataUrl, mini },
        "Foto gravada.",
        "PATCH"
      );
      setFoto(d.foto);
      onFotoMudou?.();
    } catch {
      /* o toast do enviar ja mostra a causa */
    } finally {
      setAFoto(false);
    }
  }

  async function removerFoto() {
    if (!inicial) return;
    setAFoto(true);
    try {
      await enviar(`/api/rh/quadro/${inicial.id}`, { accao: "foto", foto: "" }, "Foto removida.", "PATCH");
      setFoto("");
      onFotoMudou?.();
    } catch {
      /* o toast do enviar ja mostra a causa */
    } finally {
      setAFoto(false);
    }
  }

  return (
    <Modal
      aberto
      fechar={onFechar}
      titulo={modo === "novo" ? "Novo Colaborador" : `Editar - ${inicial?.name || ""}`}
      subtitulo={modo === "novo" ? "Ficha do Quadro de Pessoal" : `Código ${inicial?.code || ""}`}
      largura="max-w-3xl"
    >
      <div className="space-y-6">
        {modo === "editar" && (
          <div className="flex items-center gap-4">
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={foto}
                alt={f.name}
                className="size-20 rounded-xl border object-cover"
              />
            ) : (
              <span className="flex size-20 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
                <UserRound className="size-8" aria-hidden />
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => inputFoto.current?.click()}
                disabled={aFoto}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                {aFoto ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                {foto ? "Trocar foto" : "Adicionar foto"}
              </button>
              {foto && (
                <button
                  type="button"
                  onClick={removerFoto}
                  disabled={aFoto}
                  className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium text-erro hover:bg-muted disabled:opacity-60"
                >
                  <Trash2 className="size-4" />
                  Remover
                </button>
              )}
            </div>
            <input
              ref={inputFoto}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => escolherFoto(e.target.files?.[0])}
            />
          </div>
        )}

        <Seccao titulo="Quem é">
          <div className="grid gap-3 sm:grid-cols-2">
            <RadioCard
              activo={!estagiario}
              aoClicar={() => mudarTipo("efetivo")}
              titulo="Efetivo"
              descricao="Contrato com a empresa"
            />
            <RadioCard
              activo={estagiario}
              aoClicar={() => mudarTipo("estagiario")}
              titulo="Estagiário"
              descricao="Periodo de prova, com decisão no fim"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <RadioCard
              activo={f.empresa === "porto"}
              aoClicar={() => set("empresa", "porto")}
              titulo="Danmo Porto"
              descricao="Gerida por nós"
            />
            <RadioCard
              activo={f.empresa === "danmo"}
              aoClicar={() => set("empresa", "danmo")}
              titulo="Danmo (TCM)"
              descricao="Gerida pelo pessoal da TCM"
            />
          </div>
        </Seccao>

        <Seccao titulo="Identificação">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-code">Código</label>
              <div className="flex gap-1.5">
                <input
                  id="fich-code"
                  className={classeInput}
                  value={f.code}
                  onChange={(e) => {
                    setCodigoAuto(false);
                    set("code", e.target.value);
                  }}
                  placeholder="DM0000 / EST000"
                />
                <button
                  type="button"
                  onClick={() => {
                    const sugerido = proximoCodigo(codigos, estagiario ? "estagiario" : "efetivo");
                    setCodigoAuto(true);
                    set("code", sugerido);
                  }}
                  title="Sugerir próximo código livre"
                  className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md border border-input bg-background px-2.5 text-xs font-semibold hover:bg-muted"
                >
                  Sugerir
                </button>
              </div>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className={classeLabel} htmlFor="fich-name">Nome completo</label>
              <input
                id="fich-name"
                className={classeInput}
                value={f.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Nome completo"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-cat">Função / Cargo</label>
              <input
                id="fich-cat"
                className={classeInput}
                value={f.categoria}
                onChange={(e) => set("categoria", e.target.value)}
                placeholder={estagiario ? "Ex: Estagiário de Mecânica" : "Ex: Mecânico, Electricista"}
              />
            </div>
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-area">Área / Departamento</label>
              <input
                id="fich-area"
                className={classeInput}
                list="lista-areas-rh"
                value={f.setor}
                onChange={(e) => set("setor", e.target.value)}
                placeholder="Ex: Mecânica, Eléctrica, Direcção"
              />
              <datalist id="lista-areas-rh">
                {AREAS.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
          </div>
        </Seccao>

        {estagiario ? (
          <Seccao titulo="Estágio">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={classeLabel} htmlFor="fich-inst">Instituição de Ensino</label>
                <input
                  id="fich-inst"
                  className={classeInput}
                  value={f.estagio_instituicao}
                  onChange={(e) => set("estagio_instituicao", e.target.value)}
                  placeholder="Ex: Instituto Politécnico da Beira"
                />
              </div>
              <div className="space-y-1">
                <label className={classeLabel} htmlFor="fich-orient">Orientador do Estágio</label>
                <input
                  id="fich-orient"
                  className={classeInput}
                  value={f.estagio_orientador}
                  onChange={(e) => set("estagio_orientador", e.target.value)}
                  placeholder="Nome do responsável interno"
                />
              </div>
              <div className="space-y-1">
                <label className={classeLabel} htmlFor="fich-eini">Início do Estágio</label>
                <input
                  id="fich-eini"
                  type="date"
                  className={classeInput}
                  value={f.estagio_data_inicio}
                  onChange={(e) => set("estagio_data_inicio", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className={classeLabel} htmlFor="fich-efim">Fim Previsto</label>
                <input
                  id="fich-efim"
                  type="date"
                  className={classeInput}
                  value={f.estagio_data_fim}
                  onChange={(e) => set("estagio_data_fim", e.target.value)}
                />
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Tempo de estágio: <span className="font-semibold text-foreground">{tempos.naDanmo}</span>
            </p>
          </Seccao>
        ) : (
          <Seccao titulo="Admissão e Serviço">
            <div className="grid gap-3 sm:grid-cols-2">
              <RadioCard
                activo={f.tipo_vinculo === "contratado"}
                aoClicar={() => set("tipo_vinculo", "contratado")}
                titulo="Contratado directamente"
              />
              <RadioCard
                activo={transferido}
                aoClicar={() => set("tipo_vinculo", "transferido")}
                titulo="Transferido do Grupo"
                descricao="Já traz tempo de outra empresa do grupo"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className={classeLabel} htmlFor="fich-adm">Data de Admissão na Danmo</label>
                <input
                  id="fich-adm"
                  type="date"
                  className={classeInput}
                  value={f.data_admissao_danmo}
                  onChange={(e) => set("data_admissao_danmo", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className={classeLabel}>Tempo na Danmo</label>
                <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm font-semibold">
                  {tempos.naDanmo}
                </div>
              </div>
            </div>
            {transferido && (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className={classeLabel} htmlFor="fich-origem">Empresa de Origem</label>
                    <input
                      id="fich-origem"
                      className={classeInput}
                      value={f.empresa_origem}
                      onChange={(e) => set("empresa_origem", e.target.value)}
                      placeholder="Ex: TCM, Mesquita Transitários"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={classeLabel} htmlFor="fich-grp">Data de Admissão no Grupo</label>
                    <input
                      id="fich-grp"
                      type="date"
                      className={classeInput}
                      value={f.data_admissao_grupo}
                      onChange={(e) => set("data_admissao_grupo", e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className={classeLabel}>Tempo no Grupo antes da Danmo</label>
                    <div className="flex h-9 items-center rounded-md border bg-background px-3 text-sm font-semibold">
                      {tempos.antes || "-"}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className={classeLabel}>Tempo Total no Grupo</label>
                    <div className="flex h-9 items-center rounded-md border border-primario/40 bg-primario/10 px-3 text-sm font-bold text-primario">
                      {tempos.total || "-"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Seccao>
        )}

        <Seccao titulo="Situação">
          <div className="grid gap-3 sm:grid-cols-2">
            <RadioCard
              activo={f.active}
              aoClicar={() => set("active", true)}
              titulo="Activo"
            />
            <RadioCard
              activo={inactivo}
              aoClicar={() => set("active", false)}
              titulo="Inactivo"
              descricao="Saiu da empresa"
            />
          </div>
          {inactivo && (
            <div className="space-y-1 sm:max-w-xs">
              <label className={classeLabel} htmlFor="fich-inat">Data de Desvinculamento</label>
              <input
                id="fich-inat"
                type="date"
                className={classeInput}
                value={f.data_inativo}
                onChange={(e) => set("data_inativo", e.target.value)}
              />
            </div>
          )}
        </Seccao>

        <Seccao titulo="Dados Pessoais">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-nasc">Data de Nascimento</label>
              <input
                id="fich-nasc"
                type="date"
                className={classeInput}
                value={f.data_nascimento}
                onChange={(e) => set("data_nascimento", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={classeLabel}>Idade</label>
              <div className="flex h-9 items-center rounded-md border bg-muted/50 px-3 text-sm text-muted-foreground">
                {idadeAnos(f.data_nascimento) ? `${idadeAnos(f.data_nascimento)} anos` : "-"}
              </div>
            </div>
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-nat">Naturalidade</label>
              <input
                id="fich-nat"
                className={classeInput}
                value={f.naturalidade}
                onChange={(e) => set("naturalidade", e.target.value)}
                placeholder="Cidade / Província"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-ec">Estado Civil</label>
              <input
                id="fich-ec"
                className={classeInput}
                list="lista-estados-civis"
                value={f.estado_civil}
                onChange={(e) => set("estado_civil", e.target.value)}
              />
              <datalist id="lista-estados-civis">
                {ESTADOS_CIVIS.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-dep">Dependentes</label>
              <input
                id="fich-dep"
                type="number"
                min={0}
                className={classeInput}
                value={f.num_dependentes}
                onChange={(e) => set("num_dependentes", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-mfer">Mês de Férias</label>
              <select
                id="fich-mfer"
                className={classeInput}
                value={f.mes_ferias}
                onChange={(e) => set("mes_ferias", e.target.value)}
              >
                <option value="">- Seleccionar -</option>
                {MESES.map((m) => (
                  <option key={m} value={m}>{mesLabel(m)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <label className={classeLabel} htmlFor="fich-end">Endereço</label>
            <input
              id="fich-end"
              className={classeInput}
              value={f.endereco}
              onChange={(e) => set("endereco", e.target.value)}
              placeholder="Bairro, rua, casa..."
            />
          </div>
        </Seccao>

        <Seccao titulo="Documentos">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-bi">B.I. Nº</label>
              <input
                id="fich-bi"
                className={classeInput}
                value={f.bi_numero}
                onChange={(e) => set("bi_numero", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-bival">B.I. Validade</label>
              <input
                id="fich-bival"
                type="date"
                className={classeInput}
                value={f.bi_validade}
                onChange={(e) => set("bi_validade", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-inss">INSS Nº</label>
              <input
                id="fich-inss"
                className={classeInput}
                value={f.inss_numero}
                onChange={(e) => set("inss_numero", e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-nuit">NUIT Nº</label>
              <input
                id="fich-nuit"
                className={classeInput}
                value={f.nuit_numero}
                onChange={(e) => set("nuit_numero", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-carta">Carta de Condução Nº</label>
              <input
                id="fich-carta"
                className={classeInput}
                value={f.carta_conducao}
                onChange={(e) => set("carta_conducao", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-cartaval">Carta de Condução Validade</label>
              <input
                id="fich-cartaval"
                type="date"
                className={classeInput}
                value={f.carta_conducao_validade}
                onChange={(e) => set("carta_conducao_validade", e.target.value)}
              />
            </div>
          </div>
        </Seccao>

        <Seccao titulo="Contactos">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-t1">Contacto 1</label>
              <input
                id="fich-t1"
                type="tel"
                className={classeInput}
                value={f.contacto_1}
                onChange={(e) => set("contacto_1", e.target.value)}
                placeholder="8XX XXX XXX"
              />
            </div>
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-t2">Contacto 2</label>
              <input
                id="fich-t2"
                type="tel"
                className={classeInput}
                value={f.contacto_2}
                onChange={(e) => set("contacto_2", e.target.value)}
                placeholder="8XX XXX XXX"
              />
            </div>
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-mail">Email</label>
              <input
                id="fich-mail"
                type="email"
                className={classeInput}
                value={f.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
          </div>
        </Seccao>

        <Seccao titulo="Saúde">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label className={classeLabel} htmlFor="fich-sang">Grupo Sanguíneo</label>
              <select
                id="fich-sang"
                className={classeInput}
                value={f.grupo_sanguineo}
                onChange={(e) => set("grupo_sanguineo", e.target.value)}
              >
                <option value="">- Desconhecido -</option>
                {GRUPOS_SANGUINEOS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className={classeLabel} htmlFor="fich-doenc">Doença Crónica</label>
              <input
                id="fich-doenc"
                className={classeInput}
                value={f.doenca_cronica}
                onChange={(e) => set("doenca_cronica", e.target.value)}
                placeholder="Ex: Hipertensão, Diabetes, Asma"
              />
            </div>
          </div>
          <div className="space-y-1 sm:max-w-[calc(33.333%-0.5rem)]">
            <label className={classeLabel} htmlFor="fich-alt">Altura (cm)</label>
            <input
              id="fich-alt"
              type="number"
              min={140}
              max={220}
              className={classeInput}
              value={f.altura_cm}
              onChange={(e) => set("altura_cm", e.target.value)}
            />
          </div>
        </Seccao>

        <Seccao titulo="Observações">
          <textarea
            className="border-input bg-transparent dark:bg-input/30 flex min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            value={f.observacoes_gerais}
            onChange={(e) => set("observacoes_gerais", e.target.value)}
            placeholder="Notas relevantes sobre o colaborador..."
          />
        </Seccao>

        {erro && (
          <p className="rounded-md border border-erro/30 bg-erro-bg px-3 py-2 text-sm font-medium text-erro">
            {erro}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
          {modo === "editar" && podeApagar && (
            <button
              type="button"
              onClick={apagar}
              disabled={aGravar || aApagar}
              className="mr-auto inline-flex h-9 items-center gap-1.5 rounded-md border border-erro/40 px-3 text-sm font-semibold text-erro hover:bg-erro-bg disabled:opacity-60"
            >
              {aApagar ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Apagar
            </button>
          )}
          <button
            type="button"
            onClick={onFechar}
            className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={gravar}
            disabled={aGravar}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
          >
            {aGravar && <LoaderCircle className="size-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </Modal>
  );
}
