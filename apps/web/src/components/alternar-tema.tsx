"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/** Claro ↔ escuro. Os dois ícones ficam no DOM e o CSS mostra o certo: sem flash na hidratação. */
export function AlternarTema() {
  const { resolvedTheme, setTheme } = useTheme();
  const escuro = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(escuro ? "light" : "dark")}
      aria-label="Alternar tema claro/escuro"
      title="Alternar tema claro/escuro"
    >
      <Sun className="h-4 w-4 hidden dark:block" aria-hidden />
      <Moon className="h-4 w-4 dark:hidden" aria-hidden />
    </Button>
  );
}
