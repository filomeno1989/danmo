"use client";

/**
 * FichaDetalhe - Vista de leitura da ficha completa.
 *
 * A parte que o Filomeno pediu para deixar CLARA: o tempo de quem veio
 * transferido aparece em tres caixas distintas - o tempo no grupo antes
 * da Danmo, o tempo na Danmo e o TOTAL, sempre com as parcelas a vista.
 * No estagiario, o estado do periodo (dias que faltam, decisao tomada)
 * vem a frente de tudo.
 *
 * ARQUIVO DE DOCUMENTOS: cada ficha leva os scans anexados (PDF ou
 * foto comprimida no navegador). Abre numa tab nova para imprimir,
 * descarrega com um clique e a validade opcional alimenta os alertas.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Download,
  ExternalLink,
  FileImage,
  FileText,
  LoaderCircle,
  Paperclip,
  Pencil,
  Trash2,
  UserRound
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { enviar, pedir } from "@/components/oficina/ui-bits";
import { comprimirFoto } from "@/lib/comprimir-foto";
import {
  ESTAGIO_RESULTADO_LABEL,
  EMPRESA_LABEL,
  MAX_DOC_BYTES,
  TIPOS_DOCUMENTOS,
  empresaRotulo,
  estadoEstagio,
  formatoBytes,
  formatoData,
  idadeAnos,
  inicioServico,
  mesLabel,
  situacaoPorValidade,
  tempoDeCasa,
  tempoLongo,
  temposTransferido,
  type Colaborador,
  type ValidadeCor
} from "@/lib/rh";

type Props = {
  ficha: Colaborador;
  podeMexer: boolean;
  onAmpliar: (id: number, nome: string, foto: string) => void;
  onEditar: () => void;
  onFechar: () => void;
  /** Avisado quando os anexos mudam (anexado ou apagado): os alertas do quadro recalculam. */
  onDocumentosMudaram?: () => void;
};

const COR_EMPRESA: Record<string, string> = {
  porto: "bg-emerald-600/12 text-emerald-700 dark:text-emerald-300",
  danmo: "bg-sky-600/12 text-sky-700 dark:text-sky-300"
};

const COR_SITUACAO: Record<ValidadeCor, string> = {
  vencido: "bg-red-600/12 text-red-700 dark:text-red-300",
  urgente: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  proximo: "bg-amber-500/10 text-amber-700 dark:text-amber-200/90",
  ok: "bg-muted text-muted-foreground"
};

function Etiqueta({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span
      className={
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold " +
        cor
      }
    >
      {children}
    </span>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className="text-sm font-semibold">{valor || "-"}</p>
    </div>
  );
}

/* ============ Arquivo de documentos (scans) ============ */

type DocAnexado = {
  id: string;
  tipo: string;
  titulo: string;
  validade: string | null;
  arquivo_nome: string;
  arquivo_tipo: string;
  arquivo_bytes: number;
  criado_em: string;
};

function lerDataUrl(ficheiro: File): Promise<string> {
  return new Promise((resolver, recusar) => {
    const leitor = new FileReader();
    leitor.onload = () => resolver(String(leitor.result || ""));
    leitor.onerror = () => recusar(new Error("O navegador não conseguiu ler o ficheiro."));
    leitor.readAsDataURL(ficheiro);
  });
}

