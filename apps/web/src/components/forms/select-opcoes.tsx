"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Select de opções fixas (valor → rótulo). `items` faz o gatilho mostrar o
 * rótulo, não o valor cru. Valor vazio mostra o placeholder.
 */
export function SelectOpcoes({
  id,
  value,
  onChange,
  opcoes,
  placeholder = "Selecione…",
  disabled,
  className,
  ...aria
}: {
  id: string;
  value: string;
  onChange: (valor: string) => void;
  opcoes: Record<string, string>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  return (
    <Select
      items={opcoes}
      value={value || null}
      onValueChange={(v) => onChange((v as string | null) ?? "")}
      disabled={disabled}
    >
      {/* min-w-0 + truncate: opção de nome longo (ex.: produto) corta com "…" em vez
          de alargar o campo e empurrar o formulário para fora do diálogo no celular */}
      <SelectTrigger id={id} className={cn("w-full min-w-0", className)} {...aria}>
        <SelectValue placeholder={placeholder} className="min-w-0 truncate block!" />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(opcoes).map(([valor, rotulo]) => (
          <SelectItem key={valor} value={valor}>
            {rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
