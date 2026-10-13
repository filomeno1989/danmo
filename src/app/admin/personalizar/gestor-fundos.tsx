"use client";

/**
 * GestorFundos - Gestão das 4 fotos do slideshow do login (client).
 *
 * Fluxo por posição:
 * 1. Escolher a imagem no aparelho (ou arrastar para a zona);
 * 2. O navegador comprime (máx. 1920px, JPEG) e mostra a pré-visualização;
 * 3. A administração escreve a chave de administração e grava;
 * 4. A foto passa a aparecer no login de todos, sem mexer no código.
 *
 * Tudo validado de novo no servidor (sessão de admin + chave).
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  ImagePlus,
  LoaderCircle,
  Save,
  Trash2,
  RefreshCcw,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import type { FundoLogin } from "@/lib/uso-comum";

const POSICOES = [1, 2, 3, 4];

/** Comprime a imagem no navegador: máx. 1920px no lado maior, JPEG 0.8. */
async function comprimir(ficheiro: File): Promise<{ dataUrl: string; nome: string }> {
  if (!ficheiro.type.startsWith("image/")) {
    throw new Error("Escolhe um ficheiro de imagem (JPG, PNG, WebP).");
  }
  const bitmap = await createImageBitmap(ficheiro);
  const maxLado = 1920;
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const tela = document.createElement("canvas");
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext("2d");
  if (!ctx) throw new Error("O navegador não conseguiu processar a imagem.");
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close();

  const dataUrl = tela.toDataURL("image/jpeg", 0.8);
  return { dataUrl, nome: ficheiro.name };
}

export function GestorFundos() {
  const [fundos, setFundos] = useState<FundoLogin[]>([]);
  const [novas, setNovas] = useState<Record<number, { foto: string; nome: string }>>({});
  const [chave, setChave] = useState("");
  const [aGravar, setAGravar] = useState(false);
  const [aCarregar, setACarregar] = useState(true);
  const refsInput = useRef<Record<number, HTMLInputElement | null>>({});

  async function carregar() {
    setACarregar(true);
    try {
      const r = await fetch("/api/portal/fundos");
      const d = await r.json();
      if (d?.ok) setFundos(d.fundos || []);
    } catch {
      toast.error("Não foi possível carregar as fotos actuais.");
    } finally {
      setACarregar(false);
    }
  }

  // Carga inicial: estado inicial já é "a carregar", por isso o efeito
  // só busca os dados e actualiza quando o servidor responde.
  useEffect(() => {
    let vivo = true;
    fetch("/api/portal/fundos")
      .then((r) => r.json())
      .then((d) => {
        if (vivo && d?.ok) setFundos(d.fundos || []);
      })
      .catch(() => {})
      .finally(() => {
        if (vivo) setACarregar(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  function fundoNaPosicao(p: number): FundoLogin | undefined {
    return fundos.find((f) => f.posicao === p);
  }

  async function escolherFicheiro(p: number, ficheiro: File | undefined) {
    if (!ficheiro) return;
    try {
      const { dataUrl, nome } = await comprimir(ficheiro);
      setNovas((n) => ({ ...n, [p]: { foto: dataUrl, nome } }));
      toast.info(`Foto pronta na posição ${p}. Escreve a chave e grava.`);
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível processar a imagem.");
    }
  }

  async function gravar(p: number) {
    const nova = novas[p];
    if (!nova) return;
    if (!chave) {
      toast.error("Escreve a chave de administração para gravar.");
      return;
    }
    setAGravar(true);
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
        toast.error(d.erro || "Não foi possível gravar a foto.");
        return;
      }
      toast.success(`Foto da posição ${p} gravada. O login já a usa.`);
      setNovas((n) => {
        const copia = { ...n };
        delete copia[p];
        return copia;
      });
      await carregar();
    } catch {
      toast.error("Sem ligação ao servidor. Tenta de novo.");
    } finally {
      setAGravar(false);
    }
  }

  async function apagar(p: number) {
    if (!chave) {
      toast.error("Escreve a chave de administração para apagar.");
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
      <Card className="card-sombra">
        <CardContent className="space-y-1.5">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Info className="size-4 text-info" aria-hidden />
            Como funciona
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Escolhe até 4 fotos (o sistema comprime-as automaticamente), vê a
            pré-visualização e grava com a chave de administração - a mesma
            chave que usas no hub. As fotos trocam sozinhas no login, cada 7
            segundos, com transição suave.
          </p>
        </CardContent>
      </Card>

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
                      Nova (por gravar)
                    </span>
                  )}
                </div>

                <div
                  className="relative flex aspect-[16/9] cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-input bg-muted/50 transition-colors hover:bg-muted"
                  onClick={() => refsInput.current[p]?.click()}
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
                      <span className="text-sm font-medium">Escolher foto</span>
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
                  <Button
                    size="sm"
                    disabled={!nova || aGravar}
                    onClick={() => gravar(p)}
                    className="flex-1 bg-ambar text-[#101b2d] font-bold hover:bg-ambar-hover"
                  >
                    {aGravar ? (
                      <LoaderCircle className="animate-spin" aria-hidden />
                    ) : (
                      <Save aria-hidden />
                    )}
                    Gravar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!actual || aGravar || Boolean(nova)}
                    onClick={() => apagar(p)}
                    className="text-erro hover:text-erro"
                    title="Apagar a foto desta posição"
                  >
                    <Trash2 aria-hidden />
                    Apagar
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="card-sombra">
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="chave-admin">Chave de administração</Label>
            <PasswordInput
              id="chave-admin"
              value={chave}
              onChange={setChave}
              placeholder="A chave que usas no hub"
              autoComplete="current-password"
            />
            <p className="text-xs text-muted-foreground">
              Pedida em cada gravação, como no hub. Não fica guardada no
              navegador.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={carregar} disabled={aCarregar}>
            {aCarregar ? (
              <LoaderCircle className="animate-spin" aria-hidden />
            ) : (
              <RefreshCcw aria-hidden />
            )}
            Recarregar as fotos
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
