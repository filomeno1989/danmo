/**
 * PainelInicio - Conteúdo do "Início" (herói + cartões de fase + sobre).
 *
 * Componente de servidor: quem o chama fornece nome, cargo/nível e as
 * permissões da pessoa (matriz por utilizador, Fase 7 R1). Módulo sem
 * "ver" aparece DESFOCADO com etiqueta "Sem acesso" (o pedido do
 * Filomeno: no celular/tablet vê-se o home com as páginas desfocadas) -
 * o servidor das páginas/APIs decide sempre.
 */

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { HeroiSaudacao } from "@/components/heroi-saudacao";
import {
  CircleCheck,
  CircleSlash,
  Shield,
  KeyRound,
  Cog,
  Package,
  Briefcase,
  Layers,
  ArrowRight,
  type LucideIcon
} from "lucide-react";

type CartaoFaseProps = {
  classeFundo: string;
  icone: LucideIcon;
  tile: string;
  marcaAgua: LucideIcon;
  titulo: string;
  corTitulo: string;
  texto: string;
  corTexto: string;
  pill: React.ReactNode;
  seta: string;
  href: string;
  externo?: boolean;
  rotulo: string;
};

function CartaoFase({
  classeFundo,
  icone: Icone,
  tile,
  marcaAgua: Marca,
  titulo,
  corTitulo,
  texto,
  corTexto,
  pill,
  seta,
  href,
  externo,
  rotulo
}: CartaoFaseProps) {
  const corpo = (
    <>
      <Marca
        aria-hidden
        className="absolute -right-7 -bottom-9 size-36 text-current opacity-[0.06] dark:opacity-[0.09]"
      />
      <div className="relative z-10 flex h-full flex-col p-5">
        <span
          className={
            "flex size-11 items-center justify-center rounded-xl shadow-sm " + tile
          }
        >
          <Icone className="size-5.5" aria-hidden />
        </span>
        <h3 className={"mt-4 text-[1.05rem] font-bold " + corTitulo}>{titulo}</h3>
        <p className={"mt-1.5 text-[0.84rem] leading-relaxed " + corTexto}>{texto}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          {pill}
          <span
            className={
              "flex size-9 shrink-0 items-center justify-center rounded-full border transition-colors " +
              seta
            }
            aria-hidden
          >
            <ArrowRight className="size-4.5" />
          </span>
        </div>
      </div>
    </>
  );

  const classes = `cartao-fase card-sombra entrada-suave ${classeFundo} block h-full`;

  if (externo || href.startsWith("#")) {
    return (
      <a href={href} aria-label={rotulo} className={classes}>
        {corpo}
      </a>
    );
  }
  return (
    <Link href={href} aria-label={rotulo} className={classes}>
      {corpo}
    </Link>
  );
}

/**
 * Sem permissão: o cartão fica desbotado e desfocado, impossível de
 * clicar, com a etiqueta "Sem acesso" por cima (visual só - o servidor
 * é quem recusa a sério).
 */
function SemPermissao({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-full">
      <div aria-hidden className="pointer-events-none h-full select-none blur-[4px] saturate-[0.55]">
        {children}
      </div>
      <span className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card/95 px-3 py-1 text-[0.72rem] font-bold text-muted-foreground shadow-sm">
        <CircleSlash className="size-3.5" aria-hidden />
        Sem acesso
      </span>
    </div>
  );
}

