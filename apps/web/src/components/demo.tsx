import { FlaskConical, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Selo pra dados que NÃO vêm do banco (séries ilustrativas, telas conceito).
 * Regra do produto: nada fictício aparece sem este selo.
 */
export function DemoBadge({ className, texto = "Dados demonstrativos" }: { className?: string; texto?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-aviso-borda bg-aviso px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-aviso-foreground",
        className,
      )}
    >
      <FlaskConical className="h-3 w-3" aria-hidden />
      {texto}
    </span>
  );
}

/**
 * Botão de funcionalidade ainda não implementada: visível (mostra o roadmap),
 * mas desabilitado e anunciado como "em breve" — nunca um botão que não faz nada.
 */
export function EmBreveButton({
  children,
  variant = "outline",
  size = "sm",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <Button variant={variant} size={size} disabled className={className} title="Disponível em uma próxima versão">
      {children}
      <span className="ml-1 inline-flex items-center gap-0.5 rounded bg-muted px-1 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Hourglass className="h-2.5 w-2.5" aria-hidden />
        em breve
      </span>
    </Button>
  );
}
