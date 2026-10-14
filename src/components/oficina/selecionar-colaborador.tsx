"use client";

/**
 * SelecionarColaborador - campo de pessoa com pesquisa por NOME OU CÓDIGO.
 *
 * O Filomeno pediu: "Filomeno posso localizar ou 69 também posso localizar
 * o Filomeno. Em todos campos." Este componente substitui os datalists e
 * selects de pessoas (que só achavam pelo nome) por um campo que filtra
 * pelo nome e pelo código ao mesmo tempo (ex.: "Filomeno" ou "69").
 *
 * Aceita texto livre (o responsável pode ser "Cliente CdM" e não há
 * colaborador com esse nome) - a lista é sugestão, não prisão.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import type { ColaboradorLinha } from "@/lib/oficina";

type Props = {
  colaboradores: ColaboradorLinha[];
  value: string;
  onChange: (nome: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
};

/** lower-case sem acentos: "Fernão" encontra "Fernao" */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function SelecionarColaborador({
  colaboradores,
  value,
  onChange,
  id,
  placeholder = "Pesquisar por nome ou código...",
  disabled
}: Props) {
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const caixaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!aberta) return;
    function fora(ev: MouseEvent) {
      if (caixaRef.current && !caixaRef.current.contains(ev.target as Node)) {
        setAberta(false);
      }
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberta]);

  // Foco no campo ao abrir (a pesquisa começa vazia a cada abertura)
  useEffect(() => {
    if (!aberta) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [aberta]);

  function abrir() {
    if (disabled) return;
    setBusca("");
    setAberta(true);
  }

  const q = normalizar(busca.trim());
  const sugeridas = useMemo(() => {
    if (!q) return colaboradores;
    return colaboradores.filter(
      (c) =>
        normalizar(c.name || "").includes(q) ||
        normalizar(c.code || "").includes(q)
    );
  }, [colaboradores, q]);

  return (
    <div className="relative" ref={caixaRef}>
      <div className="relative">
        <input
          id={id}
          type="text"
          value={value}
          disabled={disabled}
          onFocus={abrir}
          onClick={abrir}
          onChange={(e) => {
            onChange(e.target.value);
            if (!aberta) setAberta(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAberta(false);
            if (e.key === "Enter" && sugeridas.length === 1) {
              onChange(sugeridas[0].name);
              setAberta(false);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className="border-input bg-transparent dark:bg-input/30 flex h-9 w-full rounded-md border px-3 pr-8 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setBusca("");
              inputRef.current?.focus();
            }}
            aria-label="Limpar"
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-0.5 opacity-50 hover:opacity-100"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {aberta && (
        <div className="bg-popover text-popover-foreground absolute z-50 mt-1 w-full overflow-hidden rounded-md border shadow-lg">
          <div className="flex items-center gap-2 border-b px-2.5 py-2">
            <Search className="size-4 shrink-0 opacity-60" aria-hidden />
            <input
              ref={inputRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setAberta(false);
                if (e.key === "Enter" && sugeridas.length) {
                  onChange(sugeridas[0].name);
                  setAberta(false);
                }
              }}
              placeholder="Nome ou código (ex: Filomeno ou 69)..."
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Pesquisar colaborador"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            {sugeridas.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.name === value}
                  onClick={() => {
                    onChange(c.name);
                    setAberta(false);
                  }}
                  className={
                    "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm " +
                    (c.name === value ? "bg-accent/60" : "hover:bg-accent")
                  }
                >
                  <span className="truncate">{c.name}</span>
                  {c.code && (
                    <span className="text-muted-foreground shrink-0 text-xs font-semibold">
                      {c.code}
                    </span>
                  )}
                </button>
              </li>
            ))}
            {!sugeridas.length && (
              <li className="text-muted-foreground px-3 py-2.5 text-sm">
                Ninguém com &quot;{busca}&quot;. Podes escrever o nome à mão - Enter usa o texto livre.
              </li>
            )}
          </ul>
          <div className="text-muted-foreground border-t px-3 py-1.5 text-[0.68rem]">
            {sugeridas.length} de {colaboradores.length} pessoas
          </div>
        </div>
      )}
    </div>
  );
}
