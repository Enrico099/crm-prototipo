"use client";

import { useRouter } from "next/navigation";
import { Bell, Target } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonVariants } from "@/components/ui/button";
import { useMarcarNotificacaoLida, useMarcarTodasLidas, useNotificacoes } from "@/lib/queries";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Notificacao } from "@/types/api";

/** Sininho do topo: avisos do sistema, como as oportunidades do dia */
export function Notificacoes({ habilitado }: { habilitado: boolean }) {
  const router = useRouter();
  const { data } = useNotificacoes(habilitado);
  const marcarLida = useMarcarNotificacaoLida();
  const marcarTodas = useMarcarTodasLidas();
  const naoLidas = data?.naoLidas ?? 0;
  const itens = data?.itens ?? [];

  function abrir(n: Notificacao) {
    if (!n.lidaEm) marcarLida.mutate(n.id);
    if (n.link) router.push(n.link);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
        disabled={!habilitado}
        aria-label={naoLidas > 0 ? `Notificações: ${naoLidas} não lida(s)` : "Notificações"}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden />
        {naoLidas > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-[10px] font-semibold leading-4 text-white text-center tabular-nums">
            {naoLidas > 9 ? "9+" : naoLidas}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground">Notificações</span>
            {naoLidas > 0 && (
              <button
                type="button"
                onClick={() => marcarTodas.mutate()}
                className="text-xs font-normal text-primary hover:underline"
              >
                Marcar todas como lidas
              </button>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {itens.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Nenhuma notificação por enquanto.</p>
        ) : (
          <DropdownMenuGroup className="max-h-96 overflow-y-auto">
            {itens.map((n) => (
              <DropdownMenuItem key={n.id} onClick={() => abrir(n)} className="items-start gap-3 py-2.5">
                <Target
                  className={cn("h-4 w-4 shrink-0 mt-0.5", n.lidaEm ? "text-muted-foreground" : "text-primary")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", !n.lidaEm && "font-semibold")}>{n.titulo}</span>
                  <span className="block text-xs text-muted-foreground whitespace-normal">{n.mensagem}</span>
                  <span className="block text-[11px] text-muted-foreground mt-1">{fmt.dateTime(n.criadoEm)}</span>
                </span>
                {!n.lidaEm && <span className="h-2 w-2 shrink-0 mt-1.5 rounded-full bg-primary" aria-label="Não lida" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
