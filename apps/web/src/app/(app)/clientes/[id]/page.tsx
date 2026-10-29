"use client";

import { use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileCheck2,
  Mail,
  MapPin,
  ArrowLeftRight,
  Pencil,
  Phone,
  Power,
  Sparkles,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-states";
import { ThinkingDialog } from "@/components/thinking-dialog";
import { RecomendacaoDetalheDialog } from "@/components/recomendacao-detalhe-dialog";
import { ClienteFormDialog } from "@/components/forms/cliente-form-dialog";
import { MovimentacaoDialog, type MovimentacaoInicial } from "@/components/forms/movimentacao-dialog";
import { MovimentacoesRecentes } from "@/components/movimentacoes-recentes";
import { ConfirmarDialog } from "@/components/confirmar-dialog";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import {
  useAtualizarCliente,
  useClienteDetalhado,
  useInativarCliente,
} from "@/lib/queries";
import { usePermissoes } from "@/lib/permissoes";
import {
  categoriaLabel,
  perfilColor,
  perfilLabel,
  statusClienteLabel,
  statusRecomendacaoLabel,
} from "@/lib/labels";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CategoriaProduto, StatusRecomendacao } from "@/types/api";

const categoriaCor: Record<CategoriaProduto, string> = {
  RENDA_FIXA: "bg-emerald-500",
  RENDA_VARIAVEL: "bg-blue-500",
  FUNDOS: "bg-violet-500",
  PREVIDENCIA: "bg-amber-500",
  ESTRUTURADOS: "bg-rose-500",
  CAMBIO: "bg-slate-500",
};

const statusBadgeVariant: Record<
  StatusRecomendacao,
  "default" | "secondary" | "outline" | "destructive"
> = {
  PENDENTE: "outline",
  APROVADA: "default",
  RECUSADA: "destructive",
  ATIVA: "secondary",
  EXPIRADA: "secondary",
};

function initials(nome: string) {
  return nome
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}

