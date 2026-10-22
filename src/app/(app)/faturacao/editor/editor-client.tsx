"use client";

/**
 * EditorClient - Editor de Cotações e Faturas.
 *
 * Migração do editor.html do hub antigo (1080 linhas), com melhorias:
 * - totais SEMPRE recalculados pela função pura do portal (navegador
 *   só mostra; o servidor recalcula de novo ao gravar);
 * - "Material do cliente": linha descrita com valor 0, fora dos
 *   totais, impressa no Anexo de Material (fim do Excel à parte);
 * - conversão de cotação em fatura (?de=);
 * - unidades "Outro..." mantêm o prompt do hub, tarifas como atalhos.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRightLeft,
  LoaderCircle,
  Plus,
  Printer,
  Save
} from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  calcTotais,
  fmtNum,
  hojeISO,
  numPorExtenso,
  TIPO_CLIENTE_INFO,
  type ClienteFat,
  type DocFaturacao,
  type ItemFaturacao,
  type Moeda,
  type ServicoTipo,
  type TarifaFat,
  type TecnicoFat,
  type TipoCliente,
  type TipoDesconto,
  type TipoDocumento
} from "@/lib/faturacao";
import { Campo, TabelaMao, TabelaMaterial, TabelaMisto, Toggle } from "./editor-tabelas";
import type { DadosTabelas } from "./editor-tabelas";
import type { Linha, MaterialLinha } from "./editor-tipos";

export type { MaterialLinha };

type Dados = {
  documentos: DocFaturacao[];
  clientes: ClienteFat[];
  tecnicos: TecnicoFat[];
  tarifas: TarifaFat[];
  materiais: MaterialLinha[];
};

const linhaDeItem = (it: ItemFaturacao): Linha => ({
  _id: `bd_${it.id || Math.random().toString(36).slice(2)}`,
  item_tipo: it.item_tipo,
  tecnico_id: it.tecnico_id || "",
  descricao: it.descricao || "",
  qtd: Number(it.qtd) || 1,
  tempo: Number(it.tempo) || 1,
  unidade: it.unidade || "horas",
  valor_unit: Number(it.valor_unit) || 0
});

export function EditorClient({
  idEdit,
  idFonte,
  nomeUtilizador,
  cargoUtilizador
}: {
  idEdit: string;
  idFonte: string;
  nomeUtilizador: string;
  cargoUtilizador: string;
}) {
  const router = useRouter();
  const richRef = useRef<HTMLDivElement>(null);

  const [aCarregar, setACarregar] = useState(true);
  const [falha, setFalha] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [dados, setDados] = useState<Dados | null>(null);

  const [docId, setDocId] = useState<string>("");
  const [docTipo, setDocTipo] = useState<TipoDocumento>("cotacao");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(hojeISO());
  const [selCliente, setSelCliente] = useState("");
  const [cliNome, setCliNome] = useState("");
  const [cliMorada, setCliMorada] = useState("");
  const [cliNuit, setCliNuit] = useState("");
  const [cliContacto, setCliContacto] = useState("");
  const [envNome, setEnvNome] = useState("");
  const [envCargo, setEnvCargo] = useState("");
  const [docServ, setDocServ] = useState<ServicoTipo>("mao");
  const [tipoCliente, setTipoCliente] = useState<TipoCliente>("interno");
  const [moeda, setMoeda] = useState<Moeda>("MZN");
  const [taxa, setTaxa] = useState("64");
  const [ivaOn, setIvaOn] = useState(false);
  const [ivaPct, setIvaPct] = useState("16");
  const [descontoTipo, setDescontoTipo] = useState<TipoDesconto>("fixo");
  const [descontoVal, setDescontoVal] = useState("0");
  const [itens, setItens] = useState<Linha[]>([]);
  const [autorOriginal, setAutorOriginal] = useState<{ nome: string; cargo: string } | null>(null);
  const [fonteConversao, setFonteConversao] = useState("");
  const [aImprimirAnexo, setAImprimirAnexo] = useState(false);
  /* Descrição rica à espera de entrar no ecrã. O HTML não pode ser escrito
     directamente em richRef durante a carga: o formulário ainda não está
     montado (o ecrã mostra o spinner) e richRef.current era null - a
     descrição nunca aparecia e ao gravar saía vazia para a base,
     apagando a descrição do documento original. Passa por estado e um
     efeito aplica-a quando o editor monta. */
  const [richCarga, setRichCarga] = useState<{ html: string; chave: number }>({ html: "", chave: 0 });

  /* ---------- carregar ---------- */

  const preencherDeDoc = useCallback(
    (doc: DocFaturacao, itensBD: ItemFaturacao[]) => {
      setDocId(doc.id);
      setDocTipo(doc.tipo);
      setNumero(doc.numero);
      setData(String(doc.data || hojeISO()).slice(0, 10));
      setCliNome(doc.cliente_nome || "");
      setCliMorada(doc.cliente_morada || "");
      setCliNuit(doc.cliente_nuit || "");
      setCliContacto(doc.cliente_contacto || "");
      setEnvNome(doc.enviado_nome || "");
      setEnvCargo(doc.enviado_cargo || "");
      setDocServ((doc.servico || "mao") as ServicoTipo);
      setTipoCliente((doc.tipo_cliente || "interno") as TipoCliente);
      setMoeda((doc.moeda || "MZN") as Moeda);
      setTaxa(String(doc.taxa_cambio || 64));
      setIvaOn(!!doc.iva_incluido);
      setIvaPct(String(doc.iva_pct ?? 16));
      setDescontoTipo((doc.desconto_tipo || "fixo") as TipoDesconto);
      setDescontoVal(String(doc.desconto_input ?? 0));
      setItens((itensBD || []).map(linhaDeItem));
      if (doc.utilizador_nome) {
        setAutorOriginal({ nome: doc.utilizador_nome, cargo: doc.utilizador_cargo || "" });
      }
      setRichCarga((c) => ({ html: String(doc.assunto || ""), chave: c.chave + 1 }));
    },
    []
  );

  /* Marca o cliente da base no select quando o nome do documento casa com
     um cliente registado. Sem isto, o select voltava a "- Selecionar
     cliente -" ao editar ou converter, parecendo que o cliente se perdeu
     (o nome estava, mas a lista ficava desmarcada). */
  const marcarClienteNaLista = (d: Dados | null, nome: string) => {
    if (!nome) return;
    const c = (d?.clientes || []).find((x) => x.nome === nome);
    if (c) setSelCliente(c.id);
  };

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const d = await pedir<Dados>("/api/faturacao/documentos");
        if (!vivo) return;
        setDados(d);

        if (idEdit) {
          const r = await pedir<{ documento: DocFaturacao; itens: ItemFaturacao[] }>(
            `/api/faturacao/documentos/${idEdit}`
          );
          if (!vivo) return;
          preencherDeDoc(r.documento, r.itens);
          marcarClienteNaLista(d, r.documento.cliente_nome);
        } else if (idFonte) {
          // Gerar fatura a partir da cotação fonte
          const r = await pedir<{ documento: DocFaturacao; itens: ItemFaturacao[] }>(
            `/api/faturacao/documentos/${idFonte}`
          );
          if (!vivo) return;
          if (r.documento.tipo !== "cotacao") {
            toast.error("O documento fonte não é uma cotação.");
          }
          preencherDeDoc(r.documento, r.itens);
          marcarClienteNaLista(d, r.documento.cliente_nome);
          setDocId("");
          setDocTipo("fatura");
          setFonteConversao(r.documento.numero);
          setAutorOriginal(null);
          setData(hojeISO());
          const s = await pedir<{ numero: string }>("/api/faturacao/proximo-numero?tipo=fatura");
          if (!vivo) return;
          setNumero(s.numero);
        } else {
          const s = await pedir<{ numero: string }>("/api/faturacao/proximo-numero?tipo=cotacao");
          if (!vivo) return;
          setNumero(s.numero);
          setItens([
            {
              _id: "l1",
              item_tipo: "mao",
              tecnico_id: "",
              descricao: "",
              qtd: 1,
              tempo: 1,
              unidade: "horas",
              valor_unit: 0
            }
          ]);
          setRichCarga((c) => ({ html: "", chave: c.chave + 1 }));
        }
      } catch (e) {
        if (vivo) setFalha((e as Error).message);
      } finally {
        if (vivo) setACarregar(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [idEdit, idFonte, preencherDeDoc]);

  /* ---------- descrição rica ---------- */

  useEffect(() => {
    const ed = richRef.current;
    if (!ed) return;
    const vazio = () => ed.classList.toggle("rich-vazio", !ed.innerText.trim());
    ed.addEventListener("input", vazio);
    ed.addEventListener("blur", vazio);
    return () => {
      ed.removeEventListener("input", vazio);
      ed.removeEventListener("blur", vazio);
    };
  }, [aCarregar]);

  /* Aplica o HTML da descrição quando o editor está montado. Corre com a
     chave (não com o valor): converter uma cotação cujo assunto é igual
     ao do documento aberto teria de repetir a escrita mesmo com o HTML
     idêntico, senão o conteúdo antigo do ecrã ficava no lugar. */
  useEffect(() => {
    if (aCarregar) return;
    const ed = richRef.current;
    if (!ed) return;
    ed.innerHTML = richCarga.html; // o servidor já mandou HTML limpo
    ed.classList.toggle("rich-vazio", !ed.innerText.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [richCarga.chave, aCarregar]);

  const comando = (cmd: string) => {
    const ed = richRef.current;
    if (!ed) return;
    ed.focus();
    document.execCommand(cmd);
  };

  /* ---------- itens ---------- */

  const novaLinha = (tipo: Linha["item_tipo"] = "mao"): Linha => ({
    _id: `l${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    item_tipo: tipo,
    tecnico_id: "",
    descricao: "",
    qtd: 1,
    tempo: 1,
    unidade: tipo === "mao" ? "horas" : "Und",
    valor_unit: 0
  });

  const trocarServico = (s: ServicoTipo) => {
    setDocServ(s);
    const base: Linha["item_tipo"] = s === "material" ? "material" : "mao";
    setItens((at) =>
      at.length
        ? at.map((l) => ({
            ...l,
            item_tipo:
              s === "mao"
                ? "mao"
                : s === "material" && l.item_tipo !== "material_cliente"
                  ? "material"
                  : l.item_tipo,
            unidade:
              s === "material" && l.unidade === "horas" ? "Und" : l.unidade
          }))
        : [novaLinha(base)]
    );
  };

  const removerLinha = (id: string) => {
    setItens((at) => at.filter((l) => l._id !== id));
  };

  const trocarTipoItem = (id: string, tipo: Linha["item_tipo"]) => {
    setItens((at) =>
      at.map((l) => {
        if (l._id !== id) return l;
        const eMao = tipo === "mao";
        return {
          ...l,
          item_tipo: tipo,
          descricao: eMao ? "" : l.descricao,
          unidade: eMao && l.unidade === "Und" ? "horas" : !eMao && l.unidade === "horas" ? "Und" : l.unidade
        };
      })
    );
  };

  const atualizarLinha = (id: string, campo: keyof Linha, valor: string | number) => {
    setItens((at) => at.map((l) => (l._id === id ? { ...l, [campo]: valor } : l)));
  };

  const escolherTecnico = (id: string, tecnicoId: string) => {
    const tec = (dados?.tecnicos || []).find((t) => t.id === tecnicoId);
    const tarifa = tec ? (moeda === "USD" ? Number(tec.tarifa_usd) || 0 : Number(tec.tarifa_mzn) || 0) : 0;
    setItens((at) =>
      at.map((l) => (l._id === id ? { ...l, tecnico_id: tecnicoId, valor_unit: tarifa > 0 ? tarifa : l.valor_unit } : l))
    );
  };

  const escolherMaterial = (id: string, materialId: string) => {
    const mat = (dados?.materiais || []).find((m) => m.id === materialId);
    if (!mat) return;
    setItens((at) =>
      at.map((l) =>
        l._id === id
          ? {
              ...l,
              descricao: mat.nome,
              unidade: mat.unidade || "Und",
              valor_unit: l.item_tipo === "material_cliente" ? 0 : Number(mat.preco_mzn) || l.valor_unit
            }
          : l
      )
    );
  };

  const aplicarTarifa = (id: string, valor: number) => {
    setItens((at) => at.map((l) => (l._id === id ? { ...l, valor_unit: valor } : l)));
  };

  const alternarCliente = (id: string) => {
    setItens((at) =>
      at.map((l) => {
        if (l._id !== id) return l;
        const cliente = l.item_tipo !== "material_cliente";
        return { ...l, item_tipo: cliente ? "material_cliente" : "material", valor_unit: cliente ? 0 : l.valor_unit };
      })
    );
  };

  const unidadeOutro = (id: string, sel: HTMLSelectElement) => {
    const custom = window.prompt("Escreve a unidade:");
    if (custom && custom.trim()) {
      const v = custom.trim();
      atualizarLinha(id, "unidade", v);
      sel.value = v;
    } else {
      sel.value = "Und";
      atualizarLinha(id, "unidade", "Und");
    }
  };

  /* ---------- totais ---------- */

  const tot = useMemo(() => {
    const itensCalc = itens.map((l) => ({
      item_tipo: l.item_tipo,
      qtd: Number(l.qtd) || 0,
      tempo: Number(l.tempo) || 0,
      valor_unit: Number(l.valor_unit) || 0
    }));
    return calcTotais(itensCalc, docServ, {
      desconto_input: Number(descontoVal) || 0,
      desconto_tipo: descontoTipo,
      iva_incluido: ivaOn,
      iva_pct: Number(ivaPct) || 0,
      moeda,
      taxa_cambio: Number(taxa) || 64
    });
  }, [itens, docServ, descontoVal, descontoTipo, ivaOn, ivaPct, moeda, taxa]);

  const temMaterialCliente = itens.some((l) => l.item_tipo === "material_cliente");

  /* ---------- guardar ---------- */

  const corpoDoc = () => ({
    tipo: docTipo,
    numero: numero.trim(),
    data,
    servico: docServ,
    moeda,
    taxa_cambio: Number(taxa) || 64,
    iva_incluido: ivaOn,
    iva_pct: Number(ivaPct) || 16,
    tipo_cliente: tipoCliente,
    cliente_nome: cliNome.trim(),
    cliente_morada: cliMorada,
    cliente_nuit: cliNuit,
    cliente_contacto: cliContacto,
    enviado_nome: envNome,
    enviado_cargo: envCargo,
    assunto: richRef.current ? richRef.current.innerHTML : "",
    desconto_input: Number(descontoVal) || 0,
    desconto_tipo: descontoTipo,
    itens: itens.map((l, i) => ({
      ordem: i,
      item_tipo: l.item_tipo,
      tecnico_id: l.item_tipo === "mao" ? l.tecnico_id || null : null,
      descricao: l.item_tipo === "mao" ? null : l.descricao || null,
      qtd: Number(l.qtd) || 1,
      tempo: Number(l.tempo) || 1,
      unidade: l.unidade,
      valor_unit: Number(l.valor_unit) || 0
    }))
  });

  const validarLocal = (): string => {
    if (!numero.trim()) return "Insira o número do documento.";
    if (!cliNome.trim()) return "Insira o nome do cliente.";
    if (!itens.length) return "Adicione pelo menos uma linha de itens.";
    return "";
  };

  const guardar = async (): Promise<string> => {
    const erro = validarLocal();
    if (erro) {
      toast.error(erro);
      return "";
    }
    setAGravar(true);
    try {
      const r =
        docId
          ? await enviar<{ id: string; numero: string }>(
              `/api/faturacao/documentos/${docId}`,
              corpoDoc(),
              "Documento actualizado.",
              "PATCH"
            )
          : await enviar<{ id: string; numero: string }>(
              "/api/faturacao/documentos",
              corpoDoc(),
              "Documento guardado."
            );
      if (!docId) setDocId(r.id);
      return r.id;
    } catch {
      return "";
    } finally {
      setAGravar(false);
    }
  };

  const guardarEImprimir = async () => {
    const id = await guardar();
    if (id) window.open(`/imprimir/faturacao/${id}`, "_blank");
  };

  const gravarEImprimirAnexo = async () => {
    const id = await guardar();
    if (id) window.open(`/imprimir/faturacao/${id}?modo=anexo`, "_blank");
  };

  const gerarFaturaDaActual = async () => {
    if (!docId || docTipo !== "cotacao") return;
    router.push(`/faturacao/editor?de=${docId}`);
  };

  const trocarTipo = (t: TipoDocumento) => {
    if (docId) {
      // Mudar o tipo de um documento gravado é permitido (o hub também
      // deixava), mas o número mantém-se: quem manda é o utilizador.
      setDocTipo(t);
      return;
    }
    setDocTipo(t);
    pedir<{ numero: string }>(`/api/faturacao/proximo-numero?tipo=${t}`)
      .then((r) => setNumero(r.numero))
      .catch(() => {});
  };

  /* ---------- render ---------- */

  if (aCarregar) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar o editor...
      </div>
    );
  }
  if (falha) {
    return (
      <div className="py-24 text-center text-sm text-destructive">
        {falha}
        <div className="mt-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/faturacao">Voltar ao painel</Link>
          </Button>
        </div>
      </div>
    );
  }

  const clientesAtivos = (dados?.clientes || []).filter((c) => c.ativo !== false);
  const tarifasAtivas = (dados?.tarifas || []).filter((t) => t.ativo !== false);
  const dadosTabelas: DadosTabelas = {
    tecnicos: dados?.tecnicos || [],
    tarifas: tarifasAtivas,
    materiais: dados?.materiais || []
  };
  const autor = autorOriginal || { nome: nomeUtilizador, cargo: cargoUtilizador };

  return (
    <div className="space-y-5 pb-24">
      <Cabeca
        titulo={docId ? `Editar ${docTipo === "fatura" ? "fatura" : "cotação"} ${numero}` : "Novo Documento"}
        subtitulo={
          fonteConversao
            ? `Gerado a partir da cotação ${fonteConversao}. Só fica gravado quando carregares em Guardar.`
            : "A numeração sugere-se automaticamente e reinicia a cada ano (001/2026)."
        }
      >
        <Button asChild variant="outline" size="sm">
          <Link href="/faturacao">Voltar ao painel</Link>
        </Button>
      </Cabeca>

      <div className="grid items-start gap-5 xl:grid-cols-2">
        {/* ═══ Coluna esquerda ═══ */}
        <div className="space-y-5">
          {/* Documento */}
          <Card className="card-sombra py-4">
            <CardContent className="space-y-4 px-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Documento</h2>
              <Toggle
                valor={docTipo}
                opcoes={[
                  { v: "cotacao", t: "Cotação" },
                  { v: "fatura", t: "Fatura" }
                ]}
                onChange={(v) => trocarTipo(v as TipoDocumento)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Número">
                  <Input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="001/2026" />
                </Campo>
                <Campo rotulo="Data">
                  <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
                </Campo>
              </div>
            </CardContent>
          </Card>

          {/* Cliente */}
          <Card className="card-sombra py-4">
            <CardContent className="space-y-4 px-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Cliente</h2>
              <Campo rotulo="Selecionar da base de dados">
                <select
                  value={selCliente}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelCliente(v);
                    const c = (dados?.clientes || []).find((x) => x.id === v);
                    if (c) {
                      setCliNome(c.nome);
                      setCliMorada(c.morada || "");
                      setCliNuit(c.nuit || "");
                      setCliContacto(c.contacto || "");
                    }
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">- Selecionar cliente -</option>
                  {clientesAtivos.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Nome / Empresa *">
                <Input value={cliNome} onChange={(e) => setCliNome(e.target.value)} placeholder="Nome da empresa" />
              </Campo>
              <Campo rotulo="Morada">
                <Input value={cliMorada} onChange={(e) => setCliMorada(e.target.value)} />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="NUIT">
                  <Input value={cliNuit} onChange={(e) => setCliNuit(e.target.value)} />
                </Campo>
                <Campo rotulo="Contacto">
                  <Input value={cliContacto} onChange={(e) => setCliContacto(e.target.value)} />
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Enviado a (nome)">
                  <Input value={envNome} onChange={(e) => setEnvNome(e.target.value)} />
                </Campo>
                <Campo rotulo="Cargo / Dep.">
                  <Input value={envCargo} onChange={(e) => setEnvCargo(e.target.value)} />
                </Campo>
              </div>
            </CardContent>
          </Card>

          {/* Descrição rica */}
          <Card className="card-sombra py-4">
            <CardContent className="space-y-3 px-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Descrição do Serviço
              </h2>
              <div className="flex flex-wrap gap-1 rounded-t-lg border border-border border-b-0 bg-muted/40 px-2 py-1.5">
                {[
                  { c: "bold", t: <b>B</b>, titulo: "Negrito" },
                  { c: "italic", t: <i>I</i>, titulo: "Itálico" },
                  { c: "underline", t: <u>U</u>, titulo: "Sublinhado" },
                  { c: "justifyLeft", t: "⇤", titulo: "Alinhar à esquerda" },
                  { c: "justifyCenter", t: "⇔", titulo: "Centrar" },
                  { c: "justifyRight", t: "⇥", titulo: "Alinhar à direita" },
                  { c: "insertUnorderedList", t: "• =", titulo: "Marcas" },
                  { c: "insertOrderedList", t: "1. =", titulo: "Numeração" }
                ].map((b) => (
                  <button
                    key={b.c}
                    type="button"
                    title={b.titulo}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => comando(b.c)}
                    className="min-w-8 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-ambar-claro hover:text-ambar-texto"
                  >
                    {b.t}
                  </button>
                ))}
                <span className="ml-auto self-center text-[0.68rem] text-muted-foreground">
                  A formatação sai na impressão
                </span>
              </div>
              <div
                ref={richRef}
                contentEditable
                suppressContentEditableWarning
                spellCheck={false}
                data-placeholder="Descreva o serviço a realizar... Selecione o texto e use os botões acima para formatar."
                className="rich-editor min-h-[140px] rounded-b-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ambar-texto"
              />
            </CardContent>
          </Card>
        </div>

        {/* ═══ Coluna direita ═══ */}
        <div className="space-y-5">
          {/* Configurações */}
          <Card className="card-sombra py-4">
            <CardContent className="space-y-4 px-4">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">Configurações</h2>
              <Campo rotulo="Tipo de Serviço">
                <Toggle
                  valor={docServ}
                  opcoes={[
                    { v: "mao", t: "Mão-de-Obra" },
                    { v: "material", t: "Material" },
                    { v: "misto", t: "Misto" }
                  ]}
                  onChange={(v) => trocarServico(v as ServicoTipo)}
                />
              </Campo>
              <Campo rotulo="Tipo de Cliente">
                <Toggle
                  valor={tipoCliente}
                  opcoes={[
                    { v: "interno", t: "Interno" },
                    { v: "externo", t: "Externo" },
                    { v: "outro", t: "Outro" }
                  ]}
                  onChange={(v) => setTipoCliente(v as TipoCliente)}
                />
                <p className="mt-2 rounded-md border-l-2 border-l-ambar-texto bg-ambar-claro/60 px-2.5 py-1.5 text-xs text-muted-foreground">
                  {TIPO_CLIENTE_INFO[tipoCliente]}
                </p>
              </Campo>
              <Campo rotulo="Moeda e Taxa de Câmbio">
                <div className="flex items-end gap-3">
                  <Toggle
                    valor={moeda}
                    opcoes={[
                      { v: "MZN", t: "MZN" },
                      { v: "USD", t: "USD" }
                    ]}
                    onChange={(v) => setMoeda(v as Moeda)}
                  />
                  <div className="ml-auto w-32">
                    <p className="mb-1 text-[0.7rem] text-muted-foreground">1 USD = ? MZN</p>
                    <Input type="number" value={taxa} min="1" step="0.5" onChange={(e) => setTaxa(e.target.value)} />
                  </div>
                </div>
              </Campo>
              <Campo rotulo="IVA">
                <div className="flex items-center gap-3">
                  <Toggle
                    valor={ivaOn ? "sim" : "nao"}
                    opcoes={[
                      { v: "nao", t: "Não incluído" },
                      { v: "sim", t: "Incluído" }
                    ]}
                    onChange={(v) => setIvaOn(v === "sim")}
                  />
                  {ivaOn && (
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        value={ivaPct}
                        min="0"
                        max="100"
                        step="0.5"
                        onChange={(e) => setIvaPct(e.target.value)}
                        className="w-20"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  )}
                </div>
              </Campo>
              <Campo rotulo="Elaborado por">
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <div className="text-sm font-semibold">{autor.nome}</div>
                  {autor.cargo && <div className="text-xs text-ambar-texto dark:text-amber-400">{autor.cargo}</div>}
                  <div className="mt-1 text-[0.68rem] text-muted-foreground">
                    {docId
                      ? "Autor original do documento - mantém-se quando outra pessoa edita."
                      : "Preenchido com a pessoa da sessão; sai igual na impressão."}
                  </div>
                </div>
              </Campo>
            </CardContent>
          </Card>

          {/* Itens */}
          <Card className="card-sombra py-4">
            <CardContent className="px-4">
              <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Itens do Serviço
              </h2>
              {docServ === "mao" ? (
                <TabelaMao
                  itens={itens}
                  dados={dadosTabelas}
                  moeda={moeda}
                  onEditar={atualizarLinha}
                  onApagar={removerLinha}
                  onTecnico={escolherTecnico}
                  onTarifa={aplicarTarifa}
                  onUnidadeOutro={unidadeOutro}
                />
              ) : docServ === "material" ? (
                <TabelaMaterial
                  itens={itens}
                  dados={dadosTabelas}
                  moeda={moeda}
                  onEditar={atualizarLinha}
                  onApagar={removerLinha}
                  onMaterial={escolherMaterial}
                  onAlternarCliente={alternarCliente}
                  onUnidadeOutro={unidadeOutro}
                />
              ) : (
                <TabelaMisto
                  itens={itens}
                  dados={dadosTabelas}
                  moeda={moeda}
                  onEditar={atualizarLinha}
                  onApagar={removerLinha}
                  onTecnico={escolherTecnico}
                  onMaterial={escolherMaterial}
                  onTipo={trocarTipoItem}
                  onTarifa={aplicarTarifa}
                  onAlternarCliente={alternarCliente}
                  onUnidadeOutro={unidadeOutro}
                />
              )}
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() =>
                  setItens((at) => [...at, novaLinha(docServ === "material" ? "material" : "mao")])
                }
              >
                <Plus className="size-4" aria-hidden /> Adicionar linha
              </Button>
              {docServ !== "mao" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Marca <strong>Do cliente</strong> na linha do material que o próprio cliente
                  fornece: fica descrito com valor zero, não entra nos totais e sai no
                  Anexo de Material na impressão (fim do Excel à parte).
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Totais + barra de acções */}
      <Card className="card-sombra py-4">
        <CardContent className="px-4">
          <div className="grid gap-5 lg:grid-cols-[1fr,340px]">
            <div className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                Desconto e resumo
              </h2>
              <div className="flex flex-wrap items-center gap-3">
                <Toggle
                  valor={descontoTipo}
                  opcoes={[
                    { v: "fixo", t: moeda },
                    { v: "pct", t: "%" }
                  ]}
                  onChange={(v) => {
                    setDescontoTipo(v as TipoDesconto);
                    setDescontoVal("0");
                  }}
                />
                <Input
                  type="number"
                  value={descontoVal}
                  min="0"
                  step="0.01"
                  onChange={(e) => setDescontoVal(e.target.value)}
                  className="w-28"
                />
                <span className="text-sm text-destructive">
                  {tot.desconto > 0 ? tot.desconto_label : `Sem desconto`}
                </span>
              </div>
              {temMaterialCliente && (
                <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Este documento tem material do cliente: as linhas marcadas não entram
                  no subtotal. Ao gravar, fica disponível a impressão do Anexo de Material.
                </p>
              )}
            </div>
            <div className="rounded-lg border border-ambar-texto/25 bg-ambar-claro/40 p-4 dark:bg-amber-500/10">
              <LinhaTotal rotulo="Subtotal" valor={`${fmtNum(tot.subtotal)} ${moeda}`} />
              {tot.desconto > 0 && (
                <LinhaTotal rotulo="Desconto" valor={tot.desconto_label} vermelho />
              )}
              {ivaOn ? (
                <LinhaTotal rotulo={`IVA (${ivaPct}%)`} valor={`${fmtNum(tot.iva)} ${moeda}`} />
              ) : (
                <LinhaTotal rotulo="IVA" valor="Não incluído" apagado />
              )}
              <div className="mt-2 flex items-baseline justify-between border-t-2 border-ambar-texto/40 pt-2 dark:border-amber-500/40">
                <span className="text-sm font-bold uppercase">Total {moeda}</span>
                <span className="font-mono text-xl font-bold text-ambar-texto dark:text-amber-400">
                  {fmtNum(tot.total)}
                </span>
              </div>
              <p className="mt-1 text-right text-[0.7rem] italic text-muted-foreground">
                {moeda === "USD"
                  ? `≈ ${fmtNum(tot.total_mzn)} MZN (taxa: ${taxa})`
                  : `≈ USD ${fmtNum(tot.total / (Number(taxa) || 64))} (taxa: ${taxa})`}
              </p>
              <p className="mt-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs italic text-muted-foreground">
                São: {numPorExtenso(tot.total_mzn)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Barra de acções (fixa em baixo) */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur lg:pl-[var(--sidebar-w,0px)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-3">
          <Button asChild variant="outline" size="sm">
            <Link href="/faturacao">Voltar</Link>
          </Button>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[0.7rem] font-bold",
              docId
                ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            )}
          >
            {docId ? "Gravado" : "Novo documento"}
          </span>
          {fonteConversao && (
            <span className="rounded-full bg-ambar-claro px-3 py-1 text-[0.7rem] font-semibold text-ambar-texto dark:text-amber-400">
              De: cotação {fonteConversao}
            </span>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {docId && docTipo === "cotacao" && (
              <Button variant="outline" size="sm" onClick={gerarFaturaDaActual}>
                <ArrowRightLeft className="size-4" aria-hidden /> Gerar Fatura desta cotação
              </Button>
            )}
            {temMaterialCliente && (
              <Button variant="outline" size="sm" onClick={gravarEImprimirAnexo}>
                <Printer className="size-4" aria-hidden /> Gravar e imprimir Anexo de Material
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={guardar} disabled={aGravar}>
              {aGravar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              Guardar
            </Button>
            <Button size="sm" onClick={guardarEImprimir} disabled={aGravar}>
              <Printer className="size-4" aria-hidden /> Guardar e Imprimir
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LinhaTotal({
  rotulo,
  valor,
  vermelho,
  apagado
}: {
  rotulo: string;
  valor: string;
  vermelho?: boolean;
  apagado?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-sm">
      <span className={cn("text-muted-foreground", vermelho && "text-destructive", apagado && "italic")}>
        {rotulo}
      </span>
      <span className={cn("font-semibold", vermelho && "text-destructive", apagado && "italic text-muted-foreground")}>
        {valor}
      </span>
    </div>
  );
}
