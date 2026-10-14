"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/query-states";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadDetalheDialog } from "@/components/lead-detalhe-dialog";
import { LeadFormDialog } from "@/components/forms/lead-form-dialog";
import { ConverterLeadDialog } from "@/components/forms/converter-lead-dialog";
import { useLeadsBoard } from "@/lib/queries";
import { usePermissoes } from "@/lib/permissoes";
import { estagioLabel } from "@/lib/labels";
import { fmt } from "@/lib/format";
import type { EstagioPipeline, Lead } from "@/types/api";

const estagioCor: Record<EstagioPipeline, string> = {
  PROSPECCAO: "border-slate-300",
  QUALIFICACAO: "border-blue-400",
  PROPOSTA: "border-amber-400",
  NEGOCIACAO: "border-orange-400",
  FECHADO: "border-emerald-500",
  PERDIDO: "border-rose-400",
};

export default function PipelinePage() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useLeadsBoard();
  const { podeOperar } = usePermissoes();
  const [leadAberto, setLeadAberto] = useState<string | null>(null);
  // null = fechado; undefined dentro do objeto = cadastro novo
  const [formLead, setFormLead] = useState<{ lead?: Lead } | null>(null);
  const [convertendo, setConvertendo] = useState<Lead | null>(null);

  const totalPipeline = data?.reduce((acc, col) => acc + col.total, 0) ?? 0;
  const totalLeads = data?.reduce((acc, col) => acc + col.count, 0) ?? 0;

  return (
    <>
      <PageHeader
        title="Pipeline Comercial"
        description={
          data
            ? `${totalLeads} oportunidades · ${fmt.brl(totalPipeline)} em valor estimado`
            : "Carregando funil..."
        }
        actions={
          podeOperar && (
            <Button size="sm" onClick={() => setFormLead({})}>
              <Plus className="h-4 w-4" aria-hidden />
              Nova oportunidade
            </Button>
          )
        }
      />

      {error && <ErrorState message={error.message} onRetry={() => refetch()} />}

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {data.map((col) => (
            <div key={col.estagio} className="flex flex-col gap-3">
              <div className={`border-t-2 ${estagioCor[col.estagio]} pt-2`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{estagioLabel[col.estagio]}</p>
                  <Badge variant="outline" className="text-xs">
                    {col.count}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                  {fmt.brl(col.total)}
                </p>
              </div>

              <div className="flex flex-col gap-2 min-h-[60px]">
                {col.itens.map((lead) => (
                  <Card
                    key={lead.id}
                    className="relative transition-shadow hover:shadow-md hover:border-primary/30 focus-within:ring-2 focus-within:ring-ring/50"
                  >
                    <CardContent className="p-3 space-y-2">
                      {/* Botão cobrindo o card: abre a ficha (teclado e leitor de tela) */}
                      <button
                        type="button"
                        onClick={() => setLeadAberto(lead.id)}
                        className="font-medium text-sm leading-tight text-left outline-none after:absolute after:inset-0 after:content-['']"
                      >
                        {lead.nome}
                      </button>
                      {lead.clienteId && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <UserCheck className="h-3 w-3" aria-hidden />
                          Cliente
                        </Badge>
                      )}
                      <p className="text-sm text-positivo font-semibold tabular-nums">
                        {fmt.brl(lead.valorEstimado)}
                      </p>
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{lead.origem}</span>
                        {lead.responsavel && (
                          <span className="truncate max-w-[80px]">
                            {lead.responsavel.nome.split(" ")[0]}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {col.itens.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-md">
                    Sem leads
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <LeadDetalheDialog
        leadId={leadAberto}
        onOpenChange={(v) => !v && setLeadAberto(null)}
        onEditar={(lead) => {
          setLeadAberto(null);
          setFormLead({ lead });
        }}
        onConverter={(lead) => {
          setLeadAberto(null);
          setConvertendo(lead);
        }}
      />

      <LeadFormDialog
        open={!!formLead}
        onOpenChange={(v) => !v && setFormLead(null)}
        lead={formLead?.lead}
      />

      {convertendo && (
        <ConverterLeadDialog
          lead={convertendo}
          open
          onOpenChange={(v) => !v && setConvertendo(null)}
          onConvertido={(cliente) => router.push(`/clientes/${cliente.id}`)}
        />
      )}
    </>
  );
}
