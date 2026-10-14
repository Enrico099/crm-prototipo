"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { EmptyState, ErrorState } from "@/components/query-states";
import { usePermissoes } from "@/lib/permissoes";
import {
  useAplicarSuitability,
  useClienteDetalhado,
  useQuestionario,
} from "@/lib/queries";
import { ApiError } from "@/lib/api";
import { fmt } from "@/lib/format";
import { perfilColor, perfilLabel } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AplicarSuitabilityResult } from "@/types/api";

export default function SuitabilityFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: cliente } = useClienteDetalhado(id);
  const { data: questionario, isLoading, error } = useQuestionario();
  const aplicar = useAplicarSuitability();
  const permissoes = usePermissoes();

  const [respostas, setRespostas] = useState<Record<string, string>>({});
  const [resultado, setResultado] = useState<AplicarSuitabilityResult | null>(null);

  if (!permissoes.carregando && !permissoes.podeOperar) {
    return (
      <>
        <PageHeader title="Suitability" />
        <EmptyState message="Seu perfil de acesso permite consultar, mas não aplicar suitability. Procure o assessor responsável." />
      </>
    );
  }

  if (isLoading || permissoes.carregando) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (error || !questionario) {
    return <ErrorState message={error?.message} />;
  }

  const totalPerguntas = questionario.perguntas.length;
  const respondidas = Object.keys(respostas).length;
  const completo = respondidas === totalPerguntas;
  const progresso = (respondidas / totalPerguntas) * 100;

  function setResposta(perguntaId: string, opcaoId: string) {
    setRespostas((prev) => ({ ...prev, [perguntaId]: opcaoId }));
  }

  async function handleSubmit() {
    if (!completo) return;
    try {
      const res = await aplicar.mutateAsync({ clienteId: id, respostas });
      setResultado(res);
      if (res.mudou) {
        toast.success(
          `Perfil atualizado: ${res.perfilAnterior.toLowerCase()} → ${res.perfilNovo.toLowerCase()}`,
          { description: `Pontuação ${res.suitability.pontuacao}/100` },
        );
      } else {
        toast.success("Suitability registrada", {
          description: `Perfil confirmado: ${res.perfilNovo.toLowerCase()} (${res.suitability.pontuacao}/100)`,
        });
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Erro ao aplicar suitability");
    }
  }

  // Tela de resultado
  if (resultado) {
    return (
      <ResultadoCard
        resultado={resultado}
        clienteNome={cliente?.nome ?? "cliente"}
        clienteId={id}
        onRefazer={() => {
          setRespostas({});
          setResultado(null);
        }}
        onVoltar={() => router.push(`/clientes/${id}`)}
      />
    );
  }

  return (
    <>
      <Link
        href={`/clientes/${id}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft className="h-3 w-3" />
        Voltar para {cliente?.nome ?? "cliente"}
      </Link>

      <PageHeader
        title="Suitability"
        description={`Questionário ${questionario.versao} · ${totalPerguntas} perguntas`}
      />

      {/* Barra de progresso */}
      <div className="mb-6 sticky top-16 bg-background/95 backdrop-blur-xl pt-2 pb-3 -mx-6 px-6 md:-mx-8 md:px-8 z-10 border-b">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs text-muted-foreground font-medium">
            {respondidas} de {totalPerguntas} respondidas
          </p>
          <p className="text-xs tabular-nums">
            {Math.round(progresso)}%
          </p>
        </div>
        <Progress value={progresso} className="h-1.5" />
      </div>

      <div className="space-y-4">
        {questionario.perguntas.map((p, idx) => {
          const selecionada = respostas[p.id];
          return (
            <Card key={p.id}>
              <CardHeader>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground font-mono tabular-nums" aria-hidden>
                    {String(idx + 1).padStart(2, "0")}.
                  </span>
                  <CardTitle id={`pergunta-${p.id}`} className="text-base flex-1">
                    {p.pergunta}
                  </CardTitle>
                  {selecionada && (
                    <span className="text-positivo">
                      <Check className="h-4 w-4" aria-label="Respondida" />
                    </span>
                  )}
                </div>
                {p.ajuda && (
                  <CardDescription className="ml-7">{p.ajuda}</CardDescription>
                )}
              </CardHeader>
              <CardContent
                className="ml-7 space-y-1.5"
                role="radiogroup"
                aria-labelledby={`pergunta-${p.id}`}
              >
                {p.opcoes.map((o) => {
                  const ativo = selecionada === o.id;
                  return (
                    <label
                      key={o.id}
                      className={cn(
                        "w-full cursor-pointer flex items-center gap-3 px-3 py-2.5 rounded-md border transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                        ativo
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/40",
                      )}
                    >
                      <input
                        type="radio"
                        name={p.id}
                        value={o.id}
                        checked={ativo}
                        onChange={() => setResposta(p.id, o.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "h-4 w-4 rounded-full border-2 shrink-0 transition-colors",
                          ativo
                            ? "border-primary bg-primary"
                            : "border-muted-foreground/40",
                        )}
                      />
                      <span className="text-sm flex-1">{o.label}</span>
                    </label>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-0 bg-background/95 backdrop-blur-xl -mx-6 px-6 md:-mx-8 md:px-8 py-4 border-t mt-6 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {completo
            ? "Tudo respondido — pode finalizar"
            : `Falta${totalPerguntas - respondidas > 1 ? "m" : ""} ${totalPerguntas - respondidas} ${totalPerguntas - respondidas > 1 ? "perguntas" : "pergunta"}`}
        </p>
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={!completo || aplicar.isPending}
        >
          {aplicar.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          Calcular perfil
        </Button>
      </div>
    </>
  );
}

// ============================================================
// Card de resultado
// ============================================================

function ResultadoCard({
  resultado,
  clienteNome,
  clienteId,
  onRefazer,
  onVoltar,
}: {
  resultado: AplicarSuitabilityResult;
  clienteNome: string;
  clienteId: string;
  onRefazer: () => void;
  onVoltar: () => void;
}) {
  const pontuacao = resultado.suitability.pontuacao;
  return (
    <>
      <PageHeader title="Suitability aplicada" />
      <Card className="max-w-2xl mx-auto">
        <CardContent className="py-10 text-center space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-semibold">
              Pontuação
            </p>
            <p className="text-5xl font-semibold tabular-nums mt-2">
              {pontuacao}
              <span className="text-2xl text-muted-foreground">/100</span>
            </p>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-2">
              Perfil calculado
            </p>
            <Badge
              className={cn("text-base px-3 py-1", perfilColor[resultado.perfilNovo])}
              variant="secondary"
            >
              {perfilLabel[resultado.perfilNovo]}
            </Badge>
            {resultado.mudou && (
              <p className="text-xs text-muted-foreground mt-3">
                Era{" "}
                <Badge
                  className={cn("mx-1", perfilColor[resultado.perfilAnterior])}
                  variant="secondary"
                >
                  {perfilLabel[resultado.perfilAnterior]}
                </Badge>
                — perfil de <strong>{clienteNome}</strong> foi atualizado.
              </p>
            )}
            {!resultado.mudou && (
              <p className="text-xs text-muted-foreground mt-3">
                Mesmo perfil de antes — nenhuma mudança.
              </p>
            )}
          </div>

          <div className="text-xs text-muted-foreground border-t pt-4">
            Válida até {fmt.date(resultado.suitability.validoAte)} (24 meses) · Questionário{" "}
            {resultado.suitability.versaoQuestionario} · Registrada na trilha de auditoria
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={onRefazer}>
              Refazer
            </Button>
            <Button size="sm" onClick={onVoltar}>
              Voltar para {clienteNome}
            </Button>
            <Link
              href={`/clientes/${clienteId}`}
              className="text-xs text-muted-foreground hover:text-foreground ml-2"
            >
              Gerar recomendações para este cliente →
            </Link>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
