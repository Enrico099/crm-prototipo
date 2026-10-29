"use client";

import { useState } from "react";
import Link from "next/link";
import { BellRing, ChevronDown, Info, Loader2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CardGridSkeleton, EmptyState, ErrorState } from "@/components/query-states";
import { ParecerComite, SeloComite } from "@/components/parecer-comite";
import { ThinkingDialog, type ThinkingClienteInput } from "@/components/thinking-dialog";
import { useEnviarOportunidades, useOportunidadesDoDia, useStatusEnvio } from "@/lib/queries";
import { usePermissoes } from "@/lib/permissoes";
import { AVISO_APOIO_DECISAO, perfilColor, perfilLabel } from "@/lib/labels";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OportunidadesDoDia } from "@/types/api";

type Oportunidade = OportunidadesDoDia["oportunidades"][number];

export default function OportunidadesPage() {
  const { data, isLoading, error, refetch, isFetching } = useOportunidadesDoDia();
  const { podeOperar, podeEnviarOportunidades } = usePermissoes();
  const [thinkingCliente, setThinkingCliente] = useState<ThinkingClienteInput | null>(null);

  return (
    <>
      <PageHeader
        title="Oportunidades do dia"
        description="O motor analisa a carteira inteira e cada sugestão passa por um comitê de especialistas. Só aparece aqui o que todos aprovaram."
        actions={
          <>
            {podeEnviarOportunidades && <AvisarAssessores />}
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} aria-hidden />
              Analisar novamente
            </Button>
          </>
        }
      />

      <p className="mb-6 flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-px" aria-hidden />
        {AVISO_APOIO_DECISAO} Nada desta lista é gravado: para formalizar, gere a recomendação pelo
        cliente.
      </p>

      {isLoading && <CardGridSkeleton count={4} />}
      {error && <ErrorState message={error.message} onRetry={() => refetch()} />}

      {data && (
        <>
          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Resumo rotulo="Clientes analisados" valor={data.clientesAnalisados} />
            <Resumo rotulo="Oportunidades aprovadas" valor={data.oportunidades.length} />
            <Resumo rotulo="Barradas pelo comitê" valor={data.reprovadosComite} />
            <Resumo rotulo="Clientes com pendência" valor={data.pendencias.length} />
          </dl>

          {data.oportunidades.length === 0 ? (
            <EmptyState message="Nenhuma oportunidade passou por todo o comitê de especialistas hoje." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
              {data.oportunidades.map((o) => (
                <OportunidadeCard
                  key={`${o.cliente.id}:${o.produtoId}`}
                  oportunidade={o}
                  podeOperar={podeOperar}
                  onGerar={() =>
                    setThinkingCliente({
                      id: o.cliente.id,
                      nome: o.cliente.nome,
                      patrimonio: o.cliente.patrimonio,
                      perfil: o.cliente.perfil,
                    })
                  }
                />
              ))}
            </div>
          )}

          {data.pendencias.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Clientes sem oportunidade hoje</CardTitle>
                <CardDescription>
                  Não puderam ser analisados ou nenhum produto passou pelo comitê
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {data.pendencias.map((p) => (
                    <li key={p.cliente.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                      <Link
                        href={`/clientes/${p.cliente.id}`}
                        className="text-sm font-medium hover:underline sm:w-56 shrink-0 truncate"
                      >
                        {p.cliente.nome}
                      </Link>
                      <span className="text-xs text-muted-foreground">{p.motivo}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <p className="mt-6 text-[11px] text-muted-foreground">
            Análise de {fmt.dateTime(data.geradoEm)}
            {data.engineVersion && (
              <>
                {" "}· Motor <code className="font-mono">{data.engineVersion}</code>
              </>
            )}
          </p>
        </>
      )}

      <ThinkingDialog
        cliente={thinkingCliente}
        open={!!thinkingCliente}
        onOpenChange={(v) => {
          if (!v) setThinkingCliente(null);
        }}
      />
    </>
  );
}

/** Admin: refaz agora o aviso do dia (notificação no sistema e, se configurado, e-mail) */
function AvisarAssessores() {
  const { data: status } = useStatusEnvio(true);
  const enviar = useEnviarOportunidades();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={enviar.isPending}
      title={
        status?.emailConfigurado
          ? "Avisa no sistema e por e-mail"
          : "Avisa no sistema (sininho). E-mail não configurado."
      }
      onClick={() =>
        enviar.mutate(undefined, {
          onSuccess: () =>
            toast.success("Aviso iniciado. Em alguns minutos cada assessor com oportunidade hoje vê a notificação."),
          onError: (e) => toast.error(e.message),
        })
      }
    >
      {enviar.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <BellRing className="h-4 w-4" aria-hidden />
      )}
      Avisar assessores
    </Button>
  );
}

function Resumo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <dt className="rotulo">{rotulo}</dt>
      <dd className="numero-destaque text-2xl mt-2">{valor}</dd>
    </div>
  );
}

function OportunidadeCard({
  oportunidade: o,
  podeOperar,
  onGerar,
}: {
  oportunidade: Oportunidade;
  podeOperar: boolean;
  onGerar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const scorePct = Math.round(o.score * 100);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate">{o.produtoNome}</CardTitle>
            <CardDescription className="mt-1 flex flex-wrap items-center gap-2">
              <Link href={`/clientes/${o.cliente.id}`} className="hover:underline">
                {o.cliente.nome}
              </Link>
              <Badge variant="secondary" className={cn("text-[10px]", perfilColor[o.cliente.perfil])}>
                {perfilLabel[o.cliente.perfil]}
              </Badge>
              <span className="tabular-nums">{fmt.brl(o.cliente.patrimonio)}</span>
            </CardDescription>
          </div>
          <p className="text-right shrink-0">
            <span className="numero-destaque text-2xl">{scorePct}</span>
            <span className="text-sm text-muted-foreground">/100</span>
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm leading-relaxed text-foreground/90">{o.justificativa}</p>
        <SeloComite comite={o.comite} />
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="w-full flex items-center justify-between rounded text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Ver pareceres dos especialistas
          </span>
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", aberto && "rotate-180")} aria-hidden />
        </button>
        {aberto && (
          <div className="pt-3 border-t">
            <ParecerComite comite={o.comite} />
          </div>
        )}
        {podeOperar && (
          <div className="pt-1">
            <Button size="sm" onClick={onGerar}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Gerar recomendação formal
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
