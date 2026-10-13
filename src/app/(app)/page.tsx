/**
 * Painel Principal (placeholder da Fase 1).
 *
 * Conforme combinado: o conteúdo deste painel decidimos NO FINAL da
 * migração, com o que realmente interessa à Danmo aparecer aqui.
 *
 * A saudação vive numa linha discreta no topo (sem banner grande), com
 * o cumprimento certo à hora de Maputo. O estado da migração fica em
 * cartões leves para os colegas saberem em que ponto estamos.
 */

import { obterSessao, NIVEL_LABEL } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CircleCheck,
  Wrench,
  Layers,
  CalendarClock
} from "lucide-react";

/** Cumprimento certo à hora local de Moçambique (UTC+2). */
function cumprimento(): string {
  const agoraUtc = new Date();
  const horaMaputo = (agoraUtc.getUTCHours() + 2) % 24;
  if (horaMaputo < 12) return "Bom dia";
  if (horaMaputo < 19) return "Boa tarde";
  return "Boa noite";
}

export default async function PaginaInicio() {
  const sessao = await obterSessao();
  const nome = sessao?.utilizador.nome || "";
  const nivel = sessao?.utilizador.nivel || "";
  const cargo = sessao?.utilizador.cargo || "";
  const nivelTexto = NIVEL_LABEL[nivel] || nivel;

  const quem = cargo ? `${cargo}` : nivelTexto ? `${nivelTexto}` : "";

  return (
    <div className="space-y-6">
      {/* Saudação discreta (o banner grande saiu, conforme o teu pedido) */}
      <section className="entrada-suave flex flex-wrap items-baseline justify-between gap-2 pt-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-[1.35rem]">
            {cumprimento()}
            {nome ? `, ${nome}` : ""}{" "}
            <span aria-hidden className="text-ambar">
              .
            </span>
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {quem ? `${quem} · ` : ""}Bem-vindo ao novo portal Danmo.
          </p>
        </div>
      </section>

      {/* Estado da migração */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="card-sombra">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sucesso-bg text-sucesso">
                <CircleCheck className="size-4.5" aria-hidden />
              </span>
              Fundação
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            Login protegido no servidor, menu por permissões, tema claro/escuro
            unificado e auto-registo dos colegas.{" "}
            <span className="font-semibold text-sucesso">Concluída.</span>
          </CardContent>
        </Card>

        <Card className="card-sombra">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-ambar-claro text-ambar-texto">
                <Wrench className="size-4.5" aria-hidden />
              </span>
              Oficina &amp; Manutenção
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            A próxima a entrar: Ordens de Serviço, Checklist, Equipamentos e
            Relatórios, tal como estão no hub actual.{" "}
            <span className="font-semibold text-aviso">A seguir.</span>
          </CardContent>
        </Card>

        <Card className="card-sombra">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2.5 text-base">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-info-bg text-info">
                <Layers className="size-4.5" aria-hidden />
              </span>
              Restantes módulos
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">
            Faturação, Stock, Ferramentaria, HST, RH, Férias e a matriz visual
            de permissões, módulo a módulo, com a tua aprovação.{" "}
            <span className="inline-flex items-center gap-1 text-aviso">
              <CalendarClock className="size-3.5" aria-hidden />
              Fases 2 e 4 a 7
            </span>
          </CardContent>
        </Card>
      </section>

      {/* Nota sobre o conteúdo do painel */}
      <Card className="border-dashed bg-transparent shadow-none">
        <CardContent className="p-6 text-sm leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">Sobre este painel</p>
          <p className="mt-2">
            O conteúdo aqui visível decidimos juntos no final da migração: os
            atalhos, avisos e números que realmente interessa à Danmo terem
            logo à vista. Por agora serve de ponto de partida e mostra o
            estado do caminho.
          </p>
          <p className="mt-2">
            O menu lateral já está a funcionar com as permissões da base de
            dados: cada colega vê apenas o que pode usar. Os módulos que ainda
            não migraram aparecem marcados com a fase em que chegam.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
