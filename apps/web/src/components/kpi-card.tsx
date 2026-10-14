import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Tone = "blue" | "emerald" | "amber" | "violet" | "rose";

type Props = {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  tone?: Tone;
};

// (Variação % vs. período anterior foi removida: o sistema ainda não guarda
// histórico, então qualquer delta exibido seria inventado.)

// O tom fica só no ícone: o número é sempre na cor do texto
const toneStyles: Record<Tone, string> = {
  blue: "text-blue-700 dark:text-blue-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
  amber: "text-ouro",
  violet: "text-violet-700 dark:text-violet-300",
  rose: "text-rose-700 dark:text-rose-300",
};

export function KpiCard({ label, value, icon: Icon, hint, tone = "blue" }: Props) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="px-5 py-1">
        {/* Altura de duas linhas: rótulos longos não desalinham os números da fileira */}
        <div className="flex items-start justify-between gap-2 min-h-8">
          <p className="rotulo leading-snug">{label}</p>
          <Icon className={cn("h-4 w-4 shrink-0", toneStyles[tone])} strokeWidth={1.75} aria-hidden />
        </div>
        <p className="titulo-display text-[38px] leading-none mt-4 tabular-nums">{value}</p>
        {hint && <p className="text-xs text-muted-foreground mt-2.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}
