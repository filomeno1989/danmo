"use client";

/**
 * SelecionarEquipamento - campo de escolha de máquina COM pesquisa.
 *
 * Nas listas de 200+ equipamentos, um <select> normal obriga a correr
 * a lista toda com o dedo (pior ainda no telemóvel). Aqui escreve-se
 * o número da máquina (ou parte do nome/tipo) e a lista descarrega na
 * hora - o mesmo espírito dos datalists de colaboradores da ficha da
 * obra, mas com linhas grandes para dedo e contador de resultados.
 *
 * Usado em: Ordens (filtro + nova obra) e Relatórios (filtro máquina).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import type { Equipamento } from "@/lib/oficina";

type Props = {
  equipamentos: Equipamento[];
  /** id escolhido, em texto ("" = nada escolhido) */
  value: string;
  onChange: (id: string) => void;
  id?: string;
  /** texto mostrado quando nada está escolhido */
  placeholder?: string;
  /** se fornecido, mostra uma primeira opção para limpar a escolha ("Todas as máquinas") */
  todosLabel?: string;
};

/** lower-case sem acentos, para a pesquisa apanhar "Pneumatico" = "Pneumático" */
function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function SelecionarEquipamento({
  equipamentos,
  value,
  onChange,
  id,
  placeholder = "- Selecionar -",
  todosLabel
}: Props) {
  const [aberta, setAberta] = useState(false);
  const [busca, setBusca] = useState("");
  const caixaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const escolhida = useMemo(
    () => equipamentos.find((e) => String(e.id) === value) || null,
    [equipamentos, value]
  );

  // Fecha ao clicar fora da caixa
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

  // Ao abrir: o campo de pesquisa ganha foco (teclado escreve logo).
  // A pesquisa em si é limpa no clique de abrir (abrirFechada), não aqui.
  useEffect(() => {
    if (!aberta) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [aberta]);

  function abrirFechada() {
    if (!aberta) {
      setBusca("");
      setAberta(true);
    } else {
      setAberta(false);
    }
  }

  const q = normalizar(busca.trim());
  const filtradas = useMemo(() => {
    if (!q) return equipamentos;
    return equipamentos.filter((e) =>
      normalizar(`${e.code} ${e.name || ""} ${e.fleet_type || ""}`).includes(q)
    );
  }, [equipamentos, q]);

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        id={id}
        onClick={abrirFechada}
        aria-expanded={aberta}
        aria-haspopup="listbox"
        className="border-input dark:bg-input/30 flex h-9 w-full items-center justify-between gap-2 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <span className={"truncate " + (escolhida ? "" : "text-muted-foreground")}>
          {escolhida
            ? `${escolhida.code}${escolhida.fleet_type ? ` - ${escolhida.fleet_type}` : ""}`
            : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-60" aria-hidden />
      </button>

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
                if (e.key === "Enter" && filtradas.length) {
                  onChange(String(filtradas[0].id));
                  setAberta(false);
                }
              }}
              placeholder="Escreve o nº ou nome da máquina..."
              className="h-8 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Pesquisar máquina"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                aria-label="Limpar pesquisa"
                className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>

          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {todosLabel && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setAberta(false);
                  }}
                  className="hover:bg-accent flex w-full items-center px-3 py-2.5 text-left text-sm"
                >
                  {todosLabel}
                </button>
              </li>
            )}
            {filtradas.map((e) => {
              const activo = String(e.id) === value;
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={activo}
                    onClick={() => {
                      onChange(String(e.id));
                      setAberta(false);
                    }}
                    className={
                      "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm " +
                      (activo ? "bg-accent/60" : "hover:bg-accent")
                    }
                  >
                    <span className="truncate">
                      <span className="font-semibold">{e.code}</span>
                      {e.fleet_type && (
                        <span className="text-muted-foreground"> - {e.fleet_type}</span>
                      )}
                    </span>
                    {activo && <Check className="size-4 shrink-0" aria-hidden />}
                  </button>
                </li>
              );
            })}
            {!filtradas.length && (
              <li className="text-muted-foreground px-3 py-2.5 text-sm">
                Nenhuma máquina com &quot;{busca}&quot;.
              </li>
            )}
          </ul>

          <div className="text-muted-foreground border-t px-3 py-1.5 text-[0.68rem]">
            {filtradas.length} de {equipamentos.length} {equipamentos.length === 1 ? "máquina" : "máquinas"}
          </div>
        </div>
      )}
    </div>
  );
}
