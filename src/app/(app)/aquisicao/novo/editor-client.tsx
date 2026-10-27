/**
 * /aquisicao/novo - Editor de Pedido de Aquisição (cliente).
 *
 * Migração do novo.html do hub, com melhorias de analista:
 * - o Nº do pedido vem do SERVIDOR (o hub calculava no navegador e duas
 *   gravações em concorrência nasciam com o mesmo número);
 * - trava anti-duplo-clique com ref síncrona (o disabled só vale depois
 *   do re-render; a ref trava no mesmo instante, antes do primeiro
 *   await - a mesma trava que a Faturação ganhou);
 * - pesquisa de solicitante sem acentos por nome ou código;
 * - validação com o MESMO juiz do servidor (problemaDoPedido).
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircle, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Cabeca, enviar, pedir } from "@/components/oficina/ui-bits";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  itensParaGravar,
  numeroFmt,
  problemaDoPedido,
  semAcentos,
  UNIDADES_AQ,
  type ColaboradorAq,
  type DadosPedido,
  type DenominacaoAq,
  type FornecedorAq,
  type ItemAquisicao,
  type PedidoAquisicao
} from "@/lib/aquisicao";

const hojeISO = () => new Date().toISOString().slice(0, 10);

type LinhaItem = ItemAquisicao & { chave: number };

const NOVO = "__novo__";

/**
 * Campo com lista de atalhos (Unidade e Aplicação na tabela de material).
 *
 * Substitui o datalist do hub: o Chromium filtra as sugestões pelo texto
 * já escrito e a Unidade nasce "Un", logo a lista só mostrava "Un" -
 * era preciso apagar o campo para ver as outras unidades. Aqui a lista
 * abre SEMPRE completa ao clicar (e filtra só enquanto se escreve),
 * aceita texto livre para unidades fora da lista e vive em
 * position: fixed para não ser cortada pelo overflow-x da tabela.
 */
