"use client";

/**
 * Login do portal Danmo (nova geração).
 *
 * Visual igual ao do hub (card sobre fundo navy, logo, tema claro/escuro),
 * agora com a validação a correr no servidor: as chaves da base de dados
 * nunca chegam a este ecrã.
 *
 * Fluxos:
 * - Entrar com codigo (ex.: DM0069) + senha;
 * - Primeiro acesso com senha temporaria: o sistema pede para trocar
 *   a senha antes de continuar;
 * - Mensagens de motivo (sessao expirada, acesso por mudanca de senha...).
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { Sun, Moon, LoaderCircle, ShieldCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type Etapa = "entrar" | "trocar" | "trocada";

export default function PaginaLogin() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#101b2d]" />}>
      <LoginConteudo />
    </Suspense>
  );
}

function LoginConteudo() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const params = useSearchParams();

  // Mensagens vindas do endereço (redireccionamentos do guard no servidor)
  const motivo = params.get("motivo");
  const forcarTroca = params.get("trocar") === "1";
  const avisoDoUrl = forcarTroca
    ? "Por segurança, tens de trocar a senha antes de continuar."
    : motivo === "expirada"
      ? "A tua sessão expirou. Entra de novo, por favor."
      : motivo === "trocada"
        ? "Senha trocada com sucesso. Entra com a nova senha."
        : motivo
          ? "Entra para acederes ao portal."
          : "";

  const [etapaManual, setEtapaManual] = useState<Etapa>("entrar");
  const etapa: Etapa = forcarTroca ? "trocar" : etapaManual;
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [aEntrar, setAEntrar] = useState(false);
  const [erro, setErro] = useState("");
  const [avisoManual, setAvisoManual] = useState("");
  const aviso = avisoManual || avisoDoUrl;

  // Troca de senha
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [senhaConfirmar, setSenhaConfirmar] = useState("");
  const [aTrocar, setATrocar] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setAvisoManual("");
    if (!codigo.trim() || !senha) {
      setErro("Escreve o teu código e a senha.");
      return;
    }
    setAEntrar(true);
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, senha })
      });
      const dados = await r.json();
      if (!r.ok || !dados.ok) {
        setErro(dados.erro || "Não foi possível entrar. Tenta de novo.");
        setAEntrar(false);
        return;
      }
      if (dados.precisa_trocar) {
        setEtapaManual("trocar");
        setAvisoManual("Por segurança, tens de trocar a senha antes de continuar.");
        setAEntrar(false);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setErro("Sem ligação ao servidor. Verifica a internet e tenta de novo.");
      setAEntrar(false);
    }
  }

  async function trocar(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (!senhaAtual || !senhaNova || !senhaConfirmar) {
      setErro("Preenche os três campos, por favor.");
      return;
    }
    if (senhaNova !== senhaConfirmar) {
      setErro("A confirmação não coincide com a nova senha.");
      return;
    }
    if (senhaNova.length < 6) {
      setErro("A nova senha precisa de ter pelo menos 6 caracteres.");
      return;
    }
    setATrocar(true);
    try {
      const r = await fetch("/api/auth/trocar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atual: senhaAtual, nova: senhaNova })
      });
      const dados = await r.json();
      if (!r.ok || !dados.ok) {
        setErro(dados.erro || "Não foi possível trocar a senha.");
        setATrocar(false);
        return;
      }
      setEtapaManual("trocada");
    } catch {
      setErro("Sem ligação ao servidor. Verifica a internet e tenta de novo.");
      setATrocar(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#101b2d] p-5">
      {/* Círculos decorativos, como no hub */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[40%] -right-[20%] h-[600px] w-[600px] rounded-full bg-[rgba(0,150,57,0.08)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[30%] -left-[10%] h-[500px] w-[500px] rounded-full bg-[rgba(245,158,11,0.06)]"
      />

      <Button
        variant="outline"
        size="icon"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        aria-label="Alternar tema"
        title="Alternar modo claro / escuro"
        className="absolute top-4 right-4 z-10 size-10 rounded-full border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
      >
        <Sun className="hidden dark:block" aria-hidden />
        <Moon className="dark:hidden" aria-hidden />
      </Button>

      <Card className="relative z-1 w-full max-w-[400px] rounded-2xl border-border/60 shadow-2xl">
        <CardContent className="px-7 py-9 sm:px-9">
          <div className="mb-7 text-center">
            <Image
              src="/logos/danmo-logo.png"
              alt="Danmo Service System"
              width={140}
              height={56}
              priority
              className="mx-auto mb-3 h-14 w-auto object-contain"
            />
            <h1 className="text-xl font-bold">Danmo Service System, Lda</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Portal interno - acesso dos colaboradores
            </p>
          </div>

          {aviso && (
            <div
              role="status"
              className="mb-4 rounded-lg border border-info/30 bg-info-bg px-3.5 py-2.5 text-sm text-info"
            >
              {aviso}
            </div>
          )}
          {erro && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-erro/30 bg-erro-bg px-3.5 py-2.5 text-sm text-erro"
            >
              {erro}
            </div>
          )}

          {etapa === "entrar" && (
            <form onSubmit={entrar} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="codigo">Código de utilizador</Label>
                <Input
                  id="codigo"
                  name="codigo"
                  autoComplete="username"
                  autoCapitalize="characters"
                  placeholder="Ex.: DM0069"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  name="senha"
                  type="password"
                  autoComplete="current-password"
                  placeholder="A tua senha"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={aEntrar}
                className="h-11 w-full bg-ambar text-[#101b2d] font-bold hover:bg-ambar-hover"
              >
                {aEntrar ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden />
                    A entrar...
                  </>
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>
          )}

          {etapa === "trocar" && (
            <form onSubmit={trocar} className="space-y-4">
              <div>
                <p className="text-[1.05rem] font-bold">Define a tua nova senha</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Por segurança, tens de trocar a senha antes de continuar.
                </p>
              </div>
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="senha-atual">Senha atual (temporária)</Label>
                <Input
                  id="senha-atual"
                  type="password"
                  autoComplete="current-password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha-nova">Nova senha</Label>
                <Input
                  id="senha-nova"
                  type="password"
                  autoComplete="new-password"
                  value={senhaNova}
                  onChange={(e) => setSenhaNova(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha-confirmar">Confirmar nova senha</Label>
                <Input
                  id="senha-confirmar"
                  type="password"
                  autoComplete="new-password"
                  value={senhaConfirmar}
                  onChange={(e) => setSenhaConfirmar(e.target.value)}
                  className="h-11"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={aTrocar}
                className="h-11 w-full bg-ambar text-[#101b2d] font-bold hover:bg-ambar-hover"
              >
                {aTrocar ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden />
                    A trocar...
                  </>
                ) : (
                  "Trocar senha e continuar"
                )}
              </Button>
            </form>
          )}

          {etapa === "trocada" && (
            <div className="space-y-5 text-center">
              <ShieldCheck className="mx-auto size-12 text-sucesso" aria-hidden />
              <div>
                <p className="text-[1.05rem] font-bold">Senha trocada com sucesso</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Entra agora com a tua nova senha.
                </p>
              </div>
              <Button
                onClick={() => {
                  setEtapaManual("entrar");
                  setSenha("");
                  setSenhaAtual("");
                  setSenhaNova("");
                  setSenhaConfirmar("");
                  setAvisoManual("");
                  setErro("");
                }}
                className="h-11 w-full bg-ambar text-[#101b2d] font-bold hover:bg-ambar-hover"
              >
                Voltar ao início de sessão
              </Button>
            </div>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Dificuldade em entrar? Fala com a administração.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
