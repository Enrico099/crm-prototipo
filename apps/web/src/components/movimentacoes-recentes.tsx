"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight, History } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState, TableSkeleton } from "@/components/query-states";
import { useMovimentacoes } from "@/lib/queries";
import { tipoMovimentacaoLabel } from "@/lib/labels";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";

const POR_PAGINA = 10;

/** Extrato de movimentações do cliente (mais recentes primeiro) */
export function MovimentacoesRecentes({ clienteId }: { clienteId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, error, refetch } = useMovimentacoes(clienteId, { page, limit: POR_PAGINA });

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" aria-hidden />
          Movimentações
        </CardTitle>
        <CardDescription>Aplicações e resgates registrados · valores a custo</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading && <TableSkeleton rows={3} />}
        {error && <ErrorState message={error.message} onRetry={() => refetch()} />}
        {data && data.data.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhuma movimentação registrada.</p>
        )}
        {data && data.data.length > 0 && (
          <ul className="divide-y">
            {data.data.map((m) => {
              const saida = m.tipo === "RESGATE";
              const Icone = saida ? ArrowUpRight : ArrowDownLeft;
              return (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        saida ? "bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-200" : "bg-blue-100 text-blue-800 dark:bg-blue-400/15 dark:text-blue-200",
                      )}
                      aria-hidden
                    >
                      <Icone className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {tipoMovimentacaoLabel[m.tipo]} · {m.produto.nome}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {fmt.date(m.data)}
                        {m.registradoPor && ` · ${m.registradoPor.nome}`}
                        {m.observacao && ` · ${m.observacao}`}
                      </p>
                      {m.desenquadrada && (
                        <Badge variant="outline" className="mt-1 gap-1 border-aviso-borda text-[10px] text-aviso-foreground">
                          <AlertTriangle className="h-3 w-3" aria-hidden />
                          Desenquadrada, com ciência do cliente
                        </Badge>
                      )}
                    </div>
                  </div>
                  {/* Sinal em texto, não só na cor */}
                  <p className="shrink-0 text-sm font-medium tabular-nums">
                    {saida ? "−" : "+"} {fmt.brlPrecise(m.valor)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {data && data.meta.totalPages > 1 && (
          <nav className="flex items-center justify-between pt-3 border-t" aria-label="Paginação de movimentações">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <span className="text-xs text-muted-foreground tabular-nums">
              Página {data.meta.page} de {data.meta.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </nav>
        )}
      </CardContent>
    </Card>
  );
}
