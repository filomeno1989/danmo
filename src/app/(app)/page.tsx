/**
 * Painel Principal (placeholder da Fase 1).
 *
 * Conforme combinado: o conteúdo deste painel decidimos NO FINAL da
 * migração, com o que realmente interessa à Danmo aparecer aqui. Por
 * agora mostra o estado da migração e boas-vindas, para todos os
 * colegas saberem em que ponto estamos.
 */

import Image from "next/image";
import { obterSessao, NIVEL_LABEL } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function PaginaInicio() {
  const sessao = await obterSessao();
  const nome = sessao?.utilizador.nome || "";
  const nivel = sessao?.utilizador.nivel || "";
  const cargo = sessao?.utilizador.cargo || "";
  const nivelTexto = NIVEL_LABEL[nivel] || nivel;

  return (
    <div className="space-y-6">
      {/* Boas-vindas */}
      <section className="relative overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar p-6 text-white sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-[rgba(245,158,11,0.14)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 -left-10 h-56 w-56 rounded-full bg-[rgba(0,150,57,0.12)]"
        />
        <div className="relative flex flex-wrap items-center gap-4">
          <Image
            src="/logos/danmo-logo.png"
            alt="Logo Danmo Service System"
            width={56}
            height={56}
            className="h-14 w-auto object-contain"
          />
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">
              Olá, {nome || "colaborador"}! Bem-vindo ao novo portal.
            </h1>
            <p className="mt-1 text-sm text-sidebar-foreground/80">
              {cargo ? `${cargo} · ` : ""}
              {nivelTexto ? `Nível: ${nivelTexto}` : ""}
            </p>
          </div>
        </div>
      </section>

      {/* Estado da migração */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Badge className="bg-sucesso text-white">Fase 1</Badge>
              Fundação
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Login protegido no servidor, menu por permissões, tema claro/escuro e
            este painel. <span className="font-semibold text-sucesso">Concluída.</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Badge className="bg-ambar text-[#101b2d]">Fase 3</Badge>
              Oficina &amp; Manutenção
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            A próxima a entrar: Ordens de Serviço, Checklist, Equipamentos e
            Relatórios, exactamente como estão no hub actual.{" "}
            <span className="font-semibold text-aviso">A seguir.</span>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Badge variant="outline">Fases 2 e 4 a 7</Badge>
              Restantes módulos
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Faturação, Stock, Ferramentaria, HST, RH, Férias e a matriz visual de
            permissões entram a seguir, módulo a módulo, com a tua aprovação.
          </CardContent>
        </Card>
      </section>

      {/* Nota sobre o conteúdo do painel */}
      <Card className="border-dashed">
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
