/**
 * SemAcesso - Cartaz mostrado quando a sessão não tem permissão para a
 * página (matriz por utilizador da Fase 7 R1).
 *
 * Componente de SERVIDOR: quem chega por URL directo vê isto em vez do
 * conteúdo. O bloqueio real continua no servidor (a API recusa à parte);
 * este cartaz é só a cara do "não".
 */

import Link from "next/link";
import { CircleSlash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { labelPagina } from "@/lib/permissoes";

export function SemAcesso({ pagina }: { pagina: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="entrada-suave w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center card-sombra">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <CircleSlash className="size-7" aria-hidden />
        </span>
        <h1 className="mt-4 text-lg font-bold tracking-tight">Sem acesso a esta página</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A administração ainda não te deu acesso a{" "}
          <span className="font-semibold">{labelPagina(pagina)}</span>. Se precisares
          desta área, fala com o Filomeno para a destravar na página Permissões.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">Voltar ao Início</Link>
        </Button>
      </div>
    </div>
  );
}
