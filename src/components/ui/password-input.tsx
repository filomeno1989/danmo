"use client";

/**
 * PasswordInput - Campo de senha com o botão de olho (mostrar / ocultar).
 *
 * O teu pedido para o auto-registo: "a parte para ele colocar a senha e
 * confirmação da senha com aquela opção de olho para a pessoa poder ver
 * ou ocultar". Funciona em qualquer ecrã, com teclado (Enter continua a
 * submeter) e acessível por leitor de ecrã.
 */

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

type Props = {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
};

export function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
  autoComplete,
  required
}: Props) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="relative">
      <Input
        id={id}
        type={visivel ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        className="h-11 pr-11"
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground"
      >
        {visivel ? (
          <EyeOff className="size-4.5" aria-hidden />
        ) : (
          <Eye className="size-4.5" aria-hidden />
        )}
      </button>
    </div>
  );
}
