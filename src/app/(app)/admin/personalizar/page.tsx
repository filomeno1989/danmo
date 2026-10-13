/**
 * Personalização do portal (só administração).
 *
 * Aqui a administração carrega as fotos da empresa que aparecem como
 * slideshow discreto no fundo do login. Até 4 fotos; cada uma é
 * comprimida no próprio navegador antes de viajar (o portal fica leve
 * mesmo em redes fracas).
 *
 * Esta página vive DENTRO do portal (sidebar + topbar), com botão de
 * "Voltar ao painel" bem visível: nunca mais fica alguém preso aqui.
 *
 * Segurança igual ao hub: exige sessão de administração + a chave de
 * administração para gravar. O servidor valida as duas coisas.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { obterSessao } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { GestorFundos } from "./gestor-fundos";

export const metadata = { title: "Personalizar portal | Portal Danmo" };

export default async function PaginaPersonalizar() {
  const sessao = await obterSessao();

  if (!sessao) {
    redirect("/login?motivo=sem_sessao");
  }
  if (sessao.utilizador.nivel !== "admin") {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <section className="entrada-suave space-y-3 pt-1">
        <Button variant="outline" size="sm" asChild>
          <Link href="/">
            <ArrowLeft aria-hidden />
            Voltar ao painel
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-[1.35rem]">
            Personalizar portal
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Fotos da empresa no fundo do ecrã de entrada. Discreto, com véu
            escuro por cima: o cartão de login fica sempre legível.
          </p>
        </div>
      </section>

      <GestorFundos />
    </div>
  );
}
