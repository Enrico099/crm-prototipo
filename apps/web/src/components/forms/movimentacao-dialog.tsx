"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Campo, ErroFormulario, ariaCampo } from "./campo";
import { SelectOpcoes } from "./select-opcoes";
import { useProdutos, useRegistrarMovimentacao, type MovimentacaoInput } from "@/lib/queries";
import { aplicarErrosDaApi, parseValorBR } from "@/lib/formularios";
import { perfilLabel, perfilOrdem, tipoMovimentacaoLabel } from "@/lib/labels";
import { ApiError } from "@/lib/api";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ClienteDetalhado, Produto } from "@/types/api";

/** Hoje no fuso de São Paulo, como "2026-10-07" (valor do <input type="date">) */
function hojeSP() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

const schema = z.object({
  tipo: z.enum(["APLICACAO", "RESGATE"]),
  produtoId: z.string().min(1, "Escolha o produto"),
  valor: z.string().refine((v) => {
    const n = parseValorBR(v);
    return n !== null && Number.isFinite(n) && n > 0;
  }, "Informe um valor maior que zero (ex.: 50.000,00)"),
  data: z
    .string()
    .min(1, "Informe a data")
    .refine((d) => d <= hojeSP(), "A data não pode ser futura"),
  observacao: z.string().max(500, "Máximo de 500 caracteres"),
  ciencia: z.boolean(),
});

type Valores = z.infer<typeof schema>;
const CAMPOS = ["tipo", "produtoId", "valor", "data", "observacao"] as const;

export type MovimentacaoInicial = {
  tipo?: "APLICACAO" | "RESGATE";
  produtoId?: string;
  /** Execução de recomendação aprovada (a recomendação passa a ATIVA) */
  recomendacaoId?: string;
};

type Props = {
  cliente: ClienteDetalhado;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inicial?: MovimentacaoInicial;
};

