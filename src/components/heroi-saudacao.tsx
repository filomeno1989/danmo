"use client";

/**
 * HeroiSaudacao - Cartão de entrada do painel (o "herói" dos mockups).
 *
 * À esquerda: "Olá, Boa tarde, <nome>." com cargo e os selos de confiança.
 * À direita: foto da empresa (as mesmas fotos que o admin carrega em
 * Personalizar portal) em crossfade discreto; sem fotos, um brilho suave
 * da marca. O véu deixa o texto sempre legível.
 *
 * As fotos chegam por props (servidor) OU vão buscá-las ao navegador
 * quando o componente é reutilizado fora da primeira carga. Nunca
 * embutimos as fotos no HTML do painel: base64 pesa e as redes de
 * Moçambique agradecem.
 */

import { useEffect, useState } from "react";
import { BadgeCheck, Clock, ShieldCheck } from "lucide-react";
import type { FundoLogin } from "@/lib/uso-comum";

type Props = {
  nome: string;
  quem: string;
  fundosIniciais?: FundoLogin[];
};

export function HeroiSaudacao({ nome, quem, fundosIniciais }: Props) {
  const [fundos, setFundos] = useState<FundoLogin[]>(fundosIniciais || []);
  const [procurado, setProcurado] = useState(Boolean(fundosIniciais));
  const [actual, setActual] = useState(0);

  // Sem fotos iniciais, vai buscá-las uma vez (o navegador guarda em
  // cache: o login já as pediu para o slideshow)
  useEffect(() => {
    if (procurado) return;
    let vivo = true;
    fetch("/api/portal/fundos")
      .then((r) => r.json())
      .then((d) => {
        if (vivo && d?.ok && Array.isArray(d.fundos)) {
          setFundos(d.fundos.slice(0, 4));
        }
      })
      .catch(() => {})
      .finally(() => vivo && setProcurado(true));
    return () => {
      vivo = false;
    };
  }, [procurado]);

  // Troca de foto cada 8 segundos (só com mais de uma foto; o crossfade
  // respeita o "reduzir movimento" via CSS)
  useEffect(() => {
    if (fundos.length < 2) return;
    const t = setInterval(() => setActual((a) => (a + 1) % fundos.length), 8000);
    return () => clearInterval(t);
  }, [fundos.length]);

  return (
    <section
      className="cartao-sombra relative overflow-hidden rounded-2xl border border-border bg-card"
      aria-label="Saudação de entrada"
    >
      {/* Fundo: fotos da empresa em crossfade ou brilho da marca */}
      <div aria-hidden className="absolute inset-0">
        {fundos.map((f, i) => (
          <div
            key={f.posicao}
            className={"heroi-foto" + (i === actual ? " visivel" : "")}
            style={{ backgroundImage: `url("${f.foto}")` }}
          />
        ))}
        {fundos.length > 0 ? <div className="heroi-veu" /> : <div className="heroi-fallback" />}
      </div>

      {/* Conteúdo */}
      <div className="relative z-10 flex min-h-[228px] flex-col justify-center p-5 sm:p-8">
        <p className="text-[0.95rem] text-muted-foreground">Olá,</p>
        <h1 className="mt-1 max-w-[22ch] text-[1.45rem] leading-tight font-bold tracking-tight sm:max-w-[26ch] sm:text-[1.9rem]">
          {nome ? nome : "Bem-vindo ao portal da Danmo S. S. Lda"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {quem ? `${quem} · ` : ""}Bem-vindo ao portal da Danmo S. S. Lda.
        </p>
        <span aria-hidden className="mt-3.5 h-1 w-12 rounded-full bg-sucesso" />

        {/* Selos de confiança (desktop e tablet; no telemóvel encurtam) */}
        <ul className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[0.78rem] font-medium text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <ShieldCheck className="size-4 text-sucesso" aria-hidden />
            Sistema seguro
          </li>
          <li aria-hidden className="hidden h-3.5 w-px bg-border sm:block" />
          <li className="flex items-center gap-1.5">
            <BadgeCheck className="size-4 text-sucesso" aria-hidden />
            Acesso autorizado
          </li>
          <li aria-hidden className="hidden h-3.5 w-px bg-border sm:block" />
          <li className="flex items-center gap-1.5">
            <Clock className="size-4 text-sucesso" aria-hidden />
            Em funcionamento
          </li>
        </ul>
      </div>

      {/* Frase manuscrita sobre a foto (como no mockup) */}
      <p
        aria-hidden
        className="script-danmo absolute top-1/2 right-6 z-10 hidden -translate-y-1/2 text-right text-2xl leading-snug text-foreground/80 drop-shadow-sm lg:block dark:text-white/85"
      >
        Mais eficiência,
        <br />
        melhor gestão.
      </p>
    </section>
  );
}
