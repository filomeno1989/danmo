"use client";

/**
 * ui-bits.tsx - Peças visuais partilhadas pelas páginas da Oficina.
 *
 * Mantém o mesmo desenho do portal (cartões card-sombra, etiquetas com
 * as cores do tema, barras de percentagem) e um ajudante de pedidos à
 * API com aviso (toast) quando algo falha.
 */

import { toast } from "sonner";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { COR_ESTADO, COR_FISICO } from "@/lib/oficina";

/* ============ Pedidos à API ============ */

/** Pedido GET com JSON. Falha com erro legível. */
export async function pedir<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d?.ok === false) {
    throw new Error(d?.erro || "Não foi possível carregar os dados.");
  }
  return d as T;
}

/** Pedido POST com JSON + toast em caso de falha (devolve a resposta). */
export async function enviar<T = { ok: boolean; erro?: string }>(
  url: string,
  corpo: unknown,
  msgSucesso?: string
): Promise<T> {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo)
  });
  const d = (await r.json().catch(() => ({}))) as T & { ok?: boolean; erro?: string };
  if (!r.ok || d?.ok === false) {
    toast.error(d?.erro || "Não foi possível guardar.");
    throw new Error(d?.erro || "Falha no pedido");
  }
  if (msgSucesso) toast.success(msgSucesso);
  return d;
}

/* ============ Etiquetas (badges) ============ */

export function Etiqueta({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[0.68rem] font-semibold",
        cor
      )}
    >
      {children}
    </span>
  );
}

export function EtiquetaFisico({ estado }: { estado: string | null | undefined }) {
  if (!estado) return <span className="text-muted-foreground">-</span>;
  return <Etiqueta cor={COR_FISICO[estado] || "bg-muted text-muted-foreground"}>{estado}</Etiqueta>;
}

export function EtiquetaEstado({ estado }: { estado: string | null | undefined }) {
  if (!estado) return <span className="text-muted-foreground">-</span>;
  return <Etiqueta cor={COR_ESTADO[estado] || "bg-muted text-muted-foreground"}>{estado}</Etiqueta>;
}

/* ============ Cabeçalho de página do módulo ============ */

export function Cabeca({
  titulo,
  subtitulo,
  children
}: {
  titulo: string;
  subtitulo?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="entrada-suave space-y-1 pt-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-[1.35rem]">{titulo}</h1>
          {subtitulo && <p className="mt-0.5 text-sm text-muted-foreground">{subtitulo}</p>}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </section>
  );
}

/* ============ Barra de percentagem ============ */

export function BarraPct({ pct, cor }: { pct: number; cor?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", cor || "bg-primario")}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums">{pct}%</span>
    </div>
  );
}

/** Spinner pequeno para botões e carregamentos. */
export function Rodar({ className }: { className?: string }) {
  return <LoaderCircle className={cn("size-4 animate-spin", className)} aria-hidden />;
}
