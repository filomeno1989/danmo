"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botão de impressão dos papéis do Portal HST (só aparece no ecrã). */
export function BotaoImprimirHst({ deVolta }: { deVolta?: string }) {
  return (
    <div className="mb-4 flex justify-end gap-2 print:hidden">
      {deVolta ? (
        <Button size="sm" variant="outline" asChild>
          <a href={deVolta}>Voltar</a>
        </Button>
      ) : null}
      <Button size="sm" onClick={() => window.print()} aria-label="Imprimir relatório">
        <Printer className="size-4" aria-hidden /> Imprimir / Guardar PDF
      </Button>
    </div>
  );
}
