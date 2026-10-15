/**
 * PainelInicio - Conteúdo do "Início" (herói + cartões de fase + sobre).
 *
 * Componente de servidor, sem acesso a sessão: quem o chama fornece
 * nome e cargo/nível. Assim o mesmo bloco serve a página real e os
 * testes visuais.
 */

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { HeroiSaudacao } from "@/components/heroi-saudacao";
import {
  CircleCheck,
  Clock,
  Shield,
  Cog,
  Package,
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

export function PainelInicio({
  nome,
  quem,
  fundos
}: {
  nome: string;
  quem: string;
  fundos?: Parameters<typeof HeroiSaudacao>[0]["fundosIniciais"];
}) {
  return (
    <div className="space-y-5">
      {/* 1. Herói: saudação + foto da empresa (as fotos que carregas em
          Personalizar portal aparecem aqui também, em crossfade suave) */}
      <HeroiSaudacao nome={nome} quem={quem} fundosIniciais={fundos} />

      {/* 2. Estado da migração (cartões de fase) */}
      <section aria-label="Estado da migração" className="grid gap-4 md:grid-cols-3">
        <CartaoFase
          classeFundo="fase-verde text-emerald-950 dark:text-white"
          icone={Shield}
          tile="bg-emerald-600 text-white dark:bg-white/15 dark:text-white"
          marcaAgua={Shield}
          titulo="Fundação"
          corTitulo="text-emerald-950 dark:text-white"
          texto="Login protegido no servidor, menu por permissões, tema claro/escuro unificado e auto-registo dos colegas."
          corTexto="text-emerald-900/75 dark:text-white/75"
          pill={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/15 px-3 py-1 text-[0.72rem] font-bold text-emerald-700 dark:bg-white/15 dark:text-emerald-200">
              <CircleCheck className="size-3.5" aria-hidden />
              Concluída
            </span>
          }
          seta="border-emerald-700/30 text-emerald-900 hover:bg-emerald-900/10 dark:border-white/35 dark:text-white dark:hover:bg-white/15"
          href="#sobre"
          rotulo="Fundação concluída: ver detalhes em Sobre este painel"
        />

        <CartaoFase
          classeFundo="fase-ambar text-amber-950 dark:text-white"
          icone={Cog}
          tile="bg-ambar text-[#101b2d] dark:bg-white/15 dark:text-white"
          marcaAgua={Cog}
          titulo="Oficina & Manutenção"
          corTitulo="text-amber-950 dark:text-white"
          texto="Já está no ar: Ordens de Serviço, Checklist, Equipamentos, Faturação CdM e Relatórios, com exportações Excel e PDF ao padrão da marca."
          corTexto="text-amber-900/80 dark:text-white/75"
          pill={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/15 px-3 py-1 text-[0.72rem] font-bold text-emerald-700 dark:bg-white/15 dark:text-emerald-200">
              <CircleCheck className="size-3.5" aria-hidden />
              No ar
            </span>
          }
          seta="border-amber-700/40 text-amber-950 hover:bg-amber-900/10 dark:border-white/35 dark:text-white dark:hover:bg-white/15"
          href="/oficina"
          rotulo="Abrir a Oficina e Manutenção"
        />

        <CartaoFase
          classeFundo="fase-vermelha text-red-950 dark:text-white"
          icone={Package}
          tile="bg-red-600 text-white dark:bg-white/15 dark:text-white"
          marcaAgua={Package}
          titulo="Gestão de Stock"
          corTitulo="text-red-950 dark:text-white"
          texto="A próxima a entrar: Materiais, Entradas, Saídas, Painel e Relatórios, tal como estão no hub actual. Depois: Ferramentaria, HST, RH e a matriz de permissões."
          corTexto="text-red-900/75 dark:text-white/75"
          pill={
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-[0.72rem] font-bold text-red-800 shadow-sm dark:bg-white/15 dark:text-red-200">
              <Clock className="size-3.5" aria-hidden />
              A seguir
            </span>
          }
          seta="border-red-700/30 text-red-900 hover:bg-red-900/10 dark:border-white/35 dark:text-white dark:hover:bg-white/15"
          href="/em-migracao?mod=stock"
          externo
          rotulo="Gestão de Stock: ver o plano da migração"
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
                O menu lateral já está a funcionar com as permissões da base de
                dados: cada colega vê apenas o que pode usar. Os módulos que
                ainda não migraram aparecem marcados com a fase em que chegam.
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
