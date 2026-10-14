"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, Info, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useAprovarRecomendacao,
  useRecusarRecomendacao,
} from "@/lib/queries";
import { usePermissoes } from "@/lib/permissoes";
import { ApiError } from "@/lib/api";
import { fmt } from "@/lib/format";
import {
  AVISO_APOIO_DECISAO,
  categoriaLabel,
  perfilColor,
  perfilLabel,
  statusRecomendacaoLabel,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import type {
  DescarteAgregado,
  FatorRecomendacao,
  MotivoDescarte,
  Recomendacao,
  StatusRecomendacao,
} from "@/types/api";

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

const fatorLabel: Record<FatorRecomendacao, string> = {
  profileMatch: "Compatibilidade de perfil",
  diversification: "Diversificação",
  yield: "Rentabilidade líquida",
  liquidity: "Liquidez vs. horizonte",
  cost: "Custo",
};

const motivoLabelCard: Record<MotivoDescarte, string> = {
  perfil_incompativel: "Perfil incompatível",
  concentracao_emissor: "Concentração",
  risco_alem_tolerancia: "Risco além da tolerância",
  ja_sobrealocado: "Já sobrealocado",
};

function formatarMotivoCard(d: DescarteAgregado): string {
  if (d.motivo === "concentracao_emissor" && d.contexto?.emissor) {
    return `${motivoLabelCard.concentracao_emissor} em ${d.contexto.emissor}${
      d.contexto.pctPatrimonio !== undefined ? ` (${d.contexto.pctPatrimonio}%)` : ""
    }`;
  }
  return motivoLabelCard[d.motivo];
}

function mensagemErro(e: unknown, padrao: string) {
  return e instanceof ApiError ? e.message : padrao;
}

type Props = {
  recomendacao: Recomendacao;
  /** Chamado depois de aprovar/recusar com sucesso. Útil pra fechar dialog. */
  onActionDone?: () => void;
};

export function RecomendacaoCard({ recomendacao: r, onActionDone }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [descartadosExpanded, setDescartadosExpanded] = useState(false);
  const [aprovarOpen, setAprovarOpen] = useState(false);
  const [recusarOpen, setRecusarOpen] = useState(false);
  const { podeOperar } = usePermissoes();
  const idFatores = useId();
  const idDescartes = useId();

  const descartados = r.payload?.descartadosDaRodada;
  const totalDescartados = descartados?.reduce((acc, d) => acc + d.count, 0) ?? 0;
  const fonteMl = r.payload?.scoreFonte && !r.payload.scoreFonte.startsWith("rule-engine");

  const scorePct = Math.round(r.score * 100);
  const scoreColor =
    scorePct >= 80
      ? "text-positivo"
      : scorePct >= 60
        ? "text-aviso-foreground"
        : "text-muted-foreground";
  const progressColor =
    scorePct >= 80 ? "bg-emerald-500" : scorePct >= 60 ? "bg-amber-500" : "bg-slate-400";

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                {r.cliente.nome}
                <Badge className={perfilColor[r.cliente.perfil]} variant="secondary">
                  {perfilLabel[r.cliente.perfil]}
                </Badge>
              </CardTitle>
              <CardDescription className="mt-1.5">
                Sugestão:{" "}
                <span className="font-medium text-foreground">{r.produto.nome}</span>{" "}
                <Badge variant="outline" className="text-[10px] ml-1">
                  {categoriaLabel[r.produto.categoria]}
                </Badge>
              </CardDescription>
            </div>
            <Badge variant={statusBadgeVariant[r.status]} className="shrink-0">
              {statusRecomendacaoLabel[r.status]}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="flex-1 space-y-4">
          {/* Score */}
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-semibold">
                Aderência
              </p>
              <p className={cn("text-2xl font-semibold tabular-nums", scoreColor)}>
                {scorePct}
                <span className="text-sm text-muted-foreground">/100</span>
              </p>
            </div>
            <div
              className="h-1.5 bg-muted rounded-full overflow-hidden"
              role="progressbar"
              aria-label="Aderência"
              aria-valuenow={scorePct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className={cn("h-full transition-all", progressColor)} style={{ width: `${scorePct}%` }} />
            </div>
          </div>

          {/* Justificativa */}
          <blockquote className="rounded-md bg-muted/40 p-3 border border-border">
            <p className="text-sm leading-relaxed text-foreground/90">{r.justificativa}</p>
          </blockquote>

          {/* Detalhes (expansível) — só pra recomendações geradas pelo motor */}
          {r.payload?.contribs && r.payload.contribs.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-controls={idFatores}
                className="w-full flex items-center justify-between rounded text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span>Como a sugestão foi calculada ({r.payload.contribs.length} fatores)</span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
                  aria-hidden
                />
              </button>

              {expanded && (
                <div id={idFatores} className="space-y-2 pt-3 border-t">
                  {[...r.payload.contribs]
                    .sort((a, b) => b.contrib - a.contrib)
                    .map((c) => {
                      const fatorPct = Math.round((r.payload.fatores?.[c.fator] ?? 0) * 100);
                      const pesoPct = Math.round((r.payload.pesos?.[c.fator] ?? 0) * 100);
                      return (
                        <div key={c.fator} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium">{fatorLabel[c.fator]}</span>
                            <span className="text-muted-foreground tabular-nums">
                              {fatorPct}% × peso {pesoPct}%
                            </span>
                          </div>
                          <Progress value={fatorPct} className="h-1" aria-label={fatorLabel[c.fator]} />
                          {c.frase && <p className="text-[11px] text-muted-foreground">{c.frase}</p>}
                        </div>
                      );
                    })}
                  {fonteMl && (
                    <p className="text-[11px] text-muted-foreground pt-2 border-t flex gap-1.5">
                      <Info className="h-3 w-3 shrink-0 mt-0.5" aria-hidden />
                      A ordenação usou o modelo estatístico ({r.payload.scoreFonte}). Os fatores acima
                      explicam a recomendação pelas regras
                      {r.payload.scoreRegras != null &&
                        ` (aderência por regras: ${Math.round(r.payload.scoreRegras * 100)}/100)`}
                      .
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground pt-2 border-t">
                    Motor: <code className="font-mono">{r.payload.geradoPor ?? "—"}</code> · Gerada em{" "}
                    {fmt.dateTime(r.geradoEm)}
                    {r.expiraEm && r.status === "PENDENTE" && ` · Válida até ${fmt.date(r.expiraEm)}`}
                  </p>
                </div>
              )}
            </>
          ) : (
            <p className="text-[11px] text-muted-foreground">Gerada em {fmt.dateTime(r.geradoEm)}</p>
          )}

          {descartados && descartados.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setDescartadosExpanded((v) => !v)}
                aria-expanded={descartadosExpanded}
                aria-controls={idDescartes}
                className="w-full flex items-center justify-between rounded text-xs text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span>Por que {totalDescartados} produto(s) foram descartados</span>
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", descartadosExpanded && "rotate-180")}
                  aria-hidden
                />
              </button>

              {descartadosExpanded && (
                <ul id={idDescartes} className="space-y-1.5 pt-3 border-t">
                  {descartados.map((d) => (
                    <li key={d.motivo} className="flex items-center justify-between text-xs">
                      <span className="text-foreground/80">{formatarMotivoCard(d)}</span>
                      <span className="font-medium tabular-nums">{d.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </CardContent>

        {/* Ações / status footer */}
        {r.status === "PENDENTE" && podeOperar && (
          <div className="px-6 pb-5 flex items-center justify-end gap-2 border-t mt-2 pt-4">
            <Button size="sm" variant="ghost" onClick={() => setRecusarOpen(true)}>
              <X className="h-4 w-4" aria-hidden />
              Recusar
            </Button>
            <Button size="sm" onClick={() => setAprovarOpen(true)}>
              <Check className="h-4 w-4" aria-hidden />
              Aprovar
            </Button>
          </div>
        )}

        {r.status === "PENDENTE" && !podeOperar && (
          <div className="px-6 pb-5 border-t mt-2 pt-4 text-xs text-muted-foreground">
            Aguardando decisão do assessor responsável.
          </div>
        )}

        {(r.status === "APROVADA" || r.status === "RECUSADA") && r.aprovadoPor && r.aprovadoEm && (
          <div className="px-6 pb-5 border-t mt-2 pt-4 text-xs text-muted-foreground space-y-1">
            <p>
              {r.status === "APROVADA" ? "Aprovada" : "Recusada"} por{" "}
              <span className="font-medium text-foreground">{r.aprovadoPor.nome}</span> em{" "}
              {fmt.dateTime(r.aprovadoEm)}
            </p>
            {r.status === "RECUSADA" && r.recusaMotivo && (
              <p>
                Motivo: <span className="text-foreground">{r.recusaMotivo}</span>
              </p>
            )}
          </div>
        )}
      </Card>

      <AprovarDialog
        recomendacao={r}
        open={aprovarOpen}
        onOpenChange={setAprovarOpen}
        onDone={() => onActionDone?.()}
      />
      <RecusarDialog
        recomendacao={r}
        open={recusarOpen}
        onOpenChange={setRecusarOpen}
        onDone={() => onActionDone?.()}
      />
    </>
  );
}

// ============================================================
// Dialog: Aprovar (confirmação — ação sensível e auditada)
// ============================================================

function AprovarDialog({
  recomendacao: r,
  open,
  onOpenChange,
  onDone,
}: {
  recomendacao: Recomendacao;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const aprovar = useAprovarRecomendacao();

  async function handleAprovar() {
    try {
      await aprovar.mutateAsync(r.id);
      toast.success(`Recomendação aprovada para ${r.cliente.nome}`);
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível aprovar a recomendação"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Aprovar recomendação?</DialogTitle>
          <DialogDescription>
            <strong>{r.produto.nome}</strong> para <strong>{r.cliente.nome}</strong> (perfil{" "}
            {perfilLabel[r.cliente.perfil].toLowerCase()}).
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-aviso-borda bg-aviso p-3 text-xs text-aviso-foreground flex gap-2">
          <Info className="h-4 w-4 shrink-0" aria-hidden />
          <p>
            {AVISO_APOIO_DECISAO} Sua aprovação fica registrada na trilha de auditoria com data,
            hora e usuário. Nenhuma ordem é enviada automaticamente.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleAprovar} disabled={aprovar.isPending}>
            {aprovar.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Check className="h-4 w-4" aria-hidden />
            )}
            Confirmar aprovação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Dialog: Recusar (pede motivo)
// ============================================================

function RecusarDialog({
  recomendacao,
  open,
  onOpenChange,
  onDone,
}: {
  recomendacao: Recomendacao;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const recusar = useRecusarRecomendacao();

  async function handleRecusar() {
    if (motivo.trim().length < 3) {
      setErro("Descreva o motivo em pelo menos 3 caracteres.");
      return;
    }
    setErro(null);
    try {
      await recusar.mutateAsync({ id: recomendacao.id, motivo: motivo.trim() });
      toast.success("Recomendação recusada");
      onOpenChange(false);
      setMotivo("");
      onDone?.();
    } catch (e) {
      toast.error(mensagemErro(e, "Não foi possível recusar a recomendação"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Recusar recomendação</DialogTitle>
          <DialogDescription>
            Por que essa sugestão não cabe agora? O motivo fica registrado na auditoria e ajuda a
            calibrar o motor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="motivo" className="text-xs">
            Motivo <span aria-hidden className="text-destructive">*</span>
          </Label>
          <Textarea
            id="motivo"
            placeholder="Ex.: cliente já avaliou e não tem interesse, prefere manter posição atual…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            required
            aria-invalid={!!erro}
            aria-describedby={erro ? "motivo-erro" : undefined}
          />
          {erro && (
            <p id="motivo-erro" className="text-xs text-destructive">
              {erro}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleRecusar} disabled={recusar.isPending}>
            {recusar.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Recusar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
