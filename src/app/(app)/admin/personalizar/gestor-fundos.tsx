"use client";

/**
 * GestorFundos - Gestão das 4 fotos do slideshow do login (client).
 *
 * Fluxo pensado para quem usa uma vez por mês (sem treino):
 * 1. Escrever a CHAVE DE ADMINISTRAÇÃO no campo do topo;
 * 2. Clicar ou ARRASTAR as fotos para as posições (o navegador comprime);
 * 3. Clicar no botão grande "Gravar alterações" que aparece FIXO no fundo
 *    do ecrã - grava todas as fotos escolhidas de uma só vez.
 *
 * Lição da ronda anterior: havia um botão "Recarregar as fotos" que só
 * refrescava a lista, e parecia (para qualquer pessoa) o passo final.
 * Resultado: chave + foto + clicar nele = nada acontecia. Agora existe
 * UM único botão de gravação, impossível de confundir, e o botão de
 * refrescar saiu (a lista carrega sozinha e refresca após cada gravação).
 *
 * Tudo validado de novo no servidor (sessão de admin + chave).
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ImagePlus,
  LoaderCircle,
  Save,
  Trash2,
  Undo2,
  Info,
  KeyRound
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import type { FundoLogin } from "@/lib/uso-comum";

const POSICOES = [1, 2, 3, 4];

/** Limite no cliente: o servidor recusa fotos acima de 700.000 caracteres. */
const LIMITE_FOTO = 690_000;

/**
 * Compressão progressiva: tenta do melhor para o mais leve. Uma foto de
 * telemóvel com muito detalhe pode passar do limite na primeira tentativa
 * (1920px/0.8); em vez de a recusar, o sistema desce a qualidade até caber.
 */
const TENTATIVAS = [
  { lado: 1920, qualidade: 0.8 },
  { lado: 1600, qualidade: 0.7 },
  { lado: 1280, qualidade: 0.6 },
  { lado: 1024, qualidade: 0.5 },
  { lado: 820, qualidade: 0.45 }
];

type FonteImagem = {
  desenho: CanvasImageSource;
  largura: number;
  altura: number;
  limpar: () => void;
};

/** Carrega a imagem com createImageBitmap; se o navegador não tiver, usa <img>. */
async function carregarImagem(ficheiro: File): Promise<FonteImagem> {
  try {
    const bitmap = await createImageBitmap(ficheiro);
    return {
      desenho: bitmap,
      largura: bitmap.width,
      altura: bitmap.height,
      limpar: () => bitmap.close()
    };
  } catch {
    const url = URL.createObjectURL(ficheiro);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => {
        URL.revokeObjectURL(url);
        rej(new Error("O navegador não conseguiu ler a imagem."));
      };
      i.src = url;
    });
    return {
      desenho: img,
      largura: img.naturalWidth,
      altura: img.naturalHeight,
      limpar: () => URL.revokeObjectURL(url)
    };
  }
}

/** Comprime no navegador (JPEG com fundo branco) e devolve o data URL. */
async function comprimir(ficheiro: File): Promise<string> {
  if (!ficheiro.type.startsWith("image/")) {
    throw new Error("Escolhe um ficheiro de imagem (JPG, PNG, WebP).");
  }
  const fonte = await carregarImagem(ficheiro);
  try {
    let ultimo = "";
    for (const t of TENTATIVAS) {
      const escala = Math.min(1, t.lado / Math.max(fonte.largura, fonte.altura));
      const tela = document.createElement("canvas");
      tela.width = Math.max(1, Math.round(fonte.largura * escala));
      tela.height = Math.max(1, Math.round(fonte.altura * escala));
      const ctx = tela.getContext("2d");
      if (!ctx) throw new Error("O navegador não conseguiu processar a imagem.");
      // Fundo branco: PNG transparente não fica preto ao virar JPEG
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, tela.width, tela.height);
      ctx.drawImage(fonte.desenho, 0, 0, tela.width, tela.height);
      ultimo = tela.toDataURL("image/jpeg", t.qualidade);
      if (ultimo.length <= LIMITE_FOTO) return ultimo;
    }
    return ultimo;
  } finally {
    fonte.limpar();
  }
}

