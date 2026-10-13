/**
 * Página "Em migração": destino temporário dos módulos que ainda não
 * entraram para a nova geração. Mostra a que fase pertence o módulo e
 * reafirma que o hub actual continua no ar entretanto.
 */

import Link from "next/link";
import { ArrowLeft, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { moduloPorId } from "@/lib/permissoes";

export default async function PaginaEmMigracao({
  searchParams
}: {
  searchParams: Promise<{ mod?: string }>;
}) {
  const { mod = "" } = await searchParams;
  const modulo = moduloPorId(mod);

  return (
    <Card className="card-sombra mx-auto max-w-xl border-dashed">
      <CardContent className="p-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-ambar-claro text-ambar-texto">
          <Hourglass className="size-6" aria-hidden />
        </div>
        <h1 className="text-lg font-bold">
          {modulo ? modulo.label : "Módulo"} ainda não migraram para cá
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {modulo
            ? `Este módulo entra na Fase ${modulo.fase} da migração.`
            : "Este módulo entra numa das próximas fases da migração."}{" "}
          Entretanto continuas a usá-lo no portal actual (danmo-hub), que segue
          no ar como sempre: nada muda no teu trabalho diário.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Quando a fase deste módulo chegar, a migração é feita 1 para 1 e
          passas a trabalhar aqui com as mesmas telas que já conheces, mas mais
          rápidas e mais protegidas.
        </p>
        <Button asChild className="mt-6">
          <Link href="/">
            <ArrowLeft aria-hidden />
            Voltar ao Painel Principal
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
