"use client";

import { useState } from "react";
import { Pencil, Plus, Power, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CardGridSkeleton,
  EmptyState,
  ErrorState,
} from "@/components/query-states";
import { Button } from "@/components/ui/button";
import { ProdutoFormDialog } from "@/components/forms/produto-form-dialog";
import { ConfirmarDialog } from "@/components/confirmar-dialog";
import { useAtualizarProduto, useProdutos } from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { usePermissoes } from "@/lib/permissoes";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { categoriaLabel, perfilLabel, tributacaoLabel } from "@/lib/labels";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Produto } from "@/types/api";

function RiscoIndicator({ risco }: { risco: number }) {
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`Risco ${risco} de 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          aria-hidden
          className={`h-1.5 w-3 rounded-sm ${i < risco ? "bg-amber-500" : "bg-muted"}`}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1" aria-hidden>
        {risco}/5
      </span>
    </div>
  );
}

export default function ProdutosPage() {
  const { podeGerirCatalogo } = usePermissoes();
  const [q, setQ] = useState("");
  const busca = useDebouncedValue(q.trim(), 300);
  const [mostrarInativos, setMostrarInativos] = useState(false);
  // null = fechado; objeto sem produto = cadastro novo
  const [form, setForm] = useState<{ produto?: Produto } | null>(null);
  const [alternando, setAlternando] = useState<Produto | null>(null);
  const atualizar = useAtualizarProduto();
  const { data, isLoading, error, refetch } = useProdutos({
    limit: 100,
    // Inativos só aparecem pra quem cura o catálogo (pra poder reativar)
    ativo: podeGerirCatalogo && mostrarInativos ? undefined : true,
    q: busca || undefined,
  });

  async function alternarAtivo(p: Produto) {
    try {
      await atualizar.mutateAsync({ id: p.id, ativo: !p.ativo });
      toast.success(p.ativo ? "Produto desativado" : "Produto reativado");
      setAlternando(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível alterar o produto");
    }
  }

  return (
    <>
      <PageHeader
        title="Catálogo de Produtos"
        description="Produtos ativos disponíveis para alocação e para o motor de recomendação"
        actions={
          podeGerirCatalogo && (
            <Button size="sm" onClick={() => setForm({})}>
              <Plus className="h-4 w-4" aria-hidden />
              Novo produto
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center mb-4">
        <div className="relative w-full max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Buscar produto por nome, emissor ou ticker"
            placeholder="Buscar por nome, emissor ou ticker…"
            className="pl-9 h-9"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {podeGerirCatalogo && (
          <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={mostrarInativos}
              onChange={(e) => setMostrarInativos(e.target.checked)}
            />
            Mostrar inativos
          </label>
        )}
      </div>

      {isLoading && <CardGridSkeleton count={6} />}
      {error && <ErrorState message={error.message} onRetry={() => refetch()} />}
      {data && data.data.length === 0 && (
        <EmptyState message={busca ? "Nenhum produto encontrado para a busca." : mostrarInativos ? "Nenhum produto no catálogo." : "Nenhum produto ativo no catálogo."} />
      )}

      {data && data.data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {data.data.map((p) => (
            <Card key={p.id} className={cn(!p.ativo && "opacity-70")}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      <Badge variant="outline" className="text-xs">
                        {categoriaLabel[p.categoria]}
                      </Badge>
                      {!p.ativo && (
                        <Badge variant="secondary" className="text-xs">
                          Inativo
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold tracking-tight leading-tight">{p.nome}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{p.emissor}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Rentab. a.a.</p>
                    <p className="text-lg font-semibold text-positivo leading-none mt-1 tabular-nums">
                      {fmt.pct(p.rentabilidadeAno)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Liquidez</dt>
                    <dd className="font-medium">{p.liquidez}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Perfil mínimo</dt>
                    <dd className="font-medium">{perfilLabel[p.perfilMinimo]}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Taxa de administração</dt>
                    <dd className="font-medium">
                      {p.taxaAdmin === null ? "Sem taxa" : `${fmt.dec(p.taxaAdmin)}% a.a.`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tributação</dt>
                    <dd className="font-medium">{tributacaoLabel[p.tributacao]}</dd>
                  </div>
                </dl>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Risco</p>
                  <RiscoIndicator risco={p.risco} />
                </div>
                {podeGerirCatalogo && (
                  <div className="flex gap-2 border-t pt-3">
                    <Button size="sm" variant="outline" onClick={() => setForm({ produto: p })} aria-label={`Editar ${p.nome}`}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className={cn(p.ativo && "text-destructive")}
                      onClick={() => (p.ativo ? setAlternando(p) : alternarAtivo(p))}
                      disabled={atualizar.isPending}
                      aria-label={`${p.ativo ? "Desativar" : "Reativar"} ${p.nome}`}
                    >
                      <Power className="h-3.5 w-3.5" aria-hidden />
                      {p.ativo ? "Desativar" : "Reativar"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && data.meta.total > data.data.length && (
        <p className="text-xs text-muted-foreground mt-4">
          Mostrando {data.data.length} de {data.meta.total}. Refine a busca para ver outros produtos.
        </p>
      )}

      <ProdutoFormDialog open={!!form} onOpenChange={(v) => !v && setForm(null)} produto={form?.produto} />

      <ConfirmarDialog
        open={!!alternando}
        onOpenChange={(v) => !v && setAlternando(null)}
        titulo="Desativar produto?"
        descricao={`${alternando?.nome ?? ""} sai do catálogo e do motor de recomendação. Recomendações pendentes deste produto não poderão ser aprovadas. Posições existentes não mudam.`}
        confirmar="Desativar"
        pendente={atualizar.isPending}
        onConfirmar={() => alternando && alternarAtivo(alternando)}
      />
    </>
  );
}