function SecaoDocumentos({
  fichaId,
  podeMexer,
  onMudou
}: {
  fichaId: number;
  podeMexer: boolean;
  onMudou?: () => void;
}) {
  const [docs, setDocs] = useState<DocAnexado[] | null>(null);
  const [tipo, setTipo] = useState("");
  const [validade, setValidade] = useState("");
  const [aAnexar, setAAnexar] = useState(false);
  const [aApagar, setAApagar] = useState("");
  const inputFicheiro = useRef<HTMLInputElement>(null);

  const carregar = useCallback(() => {
    pedir<{ ok: boolean; documentos: DocAnexado[] }>(
      `/api/rh/quadro/documentos?colaborador_id=${fichaId}`
    )
      .then((d) => setDocs(d.documentos || []))
      .catch(() => setDocs([]));
  }, [fichaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function anexar(ficheiro: File | undefined) {
    if (!ficheiro) return;
    if (!tipo) {
      toast.error("Escolhe primeiro o tipo de documento.");
      return;
    }
    const imagem = ficheiro.type.startsWith("image/");
    if (!imagem && ficheiro.type !== "application/pdf") {
      toast.error("Escolhe um PDF ou uma foto (JPG, PNG, WebP).");
      return;
    }
    if (!imagem && ficheiro.size > MAX_DOC_BYTES) {
      toast.error("O PDF passou de 3 MB. Digitaliza em qualidade média ou tira uma foto.");
      return;
    }
    setAAnexar(true);
    try {
      const arquivo = imagem ? await comprimirFoto(ficheiro) : await lerDataUrl(ficheiro);
      const mime = arquivo.slice(5, arquivo.indexOf(";")) || ficheiro.type;
      const d = await enviar<{ ok: boolean; documento: DocAnexado | null }>(
        "/api/rh/quadro/documentos",
        {
          accao: "anexar",
          colaborador_id: fichaId,
          tipo,
          validade: validade || null,
          arquivo,
          arquivo_nome: ficheiro.name,
          arquivo_tipo: mime,
          arquivo_bytes: ficheiro.size
        },
        "Documento anexado."
      );
      if (d.documento) setDocs((atual) => [d.documento as DocAnexado, ...(atual || [])]);
      setTipo("");
      setValidade("");
      onMudou?.();
    } catch {
      /* o toast do enviar ja mostra a causa */
    } finally {
      setAAnexar(false);
      if (inputFicheiro.current) inputFicheiro.current.value = "";
    }
  }

  async function apagar(doc: DocAnexado) {
    if (!window.confirm(`Apagar o documento "${doc.titulo}"? Esta acção não pode ser desfeita.`)) {
      return;
    }
    setAApagar(doc.id);
    try {
      await enviar(`/api/rh/quadro/documentos/${doc.id}`, undefined, "Documento apagado.", "DELETE");
      setDocs((atual) => (atual || []).filter((x) => x.id !== doc.id));
      onMudou?.();
    } catch {
      /* o toast do enviar ja mostra a causa */
    } finally {
      setAApagar("");
    }
  }

  return (
    <div>
      <p className="mb-2.5 flex items-center gap-2 text-[0.72rem] font-bold uppercase tracking-wider text-primario">
        Documentos anexados
        {docs && <span className="text-muted-foreground">({docs.length})</span>}
      </p>

      {podeMexer && (
        <div className="mb-3 rounded-xl border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr),minmax(0,1fr),auto]">
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              aria-label="Tipo de documento"
              className="border-input bg-background h-9 rounded-md border px-2.5 text-sm"
            >
              <option value="">Tipo de documento</option>
              {TIPOS_DOCUMENTOS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              aria-label="Validade do documento"
              className="border-input bg-transparent dark:bg-input/30 flex h-9 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <button
              type="button"
              onClick={() => inputFicheiro.current?.click()}
              disabled={aAnexar}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-forte disabled:opacity-60"
            >
              {aAnexar ? <LoaderCircle className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
              Anexar ficheiro
            </button>
          </div>
          <input
            ref={inputFicheiro}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => anexar(e.target.files?.[0])}
          />
        </div>
      )}

      {docs === null ? (
        <p className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> A carregar os anexos...
        </p>
      ) : docs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">
          Sem documentos anexados.
        </p>
      ) : (
        <ul className="divide-y">
          {docs.map((doc) => {
            const imagem = doc.arquivo_tipo.startsWith("image/");
            const sit = situacaoPorValidade(doc.validade);
            return (
              <li key={doc.id} data-doc className="flex flex-wrap items-center gap-2 py-2.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {imagem ? <FileImage className="size-4.5" aria-hidden /> : <FileText className="size-4.5" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{doc.titulo}</p>
                  <p className="truncate text-[0.68rem] text-muted-foreground">
                    {formatoBytes(doc.arquivo_bytes)} · anexado {formatoData(doc.criado_em.slice(0, 10)) || "-"}
                  </p>
                </div>
                <Etiqueta cor="bg-neutral-900/8 text-neutral-700 dark:bg-white/10 dark:text-neutral-200">
                  {doc.tipo}
                </Etiqueta>
                {doc.validade && sit && (
                  <Etiqueta cor={COR_SITUACAO[sit]}>
                    {sit === "ok" ? "Vence " : ""}
                    {formatoData(doc.validade)}
                  </Etiqueta>
                )}
                <span className="flex gap-1">
                  <a
                    href={`/api/rh/quadro/documentos/${doc.id}/arquivo`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir ${doc.titulo}`}
                    title="Abrir para ver ou imprimir"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ExternalLink className="size-4" aria-hidden />
                  </a>
                  <a
                    href={`/api/rh/quadro/documentos/${doc.id}/arquivo?descarregar=1`}
                    aria-label={`Descarregar ${doc.titulo}`}
                    title="Descarregar"
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Download className="size-4" aria-hidden />
                  </a>
                  {podeMexer && (
                    <button
                      type="button"
                      onClick={() => apagar(doc)}
                      disabled={aApagar === doc.id}
                      aria-label={`Apagar ${doc.titulo}`}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-erro-bg hover:text-erro disabled:opacity-60"
                    >
                      {aApagar === doc.id ? (
                        <LoaderCircle className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="size-4" aria-hidden />
                      )}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function FichaDetalhe({ ficha, podeMexer, onAmpliar, onEditar, onFechar, onDocumentosMudaram }: Props) {
  const estagiario = (ficha.tipo_colaborador || "") === "estagiario";
  const transferido = !estagiario && (ficha.tipo_vinculo || "contratado") === "transferido";
  const activo = ficha.active !== false;
  const situacaoEstagio = estadoEstagio(ficha);
  const parcelas = temposTransferido(ficha);
  const inicio = inicioServico(ficha);
  const fim = activo ? null : ficha.data_inativo;
  const area = ficha.setor || ficha.department || "";

  // A foto vive numa tabela a parte e so vem quando a ficha abre
  const [foto, setFoto] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/rh/quadro/${ficha.id}`, { cache: "no-store" })
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
  }, [ficha.id]);

  return (
    <Modal
      aberto
      fechar={onFechar}
      titulo={ficha.name || "Ficha"}
      subtitulo={`Código ${ficha.code || "-"}`}
      largura="max-w-2xl"
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-4">
          {foto ? (
            <button
              type="button"
              onClick={() => onAmpliar(ficha.id, ficha.name || "", foto)}
              aria-label="Ampliar foto"
              title="Clica para ampliar"
              className="shrink-0 cursor-zoom-in rounded-xl border transition-transform hover:scale-[1.03]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={foto} alt={ficha.name || ""} className="size-20 rounded-xl object-cover" />
            </button>
          ) : (
            <span className="flex size-20 items-center justify-center rounded-xl border bg-muted text-muted-foreground">
              <UserRound className="size-9" aria-hidden />
            </span>
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="text-base font-bold leading-tight">{ficha.name}</p>
            <p className="text-sm text-muted-foreground">{ficha.categoria || "-"}</p>
            <div className="flex flex-wrap gap-1.5">
              <Etiqueta cor={COR_EMPRESA[ficha.empresa || ""] || "bg-muted text-muted-foreground"}>
                {empresaRotulo(ficha)}
              </Etiqueta>
              {estagiario ? (
                <Etiqueta cor="bg-amber-500/15 text-amber-700 dark:text-amber-300">Estagiário</Etiqueta>
              ) : (
                <Etiqueta cor="bg-neutral-900/8 text-neutral-800 dark:bg-white/10 dark:text-neutral-100">
                  Efetivo
                </Etiqueta>
              )}
              {transferido && (
                <Etiqueta cor="bg-orange-600/10 text-orange-700 dark:text-orange-300">
                  Transferido
                </Etiqueta>
              )}
              <Etiqueta
                cor={
                  activo
                    ? "bg-emerald-600/12 text-emerald-700 dark:text-emerald-300"
                    : "bg-muted text-muted-foreground"
                }
              >
                {activo ? "Activo" : "Inactivo"}
              </Etiqueta>
            </div>
          </div>
        </div>

        {estagiario && situacaoEstagio && (
          <div
            className={
              "rounded-xl border p-4 " +
              (situacaoEstagio.situacao === "a_decorrer"
                ? "border-amber-600/30 bg-amber-500/10"
                : situacaoEstagio.situacao === "terminado"
                  ? "border-red-600/30 bg-red-500/10"
                  : "border-border bg-muted/40")
            }
          >
            <p className="text-[0.72rem] font-bold uppercase tracking-wider text-muted-foreground">
              Situação do Estágio
            </p>
            {situacaoEstagio.situacao === "a_decorrer" && (
              <p className="mt-1 text-sm font-semibold">
                {Number.isFinite(situacaoEstagio.dias)
                  ? situacaoEstagio.dias === 0
                    ? "Termina hoje"
                    : situacaoEstagio.dias === 1
                      ? "Falta 1 dia para o fim previsto"
                      : `Faltam ${situacaoEstagio.dias} dias para o fim previsto`
                  : "A decorrer"}
                {" - "}
                <span className="font-normal text-muted-foreground">
                  decide-se no fim: fica como efetivo ou não permanece
                </span>
              </p>
            )}
            {situacaoEstagio.situacao === "terminado" && (
              <p className="mt-1 text-sm font-semibold text-erro">
                O fim previsto passou há {situacaoEstagio.diasAtraso}{" "}
                {situacaoEstagio.diasAtraso === 1 ? "dia" : "dias"} sem decisão registada
              </p>
            )}
            {situacaoEstagio.situacao === "promovido" && (
              <p className="mt-1 text-sm font-semibold">
                {ESTAGIO_RESULTADO_LABEL.promovido}
              </p>
            )}
            {situacaoEstagio.situacao === "nao_permaneceu" && (
              <p className="mt-1 text-sm font-semibold">
                {ESTAGIO_RESULTADO_LABEL.nao_permaneceu}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border p-3">
            <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
              Início de serviço
            </p>
            <p className="text-sm font-semibold">{formatoData(inicio) || "-"}</p>
            {estagiario && ficha.estagio_data_inicio && (
              <p className="mt-0.5 text-[0.68rem] text-muted-foreground">Início do estágio</p>
            )}
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
              Tempo {EMPRESA_LABEL[ficha.empresa || ""] ? `na ${EMPRESA_LABEL[ficha.empresa || ""]}` : "de casa"}
            </p>
            <p className="text-sm font-semibold">{tempoDeCasa(ficha)}</p>
          </div>
          <div className="rounded-xl border p-3">
            <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Saída</p>
            <p className="text-sm font-semibold">
              {activo ? "Na empresa" : formatoData(fim) || "-"}
            </p>
          </div>
        </div>

        {parcelas && (
          <div className="rounded-xl border border-primario/40 bg-primario/5 p-4">
            <p className="text-[0.72rem] font-bold uppercase tracking-wider text-primario">
              Tempo no Grupo, por parcela
            </p>
            <div className="mt-2.5 grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">
                  Antes ({ficha.empresa_origem || "origem"})
                </p>
                <p className="text-sm font-semibold">{parcelas.antes}</p>
              </div>
              <div>
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Na Danmo</p>
                <p className="text-sm font-semibold">{tempoLongo(inicio, fim)}</p>
              </div>
              <div>
                <p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="text-sm font-bold text-primario">{parcelas.total}</p>
              </div>
            </div>
          </div>
        )}

        {estagiario && (
          <div className="rounded-xl border p-4">
            <p className="text-[0.72rem] font-bold uppercase tracking-wider text-primario">Estágio</p>
            <div className="mt-2.5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Linha rotulo="Instituição" valor={ficha.estagio_instituicao || ""} />
              <Linha rotulo="Orientador" valor={ficha.estagio_orientador || ""} />
              <Linha rotulo="Início" valor={formatoData(ficha.estagio_data_inicio) || "-"} />
              <Linha rotulo="Fim previsto" valor={formatoData(ficha.estagio_data_fim) || "-"} />
              <Linha rotulo="Tempo de estágio" valor={tempoLongo(ficha.estagio_data_inicio, fim)} />
            </div>
          </div>
        )}

        {transferido && (
          <div className="rounded-xl border p-4">
            <p className="text-[0.72rem] font-bold uppercase tracking-wider text-primario">
              Transferência
            </p>
            <div className="mt-2.5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Linha rotulo="Empresa de origem" valor={ficha.empresa_origem || ""} />
              <Linha rotulo="Admissão no grupo" valor={formatoData(ficha.data_admissao_grupo) || "-"} />
              <Linha rotulo="Admissão na Danmo" valor={formatoData(ficha.data_admissao_danmo) || "-"} />
            </div>
          </div>
        )}

        <div>
          <p className="mb-2.5 text-[0.72rem] font-bold uppercase tracking-wider text-primario">
            Dados pessoais
          </p>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <Linha
              rotulo="Nascimento"
              valor={
                ficha.data_nascimento
                  ? `${formatoData(ficha.data_nascimento)}${idadeAnos(ficha.data_nascimento) ? ` (${idadeAnos(ficha.data_nascimento)} anos)` : ""}`
                  : "-"
              }
            />
            <Linha rotulo="Naturalidade" valor={ficha.naturalidade || ""} />
            <Linha rotulo="Estado civil" valor={ficha.estado_civil || ""} />
            <Linha rotulo="Endereço" valor={ficha.endereco || ""} />
            <Linha rotulo="Dependentes" valor={ficha.num_dependentes ? String(ficha.num_dependentes) : "-"} />
            <Linha rotulo="Mês de férias" valor={mesLabel(ficha.mes_ferias)} />
            <Linha rotulo="Área / Departamento" valor={area} />
            <Linha rotulo="B.I." valor={ficha.bi_numero || ""} />
            <Linha rotulo="B.I. Validade" valor={formatoData(ficha.bi_validade)} />
            <Linha rotulo="INSS" valor={ficha.inss_numero || ""} />
            <Linha rotulo="NUIT" valor={ficha.nuit_numero || ""} />
            <Linha rotulo="Carta de Condução" valor={ficha.carta_conducao || ""} />
            <Linha rotulo="Carta Validade" valor={formatoData(ficha.carta_conducao_validade)} />
            <Linha rotulo="Contacto 1" valor={ficha.contacto_1 || ficha.contacto || ""} />
            <Linha rotulo="Contacto 2" valor={ficha.contacto_2 || ""} />
            <Linha rotulo="Email" valor={ficha.email || ""} />
            <Linha rotulo="Grupo sanguíneo" valor={ficha.grupo_sanguineo || ""} />
            <Linha rotulo="Doença crónica" valor={ficha.doenca_cronica || ""} />
            <Linha rotulo="Altura" valor={ficha.altura_cm ? `${ficha.altura_cm} cm` : "-"} />
          </div>
        </div>

        <SecaoDocumentos fichaId={ficha.id} podeMexer={podeMexer} onMudou={onDocumentosMudaram} />

        {ficha.observacoes_gerais && (
          <div>
            <p className="mb-1.5 text-[0.72rem] font-bold uppercase tracking-wider text-primario">
              Observações
            </p>
            <p className="whitespace-pre-wrap rounded-xl border bg-muted/30 p-3 text-sm">
              {ficha.observacoes_gerais}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <button
            type="button"
            onClick={onFechar}
            className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted"
          >
            Fechar
          </button>
          {podeMexer && (
            <button
              type="button"
              onClick={onEditar}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-forte"
            >
              <Pencil className="size-4" aria-hidden />
              Editar
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