function CampoLista({
  valor,
  onMuda,
  opcoes,
  placeholder,
  rotulo
}: {
  valor: string;
  onMuda: (v: string) => void;
  opcoes: string[];
  placeholder: string;
  rotulo: string;
}) {
  const [aberta, setAberta] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; w: number; paraCima: boolean } | null>(null);
  /* O que vale para filtrar é o que o utilizador ESCREVEU com a lista
     aberta, não o valor que o campo já tinha: a Unidade nasce "Un" e
     mesmo assim a lista tem de abrir completa (era este o defeito do
     datalist, que filtrava pelo valor e só mostrava "Un"). */
  const [escrito, setEscrito] = useState(false);
  const raizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberta) return;
    const fora = (e: MouseEvent) => {
      if (raizRef.current && e.target instanceof Node && raizRef.current.contains(e.target)) return;
      setAberta(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberta(false);
    };
    const fecha = () => setAberta(false);
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla);
    window.addEventListener("scroll", fecha, true);
    window.addEventListener("resize", fecha);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla);
      window.removeEventListener("scroll", fecha, true);
      window.removeEventListener("resize", fecha);
    };
  }, [aberta]);

  const abre = () => {
    const r = raizRef.current?.getBoundingClientRect();
    if (!r) {
      setAberta(true);
      return;
    }
    /* Abre para baixo; sem espaço na página, abre para cima. */
    const paraCima = r.bottom + 236 > window.innerHeight && r.top > 236;
    setPos({
      x: r.left,
      y: paraCima ? window.innerHeight - r.top + 4 : r.bottom + 4,
      w: Math.max(r.width, 128),
      paraCima
    });
    setEscrito(false);
    setAberta(true);
  };

  /* Escreveu com a lista aberta? filtra. Senão? lista inteira. */
  const q = semAcentos(valor.trim());
  const filtradas = escrito && q ? opcoes.filter((o) => semAcentos(o).includes(q)) : opcoes;

  return (
    <div ref={raizRef} className="relative">
      <Input
        value={valor}
        onChange={(e) => {
          setEscrito(true);
          onMuda(e.target.value);
        }}
        onFocus={abre}
        placeholder={placeholder}
        aria-label={rotulo}
      />
      {aberta && pos && filtradas.length > 0 ? (
        <div
          data-lista-opcoes
          className="fixed z-50 max-h-56 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-lg"
          style={{
            left: pos.x,
            width: pos.w,
            ...(pos.paraCima ? { bottom: pos.y } : { top: pos.y })
          }}
        >
          {filtradas.map((o) => (
            <button
              key={o}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onMuda(o);
                setAberta(false);
              }}
            >
              {o}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function EditorAquisicao({ idEdicao }: { idEdicao: string }) {
  const router = useRouter();

  const [dados, setDados] = useState({
    data_pedido: "",
    tipo_documento: "",
    tipo_novo: "",
    numero_cotacao_proforma: "",
    fornecedor_id: "",
    fornecedor_novo: "",
    solicitante: "",
    solicitante_codigo: "",
    observacao_geral: ""
  });
  const [itens, setItens] = useState<LinhaItem[]>([]);
  const seqRef = useRef(0);

  const [fornecedores, setFornecedores] = useState<FornecedorAq[]>([]);
  const [denominacoes, setDenominacoes] = useState<DenominacaoAq[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorAq[]>([]);
  const [aplicacoes, setAplicacoes] = useState<string[]>([]);
  const [numeroSugerido, setNumeroSugerido] = useState<string>("...");

  const [aCarregar, setACarregar] = useState(true);
  const [aGravar, setAGravar] = useState(false);
  const [editando, setEditando] = useState<PedidoAquisicao | null>(null);
  const [abertaLista, setAbertaLista] = useState(false);

  /* Trava síncrona anti-duplo-clique: vale no mesmo instante, antes do
     primeiro await (o disabled do botão só surte efeito no re-render). */
  const travaRef = useRef(false);

  const set = (campo: keyof typeof dados, valor: string) =>
    setDados((d) => ({ ...d, [campo]: valor }));

  const novaLinha = useCallback((base?: Partial<ItemAquisicao>) => {
    seqRef.current += 1;
    setItens((atual) => [
      ...atual,
      {
        chave: seqRef.current,
        numero_ordem: 0,
        designacao: base?.designacao || "",
        quantidade: base?.quantidade ?? 1,
        unidade: base?.unidade || "Un",
        aplicacao: base?.aplicacao || "",
        observacao: base?.observacao || ""
      }
    ]);
  }, []);

  const mudaItem = (chave: number, campo: keyof ItemAquisicao, valor: string | number) =>
    setItens((atual) => atual.map((i) => (i.chave === chave ? { ...i, [campo]: valor } : i)));

  const removeItem = (chave: number) => setItens((atual) => atual.filter((i) => i.chave !== chave));

  /* ---------- Carga inicial ---------- */

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [f, d, c, base] = await Promise.all([
          pedir<{ fornecedores: FornecedorAq[] }>("/api/aquisicao/fornecedores"),
          pedir<{ denominacoes: DenominacaoAq[] }>("/api/aquisicao/denominacoes"),
          pedir<{ colaboradores: ColaboradorAq[] }>("/api/aquisicao/colaboradores"),
          pedir<{ aplicacoes: string[] }>("/api/aquisicao/pedidos")
        ]);
        if (!vivo) return;
        setFornecedores(f.fornecedores || []);
        setDenominacoes(d.denominacoes || []);
        setColaboradores(c.colaboradores || []);
        setAplicacoes(base.aplicacoes || []);

        if (idEdicao) {
          const r = await pedir<{ pedido: PedidoAquisicao; itens: ItemAquisicao[] }>(
            `/api/aquisicao/pedidos/${idEdicao}`
          );
          if (!vivo) return;
          setEditando(r.pedido);
          const denomExiste = (d.denominacoes || []).some((x) => x.nome === r.pedido.tipo_documento);
          const fornExiste = (f.fornecedores || []).some((x) => x.id === r.pedido.fornecedor_id);
          setDados({
            data_pedido: r.pedido.data_pedido || "",
            tipo_documento: denomExiste ? r.pedido.tipo_documento : NOVO,
            tipo_novo: denomExiste ? "" : r.pedido.tipo_documento || "",
            numero_cotacao_proforma: r.pedido.numero_cotacao_proforma || "",
            fornecedor_id: fornExiste ? r.pedido.fornecedor_id : NOVO,
            fornecedor_novo: fornExiste ? "" : r.pedido.fornecedor_nome || "",
            solicitante: r.pedido.solicitante || "",
            solicitante_codigo: r.pedido.solicitante_codigo || "",
            observacao_geral: r.pedido.observacao_geral || ""
          });
          const linhas = (r.itens || []).map((it) => {
            seqRef.current += 1;
            return {
              chave: seqRef.current,
              numero_ordem: it.numero_ordem,
              designacao: it.designacao || "",
              quantidade: it.quantidade,
              unidade: it.unidade || "",
              aplicacao: it.aplicacao || "",
              observacao: it.observacao || ""
            };
          });
          setItens(linhas);
          if (!linhas.length) novaLinha();
        } else {
          set("data_pedido", hojeISO());
          novaLinha();
        }
      } catch (e) {
        if (vivo) toast.error((e as Error).message);
      } finally {
        if (vivo) setACarregar(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [idEdicao]);

  /* ---------- Nº sugerido (só em criação) ---------- */

  useEffect(() => {
    if (idEdicao || !dados.data_pedido) return;
    const ano = dados.data_pedido.slice(0, 4);
    let vivo = true;
    pedir<{ sugerido: string }>(`/api/aquisicao/proximo-numero?ano=${ano}`)
      .then((r) => {
        if (vivo) setNumeroSugerido(r.sugerido);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [dados.data_pedido, idEdicao]);

  /* ---------- Seletor de solicitante ---------- */

  const candidatos = useMemo(() => {
    const q = semAcentos(dados.solicitante.trim());
    if (!q) return colaboradores.slice(0, 15);
    return colaboradores
      .filter(
        (c) =>
          semAcentos(c.name).includes(q) || semAcentos(c.code || "").includes(q)
      )
      .slice(0, 15);
  }, [colaboradores, dados.solicitante]);

  useEffect(() => {
    const fecha = () => setAbertaLista(false);
    document.addEventListener("click", fecha);
    return () => document.removeEventListener("click", fecha);
  }, []);

  /* ---------- Gravar ---------- */

  const gravar = async (irImprimir: boolean) => {
    if (travaRef.current) return;
    /* Nome do fornecedor resolvido ANTES do juiz local: quando vem do
       select já está na lista; quando é inline novo, é o nome escrito. */
    const fornecedorNomeLocal =
      dados.fornecedor_id === NOVO
        ? dados.fornecedor_novo.trim()
        : fornecedores.find((f) => f.id === dados.fornecedor_id)?.nome || "";
    const dadosPayload: Partial<DadosPedido> = {
      data_pedido: dados.data_pedido,
      tipo_documento: dados.tipo_documento === NOVO ? dados.tipo_novo : dados.tipo_documento,
      numero_cotacao_proforma: dados.numero_cotacao_proforma,
      fornecedor_id: dados.fornecedor_id === NOVO ? "__inline__" : dados.fornecedor_id,
      fornecedor_nome: fornecedorNomeLocal,
      solicitante: dados.solicitante,
      solicitante_codigo: dados.solicitante_codigo || null,
      observacao_geral: dados.observacao_geral
    };

    const problemaLocal = problemaDoPedido(dadosPayload, itens);
    if (problemaLocal) {
      toast.error(problemaLocal);
      return;
    }
    if (dados.fornecedor_id === NOVO && !dados.fornecedor_novo.trim()) {
      toast.error("Indica o nome do novo fornecedor.");
      return;
    }
    if (dados.tipo_documento === NOVO && !dados.tipo_novo.trim()) {
      toast.error("Indica o nome da nova denominação.");
      return;
    }

    travaRef.current = true;
    setAGravar(true);
    try {
      // Fornecedor: inline novo (o servidor devolve o existente se o
      // nome já constar, em vez de duplicar).
      let fornecedorId = dados.fornecedor_id;
      let fornecedorNome = "";
      if (dados.fornecedor_id === NOVO) {
        const r = await enviar<{ fornecedor: FornecedorAq }>(
          "/api/aquisicao/fornecedores",
          { accao: "criar", dados: { nome: dados.fornecedor_novo } }
        );
        fornecedorId = r.fornecedor.id;
        fornecedorNome = r.fornecedor.nome;
        setFornecedores((atual) =>
          atual.some((f) => f.id === r.fornecedor.id) ? atual : [...atual, r.fornecedor]
        );
      } else {
        fornecedorNome = fornecedores.find((f) => f.id === fornecedorId)?.nome || "";
      }

      // Denominação inline nova.
      let denominacao = dados.tipo_documento;
      if (dados.tipo_documento === NOVO) {
        const r = await enviar<{ denominacao: DenominacaoAq }>(
          "/api/aquisicao/denominacoes",
          { accao: "criar", dados: { nome: dados.tipo_novo } }
        );
        denominacao = r.denominacao.nome;
        setDenominacoes((atual) =>
          atual.some((x) => x.id === r.denominacao.id) ? atual : [...atual, r.denominacao]
        );
      }

      dadosPayload.tipo_documento = denominacao;
      dadosPayload.fornecedor_id = fornecedorId;
      dadosPayload.fornecedor_nome = fornecedorNome;

      const linhas = itensParaGravar(itens);

      if (idEdicao && editando) {
        await enviar(`/api/aquisicao/pedidos/${idEdicao}`, { accao: "editar", dados: dadosPayload, itens: linhas }, undefined, "PATCH");
        toast.success(`Pedido ${numeroFmt(editando.ano, editando.numero)} actualizado.`);
        router.push("/aquisicao/historico");
      } else {
        const r = await enviar<{ pedido: PedidoAquisicao }>(
          "/api/aquisicao/pedidos",
          { accao: "criar", dados: dadosPayload, itens: linhas }
        );
        toast.success(`Pedido ${numeroFmt(r.pedido.ano, r.pedido.numero)} gravado.`);
        if (irImprimir) {
          router.push(`/imprimir/aquisicao/${r.pedido.id}`);
        } else {
          router.push("/aquisicao/historico");
        }
      }
    } catch {
      /* o toast do enviar já saiu */
      travaRef.current = false;
      setAGravar(false);
    }
  };

  const titulo = editando ? `Editar Pedido ${numeroFmt(editando.ano, editando.numero)}` : "Novo Pedido de Aquisição";
  const numeroMostrado = editando
    ? numeroFmt(editando.ano, editando.numero)
    : numeroSugerido;

  if (aCarregar) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" aria-hidden /> A carregar...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Cabeca titulo={titulo} subtitulo="Emitir pedido de aquisição de material com base numa cotação, pro-forma ou venda a dinheiro">
        <div className="rounded-lg bg-emerald-700 px-5 py-3 text-white shadow-md">
          <div className="text-[0.65rem] font-semibold uppercase tracking-wide opacity-85">Nº do Pedido</div>
          <div className="text-lg font-bold">{numeroMostrado}</div>
        </div>
      </Cabeca>

      <Card className="card-sombra">
        <CardContent className="p-4">
          <h2 className="mb-4 border-b-2 border-emerald-600 pb-2 text-base font-bold">Dados do Pedido</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="f-data">Data do Pedido *</label>
              <Input
                id="f-data"
                type="date"
                value={dados.data_pedido}
                onChange={(e) => set("data_pedido", e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="f-tipo">Denominação *</label>
              <select
                id="f-tipo"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
                value={dados.tipo_documento}
                onChange={(e) => set("tipo_documento", e.target.value)}
                required
              >
                <option value="">Seleccionar...</option>
                {(denominacoes || []).filter((d) => d.ativo).map((d) => (
                  <option key={d.id} value={d.nome}>{d.nome}</option>
                ))}
                <option value={NOVO}>+ Nova denominação...</option>
              </select>
              {dados.tipo_documento === NOVO ? (
                <Input
                  className="mt-2"
                  placeholder="Nome da nova denominação"
                  value={dados.tipo_novo}
                  onChange={(e) => set("tipo_novo", e.target.value)}
                />
              ) : null}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="f-num-doc">Nº da Cotação / Pro-forma *</label>
              <Input
                id="f-num-doc"
                value={dados.numero_cotacao_proforma}
                onChange={(e) => set("numero_cotacao_proforma", e.target.value)}
                placeholder="Ex: 13429"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="f-fornecedor">Fornecedor *</label>
              <select
                id="f-fornecedor"
                className="h-9 w-full rounded-md border bg-transparent px-3 text-sm dark:bg-input/30"
                value={dados.fornecedor_id}
                onChange={(e) => set("fornecedor_id", e.target.value)}
                required
              >
                <option value="">Seleccionar fornecedor...</option>
                {(fornecedores || []).filter((f) => f.ativo).map((f) => (
                  <option key={f.id} value={f.id}>{f.nome}</option>
                ))}
                <option value={NOVO}>+ Novo fornecedor...</option>
              </select>
              {dados.fornecedor_id === NOVO ? (
                <Input
                  className="mt-2"
                  placeholder="Nome do novo fornecedor"
                  value={dados.fornecedor_novo}
                  onChange={(e) => set("fornecedor_novo", e.target.value)}
                />
              ) : null}
            </div>

            <div className="relative space-y-1.5">
              <label className="text-sm font-medium" htmlFor="f-solicitante">Solicitante *</label>
              <Input
                id="f-solicitante"
                value={dados.solicitante}
                onChange={(e) => {
                  setDados((d) => ({ ...d, solicitante: e.target.value, solicitante_codigo: "" }));
                  setAbertaLista(true);
                }}
                onFocus={() => setAbertaLista(true)}
                placeholder="Pesquisar por nome ou código..."
                autoComplete="off"
                required
              />
              {abertaLista && candidatos.length > 0 ? (
                <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
                  {candidatos.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                      onClick={() => {
                        setDados((d) => ({
                          ...d,
                          solicitante: c.name,
                          solicitante_codigo: c.code || ""
                        }));
                        setAbertaLista(false);
                      }}
                    >
                      {c.name}
                      {c.code ? <span className="text-muted-foreground"> ({c.code})</span> : null}
                      {c.setor ? <span className="text-muted-foreground"> · {c.setor}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="card-sombra">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-base font-bold">Material Pedido</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => novaLinha()}>
              <Plus className="size-4" aria-hidden /> Adicionar Linha
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-emerald-600 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-10 py-2 pr-2 text-center">Nº</th>
                  <th className="min-w-48 py-2 pr-2">Designação</th>
                  <th className="w-20 py-2 pr-2">Qtd.</th>
                  <th className="w-24 py-2 pr-2">Unidade</th>
                  <th className="min-w-40 py-2 pr-2">Aplicação / Para onde vai</th>
                  <th className="min-w-36 py-2 pr-2">Observação</th>
                  <th className="w-10 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i, idx) => (
                  <tr key={i.chave} className="border-b last:border-0">
                    <td className="py-1.5 pr-2 text-center font-bold text-muted-foreground">{idx + 1}</td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={i.designacao}
                        onChange={(e) => mudaItem(i.chave, "designacao", e.target.value)}
                        placeholder="Ex: Óleo hidráulico 20L"
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={i.quantidade}
                        onChange={(e) => mudaItem(i.chave, "quantidade", e.target.value === "" ? 0 : Number(e.target.value))}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <CampoLista
                        valor={i.unidade}
                        onMuda={(v) => mudaItem(i.chave, "unidade", v)}
                        opcoes={UNIDADES_AQ}
                        placeholder="Un"
                        rotulo={`Unidade da linha ${idx + 1}`}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <CampoLista
                        valor={i.aplicacao}
                        onMuda={(v) => mudaItem(i.chave, "aplicacao", v)}
                        opcoes={aplicacoes}
                        placeholder="Ex: Serralharia"
                        rotulo={`Aplicação da linha ${idx + 1}`}
                      />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input
                        value={i.observacao}
                        onChange={(e) => mudaItem(i.chave, "observacao", e.target.value)}
                      />
                    </td>
                    <td className="py-1.5 text-center">
                      <button
                        type="button"
                        className="rounded p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                        aria-label="Remover linha"
                        onClick={() => removeItem(i.chave)}
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="card-sombra">
        <CardContent className="p-4">
          <label className="text-sm font-medium" htmlFor="f-obs-geral">Observação Geral (opcional)</label>
          <textarea
            id="f-obs-geral"
            className="mt-1.5 min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm dark:bg-input/30"
            value={dados.observacao_geral}
            onChange={(e) => set("observacao_geral", e.target.value)}
            placeholder="Notas adicionais sobre este pedido..."
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-3 pb-2">
        <Button asChild variant="outline">
          <Link href="/aquisicao/historico">Cancelar</Link>
        </Button>
        <Button
          type="button"
          className="bg-emerald-700 hover:bg-emerald-800"
          disabled={aGravar}
          onClick={() => gravar(false)}
        >
          {aGravar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Gravar Pedido
        </Button>
        <Button
          type="button"
          variant="outline"
          className="border-amber-500 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950"
          disabled={aGravar}
          onClick={() => gravar(true)}
        >
          {aGravar ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null} Gravar e Imprimir
        </Button>
      </div>
    </div>
  );
}
