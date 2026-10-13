/**
 * Personalização do portal (só administração).
 *
 * Aqui a administração carrega as fotos da empresa que aparecem como
 * slideshow discreto no fundo do login. Até 4 fotos; cada uma é
 * comprimida no próprio navegador antes de viajar (o portal fica leve
 * mesmo em redes fracas).
 *
 * Segurança igual ao hub: exige sessão de administração + a chave de
 * administração para gravar. O servidor valida as duas coisas.
 */

import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth";
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
      <section className="pt-1">
        <h1 className="text-xl font-bold tracking-tight sm:text-[1.35rem]">
          Personalizar portal
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Fotos da empresa no fundo do ecrã de entrada. Discreto, com véu
          escuro por cima: o cartão de login fica sempre legível.
        </p>
      </section>

      <GestorFundos />
    </div>
  );
}