export function GestorFundos() {
  const [fundos, setFundos] = useState<FundoLogin[]>([]);
  const [novas, setNovas] = useState<Record<number, { foto: string; nome: string }>>({});
  const [chave, setChave] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [aCarregar, setACarregar] = useState(true);
  const refsInput = useRef<Record<number, HTMLInputElement | null>>({});
  const refChave = useRef<HTMLDivElement | null>(null);

  const pendentes = POSICOES.filter((p) => novas[p]);

  function focarChave() {
    refChave.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    refChave.current?.querySelector("input")?.focus();
  }

  // Sem cache do navegador: se a administração gravou há um segundo,
  // a lista tem de mostrar já (era uma das causas de "não carregam").
  useEffect(() => {
    let vivo = true;
    fetch("/api/portal/fundos", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (vivo && d?.ok) setFundos(d.fundos || []);
      })
      .catch(() => {
        if (vivo) toast.error("Não foi possível carregar as fotos actuais.");
      })
      .finally(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function carregar() {
    try {
      const r = await fetch("/api/portal/fundos", { cache: "no-store" });
      const d = await r.json();
      if (d?.ok) setFundos(d.fundos || []);
    } catch {
      toast.error("Não foi possível actualizar a lista.");
    }
  }

  function fundoNaPosicao(p: number): FundoLogin | undefined {
    return fundos.find((f) => f.posicao === p);
  }

  async function escolherFicheiro(p: number, ficheiro: File | undefined) {
    if (!ficheiro) return;
    try {
      const foto = await comprimir(ficheiro);
      setNovas((n) => ({ ...n, [p]: { foto, nome: ficheiro.name } }));
      if (!chave) {
        toast.info("Foto pronta. Escreve a chave de administração no topo e clica em Gravar alterações.");
      }
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível processar a imagem.");
    }
  }

  function desfazer(p: number) {
    setNovas((n) => {
      const copia = { ...n };
      delete copia[p];
      return copia;
    });
  }

  /** Grava TODAS as fotos pendentes, uma a uma, com aviso por cada falha. */
  async function gravarTudo() {
    if (aGravar || pendentes.length === 0) return;
    if (!chave) {
      toast.error("Falta a chave de administração. Olha para o topo desta página.");
      focarChave();
      return;
    }
    setAGravar(true);
    const alvo = [...pendentes];
    let gravadas = 0;
    for (const p of alvo) {
      const nova = novas[p];
      if (!nova) continue;
      try {
        const r = await fetch("/api/portal/fundos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "guardar",
            posicao: p,
            foto: nova.foto,
            nome: nova.nome,
            chave
          })
        });
        const d = await r.json();
        if (!r.ok || !d.ok) {
          toast.error(`Posição ${p}: ${d.erro || "não foi possível gravar."}`);
          continue;
        }
        gravadas++;
        setNovas((n) => {
          const copia = { ...n };
          delete copia[p];
          return copia;
        });
      } catch {
        toast.error(`Posição ${p}: sem ligação ao servidor.`);
      }
    }
    setAGravar(false);
    if (gravadas > 0) {
      toast.success(
        gravadas === 1
          ? "Foto gravada. O ecrã de entrada já a usa."
          : `${gravadas} fotos gravadas. O ecrã de entrada já as usa.`
      );
      await carregar();
    }
  }

  async function apagar(p: number) {
    if (!chave) {
      toast.error("Falta a chave de administração. Olha para o topo desta página.");
      focarChave();
      return;
    }
    setAGravar(true);
    try {
      const r = await fetch("/api/portal/fundos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apagar", posicao: p, chave })
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        toast.error(d.erro || "Não foi possível apagar a foto.");
        return;
      }
      toast.success(`Foto da posição ${p} apagada.`);
      await carregar();
    } catch {
      toast.error("Sem ligação ao servidor. Tenta de novo.");
    } finally {
      setAGravar(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* ===== CHAVE PRIMEIRO: sem ela nada grava, por isso vem à frente ===== */}
      <Card className="card-sombra border-ambar/40" ref={refChave}>
        <CardContent className="space-y-2">
          <Label htmlFor="chave-admin" className="flex items-center gap-2 text-sm">
            <KeyRound className="size-4 text-ambar" aria-hidden />
            Chave de administração <span className="text-erro">*</span>
          </Label>
          <div className="max-w-sm">
            <PasswordInput
              id="chave-admin"
              value={chave}
              onChange={setChave}
              placeholder="Chave de gestão do portal"
              autoComplete="current-password"
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            A mesma chave de gestão usada nas acções sensíveis do hub.{" "}
            <span className="font-semibold text-foreground/80">
              Não é a tua senha de entrada.
            </span>{" "}
            Depois de escolher as fotos, clica no botão{" "}
            <span className="font-semibold text-foreground/80">Gravar alterações</span> que
            aparece no fundo do ecrã. Não fica guardada no navegador.
          </p>
        </CardContent>
      </Card>

      {/* ===== As 4 posições ===== */}
      <div className="grid gap-4 sm:grid-cols-2">
        {POSICOES.map((p) => {
          const actual = fundoNaPosicao(p);
          const nova = novas[p];
          const preview = nova?.foto || actual?.foto || "";
          const nomeArquivo = nova?.nome || actual?.nome || "";
          return (
            <Card key={p} className="card-sombra gap-3">
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Posição {p}</p>
                  {actual && !nova && (
                    <span className="rounded-full bg-sucesso-bg px-2 py-0.5 text-[0.68rem] font-semibold text-sucesso">
                      Em uso
                    </span>
                  )}
                  {nova && (
                    <span className="rounded-full bg-ambar-claro px-2 py-0.5 text-[0.68rem] font-semibold text-ambar-texto">
                      Pronta a gravar
                    </span>
                  )}
                </div>

                <div
                  className="relative flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-input bg-muted/50 transition-colors hover:bg-muted"
                  onClick={() => refsInput.current[p]?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    escolherFicheiro(p, e.dataTransfer.files?.[0]);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") refsInput.current[p]?.click();
                  }}
                  aria-label={`Escolher foto da posição ${p}`}
                >
                  {preview ? (
                    <>
                      {/* next/image não serve para data URLs dinâmicas: usa <img> */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={preview}
                        alt={nomeArquivo || `Foto da posição ${p}`}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/45 text-sm font-semibold text-white opacity-0 transition-opacity hover:opacity-100">
                        Trocar foto
                      </span>
                    </>
                  ) : (
                    <span className="flex flex-col items-center gap-1.5 px-4 text-center text-muted-foreground">
                      <ImagePlus className="size-7" aria-hidden />
                      <span className="text-sm font-medium">Clicar ou arrastar a foto</span>
                      <span className="text-xs">JPG, PNG ou WebP</span>
                    </span>
                  )}
                  <input
                    ref={(el) => {
                      refsInput.current[p] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => escolherFicheiro(p, e.target.files?.[0])}
                  />
                </div>

                {nova && (
                  <p className="truncate text-xs text-muted-foreground" title={nova.nome}>
                    {nova.nome}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  {nova ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={aGravar}
                      onClick={() => desfazer(p)}
                      className="flex-1"
                    >
                      <Undo2 aria-hidden />
                      Desfazer
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!actual || aGravar || aCarregar}
                      onClick={() => apagar(p)}
                      className="flex-1 text-erro hover:text-erro"
                      title="Apagar a foto desta posição"
                    >
                      <Trash2 aria-hidden />
                      Apagar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ===== Como funciona ===== */}
      <Card className="card-sombra">
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            <p className="text-sm leading-relaxed text-muted-foreground">
              As fotos trocam sozinhas no ecrã de entrada, cada 7 segundos, com
              transição suave. O sistema comprime cada foto antes de a enviar,
              para o portal continuar leve mesmo em redes fracas.
            </p>
          </div>
          <div className="flex items-start gap-2.5">
            <Save className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
            <p className="text-sm leading-relaxed text-muted-foreground">
              Como gravar: escreve a chave no topo, escolhe as fotos nas
              posições e clica em{" "}
              <span className="font-semibold text-foreground/80">Gravar alterações</span>, o
              botão fixo no fundo do ecrã. Podes gravar várias fotos de uma só
              vez.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ===== BARRA FIXA DE GRAVAÇÃO: aparece só quando há fotos por gravar ===== */}
      {pendentes.length > 0 && (
        <div className="sticky bottom-3 z-20 rounded-2xl border border-ambar/60 bg-card/95 p-3 shadow-xl shadow-black/10 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold">
                {pendentes.length === 1
                  ? "1 foto pronta a gravar"
                  : `${pendentes.length} fotos prontas a gravar`}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {chave
                  ? `Posição ${pendentes.join(", posição ")} - clica no botão ao lado para guardar.`
                  : "Falta escrever a chave de administração no topo."}
              </p>
            </div>
            <Button
              size="lg"
              onClick={gravarTudo}
              disabled={aGravar}
              className="bg-ambar font-bold text-[#101b2d] hover:bg-ambar-hover"
            >
              {aGravar ? (
                <LoaderCircle className="animate-spin" aria-hidden />
              ) : (
                <Save aria-hidden />
              )}
              Gravar alterações
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
