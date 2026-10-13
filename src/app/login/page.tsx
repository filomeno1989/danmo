"use client";

/**
 * Login do portal Danmo (nova geração).
 *
 * Visual: fundo com slideshow discreto de fotos da empresa (carregadas
 * pela administração no portal) sobre um véu escuro; sem fotos, fundo
 * de gradiente da marca. O cartão fica sempre legível.
 *
 * Fluxos:
 * - Entrar com código (ex.: DM0069) + senha;
 * - Auto-registo: o colega escreve o código de colaborador, o sistema
 *   busca nome, área e contacto na base, e ele só define a senha (com
 *   botão de olho para ver / ocultar). A conta nasce com acesso só ao
 *   Painel Principal até a administração dar os restantes acessos;
 * - Primeiro acesso com senha temporária: pede para trocar a senha;
 * - Mensagens de motivo (sessão expirada, troca de senha...).
 *
 * Validação no servidor: as chaves da base nunca chegam a este ecrã.
 */

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  Sun,
  Moon,
  LoaderCircle,
  ShieldCheck,
  ArrowLeft,
  BadgeCheck,
  UserRoundSearch
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PasswordInput } from "@/components/ui/password-input";
import type { FundoLogin } from "@/lib/uso-comum";

type Etapa = "entrar" | "registo_codigo" | "registo_dados" | "trocar" | "trocada";
type DadosRegisto = {
  nome: string;
  departamento: string;
  categoria: string;
  contacto: string;
};

export default function PaginaLogin() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#101b2d]" />}>
      <LoginConteudo />
    </Suspense>
  );
}

/* ============ Slideshow do fundo ============ */

function FundoSlideshow() {
  const [fundos, setFundos] = useState<FundoLogin[]>([]);
  const [actual, setActual] = useState(0);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/portal/fundos")
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        if (d?.ok && Array.isArray(d.fundos) && d.fundos.length > 0) {
          setFundos(d.fundos.slice(0, 4));
        }
        setPronto(true);
      })
      .catch(() => vivo && setPronto(true));
    return () => {
      vivo = false;
    };
  }, []);

  // Troca de foto cada 7 segundos (só com mais de uma foto)
  useEffect(() => {
    if (fundos.length < 2) return;
    const t = setInterval(() => setActual((a) => (a + 1) % fundos.length), 7000);
    return () => clearInterval(t);
  }, [fundos.length]);

  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden">
      {fundos.map((f, i) => (
        <div
          key={f.posicao}
          className={"capa-fundo" + (pronto && i === actual ? " visivel" : "")}
          style={{ backgroundImage: `url("${f.foto}")` }}
        />
      ))}
      {fundos.length > 0 && <div className="veu-fundo" />}
    </div>
  );
}

/* ============ Conteúdo do login ============ */

