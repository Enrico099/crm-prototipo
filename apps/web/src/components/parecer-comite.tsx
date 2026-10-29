import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import type { ParecerEspecialista } from "@/types/api";
import { cn } from "@/lib/utils";

/** Selo resumido: "Aprovada pelo comitê de especialistas (7/7)" */
export function SeloComite({ comite, className }: { comite: ParecerEspecialista[]; className?: string }) {
  const favoraveis = comite.filter((p) => p.aprovado).length;
  return (
    <p className={cn("flex items-center gap-1.5 text-xs text-positivo", className)}>
      <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
      Aprovada pelo comitê de especialistas ({favoraveis}/{comite.length})
    </p>
  );
}

/** Lista de pareceres, um por especialista */
export function ParecerComite({ comite }: { comite: ParecerEspecialista[] }) {
  return (
    <ul className="space-y-1.5" aria-label="Pareceres do comitê de especialistas">
      {comite.map((p) => {
        const Icon = p.aprovado ? CheckCircle2 : XCircle;
        return (
          <li key={p.especialista} className="flex gap-2 text-xs">
            <Icon
              className={cn(
                "h-3.5 w-3.5 shrink-0 mt-0.5",
                p.aprovado ? "text-positivo" : "text-destructive",
              )}
              aria-label={p.aprovado ? "Favorável" : "Contrário"}
            />
            <span>
              <span className="font-medium">{p.nome}:</span>{" "}
              <span className="text-muted-foreground">{p.parecer}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
