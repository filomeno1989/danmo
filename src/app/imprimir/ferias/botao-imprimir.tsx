"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Botão de impressão da folha de afixação (só aparece no ecrã). */
export function BotaoImprimir() {
  return (
    <Button size="sm" onClick={() => window.print()} aria-label="Imprimir folha de afixação">
      <Printer className="size-4" aria-hidden /> Imprimir
    </Button>
  );
}