function LoginConteudo() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const params = useSearchParams();

  // Mensagens vindas do endereço (redireccionamentos do guard no
  // servidor). Só avisos com informação real: o motivo genérico de
  // redireccionamento não aparece (evita repetir o óbvio a todos).
  const motivo = params.get("motivo");
  const forcarTroca = params.get("trocar") === "1";
  const avisoDoUrl = forcarTroca
    ? "Por segurança, tens de trocar a senha antes de continuar."
    : motivo === "expirada"
      ? "A tua sessão expirou. Entra de novo, por favor."
      : motivo === "trocada"
        ? "Senha trocada com sucesso. Entra com a nova senha."
        : "";

  const [etapaManual, setEtapaManual] = useState<Etapa>("entrar");
  const etapa: Etapa = forcarTroca ? "trocar" : etapaManual;
  const [erro, setErro] = useState("");
  const [avisoManual, setAvisoManual] = useState("");
  const aviso = avisoManual || avisoDoUrl;

  // Entrar
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [aEntrar, setAEntrar] = useState(false);

  // Registo
  const [regCodigo, setRegCodigo] = useState("");
  const [dadosRegisto, setDadosRegisto] = useState<DadosRegisto | null>(null);
  const [regSenha, setRegSenha] = useState("");
  const [regConfirmar, setRegConfirmar] = useState("");
  const [aVerificar, setAVerificar] = useState(false);
  const [aCriar, setACriar] = useState(false);
  const [regFeito, setRegFeito] = useState(false);

  // Troca de senha
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senhaNova, setSenhaNova] = useState("");
  const [senhaConfirmar, setSenhaConfirmar] = useState("");
  const [aTrocar, setATrocar] = useState(false);

  const refCodigo = useRef<HTMLInputElement>(null);
  const refRegCodigo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (etapa === "entrar") refCodigo.current?.focus();
    if (etapa === "registo_codigo") refRegCodigo.current?.focus();
  }, [etapa]);

  function limparMensagens() {
    setErro("");
    setAvisoManual("");
  }

  function voltarAoEntrar() {
    limparMensagens();
    setEtapaManual("entrar");
    setDadosRegisto(null);
    setRegSenha("");
    setRegConfirmar("");
  }

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    limparMensagens();
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

  async function verificarCodigo(e: React.FormEvent) {
    e.preventDefault();
    limparMensagens();
    if (!regCodigo.trim()) {
      setErro("Escreve o teu código de colaborador.");
      return;
    }
    setAVerificar(true);
    try {
      const r = await fetch("/api/auth/registo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verificar", codigo: regCodigo })
      });
      const dados = await r.json();
      if (!r.ok || !dados.ok) {
        setErro(dados.erro || "Não foi possível verificar o código.");
        setAVerificar(false);
        return;
      }
      setDadosRegisto(dados.dados);
      limparMensagens();
      setEtapaManual("registo_dados");
    } catch {
      setErro("Sem ligação ao servidor. Verifica a internet e tenta de novo.");
    } finally {
      setAVerificar(false);
    }
  }

  async function criarAcesso(e: React.FormEvent) {
    e.preventDefault();
    limparMensagens();
    if (!regSenha || !regConfirmar) {
      setErro("Preenche a senha e a confirmação.");
      return;
    }
    if (regSenha.length < 6) {
      setErro("A senha precisa de ter pelo menos 6 caracteres.");
      return;
    }
    if (regSenha !== regConfirmar) {
      setErro("A confirmação não coincide com a senha.");
      return;
    }
    setACriar(true);
    try {
      const r = await fetch("/api/auth/registo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "criar",
          codigo: regCodigo,
          senha: regSenha
        })
      });
      const dados = await r.json();
      if (!r.ok || !dados.ok) {
        setErro(dados.erro || "Não foi possível criar o acesso.");
        setACriar(false);
        return;
      }
      limparMensagens();
      setRegFeito(true);
    } catch {
      setErro("Sem ligação ao servidor. Verifica a internet e tenta de novo.");
      setACriar(false);
    }
  }

  async function trocar(e: React.FormEvent) {
    e.preventDefault();
    limparMensagens();
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
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden p-5"
      style={{ background: "var(--fundo-login)" }}
    >
      {/* Fotos da empresa (slideshow discreto) ou gradiente da marca */}
      <FundoSlideshow />

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

      <Card className="card-sombra relative z-1 w-full max-w-[430px] rounded-2xl border-border/60 shadow-2xl">
        <CardContent className="entrada-suave px-7 py-9 sm:px-9">
          <div className="mb-7 text-center">
            <Image
              src="/logos/danmo-logo.png"
              alt="Danmo Service System"
              width={140}
              height={56}
              priority
              className="mx-auto mb-3 h-14 w-auto object-contain"
            />
            <h1 className="text-lg font-bold">Danmo Service System, Lda</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Portal interno dos colaboradores
            </p>
          </div>

          {aviso && etapa !== "registo_dados" && (
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
            <>
              <form onSubmit={entrar} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="codigo">Código de utilizador</Label>
                  <Input
                    id="codigo"
                    ref={refCodigo}
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
                  <PasswordInput
                    id="senha"
                    value={senha}
                    onChange={setSenha}
                    placeholder="A tua senha"
                    autoComplete="current-password"
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

              <div className="mt-5 text-center">
                <button
                  type="button"
                  onClick={() => {
                    limparMensagens();
                    setEtapaManual("registo_codigo");
                  }}
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-primario transition-colors hover:text-primario/80"
                >
                  <UserRoundSearch className="size-4" aria-hidden />
                  É a primeira vez? Criar o meu acesso
                </button>
              </div>
            </>
          )}

          {etapa === "registo_codigo" && (
            <form onSubmit={verificarCodigo} className="space-y-4">
              <div>
                <p className="text-[1.05rem] font-bold">Criar o meu acesso</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Escreve o teu código de colaborador e o sistema vai buscar
                  os teus dados automaticamente.
                </p>
              </div>
              <Separator />
              <div className="space-y-1.5">
                <Label htmlFor="reg-codigo">Código de colaborador</Label>
                <Input
                  id="reg-codigo"
                  ref={refRegCodigo}
                  autoComplete="off"
                  autoCapitalize="characters"
                  placeholder="Ex.: DM0069"
                  value={regCodigo}
                  onChange={(e) => setRegCodigo(e.target.value)}
                  className="h-11 uppercase"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={aVerificar}
                className="h-11 w-full bg-ambar text-[#101b2d] font-bold hover:bg-ambar-hover"
              >
                {aVerificar ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden />
                    A verificar...
                  </>
                ) : (
                  "Continuar"
                )}
              </Button>
              <button
                type="button"
                onClick={voltarAoEntrar}
                className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Voltar ao início de sessão
              </button>
            </form>
          )}

          {etapa === "registo_dados" && regFeito && (
            <div className="space-y-5 text-center">
              <BadgeCheck className="mx-auto size-12 text-sucesso" aria-hidden />
              <div>
                <p className="text-[1.05rem] font-bold">Acesso criado com sucesso</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Já podes entrar com o teu código e a senha que escolheste.
                  Os módulos aparecem conforme os acessos que a administração
                  te der.
                </p>
              </div>
              <Button
                onClick={() => {
                  setRegFeito(false);
                  setRegCodigo("");
                  voltarAoEntrar();
                }}
                className="h-11 w-full bg-ambar text-[#101b2d] font-bold hover:bg-ambar-hover"
              >
                Entrar agora
              </Button>
            </div>
          )}

          {etapa === "registo_dados" && !regFeito && dadosRegisto && (
            <form onSubmit={criarAcesso} className="space-y-4">
              <div>
                <p className="text-[1.05rem] font-bold">Confirma os teus dados</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Encontrámos estes dados na base de colaboradores. Se algo
                  estiver errado, fala com a administração antes de continuar.
                </p>
              </div>
              <Separator />
              <dl className="space-y-2.5 rounded-xl bg-muted/60 p-4 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">Nome</dt>
                  <dd className="min-w-0 text-right font-semibold">
                    {dadosRegisto.nome}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">Área</dt>
                  <dd className="min-w-0 text-right font-semibold">
                    {dadosRegisto.departamento || "-"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">Função</dt>
                  <dd className="min-w-0 text-right font-semibold">
                    {dadosRegisto.categoria || "-"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">Contacto</dt>
                  <dd className="min-w-0 text-right font-semibold">
                    {dadosRegisto.contacto || "-"}
                  </dd>
                </div>
              </dl>
              <div className="space-y-1.5">
                <Label htmlFor="reg-senha">Cria a tua senha</Label>
                <PasswordInput
                  id="reg-senha"
                  value={regSenha}
                  onChange={setRegSenha}
                  placeholder="Pelo menos 6 caracteres"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-confirmar">Confirmar a senha</Label>
                <PasswordInput
                  id="reg-confirmar"
                  value={regConfirmar}
                  onChange={setRegConfirmar}
                  placeholder="Escreve a mesma senha"
                  autoComplete="new-password"
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={aCriar}
                className="h-11 w-full bg-ambar text-[#101b2d] font-bold hover:bg-ambar-hover"
              >
                {aCriar ? (
                  <>
                    <LoaderCircle className="animate-spin" aria-hidden />
                    A criar o acesso...
                  </>
                ) : (
                  "Criar o meu acesso"
                )}
              </Button>
              <button
                type="button"
                onClick={voltarAoEntrar}
                className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Voltar
              </button>
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
                <PasswordInput
                  id="senha-atual"
                  value={senhaAtual}
                  onChange={setSenhaAtual}
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha-nova">Nova senha</Label>
                <PasswordInput
                  id="senha-nova"
                  value={senhaNova}
                  onChange={setSenhaNova}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="senha-confirmar">Confirmar nova senha</Label>
                <PasswordInput
                  id="senha-confirmar"
                  value={senhaConfirmar}
                  onChange={setSenhaConfirmar}
                  autoComplete="new-password"
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

          {etapa === "entrar" && (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              Dificuldade em entrar? Fala com a administração.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