export function PainelInicio({
  nome,
  quem,
  podeOficina,
  podeStock,
  podeFaturacao,
  podeQuadro,
  eAdmin,
  fundos
}: {
  nome: string;
  quem: string;
  podeOficina: boolean;
  podeStock: boolean;
  podeFaturacao: boolean;
  podeQuadro: boolean;
  eAdmin: boolean;
  fundos?: Parameters<typeof HeroiSaudacao>[0]["fundosIniciais"];
}) {
  const pillNoAr = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/15 px-3 py-1 text-[0.72rem] font-bold text-emerald-700 dark:bg-white/15 dark:text-emerald-200">
      <CircleCheck className="size-3.5" aria-hidden />
      No ar
    </span>
  );
  const pillConcluida = (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/15 px-3 py-1 text-[0.72rem] font-bold text-emerald-700 dark:bg-white/15 dark:text-emerald-200">
      <CircleCheck className="size-3.5" aria-hidden />
      Concluída
    </span>
  );

  return (
    <div className="space-y-5">
      {/* 1. Herói: saudação + foto da empresa (as fotos que carregas em
          Personalizar portal aparecem aqui também, em crossfade suave) */}
      <HeroiSaudacao nome={nome} quem={quem} fundosIniciais={fundos} />

      {/* 2. Estado da migração (cartões de fase; os sem permissão ficam
          desfocados, como o Filomeno pediu) */}
      <section aria-label="Estado da migração" className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CartaoFase
          classeFundo="fase-verde text-emerald-950 dark:text-white"
          icone={Shield}
          tile="bg-emerald-600 text-white dark:bg-white/15 dark:text-white"
          marcaAgua={Shield}
          titulo="Fundação"
          corTitulo="text-emerald-950 dark:text-white"
          texto="Login protegido no servidor, tema claro/escuro unificado e auto-registo dos colegas."
          corTexto="text-emerald-900/75 dark:text-white/75"
          pill={pillConcluida}
          seta="border-emerald-700/30 text-emerald-900 hover:bg-emerald-900/10 dark:border-white/35 dark:text-white dark:hover:bg-white/15"
          href="#sobre"
          rotulo="Fundação concluída: ver detalhes em Sobre este painel"
        />

        <SemPermissaoAplicada permitido={podeOficina}>
          <CartaoFase
            classeFundo="fase-ambar text-amber-950 dark:text-white"
            icone={Cog}
            tile="bg-ambar text-[#101b2d] dark:bg-white/15 dark:text-white"
            marcaAgua={Cog}
            titulo="Oficina & Manutenção"
            corTitulo="text-amber-950 dark:text-white"
            texto="Já está no ar: Ordens de Serviço, Checklist, Equipamentos, Faturação CdM e Relatórios, com exportações Excel e PDF ao padrão da marca."
            corTexto="text-amber-900/80 dark:text-white/75"
            pill={pillNoAr}
            seta="border-amber-700/40 text-amber-950 hover:bg-amber-900/10 dark:border-white/35 dark:text-white dark:hover:bg-white/15"
            href="/oficina"
            rotulo="Abrir a Oficina e Manutenção"
          />
        </SemPermissaoAplicada>

        <SemPermissaoAplicada permitido={podeStock}>
          <CartaoFase
            classeFundo="fase-vermelha text-red-950 dark:text-white"
            icone={Package}
            tile="bg-red-600 text-white dark:bg-white/15 dark:text-white"
            marcaAgua={Package}
            titulo="Gestão de Stock"
            corTitulo="text-red-950 dark:text-white"
            texto="Já está no ar: Materiais, Entradas, Saídas, Painel, Relatórios e Configurações, com stock calculado no servidor e o stock nunca negativo. Depois: Ferramentaria, HST e RH."
            corTexto="text-red-900/75 dark:text-white/75"
            pill={pillNoAr}
            seta="border-red-700/30 text-red-900 hover:bg-red-900/10 dark:border-white/35 dark:text-white dark:hover:bg-white/15"
            href="/stock"
            rotulo="Abrir a Gestão de Stock"
          />
        </SemPermissaoAplicada>

        <SemPermissaoAplicada permitido={podeFaturacao || podeQuadro}>
          <CartaoFase
            classeFundo="fase-ambar text-amber-950 dark:text-white"
            icone={Briefcase}
            tile="bg-amber-600 text-white dark:bg-white/15 dark:text-white"
            marcaAgua={Briefcase}
            titulo="Admin. Oficinal"
            corTitulo="text-amber-950 dark:text-white"
            texto={
              podeFaturacao
                ? "No ar: Faturação com Cotações e Faturas e o Quadro de Pessoal com as duas listas (Porto e TCM), estagiários e tempo de quem veio transferido. Seguem Avaliação, Aquisições e Férias."
                : "No ar: o Quadro de Pessoal com as duas listas (Porto e TCM), estagiários com decisão no fim e o tempo de quem veio transferido. Seguem Avaliação, Aquisições e Férias."
            }
            corTexto="text-amber-900/75 dark:text-white/75"
            pill={pillNoAr}
            seta="border-amber-700/30 text-amber-900 hover:bg-amber-900/10 dark:border-white/35 dark:text-white dark:hover:bg-white/15"
            href={podeFaturacao ? "/faturacao" : "/rh/quadro"}
            rotulo={podeFaturacao ? "Abrir a Faturação da Administração" : "Abrir o Quadro de Pessoal"}
          />
        </SemPermissaoAplicada>

        <CartaoFase
          classeFundo="fase-azul text-blue-950 dark:text-white"
          icone={KeyRound}
          tile="bg-blue-600 text-white dark:bg-white/15 dark:text-white"
          marcaAgua={KeyRound}
          titulo="Permissões & Contas"
          corTitulo="text-blue-950 dark:text-white"
          texto={
            eAdmin
              ? "No ar: aprova registos, cria contas, desactiva, faz reset de senha e dá a cada pessoa as suas permissões, página a página (Ver / Mexer / Apagar)."
              : "No ar: os teus dados ficam em Os meus dados (menu do teu nome), com troca de senha e pedidos de alteração para a administração."
          }
          corTexto="text-blue-900/75 dark:text-white/75"
          pill={pillNoAr}
          seta="border-blue-700/30 text-blue-900 hover:bg-blue-900/10 dark:border-white/35 dark:text-white dark:hover:bg-white/15"
          href={eAdmin ? "/permissoes" : "/perfil"}
          rotulo={eAdmin ? "Abrir a página Permissões" : "Abrir Os meus dados"}
        />
      </section>

      {/* 3. Sobre este painel */}
      <Card id="sobre" className="card-sombra overflow-hidden py-0">
        <div className="grid md:grid-cols-[1.3fr,1fr]">
          <CardContent className="py-6 sm:py-7">
            <div className="flex items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sucesso-bg text-sucesso">
                <Layers className="size-5.5" aria-hidden />
              </span>
              <h2 className="text-lg font-bold tracking-tight">Sobre este painel</h2>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                O conteúdo aqui visível decidimos juntos no final da migração: os
                atalhos, avisos e números que realmente interessa à Danmo terem
                logo à vista. Por agora serve de ponto de partida e mostra o
                estado do caminho.
              </p>
              <p>
                As permissões são por utilizador, página a página: o menu mostra
                toda a estrutura do portal e fica bloqueado (círculo com a barra)
                onde a administração ainda não te deu acesso - os módulos por
                migrar continuam marcados com a fase em que chegam. Tudo o que
                for teu de trabalhar aparece destravado.
              </p>
            </div>
          </CardContent>
          <div
            aria-hidden
            className="painel-sobre relative hidden flex-col items-center justify-center gap-3 p-8 text-center md:flex"
          >
            <p className="script-danmo text-[1.7rem] leading-snug">
              Tecnologia que impulsiona
              <br />
              o nosso trabalho.
            </p>
            <span className="h-1 w-10 rounded-full bg-sucesso" />
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Aplica o desfocado quando a pessoa não pode ver o módulo. */
function SemPermissaoAplicada({
  permitido,
  children
}: {
  permitido: boolean;
  children: React.ReactNode;
}) {
  if (permitido) return <>{children}</>;
  return <SemPermissao>{children}</SemPermissao>;
}