export default function ClienteDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: cliente, isLoading, error, refetch } = useClienteDetalhado(id);
  const { podeOperar, podeInativarCliente } = usePermissoes();
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [editando, setEditando] = useState(false);
  const [confirmandoStatus, setConfirmandoStatus] = useState(false);
  const [movimentando, setMovimentando] = useState<MovimentacaoInicial | null>(null);
  const inativar = useInativarCliente();
  const atualizar = useAtualizarCliente(id);
  const [recomendacaoDetalheId, setRecomendacaoDetalheId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (error || !cliente) {
    return (
      <>
        <PageHeader title="Cliente" />
        <ErrorState message={error?.message} onRetry={() => refetch()} />
      </>
    );
  }

  const suitabilityValida = !!cliente.suitability && !cliente.suitability.vencida;
  const motivoBloqueio = !cliente.suitability
    ? "Aplique a suitability antes de gerar recomendações."
    : cliente.suitability.vencida
      ? "A suitability está vencida. Reaplique antes de gerar recomendações."
      : cliente.status === "INATIVO" || cliente.status === "BLOQUEADO"
        ? `Cliente ${cliente.status.toLowerCase()} não recebe recomendações.`
        : null;

  // Calcula totais e % de alocação
  const totalAlocado = cliente.posicoes.reduce((acc, p) => acc + p.valor, 0);
  const naoAlocado = Math.max(0, cliente.patrimonio - totalAlocado);
  // Base dos percentuais: patrimônio declarado, ou o total alocado se for maior
  // (cadastro desatualizado). Evita divisão por zero e barras acima de 100%.
  const base = Math.max(cliente.patrimonio, totalAlocado);
  const pctDe = (v: number) => (base > 0 ? (v / base) * 100 : 0);

  // Agrupa posições por categoria
  const porCategoria = cliente.posicoes.reduce<
    Record<CategoriaProduto, number>
  >(
    (acc, p) => {
      acc[p.produto.categoria] = (acc[p.produto.categoria] ?? 0) + p.valor;
      return acc;
    },
    {} as Record<CategoriaProduto, number>,
  );

  const pendentes = cliente.recomendacoes.filter((r) => r.status === "PENDENTE");
  const inativo = cliente.status === "INATIVO";
  const podeMovimentar = podeOperar && cliente.status !== "BLOQUEADO";

  async function alternarStatus() {
    try {
      if (inativo) {
        await atualizar.mutateAsync({ status: "ATIVO" });
        toast.success("Cliente reativado");
      } else {
        await inativar.mutateAsync(id);
        toast.success("Cliente inativado");
      }
      setConfirmandoStatus(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Não foi possível alterar o status do cliente");
    }
  }

  return (
    <>
      <Link
        href="/leads"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft className="h-3 w-3" />
        Voltar para Leads & Clientes
      </Link>

      {/* Header card */}
      <Card className="mb-4">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-start gap-6">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg bg-primary text-primary-foreground">
                {initials(cliente.nome)}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <h1 className="titulo-display text-[34px] leading-none">
                  {cliente.nome}
                </h1>
                <Badge
                  className={perfilColor[cliente.perfil]}
                  variant="secondary"
                >
                  {perfilLabel[cliente.perfil]}
                </Badge>
                <Badge variant={cliente.status === "ATIVO" ? "default" : "outline"}>
                  {statusClienteLabel[cliente.status]}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                CPF {cliente.cpfMasked} · Cliente desde{" "}
                {fmt.date(cliente.createdAt)}
              </p>

              <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3 w-3" />
                  {cliente.email}
                </span>
                {cliente.telefone && (
                  <span className="inline-flex items-center gap-1.5">
                    <Phone className="h-3 w-3" />
                    {cliente.telefone}
                  </span>
                )}
                {cliente.cidade && (
                  <span className="inline-flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    {cliente.cidade}
                    {cliente.uf && `, ${cliente.uf}`}
                  </span>
                )}
                {cliente.responsavel && (
                  <span>Assessor: {cliente.responsavel.nome}</span>
                )}
              </div>

              {(podeOperar || podeInativarCliente) && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {podeOperar && (
                    <Button size="sm" variant="outline" onClick={() => setEditando(true)}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Editar dados
                    </Button>
                  )}
                  {podeInativarCliente && (
                    <Button
                      size="sm"
                      variant={inativo ? "outline" : "ghost"}
                      className={cn(!inativo && "text-destructive")}
                      onClick={() => setConfirmandoStatus(true)}
                    >
                      <Power className="h-3.5 w-3.5" aria-hidden />
                      {inativo ? "Reativar" : "Inativar"}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div className="text-right">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                Patrimônio
              </p>
              <p className="numero-destaque text-[30px] leading-none mt-2">
                {fmt.brl(cliente.patrimonio)}
              </p>
              {podeOperar && (
                <>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => setThinkingOpen(true)}
                    disabled={!!motivoBloqueio}
                    aria-describedby={motivoBloqueio ? "motivo-bloqueio" : undefined}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden />
                    Gerar recomendação
                  </Button>
                  {motivoBloqueio && (
                    <p id="motivo-bloqueio" className="text-[11px] text-aviso-foreground mt-1.5 max-w-[220px] md:ml-auto">
                      {motivoBloqueio}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Carteira */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Wallet className="h-4 w-4" />
                  Carteira atual
                </CardTitle>
                <CardDescription>
                  {cliente.posicoes.length} posições · {fmt.brl(totalAlocado)} alocado
                  {naoAlocado > 0 && ` · ${fmt.brl(naoAlocado)} disponível`}
                </CardDescription>
              </div>
              {podeMovimentar && (
                <Button size="sm" variant="outline" onClick={() => setMovimentando({})}>
                  <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                  Registrar movimentação
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {cliente.posicoes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                Cliente ainda sem alocações.
              </p>
            )}

            {/* Barra horizontal mostrando % por categoria */}
            {cliente.posicoes.length > 0 && (
              <>
                <div className="space-y-2">
                  <div className="flex h-2 rounded-full overflow-hidden bg-muted">
                    {(Object.entries(porCategoria) as [CategoriaProduto, number][]).map(
                      ([cat, v]) => {
                        const pct = pctDe(v);
                        return (
                          <div
                            key={cat}
                            className={cn("h-full", categoriaCor[cat])}
                            style={{ width: `${pct}%` }}
                            title={`${categoriaLabel[cat]} — ${pct.toFixed(0)}%`}
                          />
                        );
                      },
                    )}
                    {naoAlocado > 0 && (
                      <div
                        className="h-full bg-muted-foreground/20"
                        style={{
                          width: `${pctDe(naoAlocado)}%`,
                        }}
                      />
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {(Object.entries(porCategoria) as [CategoriaProduto, number][]).map(
                      ([cat, v]) => {
                        const pct = pctDe(v);
                        return (
                          <span key={cat} className="inline-flex items-center gap-1.5">
                            <span
                              className={cn("h-2 w-2 rounded-full", categoriaCor[cat])}
                            />
                            {categoriaLabel[cat]} {pct.toFixed(0)}%
                          </span>
                        );
                      },
                    )}
                    {naoAlocado > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-muted-foreground/20" />
                        Disponível {pctDe(naoAlocado).toFixed(0)}%
                      </span>
                    )}
                  </div>
                </div>

                <div className="border-t pt-3 space-y-2">
                  {cliente.posicoes.map((pos) => {
                    const pct = pctDe(pos.valor);
                    return (
                      <div
                        key={pos.id}
                        className="flex items-center justify-between gap-3 py-1.5"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={cn(
                              "h-2 w-2 rounded-full shrink-0",
                              categoriaCor[pos.produto.categoria],
                            )}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {pos.produto.nome}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {pos.produto.emissor} ·{" "}
                              {categoriaLabel[pos.produto.categoria]}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium tabular-nums">
                            {fmt.brl(pos.valor)}
                          </p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {pct.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Suitability */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileCheck2 className="h-4 w-4" />
              Suitability
            </CardTitle>
            <CardDescription>Perfil declarado pelo cliente</CardDescription>
          </CardHeader>
          <CardContent>
            {cliente.suitability ? (
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Perfil calculado</p>
                  <Badge
                    className={cn("mt-1", perfilColor[cliente.suitability.perfilCalculado])}
                    variant="secondary"
                  >
                    {perfilLabel[cliente.suitability.perfilCalculado]}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Pontuação</p>
                    <p className="font-medium tabular-nums">
                      {cliente.suitability.pontuacao} / 100
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Versão</p>
                    <p className="font-medium">{cliente.suitability.versaoQuestionario}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Aplicado em</p>
                    <p className="font-medium">{fmt.date(cliente.suitability.aplicadoEm)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Validade</p>
                    <p className={cn("font-medium", cliente.suitability.vencida && "text-destructive")}>
                      {fmt.date(cliente.suitability.validoAte)}
                      {cliente.suitability.vencida && " (vencida)"}
                    </p>
                  </div>
                  {cliente.suitability.aplicadoPor && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Aplicada por</p>
                      <p className="font-medium">{cliente.suitability.aplicadoPor.nome}</p>
                    </div>
                  )}
                </div>
                {cliente.suitability.vencida && (
                  <p className="rounded-md border border-aviso-borda bg-aviso p-2 text-xs text-aviso-foreground" role="status">
                    Suitability vencida: o cliente não pode receber novas recomendações até reaplicar.
                  </p>
                )}
                {podeOperar && (
                  <Link
                    href={`/clientes/${id}/suitability`}
                    className={cn(
                      buttonVariants({ variant: suitabilityValida ? "outline" : "default", size: "sm" }),
                      "w-full",
                    )}
                  >
                    Reaplicar questionário
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Cliente ainda não tem suitability aplicada.
                </p>
                {podeOperar && (
                  <Link
                    href={`/clientes/${id}/suitability`}
                    className={cn(buttonVariants({ size: "sm" }), "w-full")}
                  >
                    Aplicar agora
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <MovimentacoesRecentes clienteId={id} />

      {/* Recomendações */}
      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" />
                Recomendações da IA
              </CardTitle>
              <CardDescription>
                {pendentes.length} pendentes · {cliente.recomendacoes.length} totais
              </CardDescription>
            </div>
            <Link
              href="/recomendacao"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Ver todas →
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {cliente.recomendacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma recomendação ainda. Clique em{" "}
              <span className="font-medium">Gerar recomendação</span> acima.
            </p>
          ) : (
            <div className="space-y-2">
              {cliente.recomendacoes.map((r) => {
                const scorePct = Math.round(r.score * 100);
                const executavel = r.status === "APROVADA" && podeMovimentar && !inativo;
                return (
                  <div key={r.id} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => setRecomendacaoDetalheId(r.id)}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-md border border-border hover:bg-muted/40 hover:border-primary/30 transition-all cursor-pointer"
                    >
                      <div className="w-14 text-center shrink-0">
                        <p className="text-lg font-semibold tabular-nums">
                          {scorePct}
                        </p>
                        <p className="text-[10px] text-muted-foreground">/100</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {r.produto.nome}{" "}
                          <Badge
                            variant="outline"
                            className="text-[10px] ml-1 font-normal"
                          >
                            {categoriaLabel[r.produto.categoria]}
                          </Badge>
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.justificativa}
                        </p>
                      </div>
                      <Badge
                        variant={statusBadgeVariant[r.status]}
                        className="shrink-0 text-xs"
                      >
                        {statusRecomendacaoLabel[r.status]}
                      </Badge>
                    </button>
                    {executavel && (
                      <Button
                        size="sm"
                        className="shrink-0"
                        onClick={() =>
                          setMovimentando({ tipo: "APLICACAO", produtoId: r.produto.id, recomendacaoId: r.id })
                        }
                        aria-label={`Registrar aplicação em ${r.produto.nome}`}
                      >
                        Registrar aplicação
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <ThinkingDialog
        cliente={{
          id: cliente.id,
          nome: cliente.nome,
          patrimonio: cliente.patrimonio,
          posicoesCount: cliente.posicoes.length,
          perfil: cliente.perfil,
        }}
        open={thinkingOpen}
        onOpenChange={setThinkingOpen}
      />

      <MovimentacaoDialog
        cliente={cliente}
        open={!!movimentando}
        onOpenChange={(v) => !v && setMovimentando(null)}
        inicial={movimentando ?? undefined}
      />

      <ClienteFormDialog open={editando} onOpenChange={setEditando} cliente={cliente} />

      <ConfirmarDialog
        open={confirmandoStatus}
        onOpenChange={setConfirmandoStatus}
        titulo={inativo ? "Reativar cliente?" : "Inativar cliente?"}
        descricao={
          inativo
            ? `${cliente.nome} volta a ficar ativo e pode receber recomendações (com suitability válida).`
            : `${cliente.nome} deixa de receber recomendações. Suitability, recomendações e histórico ficam guardados.`
        }
        confirmar={inativo ? "Reativar" : "Inativar"}
        destrutivo={!inativo}
        pendente={inativar.isPending || atualizar.isPending}
        onConfirmar={alternarStatus}
      />

      <RecomendacaoDetalheDialog
        recomendacaoId={recomendacaoDetalheId}
        open={!!recomendacaoDetalheId}
        onOpenChange={(v) => {
          if (!v) setRecomendacaoDetalheId(null);
        }}
      />
    </>
  );
}