export function MovimentacaoDialog({ cliente, open, onOpenChange, inicial }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Registrar movimentação</DialogTitle>
          <DialogDescription>
            Aplicação ou resgate de {cliente.nome}. A posição é atualizada na hora; valores a custo,
            sem marcação a mercado.
          </DialogDescription>
        </DialogHeader>
        {open && <FormMovimentacao cliente={cliente} inicial={inicial} onFechar={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

/** Mesmos critérios da API (CVM 30): sem suitability, vencida ou produto acima do perfil */
export function motivoDesenquadramento(cliente: ClienteDetalhado, produto: Pick<Produto, "perfilMinimo"> | undefined) {
  if (!produto) return null;
  const s = cliente.suitability;
  if (!s) return "O cliente não tem suitability aplicada.";
  if (s.vencida) return "A suitability do cliente está vencida.";
  if (perfilOrdem[produto.perfilMinimo] > perfilOrdem[s.perfilCalculado]) {
    return `O produto exige perfil ${perfilLabel[produto.perfilMinimo]} e o cliente é ${perfilLabel[s.perfilCalculado]}.`;
  }
  return null;
}

function FormMovimentacao({
  cliente,
  inicial,
  onFechar,
}: {
  cliente: ClienteDetalhado;
  inicial?: MovimentacaoInicial;
  onFechar: () => void;
}) {
  const registrar = useRegistrarMovimentacao(cliente.id);
  const produtos = useProdutos({ ativo: true, limit: 100 });
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  // A API pode exigir ciência mesmo quando a tela não previu (ex.: suitability venceu)
  const [motivoDoServidor, setMotivoDoServidor] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: {
      tipo: inicial?.tipo ?? "APLICACAO",
      produtoId: inicial?.produtoId ?? "",
      valor: "",
      data: hojeSP(),
      observacao: "",
      ciencia: false,
    },
  });
  const [tipo, produtoId, ciencia] = useWatch({ control, name: ["tipo", "produtoId", "ciencia"] });

  const aplicacao = tipo === "APLICACAO";
  const produtoAplicacao = produtos.data?.data.find((p) => p.id === produtoId);
  const posicao = cliente.posicoes.find((p) => p.produto.id === produtoId);
  const motivo = aplicacao ? (motivoDesenquadramento(cliente, produtoAplicacao) ?? motivoDoServidor) : null;

  const opcoes = aplicacao
    ? Object.fromEntries(
        (produtos.data?.data ?? []).map((p) => [p.id, `${p.nome} · perfil mín. ${perfilLabel[p.perfilMinimo]}`]),
      )
    : Object.fromEntries(cliente.posicoes.map((p) => [p.produto.id, `${p.produto.nome} · ${fmt.brl(p.valor)}`]));

  async function onSubmit(v: Valores) {
    setErroGeral(null);
    const valor = parseValorBR(v.valor)!;
    if (!aplicacao && posicao && valor > posicao.valor) {
      setError("valor", { message: `O saldo neste produto é ${fmt.brlPrecise(posicao.valor)}` });
      return;
    }
    if (motivo && !v.ciencia) {
      setError("ciencia", { message: "Registre a ciência do cliente para continuar" });
      return;
    }
    const corpo: MovimentacaoInput = {
      tipo: v.tipo,
      produtoId: v.produtoId,
      valor,
      // Hoje = agora (horário real); data retroativa = meio-dia daquele dia em SP
      ...(v.data !== hojeSP() && { data: `${v.data}T12:00:00-03:00` }),
      ...(v.observacao.trim() && { observacao: v.observacao.trim() }),
      ...(aplicacao && inicial?.recomendacaoId && v.produtoId === inicial.produtoId && { recomendacaoId: inicial.recomendacaoId }),
      ...(motivo && { cienciaDesenquadramento: true }),
    };
    try {
      await registrar.mutateAsync(corpo);
      toast.success(`${tipoMovimentacaoLabel[v.tipo]} de ${fmt.brlPrecise(valor)} registrada`);
      onFechar();
    } catch (e) {
      const codigo = e instanceof ApiError ? (e.payload as { code?: string } | undefined)?.code : undefined;
      if (codigo === "DESENQUADRAMENTO") {
        setMotivoDoServidor(e instanceof ApiError ? e.message : null);
        return;
      }
      setErroGeral(aplicarErrosDaApi(e, setError, CAMPOS));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">
      <fieldset>
        <legend className="text-xs font-medium mb-1.5">Tipo</legend>
        <div className="grid grid-cols-2 gap-2">
          {(["APLICACAO", "RESGATE"] as const).map((t) => (
            <label
              key={t}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                tipo === t ? "border-primary bg-primary/5 font-medium" : "border-input hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                value={t}
                className="sr-only"
                {...register("tipo", {
                  onChange: () => {
                    setValue("produtoId", "");
                    setValue("ciencia", false);
                    setMotivoDoServidor(null);
                  },
                })}
              />
              {tipoMovimentacaoLabel[t]}
            </label>
          ))}
        </div>
      </fieldset>

      <Campo
        id="mov-produto"
        label="Produto"
        erro={errors.produtoId?.message}
        dica={!aplicacao && cliente.posicoes.length === 0 ? "O cliente não tem posições para resgatar." : undefined}
        obrigatorio
      >
        <Controller
          control={control}
          name="produtoId"
          render={({ field }) => (
            <SelectOpcoes
              {...ariaCampo("mov-produto", errors.produtoId?.message)}
              value={field.value}
              onChange={(v) => {
                field.onChange(v);
                setValue("ciencia", false);
                setMotivoDoServidor(null);
              }}
              opcoes={opcoes}
              placeholder={aplicacao && produtos.isLoading ? "Carregando catálogo…" : "Selecione…"}
              disabled={!aplicacao && cliente.posicoes.length === 0}
            />
          )}
        />
      </Campo>

      <div className="grid gap-3 sm:grid-cols-2">
        <Campo
          id="mov-valor"
          label="Valor (R$)"
          erro={errors.valor?.message}
          dica={!aplicacao && posicao ? `Saldo: ${fmt.brlPrecise(posicao.valor)}` : undefined}
          obrigatorio
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            placeholder="50.000,00"
            {...ariaCampo("mov-valor", errors.valor?.message, !aplicacao && posicao ? "saldo" : undefined)}
            {...register("valor")}
          />
        </Campo>
        <Campo id="mov-data" label="Data da operação" erro={errors.data?.message} obrigatorio>
          <Input type="date" max={hojeSP()} {...ariaCampo("mov-data", errors.data?.message)} {...register("data")} />
        </Campo>
      </div>

      <Campo id="mov-obs" label="Observação" erro={errors.observacao?.message}>
        <Textarea rows={2} {...ariaCampo("mov-obs", errors.observacao?.message)} {...register("observacao")} />
      </Campo>

      {motivo && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-aviso-borda bg-aviso p-3 text-xs text-aviso-foreground"
        >
          <p className="flex items-start gap-1.5 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0 text-aviso-foreground" aria-hidden />
            Aplicação desenquadrada (CVM 30)
          </p>
          <p>{motivo}</p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              aria-invalid={!!errors.ciencia || undefined}
              aria-describedby={errors.ciencia ? "mov-ciencia-erro" : undefined}
              {...register("ciencia")}
            />
            <span>
              O cliente foi informado e solicitou a aplicação mesmo assim. A movimentação fica marcada
              como desenquadrada na auditoria.
            </span>
          </label>
          {errors.ciencia && (
            <p id="mov-ciencia-erro" className="text-destructive">
              {errors.ciencia.message}
            </p>
          )}
        </div>
      )}

      {aplicacao && inicial?.recomendacaoId && produtoId === inicial.produtoId && (
        <p className="text-xs text-muted-foreground">
          Esta aplicação executa a recomendação aprovada, que passará a <span className="font-medium">Ativa</span>.
        </p>
      )}

      <ErroFormulario mensagem={erroGeral} />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onFechar} disabled={isSubmitting}>
          Cancelar
        </Button>
        <Button type="submit" disabled={isSubmitting || (!!motivo && !ciencia)}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Registrar {tipoMovimentacaoLabel[tipo].toLowerCase()}
        </Button>
      </DialogFooter>
    </form>
  );
}
