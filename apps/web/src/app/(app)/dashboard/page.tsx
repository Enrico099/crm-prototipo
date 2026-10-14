"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  DollarSign,
  FileCheck2,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState, TableSkeleton } from "@/components/query-states";
import { useDashboardResumo, useInteracoes, useSerieCarteira } from "@/lib/queries";
import { perfilLabel, tipoInteracaoLabel } from "@/lib/labels";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DashboardCharts } from "./_components/dashboard-charts";

export default function DashboardPage() {
  const resumo = useDashboardResumo();
  const interacoes = useInteracoes({ limit: 5 });
  const serie = useSerieCarteira(12);
  const r = resumo.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Visão atual da sua carteira — AUM, pipeline e pendências"
        actions={
          <Link href="/recomendacao" className={cn(buttonVariants({ size: "sm" }))}>
            <Sparkles className="h-4 w-4" aria-hidden />
            Gerar recomendação
          </Link>
        }
      />

      {resumo.error ? (
        <div className="mb-6">
          <ErrorState message={resumo.error.message} onRetry={() => resumo.refetch()} />
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {!r ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[134px]" />)
          ) : (
            <>
              <KpiCard
                label="AUM"
                value={fmt.brl(r.aumTotal)}
                icon={DollarSign}
                tone="blue"
                hint={`Aplicado na casa, a custo · patrimônio declarado: ${fmt.brl(r.patrimonioDeclarado)}`}
              />
              <KpiCard label="Clientes ativos" value={String(r.clientesAtivos)} icon={Users} tone="emerald" />
              <KpiCard
                label="Leads abertos"
                value={String(r.leadsAbertos)}
                icon={TrendingUp}
                tone="amber"
                hint={`${fmt.brl(r.valorPipeline)} em valor estimado`}
              />
              <KpiCard
                label="Recomendações pendentes"
                value={String(r.recomendacoesPendentes)}
                icon={Sparkles}
                tone="violet"
                hint="Aguardando decisão do assessor"
              />
            </>
          )}
        </div>
      )}

      <DashboardCharts
        serie={serie.data?.meses ?? null}
        erroSerie={serie.error?.message}
        distribuicaoPerfil={
          r ? r.distribuicaoPerfil.map((p) => ({ ...p, perfil: perfilLabel[p.perfil] })) : null
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Interações recentes</CardTitle>
            <CardDescription>Últimos contatos com clientes</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {interacoes.isLoading && <TableSkeleton rows={4} />}
            {interacoes.error && <ErrorState message={interacoes.error.message} />}
            {interacoes.data && interacoes.data.data.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                Nenhuma interação registrada ainda.
              </p>
            )}
            {interacoes.data && interacoes.data.data.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="hidden sm:table-cell">Assunto</TableHead>
                    <TableHead className="text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interacoes.data.data.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-medium">
                        <Link href={`/clientes/${i.cliente.id}`} className="hover:underline">
                          {i.cliente.nome}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{tipoInteracaoLabel[i.tipo]}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {i.assunto}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground text-sm">
                        {fmt.date(i.data)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pendências</CardTitle>
            <CardDescription>O que precisa da sua atenção</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!r ? (
              <>
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </>
            ) : (
              <>
                <Pendencia
                  href="/recomendacao"
                  icon={Sparkles}
                  quantidade={r.recomendacoesPendentes}
                  texto="recomendação(ões) aguardando aprovação ou recusa"
                  vazio="Nenhuma recomendação pendente"
                />
                <Pendencia
                  href="/leads"
                  icon={FileCheck2}
                  quantidade={r.clientesSemSuitabilityValida}
                  texto="cliente(s) ativo(s) sem suitability válida — não podem receber recomendação"
                  vazio="Todos os clientes ativos têm suitability válida"
                  alerta
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Pendencia({
  href,
  icon: Icon,
  quantidade,
  texto,
  vazio,
  alerta,
}: {
  href: string;
  icon: typeof Sparkles;
  quantidade: number;
  texto: string;
  vazio: string;
  alerta?: boolean;
}) {
  if (quantidade === 0) {
    return (
      <div className="flex items-center gap-3 rounded-md border border-border p-3 text-sm text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {vazio}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-muted/50",
        alerta ? "border-aviso-borda bg-aviso" : "border-border",
      )}
    >
      {alerta ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-aviso-foreground" aria-hidden />
      ) : (
        <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
      )}
      <span className="flex-1">
        <strong className="tabular-nums">{quantidade}</strong> {texto}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
    </Link>
  );
}
