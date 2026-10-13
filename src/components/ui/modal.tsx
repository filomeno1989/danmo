"use client";

/**
 * Modal simples do portal (sem dependências extra).
 *
 * Overlay escuro + caixa centrada, fecha com o X, com ESC ou clicando
 * fora. Igual em espírito aos modais do hub, com o desenho do portal.
 */

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  aberto: boolean;
  fechar: () => void;
  titulo: string;
  subtitulo?: string;
  /** Largura máxima da caixa (classe Tailwind, ex.: "max-w-lg") */
  largura?: string;
  children: React.ReactNode;
};

export function Modal({ aberto, fechar, titulo, subtitulo, largura, children }: Props) {
  // ESC fecha; bloqueia o scroll do fundo enquanto está aberto
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("keydown", aoTeclar);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = "";
    };
  }, [aberto, fechar]);

  if (!aberto) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:items-center"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
    >
      <div
        className={cn(
          "bg-card my-auto w-full rounded-xl border shadow-lg",
          largura || "max-w-lg"
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-3.5">
          <div>
            <p className="font-bold leading-tight">{titulo}</p>
            {subtitulo && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitulo}</p>
            )}
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar"
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
