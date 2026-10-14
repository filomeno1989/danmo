"use client";

import { useEffect } from "react";

/**
 * Tranca do scroll do rato nos campos numéricos.
 *
 * Problema: ao escrever um valor (ex: 1) e passar o scroll do rato por
 * cima do campo, o navegador altera o número sozinho (0,99 / 0,98 /
 * 1,01 / 1,02). Isto já causou valores errados em quantidades e preços.
 *
 * Solução: um único ouvinte global (instalado no layout raiz, cobre o
 * login e todos os módulos). Se o utilizador roda o scroll com o cursor
 * sobre um campo numérico QUE ESTÁ EM USO (focado), o movimento é
 * cancelado antes de o navegador mexer no valor. O campo mantém o foco
 * para continuar a escrever. Fora dos campos numéricos, o scroll da
 * página funciona exatamente como sempre.
 *
 * Cobre todos os <input type="number"> actuais e futuros, incluindo os
 * com casas decimais (step), sem precisar de tocar em cada ecrã.
 */
export default function BloqueioScrollNumeros() {
  useEffect(() => {
    const aoRolar = (evento: WheelEvent) => {
      const alvo = evento.target;
      if (
        alvo instanceof HTMLInputElement &&
        alvo.type === "number" &&
        document.activeElement === alvo
      ) {
        // Cancela o movimento: o navegador nem chega a alterar o valor.
        evento.preventDefault();
      }
    };

    document.addEventListener("wheel", aoRolar, { passive: false });
    return () => document.removeEventListener("wheel", aoRolar);
  }, []);

  return null;
}
