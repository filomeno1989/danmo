"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}

/**
 * Troca de tema INSTANTÂNEA: liga a classe .sem-transicoes no <html>,
 * faz a troca e desliga a classe meio segundo depois. Sem isto, todas
 * as transições de cor de centenas de elementos arrancavam ao mesmo
 * tempo e o telemóvel mudava o tema "por partes".
 */
export function trocarTemaInstantaneo(
  resolvedTheme: string | undefined,
  setTheme: (t: "light" | "dark") => void
) {
  if (typeof document === "undefined") return;
  const raiz = document.documentElement;
  raiz.classList.add("sem-transicoes");
  setTheme(resolvedTheme === "dark" ? "light" : "dark");
  window.setTimeout(() => raiz.classList.remove("sem-transicoes"), 450);
}
