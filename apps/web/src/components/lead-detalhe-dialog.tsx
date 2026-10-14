"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, Loader2, Pencil, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ErroFormulario } from "@/components/forms/campo";
import { SelectOpcoes } from "@/components/forms/select-opcoes";
import { useExcluirLead, useLead, useMoverEstagio } from "@/lib/queries";
import { usePermissoes } from "@/lib/permissoes";
import { estagioLabel } from "@/lib/labels";
import { ApiError } from "@/lib/api";
import { fmt } from "@/lib/format";
import type { EstagioPipeline, Lead, LeadDetalhado } from "@/types/api";

type Props = {
  leadId: string | null;
  onOpenChange: (open: boolean) => void;
  onEditar: (lead: Lead) => void;
  onConverter: (lead: Lead) => void;
};

/** Ficha da oportunidade: dados, histórico do funil e ações (editar, mover, converter, excluir) */
export function LeadDetalheDialog({ leadId, onOpenChange, onEditar, onConverter }: Props) {
  const { data: lead, isLoading, error } = useLead(leadId);

  return (
    <Dialog open={!!leadId} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {isLoading && (
          <div className="space-y-3" aria-label="Carregando">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}
        {error && (
          <>
            <DialogHeader>
              <DialogTitle>Oportunidade</DialogTitle>
            </DialogHeader>
            <ErroFormulario mensagem={error.message} />
          </>
        )}
        {lead && (
          <Ficha
            key={lead.id}
            lead={lead}
            onEditar={() => onEditar(lead)}
            onConverter={() => onConverter(lead)}
            onExcluido={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Ficha({
  lead,
  onEditar,
  onConverter,
  onExcluido,
}: {
  lead: LeadDetalhado;
  onEditar: () => void;
  onConverter: () => void;
  onExcluido: () => void;
}) {
  const { podeOperar } = usePermissoes();
  const mover = useMoverEstagio(lead.id);
  const excluir = useExcluirLead();
  const [estagio, setEstagio] = useState<string>("");
  const [notas, setNotas] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const convertido = !!lead.clienteId;
  const opcoesEstagio = Object.fromEntries(
    (Object.keys(estagioLabel) as EstagioPipeline[])
      .filter((e) => e !== lead.estagio)
      .map((e) => [e, estagioLabel[e]]),
  );

  async function moverEstagio() {
    if (!estagio) return;
    setErro(null);
    try {
      await mover.mutateAsync({ estagio: estagio as EstagioPipeline, notas: notas.trim() || undefined });
      toast.success(`Movida para ${estagioLabel[estagio as EstagioPipeline]}`);
      setEstagio("");
      setNotas("");
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : "Não foi possível mover a oportunidade.");
    }
  }

  async function confirmarExclusao() {
    setErro(null);
    try {
      await excluir.mutateAsync(lead.id);
      toast.success("Oportunidade excluída");
      onExcluido();
    } catch (e) {
      setConfirmandoExclusao(false);
      setErro(e instanceof ApiError ? e.message : "Não foi possível excluir a oportunidade.");
    }
  }

  return (
    <>
      <DialogHeader>
        <div className="flex items-center gap-2 flex-wrap pr-8">
          <DialogTitle>{lead.nome}</DialogTitle>
          <Badge variant="outline">{estagioLabel[lead.estagio]}</Badge>
        </div>
        <DialogDescription>
          {lead.origem} · criada em {fmt.date(lead.createdAt)}
          {lead.responsavel && ` · ${lead.responsavel.nome}`}
        </DialogDescription>
      </DialogHeader>

      <dl className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Valor estimado</dt>
          <dd className="font-medium tabular-nums">{fmt.brl(lead.valorEstimado)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">E-mail</dt>
          <dd className="font-medium break-all">{lead.email ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Telefone</dt>
          <dd className="font-medium">{lead.telefone ?? "—"}</dd>
        </div>
        {lead.fechadoEm && (
          <div>
            <dt className="text-muted-foreground">Encerrada em</dt>
            <dd className="font-medium">{fmt.date(lead.fechadoEm)}</dd>
          </div>
        )}
        {lead.observacoes && (
          <div className="col-span-2">
            <dt className="text-muted-foreground">Observações</dt>
            <dd className="whitespace-pre-line">{lead.observacoes}</dd>
          </div>
        )}
      </dl>

      {convertido && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100">
          <span className="inline-flex items-center gap-1.5">
            <UserCheck className="h-3.5 w-3.5" aria-hidden />
            Convertida em cliente{lead.cliente && `: ${lead.cliente.nome}`}
          </span>
          <Link href={`/clientes/${lead.clienteId}`} className="font-medium underline underline-offset-2">
            Ver ficha
          </Link>
        </div>
      )}

      {podeOperar && !convertido && (
        <div className="space-y-2 border-t pt-3">
          <p className="text-xs font-medium">Mover no funil</p>
          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
            <SelectOpcoes
              id="lead-mover-estagio"
              aria-label="Novo estágio"
              value={estagio}
              onChange={setEstagio}
              opcoes={opcoesEstagio}
              placeholder="Novo estágio"
            />
            <Input
              aria-label="Nota da mudança (opcional)"
              placeholder="Nota (opcional)"
              maxLength={500}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
            />
            <Button size="sm" className="h-8" onClick={moverEstagio} disabled={!estagio || mover.isPending}>
              {mover.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <ArrowRightLeft className="h-4 w-4" aria-hidden />
              )}
              Mover
            </Button>
          </div>
        </div>
      )}

      <ErroFormulario mensagem={erro} />

      {lead.estagioHistorico.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-xs font-medium mb-2">Histórico</p>
          <ol className="space-y-1.5 text-xs">
            {lead.estagioHistorico.map((h) => (
              <li key={h.id} className="flex gap-2">
                <span className="text-muted-foreground tabular-nums shrink-0">{fmt.date(h.criadoEm)}</span>
                <span>
                  <span className="font-medium">{estagioLabel[h.estagio]}</span>
                  {h.notas && <span className="text-muted-foreground"> — {h.notas}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {podeOperar && (
        <div className="-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-between">
          {confirmandoExclusao ? (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar exclusão">
              <span className="text-xs">Excluir esta oportunidade?</span>
              <Button size="sm" variant="destructive" onClick={confirmarExclusao} disabled={excluir.isPending}>
                {excluir.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Excluir
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmandoExclusao(false)} disabled={excluir.isPending}>
                Cancelar
              </Button>
            </div>
          ) : convertido ? (
            // Lead convertido é a origem registrada do cliente: não se exclui
            <span />
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              onClick={() => setConfirmandoExclusao(true)}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Excluir
            </Button>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button size="sm" variant="outline" onClick={onEditar}>
              <Pencil className="h-4 w-4" aria-hidden />
              Editar
            </Button>
            {!convertido && (
              <Button
                size="sm"
                onClick={onConverter}
                disabled={lead.estagio === "PERDIDO"}
                title={lead.estagio === "PERDIDO" ? "Mova a oportunidade de volta ao funil para converter" : undefined}
              >
                <UserCheck className="h-4 w-4" aria-hidden />
                Converter em cliente
              </Button>
            )}
            {convertido && (
              <Link href={`/clientes/${lead.clienteId}`} className={buttonVariants({ size: "sm" })}>
                Abrir cliente
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
